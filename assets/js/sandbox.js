import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { createNoise3D } from 'simplex-noise';

const canvas = document.getElementById('three-canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030303);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 0, 50);

const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bokehPass = new BokehPass(scene, camera, {
    focus: 10.0,
    aperture: 0.0002,
    maxblur: 0.0116
});
composer.addPass(bokehPass);

const simplex3D = createNoise3D();

function fbmSimplex(x, y, z, octaves) {
    let v = 0;
    let a = 0.5;
    let f = 1.0;
    for (let i = 0; i < octaves; i++) {
        v += a * simplex3D(x * f, y * f, z * f);
        a *= 0.5;
        f *= 2.0;
    }
    return v;
}

const vertexShader = `
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying vec3 vViewPos;
    
    uniform float uTime;
    uniform float uOrganicSpeed;
    uniform float uOrganicScale;
    uniform float uOrganicIntensity;
    
    float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    
    float noise3D(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
            mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
            f.z
        );
    }
    
    float snoise(vec3 p) {
        return noise3D(p) * 2.0 - 1.0;
    }
    
    float fbm(vec3 p, float t) {
        float v = 0.0;
        float a = 0.5;
        v += snoise(p + t * 0.1) * a;
        p *= 2.0;
        v += snoise(p + t * 0.15) * a * 0.5;
        p *= 1.8;
        v += snoise(p + t * 0.08) * a * 0.25;
        return v;
    }
    
    void main() {
        vNormal = normalize(normalMatrix * normal);
        
        vec3 p1 = position * uOrganicScale;
        vec3 p2 = position * uOrganicScale * 0.6 + vec3(50.0);
        vec3 p3 = position * uOrganicScale * 1.2 + vec3(100.0);
        
        float wave1 = fbm(p1, uTime * uOrganicSpeed);
        float wave2 = fbm(p2, uTime * uOrganicSpeed * 0.7);
        float wave3 = fbm(p3, uTime * uOrganicSpeed * 1.3);
        
        float organicWave = (wave1 * 0.5 + wave2 * 0.3 + wave3 * 0.2) * uOrganicIntensity;
        organicWave = organicWave * organicWave * organicWave;
        
        vec3 animatedPos = position + (normal * organicWave);
        
        vec4 worldPos = modelMatrix * vec4(animatedPos, 1.0);
        vWorldPos = worldPos.xyz;
        vec4 mvPos = modelViewMatrix * vec4(animatedPos, 1.0);
        vViewPos = -mvPos.xyz;
        gl_Position = projectionMatrix * mvPos;
    }
`;

const fragmentShader = `
    uniform float uTime;
    uniform float uChromePulse;
    uniform float uChromeSpeed;
    uniform float uWaveFreq;
    
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying vec3 vViewPos;
    
    float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    
    float noiseWave(vec3 p, float t) {
        float wave = 0.0;
        wave += sin(dot(p, vec3(1.0, 0.5, 0.3)) * uWaveFreq + t * uChromeSpeed * 1.0) * 0.25;
        wave += sin(dot(p, vec3(-0.7, 1.0, 0.2)) * uWaveFreq + t * uChromeSpeed * 1.3) * 0.25;
        wave += sin(dot(p, vec3(0.3, -0.4, 1.0)) * uWaveFreq + t * uChromeSpeed * 0.8) * 0.25;
        wave += sin(dot(p, vec3(-0.5, -0.8, -0.6)) * uWaveFreq + t * uChromeSpeed * 1.1) * 0.25;
        wave += (hash(p * 2.0 + t) - 0.5) * 0.4;
        return wave;
    }
    
    void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPos);
        
        float fresnel = pow(1.0 - abs(dot(viewDir, normal)), 3.0);
        
        float wave = noiseWave(vWorldPos, uTime) * 0.5 + 0.5;
        float chromeMod = 1.0 + (wave * uChromePulse);
        
        float facingLight = max(dot(normal, normalize(vec3(1.0, 1.0, 0.5))), 0.0);
        float backLight = max(dot(normal, normalize(vec3(-1.0, 0.5, -0.5))), 0.0) * 0.3;
        
        float brightness = (facingLight * 0.15 + backLight * 0.4 + fresnel * 0.3) * chromeMod;
        
        brightness = clamp(brightness, 0.0, 1.0);
        
        vec3 darkBase = vec3(0.015, 0.015, 0.018);
        vec3 brightEdge = vec3(0.92, 0.92, 0.95);
        
        vec3 color = mix(darkBase, brightEdge, brightness);
        
        gl_FragColor = vec4(color, 1.0);
    }
`;

const semMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
        uTime: { value: 0 },
        uChromePulse: { value: 1.5 },
        uChromeSpeed: { value: 2.0 },
        uWaveFreq: { value: 0.5 },
        uOrganicSpeed: { value: 0.08 },
        uOrganicScale: { value: 0.05 },
        uOrganicIntensity: { value: 3.0 }
    },
    side: THREE.DoubleSide
});

let params = {
    macroScale: 1.1,
    spikeScale: 3.0,
    spikeFreq: 5.7,
    distAtten: 0.2,
    distOffset: 1.0,
    autoInterval: 30
};

const resolution = 60;

const numInstances = 3;
const instanceSpacing = 80;
const instanceMaterial = [];
const instances = [];

for (let i = 0; i < numInstances; i++) {
    const mat = semMaterial.clone();
    instanceMaterial.push(mat);
    
    const effect = new MarchingCubes(resolution, mat, false, false, 300000);
    effect.scale.set(45, 45, 45);
    effect.isolation = 0;
    
    const angle = (i / numInstances) * Math.PI * 2;
    const radius = 30;
    effect.position.set(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
    );
    
    instances.push(effect);
    scene.add(effect);
    
    const boxWire = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(45, 45, 45)),
        new THREE.LineBasicMaterial({ color: 0x222222 })
    );
    boxWire.position.copy(effect.position);
    scene.add(boxWire);
}

function syncMaterials() {
    instanceMaterial.forEach(mat => {
        mat.uniforms.uTime.value = semMaterial.uniforms.uTime.value;
        mat.uniforms.uChromePulse.value = semMaterial.uniforms.uChromePulse.value;
        mat.uniforms.uChromeSpeed.value = semMaterial.uniforms.uChromeSpeed.value;
        mat.uniforms.uWaveFreq.value = semMaterial.uniforms.uWaveFreq.value;
        mat.uniforms.uOrganicSpeed.value = semMaterial.uniforms.uOrganicSpeed.value;
        mat.uniforms.uOrganicScale.value = semMaterial.uniforms.uOrganicScale.value;
        mat.uniforms.uOrganicIntensity.value = semMaterial.uniforms.uOrganicIntensity.value;
    });
}

function ferroSpikesJS(x, y, z, freq) {
    const px = Math.abs(Math.sin(x * freq * Math.PI));
    const py = Math.abs(Math.sin(y * freq * Math.PI));
    const pz = Math.abs(Math.sin(z * freq * Math.PI));
    const ridge = px * py + py * pz + px * pz;
    return Math.max(0, 1 - Math.pow(ridge, 2.5));
}

function bakeStructure() {
    instances.forEach((effect, idx) => {
        effect.reset();
        
        const spikeFreq = params.spikeFreq * 3;
        const spikeScale = params.spikeScale * 0.08;
        const noiseOffset = idx * 17.3;
        
        let index = 0;
        for (let k = 0; k < resolution; k++) {
            for (let j = 0; j < resolution; j++) {
                for (let i = 0; i < resolution; i++) {
                    
                    const nx = (i / resolution) * 2 - 1;
                    const ny = (j / resolution) * 2 - 1;
                    const nz = (k / resolution) * 2 - 1;

                    const macroFbm = fbmSimplex(
                        nx * params.macroScale + noiseOffset,
                        ny * params.macroScale + noiseOffset * 0.7,
                        nz * params.macroScale + noiseOffset * 0.5,
                        2
                    );
                    let baseDensity = -(macroFbm - 0.55);
                    
                    const distToCenter = Math.sqrt(nx*nx + ny*ny + nz*nz);
                    let finalDensity = baseDensity + (distToCenter * params.distAtten) - params.distOffset;
                    
                    const spike = ferroSpikesJS(
                        nx * 10 + noiseOffset,
                        ny * 10 + noiseOffset,
                        nz * 10 + noiseOffset,
                        spikeFreq
                    );
                    finalDensity += spike * spikeScale;
                    
                    finalDensity = Math.max(-1, Math.min(1, finalDensity));

                    effect.field[index] = finalDensity;
                    index++;
                }
            }
        }
        effect.update();
    });
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = true;
controls.enablePan = false;
controls.minDistance = 20;
controls.maxDistance = 150;

const panel = document.createElement('div');
panel.style.cssText = 'position:fixed;top:10px;left:10px;color:#888;font-family:monospace;font-size:11px;background:rgba(0,0,0,0.9);padding:12px;border:1px solid #444;z-index:1000;min-width:200px;';
document.body.appendChild(panel);

let sliderLabels = {};
let sliderElements = {};
let autoModeActive = false;
let autoTimer = 0;
let clock = new THREE.Clock();

let currentSpikeScale = params.spikeScale;
let currentSpikeFreq = params.spikeFreq;
let currentMacroScale = params.macroScale;
let currentOrganicScale = semMaterial.uniforms.uOrganicScale.value;
let currentOrganicIntensity = semMaterial.uniforms.uOrganicIntensity.value;

let targetSpikeScale = params.spikeScale;
let targetSpikeFreq = params.spikeFreq;
let targetMacroScale = params.macroScale;
let targetOrganicScale = semMaterial.uniforms.uOrganicScale.value;
let targetOrganicIntensity = semMaterial.uniforms.uOrganicIntensity.value;

function createSlider(name, min, max, step, value, callback, decimals = 2) {
    const div = document.createElement('div');
    div.style.marginBottom = '8px';
    
    const label = document.createElement('div');
    label.textContent = `${name}: ${typeof value === 'number' ? value.toFixed(decimals) : value}`;
    label.style.marginBottom = '3px';
    
    sliderLabels[name] = label;
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = value;
    slider.style.width = '180px';
    
    sliderElements[name] = slider;
    
    slider.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        label.textContent = `${name}: ${val.toFixed(decimals)}`;
        callback(val);
    });
    
    div.appendChild(label);
    div.appendChild(slider);
    panel.appendChild(div);
    
    return { label, slider };
}

createSlider('spikeScale', 0.0, 5.0, 0.1, params.spikeScale, (val) => {
    params.spikeScale = val;
    currentSpikeScale = val;
    targetSpikeScale = val;
    bakeStructure();
});

createSlider('spikeFreq', 1.0, 10.0, 0.1, params.spikeFreq, (val) => {
    params.spikeFreq = val;
    currentSpikeFreq = val;
    targetSpikeFreq = val;
    bakeStructure();
});

createSlider('macroScale', 0.5, 3.0, 0.1, params.macroScale, (val) => {
    params.macroScale = val;
    currentMacroScale = val;
    targetMacroScale = val;
    bakeStructure();
});

createSlider('chromePulse', 0.0, 5.0, 0.1, semMaterial.uniforms.uChromePulse.value, (val) => {
    semMaterial.uniforms.uChromePulse.value = val;
});

createSlider('organicSpeed', 0.01, 0.5, 0.01, semMaterial.uniforms.uOrganicSpeed.value, (val) => {
    semMaterial.uniforms.uOrganicSpeed.value = val;
});

createSlider('organicScale', 0.02, 0.15, 0.01, semMaterial.uniforms.uOrganicScale.value, (val) => {
    semMaterial.uniforms.uOrganicScale.value = val;
    currentOrganicScale = val;
    targetOrganicScale = val;
});

createSlider('organicIntensity', 0.0, 6.0, 0.1, semMaterial.uniforms.uOrganicIntensity.value, (val) => {
    semMaterial.uniforms.uOrganicIntensity.value = val;
    currentOrganicIntensity = val;
    targetOrganicIntensity = val;
});

createSlider('bokehFocus', 10, 150, 1, 10, (val) => {
    bokehPass.uniforms.focus.value = val;
});

{
    const div = document.createElement('div');
    div.style.marginBottom = '8px';
    const label = document.createElement('div');
    label.textContent = 'bokehAperture: 0.00020';
    label.style.marginBottom = '3px';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = 1;
    slider.max = 100;
    slider.step = 1;
    slider.value = 20;
    slider.style.width = '180px';
    slider.addEventListener('input', () => {
        const val = parseFloat(slider.value) / 100000;
        label.textContent = `bokehAperture: ${val.toFixed(5)}`;
        bokehPass.uniforms.aperture.value = val;
    });
    div.appendChild(label);
    div.appendChild(slider);
    panel.appendChild(div);
}

{
    const div = document.createElement('div');
    div.style.marginBottom = '8px';
    const label = document.createElement('div');
    label.textContent = 'bokehBlur: 0.0116';
    label.style.marginBottom = '3px';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = 10;
    slider.max = 150;
    slider.step = 1;
    slider.value = 116;
    slider.style.width = '180px';
    slider.addEventListener('input', () => {
        const val = parseFloat(slider.value) / 10000;
        label.textContent = `bokehBlur: ${val.toFixed(4)}`;
        bokehPass.uniforms.maxblur.value = val;
    });
    div.appendChild(label);
    div.appendChild(slider);
    panel.appendChild(div);
}

const instructions = document.createElement('div');
instructions.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);color:#888;font-family:monospace;font-size:14px;text-align:center;background:rgba(0,0,0,0.8);padding:15px;border:2px solid #444;pointer-events:none;z-index:1000;';
instructions.innerHTML = 'DRAG TO ORBIT | SCROLL TO ZOOM';
document.body.appendChild(instructions);

const autoBtn = document.createElement('button');
autoBtn.textContent = 'AUTO MODE: OFF';
autoBtn.style.cssText = 'position:fixed;top:10px;right:10px;color:#888;font-family:monospace;font-size:11px;background:rgba(0,0,0,0.9);padding:8px 12px;border:1px solid #444;cursor:pointer;z-index:1000;';
autoBtn.addEventListener('click', () => {
    autoModeActive = !autoModeActive;
    autoBtn.textContent = autoModeActive ? 'AUTO MODE: ON' : 'AUTO MODE: OFF';
    autoBtn.style.borderColor = autoModeActive ? '#888' : '#444';
    if (autoModeActive) {
        autoTimer = clock.getElapsedTime();
        applyRandomParams();
    }
});
document.body.appendChild(autoBtn);

function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
}

function applyRandomParams() {
    targetSpikeScale = randomInRange(1.0, 5.0);
    targetSpikeFreq = randomInRange(3.0, 8.0);
    targetMacroScale = randomInRange(0.8, 2.0);
    targetOrganicScale = randomInRange(0.03, 0.12);
    targetOrganicIntensity = randomInRange(1.0, 5.0);
}

function lerp(current, target, speed) {
    const diff = target - current;
    if (Math.abs(diff) < 0.001) return target;
    return current + diff * speed;
}

function updateSliderLabel(name, value) {
    if (sliderLabels[name]) {
        sliderLabels[name].textContent = `${name}: ${value.toFixed(2)}`;
    }
}

function updateSliderValue(name, value) {
    if (sliderElements[name]) {
        sliderElements[name].value = value;
    }
}

bakeStructure();

function animate() {
    requestAnimationFrame(animate);
    
    const time = clock.getElapsedTime();
    semMaterial.uniforms.uTime.value = time;
    syncMaterials();
    
    if (autoModeActive) {
        const pulseVal = 1.5 + Math.abs(Math.sin(time * 0.05)) * 2.5;
        semMaterial.uniforms.uChromePulse.value = pulseVal;
        updateSliderLabel('chromePulse', pulseVal);
        updateSliderValue('chromePulse', pulseVal);
        
        const speedVal = 0.3 - Math.abs(Math.sin(time * 0.03)) * 0.25;
        semMaterial.uniforms.uOrganicSpeed.value = Math.max(0.05, speedVal);
        updateSliderLabel('organicSpeed', Math.max(0.05, speedVal));
        updateSliderValue('organicSpeed', Math.max(0.05, speedVal));
        
        currentSpikeScale = lerp(currentSpikeScale, targetSpikeScale, 0.02);
        currentSpikeFreq = lerp(currentSpikeFreq, targetSpikeFreq, 0.02);
        currentMacroScale = lerp(currentMacroScale, targetMacroScale, 0.02);
        currentOrganicScale = lerp(currentOrganicScale, targetOrganicScale, 0.02);
        currentOrganicIntensity = lerp(currentOrganicIntensity, targetOrganicIntensity, 0.02);
        
        params.spikeScale = currentSpikeScale;
        params.spikeFreq = currentSpikeFreq;
        params.macroScale = currentMacroScale;
        semMaterial.uniforms.uOrganicScale.value = currentOrganicScale;
        semMaterial.uniforms.uOrganicIntensity.value = currentOrganicIntensity;
        
        updateSliderLabel('spikeScale', currentSpikeScale);
        updateSliderValue('spikeScale', currentSpikeScale);
        updateSliderLabel('spikeFreq', currentSpikeFreq);
        updateSliderValue('spikeFreq', currentSpikeFreq);
        updateSliderLabel('macroScale', currentMacroScale);
        updateSliderValue('macroScale', currentMacroScale);
        updateSliderLabel('organicScale', currentOrganicScale);
        updateSliderValue('organicScale', currentOrganicScale);
        updateSliderLabel('organicIntensity', currentOrganicIntensity);
        updateSliderValue('organicIntensity', currentOrganicIntensity);
        
        if (time - autoTimer > params.autoInterval) {
            applyRandomParams();
            autoTimer = time;
        }
    }
    
    controls.update();
    composer.render();
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

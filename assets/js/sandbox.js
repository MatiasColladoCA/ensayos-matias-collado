import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { createNoise3D } from 'simplex-noise';

const canvas = document.getElementById('three-canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030303);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 0, 50);

const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

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

const params = {
    macroScale: 1.1,
    spikeScale: 3.0,
    spikeFreq: 5.7,
    distAtten: 0.2,
    distOffset: 1.0,
    autoMode: false,
    autoInterval: 30
};

const resolution = 100;

const effect = new MarchingCubes(resolution, semMaterial, false, false, 600000);
effect.position.set(0, 0, 0);
effect.scale.set(50, 50, 50);
effect.isolation = 0;
scene.add(effect);

const boxWire = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(50, 50, 50)),
    new THREE.LineBasicMaterial({ color: 0x333333 })
);
scene.add(boxWire);

function ferroSpikesJS(x, y, z, freq) {
    const px = Math.abs(Math.sin(x * freq * Math.PI));
    const py = Math.abs(Math.sin(y * freq * Math.PI));
    const pz = Math.abs(Math.sin(z * freq * Math.PI));
    const ridge = px * py + py * pz + px * pz;
    return Math.max(0, 1 - Math.pow(ridge, 2.5));
}

function bakeStructure() {
    effect.reset();
    
    const spikeFreq = params.spikeFreq * 3;
    const spikeScale = params.spikeScale * 0.08;
    
    let index = 0;
    for (let k = 0; k < resolution; k++) {
        for (let j = 0; j < resolution; j++) {
            for (let i = 0; i < resolution; i++) {
                
                const nx = (i / resolution) * 2 - 1;
                const ny = (j / resolution) * 2 - 1;
                const nz = (k / resolution) * 2 - 1;

                const macroFbm = fbmSimplex(nx * params.macroScale, ny * params.macroScale, nz * params.macroScale, 2);
                let baseDensity = -(macroFbm - 0.55);
                
                const distToCenter = Math.sqrt(nx*nx + ny*ny + nz*nz);
                let finalDensity = baseDensity + (distToCenter * params.distAtten) - params.distOffset;
                
                const spike = ferroSpikesJS(nx * 10, ny * 10, nz * 10, spikeFreq);
                finalDensity += spike * spikeScale;
                
                finalDensity = Math.max(-1, Math.min(1, finalDensity));

                effect.field[index] = finalDensity;
                index++;
            }
        }
    }
    effect.update();
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

function createSlider(name, min, max, step, value, callback) {
    const div = document.createElement('div');
    div.style.marginBottom = '8px';
    
    const label = document.createElement('div');
    label.textContent = `${name}: ${typeof value === 'number' ? value.toFixed(2) : value}`;
    label.style.marginBottom = '3px';
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = value;
    slider.style.width = '180px';
    
    slider.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        label.textContent = `${name}: ${val.toFixed(2)}`;
        callback(val);
    });
    
    div.appendChild(label);
    div.appendChild(slider);
    panel.appendChild(div);
}

createSlider('spikeScale', 0.0, 5.0, 0.1, params.spikeScale, (val) => {
    params.spikeScale = val;
    bakeStructure();
});

createSlider('spikeFreq', 1.0, 10.0, 0.1, params.spikeFreq, (val) => {
    params.spikeFreq = val;
    bakeStructure();
});

createSlider('macroScale', 0.5, 3.0, 0.1, params.macroScale, (val) => {
    params.macroScale = val;
    bakeStructure();
});

createSlider('chromePulse', 0.0, 3.0, 0.1, 1.5, (val) => {
    semMaterial.uniforms.uChromePulse.value = val;
});

createSlider('chromeSpeed', 0.5, 10.0, 0.1, 2.0, (val) => {
    semMaterial.uniforms.uChromeSpeed.value = val;
});

createSlider('waveFreq', 0.5, 5.0, 0.1, 2.0, (val) => {
    semMaterial.uniforms.uWaveFreq.value = val;
});

createSlider('organicSpeed', 0.01, 0.5, 0.01, 0.08, (val) => {
    semMaterial.uniforms.uOrganicSpeed.value = val;
});

createSlider('organicScale', 0.02, 0.15, 0.01, 0.05, (val) => {
    semMaterial.uniforms.uOrganicScale.value = val;
});

createSlider('organicIntensity', 0.0, 6.0, 0.1, 3.0, (val) => {
    semMaterial.uniforms.uOrganicIntensity.value = val;
});

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

bakeStructure();

const clock = new THREE.Clock();
let autoModeActive = false;
let autoTimer = 0;

function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
}

function applyRandomParams() {
    params.spikeScale = randomInRange(1.0, 5.0);
    params.spikeFreq = randomInRange(3.0, 8.0);
    params.macroScale = randomInRange(0.8, 2.0);
    semMaterial.uniforms.uOrganicScale.value = randomInRange(0.03, 0.12);
    semMaterial.uniforms.uOrganicIntensity.value = randomInRange(1.0, 5.0);
    
    bakeStructure();
}

function animate() {
    requestAnimationFrame(animate);
    
    const time = clock.getElapsedTime();
    semMaterial.uniforms.uTime.value = time;
    
    if (autoModeActive) {
        const pulseVal = 1.5 + Math.abs(Math.sin(time * 0.05)) * 2.5;
        semMaterial.uniforms.uChromePulse.value = pulseVal;
        
        const speedVal = 0.3 - Math.abs(Math.sin(time * 0.03)) * 0.25;
        semMaterial.uniforms.uOrganicSpeed.value = Math.max(0.05, speedVal);
        
        if (time - autoTimer > params.autoInterval) {
            applyRandomParams();
            autoTimer = time;
        }
    }
    
    controls.update();
    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

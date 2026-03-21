import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { createNoise3D } from 'simplex-noise';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

const canvas = document.getElementById('three-canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030303);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 120);

const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

let orbitControls = new OrbitControls(camera, canvas);
orbitControls.enabled = false;
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.05;
orbitControls.enableZoom = true;
orbitControls.enableRotate = true;
orbitControls.enablePan = false;
orbitControls.minDistance = 50;
orbitControls.maxDistance = 200;
orbitControls.target.set(0, 0, 0);

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bokehPass = new BokehPass(scene, camera, {
    focus: 10.0,
    aperture: 0.0002,
    maxblur: 0.0116
});
composer.addPass(bokehPass);

const glitchShader = {
    uniforms: {
        tDiffuse: { value: null },
        uIntensity: { value: 0.0 },
        uTime: { value: 0.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uIntensity;
        uniform float uTime;
        varying vec2 vUv;
        
        float random(vec2 st) {
            return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
        }
        
        void main() {
            vec2 uv = vUv;
            
            if(uIntensity > 0.01) {
                float shift = uIntensity * 0.02;
                
                float blockSize = 0.02 + uIntensity * 0.05;
                float block = floor(uv.y / blockSize);
                float noise = random(vec2(block, floor(uTime * 10.0)));
                
                if(noise > 0.7) {
                    uv.x += (noise - 0.7) * shift * 3.0;
                }
                
                float rgbShift = uIntensity * 0.008;
                vec4 cr = texture2D(tDiffuse, uv + vec2(rgbShift, 0.0));
                vec4 cg = texture2D(tDiffuse, uv);
                vec4 cb = texture2D(tDiffuse, uv - vec2(rgbShift, 0.0));
                
                float scanline = sin(vUv.y * 400.0) * 0.02 * uIntensity;
                
                gl_FragColor = vec4(cr.r, cg.g, cb.b, 1.0) - scanline;
            } else {
                gl_FragColor = texture2D(tDiffuse, uv);
            }
        }
    `
};

const glitchPass = new ShaderPass(glitchShader);
composer.addPass(glitchPass);

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
    
    float fbmNoise(vec3 p, float t) {
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
        
        float wave1 = fbmNoise(p1, uTime * uOrganicSpeed);
        float wave2 = fbmNoise(p2, uTime * uOrganicSpeed * 0.7);
        float wave3 = fbmNoise(p3, uTime * uOrganicSpeed * 1.3);
        
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
}

let multiInstanceMode = true;
const instanceVisibility = [true, true, true];

function setInstanceMode(multi) {
    multiInstanceMode = multi;
    if (multi) {
        instances.forEach((inst, i) => {
            inst.visible = instanceVisibility[i];
        });
    } else {
        instances.forEach((inst, i) => {
            inst.visible = i === 0;
        });
    }
}

const toggleInstancesBtn = document.createElement('button');
toggleInstancesBtn.textContent = '◆◆◆ INSTANCES';
toggleInstancesBtn.id = 'toggle-instances-btn';
toggleInstancesBtn.style.cssText = 'position:fixed;top:130px;right:10px;color:#ff00ff;font-family:monospace;font-size:10px;background:rgba(5,10,15,0.9);padding:6px 10px;border:1px solid #ff00ff;cursor:pointer;z-index:1001;';
toggleInstancesBtn.addEventListener('click', () => {
    multiInstanceMode = !multiInstanceMode;
    setInstanceMode(multiInstanceMode);
    toggleInstancesBtn.textContent = multiInstanceMode ? '◆◆◆ INSTANCES' : '◆ INSTANCES';
    toggleInstancesBtn.style.color = multiInstanceMode ? '#ff00ff' : '#888';
    toggleInstancesBtn.style.borderColor = multiInstanceMode ? '#ff00ff' : '#444';
});
document.body.appendChild(toggleInstancesBtn);

window.addEventListener('keydown', (e) => {
    if (e.key === '1') {
        instanceVisibility[0] = !instanceVisibility[0];
        instances[0].visible = instanceVisibility[0];
    } else if (e.key === '2') {
        instanceVisibility[1] = !instanceVisibility[1];
        instances[1].visible = instanceVisibility[1];
    } else if (e.key === '3') {
        instanceVisibility[2] = !instanceVisibility[2];
        instances[2].visible = instanceVisibility[2];
    }
});

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

let isCalculating = false;
const workerReady = { value: false };

function bakeStructureWithWorker(callback) {
    if (isCalculating) return;
    isCalculating = true;
    
    const worker = new Worker('/js/marching-cubes-worker.js');
    
    worker.onmessage = function(e) {
        if (e.data.type === 'progress') {
            const statusEl = document.getElementById('loading-status');
            const barEl = document.getElementById('loading-bar');
            if (statusEl) statusEl.textContent = e.data.message;
            if (barEl) barEl.style.width = (e.data.progress * 100) + '%';
        } else if (e.data.type === 'complete') {
            const fields = e.data.fields;
            
            instances.forEach((effect, idx) => {
                effect.reset();
                const field = fields[idx];
                for (let i = 0; i < field.length; i++) {
                    effect.field[i] = field[i];
                }
                effect.update();
            });
            
            worker.terminate();
            isCalculating = false;
            
            if (callback) callback();
        }
    };
    
    worker.onerror = function(err) {
        console.error('[WORKER ERROR]', err);
        worker.terminate();
        isCalculating = false;
        bakeStructure();
        if (callback) callback();
    };
    
    worker.postMessage({
        resolution: resolution,
        numInstances: numInstances,
        params: params
    });
}

let sliderLabels = {};
let sliderElements = {};
let autoModeActive = false;
let autoTimer = 0;
let clock = new THREE.Clock();
clock.stop();

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

const panel = document.createElement('div');
panel.id = 'control-panel';
panel.style.cssText = 'position:fixed;top:10px;left:10px;color:#e0e0e0;font-family:"JetBrains Mono","Fira Code",monospace;font-size:11px;background:rgba(5,10,15,0.85);padding:12px;border:1px solid #00ffcc40;z-index:1000;min-width:200px;display:none;';
document.body.appendChild(panel);

let sliderLabels2 = {};

function createSlider(name, min, max, step, value, callback, decimals = 2) {
    const div = document.createElement('div');
    div.style.marginBottom = '8px';
    
    const label = document.createElement('div');
    label.textContent = `${name}: ${typeof value === 'number' ? value.toFixed(decimals) : value}`;
    label.style.marginBottom = '3px';
    label.style.color = '#00ffcc';
    
    sliderLabels2[name] = label;
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = value;
    slider.style.width = '180px';
    slider.style.accentColor = '#00ffcc';
    
    slider.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        label.textContent = `${name}: ${val.toFixed(decimals)}`;
        callback(val);
    });
    
    div.appendChild(label);
    div.appendChild(slider);
    panel.appendChild(div);
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

const instructions = document.createElement('div');
instructions.id = 'instructions';
instructions.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);color:#888;font-family:monospace;font-size:14px;text-align:center;background:rgba(0,0,0,0.8);padding:15px;border:2px solid #444;pointer-events:none;z-index:1000;';
instructions.innerHTML = 'DRAG TO ORBIT | SCROLL TO NAVIGATE';
document.body.appendChild(instructions);

const toggleBtn = document.createElement('button');
toggleBtn.textContent = '[] CONTROLS';
toggleBtn.id = 'toggle-btn';
toggleBtn.style.cssText = 'position:fixed;top:10px;right:10px;color:#00ffcc;font-family:monospace;font-size:11px;background:rgba(5,10,15,0.9);padding:8px 12px;border:1px solid #00ffcc;cursor:pointer;z-index:1001;';
toggleBtn.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
});
document.body.appendChild(toggleBtn);

const waypoints = [
    { position: new THREE.Vector3(0, 0, 120), target: new THREE.Vector3(0, 0, 0), section: 0 },
    { position: new THREE.Vector3(80, 30, 80), target: new THREE.Vector3(0, 0, 0), section: 1 },
    { position: new THREE.Vector3(100, -20, -40), target: new THREE.Vector3(0, 0, 0), section: 2 },
    { position: new THREE.Vector3(-60, 50, -60), target: new THREE.Vector3(0, 0, 0), section: 3 },
    { position: new THREE.Vector3(-100, -30, 40), target: new THREE.Vector3(0, 0, 0), section: 4 },
    { position: new THREE.Vector3(50, 80, -80), target: new THREE.Vector3(0, 0, 0), section: 5 },
    { position: new THREE.Vector3(-80, -60, -60), target: new THREE.Vector3(0, 0, 0), section: 6 },
    { position: new THREE.Vector3(30, -80, 60), target: new THREE.Vector3(0, 0, 0), section: 7 },
    { position: new THREE.Vector3(-40, 100, 30), target: new THREE.Vector3(0, 0, 0), section: 8 },
    { position: new THREE.Vector3(0, 0, 120), target: new THREE.Vector3(0, 0, 0), section: 9 }
];

const sections = [
    {
        title: 'SOBRE ESTE PROYECTO',
        subtitle: 'PRESENTACIÓN',
        content: 'Espacio de reflexión y aprendizaje donde comparto investigaciones, intuiciones y pensamientos sobre ciencia, filosofía, psicología y tecnología.',
        link: '/about/presentacion/',
        telemetry: ['RUNTIME', 'POSTS_COUNT', 'UPDATES']
    },
    {
        title: 'REGISTRO DE CAMBIOS',
        subtitle: 'CHANGELOG',
        content: 'Historial cronológico de modificaciones, correcciones y mejoras realizadas en los artículos. Transparencia en la evolución del pensamiento.',
        link: '/changelog/',
        telemetry: ['REVISIONS', 'EDIT_COUNT', 'VERSIONS']
    },
    {
        title: 'ENSAYOS',
        subtitle: 'INVESTIGACIONES',
        content: 'Reflexiones profundas y exhaustivas sobre temas que invitan a comprender el mundo y la mente humana. Conocimiento como recurso valioso.',
        link: '/ensayos/',
        telemetry: ['ESSAYS', 'READ_TIME', 'COMPLEXITY']
    },
    {
        title: 'OTRAS IDEAS',
        subtitle: 'PENSAMIENTOS SIMPLES',
        content: 'Ideas más digeribles y directas. Críticas, recomendaciones y guías sobre diversos temas sin la profundidad de un ensayo completo.',
        link: '/otras-ideas/',
        telemetry: ['IDEAS', 'CATEGORIES', 'BREVITY']
    },
    {
        title: 'RECURSOS',
        subtitle: 'BIBLIOTECA',
        content: 'Colección de apuntes, aforismos y materiales de referencia sobre filosofía de la ciencia y otras áreas del conocimiento.',
        link: '/recursos/',
        telemetry: ['BOOKS', 'NOTES', 'REFERENCES']
    },
    {
        title: 'SOBRE ESTE PROYECTO',
        subtitle: 'PRESENTACIÓN',
        content: 'Espacio de reflexión y aprendizaje donde comparto investigaciones, intuiciones y pensamientos sobre ciencia, filosofía, psicología y tecnología.',
        link: '/about/presentacion/',
        telemetry: ['RUNTIME', 'POSTS_COUNT', 'UPDATES']
    },
    {
        title: 'REGISTRO DE CAMBIOS',
        subtitle: 'CHANGELOG',
        content: 'Historial cronológico de modificaciones, correcciones y mejoras realizadas en los artículos.',
        link: '/changelog/',
        telemetry: ['REVISIONS', 'EDIT_COUNT', 'VERSIONS']
    },
    {
        title: 'ENSAYOS',
        subtitle: 'INVESTIGACIONES',
        content: 'Reflexiones profundas y exhaustivas sobre temas que invitan a comprender el mundo y la mente humana.',
        link: '/ensayos/',
        telemetry: ['ESSAYS', 'READ_TIME', 'COMPLEXITY']
    },
    {
        title: 'OTRAS IDEAS',
        subtitle: 'PENSAMIENTOS SIMPLES',
        content: 'Ideas más digeribles y directas. Críticas, recomendaciones y guías sobre diversos temas.',
        link: '/otras-ideas/',
        telemetry: ['IDEAS', 'CATEGORIES', 'BREVITY']
    },
    {
        title: 'RECURSOS',
        subtitle: 'BIBLIOTECA',
        content: 'Colección de apuntes, aforismos y materiales de referencia sobre filosofía de la ciencia.',
        link: '/recursos/',
        telemetry: ['BOOKS', 'NOTES', 'REFERENCES']
    }
];

const techSections = [
    {
        title: 'FERROFLUID DYNAMICS',
        subtitle: 'SECT-01 // VOLUMETRIC ANALYSIS',
        description: 'Spiked ferrofluid structures exhibiting self-organizing behavior under magnetic field influence. Surface tension patterns correlate with electromagnetic frequency modulation.',
        telemetry: ['FLUX_DENSITY', 'VISCOSITY_INDEX', 'COHESION_COEFF']
    },
    {
        title: 'HORMIGUERO ARCHITECTURE',
        subtitle: 'SECT-02 // BIOMIMETIC STRUCTURE',
        description: 'Trabecular bone density simulation. Organic cavern networks formed through procedural noise functions with FBM modulation at 2-octave resolution.',
        telemetry: ['POROSITY_LEVEL', 'CAVERN_CONNECTIVITY', 'DENSITY_MAP']
    },
    {
        title: 'CHROMIUM INTERFERENCE',
        subtitle: 'SECT-03 // SURFACE OPTICS',
        description: 'Chrome wave propagation analysis. Multi-directional sine interference patterns creating unpredictable illumination cascades across ferrofluid surface.',
        telemetry: ['REFRACTION_INDEX', 'WAVE_FREQ', 'CHROME_MOD']
    },
    {
        title: 'ORGANIC DISPLACEMENT',
        subtitle: 'SECT-04 // VERTEX DEFORMATION',
        description: 'Lava-lamp viscosity simulation. FBM-driven vertex displacement creating organic breathing motion in the volumetric structure.',
        telemetry: ['DISPLACEMENT_AMP', 'WAVE_VELOCITY', 'ORGANIC_SCALE']
    },
    {
        title: 'DEPTH OF FIELD',
        subtitle: 'SECT-05 // MICROSCOPE SIMULATION',
        description: 'Bokeh rendering with dynamic focus plane. Aperture and blur parameters calibrated for electron microscope aesthetic.',
        telemetry: ['FOCUS_DISTANCE', 'APERTURE_SIZE', 'BLUR_INTENSITY']
    },
    {
        title: 'TESSELLATION PATTERNS',
        subtitle: 'SECT-06 // GEOMETRIC RESONANCE',
        description: 'Recursive subdivision algorithms generating fractal surface patterns. Each vertex oscillates with phase-offset timing creating emergent wave structures.',
        telemetry: ['TESS_LEVEL', 'FRACTAL_DEPTH', 'NODE_COUNT']
    },
    {
        title: 'ACOUSTIC RESONANCE',
        subtitle: 'SECT-07 // FREQUENCY MAPPING',
        description: 'Audio-reactive deformation synchronized to harmonic frequencies. Standing wave patterns emerge from interference between opposing sine generators.',
        telemetry: ['BASE_FREQ', 'HARMONIC_RATIO', 'AMPLITUDE_PEAK']
    },
    {
        title: 'THERMAL DIFFUSION',
        subtitle: 'SECT-08 // HEAT TRANSFER',
        description: 'Heat propagation simulation through volumetric medium. Thermal conductivity gradients create organic morphing transitions between stable states.',
        telemetry: ['TEMP_DELTA', 'CONDUCTIVITY', 'ENTROPY_RATE']
    },
    {
        title: 'FLUID DYNAMICS',
        subtitle: 'SECT-09 // NAVIER-STOKES',
        description: 'Viscous flow visualization using simplified Navier-Stokes equations. Turbulence patterns emerge from boundary condition interactions.',
        telemetry: ['VISCOSITY', 'REYNOLDS_NUM', 'VORTICITY']
    },
    {
        title: 'QUANTUM FLUCTUATION',
        subtitle: 'SECT-10 // PROBABILITY DENSITY',
        description: 'Stochastic particle distribution modeling quantum uncertainty principles. Wave function collapse visualized through probability density gradients.',
        telemetry: ['UNCERTAINTY', 'PROB_DENSITY', 'COLLAPSE_RATE']
    }
];

const glitchLayer = document.createElement('div');
glitchLayer.id = 'glitch-layer';
glitchLayer.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:499;overflow:hidden;';
document.body.appendChild(glitchLayer);

const glitchChars = '█▓▒░╔╗╚╝║═╬┼┤├┬┴▼▲◄►▀▄■□▪▫●○◆◇◎⌐¬│┆┇┊╋';
const neonColors = ['#ff00ff', '#00ffff', '#ff0088', '#00ff88', '#ffff00', '#ff6600', '#ff36ff', '#00ffcc'];

let activeGlitchBlocks = [];
let glitchCooldown = 0;

function generateGlitchBlock(width, height) {
    let block = '';
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            block += glitchChars[Math.floor(Math.random() * glitchChars.length)];
        }
        block += '\n';
    }
    return block;
}

function createGlitchBlock() {
    const glitch = document.createElement('div');
    glitch.style.cssText = `
        position:absolute;
        font-family:'JetBrains Mono',monospace;
        font-size:10px;
        line-height:1.1;
        white-space:pre;
        padding:8px;
        background:rgba(0,0,0,0.7);
        border:1px solid currentColor;
        opacity:0;
        pointer-events:none;
    `;
    
    const blockWidth = 30 + Math.floor(Math.random() * 40);
    const blockHeight = 8 + Math.floor(Math.random() * 12);
    
    const colors = [
        neonColors[Math.floor(Math.random() * neonColors.length)],
        neonColors[Math.floor(Math.random() * neonColors.length)]
    ];
    
    glitch.innerHTML = generateGlitchBlock(blockWidth, blockHeight);
    glitch.style.color = colors[0];
    glitch.style.textShadow = `0 0 8px ${colors[0]}, 0 0 20px ${colors[1]}, 0 0 40px ${colors[0]}50`;
    glitch.style.boxShadow = `0 0 10px ${colors[0]}40, inset 0 0 20px ${colors[0]}20`;
    glitch.style.left = Math.random() * 70 + 5 + '%';
    glitch.style.top = Math.random() * 70 + 10 + '%';
    
    glitchLayer.appendChild(glitch);
    activeGlitchBlocks.push(glitch);
    
    let flickerCount = 0;
    const maxFlickers = 3 + Math.floor(Math.random() * 4);
    
    function flicker() {
        if (flickerCount >= maxFlickers) {
            glitch.style.transition = 'opacity 0.05s';
            glitch.style.opacity = '0';
            setTimeout(() => {
                if (glitch.parentNode) glitch.parentNode.removeChild(glitch);
                activeGlitchBlocks = activeGlitchBlocks.filter(g => g !== glitch);
            }, 50);
            return;
        }
        
        glitch.style.transition = 'none';
        glitch.style.opacity = Math.random() > 0.5 ? '0.9' : '0.3';
        
        if (Math.random() > 0.7) {
            glitch.style.color = neonColors[Math.floor(Math.random() * neonColors.length)];
        }
        
        if (Math.random() > 0.8) {
            glitch.style.transform = `translateX(${-2 + Math.random() * 4}px)`;
        }
        
        flickerCount++;
        setTimeout(flicker, 50 + Math.random() * 100);
    }
    
    requestAnimationFrame(() => {
        glitch.style.opacity = '0';
        setTimeout(flicker, 100 + Math.random() * 200);
    });
}

function triggerGlitchEvent() {
    if (activeGlitchBlocks.length >= 2) return;
    
    const blockCount = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < blockCount; i++) {
        setTimeout(() => createGlitchBlock(), i * 150);
    }
}

const glitchStyle = document.createElement('style');
glitchStyle.textContent = `
    #glitch-layer {
        mix-blend-mode: screen;
    }
`;
document.head.appendChild(glitchStyle);

const loadingOverlay = document.createElement('div');
loadingOverlay.id = 'loading-overlay';
loadingOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(3,3,3,0.95);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;transition:opacity 0.8s ease;font-family:"JetBrains Mono",monospace;';
loadingOverlay.innerHTML = `
    <div style="color:#00ffcc;font-size:14px;letter-spacing:4px;margin-bottom:20px;">[CALCULATING TOPOLOGY]</div>
    <div id="loading-status" style="color:#5a8a5a;font-size:12px;">INITIALIZING WORKER...</div>
    <div style="width:200px;height:2px;background:#1a1a1a;margin-top:16px;position:relative;">
        <div id="loading-bar" style="position:absolute;top:0;left:0;height:100%;width:0%;background:linear-gradient(90deg,#00ffcc,#ff00ff);transition:width 0.3s ease;"></div>
    </div>
`;
document.body.appendChild(loadingOverlay);

const hudUI = document.createElement('div');
hudUI.id = 'hud-container';
hudUI.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:500;font-family:"JetBrains Mono","Fira Code",monospace;opacity:0;transition:opacity 0.5s ease;';
document.body.appendChild(hudUI);

const cornerMarkers = document.createElement('div');
cornerMarkers.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:501;';
cornerMarkers.innerHTML = `
    <div style="position:absolute;top:16px;left:16px;color:#00ffcc;font-family:'JetBrains Mono',monospace;font-size:11px;">
        <span style="color:#00ffcc;">┌─</span><span style="color:#333;">────────────────────</span><span style="color:#00ffcc;">─┐</span>
    </div>
    <div style="position:absolute;top:16px;right:16px;color:#00ffcc;font-family:'JetBrains Mono',monospace;font-size:11px;">
        <span style="color:#00ffcc;">┌─</span><span style="color:#333;">────────────────────</span><span style="color:#00ffcc;">─┐</span>
    </div>
    <div style="position:absolute;bottom:16px;left:16px;color:#00ffcc;font-family:'JetBrains Mono',monospace;font-size:11px;">
        <span style="color:#00ffcc;">└─</span><span style="color:#333;">────────────────────</span><span style="color:#00ffcc;">─┘</span>
    </div>
    <div style="position:absolute;bottom:16px;right:16px;color:#00ffcc;font-family:'JetBrains Mono',monospace;font-size:11px;">
        <span style="color:#00ffcc;">└─</span><span style="color:#333;">────────────────────</span><span style="color:#00ffcc;">─┘</span>
    </div>
    <div style="position:absolute;top:50%;left:8px;transform:translateY(-50%);color:#00ffcc;font-size:20px;font-family:'JetBrains Mono',monospace;">│</div>
    <div style="position:absolute;top:50%;right:8px;transform:translateY(-50%);color:#00ffcc;font-size:20px;font-family:'JetBrains Mono',monospace;">│</div>
    <div style="position:absolute;left:50%;top:8px;transform:translateX(-50%);color:#00ffcc;font-size:20px;font-family:'JetBrains Mono',monospace;">─</div>
    <div style="position:absolute;left:50%;bottom:8px;transform:translateX(-50%);color:#00ffcc;font-size:20px;font-family:'JetBrains Mono',monospace;">─</div>
`;
document.body.appendChild(cornerMarkers);

const telemetryTerminal = document.createElement('div');
telemetryTerminal.id = 'telemetry-terminal';
telemetryTerminal.style.cssText = 'position:fixed;bottom:50px;right:20px;width:320px;height:180px;background:rgba(0,8,0,0.85);border:1px solid #00ffcc40;font-family:"JetBrains Mono",monospace;font-size:10px;color:#5a8a5a;z-index:503;pointer-events:none;overflow:hidden;';
telemetryTerminal.innerHTML = `
    <div style="padding:8px 12px;border-bottom:1px solid #00ffcc30;color:#00ffcc;">[TELEMETRY_STREAM]</div>
    <div id="telem-output" style="padding:8px 12px;line-height:1.5;height:calc(100% - 30px);overflow:hidden;"></div>
`;
document.body.appendChild(telemetryTerminal);

const telemMessages = [
    'SCANNING VOLUMETRIC MATRIX...',
    'FLUX CALIBRATION: ████████░░ 80%',
    'DENSITY_THRESHOLD: 0.847',
    'VERTEX_COUNT: 2,847',
    'RENDER_LATENCY: 16.7ms',
    'GPU_LOAD: 67%',
    'MARCHING_CUBES_ACTIVE',
    'NORMAL_INTERP: LERP',
    'RESOLUTION: 64x64x64',
    'FRAME_BUFFER: SYNCHRONIZED',
    'COORDINATE_SYSTEM: CARTESIAN',
    'VIEW_MATRIX_UPDATED',
    'SPikeFreq: ' + (Math.random() * 10).toFixed(3),
    'ORGANIC_MOD: ' + (Math.random() * 5).toFixed(3),
    'CHROME_PHASE: ' + (Math.random() * 360).toFixed(1) + '°',
    'APERTURE: 0.0002',
    'FOCUS_DIST: 10.0',
    'BOKEH_ACTIVE',
    'POSTPROCESS: ENABLED',
    'GLITCH_SHADER: STANDBY'
];

const telemOutput = document.getElementById('telem-output');
let telemLines = [];
let telemTimer = 0;

function updateTelemetryTerminal(deltaTime) {
    telemTimer += deltaTime;
    if (telemTimer > 0.8) {
        telemTimer = 0;
        const msg = telemMessages[Math.floor(Math.random() * telemMessages.length)];
        if (msg.includes('SCANNING') || msg.includes('FLUX') || msg.includes('DENSITY')) {
            const dynamicValue = (Math.random() * 999.999).toFixed(3);
            const dynamicMsg = msg.replace('0.847', dynamicValue).replace('2,847', Math.floor(Math.random() * 9999).toString()).replace('67%', Math.floor(Math.random() * 100) + '%');
            telemLines.push({ text: dynamicMsg, time: Date.now() });
        } else if (msg.includes('SCAN')) {
            const coords = `${Math.floor(Math.random() * 999).toString().padStart(3, '0')}:${Math.floor(Math.random() * 999).toString().padStart(3, '0')}:${Math.floor(Math.random() * 999).toString().padStart(3, '0')}`;
            telemLines.push({ text: `SCAN_COMPLETE @ [${coords}]`, time: Date.now() });
        } else if (msg.includes('SpikeFreq')) {
            telemLines.push({ text: `SpikeFreq: ${(Math.random() * 10).toFixed(3)}`, time: Date.now() });
        } else if (msg.includes('ORGANIC')) {
            telemLines.push({ text: `ORGANIC_MOD: ${(Math.random() * 5).toFixed(3)}`, time: Date.now() });
        } else if (msg.includes('CHROME')) {
            telemLines.push({ text: `CHROME_PHASE: ${(Math.random() * 360).toFixed(1)}°`, time: Date.now() });
        } else {
            telemLines.push({ text: msg, time: Date.now() });
        }
        if (telemLines.length > 8) {
            telemLines.shift();
        }
        telemOutput.innerHTML = telemLines.map(l => `<div>${l.text}</div>`).join('');
    }
}

const progressBar = document.createElement('div');
progressBar.id = 'progress-indicator';
progressBar.style.cssText = 'position:fixed;top:50px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:502;';
document.body.appendChild(progressBar);

sections.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.style.cssText = 'width:8px;height:8px;border:1px solid #00ffcc;opacity:0.3;';
    dot.id = `progress-dot-${i}`;
    progressBar.appendChild(dot);
});

const sectionElements = [];

let currentSection = 0;
let glitchIntensity = 0;
let lastScrollY = 0;
let scrollVelocity = 0;
let typewriterTimer = 0;
const TYPEWRITER_SPEED = 0.03;

const hudTelemetry = document.createElement('div');
hudTelemetry.id = 'hud-telemetry';
hudTelemetry.style.cssText = 'position:fixed;bottom:20px;left:80px;z-index:504;pointer-events:none;max-width:400px;';
hudTelemetry.innerHTML = `
    <div id="telem-title" style="color:#888;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1px;margin-bottom:6px;opacity:0.6;"></div>
    <div id="telem-description" style="color:#5a6a5a;font-family:'JetBrains Mono',monospace;font-size:9px;line-height:1.5;margin-bottom:10px;max-width:350px;"></div>
    <div id="telem-bars" style="display:flex;flex-direction:column;gap:4px;"></div>
`;
document.body.appendChild(hudTelemetry);

function activateSection(idx) {
    console.log('[ACTIVATE] section:', idx, '-', sections[idx]?.title);
    
    const section = sections[idx];
    const tech = techSections[idx];
    
    const telemTitle = document.getElementById('telem-title');
    const telemDesc = document.getElementById('telem-description');
    const telemBars = document.getElementById('telem-bars');
    
    if (telemTitle) telemTitle.textContent = tech ? `[${tech.subtitle}]` : `[${section?.subtitle || ''}]`;
    if (telemDesc && tech) telemDesc.textContent = tech.description;
    if (telemBars && tech) {
        telemBars.innerHTML = '';
        tech.telemetry.forEach((label, j) => {
            const barContainer = document.createElement('div');
            barContainer.style.cssText = 'display:flex;align-items:center;gap:8px;font-family:"JetBrains Mono",monospace;font-size:9px;';
            barContainer.innerHTML = `
                <span style="color:#00ffcc;width:90px;">${label}</span>
                <div style="flex:1;height:2px;background:#00ffcc20;position:relative;">
                    <div class="telem-fill-${idx}-${j}" style="position:absolute;top:0;left:0;height:100%;width:0%;background:#00ffcc;transition:width 1s ease;"></div>
                </div>
                <span class="telem-value-${idx}-${j}" style="color:#888;min-width:50px;text-align:right;">0.000</span>
            `;
            telemBars.appendChild(barContainer);
        });
    }
    
    Object.keys(typewriterState).forEach(key => {
        typewriterState[key].active = false;
        typewriterState[key].currentChar = 0;
        const textEl = document.getElementById(`typewriter-text-${key}`);
        if (textEl) textEl.textContent = '';
        
        sections[key].telemetry.forEach((_, j) => {
            const fill = document.querySelector(`.sec-telem-fill-${key}-${j}`);
            const val = document.querySelector(`.sec-telem-val-${key}-${j}`);
            if (fill) fill.style.width = '0%';
            if (val) val.textContent = '0.000';
        });
    });
    
    typewriterState[idx].active = true;
    
    sections.forEach((_, i) => {
        const sectionDiv = document.getElementById(`section-${i}`);
        if (sectionDiv) {
            sectionDiv.style.opacity = i === idx ? '1' : '0';
            sectionDiv.style.transform = i === idx ? 'translateY(0)' : 'translateY(20px)';
        }
    });
    
    document.querySelectorAll('[id^="progress-dot-"]').forEach((el, i) => {
        el.style.opacity = i === idx ? '1' : '0.3';
        el.style.background = i === idx ? '#00ffcc' : 'transparent';
    });
    
    currentSection = idx;
}

function updateTypewriter(deltaTime) {
    if (!typewriterState[currentSection] || !typewriterState[currentSection].active) return;
    
    const state = typewriterState[currentSection];
    const textEl = document.getElementById(state.elementId);
    if (!textEl) return;
    
    typewriterTimer += deltaTime;
    
    if (typewriterTimer >= TYPEWRITER_SPEED) {
        typewriterTimer = 0;
        
        if (state.currentChar < state.text.length) {
            textEl.textContent = state.text.substring(0, state.currentChar + 1);
            state.currentChar++;
        }
    }
}

function updateTelemetry(sectionIdx, progress) {
    const tech = techSections[sectionIdx];
    if (!tech) return;
    
    tech.telemetry.forEach((_, telemIdx) => {
        const fill = document.querySelector(`.telem-fill-${sectionIdx}-${telemIdx}`);
        const value = document.querySelector(`.telem-value-${sectionIdx}-${telemIdx}`);
        if (fill && value) {
            const val = Math.sin(Date.now() * 0.001 + sectionIdx * 2 + telemIdx) * 0.5 + 0.5;
            fill.style.width = `${val * 100}%`;
            value.textContent = (val * 999.999).toFixed(3);
        }
    });
}

function updateSectionTelemetry(sectionIdx) {
    const section = sections[sectionIdx];
    if (!section || !section.telemetry) return;
    
    section.telemetry.forEach((_, telemIdx) => {
        const fill = document.querySelector(`.sec-telem-fill-${sectionIdx}-${telemIdx}`);
        const value = document.querySelector(`.sec-telem-val-${sectionIdx}-${telemIdx}`);
        if (fill && value) {
            const val = Math.sin(Date.now() * 0.0015 + sectionIdx * 3 + telemIdx * 1.5) * 0.5 + 0.5;
            fill.style.width = `${val * 100}%`;
            value.textContent = (val * 999.999).toFixed(3);
        }
    });
}

const sectionsWrapper = document.createElement('div');
sectionsWrapper.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:502;pointer-events:none;overflow:hidden;';
document.body.appendChild(sectionsWrapper);

const typewriterState = {};

function createTypewriterLine(text, className = '') {
    const line = document.createElement('div');
    line.style.cssText = 'color:#7a8a7a;font-family:"JetBrains Mono",monospace;font-size:14px;line-height:1.7;white-space:pre;height:1.7em;';
    if (className) line.className = className;
    return line;
}

const cursorStyle = document.createElement('style');
cursorStyle.textContent = `
    @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
    }
    .cursor-blink {
        display:inline-block;
        width:8px;
        height:16px;
        background:#00ffcc;
        animation:blink 1s step-end infinite;
        vertical-align:text-bottom;
        margin-left:2px;
    }
`;
document.head.appendChild(cursorStyle);

sections.forEach((section, i) => {
    const sectionDiv = document.createElement('div');
    sectionDiv.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:40px;opacity:0;transition:opacity 0.5s ease;pointer-events:none;`;
    sectionDiv.id = `section-${i}`;
    
    const contentWrapper = document.createElement('div');
    contentWrapper.style.cssText = 'text-align:center;max-width:600px;';
    
    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'color:#fff;font-size:32px;font-weight:bold;letter-spacing:6px;margin-bottom:8px;text-shadow:0 0 30px #00ffcc50;';
    titleEl.textContent = section.title;
    
    const subtitleEl = document.createElement('div');
    subtitleEl.style.cssText = 'color:#00ffcc;font-size:11px;letter-spacing:3px;margin-bottom:32px;opacity:0.7;';
    subtitleEl.textContent = section.subtitle;
    
    const typewriterContainer = document.createElement('div');
    typewriterContainer.id = `typewriter-${i}`;
    typewriterContainer.style.cssText = 'text-align:left;margin-bottom:24px;';
    
    const contentLines = section.content.split('. ');
    typewriterContainer.innerHTML = '<span id="typewriter-text-' + i + '" style="color:#5a7a5a;font-family:\'JetBrains Mono\',monospace;font-size:13px;line-height:1.8;"></span><span class="cursor-blink"></span>';
    
    contentWrapper.appendChild(titleEl);
    contentWrapper.appendChild(subtitleEl);
    contentWrapper.appendChild(typewriterContainer);
    
    const linkEl = document.createElement('a');
    linkEl.href = section.link;
    linkEl.style.cssText = 'color:#00ffcc;text-decoration:none;font-family:"JetBrains Mono",monospace;font-size:12px;letter-spacing:2px;padding:10px 20px;border:1px solid #00ffcc40;transition:all 0.3s ease;pointer-events:auto;display:inline-block;margin-bottom:20px;';
    linkEl.innerHTML = '> ACCEDER <span style="opacity:0.5;">→</span>';
    linkEl.addEventListener('mouseenter', () => {
        linkEl.style.background = '#00ffcc20';
        linkEl.style.borderColor = '#00ffcc';
        linkEl.style.textShadow = '0 0 10px #00ffcc';
    });
    linkEl.addEventListener('mouseleave', () => {
        linkEl.style.background = 'transparent';
        linkEl.style.borderColor = '#00ffcc40';
        linkEl.style.textShadow = 'none';
    });
    contentWrapper.appendChild(linkEl);
    
    const sectionTelemetry = document.createElement('div');
    sectionTelemetry.style.cssText = 'display:flex;flex-direction:column;gap:6px;align-items:center;margin-top:8px;';
    sectionTelemetry.id = `section-telem-${i}`;
    
    if (section.telemetry) {
        section.telemetry.forEach((label, j) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:8px;font-family:"JetBrains Mono",monospace;font-size:9px;';
            row.innerHTML = `
                <span style="color:#cccc00;width:70px;text-align:right;">${label}</span>
                <div style="width:100px;height:2px;background:#cccc0020;position:relative;">
                    <div class="sec-telem-fill-${i}-${j}" style="position:absolute;top:0;left:0;height:100%;width:0%;background:#cccc00;transition:width 1s ease;"></div>
                </div>
                <span class="sec-telem-val-${i}-${j}" style="color:#888;width:40px;text-align:left;">0.000</span>
            `;
            sectionTelemetry.appendChild(row);
        });
    }
    contentWrapper.appendChild(sectionTelemetry);
    
    sectionDiv.appendChild(contentWrapper);
    sectionsWrapper.appendChild(sectionDiv);
    
    typewriterState[i] = { 
        text: section.content, 
        currentChar: 0, 
        active: false,
        elementId: `typewriter-text-${i}`
    };
});

let scrollProgress = 0;
const scrollSensitivity = 0.0003;
let targetCameraPos = new THREE.Vector3(0, 0, 120);
let autoMutate = true;
let mutationTimer = 0;

const sectionParams = [
    { spikeScale: 2.5, spikeFreq: 5.0, organicScale: 0.08, organicIntensity: 3.0 },
    { spikeScale: 4.0, spikeFreq: 3.0, organicScale: 0.12, organicIntensity: 5.0 },
    { spikeScale: 1.5, spikeFreq: 7.0, organicScale: 0.05, organicIntensity: 2.0 },
    { spikeScale: 3.5, spikeFreq: 4.0, organicScale: 0.10, organicIntensity: 4.0 },
    { spikeScale: 2.0, spikeFreq: 6.0, organicScale: 0.06, organicIntensity: 2.5 },
    { spikeScale: 3.0, spikeFreq: 8.0, organicScale: 0.09, organicIntensity: 3.5 },
    { spikeScale: 1.8, spikeFreq: 4.5, organicScale: 0.11, organicIntensity: 4.2 },
    { spikeScale: 4.2, spikeFreq: 5.5, organicScale: 0.07, organicIntensity: 2.8 },
    { spikeScale: 2.8, spikeFreq: 7.5, organicScale: 0.13, organicIntensity: 5.5 },
    { spikeScale: 2.2, spikeFreq: 4.0, organicScale: 0.08, organicIntensity: 3.2 }
];

let wheelCount = 0;

function handleScrollInput(deltaY) {
    scrollProgress += deltaY * scrollSensitivity;
    scrollProgress = Math.max(0, Math.min(1, scrollProgress));
    
    const totalSegments = waypoints.length - 1;
    const segment = Math.min(Math.floor(scrollProgress * totalSegments), totalSegments - 1);
    const localT = (scrollProgress * totalSegments) - segment;
    
    const eased = easeInOutCubic(localT);
    
    const pos = cubicBezier(
        waypoints[segment].position,
        waypoints[segment + 1].position,
        ctrlPoints[segment],
        eased
    );
    
    targetCameraPos.set(pos.x, pos.y, pos.z);
    
    const sectionIndex = Math.min(Math.floor(scrollProgress * sections.length), sections.length - 1);
    
    console.log(`[SCROLL] progress: ${scrollProgress.toFixed(3)} | section: ${sectionIndex}/${sections.length-1} | target: (${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}, ${pos.z.toFixed(0)})`);
    
    if (sectionIndex !== currentSection) {
        console.log('[CHANGE] Activating section', sectionIndex, '-', sections[sectionIndex]?.title);
        activateSection(sectionIndex);
    }
    
    glitchIntensity = Math.min(Math.abs(deltaY) * 0.005, 1.0);
    updateTelemetry(sectionIndex, scrollProgress);
}

window.addEventListener('wheel', (e) => {
    if (orbitControls.enabled) return;
    e.preventDefault();
    e.stopPropagation();
    handleScrollInput(e.deltaY);
}, { passive: false });

document.addEventListener('scroll', (e) => {
    if (orbitControls.enabled) return;
    e.preventDefault();
    e.stopPropagation();
    window.scrollTo(0, 0);
}, { passive: false });

sectionsWrapper.addEventListener('touchmove', (e) => {
    e.preventDefault();
}, { passive: false });

window.addEventListener('touchmove', (e) => {
    if (orbitControls.enabled) return;
    if (e.touches.length > 0) {
        e.preventDefault();
        handleScrollInput(e.touches[0].clientY * 0.5);
    }
}, { passive: false });

function cubicBezier(p0, p1, ctrl, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    
    return {
        x: mt3 * p0.x + 3 * mt2 * t * ctrl.x + 3 * mt * t2 * ctrl.x + t3 * p1.x,
        y: mt3 * p0.y + 3 * mt2 * t * ctrl.y + 3 * mt * t2 * ctrl.y + t3 * p1.y,
        z: mt3 * p0.z + 3 * mt2 * t * ctrl.z + 3 * mt * t2 * ctrl.z + t3 * p1.z
    };
}

const ctrlPoints = [];
for (let i = 0; i < waypoints.length - 1; i++) {
    const p0 = waypoints[i].position;
    const p1 = waypoints[i + 1].position;
    ctrlPoints.push(new THREE.Vector3(
        (p0.x + p1.x) / 2 + 20,
        (p0.y + p1.y) / 2 - 15,
        (p0.z + p1.z) / 2 + 10
    ));
}

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

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

bakeStructureWithWorker(() => {
    const loadingEl = document.getElementById('loading-overlay');
    if (loadingEl) {
        loadingEl.style.opacity = '0';
        setTimeout(() => loadingEl.remove(), 800);
    }
    hudUI.style.opacity = '1';
});

clock.start();

console.log('[INIT] Total sections:', sections.length);
console.log('[INIT] Total waypoints:', waypoints.length);
sections.forEach((s, i) => console.log(`[INIT] Section ${i}: ${s.title}`));

activateSection(0);

let autoModeActiveScrolly = false;
const scrollyAutoBtn = document.createElement('button');
scrollyAutoBtn.textContent = '> AUTO NAV';
scrollyAutoBtn.style.cssText = 'position:fixed;top:50px;right:10px;color:#cccc00;font-family:monospace;font-size:10px;background:rgba(5,10,15,0.9);padding:6px 10px;border:1px solid #cccc00;cursor:pointer;z-index:1001;';
scrollyAutoBtn.addEventListener('click', () => {
    autoModeActiveScrolly = !autoModeActiveScrolly;
    scrollyAutoBtn.textContent = autoModeActiveScrolly ? '> NAVIGATING' : '> AUTO NAV';
    if (autoModeActiveScrolly) {
        autoNavigate();
    }
});
document.body.appendChild(scrollyAutoBtn);

let navTimeline = null;

function autoNavigate() {
    if (!autoModeActiveScrolly) return;
    
    const totalHeight = hudUI.scrollHeight - window.innerHeight;
    const duration = 8;
    
    gsap.to(window, {
        scrollTo: totalHeight,
        duration: duration,
        ease: 'power1.inOut',
        onComplete: () => {
            setTimeout(() => {
                gsap.to(window, {
                    scrollTo: 0,
                    duration: duration,
                    ease: 'power1.inOut',
                    onComplete: autoNavigate
                });
            }, 3000);
        }
    });
}

function animate() {
    requestAnimationFrame(animate);
    
    const time = clock.getElapsedTime();
    semMaterial.uniforms.uTime.value = time;
    glitchPass.uniforms.uTime.value = time;
    glitchPass.uniforms.uIntensity.value = glitchIntensity;
    
    camera.position.lerp(targetCameraPos, 0.03);
    camera.lookAt(0, 0, 0);
    
    if (autoMutate) {
        mutationTimer += 0.016;
        
        const sp = currentSection;
        const baseParams = sectionParams[sp];
        
        const wave1 = Math.sin(mutationTimer * 0.7) * 0.3 + 0.7;
        const wave2 = Math.sin(mutationTimer * 1.3) * 0.2 + 0.8;
        const wave3 = Math.sin(mutationTimer * 0.5) * 0.4 + 0.6;
        
        params.spikeScale = baseParams.spikeScale * wave1;
        params.spikeFreq = baseParams.spikeFreq * wave2;
        semMaterial.uniforms.uOrganicScale.value = baseParams.organicScale * wave3;
        semMaterial.uniforms.uOrganicIntensity.value = baseParams.organicIntensity * wave1;
    }
    
    syncMaterials();
    
    updateTypewriter(0.016);
    updateTelemetryTerminal(0.016);
    updateSectionTelemetry(currentSection);
    
    glitchCooldown -= 0.016;
    if (glitchCooldown <= 0) {
        if (Math.random() < 0.25) {
            triggerGlitchEvent();
        }
        glitchCooldown = 5 + Math.random() * 5;
    }
    
    if (glitchIntensity > 0.01) {
        glitchIntensity *= 0.95;
    }
    
    if (orbitControls.enabled) {
        orbitControls.update();
    }
    
    composer.render();
}

const orbitControlsBtn = document.createElement('button');
orbitControlsBtn.textContent = '○ ORBIT';
orbitControlsBtn.style.cssText = 'position:fixed;top:90px;right:10px;color:#888;font-family:monospace;font-size:10px;background:rgba(5,10,15,0.9);padding:6px 10px;border:1px solid #444;cursor:pointer;z-index:1001;';
orbitControlsBtn.addEventListener('click', () => {
    orbitControls.enabled = !orbitControls.enabled;
    if (orbitControls.enabled) {
        orbitControlsBtn.textContent = '● ORBIT';
        orbitControlsBtn.style.borderColor = '#00ffcc';
        orbitControlsBtn.style.color = '#00ffcc';
    } else {
        orbitControlsBtn.textContent = '○ ORBIT';
        orbitControlsBtn.style.borderColor = '#444';
        orbitControlsBtn.style.color = '#888';
    }
});
document.body.appendChild(orbitControlsBtn);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

animate();

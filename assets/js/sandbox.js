import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
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
        title: 'FERROFLUID DYNAMICS',
        subtitle: 'SECT-01 // VOLUMETRIC ANALYSIS',
        content: 'Spiked ferrofluid structures exhibiting self-organizing behavior under magnetic field influence. Surface tension patterns correlate with electromagnetic frequency modulation.',
        telemetry: ['FLUX_DENSITY', 'VISCOSITY_INDEX', 'COHESION_COEFF']
    },
    {
        title: 'HORMIGUERO ARCHITECTURE',
        subtitle: 'SECT-02 // BIOMIMETIC STRUCTURE',
        content: 'Trabecular bone density simulation. Organic cavern networks formed through procedural noise functions with FBM modulation at 2-octave resolution.',
        telemetry: ['POROSITY_LEVEL', 'CAVERN_CONNECTIVITY', 'DENSITY_MAP']
    },
    {
        title: 'CHROMIUM INTERFERENCE',
        subtitle: 'SECT-03 // SURFACE OPTICS',
        content: 'Chrome wave propagation analysis. Multi-directional sine interference patterns creating unpredictable illumination cascades across ferrofluid surface.',
        telemetry: ['REFRACTION_INDEX', 'WAVE_FREQ', 'CHROME_MOD']
    },
    {
        title: 'ORGANIC DISPLACEMENT',
        subtitle: 'SECT-04 // VERTEX DEFORMATION',
        content: 'Lava-lamp viscosity simulation. FBM-driven vertex displacement creating organic breathing motion in the volumetric structure.',
        telemetry: ['DISPLACEMENT_AMP', 'WAVE_VELOCITY', 'ORGANIC_SCALE']
    },
    {
        title: 'DEPTH OF FIELD',
        subtitle: 'SECT-05 // MICROSCOPE SIMULATION',
        content: 'Bokeh rendering with dynamic focus plane. Aperture and blur parameters calibrated for electron microscope aesthetic.',
        telemetry: ['FOCUS_DISTANCE', 'APERTURE_SIZE', 'BLUR_INTENSITY']
    },
    {
        title: 'TESSELLATION PATTERNS',
        subtitle: 'SECT-06 // GEOMETRIC RESONANCE',
        content: 'Recursive subdivision algorithms generating fractal surface patterns. Each vertex oscillates with phase-offset timing creating emergent wave structures.',
        telemetry: ['TESS_LEVEL', 'FRACTAL_DEPTH', 'NODE_COUNT']
    },
    {
        title: 'ACOUSTIC RESONANCE',
        subtitle: 'SECT-07 // FREQUENCY MAPPING',
        content: 'Audio-reactive deformation synchronized to harmonic frequencies. Standing wave patterns emerge from interference between opposing sine generators.',
        telemetry: ['BASE_FREQ', 'HARMONIC_RATIO', 'AMPLITUDE_PEAK']
    },
    {
        title: 'THERMAL DIFFUSION',
        subtitle: 'SECT-08 // HEAT TRANSFER',
        content: 'Heat propagation simulation through volumetric medium. Thermal conductivity gradients create organic morphing transitions between stable states.',
        telemetry: ['TEMP_DELTA', 'CONDUCTIVITY', 'ENTROPY_RATE']
    },
    {
        title: 'FLUID DYNAMICS',
        subtitle: 'SECT-09 // NAVIER-STOKES',
        content: 'Viscous flow visualization using simplified Navier-Stokes equations. Turbulence patterns emerge from boundary condition interactions.',
        telemetry: ['VISCOSITY', 'REYNOLDS_NUM', 'VORTICITY']
    },
    {
        title: 'QUANTUM FLUCTUATION',
        subtitle: 'SECT-10 // PROBABILITY DENSITY',
        content: 'Stochastic particle distribution modeling quantum uncertainty principles. Wave function collapse visualized through probability density gradients.',
        telemetry: ['UNCERTAINTY', 'PROB_DENSITY', 'COLLAPSE_RATE']
    }
];

const glitchLayer = document.createElement('div');
glitchLayer.id = 'glitch-layer';
glitchLayer.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:499;overflow:hidden;';
document.body.appendChild(glitchLayer);

const asciiFigures = [
    `<span style="color:#ff00ff;">O</span><span style="color:#00ffff;">-|</span><span style="color:#ff00ff;">-&lt;</span>`,
    `<span style="color:#00ffff;">█▀▀</span><span style="color:#ff00ff;">▀▀█</span>`,
    `<span style="color:#ffff00;">░░░</span><span style="color:#ff6600;">█░░</span><span style="color:#00ff00;">░░█</span>`,
    `<span style="color:#ff0088;">╔╗</span><span style="color:#00ffff;">╔╗</span><span style="color:#ffff00;">╔╗</span>`,
    `<span style="color:#88ff00;">┌─┐</span><span style="color:#ff0088;">│<span style="color:#ffffff;">◉</span>│</span><span style="color:#00ffff;">└─┘</span>`,
    `<span style="color:#ff00ff;">○</span><span style="color:#00ff00;">┘</span><span style="color:#ffff00;">┌</span>`,
    `<span style="color:#ff6600;">█▀█</span><span style="color:#00ffff;">░░█</span><span style="color:#ff00ff;">░░█</span>`,
    `<span style="color:#00ff00;">╭─╮</span><span style="color:#ff00ff;">│<span style="color:#ffffff;">▽</span>│</span><span style="color:#00ffff;">╰─╯</span>`,
    `<span style="color:#ffff00;">▄▄▄</span><span style="color:#ff0088;">█▀▄</span><span style="color:#00ffff;">▄█▀</span>`,
    `<span style="color:#ff00ff;">╱</span><span style="color:#00ffff;">╲</span><span style="color:#ff6600;">╱</span><span style="color:#00ff00;">╲</span><span style="color:#ffff00;">│</span>`,
];

const neonColors = ['#ff00ff', '#00ffff', '#ff0088', '#ffff00', '#00ff00', '#ff6600', '#88ffff', '#ff88ff'];
let activeGlitches = [];
let glitchCooldown = 0;
const GLITCH_COOLDOWN = 5;

function createGlitch() {
    if (activeGlitches.length >= 3) return;
    
    const glitch = document.createElement('div');
    glitch.style.cssText = `
        position:absolute;
        font-family:'JetBrains Mono',monospace;
        font-size:${8 + Math.random() * 12}px;
        white-space:pre;
        opacity:0;
        text-shadow:0 0 10px currentColor;
        animation:glitchFade ${0.5 + Math.random() * 1.5}s ease-in-out forwards;
        transform:rotate(${-15 + Math.random() * 30}deg) scale(${0.5 + Math.random() * 1});
    `;
    
    glitch.innerHTML = asciiFigures[Math.floor(Math.random() * asciiFigures.length)];
    glitch.style.color = neonColors[Math.floor(Math.random() * neonColors.length)];
    glitch.style.left = Math.random() * 80 + 10 + '%';
    glitch.style.top = Math.random() * 70 + 15 + '%';
    
    glitchLayer.appendChild(glitch);
    activeGlitches.push(glitch);
    
    setTimeout(() => {
        glitch.style.animation = 'glitchFadeOut 0.3s ease-out forwards';
        setTimeout(() => {
            if (glitch.parentNode) glitch.parentNode.removeChild(glitch);
            activeGlitches = activeGlitches.filter(g => g !== glitch);
        }, 300);
    }, 800 + Math.random() * 2000);
}

const glitchStyle = document.createElement('style');
glitchStyle.textContent = `
    @keyframes glitchFade {
        0% { opacity: 0; transform: scale(0.5) rotate(0deg); }
        10% { opacity: 1; transform: scale(1.1) rotate(-5deg); }
        20% { opacity: 0.8; transform: scale(1) rotate(5deg); }
        30% { opacity: 1; transform: scale(1.05) rotate(-3deg); }
        50% { opacity: 0.9; transform: scale(1) rotate(2deg); }
        70% { opacity: 1; transform: scale(0.95) rotate(-1deg); }
        100% { opacity: 0; transform: scale(0.8) rotate(0deg); }
    }
    @keyframes glitchFadeOut {
        0% { opacity: 0.8; }
        100% { opacity: 0; }
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
progressBar.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:502;';
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

function activateSection(idx) {
    console.log('[ACTIVATE] section:', idx, '-', sections[idx]?.title);
    
    Object.keys(typewriterState).forEach(key => {
        typewriterState[key].active = false;
        typewriterState[key].currentLine = 0;
        typewriterState[key].currentChar = 0;
        const lines = sections[key].content.split('. ');
        typewriterState[key].lines = lines.length;
        lines.forEach((line, lineIdx) => {
            const lineEl = document.getElementById(`typewriter-${key}-${lineIdx}`);
            if (lineEl) lineEl.textContent = '';
        });
    });
    
    typewriterState[idx].active = true;
    
    let found = 0;
    sections.forEach((_, i) => {
        const sectionDiv = document.getElementById(`section-${i}`);
        if (sectionDiv) {
            found++;
            sectionDiv.style.opacity = i === idx ? '1' : '0';
            sectionDiv.style.transform = i === idx ? 'translateY(0)' : 'translateY(20px)';
        }
    });
    console.log('[ACTIVATE] found', found, 'section divs in DOM');
    
    document.querySelectorAll('[id^="progress-dot-"]').forEach((el, i) => {
        el.style.opacity = i === idx ? '1' : '0.3';
        el.style.background = i === idx ? '#00ffcc' : 'transparent';
    });
    
    currentSection = idx;
}

function updateTypewriter(deltaTime) {
    if (!typewriterState[currentSection] || !typewriterState[currentSection].active) return;
    
    const state = typewriterState[currentSection];
    const contentLines = sections[currentSection].content.split('. ');
    
    typewriterTimer += deltaTime;
    
    if (typewriterTimer >= TYPEWRITER_SPEED) {
        typewriterTimer = 0;
        
        if (state.currentLine < state.lines) {
            const fullLine = contentLines[state.currentLine] + (state.currentLine < state.lines - 1 ? '. ' : '');
            const lineEl = document.getElementById(`typewriter-${currentSection}-${state.currentLine}`);
            
            if (lineEl && state.currentChar <= fullLine.length) {
                lineEl.textContent = fullLine.substring(0, state.currentChar + 1);
                state.currentChar++;
            } else if (state.currentChar > fullLine.length) {
                state.currentLine++;
                state.currentChar = 0;
            }
        }
    }
}

function updateTelemetry(sectionIdx, progress) {
    sections[sectionIdx].telemetry.forEach((_, telemIdx) => {
        const fill = document.querySelector(`.telem-fill-${sectionIdx}-${telemIdx}`);
        const value = document.querySelector(`.telem-value-${sectionIdx}-${telemIdx}`);
        if (fill && value) {
            const val = Math.sin(Date.now() * 0.001 + sectionIdx * 2 + telemIdx) * 0.5 + 0.5;
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
    line.style.cssText = 'color:#7a8a7a;font-family:"JetBrains Mono",monospace;font-size:13px;line-height:1.6;white-space:pre;height:1.6em;';
    if (className) line.className = className;
    return line;
}

sections.forEach((section, i) => {
    const sectionDiv = document.createElement('div');
    sectionDiv.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;padding:0 80px;opacity:0;transition:opacity 0.5s ease;pointer-events:none;`;
    sectionDiv.id = `section-${i}`;
    
    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'color:#fff;font-size:28px;font-weight:bold;letter-spacing:4px;margin-bottom:8px;text-shadow:0 0 20px #00ffcc40;';
    titleEl.textContent = section.title;
    
    const subtitleEl = document.createElement('div');
    subtitleEl.style.cssText = 'color:#00ffcc;font-size:11px;letter-spacing:2px;margin-bottom:24px;';
    subtitleEl.textContent = section.subtitle;
    
    const typewriterContainer = document.createElement('div');
    typewriterContainer.id = `typewriter-${i}`;
    typewriterContainer.style.cssText = 'max-width:520px;';
    
    const contentLines = section.content.split('. ');
    contentLines.forEach((line, lineIdx) => {
        const lineEl = createTypewriterLine();
        lineEl.id = `typewriter-${i}-${lineIdx}`;
        lineEl.textContent = line + (lineIdx < contentLines.length - 1 ? '.' : '');
        typewriterContainer.appendChild(lineEl);
    });
    
    const cursorLine = document.createElement('div');
    cursorLine.id = `cursor-${i}`;
    cursorLine.innerHTML = '<span style="color:#00ffcc;background:#00ffcc;width:8px;height:14px;display:inline-block;animation:blink 1s step-end infinite;">&nbsp;</span>';
    typewriterContainer.appendChild(cursorLine);
    
    const telemetryEl = document.createElement('div');
    telemetryEl.style.cssText = 'margin-top:24px;display:flex;flex-direction:column;gap:4px;';
    
    section.telemetry.forEach((label, j) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:12px;font-size:10px;font-family:"JetBrains Mono",monospace;';
        
        const labelSpan = document.createElement('span');
        labelSpan.style.cssText = 'color:#00ffcc;width:120px;';
        labelSpan.textContent = label;
        
        const bar = document.createElement('div');
        bar.style.cssText = 'flex:1;height:2px;background:linear-gradient(90deg,#00ffcc20,#00ffcc,#00ffcc20);position:relative;';
        
        const fill = document.createElement('div');
        fill.style.cssText = 'position:absolute;top:0;left:0;height:100%;width:0%;background:#00ffcc;transition:width 2s ease;';
        fill.className = `telem-fill-${i}-${j}`;
        bar.appendChild(fill);
        
        const value = document.createElement('span');
        value.style.cssText = 'color:#fff;min-width:60px;text-align:right;font-family:"JetBrains Mono",monospace;';
        value.className = `telem-value-${i}-${j}`;
        value.textContent = '0.000';
        
        row.appendChild(labelSpan);
        row.appendChild(bar);
        row.appendChild(value);
        telemetryEl.appendChild(row);
    });
    
    sectionDiv.appendChild(titleEl);
    sectionDiv.appendChild(subtitleEl);
    sectionDiv.appendChild(typewriterContainer);
    sectionDiv.appendChild(telemetryEl);
    sectionsWrapper.appendChild(sectionDiv);
    
    typewriterState[i] = { lines: contentLines.length, currentLine: 0, currentChar: 0, active: false };
});

const cursorStyle = document.createElement('style');
cursorStyle.textContent = `
    @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
    }
    @keyframes typewriter {
        from { width: 0; }
        to { width: 100%; }
    }
`;
document.head.appendChild(cursorStyle);

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
    e.preventDefault();
    e.stopPropagation();
    handleScrollInput(e.deltaY);
}, { passive: false });

document.addEventListener('scroll', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.scrollTo(0, 0);
}, { passive: false });

sectionsWrapper.addEventListener('touchmove', (e) => {
    e.preventDefault();
}, { passive: false });

window.addEventListener('touchmove', (e) => {
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
    
    glitchCooldown -= 0.016;
    if (glitchCooldown <= 0) {
        if (Math.random() < 0.3) {
            createGlitch();
        }
        glitchCooldown = 5 + Math.random() * 5;
    }
    
    if (glitchIntensity > 0.01) {
        glitchIntensity *= 0.95;
    }
    
    controls.update();
    composer.render();
}

let controls = {
    update: function() {},
    enableDamping: false
};

const orbitControlsBtn = document.createElement('button');
orbitControlsBtn.textContent = '○ ORBIT';
orbitControlsBtn.style.cssText = 'position:fixed;top:90px;right:10px;color:#888;font-family:monospace;font-size:10px;background:rgba(5,10,15,0.9);padding:6px 10px;border:1px solid #444;cursor:pointer;z-index:1001;';
orbitControlsBtn.addEventListener('click', () => {
    if (controls.enableDamping) {
        controls.enableDamping = false;
        orbitControlsBtn.textContent = '○ ORBIT';
        orbitControlsBtn.style.borderColor = '#444';
        orbitControlsBtn.style.color = '#888';
    } else {
        controls.enableDamping = true;
        orbitControlsBtn.textContent = '● ORBIT';
        orbitControlsBtn.style.borderColor = '#00ffcc';
        orbitControlsBtn.style.color = '#00ffcc';
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

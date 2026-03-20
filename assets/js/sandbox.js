import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { createNoise3D } from 'simplex-noise';

const canvas = document.getElementById('three-canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030303);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 0, 40);

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
    
    void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPos.xyz;
        gl_Position = projectionMatrix * mvPos;
    }
`;

const fragmentShader = `
    uniform float uTime;
    uniform float uSpikeScale;
    uniform float uSpikeFreq;
    uniform float uGrainScale;
    
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying vec3 vViewPos;
    
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
    
    float ridgeNoise(vec3 p) {
        float n = noise3D(p);
        n = abs(n * 2.0 - 1.0);
        return 1.0 - n;
    }
    
    float fbm(vec3 p, int octaves) {
        float v = 0.0;
        float a = 0.5;
        for(int i = 0; i < 6; i++) {
            if(i >= octaves) break;
            v += a * ridgeNoise(p);
            p *= 2.0;
            a *= 0.5;
        }
        return v;
    }
    
    void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPos);
        
        float spike1 = ridgeNoise(vWorldPos * uSpikeFreq);
        float spike2 = ridgeNoise(vWorldPos * uSpikeFreq * 1.7 + 100.0);
        float spike3 = ridgeNoise(vWorldPos * uSpikeFreq * 2.3 + 200.0);
        
        float combinedSpikes = (spike1 * 0.5 + spike2 * 0.3 + spike3 * 0.2);
        combinedSpikes = pow(combinedSpikes, 1.5);
        
        float microNoise = fbm(vWorldPos * uSpikeFreq * 3.0, 4) * 0.3;
        
        float displacement = combinedSpikes * uSpikeScale + microNoise * uSpikeScale * 0.3;
        
        vec3 perturbedNormal = normal;
        float eps = 0.01;
        float dx = ridgeNoise((vWorldPos + vec3(eps, 0.0, 0.0)) * uSpikeFreq) - ridgeNoise((vWorldPos - vec3(eps, 0.0, 0.0)) * uSpikeFreq);
        float dy = ridgeNoise((vWorldPos + vec3(0.0, eps, 0.0)) * uSpikeFreq) - ridgeNoise((vWorldPos - vec3(0.0, eps, 0.0)) * uSpikeFreq);
        float dz = ridgeNoise((vWorldPos + vec3(0.0, 0.0, eps)) * uSpikeFreq) - ridgeNoise((vWorldPos - vec3(0.0, 0.0, eps)) * uSpikeFreq);
        perturbedNormal = normalize(normal + vec3(dx, dy, dz) * displacement * 2.0);
        
        float fresnel = pow(1.0 - abs(dot(viewDir, perturbedNormal)), 3.0);
        
        float facingLight = max(dot(perturbedNormal, normalize(vec3(1.0, 1.0, 0.5))), 0.0);
        float backLight = max(dot(perturbedNormal, normalize(vec3(-1.0, 0.5, -0.5))), 0.0) * 0.3;
        
        float spikeHighlight = pow(combinedSpikes, 2.0) * fresnel;
        
        float brightness = facingLight * 0.15 + backLight * 0.4 + spikeHighlight * 0.6 + fresnel * 0.3;
        
        brightness += (noise3D(vWorldPos * uGrainScale) - 0.5) * 0.05;
        
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
        uSpikeScale: { value: 1.0 },
        uSpikeFreq: { value: 2.0 },
        uGrainScale: { value: 80.0 }
    },
    side: THREE.DoubleSide
});

const resolution = 100;

const effect = new MarchingCubes(resolution, semMaterial, false, false, 600000);
effect.position.set(0, 0, 0);
effect.scale.set(60, 60, 60);
effect.isolation = 0;
scene.add(effect);

const boxWire = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(60, 60, 60)),
    new THREE.LineBasicMaterial({ color: 0x333333 })
);
scene.add(boxWire);

const params = {
    macroScale: 1.3,
    caveConnectivity: 0.55,
    distAtten: 0.2,
    distOffset: 1.0,
    spikeScale: 1.0,
    spikeFreq: 2.0,
    grainScale: 80.0
};

function bakeStructure() {
    effect.reset();
    
    let index = 0;
    for (let k = 0; k < resolution; k++) {
        for (let j = 0; j < resolution; j++) {
            for (let i = 0; i < resolution; i++) {
                
                const nx = (i / resolution) * 2 - 1;
                const ny = (j / resolution) * 2 - 1;
                const nz = (k / resolution) * 2 - 1;

                const macroFbm = fbmSimplex(nx * params.macroScale, ny * params.macroScale, nz * params.macroScale, 2);
                let baseDensity = -(macroFbm - params.caveConnectivity);
                
                const distToCenter = Math.sqrt(nx*nx + ny*ny + nz*nz);
                let finalDensity = baseDensity + (distToCenter * params.distAtten) - params.distOffset;

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
controls.minDistance = 5;
controls.maxDistance = 100;

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

createSlider('spikeScale', 0.1, 3.0, 0.1, params.spikeScale, (val) => {
    params.spikeScale = val;
    semMaterial.uniforms.uSpikeScale.value = val;
});

createSlider('spikeFreq', 0.5, 5.0, 0.1, params.spikeFreq, (val) => {
    params.spikeFreq = val;
    semMaterial.uniforms.uSpikeFreq.value = val;
});

createSlider('grainScale', 20.0, 200.0, 10.0, params.grainScale, (val) => {
    params.grainScale = val;
    semMaterial.uniforms.uGrainScale.value = val;
});

const instructions = document.createElement('div');
instructions.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);color:#888;font-family:monospace;font-size:14px;text-align:center;background:rgba(0,0,0,0.8);padding:15px;border:2px solid #444;pointer-events:none;z-index:1000;';
instructions.innerHTML = 'DRAG TO ORBIT | SCROLL TO ZOOM';
document.body.appendChild(instructions);

bakeStructure();

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    
    semMaterial.uniforms.uTime.value = clock.getElapsedTime();
    
    controls.update();
    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

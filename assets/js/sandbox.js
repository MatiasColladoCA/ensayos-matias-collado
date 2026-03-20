import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { createNoise3D } from 'simplex-noise';

const canvas = document.getElementById('three-canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 0, 40);

const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const SIMPLEX_GLSL = `
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float snoise(vec3 v) {
        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i);
        vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
        float n_ = 0.142857142857;
        vec3 ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        vec4 x = x_ * ns.x + ns.yyyy;
        vec4 y = y_ * ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }
    
    float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for(int i = 0; i < 3; i++) {
            v += a * snoise(p);
            p *= 2.0;
            a *= 0.5;
        }
        return v;
    }
    
    float grainNoise(vec3 p) {
        return snoise(p * 100.0) * 0.5 + 0.5;
    }
`;

const vertexShader = `
    ${SIMPLEX_GLSL}
    
    uniform float uTime;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vWorldPos;
    varying float vNoise;
    
    void main() {
        vNormal = normalize(normalMatrix * normal);
        
        vec3 pos = position;
        
        float spineNoise = snoise(pos * 30.0);
        float microSpike = pow(abs(spineNoise), 1.5) * sign(spineNoise) * 0.15;
        
        float mediumNoise = snoise(pos * 15.0) * 0.08;
        
        vNoise = spineNoise;
        
        pos += normal * (microSpike + mediumNoise);
        
        vPosition = pos;
        vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
`;

const fragmentShader = `
    ${SIMPLEX_GLSL}
    
    uniform float uTime;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vWorldPos;
    varying float vNoise;
    
    void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        
        float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), 2.5);
        
        float spike = pow(abs(vNoise), 1.5);
        
        float brightness = fresnel * 0.7 + spike * 0.3;
        
        brightness = clamp(brightness, 0.0, 1.0);
        
        vec3 darkColor = vec3(0.02, 0.02, 0.02);
        vec3 brightColor = vec3(0.95, 0.95, 0.95);
        
        vec3 color = mix(darkColor, brightColor, brightness);
        
        float grain = grainNoise(vWorldPos + uTime * 0.01);
        color += (grain - 0.5) * 0.03;
        
        color = clamp(color, 0.0, 1.0);
        
        gl_FragColor = vec4(color, 1.0);
    }
`;

const semMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
        uTime: { value: 0 }
    },
    side: THREE.DoubleSide
});

const resolution = 100;

const effect = new MarchingCubes(resolution, semMaterial, false, false, 600000);
effect.position.set(0, 0, 0);
effect.scale.set(60, 60, 60);
effect.isolation = 0;
scene.add(effect);

const simplex3D = createNoise3D();

function fbmSimplex(x, y, z, octaves) {
    let v = 0;
    let amplitude = 0.5;
    let frequency = 1.0;
    for (let i = 0; i < octaves; i++) {
        v += amplitude * simplex3D(x * frequency, y * frequency, z * frequency);
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    return v;
}

const params = {
    macroScale: 1.3,
    caveConnectivity: 0.55,
    distAtten: 0.2,
    distOffset: 1.0
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

const info = document.createElement('div');
info.style.cssText = 'position:fixed;top:10px;left:10px;color:#888;font-family:monospace;font-size:11px;background:rgba(0,0,0,0.9);padding:10px;border:1px solid #444;z-index:1000;';
info.innerHTML = `SEM SPIKY BONE<br>macroScale: ${params.macroScale}<br>caveConnectivity: ${params.caveConnectivity}<br>distAtten: ${params.distAtten}<br>distOffset: ${params.distOffset}`;
document.body.appendChild(info);

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

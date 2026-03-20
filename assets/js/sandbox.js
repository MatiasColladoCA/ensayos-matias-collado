import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import GSAP from 'gsap';

const canvas = document.getElementById('three-canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(-3.62, -1.07, 3.28);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enableZoom = false;
controls.enablePan = false;
controls.rotateSpeed = 0.3;

const vertexShader = `
    varying vec2 vUv;
    varying float vElevation;
    varying float vFogDepth;

    float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float noise(vec2 x) {
        vec2 i = floor(x);
        vec2 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float fbm(vec2 x) {
        float v = 0.0;
        float a = 0.5;
        mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
        for (int i = 0; i < 6; i++) {
            v += a * noise(x);
            x = rot * x * 2.0;
            a *= 0.5;
        }
        return v;
    }

    void main() {
        vUv = uv;
        
        vec2 p = position.xz * 0.15;
        
        float continental = fbm(p * 0.8) * 12.0;
        continental = pow(continental, 1.1);
        
        float ridge = fbm(p * 1.5 + vec2(50.0)) * 0.6;
        ridge = pow(ridge, 2.0);
        
        float detail = fbm(p * 4.0 + vec2(100.0)) * 0.15;
        
        float erosion = fbm(p * 10.0 + vec2(200.0)) * 0.05;
        
        float baseHeight = continental;
        
        float ridgeMask = smoothstep(0.3, 0.6, ridge);
        float terrainHeight = baseHeight + ridge * ridgeMask * 15.0;
        
        float flatMask = smoothstep(0.15, 0.3, fbm(p * 0.5 + vec2(300.0)));
        terrainHeight = mix(terrainHeight * 0.1, terrainHeight, flatMask);
        
        terrainHeight += detail + erosion;
        
        float height = max(0.0, terrainHeight);
        
        vec3 pos = position;
        pos.y = height;
        
        vElevation = height;
        
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        vFogDepth = -mvPosition.z;
        
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const fragmentShader = `
    varying vec2 vUv;
    varying float vElevation;
    varying float vFogDepth;

    void main() {
        float normalizedElevation = clamp(vElevation / 25.0, 0.0, 1.0);
        
        float fogFactor = 1.0 - exp(-vFogDepth * 0.006);
        fogFactor = clamp(fogFactor, 0.0, 1.0);
        
        vec3 deepValley = vec3(0.12, 0.1, 0.14);
        vec3 valley = vec3(0.25, 0.22, 0.28);
        vec3 lowland = vec3(0.4, 0.38, 0.42);
        vec3 highland = vec3(0.55, 0.52, 0.58);
        vec3 mountain = vec3(0.7, 0.68, 0.72);
        vec3 peak = vec3(0.88, 0.86, 0.9);
        
        vec3 color;
        if (normalizedElevation < 0.15) {
            color = mix(deepValley, valley, normalizedElevation / 0.15);
        } else if (normalizedElevation < 0.3) {
            color = mix(valley, lowland, (normalizedElevation - 0.15) / 0.15);
        } else if (normalizedElevation < 0.5) {
            color = mix(lowland, highland, (normalizedElevation - 0.3) / 0.2);
        } else if (normalizedElevation < 0.75) {
            color = mix(highland, mountain, (normalizedElevation - 0.5) / 0.25);
        } else {
            color = mix(mountain, peak, (normalizedElevation - 0.75) / 0.25);
        }
        
        vec3 fogColor = vec3(0.08, 0.07, 0.1);
        color = mix(color, fogColor, fogFactor * 0.6);
        
        float ao = 1.0 - clamp(vElevation / 35.0, 0.0, 0.2);
        color *= ao;
        
        gl_FragColor = vec4(color, 1.0);
    }
`;

const geometry = new THREE.PlaneGeometry(100, 100, 256, 256);
geometry.rotateX(-Math.PI / 2);

const material = new THREE.ShaderMaterial({
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    uniforms: {
        uTime: { value: 0 }
    },
    side: THREE.DoubleSide
});

const terrain = new THREE.Mesh(geometry, material);
scene.add(terrain);

const clock = new THREE.Clock();
const rotateSpeed = 0.004;
let rotationDirection = -1;
let previousTheta = 0;

const Y_MIN = -2;
const Y_MAX = 1;
const Y_SPRING = 0.02;
const Y_DAMPING = 0.985;

let targetY = camera.position.y;
let velocityY = 0;

controls.addEventListener('start', () => {
});

controls.addEventListener('end', () => {
});

controls.addEventListener('change', () => {
    const y = camera.position.y;
    if (y < Y_MIN) {
        camera.position.y = Y_MIN;
        targetY = Y_MIN;
    } else if (y > Y_MAX) {
        camera.position.y = Y_MAX;
        targetY = Y_MAX;
    } else {
        targetY = y;
    }
    velocityY = 0;
});

function animate() {
    requestAnimationFrame(animate);
    
    controls.update();
    

    
    const pos = camera.position;
    const currentTheta = Math.atan2(pos.x, pos.z);
    const deltaTheta = currentTheta - previousTheta;
    
    if (Math.abs(deltaTheta) > 0.001 && Math.abs(deltaTheta) < Math.PI) {
        if (deltaTheta > 0) rotationDirection = 1;
        else rotationDirection = -1;
    }
    previousTheta = currentTheta;
    
    const radiusXZ = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
    
    if (Math.abs(pos.y - targetY) > 0.01) {
        const springForce = (targetY - pos.y) * Y_SPRING;
        velocityY += springForce;
        velocityY *= Y_DAMPING;
        targetY += velocityY;
        
        if (targetY < Y_MIN) targetY = Y_MIN;
        if (targetY > Y_MAX) targetY = Y_MAX;
    } else {
        targetY = pos.y;
    }
    
    const newTheta = currentTheta + rotateSpeed * rotationDirection;
    camera.position.x = Math.sin(newTheta) * radiusXZ;
    camera.position.z = Math.cos(newTheta) * radiusXZ;
    camera.position.y = targetY;
    camera.lookAt(0, 0, 0);
    
    material.uniforms.uTime.value = clock.getElapsedTime();
    
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

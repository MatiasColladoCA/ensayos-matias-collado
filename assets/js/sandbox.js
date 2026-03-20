import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { createNoise3D } from 'simplex-noise';

const canvas = document.getElementById('three-canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a12);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 0, 30);

const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

const material = new THREE.MeshStandardMaterial({
    color: 0x00cccc,
    roughness: 0.8,
    metalness: 0.1,
    side: THREE.DoubleSide
});

const resolution = 45;
const effect = new MarchingCubes(resolution, material, false, false, 150000);
effect.position.set(0, 0, 0);
effect.scale.set(50, 50, 50);
effect.isolation = 0;
scene.add(effect);

const boxWire = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(50, 50, 50)),
    new THREE.LineBasicMaterial({ color: 0xff00ff })
);
scene.add(boxWire);

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

function bakeBoneStructure() {
    let index = 0;
    for (let k = 0; k < resolution; k++) {
        for (let j = 0; j < resolution; j++) {
            for (let i = 0; i < resolution; i++) {
                
                const nx = (i / resolution) * 2 - 1;
                const ny = (j / resolution) * 2 - 1;
                const nz = (k / resolution) * 2 - 1;

                const baseScale = 4.0;
                const baseFbm = fbmSimplex(nx * baseScale, ny * baseScale, nz * baseScale, 2);
                
                const caveConnectivity = 0.03;
                let density = baseFbm - caveConnectivity;
                
                let finalCaveDensity = -density;
                
                const distToCenter = Math.sqrt(nx*nx + ny*ny + nz*nz);
                finalCaveDensity += (distToCenter * 0.3) - 0.1;

                effect.field[index] = finalCaveDensity;
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

const instructions = document.createElement('div');
instructions.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:#0ff;font-family:monospace;font-size:16px;text-align:center;background:rgba(0,0,0,0.9);padding:25px;border:2px solid #f0f;pointer-events:none;z-index:1000;';
instructions.innerHTML = 'DRAG TO ORBIT<br>SCROLL TO ZOOM';
document.body.appendChild(instructions);

bakeBoneStructure();

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

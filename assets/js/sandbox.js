import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { createNoise3D } from 'simplex-noise';

const canvas = document.getElementById('three-canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a12);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 0, 40);

const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

const resolution = 100;

const roughMaterial = new THREE.MeshStandardMaterial({
    color: 0x888888,
    roughness: 1.0,
    metalness: 0.0,
    side: THREE.DoubleSide
});

const effect = new MarchingCubes(resolution, roughMaterial, false, false, 600000);
effect.position.set(0, 0, 0);
effect.scale.set(60, 60, 60);
effect.isolation = 0;
scene.add(effect);

const boxWire = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(60, 60, 60)),
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

const params = {
    macroScale: 1.3,
    caveConnectivity: 0.55,
    splinterFreq: 40,
    splinterAmp: 0.15,
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
                
                let splinterNoise = 1.0 - Math.abs(simplex3D(nx * params.splinterFreq, ny * params.splinterFreq, nz * params.splinterFreq));
                
                let roughDensity = baseDensity + (splinterNoise * params.splinterAmp);
                
                const distToCenter = Math.sqrt(nx*nx + ny*ny + nz*nz);
                let finalDensity = roughDensity + (distToCenter * params.distAtten) - params.distOffset;

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
info.style.cssText = 'position:fixed;top:10px;left:10px;color:#0ff;font-family:monospace;font-size:11px;background:rgba(0,0,0,0.8);padding:10px;border:1px solid #f0f;z-index:1000;';
info.innerHTML = `macroScale: ${params.macroScale}<br>caveConnectivity: ${params.caveConnectivity}<br>splinterFreq: ${params.splinterFreq}<br>splinterAmp: ${params.splinterAmp}<br>distAtten: ${params.distAtten}<br>distOffset: ${params.distOffset}`;
document.body.appendChild(info);

const instructions = document.createElement('div');
instructions.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);color:#fff;font-family:monospace;font-size:14px;text-align:center;background:rgba(0,0,0,0.8);padding:15px;border:2px solid #f0f;pointer-events:none;z-index:1000;';
instructions.innerHTML = 'DRAG TO ORBIT | SCROLL TO ZOOM';
document.body.appendChild(instructions);

bakeStructure();

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

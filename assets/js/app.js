import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import GSAP from 'gsap';
import Lenis from 'lenis';

window.bionReadSwitch = function() { console.warn("Bionic reading disabled for 3D test"); };

const lenis = new Lenis();
GSAP.ticker.add((time) => {
  lenis.raf(time * 1000);
});
GSAP.ticker.lagSmoothing(0);

const container = document.getElementById('three-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);
camera.position.z = 5;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

let globalCube;
let globalMaterials = [];

const mockColors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];

mockColors.forEach(colorHex => {
    const mat = new THREE.MeshStandardMaterial({ 
        color: colorHex,
        roughness: 0.4,
        metalness: 0.1
    });
    globalMaterials.push(mat);
});

const geometry = new THREE.BoxGeometry(2, 2, 2);
globalCube = new THREE.Mesh(geometry, globalMaterials);
scene.add(globalCube);

function render() {
    controls.update();
    renderer.render(scene, camera);
}
GSAP.ticker.add(render);

export function disposeThreeJS() {
    GSAP.ticker.remove(render);
    if (globalCube) {
        globalCube.geometry.dispose();
        globalMaterials.forEach(mat => {
            if (mat.map) mat.map.dispose();
            mat.dispose();
        });
        scene.remove(globalCube);
    }
    renderer.dispose();
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

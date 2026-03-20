import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import GSAP from 'gsap';

const canvas = document.getElementById('three-canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020204);

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
        
        float heightVariation = noise(p * 0.3 + vec2(500.0)) * 0.4 + 0.8;
        
        float continental = fbm(p * 0.8) * 12.0;
        continental = pow(continental, 1.1);
        
        float ridge = fbm(p * 1.5 + vec2(50.0)) * 0.6;
        ridge = pow(ridge, 2.0);
        
        float detail = fbm(p * 4.0 + vec2(100.0)) * 0.15;
        
        float erosion = fbm(p * 10.0 + vec2(200.0)) * 0.05;
        
        float baseHeight = continental;
        
        float ridgeMask = smoothstep(0.3, 0.6, ridge);
        float terrainHeight = baseHeight + ridge * ridgeMask * 15.0 * heightVariation;
        
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
        
        float fogFactor = 1.0 - exp(-vFogDepth * 0.015);
        fogFactor = pow(fogFactor, 1.5);
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
        
        vec3 fogColor = vec3(0.0, 0.0, 0.0);
        color = mix(color, fogColor, fogFactor);
        
        float ao = 1.0 - clamp(vElevation / 35.0, 0.0, 0.2);
        color *= ao;
        
        gl_FragColor = vec4(color, 1.0);
    }
`;

const geometry = new THREE.PlaneGeometry(600, 600, 384, 384);
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

// =============== MULTIPLE COLORED DOMES ===============
const domeRadius = 60;
const domeSegments = 24;

const domeColors = [
    { neon: new THREE.Vector3(1.0, 0.15, 0.05), base: new THREE.Vector3(0.15, 0.08, 0.05) },   // Rojo
    { neon: new THREE.Vector3(0.05, 0.5, 1.0), base: new THREE.Vector3(0.05, 0.1, 0.2) },       // Azul electrico
    { neon: new THREE.Vector3(1.0, 0.9, 0.05), base: new THREE.Vector3(0.2, 0.18, 0.02) },      // Amarillo
    { neon: new THREE.Vector3(0.05, 1.0, 0.4), base: new THREE.Vector3(0.02, 0.15, 0.08) },    // Verde
    { neon: new THREE.Vector3(0.6, 0.05, 1.0), base: new THREE.Vector3(0.12, 0.02, 0.2) },    // Violeta
    { neon: new THREE.Vector3(1.0, 0.3, 0.6), base: new THREE.Vector3(0.2, 0.06, 0.1) },        // Rosa
    { neon: new THREE.Vector3(0.0, 1.0, 0.9), base: new THREE.Vector3(0.0, 0.15, 0.15) },       // Cyan
];

const domes = [];
const domesBySection = [];

function createDomeGeometry() {
    const positions = [];
    const offsets = [];
    const indices = [];

    for (let lat = 0; lat <= domeSegments; lat++) {
        const theta = (lat / domeSegments) * Math.PI;
        const sinTheta = Math.sin(theta);
        const cosTheta = -Math.cos(theta);

        for (let lon = 0; lon <= domeSegments; lon++) {
            const phi = (lon / domeSegments) * Math.PI * 2;

            const offsetX = (Math.random() - 0.5) * 1.5;
            const offsetY = (Math.random() - 0.5) * 0.8;
            const offsetZ = (Math.random() - 0.5) * 1.5;

            const x = domeRadius * sinTheta * Math.cos(phi) + offsetX;
            const y = domeRadius * cosTheta + offsetY;
            const z = domeRadius * sinTheta * Math.sin(phi) + offsetZ;

            positions.push(x, y, z);
            offsets.push(Math.random());
        }
    }

    for (let lat = 0; lat < domeSegments; lat++) {
        for (let lon = 0; lon < domeSegments; lon++) {
            const first = lat * (domeSegments + 1) + lon;
            const second = first + domeSegments + 1;
            indices.push(first, second);
            indices.push(first, first + 1);
        }
    }

    return { positions, offsets, indices };
}

function createDome(colorIndex, position) {
    const { positions, offsets, indices } = createDomeGeometry();
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aRandomOffset', new THREE.Float32BufferAttribute(offsets, 1));
    geometry.setIndex(indices);

    const colors = domeColors[colorIndex];
    
    const material = new THREE.ShaderMaterial({
        vertexShader: `
            attribute float aRandomOffset;
            uniform float uTime;
            varying float vWave;
            varying float vEdge;
            
            void main() {
                vec3 pos = position;
                
                float wave1 = sin(pos.x * 0.4 + pos.z * 0.4 + uTime * 1.8);
                float wave2 = sin(pos.x * 0.6 - pos.z * 0.5 + uTime * 1.2);
                vWave = (wave1 + wave2) * 0.5;
                
                vEdge = aRandomOffset;
                
                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying float vWave;
            varying float vEdge;
            uniform vec3 uNeon;
            uniform vec3 uBase;
            
            void main() {
                float edgeIntensity = abs(vEdge - 0.5) * 2.0;
                float waveEffect = (vWave * 0.5 + 0.5) * edgeIntensity;
                
                vec3 color = mix(uBase, uNeon, waveEffect * 0.95);
                
                float alpha = 0.15 + waveEffect * 0.7;
                gl_FragColor = vec4(color, alpha);
            }
        `,
        uniforms: {
            uTime: { value: 0 },
            uNeon: { value: colors.neon },
            uBase: { value: colors.base }
        },
        transparent: true,
        depthWrite: false
    });

    const lines = new THREE.LineSegments(geometry, material);
    lines.position.copy(position);
    scene.add(lines);

    const starsGeo = new THREE.BufferGeometry();
    starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions.slice(), 3));
    
    const starsMat = new THREE.ShaderMaterial({
        vertexShader: `
            void main() {
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = 0.6 * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 uNeon;
            void main() {
                vec2 center = gl_PointCoord - vec2(0.5);
                float dist = length(center);
                if (dist > 0.5) discard;
                float alpha = 1.0 - smoothstep(0.2, 0.5, dist);
                gl_FragColor = vec4(uNeon, alpha);
            }
        `,
        uniforms: {
            uNeon: { value: colors.neon }
        },
        transparent: true,
        depthWrite: false
    });

    const stars = new THREE.Points(starsGeo, starsMat);
    stars.position.copy(position);
    scene.add(stars);

    return { lines, stars, material: lines.material, starMaterial: stars.material };
}

const sectionDomePositions = [
    new THREE.Vector3(-120, 15, 100),
    new THREE.Vector3(100, 20, 80),
    new THREE.Vector3(140, 10, -60),
    new THREE.Vector3(40, 8, -150),
    new THREE.Vector3(-130, 18, -80),
    new THREE.Vector3(-100, 12, 90),
    new THREE.Vector3(0, 0, 0),
];

for (let i = 0; i < 7; i++) {
    const dome = createDome(i, sectionDomePositions[i].clone());
    domes.push(dome);
}

const sections = sectionDomePositions.map((pos, i) => ({
    domePosition: pos.clone(),
    cameraOffset: new THREE.Vector3(15, 3, 15),
    label: ['Rojo', 'Azul', 'Amarillo', 'Verde', 'Violeta', 'Rosa', 'Cyan'][i],
    title: ['Ensayos Filosóficos', 'Reflexiones', 'Crítica Cultural', 'Tecnología y Sociedad', 'Arte y Estética', 'Ética y Política', 'Metafísica'][i],
    description: ['Explorando las grandes preguntas del pensamiento humano', 'Notas sobre la condición contemporánea', 'Análisis de la cultura actual', 'El futuro que estamos construyendo', 'Belleza, forma y significado', 'El bien, el mal y todo lo demás', 'Sobre la naturaleza de la realidad'][i],
    href: ['/ensayos', '/ensayos', '/ensayos', '/ensayos', '/ensayos', '/ensayos', '/ensayos'][i]
}));

const hudCanvasSize = 2048;
const hudBillboards = [];

sections.forEach((section, i) => {
    const canvas = document.createElement('canvas');
    canvas.width = hudCanvasSize;
    canvas.height = hudCanvasSize;
    const ctx = canvas.getContext('2d');
    
    const w = hudCanvasSize;
    const h = hudCanvasSize;
    const padding = 80;
    
    ctx.fillStyle = 'rgba(10, 10, 10, 0.85)';
    ctx.fillRect(0, 0, w, h);
    
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(padding, padding, w - padding * 2, h - padding * 2);
    
    ctx.strokeStyle = '#33ff33';
    ctx.lineWidth = 3;
    ctx.strokeRect(padding + 15, padding + 15, w - padding * 2 - 30, h - padding * 2 - 30);
    
    ctx.font = 'bold 64px "Courier New", monospace';
    ctx.fillStyle = '#00ffff';
    ctx.fillText('[ ]', padding + 30, padding + 100);
    ctx.fillText('+', w - padding - 100, padding + 100);
    ctx.fillText('+', padding + 30, h - padding - 30);
    ctx.fillText('[ ]', w - padding - 100, h - padding - 30);
    
    ctx.font = '45px "Courier New", monospace';
    ctx.fillStyle = 'rgba(0, 255, 255, 0.7)';
    ctx.fillText('WAYPOINT COORDS:', padding + 40, padding + 170);
    ctx.fillStyle = '#00ffff';
    ctx.fillText(`[ ${section.domePosition.x.toFixed(2)} // ${section.domePosition.y.toFixed(2)} // ${section.domePosition.z.toFixed(2)} ]`, padding + 40, padding + 230);
    
    ctx.font = '45px "Courier New", monospace';
    ctx.fillStyle = '#33ff33';
    ctx.fillText('TELEMETRY: [ONLINE]', padding + 40, padding + 320);
    
    ctx.font = '40px "Courier New", monospace';
    ctx.fillStyle = '#dfff00';
    ctx.fillText('INTEGRITY: 100%', padding + 40, padding + 390);
    
    const titleY = h / 2 + 50;
    ctx.font = 'bold 180px "Helvetica Neue", Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(section.title, padding + 40, titleY);
    
    ctx.font = '55px "Helvetica Neue", Arial, sans-serif';
    ctx.fillStyle = 'rgba(0, 255, 255, 0.8)';
    const words = section.description.split(' ');
    let line = '';
    let y = titleY + 120;
    const maxWidth = w - padding * 2 - 200;
    for (const word of words) {
        const testLine = line + word + ' ';
        if (ctx.measureText(testLine).width > maxWidth) {
            ctx.fillText(line.trim(), padding + 40, y);
            line = word + ' ';
            y += 80;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line.trim(), padding + 40, y);
    
    for (let j = 0; j < 10; j++) {
        const barX = padding + 40 + j * 60;
        const barY = h - padding - 200;
        const barH = 20 + Math.random() * 30;
        ctx.fillStyle = j % 3 === 0 ? 'rgba(223, 255, 0, 0.8)' : 'rgba(51, 255, 51, 0.4)';
        ctx.fillRect(barX, barY - barH, 40, barH);
    }
    
    const btnX = w - padding - 400;
    const btnY = h - padding - 180;
    const btnW = 320;
    const btnH = 80;
    ctx.fillStyle = 'rgba(0, 255, 255, 0.15)';
    ctx.fillRect(btnX, btnY, btnW, btnH);
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(btnX, btnY, btnW, btnH);
    ctx.font = 'bold 50px "Courier New", monospace';
    ctx.fillStyle = '#00ffff';
    ctx.fillText('[NAVEGAR]', btnX + 30, btnY + 55);
    
    for (let j = 0; j < 20; j++) {
        ctx.fillStyle = 'rgba(0, 255, 255, 0.03)';
        ctx.fillRect(0, j * (h / 20), w, 2);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    
    const material = new THREE.SpriteMaterial({ 
        map: texture, 
        transparent: true,
        depthTest: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(4, 4, 1);
    sprite.position.copy(section.domePosition);
    sprite.position.y = -15;
    sprite.visible = false;
    
    scene.add(sprite);
    hudBillboards.push(sprite);
    section.billboard = sprite;
});

let currentSection = 0;
let isTransitioning = false;
let isSettling = false;
let settleEndTime = 0;
const SETTLE_DURATION = 500;
const cameraTarget = new THREE.Vector3(0, 0, 0);
const orbitCenter = new THREE.Vector3(0, -1.07, 0);
let currentTheta = 0;
let orbitRadiusXZ = 25;
let targetY = -1.07;
const CAMERA_Y = -1.07;
let isOrbiting = false;
const PITCH_DEG = 10;
const PITCH_RAD = PITCH_DEG * Math.PI / 180;

function flyToSection(index) {
    if (isTransitioning || index < 0 || index >= sections.length) return;
    
    isTransitioning = true;
    isOrbiting = false;
    const target = sections[index];
    currentSection = index;
    
    let startPos = null;
    const endDomePos = target.domePosition.clone();
    const endPos = new THREE.Vector3(
        endDomePos.x + target.cameraOffset.x,
        CAMERA_Y,
        endDomePos.z + target.cameraOffset.z
    );
    
    const duration = 2500;
    const startTime = Date.now();
    
    function updateFlight() {
        if (startPos === null) {
            startPos = camera.position.clone();
        }
        
        const elapsed = Date.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const smoothT = t * t * (3 - 2 * t);
        
        camera.position.x = startPos.x + (endPos.x - startPos.x) * smoothT;
        camera.position.z = startPos.z + (endPos.z - startPos.z) * smoothT;
        camera.position.y = startPos.y + (endPos.y - startPos.y) * smoothT;
        
        const lookTarget = new THREE.Vector3().lerpVectors(startPos, endPos, smoothT);
        lookTarget.y = CAMERA_Y;
        camera.lookAt(lookTarget);
        
        if (t < 1) {
            requestAnimationFrame(updateFlight);
        } else {
            camera.position.copy(endPos);
            
            orbitCenter.copy(endDomePos);
            orbitCenter.y = CAMERA_Y;
            
            const dx = camera.position.x - orbitCenter.x;
            const dz = camera.position.z - orbitCenter.z;
            orbitRadiusXZ = Math.sqrt(dx * dx + dz * dz);
            currentTheta = Math.atan2(dx, dz);
            targetY = CAMERA_Y;
            isTransitioning = false;
            isSettling = true;
            settleEndTime = Date.now() + SETTLE_DURATION;
            
            cameraTarget.copy(orbitCenter);
            cameraTarget.y = camera.position.y + Math.sin(PITCH_RAD) * orbitRadiusXZ;
        }
    }
    
    requestAnimationFrame(updateFlight);
}

let lastScrollTime = 0;
window.addEventListener('wheel', (e) => {
    if (isTransitioning) return;
    
    const now = Date.now();
    if (now - lastScrollTime < 800) return;
    lastScrollTime = now;
    
    if (e.deltaY > 0) {
        flyToSection((currentSection + 1) % sections.length);
    } else {
        flyToSection((currentSection - 1 + sections.length) % sections.length);
    }
});

function updateHUD() {
    hudBillboards.forEach((billboard, i) => {
        billboard.visible = (i === currentSection && !isTransitioning);
    });
}

const clock = new THREE.Clock();
const rotateSpeed = 0.004;
let rotationDirection = -1;

let lastDirectionCheckTime = 0;

function animate() {
    requestAnimationFrame(animate);
    
    const time = clock.getElapsedTime();
    
    domes.forEach(dome => {
        dome.material.uniforms.uTime.value = time;
    });
    
    material.uniforms.uTime.value = time;
    
    if (isTransitioning) {
        camera.lookAt(cameraTarget);
        renderer.render(scene, camera);
        return;
    }
    
    if (isSettling) {
        if (Date.now() > settleEndTime) {
            isSettling = false;
            isOrbiting = true;
        }
        camera.lookAt(cameraTarget);
        renderer.render(scene, camera);
        updateHUD();
        return;
    }
    
    controls.update();
    
    if (!isOrbiting) {
        camera.lookAt(cameraTarget);
        renderer.render(scene, camera);
        updateHUD();
        return;
    }
    
    const pos = camera.position;
    
    const dx = pos.x - orbitCenter.x;
    const dz = pos.z - orbitCenter.z;
    const newTheta = Math.atan2(dx, dz);
    const deltaTheta = newTheta - currentTheta;
    
    if (Date.now() - lastDirectionCheckTime > 500) {
        if (Math.abs(deltaTheta) > 0.001 && Math.abs(deltaTheta) < Math.PI) {
            rotationDirection = deltaTheta > 0 ? 1 : -1;
        }
        lastDirectionCheckTime = Date.now();
    }
    
    currentTheta = newTheta;
    
    const orbitTheta = currentTheta + rotateSpeed * rotationDirection;
    const newX = orbitCenter.x + Math.sin(orbitTheta) * orbitRadiusXZ;
    const newZ = orbitCenter.z + Math.cos(orbitTheta) * orbitRadiusXZ;
    
    camera.position.x = newX;
    camera.position.z = newZ;
    camera.position.y = targetY;
    cameraTarget.y = targetY + Math.sin(PITCH_RAD) * orbitRadiusXZ;
    camera.lookAt(cameraTarget);
    
    renderer.render(scene, camera);
    updateHUD();
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

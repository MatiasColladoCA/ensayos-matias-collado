import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';
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
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1.5;

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

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.1,
    1.0,
    0.35
);
composer.addPass(bloomPass);

let mirrorCube, cubeCamera;
const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(1024, {
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter
});
cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeRenderTarget);
cubeCamera.position.set(0, 0, 0);
scene.add(cubeCamera);

const mirrorMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 1.0,
    roughness: 0.0,
    envMap: cubeRenderTarget.texture,
    envMapIntensity: 1.0,
    side: THREE.BackSide
});

mirrorCube = new THREE.Mesh(
    new THREE.BoxGeometry(200, 200, 200),
    mirrorMaterial
);
mirrorCube.position.set(0, 0, 0);
scene.add(mirrorCube);

const coreLight = new THREE.PointLight(0xffffff, 240, 300);
coreLight.position.set(0, 0, 0);
scene.add(coreLight);

const lensflare = new Lensflare();
lensflare.addElement(new LensflareElement(createFlareTexture(), 200, 0, coreLight.color));
lensflare.addElement(new LensflareElement(createFlareTexture(), 100, 0.2, coreLight.color));
lensflare.addElement(new LensflareElement(createFlareTexture(), 50, 0.4, coreLight.color));
lensflare.addElement(new LensflareElement(createFlareTexture(), 80, 0.6, coreLight.color));
lensflare.addElement(new LensflareElement(createFlareTexture(), 120, 0.8, coreLight.color));
lensflare.addElement(new LensflareElement(createFlareTexture(), 60, 1.0, coreLight.color));
coreLight.add(lensflare);

function createFlareTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.4)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.1)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

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

const purpleNegativeShader = {
    uniforms: {
        tDiffuse: { value: null },
        uActive: { value: 0.0 },
        uRectX: { value: 0.25 },
        uRectY: { value: 0.25 },
        uRectWidth: { value: 0.3 },
        uRectHeight: { value: 0.2 },
        uIntensity: { value: 0.85 },
        uFlicker: { value: 1.0 }
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
        uniform float uActive;
        uniform float uRectX;
        uniform float uRectY;
        uniform float uRectWidth;
        uniform float uRectHeight;
        uniform float uIntensity;
        uniform float uFlicker;
        varying vec2 vUv;

        vec3 rgb2hsl(vec3 color) {
            float maxC = max(max(color.r, color.g), color.b);
            float minC = min(min(color.r, color.g), color.b);
            float l = (maxC + minC) / 2.0;
            float s = 0.0;
            float h = 0.0;
            if (maxC != minC) {
                float d = maxC - minC;
                s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
                if (maxC == color.r) {
                    h = (color.g - color.b) / d + (color.g < color.b ? 6.0 : 0.0);
                } else if (maxC == color.g) {
                    h = (color.b - color.r) / d + 2.0;
                } else {
                    h = (color.r - color.g) / d + 4.0;
                }
                h /= 6.0;
            }
            return vec3(h, s, l);
        }

        float hue2rgb(float p, float q, float t) {
            if (t < 0.0) t += 1.0;
            if (t > 1.0) t -= 1.0;
            if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
            if (t < 1.0/2.0) return q;
            if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
            return p;
        }

        vec3 hsl2rgb(vec3 hsl) {
            float h = hsl.x;
            float s = hsl.y;
            float l = hsl.z;
            if (s == 0.0) {
                return vec3(l);
            }
            float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
            float p = 2.0 * l - q;
            return vec3(
                hue2rgb(p, q, h + 1.0/3.0),
                hue2rgb(p, q, h),
                hue2rgb(p, q, h - 1.0/3.0)
            );
        }

        void main() {
            vec2 uv = vUv;
            vec4 color = texture2D(tDiffuse, uv);

            if (uActive < 0.01) {
                gl_FragColor = color;
                return;
            }

            bool inRect = uv.x >= uRectX && 
                          uv.x <= uRectX + uRectWidth &&
                          uv.y >= uRectY && 
                          uv.y <= uRectY + uRectHeight;

            if (!inRect) {
                gl_FragColor = color;
                return;
            }

            vec3 hsl = rgb2hsl(color.rgb);
            
            hsl.x = fract(hsl.x + 0.5);
            hsl.y = min(hsl.y * 1.3, 1.0);
            hsl.z = 1.0 - hsl.z;
            
            vec3 negative = hsl2rgb(hsl);
            
            float purpleBase = 0.75;
            negative.r = mix(negative.r, purpleBase, 0.4);
            negative.b = mix(negative.b, purpleBase + 0.1, 0.3);
            negative.g = mix(negative.g, purpleBase * 0.3, 0.5);
            
            float localIntensity = uIntensity * uFlicker;
            vec3 finalColor = mix(color.rgb, negative, localIntensity);
            
            gl_FragColor = vec4(finalColor, 1.0);
        }
    `
};

const purpleNegativePass = new ShaderPass(purpleNegativeShader);
purpleNegativePass.renderToScreen = true;
composer.addPass(purpleNegativePass);

let fortuitousRectActive = false;
let fortuitousRectTimer = 0;
let fortuitousRectDuration = 0;
let fortuitousRectCooldown = 5.0;
let fortuitousRectFlickers = 0;
let fortuitousRectFlickerState = true;

function spawnFortuitousRect() {
    if (fortuitousRectActive) return;
    
    fortuitousRectActive = true;
    fortuitousRectFlickers = 0;
    fortuitousRectFlickerState = true;
    
    const x = Math.random() * 0.5;
    const y = Math.random() * 0.5;
    const w = 0.05 + Math.random() * 0.45;
    const h = 0.05 + Math.random() * 0.45;
    
    fortuitousRectDuration = 0.016 + Math.random() * 0.017;
    
    purpleNegativePass.uniforms.uRectX.value = x;
    purpleNegativePass.uniforms.uRectY.value = y;
    purpleNegativePass.uniforms.uRectWidth.value = w;
    purpleNegativePass.uniforms.uRectHeight.value = h;
    purpleNegativePass.uniforms.uActive.value = 1.0;
    purpleNegativePass.uniforms.uFlicker.value = 1.0;
    
    const flickerInterval = 0.016 + Math.random() * 0.017;
    const maxFlickers = 1 + Math.floor(Math.random() * 5);
    
    function flicker() {
        if (!fortuitousRectActive) return;
        if (fortuitousRectFlickers >= maxFlickers) return;
        
        fortuitousRectFlickerState = !fortuitousRectFlickerState;
        purpleNegativePass.uniforms.uFlicker.value = fortuitousRectFlickerState ? 1.0 : 0.0;
        fortuitousRectFlickers++;
        
        setTimeout(flicker, flickerInterval * 1000);
    }
    
    setTimeout(flicker, flickerInterval * 1000);
}

function updateFortuitousRect(deltaTime) {
    if (fortuitousRectActive) {
        fortuitousRectTimer += deltaTime;
        
        if (fortuitousRectTimer >= fortuitousRectDuration) {
            fortuitousRectActive = false;
            fortuitousRectTimer = 0;
            purpleNegativePass.uniforms.uActive.value = 0.0;
            purpleNegativePass.uniforms.uFlicker.value = 1.0;
            
            fortuitousRectCooldown = 2.0 + Math.random() * 8.0;
            setTimeout(spawnFortuitousRect, fortuitousRectCooldown * 1000);
        }
    }
}

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
    uniform samplerCube tCube;
    
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
        
        vec3 reflectDir = reflect(-viewDir, normal);
        vec3 envColor = textureCube(tCube, reflectDir).rgb;
        
        float fresnel = pow(1.0 - abs(dot(viewDir, normal)), 4.0);
        
        float wave = noiseWave(vWorldPos, uTime) * 0.5 + 0.5;
        float chromeMod = 1.0 + (wave * uChromePulse);
        
        vec3 lightDir = normalize(vec3(1.0, 1.0, 0.5));
        vec3 halfDir = normalize(lightDir + viewDir);
        float specular = pow(max(dot(normal, halfDir), 0.0), 128.0);
        
        float facingLight = max(dot(normal, lightDir), 0.0);
        float backLight = max(dot(normal, normalize(vec3(-1.0, 0.5, -0.5))), 0.0) * 0.3;
        
        float brightness = (facingLight * 0.1 + backLight * 0.3 + fresnel * 0.4) * chromeMod;
        
        brightness = clamp(brightness, 0.0, 1.0);
        
        vec3 darkBase = vec3(0.01, 0.01, 0.012);
        vec3 brightEdge = vec3(0.9, 0.9, 0.95);
        
        vec3 chromeColor = mix(darkBase, brightEdge, brightness);
        chromeColor += envColor * fresnel * 0.6;
        chromeColor += vec3(1.0) * specular * 0.5;
        
        gl_FragColor = vec4(chromeColor, 1.0);
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
        uOrganicIntensity: { value: 3.0 },
        tCube: { value: cubeRenderTarget.texture }
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
const instanceMaterial = [];
const instances = [];

const mat = semMaterial.clone();
instanceMaterial.push(mat);

const effect = new MarchingCubes(resolution, mat, false, false, 300000);
effect.scale.set(75, 75, 75);
effect.isolation = 0;
effect.position.set(0, 0, 0);

instances.push(effect);
scene.add(effect);

const dripParticleCount = 200;
const dripPositions = new Float32Array(dripParticleCount * 3);
const dripVelocities = new Float32Array(dripParticleCount * 3);
const dripLifetimes = new Float32Array(dripParticleCount);
const dripSizes = new Float32Array(dripParticleCount);

const dripGeometry = new THREE.BufferGeometry();
dripGeometry.setAttribute('position', new THREE.BufferAttribute(dripPositions, 3));
dripGeometry.setAttribute('size', new THREE.BufferAttribute(dripSizes, 1));

const dripVertexShader = `
    attribute float size;
    varying float vAlpha;
    uniform float uTime;
    
    void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (200.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
        vAlpha = size / 3.0;
    }
`;

const dripFragmentShader = `
    varying float vAlpha;
    
    void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        
        float alpha = smoothstep(0.5, 0.0, dist) * vAlpha;
        gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
    }
`;

const dripMaterial = new THREE.ShaderMaterial({
    vertexShader: dripVertexShader,
    fragmentShader: dripFragmentShader,
    uniforms: {
        uTime: { value: 0 }
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});

const dripParticles = new THREE.Points(dripGeometry, dripMaterial);
scene.add(dripParticles);

function randomPointOnSphere(radius) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = radius * (0.85 + Math.random() * 0.3);
    return {
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.sin(phi) * Math.sin(theta),
        z: r * Math.cos(phi)
    };
}

for (let i = 0; i < dripParticleCount; i++) {
    const point = randomPointOnSphere(75);
    dripPositions[i * 3] = point.x;
    dripPositions[i * 3 + 1] = point.y;
    dripPositions[i * 3 + 2] = point.z;
    
    dripVelocities[i * 3] = (Math.random() - 0.5) * 0.3;
    dripVelocities[i * 3 + 1] = -0.5 - Math.random() * 1.5;
    dripVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
    
    dripLifetimes[i] = Math.random();
    dripSizes[i] = 0.5 + Math.random() * 2.5;
}

function updateDripParticles(deltaTime, time) {
    dripMaterial.uniforms.uTime.value = time;
    
    const gravity = -2.0;
    const damping = 0.98;
    
    for (let i = 0; i < dripParticleCount; i++) {
        dripLifetimes[i] -= deltaTime * 0.3;
        
        dripVelocities[i * 3 + 1] += gravity * deltaTime;
        
        dripPositions[i * 3] += dripVelocities[i * 3] * deltaTime;
        dripPositions[i * 3 + 1] += dripVelocities[i * 3 + 1] * deltaTime;
        dripPositions[i * 3 + 2] += dripVelocities[i * 3 + 2] * deltaTime;
        
        dripVelocities[i * 3] *= damping;
        dripVelocities[i * 3 + 2] *= damping;
        
        if (dripLifetimes[i] <= 0 || dripPositions[i * 3 + 1] < -100) {
            const point = randomPointOnSphere(75);
            dripPositions[i * 3] = point.x;
            dripPositions[i * 3 + 1] = point.y;
            dripPositions[i * 3 + 2] = point.z;
            
            dripVelocities[i * 3] = (Math.random() - 0.5) * 0.5;
            dripVelocities[i * 3 + 1] = -0.3 - Math.random() * 0.8;
            dripVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
            
            dripLifetimes[i] = 0.8 + Math.random() * 1.5;
            dripSizes[i] = 0.5 + Math.random() * 2.0;
        }
    }
    
    dripGeometry.attributes.position.needsUpdate = true;
}

function syncMaterials() {
    instanceMaterial.forEach(mat => {
        mat.uniforms.uTime.value = semMaterial.uniforms.uTime.value;
        mat.uniforms.uChromePulse.value = semMaterial.uniforms.uChromePulse.value;
        mat.uniforms.uChromeSpeed.value = semMaterial.uniforms.uChromeSpeed.value;
        mat.uniforms.uWaveFreq.value = semMaterial.uniforms.uWaveFreq.value;
        mat.uniforms.uOrganicSpeed.value = semMaterial.uniforms.uOrganicSpeed.value;
        mat.uniforms.uOrganicScale.value = semMaterial.uniforms.uOrganicScale.value;
        mat.uniforms.uOrganicIntensity.value = semMaterial.uniforms.uOrganicIntensity.value;
        mat.uniforms.tCube.value = cubeRenderTarget.texture;
    });
}

function bakeStructure() {
    const effect = instances[0];
    effect.reset();
    
    let index = 0;
    for (let k = 0; k < resolution; k++) {
        for (let j = 0; j < resolution; j++) {
            for (let i = 0; i < resolution; i++) {
                
                const nx = (i / resolution) * 2 - 1;
                const ny = (j / resolution) * 2 - 1;
                const nz = (k / resolution) * 2 - 1;

                const macroFbm = fbmSimplex(
                    nx * params.macroScale,
                    ny * params.macroScale,
                    nz * params.macroScale,
                    2
                );
                let baseDensity = -(macroFbm - 0.55);
                
                const distToCenter = Math.sqrt(nx*nx + ny*ny + nz*nz);
                let finalDensity = baseDensity + (distToCenter * params.distAtten) - params.distOffset;
                
                finalDensity = Math.max(-1, Math.min(1, finalDensity));

                effect.field[index] = finalDensity;
                index++;
            }
        }
    }
    effect.update();
}

let isCalculating = false;
const workerReady = { value: false };

function bakeStructureWithWorker(callback) {
    if (isCalculating) return;
    isCalculating = true;
    
    const worker = new Worker('./js/marching-cubes-worker.js');
    
    worker.onmessage = function(e) {
        if (e.data.type === 'progress') {
            const statusEl = document.getElementById('loading-status');
            const barEl = document.getElementById('loading-bar');
            if (statusEl) statusEl.textContent = e.data.message;
            if (barEl) barEl.style.width = (e.data.progress * 100) + '%';
        } else if (e.data.type === 'complete') {
            const field = e.data.field;
            
            const effect = instances[0];
            effect.reset();
            for (let i = 0; i < field.length; i++) {
                effect.field[i] = field[i];
            }
            effect.update();
            
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
panel.style.cssText = 'position:fixed;top:10px;left:10px;color:#e0e0e0;font-family:"JetBrains Mono","Fira Code",monospace;font-size:11px;background:rgba(5,10,15,0.92);padding:12px;border:1px solid #00ffcc40;z-index:1000;min-width:260px;max-height:90vh;overflow-y:auto;display:none;';
document.body.appendChild(panel);

let sliderLabels2 = {};

function createSlider(name, min, max, step, value, callback, decimals = 2) {
    const div = document.createElement('div');
    div.style.marginBottom = '10px';
    
    const label = document.createElement('div');
    label.textContent = `${name}: ${typeof value === 'number' ? value.toFixed(decimals) : value}`;
    label.style.marginBottom = '4px';
    label.style.color = '#00ffcc';
    label.style.fontSize = '10px';
    
    sliderLabels2[name] = label;
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = value;
    slider.style.width = '220px';
    slider.style.accentColor = '#00ffcc';
    
    slider.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        label.textContent = `${name}: ${val.toFixed(decimals)}`;
        callback(val);
    });
    
    div.appendChild(label);
    div.appendChild(slider);
    panel.appendChild(div);
    return { label, slider };
}

function createToggle(name, checked, callback) {
    const div = document.createElement('div');
    div.style.marginBottom = '10px';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.gap = '10px';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = checked;
    checkbox.style.accentColor = '#00ffcc';
    
    const label = document.createElement('span');
    label.textContent = name;
    label.style.color = '#00ffcc';
    label.style.fontSize = '10px';
    
    checkbox.addEventListener('change', () => {
        callback(checkbox.checked);
    });
    
    div.appendChild(checkbox);
    div.appendChild(label);
    panel.appendChild(div);
    return checkbox;
}

function createSectionHeader(text) {
    const header = document.createElement('div');
    header.textContent = text;
    header.style.cssText = 'color:#ff00ff;font-size:11px;font-weight:bold;margin:15px 0 10px 0;padding-bottom:4px;border-bottom:1px solid #ff00ff30;letter-spacing:2px;';
    panel.appendChild(header);
}

createSectionHeader('[ STRUCTURE ]');

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

createSlider('distOffset', -0.5, 2.0, 0.05, params.distOffset, (val) => {
    params.distOffset = val;
    bakeStructure();
});

createSlider('distAtten', 0.0, 0.5, 0.01, params.distAtten, (val) => {
    params.distAtten = val;
    bakeStructure();
});

createSectionHeader('[ VERTEX SHADER ]');

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

createSectionHeader('[ FRAGMENT SHADER ]');

createSlider('chromePulse', 0.0, 5.0, 0.1, semMaterial.uniforms.uChromePulse.value, (val) => {
    semMaterial.uniforms.uChromePulse.value = val;
});

createSlider('chromeSpeed', 0.1, 5.0, 0.1, semMaterial.uniforms.uChromeSpeed.value, (val) => {
    semMaterial.uniforms.uChromeSpeed.value = val;
});

createSlider('waveFreq', 0.1, 2.0, 0.05, semMaterial.uniforms.uWaveFreq.value, (val) => {
    semMaterial.uniforms.uWaveFreq.value = val;
});

createSectionHeader('[ POST-PROCESSING ]');

createSlider('bloomStrength', 0.0, 3.0, 0.1, 1.1, (val) => {
    bloomPass.strength = val;
});

createSlider('bloomRadius', 0.0, 2.0, 0.1, 1.0, (val) => {
    bloomPass.radius = val;
});

createSlider('bloomThreshold', 0.0, 1.0, 0.05, 0.35, (val) => {
    bloomPass.threshold = val;
});

createSectionHeader('[ EFFECTS ]');

createSlider('toneExposure', 0.1, 3.0, 0.1, 1.5, (val) => {
    renderer.toneMappingExposure = val;
});

createSectionHeader('[ PURPLE NEGATIVE ]');

createSlider('rectX', 0.0, 0.7, 0.05, 0.25, (val) => {
    purpleNegativePass.uniforms.uRectX.value = val;
});

createSlider('rectY', 0.0, 0.7, 0.05, 0.25, (val) => {
    purpleNegativePass.uniforms.uRectY.value = val;
});

createSlider('rectWidth', 0.1, 0.8, 0.05, 0.5, (val) => {
    purpleNegativePass.uniforms.uRectWidth.value = val;
});

createSlider('rectHeight', 0.1, 0.8, 0.05, 0.5, (val) => {
    purpleNegativePass.uniforms.uRectHeight.value = val;
});

createSlider('intensity', 0.0, 1.0, 0.05, 0.85, (val) => {
    purpleNegativePass.uniforms.uIntensity.value = val;
});

createSlider('mirrorSize', 50, 400, 10, 250, (val) => {
    mirrorCube.scale.set(val/200, val/200, val/200);
}, 0);

createSlider('mirrorEnvIntensity', 0.0, 3.0, 0.1, 0.7, (val) => {
    mirrorMaterial.envMapIntensity = val;
});

createSlider('coreLightIntensity', 0, 500, 10, 240, (val) => {
    coreLight.intensity = val;
});

const refreshMirrorBtn = document.createElement('button');
refreshMirrorBtn.textContent = '↻ REFRESH MIRROR';
refreshMirrorBtn.style.cssText = 'color:#ff00ff;font-family:monospace;font-size:9px;background:transparent;padding:4px 8px;border:1px solid #ff00ff40;cursor:pointer;margin-top:8px;';
refreshMirrorBtn.addEventListener('click', () => {
    updateCubeCamera();
});
panel.appendChild(refreshMirrorBtn);

createSectionHeader('[ PERFORMANCE ]');

let pixelRatioSlider;
createSlider('pixelRatio', 1, Math.min(window.devicePixelRatio, 2), 0.5, Math.min(window.devicePixelRatio, 2), (val) => {
    renderer.setPixelRatio(val);
}, 1);

createToggle('Auto Mutation', autoMutate, (val) => {
    autoMutate = val;
});

createToggle('Bloom Pass', true, (val) => {
    bloomPass.enabled = val;
});

createToggle('Mirror Cube', true, (val) => {
    mirrorCube.visible = val;
    if (val) cubeCameraDirty = true;
});

createToggle('Lensflare', true, (val) => {
    lensflare.visible = val;
});



createToggle('HUD Telemetry', true, (val) => {
    telemetryTerminal.style.display = val ? 'block' : 'none';
    hudTelemetry.style.display = val ? 'block' : 'none';
});

const perfStats = document.createElement('div');
perfStats.id = 'perf-stats';
perfStats.style.cssText = 'position:fixed;bottom:10px;left:10px;color:#00ffcc;font-family:"JetBrains Mono",monospace;font-size:10px;background:rgba(5,10,15,0.9);padding:8px;border:1px solid #00ffcc40;z-index:1001;pointer-events:none;';
document.body.appendChild(perfStats);

let frameCount = 0;
let lastFpsTime = performance.now();
let fps = 0;

const instructions = document.createElement('div');
instructions.id = 'instructions';
instructions.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);color:#888;font-family:monospace;font-size:14px;text-align:center;background:rgba(0,0,0,0.8);padding:15px;border:2px solid #444;pointer-events:none;z-index:1000;';
instructions.innerHTML = 'DRAG TO ORBIT | SCROLL TO NAVIGATE';
document.body.appendChild(instructions);

const toggleBtn = document.createElement('button');
toggleBtn.textContent = '◈ CONTROLS';
toggleBtn.id = 'toggle-btn';
toggleBtn.style.cssText = 'position:fixed;top:40px;right:40px;color:#00ffcc;font-family:monospace;font-size:11px;background:rgba(5,10,15,0.9);padding:8px 12px;border:1px solid #00ffcc;cursor:pointer;z-index:1001;';
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
telemetryTerminal.style.cssText = 'position:fixed;bottom:60px;right:40px;width:320px;height:180px;background:rgba(0,8,0,0.85);border:1px solid #00ffcc40;font-family:"JetBrains Mono",monospace;font-size:10px;color:#5a8a5a;z-index:503;pointer-events:none;overflow:hidden;';
telemetryTerminal.innerHTML = `
    <div style="padding:8px 12px;border-bottom:1px solid #00ffcc30;color:#00ffcc;">[SYSTEM_LOG]</div>
    <div id="telem-output" style="padding:8px 12px;line-height:1.5;height:calc(100% - 30px);overflow:hidden;"></div>
`;
document.body.appendChild(telemetryTerminal);

const telemMessages = [
    'INIT: RENDERER_CORE_ACTIVE',
    'THREE.JS v0.160.0 LOADED',
    'GPU_ACCELERATION: ENABLED',
    'WEBGL_CONTEXT: ACCELERATED',
    'BUFFER_GEOMETRY: OPTIMIZED',
    'VERTEX_SHADER: COMPILED',
    'FRAGMENT_SHADER: COMPILED',
    'UNIFORM_LOCATIONS: CACHED',
    'TEXTURE_UNITS: 16/16',
    'DRAW_CALLS: ' + Math.floor(Math.random() * 100),
    'TRIANGLES: ' + (Math.random() * 50000).toFixed(0),
    'FPS: ' + Math.floor(Math.random() * 30 + 50),
    'FRAME_TIME: ' + (Math.random() * 5 + 10).toFixed(1) + 'ms',
    'MEMORY_USAGE: ' + (Math.random() * 200 + 100).toFixed(0) + 'MB',
    'CACHE_HIT_RATE: ' + Math.floor(Math.random() * 40 + 60) + '%',
    'NOISE_FUNCTIONS: 3 ACTIVE',
    'FBM_OCTAVES: 2',
    'SIMPLEX_3D: INITIALIZED',
    'MARCHING_CUBES: RESOLUTION 60',
    'ISOLATION_THRESHOLD: 0',
    'ISO_SURFACE: COMPUTING...',
    'NORMAL_INTERPOLATION: LERP',
    'CHROMIUM_WAVE: PROPAGATING',
    'ORGANIC_DISPLACE: ACTIVE',
    'VERTEX_DISPLACEMENT: ' + (Math.random() * 0.5 + 0.1).toFixed(3),
    'APERTURE_VALUE: 0.0002',
    'FOCUS_DISTANCE: 10.0',
    'BOKEH_PASS: RENDERING',
    'DEPTH_OF_FIELD: ENABLED',
    'POSTFX_COMPOSER: 3 PASSES',
    'RGB_SHIFT: STANDBY',
    'GLITCH_INTENSITY: ' + (Math.random() * 0.1).toFixed(3),
    'SCROLL_PROGRESS: ' + (Math.random()).toFixed(3),
    'CAMERA_POSITION: [' + (Math.random() * 200 - 100).toFixed(0) + ', ' + (Math.random() * 200 - 100).toFixed(0) + ', ' + (Math.random() * 200 - 100).toFixed(0) + ']',
    'ORBIT_TARGET: [0, 0, 0]',
    'UP_VECTOR: [0, 1, 0]',
    'FOV: 75° | NEAR: 0.1 | FAR: 1000',
    'RESOLUTION: ' + window.innerWidth + 'x' + window.innerHeight,
    'PIXEL_RATIO: ' + Math.min(window.devicePixelRatio, 2),
    'ANTIALIASING: ENABLED',
    'SHADOW_MAP: DISABLED',
    'GAMMA_CORRECTION: ENABLED',
    'TONE_MAPPING: ACESFilmic',
    'EXPOSURE: 1.0',
    'CLEAR_COLOR: #030303',
    'COMPUTE_SHADER: NOT_SUPPORTED',
    'WEBWORKER: ACTIVE',
    'WORKER_THREAD: IDLE',
    'BAKE_STRUCTURE: CACHED',
    'SCROLL_SENSITIVITY: 0.0003',
    'EASE_FUNCTION: CUBIC_INOUT',
    'BEZIER_CTRL_PTS: COMPUTED',
    'GLITCH_COOLDOWN: ' + (Math.random() * 5 + 5).toFixed(1) + 's',
    'TYPEWRITER_SPEED: 0.03',
    'PROGRESS_DOTS: 5 ACTIVE',
    'HUD_OPACITY: 1.0',
    'HUD_Z_INDEX: 504',
    'CORNER_MARKERS: VISIBLE',
    'BLEND_MODE: SCREEN',
    'TELEMETRY_STREAM: LIVE',
    'LOG_INTERVAL: 150ms',
    'RENDER_PIPELINE: STANDARD',
    'VSYNC: ENABLED',
    'ADAPTIVE_VSYNC: ACTIVE',
    'ERROR_CHECK: DISABLED',
    'DEBUG_MODE: FALSE',
    'PRODUCTION_BUILD: TRUE',
    'HUGO_VERSION: 0.152.2',
    'THEME: BREWM',
    'CDN_DELIVERY: NETLIFY',
    'GIT_BRANCH: MAIN',
    'LAST_COMMIT: ' + new Date().toISOString().split('T')[0]
];

const telemOutput = document.getElementById('telem-output');
let telemLines = [];
let telemTimer = 0;

function updateTelemetryTerminal(deltaTime) {
    telemTimer += deltaTime;
    if (telemTimer > 0.15) {
        telemTimer = 0;
        
        const templates = [
            () => `FPS: ${Math.floor(Math.random() * 30 + 50)} | FRAME: ${(Math.random() * 5 + 10).toFixed(1)}ms`,
            () => `MEM: ${(Math.random() * 200 + 100).toFixed(0)}MB | CACHE: ${Math.floor(Math.random() * 40 + 60)}%`,
            () => `TRIANGLES: ${Math.floor(Math.random() * 50000)} | CALLS: ${Math.floor(Math.random() * 100)}`,
            () => `CAM: [${Math.floor(Math.random() * 200 - 100)}, ${Math.floor(Math.random() * 200 - 100)}, ${Math.floor(Math.random() * 200 - 100)}]`,
            () => `ORGANIC: ${(Math.random() * 0.5).toFixed(3)} | CHROME: ${(Math.random() * 360).toFixed(1)}°`,
            () => `GLITCH: ${(Math.random() * 0.1).toFixed(3)} | ISO: COMPUTING`,
            () => `SCROLL: ${(Math.random()).toFixed(3)} | SENS: 0.0003`,
            () => `DOF: ENABLED | BOKEH: ${Math.floor(Math.random() * 100)}%`,
            () => `TEXTURES: ${Math.floor(Math.random() * 16)}/16 UNITS`,
            () => `GPU: ${Math.floor(Math.random() * 40 + 60)}% LOAD`,
            () => `DELTA_TIME: ${(Math.random() * 0.02 + 0.016).toFixed(4)}s`,
            () => `ELAPSED: ${Math.floor(Math.random() * 1000)}s`,
            () => `WAYPOINTS: 10 | SECTIONS: 5+10`,
            () => `PROGRESS_DOT: ${Math.floor(Math.random() * 5 + 1)}/5`,
            () => `BLEND_MODE: SCREEN | Z_LAYER: 499`,
            () => `WORKER: ACTIVE | BAKING: IDLE`,
            () => `NOISE_AMP: ${(Math.random() * 2).toFixed(2)} | FREQ: ${(Math.random() * 10).toFixed(1)}`,
            () => `VERTEX_COUNT: ${Math.floor(Math.random() * 10000)}`,
            () => `SCREEN: ${window.innerWidth}x${window.innerHeight}`,
            () => `PIXEL_RATIO: ${Math.min(window.devicePixelRatio, 2)}`,
            () => `VSYNC: ON | FRUSTUM: [0.1, 1000]`,
            () => `THREE_VER: 0.160.0 | HUGO: 0.152.2`,
            () => `DEBUG: FALSE | PROD: TRUE`
        ];
        
        const msg = templates[Math.floor(Math.random() * templates.length)]();
        telemLines.push({ text: '> ' + msg, time: Date.now() });
        
        if (telemLines.length > 10) {
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
hudTelemetry.style.cssText = 'position:fixed;bottom:60px;left:40px;z-index:504;pointer-events:none;max-width:400px;';
hudTelemetry.innerHTML = `
    <div id="telem-title" style="color:#888;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1px;margin-bottom:6px;opacity:0.6;"></div>
    <div id="telem-description" style="color:#4a7a4a;font-family:'JetBrains Mono',monospace;font-size:9px;line-height:1.5;margin-bottom:10px;max-width:350px;"></div>
    <div id="telem-bars" style="display:flex;flex-direction:column;gap:4px;"></div>
`;
document.body.appendChild(hudTelemetry);

function activateSection(techIdx, legacyIdx) {
    if (legacyIdx === undefined || legacyIdx === null) {
        console.warn('[ACTIVATE] Invalid legacyIdx:', legacyIdx);
        legacyIdx = 0;
    }
    
    console.log('[ACTIVATE] tech:', techIdx, '| legacy:', legacyIdx, '-', sections[legacyIdx]?.title);
    
    const tech = techSections[techIdx];
    const section = sections[legacyIdx];
    
    if (!section) {
        console.warn('[ACTIVATE] Section not found for legacyIdx:', legacyIdx);
        return;
    }
    
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
                    <div class="telem-fill-${techIdx}-${j}" style="position:absolute;top:0;left:0;height:100%;width:0%;background:#00ffcc;transition:width 1s ease;"></div>
                </div>
                <span class="telem-value-${techIdx}-${j}" style="color:#888;min-width:50px;text-align:right;">0.000</span>
            `;
            telemBars.appendChild(barContainer);
        });
    }
    
    Object.keys(typewriterState).forEach(key => {
        typewriterState[key].active = false;
        typewriterState[key].currentChar = 0;
        const textEl = document.getElementById(`typewriter-text-${key}`);
        if (textEl) textEl.textContent = '';
        
        if (sections[key] && sections[key].telemetry) {
            sections[key].telemetry.forEach((_, j) => {
                const fill = document.querySelector(`.sec-telem-fill-${key}-${j}`);
                const val = document.querySelector(`.sec-telem-val-${key}-${j}`);
                if (fill) fill.style.width = '0%';
                if (val) val.textContent = '0.000';
            });
        }
    });
    
    if (typewriterState[legacyIdx]) {
        typewriterState[legacyIdx].active = true;
    }
    
    sections.forEach((_, i) => {
        const sectionDiv = document.getElementById(`section-${i}`);
        if (sectionDiv) {
            sectionDiv.style.opacity = i === legacyIdx ? '1' : '0';
            sectionDiv.style.transform = i === legacyIdx ? 'translateY(0)' : 'translateY(20px)';
        }
    });
    
    document.querySelectorAll('[id^="progress-dot-"]').forEach((el, i) => {
        el.style.opacity = i === legacyIdx ? '1' : '0.3';
        el.style.background = i === legacyIdx ? '#00ffcc' : 'transparent';
    });
    
    currentSection = techIdx;
    
    cubeCameraDirty = true;
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
    
    const techIndex = Math.min(Math.floor(scrollProgress * 10), 9);
    const legacyIndex = techIndex % 5;
    
    console.log(`[SCROLL] progress: ${scrollProgress.toFixed(3)} | tech: ${techIndex} | legacy: ${legacyIndex}`);
    
    if (techIndex !== currentSection) {
        console.log('[CHANGE] Activating tech', techIndex, '| legacy', legacyIndex, '-', sections[legacyIndex]?.title);
        activateSection(techIndex, legacyIndex);
    }
    
    glitchIntensity = Math.min(Math.abs(deltaY) * 0.005, 1.0);
    updateTelemetry(techIndex, scrollProgress);
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
    
    mirrorCube.visible = false;
    cubeCamera.update(renderer, scene);
    mirrorCube.visible = true;
    
    console.log('[INIT] CubeCamera rendered once on load');
    
    setTimeout(spawnFortuitousRect, 2000);
});

clock.start();

console.log('[INIT] Total sections:', sections.length);
console.log('[INIT] Total waypoints:', waypoints.length);
sections.forEach((s, i) => console.log(`[INIT] Section ${i}: ${s.title}`));

activateSection(0);

let autoModeActiveScrolly = false;
const scrollyAutoBtn = document.createElement('button');
scrollyAutoBtn.textContent = '> AUTO NAV';
scrollyAutoBtn.style.cssText = 'position:fixed;top:70px;right:40px;color:#cccc00;font-family:monospace;font-size:10px;background:rgba(5,10,15,0.9);padding:6px 10px;border:1px solid #cccc00;cursor:pointer;z-index:1001;';
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

let cubeCameraDirty = false;

function updateCubeCamera() {
    if (mirrorCube.visible) {
        mirrorCube.visible = false;
        cubeCamera.update(renderer, scene);
        mirrorCube.visible = true;
        cubeCameraDirty = false;
        console.log('[CUBE] Updated');
    }
}

function animate() {
    requestAnimationFrame(animate);
    
    const time = clock.getElapsedTime();
    semMaterial.uniforms.uTime.value = time;
    glitchPass.uniforms.uTime.value = time;
    glitchPass.uniforms.uIntensity.value = glitchIntensity;
    updateDripParticles(0.016, time);
    
    camera.position.lerp(targetCameraPos, 0.03);
    camera.lookAt(0, 0, 0);
    
    if (camera.position.distanceTo(targetCameraPos) < 1.0 && cubeCameraDirty) {
        updateCubeCamera();
    }
    
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
    updateSectionTelemetry(currentSection % 5);
    updateFortuitousRect(0.016);
    
    if (glitchIntensity > 0.01) {
        glitchIntensity *= 0.95;
    }
    
    if (orbitControls.enabled) {
        orbitControls.update();
    }
    
    composer.render();
    
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastFpsTime = now;
        const mem = performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(1) : 'N/A';
        perfStats.textContent = `FPS: ${fps} | MEM: ${mem}MB | DRAWS: ${renderer.info.render.calls}`;
    }
}

const orbitControlsBtn = document.createElement('button');
orbitControlsBtn.textContent = '○ ORBIT';
orbitControlsBtn.style.cssText = 'position:fixed;top:100px;right:40px;color:#888;font-family:monospace;font-size:10px;background:rgba(5,10,15,0.9);padding:6px 10px;border:1px solid #444;cursor:pointer;z-index:1001;';
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

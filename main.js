import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// --- CONFIGURATION ---
const R = 16000;            
const CAMERA_OFFSET = 0;    
const IMAGE_SIZE = 1200;    
const CENTER_IMAGE_SIZE = 3000;
const TOTAL_IMAGES = 54;

// Настройки полета и визуала (для тестирования)
const FLIGHT_CONFIG = {
    baseHeight: 1000,         // Изначальное расстояние до картинок (высота)
    heightMultiplier: 1.2,    // Во сколько раз поднимаемся в середине полета
    distanceMultiplier: 1.0,  // Множитель радиуса (1.0 = строго по кругу)
    breathingAmp: 8,          // Амплитуда дыхания
    breathingSpeed: 0.8,      // Скорость дыхания
    blackThreshold: 0.05      // Порог отсечения черного (0.0 - 1.0)
};

// Timestamps for each image (seconds)
const TIMESTAMPS = [
    0.0, 10.0, 20.0, 33.0, 47.0, 71.0, 94.0, 120.0, 160.0, 206.0,
    232.0, 265.0, 309.0, 377.0, 415.0, 475.0, 507.0, 548.0, 590.0, 651.0,
    697.0, 760.0, 808.0, 851.0, 912.0, 960.0, 1006.0, 1060.0, 1107.0, 1160.0,
    1207.0, 1250.0, 1314.0, 1366.0, 1421.0, 1486.0, 1540.0, 1607.0, 1660.0, 1720.0,
    1780.0, 1851.0, 1920.0, 1988.0, 2050.0, 2120.0, 2190.0, 2260.0, 2320.0, 2400.0,
    2460.0, 2520.0, 2580.0, 2640.0
];

// --- SHADERS ---
const VERT_SHADER = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG_SHADER = `
precision highp float;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uSeed;
uniform float uIntensity;
uniform float uBlackThreshold;

varying vec2 vUv;

float hash(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash(i), hash(i + vec2(1,0)), f.x),
        mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x),
        f.y
    );
}

float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for(int i = 0; i < 4; i++) {
        v += amp * noise(p);
        p *= 2.1;
        amp *= 0.5;
    }
    return v;
}

void main() {
    vec2 center = vUv - 0.5;
    float dist = length(center);
    
    // Эффект дымки на краях
    float t = uTime * 0.6 + uSeed * 25.0; 
    
    // Несколько слоев шума для "дымчатости"
    vec2 noiseUv1 = vUv * 3.0 + vec2(t * 0.15, t * 0.1);
    vec2 noiseUv2 = vUv * 6.0 - vec2(t * 0.1, t * 0.2);
    float n = (fbm(noiseUv1) + fbm(noiseUv2) * 0.5) / 1.5;
    
    // Создаем рваную маску края
    // Начинаем размытие чуть дальше от центра
    float edgeMask = smoothstep(0.5, 0.3, dist + n * 0.25); 
    
    // Дополнительный эффект "плавающих" мазков
    float angle = atan(center.y, center.x);
    float wave = sin(angle * 5.0 + t) * 0.05;
    float finalAlpha = smoothstep(0.5, 0.2, dist + n * 0.3 + wave);
    
    finalAlpha = clamp(finalAlpha, 0.0, 1.0);
    finalAlpha *= uIntensity;
    
    vec4 texColor = texture2D(uTexture, vUv);
    
    // Мягкое отсечение черного фона (не такое резкое)
    float luminance = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
    float lumMask = smoothstep(uBlackThreshold, uBlackThreshold + 0.1, luminance);
    
    // Итоговая прозрачность — пересечение маски края и маски яркости
    float alpha = texColor.a * finalAlpha * lumMask;
    
    gl_FragColor = vec4(texColor.rgb, alpha);
}
`;

// --- GLOBALS ---
let scene, camera, renderer, labelRenderer, composer, controls;
let imagePlanes = [];
let centerPlane, finalPlane; // img_0 and img_55
let starField;
let arcLabels = [];
let audio;
let currentImageIndex = 0;
let isFinalSequence = false;
let isFreeCamera = true; // Включаем свободную камеру по умолчанию для осмотра
let textures = [];

// Base camera position for breathing
let camBasePos = new THREE.Vector3();

// --- INITIALIZATION ---
async function init() {
    console.log("Initializing Three.js scene...");
    try {
        // 1. Scene Setup
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000); // Возвращаем абсолютно черный

        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 10, 30000);
        
        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        document.getElementById('canvas-container').appendChild(renderer.domElement);

        // Controls
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.screenSpacePanning = false;
        controls.minDistance = 100;
        controls.maxDistance = 20000;
        controls.enabled = isFreeCamera;

        labelRenderer = new CSS2DRenderer();
        labelRenderer.setSize(window.innerWidth, window.innerHeight);
        labelRenderer.domElement.style.position = 'absolute';
        labelRenderer.domElement.style.top = '0';
        labelRenderer.domElement.style.pointerEvents = 'none';
        document.body.appendChild(labelRenderer.domElement);

        // Post-processing
        const renderScene = new RenderPass(scene, camera);
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.15, // Сильно уменьшен эффект свечения (было 0.6)
            0.1,  // Радиус
            0.9   // Порог (светиться будет только самое яркое)
        );
        composer = new EffectComposer(renderer);
        composer.addPass(renderScene);
        composer.addPass(bloomPass);

        // 2. Preload Textures
        await preloadTextures();
        console.log("Textures loaded");

        // 3. Create Objects
        createImageCircle();
        createCenterImages();
        createStarField();
        createArcLabels();
        console.log("Objects created");

        // 4. Initial Camera Position
        setCameraToImage(0);
        updateVisibility(0);
        
        renderer.render(scene, camera);
        composer.render();

        // 5. Event Listeners
        window.addEventListener('resize', onWindowResize);
        document.getElementById('start-screen').addEventListener('click', startExperience, { once: true });
        
        // 6. Audio Setup
        setupAudio();

        // 7. Start Loop
        animate();

        document.getElementById('loader').textContent = 'готово';
        console.log("Initialization complete");
    } catch (error) {
        console.error("Initialization failed:", error);
        document.getElementById('loader').textContent = 'ошибка загрузки. проверьте консоль.';
    }
}

async function preloadTextures() {
    const loader = new THREE.TextureLoader();
    const promises = [];
    const loaderDiv = document.getElementById('loader');
    let loadedCount = 0;
    
    // img_0 to img_55
    for (let i = 0; i <= 55; i++) {
        const name = i === 0 ? 'img_0' : `img_${String(i).padStart(2, '0')}`;
        promises.push(
            new Promise(resolve => {
                loader.load(`./assets/images/${name}.png`, tex => {
                    tex.generateMipmaps = true;
                    tex.minFilter = THREE.LinearMipmapLinearFilter;
                    textures[i] = tex;
                    loadedCount++;
                    loaderDiv.textContent = `загрузка ресурсов: ${Math.round((loadedCount / 56) * 100)}%`;
                    resolve();
                }, undefined, () => {
                    console.warn(`Failed to load ${name}.png`);
                    loadedCount++;
                    resolve();
                });
            })
        );
    }
    await Promise.all(promises);
}

function createImageCircle() {
    const geometry = new THREE.PlaneGeometry(IMAGE_SIZE, IMAGE_SIZE);

    for (let i = 0; i < TOTAL_IMAGES; i++) {
        const angle = (i / TOTAL_IMAGES) * Math.PI * 2 - Math.PI / 2; // Смещение на полночь
        const x = Math.cos(angle) * R;
        const z = Math.sin(angle) * R;

        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: textures[i + 1] || null },
                uTime: { value: 0 },
                uSeed: { value: Math.random() * 100 },
                uIntensity: { value: 1.0 },
                uBlackThreshold: { value: FLIGHT_CONFIG.blackThreshold }
            },
            vertexShader: VERT_SHADER,
            fragmentShader: FRAG_SHADER,
            transparent: true,
            depthWrite: false, // Исправляет артефакты наложения
            side: THREE.DoubleSide
        });

        const plane = new THREE.Mesh(geometry, material);
        plane.position.set(x, 0, z);
        plane.rotation.x = -Math.PI / 2; // Лежат плашмя
        
        scene.add(plane);
        imagePlanes.push(plane);
    }
    updateVisibility(0);
}

function createCenterImages() {
    // img_0.png (Center)
    const centerGeo = new THREE.PlaneGeometry(CENTER_IMAGE_SIZE, CENTER_IMAGE_SIZE);
    const centerMat = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { value: textures[0] || null },
            uTime: { value: 0 },
            uSeed: { value: Math.random() * 100 },
            uIntensity: { value: 0.0 },
            uBlackThreshold: { value: FLIGHT_CONFIG.blackThreshold }
        },
        vertexShader: VERT_SHADER,
        fragmentShader: FRAG_SHADER,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    centerPlane = new THREE.Mesh(centerGeo, centerMat);
    centerPlane.position.set(0, 0, 0);
    centerPlane.rotation.x = -Math.PI / 2;
    scene.add(centerPlane);

    // img_55.png (Overlay for img_54)
    const finalGeo = new THREE.PlaneGeometry(IMAGE_SIZE, IMAGE_SIZE);
    const finalMat = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { value: textures[55] || null },
            uTime: { value: 0 },
            uSeed: { value: Math.random() * 100 },
            uIntensity: { value: 0.0 },
            uBlackThreshold: { value: FLIGHT_CONFIG.blackThreshold }
        },
        vertexShader: VERT_SHADER,
        fragmentShader: FRAG_SHADER,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    finalPlane = new THREE.Mesh(finalGeo, finalMat);
    finalPlane.rotation.x = -Math.PI / 2;
    scene.add(finalPlane);
}

function createStarField() {
    const count = 2000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    
    for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        const r = 4000 + Math.random() * 4000;
        
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 2,
        transparent: true,
        opacity: 0
    });
    
    starField = new THREE.Points(geometry, material);
    scene.add(starField);
}

function createArcLabels() {
    const labels = [
        "ARC I — ДЕТСТВО И ПЕРВЫЕ ВОПРОСЫ",
        "ARC II — ВЗРОСЛЕНИЕ И ТЕСТИРОВАНИЕ",
        "ARC III — МИР ЛЮДЕЙ И ДИСТАНЦИЯ",
        "ARC IV — ПОТЕРИ И НАБЛЮДЕНИЕ",
        "ARC V — ОСОЗНАНИЕ И СОЗДАНИЕ",
        "ARC VI — ВЕЧНОЕ ВОЗВРАЩЕНИЕ"
    ];
    
    const labelRadius = 3200;
    
    labels.forEach((text, i) => {
        const angle = (i / labels.length) * Math.PI * 2;
        const div = document.createElement('div');
        div.textContent = text;
        div.style.cssText = `
            color: rgba(255,255,255,0.6);
            font-family: 'Courier New', monospace;
            font-size: 11px;
            letter-spacing: 3px;
            text-transform: uppercase;
            white-space: nowrap;
            opacity: 0;
            transition: opacity 1s;
        `;
        const label = new CSS2DObject(div);
        label.position.set(
            Math.cos(angle) * labelRadius,
            0,
            Math.sin(angle) * labelRadius
        );
        scene.add(label);
        arcLabels.push(div);
    });
}

// --- LOGIC ---

function setupAudio() {
    audio = new Audio('./assets/audio/narration.mp3');
    audio.preload = 'auto';
    audio.addEventListener('timeupdate', onAudioTimeUpdate);
}

function startExperience() {
    document.getElementById('start-screen').style.opacity = '0';
    setTimeout(() => document.getElementById('start-screen').remove(), 1000);
    
    // Показываем подсказку по камере
    document.getElementById('camera-hint').style.display = 'block';
    
    // При старте принудительно включаем кинематографический режим
    isFreeCamera = false;
    controls.enabled = false;
    setCameraToImage(0);
    updateVisibility(0);
    
    console.log("Starting cinematic experience. Press 'C' to toggle free camera.");
    
    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'c') {
            isFreeCamera = !isFreeCamera;
            controls.enabled = isFreeCamera;
            
            const hint = document.getElementById('camera-hint');
            if (isFreeCamera) {
                hint.textContent = "Клавиша 'C' — режим притчи";
                hint.style.color = "rgba(255, 100, 100, 0.5)";
            } else {
                hint.textContent = "Клавиша 'C' — свободная камера";
                hint.style.color = "rgba(255, 255, 255, 0.3)";
                // Возвращаем камеру на позицию текущей картинки
                setCameraToImage(currentImageIndex);
                updateVisibility(currentImageIndex);
            }
            console.log("Camera mode:", isFreeCamera ? "FREE" : "CINEMATIC");
        }
        
        // Переключение таймингов стрелками
        if (!isFreeCamera) {
            if (e.key === 'ArrowRight') {
                if (currentImageIndex < TOTAL_IMAGES - 1) {
                    currentImageIndex++;
                    audio.currentTime = TIMESTAMPS[currentImageIndex];
                    jumpToImage(currentImageIndex);
                }
            }
            if (e.key === 'ArrowLeft') {
                if (currentImageIndex > 0) {
                    currentImageIndex--;
                    audio.currentTime = TIMESTAMPS[currentImageIndex];
                    jumpToImage(currentImageIndex);
                }
            }
        }
    });

    audio.play().catch(err => {
        console.error("Audio playback failed. Please ensure assets/audio/narration.mp3 exists.", err);
        // Fallback: start a manual timer if audio fails
        let currentTime = 0;
        setInterval(() => {
            currentTime += 0.1;
            onAudioTimeUpdate({ target: { currentTime } });
        }, 100);
    });
}

function onAudioTimeUpdate(e) {
    if (isFinalSequence || isFreeCamera) return;
    
    const t = e.target ? e.target.currentTime : audio.currentTime;
    
    for (let i = TIMESTAMPS.length - 1; i >= 0; i--) {
        if (t >= TIMESTAMPS[i]) {
            if (i !== currentImageIndex) {
                currentImageIndex = i;
                
                if (i < TOTAL_IMAGES - 1) {
                    const segmentDuration = TIMESTAMPS[i + 1] - TIMESTAMPS[i];
                    transitionToImage(i, segmentDuration * 0.85);
                } else {
                    startFinalSequence();
                }
                updateVisibility(i);
            }
            break;
        }
    }
}

function setCameraToImage(index) {
    const angle = (index / TOTAL_IMAGES) * Math.PI * 2 - Math.PI / 2;
    const dist = (R - CAMERA_OFFSET) * FLIGHT_CONFIG.distanceMultiplier;
    camBasePos.set(
        Math.cos(angle) * dist,
        FLIGHT_CONFIG.baseHeight,
        Math.sin(angle) * dist
    );
    camera.position.copy(camBasePos);
    
    // Фиксируем взгляд строго вниз, НО БЕЗ ВРАЩЕНИЯ Z
    // Чтобы картинки не наклонялись, камера должна иметь постоянную ориентацию осей
    camera.rotation.set(-Math.PI / 2, 0, 0); 
}

function jumpToImage(index) {
    gsap.killTweensOf(camBasePos); // Остановить текущие анимации
    setCameraToImage(index);
    updateVisibility(index);
}

function transitionToImage(targetIndex, duration) {
    // Текущий угол камеры
    const currentAngle = Math.atan2(camBasePos.z, camBasePos.x);
    // Целевой угол
    let targetAngle = (targetIndex / TOTAL_IMAGES) * Math.PI * 2 - Math.PI / 2;
    
    // Кратчайший путь
    while (targetAngle - currentAngle > Math.PI) targetAngle -= Math.PI * 2;
    while (targetAngle - currentAngle < -Math.PI) targetAngle += Math.PI * 2;

    const animObj = { 
        angle: currentAngle, 
        height: FLIGHT_CONFIG.baseHeight,
        distScale: FLIGHT_CONFIG.distanceMultiplier
    };
    
    const tl = gsap.timeline();
    
    // Движение строго по дуге над окружностью
    tl.to(animObj, {
        angle: targetAngle,
        height: FLIGHT_CONFIG.baseHeight * FLIGHT_CONFIG.heightMultiplier, 
        duration: duration * 0.5,
        ease: "power2.inOut",
        onUpdate: () => {
            updateCameraFromAnim(animObj);
        }
    });
    
    tl.to(animObj, {
        height: FLIGHT_CONFIG.baseHeight,
        duration: duration * 0.5,
        ease: "power2.inOut",
        onUpdate: () => {
            updateCameraFromAnim(animObj);
        }
    });
}

function updateCameraFromAnim(animObj) {
    const dist = (R - CAMERA_OFFSET) * animObj.distScale;
    camBasePos.x = Math.cos(animObj.angle) * dist;
    camBasePos.y = animObj.height;
    camBasePos.z = Math.sin(animObj.angle) * dist;
    
    camera.position.copy(camBasePos);
    // Камера всегда смотрит вертикально вниз, без вращения вокруг Z
    camera.rotation.set(-Math.PI / 2, 0, 0);
}

function updateVisibility(currentIndex) {
    if (isFreeCamera) {
        imagePlanes.forEach(plane => plane.visible = true);
        return;
    }
    imagePlanes.forEach((plane, i) => {
        const dist = Math.min(
            Math.abs(i - currentIndex),
            TOTAL_IMAGES - Math.abs(i - currentIndex)
        );
        plane.visible = dist <= 4;
    });
}

function startFinalSequence() {
    isFinalSequence = true;
    
    const img54 = imagePlanes[53];
    finalPlane.position.copy(img54.position);
    finalPlane.rotation.copy(img54.rotation);
    
    const tl = gsap.timeline();
    
    // 7.1 Phase A: img_55 reveal
    tl.to(img54.material.uniforms.uIntensity, { value: 0.0, duration: 4 });
    tl.to(finalPlane.material.uniforms.uIntensity, { value: 1.0, duration: 4 }, "<");
    
    tl.addPause("+=2");
    
    // 7.2 & 7.3 Phase B & C: Dolly Zoom + Center Image + Stars
    tl.add(() => {
        // Dolly Zoom
        gsap.to(camera.position, {
            x: 0, y: 0, z: 600,
            duration: 8,
            ease: "power2.inOut",
            onUpdate: () => camera.lookAt(0, 0, 0)
        });
        gsap.to(camera, {
            fov: 90,
            duration: 8,
            ease: "power2.inOut",
            onUpdate: () => camera.updateProjectionMatrix()
        });
        
        // Center Image Fade In
        gsap.to(centerPlane.material.uniforms.uIntensity, { value: 1.0, duration: 4, delay: 2 });
        
        // StarField Fade In
        gsap.to(starField.material, { opacity: 1, duration: 5 });
        
        // Arc Labels
        arcLabels.forEach((div, i) => {
            gsap.to(div, { opacity: 0.6, duration: 1, delay: 3 + i * 0.5 });
        });
    });

    // 7.4 Phase D: Red Dot & Fade to Black
    tl.add(() => {
        // img_0 fade out
        gsap.to(centerPlane.material.uniforms.uIntensity, { value: 0, duration: 2, delay: 10 });
        
        // Stars movement
        gsap.to(starField.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 10, delay: 10 });
        
        // Labels fade out
        arcLabels.forEach(div => gsap.to(div, { opacity: 0, duration: 1, delay: 10 }));
        
        // Red Dot
        const dotGeo = new THREE.SphereGeometry(2, 32, 32);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0xCC2200, transparent: true, opacity: 0 });
        const redDot = new THREE.Mesh(dotGeo, dotMat);
        scene.add(redDot);
        
        gsap.to(redDot.scale, { x: 20, y: 20, z: 20, duration: 2, delay: 12 });
        gsap.to(redDot.material, { opacity: 1, duration: 2, delay: 12 });
        
        // Flicker
        gsap.to(redDot.material, {
            opacity: 0.3,
            duration: 0.4,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut",
            delay: 14
        });
        
        // Camera slow move to dot
        gsap.to(camera.position, { z: 50, duration: 15, delay: 12, ease: "none" });
        
        // Final fade to black
        gsap.to("#fade-overlay", { opacity: 1, duration: 2, delay: 25 });
    }, "+=8");
}

function animate(time) {
    requestAnimationFrame(animate);
    const t = time * 0.001;
    
    // Update Shaders
    imagePlanes.forEach(p => {
        if (p.visible) p.material.uniforms.uTime.value = t;
    });
    centerPlane.material.uniforms.uTime.value = t;
    finalPlane.material.uniforms.uTime.value = t;
    
    // Controls
    if (isFreeCamera) {
        controls.update();
    } else if (!isFinalSequence) {
        // Breathing
        camera.position.y = camBasePos.y + Math.sin(t * FLIGHT_CONFIG.breathingSpeed) * FLIGHT_CONFIG.breathingAmp;
        camera.position.x = camBasePos.x + Math.sin(t * FLIGHT_CONFIG.breathingSpeed * 0.6) * 5;
        camera.position.z = camBasePos.z + Math.cos(t * FLIGHT_CONFIG.breathingSpeed * 0.6) * 5;
    }
    
    composer.render();
    labelRenderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

init();

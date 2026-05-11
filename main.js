import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// --- CONFIGURATION ---
const R = 6000;             // Еще больше радиус для простора
const CAMERA_OFFSET = 1800; // Камера дальше от картинки к центру
const CAMERA_HEIGHT = 1000; // Камера высоко сверху
const IMAGE_SIZE = 1200;    // Картинки большие
const CENTER_IMAGE_SIZE = 2500;
const TOTAL_IMAGES = 54;

// Timestamps for each image (seconds)
const TIMESTAMPS = [
    0.0, 10.0, 20.0, 33.0, 47.0, 71.0, 94.0, 120.0, 160.0, 206.0,
    232.0, 265.0, 309.0, 377.0, 415.0, 475.0, 507.0, 548.0, 590.0, 651.0,
    697.0, 760.0, 808.0, 851.0, 912.0, 960.0, 1006.0, 1060.0, 1107.0, 1160.0,
    1207.0, 1250.0, 1314.0, 1366.0, 1421.0, 1486.0, 1540.0, 1607.0, 1660.0, 1720.0,
    1780.0, 1851.0, 1920.0, 1988.0, 2050.0, 2120.0, 2190.0, 2260.0, 2320.0, 2400.0,
    2460.0, 2520.0, 2580.0, 2640.0
];

// --- GLOBALS ---
let scene, camera, renderer, labelRenderer, composer;
let imagePlanes = [];
let centerPlane, finalPlane; // img_0 and img_55
let starField;
let arcLabels = [];
let audio;
let currentImageIndex = 0;
let isFinalSequence = false;
let shaders = { vert: '', frag: '' };
let textures = [];

// --- INITIALIZATION ---
async function init() {
    console.log("Initializing Three.js scene...");
    try {
        // 1. Load Shaders
        const [vertRes, fragRes] = await Promise.all([
            fetch('./shaders/edge.vert.glsl'),
            fetch('./shaders/edge.frag.glsl')
        ]);
        
        if (!vertRes.ok || !fragRes.ok) throw new Error("Failed to load shaders");
        
        shaders.vert = await vertRes.text();
        shaders.frag = await fragRes.text();
        console.log("Shaders loaded");

        // 2. Scene Setup
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x050505); // Не совсем черный, чтобы видеть границы

        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 10, 30000);
        
        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        document.getElementById('canvas-container').appendChild(renderer.domElement);

        // Вспомогательная сетка (можно убрать потом)
        // const grid = new THREE.GridHelper(R * 2, 50, 0x333333, 0x111111);
        // scene.add(grid);

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
            0.6, 0.4, 0.1
        );
        composer = new EffectComposer(renderer);
        composer.addPass(renderScene);
        composer.addPass(bloomPass);

        // 3. Preload Textures
        await preloadTextures();
        console.log("Textures loaded");

        // 4. Create Objects
        createImageCircle();
        createCenterImages();
        createStarField();
        createArcLabels();
        console.log("Objects created");

        // 5. Initial Camera Position
        setCameraToImage(0);
        updateVisibility(0);
        
        // Рендерим первый кадр сразу
        renderer.render(scene, camera);
        composer.render();

        // 8. Event Listeners
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
        const angle = (i / TOTAL_IMAGES) * Math.PI * 2;
        const x = Math.cos(angle) * R;
        const z = Math.sin(angle) * R;

        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: textures[i + 1] || null },
                uTime: { value: 0 },
                uSeed: { value: Math.random() * 100 },
                uIntensity: { value: 1.0 }
            },
            vertexShader: shaders.vert,
            fragmentShader: shaders.frag,
            transparent: true,
            depthWrite: false, // Исправляет артефакты наложения
            side: THREE.FrontSide
        });

        const plane = new THREE.Mesh(geometry, material);
        plane.position.set(x, 0, z);
        plane.lookAt(0, 0, 0);
        
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
            uIntensity: { value: 0.0 }
        },
        vertexShader: shaders.vert,
        fragmentShader: shaders.frag,
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide
    });
    centerPlane = new THREE.Mesh(centerGeo, centerMat);
    centerPlane.position.set(0, 0, 0);
    scene.add(centerPlane);

    // img_55.png (Overlay for img_54)
    const finalGeo = new THREE.PlaneGeometry(IMAGE_SIZE, IMAGE_SIZE);
    const finalMat = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { value: textures[55] || null },
            uTime: { value: 0 },
            uSeed: { value: Math.random() * 100 },
            uIntensity: { value: 0.0 }
        },
        vertexShader: shaders.vert,
        fragmentShader: shaders.frag,
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide
    });
    finalPlane = new THREE.Mesh(finalGeo, finalMat);
    // Position will be set when needed (at img_54's position)
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
    if (isFinalSequence) return;
    
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
    const angle = (index / TOTAL_IMAGES) * Math.PI * 2;
    const dist = R - CAMERA_OFFSET;
    camera.position.set(
        Math.cos(angle) * dist,
        CAMERA_HEIGHT, // Поднимаем камеру
        Math.sin(angle) * dist
    );
    camera.lookAt(imagePlanes[index].position);
}

function transitionToImage(targetIndex, duration) {
    const targetPlane = imagePlanes[targetIndex];
    
    // Текущий угол камеры
    const currentAngle = Math.atan2(camera.position.z, camera.position.x);
    // Целевой угол
    let targetAngle = (targetIndex / TOTAL_IMAGES) * Math.PI * 2;
    
    // Выбираем кратчайший путь по кругу
    while (targetAngle - currentAngle > Math.PI) targetAngle -= Math.PI * 2;
    while (targetAngle - currentAngle < -Math.PI) targetAngle += Math.PI * 2;

    const animObj = { 
        angle: currentAngle, 
        distance: R - CAMERA_OFFSET, 
        height: CAMERA_HEIGHT 
    };
    
    const tl = gsap.timeline();
    
    // Единое движение: полет по дуге с набором высоты и отдалением в середине
    tl.to(animObj, {
        angle: targetAngle,
        distance: (R - CAMERA_OFFSET) * 1.5, // Отдаляемся к центру
        height: CAMERA_HEIGHT * 2,           // Взлетаем выше
        duration: duration * 0.5,
        ease: "power2.in",
        onUpdate: () => {
            camera.position.x = Math.cos(animObj.angle) * animObj.distance;
            camera.position.y = animObj.height;
            camera.position.z = Math.sin(animObj.angle) * animObj.distance;
            camera.lookAt(targetPlane.position);
        }
    });
    
    tl.to(animObj, {
        distance: R - CAMERA_OFFSET,
        height: CAMERA_HEIGHT,
        duration: duration * 0.5,
        ease: "power2.out",
        onUpdate: () => {
            camera.position.x = Math.cos(animObj.angle) * animObj.distance;
            camera.position.y = animObj.height;
            camera.position.z = Math.sin(animObj.angle) * animObj.distance;
            camera.lookAt(targetPlane.position);
        }
    });
}

function updateVisibility(currentIndex) {
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
    
    // Breathing
    if (!isFinalSequence) {
        const breathe = Math.sin(t * 0.8) * 8;
        camera.position.y += breathe * 0.016;
        camera.position.x += Math.sin(t * 0.5) * 0.01;
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

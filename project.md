# ТЗ: Веб-страница «Притча о мальчике»
## Кинематографическое путешествие по кругу — Техническое задание для разработчика / AI-агента

---

## 1. ОБЩЕЕ ОПИСАНИЕ

Одностраничное веб-приложение. Полноэкранный canvas. Пользователь открывает страницу — начинается автоматическое воспроизведение аудио и анимации без каких-либо UI-элементов (кроме возможно кнопки «начать» для автоплея в браузере).

**Ощущение:** кинематографическая камера плавно движется в тёмном космосе между иллюстрациями, выстроенными в большой круг. Камера не телепортируется — она всегда в движении, замедляясь у каждой картинки.

---

## 2. ТЕХНИЧЕСКИЙ СТЕК

```
- Рендеринг:     Three.js (r158+) — WebGL renderer, PerspectiveCamera
- Анимации:      GSAP 3 (gsap + ScrollTrigger не нужен, только core + timeline)
- Шейдеры:       GLSL fragment shaders для edge-эффекта на каждом изображении
- Аудио:         Web Audio API (HTMLAudioElement), синхронизация по currentTime
- Формат:        Один HTML файл + папка /assets/images/ (img_01.png ... img_55.png + img_0.png)
- Сборка:        Без сборщика, чистый vanilla JS + CDN импорты (или npm если нужно)
```

**CDN imports (в head):**
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r158/three.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
```

---

## 3. СТРУКТУРА ФАЙЛОВ

```
/
├── index.html
├── main.js
├── shaders/
│   ├── edge.vert.glsl       # Vertex shader для image planes
│   └── edge.frag.glsl       # Fragment shader — smoke edge эффект
└── assets/
    ├── audio/
    │   └── narration.mp3
    └── images/
        ├── img_0.png        # Центральное изображение (финал)
        ├── img_01.png
        ├── img_02.png
        │   ...
        └── img_55.png
```

---

## 4. СЦЕНА THREE.JS

### 4.1 Инициализация

```
- Renderer:  WebGLRenderer, antialias: true, alpha: false
- Background: #000000 (чёрный)
- Camera:   PerspectiveCamera, fov: 50, near: 0.1, far: 10000
- Camera начальная позиция: направлена на изображение 01
```

### 4.2 Расположение изображений в сцене

**Геометрия круга:**
- 54 изображения (img_01 — img_54) расположены по окружности
- Радиус круга: `R = 2800` единиц
- Центр круга: `(0, 0, 0)` в мировых координатах
- Каждое изображение — `PlaneGeometry(500, 500)` (квадрат)
- Угловой шаг: `360° / 54 ≈ 6.67°` между изображениями
- Каждый plane повёрнут так, чтобы **смотреть к центру круга** (лицевая сторона внутрь)

**Вычисление позиции и ротации для изображения `i` (i от 0 до 53):**
```javascript
const angle = (i / 54) * Math.PI * 2;
const x = Math.cos(angle) * R;
const z = Math.sin(angle) * R;
const y = 0;

plane.position.set(x, y, z);
plane.lookAt(0, 0, 0); // plane смотрит к центру
```

### 4.3 Центральное изображение

- `img_0.png` размещается в центре сцены `(0, 0, 0)`
- Размер: `PlaneGeometry(1200, 1200)` — большое
- **По умолчанию: opacity = 0, invisible**
- Используется только в финальной сцене

---

## 5. ШЕЙДЕР ЭФФЕКТА КРАЁВ (EDGE SMOKE EFFECT)

Каждое изображение рендерится через кастомный ShaderMaterial. Шейдер создаёт эффект дымчатых, колышущихся, нестабильных краёв.

### 5.1 Vertex Shader (`edge.vert.glsl`)
```glsl
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

### 5.2 Fragment Shader (`edge.frag.glsl`)
```glsl
precision highp float;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uSeed;         // уникальный seed для каждой картинки
uniform float uIntensity;    // 0.0 - 1.0, управляет силой эффекта

varying vec2 vUv;

// Функция шума (упрощённый Perlin/Value noise)
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
    // Расстояние от центра (0.5, 0.5) — нормализованное
    vec2 center = vUv - 0.5;
    float dist = length(center);
    
    // Динамичный шум на границе
    float t = uTime * 0.4 + uSeed * 17.3;
    vec2 noiseUv = vUv * 2.5 + vec2(t * 0.1, t * 0.07);
    float n = fbm(noiseUv);
    
    // Граница: чем ближе к краю, тем больше зависит от шума
    // edgeFactor: 0 = центр, 1 = угол
    float edgeFactor = smoothstep(0.25, 0.5, dist);
    
    // Смещаем границу шумом — это даёт рваный эффект
    float noisyEdge = smoothstep(0.0, 1.0, 1.0 - dist * 2.0 + n * 0.6 * edgeFactor);
    
    // Дополнительный слой — "мазки кисти" по периметру
    float brushAngle = atan(center.y, center.x);
    float brush = fbm(vec2(brushAngle * 2.0 + uSeed, t * 0.2)) * 0.3;
    float finalAlpha = noisyEdge + brush * (1.0 - noisyEdge);
    finalAlpha = clamp(finalAlpha, 0.0, 1.0);
    
    // Применяем intensity (можно анимировать reveal/hide)
    finalAlpha *= uIntensity;
    
    vec4 texColor = texture2D(uTexture, vUv);
    gl_FragColor = vec4(texColor.rgb, texColor.a * finalAlpha);
}
```

### 5.3 Uniforms для каждого изображения

```javascript
const material = new THREE.ShaderMaterial({
    uniforms: {
        uTexture:   { value: texture },
        uTime:      { value: 0 },         // обновляется каждый кадр
        uSeed:      { value: Math.random() * 100 }, // уникальный на старте
        uIntensity: { value: 1.0 }        // анимируется при появлении/исчезновении
    },
    transparent: true,
    side: THREE.FrontSide
});
```

**В render loop:**
```javascript
function animate(time) {
    requestAnimationFrame(animate);
    const t = time * 0.001; // секунды
    imagePlanes.forEach(p => {
        p.material.uniforms.uTime.value = t;
    });
    renderer.render(scene, camera);
}
```

---

## 6. СИСТЕМА КАМЕРЫ И ТАЙМИНГИ

### 6.1 Принцип движения

Камера движется **не по рельсу круга**, а в пространстве:
- Текущая позиция камеры — между центром и текущим изображением, слегка ближе к нему
- При переходе к следующему — камера плавно перелетает к следующему
- **Взгляд камеры всегда направлен на текущее изображение** (camera.lookAt)

**Базовая позиция камеры у изображения `i`:**
```javascript
// Изображение находится на расстоянии R от центра
// Камера стоит на расстоянии R - cameraOffset от центра (чуть ближе к центру)
const CAMERA_OFFSET = 600; // расстояние от plane до камеры
const camX = Math.cos(angle) * (R - CAMERA_OFFSET);
const camZ = Math.sin(angle) * (R - CAMERA_OFFSET);
camPos = new THREE.Vector3(camX, 0, camZ);
camTarget = imagePlanes[i].position; // смотрит на изображение
```

### 6.2 Таблица таймингов

Тайминги синхронизированы с аудиофайлом (`audio.currentTime` в секундах).

| # img | Время начала | Время конца | Действие камеры |
|-------|-------------|-------------|-----------------|
| 01    | 0.0         | 10.0        | Старт: камера уже у img_01, медленный зум в |
| 02    | 10.0        | 20.0        | Переход к img_02 |
| 03    | 20.0        | 33.0        | Переход к img_03 |
| 04    | 33.0        | 47.0        | Переход к img_04 |
| 05    | 47.0        | 71.0        | Переход к img_05 |
| 06    | 71.0        | 94.0        | Переход к img_06 |
| 07    | 94.0        | 120.0       | Переход к img_07 |
| 08    | 120.0       | 160.0       | Переход к img_08 |
| 09    | 160.0       | 206.0       | Переход к img_09 |
| 10    | 206.0       | 232.0       | Переход к img_10 |
| 11    | 232.0       | 265.0       | Переход к img_11 |
| 12    | 265.0       | 309.0       | Переход к img_12 |
| 13    | 309.0       | 377.0       | Переход к img_13 |
| 14    | 377.0       | 415.0       | Переход к img_14 |
| 15    | 415.0       | 475.0       | Переход к img_15 |
| 16    | 475.0       | 507.0       | Переход к img_16 |
| 17    | 507.0       | 548.0       | Переход к img_17 |
| 18    | 548.0       | 590.0       | Переход к img_18 |
| 19    | 590.0       | 651.0       | Переход к img_19 |
| 20    | 651.0       | 697.0       | Переход к img_20 |
| 21    | 697.0       | 760.0       | Переход к img_21 |
| 22    | 760.0       | 808.0       | Переход к img_22 |
| 23    | 808.0       | 851.0       | Переход к img_23 |
| 24    | 851.0       | 912.0       | Переход к img_24 |
| 25    | 912.0       | 960.0       | Переход к img_25 |
| 26    | 960.0       | 1006.0      | Переход к img_26 |
| 27    | 1006.0      | 1060.0      | Переход к img_27 |
| 28    | 1060.0      | 1107.0      | Переход к img_28 |
| 29    | 1107.0      | 1160.0      | Переход к img_29 |
| 30    | 1160.0      | 1207.0      | Переход к img_30 |
| 31    | 1207.0      | 1250.0      | Переход к img_31 |
| 32    | 1250.0      | 1314.0      | Переход к img_32 |
| 33    | 1314.0      | 1366.0      | Переход к img_33 |
| 34    | 1366.0      | 1421.0      | Переход к img_34 |
| 35    | 1421.0      | 1486.0      | Переход к img_35 |
| 36    | 1486.0      | 1540.0      | Переход к img_36 |
| 37    | 1540.0      | 1607.0      | Переход к img_37 |
| 38    | 1607.0      | 1660.0      | Переход к img_38 |
| 39    | 1660.0      | 1720.0      | Переход к img_39 |
| 40    | 1720.0      | 1780.0      | Переход к img_40 |
| 41    | 1780.0      | 1851.0      | Переход к img_41 |
| 42    | 1851.0      | 1920.0      | Переход к img_42 |
| 43    | 1920.0      | 1988.0      | Переход к img_43 |
| 44    | 1988.0      | 2050.0      | Переход к img_44 |
| 45    | 2050.0      | 2120.0      | Переход к img_45 |
| 46    | 2120.0      | 2190.0      | Переход к img_46 |
| 47    | 2190.0      | 2260.0      | Переход к img_47 |
| 48    | 2260.0      | 2320.0      | Переход к img_48 |
| 49    | 2320.0      | 2400.0      | Переход к img_49 |
| 50    | 2400.0      | 2460.0      | Переход к img_50 |
| 51    | 2460.0      | 2520.0      | Переход к img_51 |
| 52    | 2520.0      | 2580.0      | Переход к img_52 |
| 53    | 2580.0      | 2640.0      | Переход к img_53 |
| 54    | 2640.0      | 2700.0      | **ФИНАЛЬНАЯ СЦЕНА — см. раздел 7** |

> **Примечание:** Тайминги в таблице — расчётные. Замени значения на точные после финального монтажа аудио. Реализуй массив `TIMESTAMPS = [0, 10, 20, ...]` в начале `main.js` — одно место для редактирования.

### 6.3 Анимация перехода между изображениями

Для каждого перехода от изображения `i` к `i+1`:

```
1. [0% времени]       Камера у img_i, смотрит на него, слегка дышит (микродвижение)
2. [0% – 20%]         Камера начинает отдаляться назад (pull back)
                      camera Z offset: CAMERA_OFFSET → CAMERA_OFFSET * 1.5
3. [20% – 80%]        Камера летит к img_{i+1}
                      Trajectory: плавная кривая через пространство (CubicBezier или CatmullRom)
                      Промежуточная точка немного выше или сбоку для органичности
4. [80% – 100%]       Камера приближается к img_{i+1}, замедляется (ease out)
                      camera Z offset: CAMERA_OFFSET * 1.5 → CAMERA_OFFSET
```

**GSAP реализация:**
```javascript
function transitionToImage(targetIndex, duration) {
    const targetPlane = imagePlanes[targetIndex];
    const angle = (targetIndex / 54) * Math.PI * 2;
    
    const destCamPos = new THREE.Vector3(
        Math.cos(angle) * (R - CAMERA_OFFSET),
        0,
        Math.sin(angle) * (R - CAMERA_OFFSET)
    );
    
    // Промежуточная точка через центр (по воздуху)
    const midPos = new THREE.Vector3(
        destCamPos.x * 0.3,
        80,
        destCamPos.z * 0.3
    );
    
    const tl = gsap.timeline();
    
    // Phase 1: pull back
    tl.to(camera.position, {
        x: camera.position.x * 1.2,
        z: camera.position.z * 1.2,
        duration: duration * 0.2,
        ease: "power2.in"
    });
    
    // Phase 2: fly through
    tl.to(camera.position, {
        x: midPos.x, y: midPos.y, z: midPos.z,
        duration: duration * 0.4,
        ease: "none"
    });
    
    // Phase 3: arrive
    tl.to(camera.position, {
        x: destCamPos.x, y: 0, z: destCamPos.z,
        duration: duration * 0.4,
        ease: "power3.out",
        onUpdate: () => {
            camera.lookAt(targetPlane.position);
        }
    });
}
```

### 6.4 Микродвижение камеры (дыхание)

Пока камера стоит у изображения — добавить тихое "дыхание":

```javascript
// В animate loop:
const breathe = Math.sin(time * 0.0008) * 8;
camera.position.y += breathe * 0.016; // deltaTime
// И небольшой drift:
camera.position.x += Math.sin(time * 0.0005 + seed) * 0.01;
```

---

## 7. ФИНАЛЬНАЯ СЦЕНА (img_54 → img_55 → OUTRO)

### 7.1 Фаза A: Появление img_55 сквозь img_54

**Триггер:** `audio.currentTime >= TIMESTAMPS[53]` (камера прилетела к img_54)

```
1. Камера приближается к img_54, останавливается
2. img_55 создаётся НА ТОМ ЖЕ месте что и img_54 (идентичная позиция)
   img_55.position = img_54.position.clone()
   img_55.material.uniforms.uIntensity.value = 0.0  // невидим
3. GSAP: за 4 секунды — img_54.uIntensity: 1.0 → 0.0 одновременно img_55.uIntensity: 0.0 → 1.0
   Эффект: одно изображение проявляется сквозь другое
4. Пауза 2 секунды — зритель видит img_55
```

### 7.2 Фаза B: Движение к центру + отдаление

**После фазы A:**

```
Одновременно запускаются два движения:

ДВИЖЕНИЕ 1 — камера летит к центру (0,0,0):
  gsap.to(camera.position, {
      x: 0, y: 0, z: 600,   // перед центром сцены
      duration: 8,
      ease: "power2.inOut"
  })
  Камера смотрит на (0,0,0) на протяжении всего движения

ДВИЖЕНИЕ 2 — одновременно: camera.fov увеличивается
  gsap.to(camera, {
      fov: 90,               // было 50 → становится 90
      duration: 8,
      ease: "power2.inOut",
      onUpdate: () => camera.updateProjectionMatrix()
  })

Эффект комбинации: камера летит вперёд но FOV растёт →
создаётся эффект dolly zoom (Vertigo effect) — пространство расширяется
```

### 7.3 Фаза C: Появление центрального img_0 и звёзд

**Триггер:** начинается одновременно с фазой B

```
1. img_0 (в центре сцены) — fade in:
   gsap.to(img0.material.uniforms.uIntensity, { value: 1.0, duration: 4, delay: 2 })
   
2. Звёзды — создать StarField:
   - 2000 точек (BufferGeometry с Points)
   - Случайно распределены в сфере радиуса 8000
   - Цвет: белый (#FFFFFF), размер: 1.5–3px
   - Появляются с fade in (material.opacity: 0 → 1, duration: 5)
   
3. Названия арок (Arc Labels) — появляются через 3 секунды после начала фазы B:
   - 6 текстовых объектов (THREE.Sprite или CSS2DObject)
   - Расположены по кругу R=3200 (чуть дальше изображений)
   - Выровнены по кругу, повёрнуты к центру
   - Шрифт: тонкий, uppercase, белый, opacity: 0 → 0.6
   - Текст:
     ARC I — ДЕТСТВО И ПЕРВЫЕ ВОПРОСЫ         (угол: 0°)
     ARC II — ВЗРОСЛЕНИЕ И ТЕСТИРОВАНИЕ        (угол: 60°)
     ARC III — МИР ЛЮДЕЙ И ДИСТАНЦИЯ           (угол: 120°)
     ARC IV — ПОТЕРИ И НАБЛЮДЕНИЕ              (угол: 180°)
     ARC V — ОСОЗНАНИЕ И СОЗДАНИЕ              (угол: 240°)
     ARC VI — ВЕЧНОЕ ВОЗВРАЩЕНИЕ               (угол: 300°)
   - Fade in: gsap stagger по 0.5 секунды между каждой надписью
```

**Реализация текста через CSS2DRenderer (накладывается поверх WebGL):**
```javascript
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
document.body.appendChild(labelRenderer.domElement);

// Для каждой арки:
const div = document.createElement('div');
div.textContent = 'ARC I — ДЕТСТВО И ПЕРВЫЕ ВОПРОСЫ';
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
label.position.set(arcX, 0, arcZ);
scene.add(label);
```

### 7.4 Фаза D: Превращение в красную точку

**Триггер:** через 10 секунд после начала фазы B

```
Последовательность:

1. img_0 начинает fade out (2 секунды)
2. Звёзды начинают медленно двигаться к центру (scale down или position lerp к 0)
3. Arc Labels fade out (1 секунда)

4. В центре сцены (0,0,0) появляется красная точка:
   - Создать PointLight красного цвета (#CC2200) + маленькая сфера или sprite
   - Начальный размер: 0 → 40px (sprite scale)
   - Цвет: #CC2200
   
5. Точка мерцает:
   gsap.to(redDot.material, {
       opacity: 0.3,
       duration: 0.4,
       repeat: -1,
       yoyo: true,
       ease: "sine.inOut"
   })

6. Камера очень медленно продолжает приближаться к точке
   Финальная позиция камеры: z: 50 (почти у точки)
   
7. Весь экран fade to black за последние 2 секунды:
   <div id="fade-overlay"> fade opacity: 0 → 1
   
8. Финал: полный чёрный экран, тишина.
```

---

## 8. СИНХРОНИЗАЦИЯ С АУДИО

```javascript
const audio = new Audio('./assets/audio/narration.mp3');
audio.preload = 'auto';

// Массив таймингов — ЕДИНСТВЕННОЕ место для редактирования таймингов
const TIMESTAMPS = [
    0,      // img_01
    10,     // img_02
    20,     // img_03
    // ... продолжить согласно разделу 6.2
    2640,   // img_54 / финальная сцена
];

let currentImageIndex = 0;

function onAudioTimeUpdate() {
    const t = audio.currentTime;
    
    // Найти текущий индекс
    for (let i = TIMESTAMPS.length - 1; i >= 0; i--) {
        if (t >= TIMESTAMPS[i]) {
            if (i !== currentImageIndex) {
                currentImageIndex = i;
                
                if (i < 53) {
                    // Обычный переход
                    const segmentDuration = TIMESTAMPS[i + 1] - TIMESTAMPS[i];
                    transitionToImage(i, segmentDuration * 0.85); // 85% времени на движение
                } else {
                    // Финальная сцена
                    startFinalSequence();
                }
            }
            break;
        }
    }
}

audio.addEventListener('timeupdate', onAudioTimeUpdate);
```

---

## 9. СТАРТОВЫЙ ЭКРАН

Так как браузеры блокируют автоплей аудио без user interaction:

```html
<div id="start-screen" style="
    position: fixed; inset: 0;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 1000;
">
    <div style="
        color: rgba(255,255,255,0.4);
        font-family: 'Courier New', monospace;
        font-size: 13px;
        letter-spacing: 6px;
        text-transform: uppercase;
    ">нажмите, чтобы начать</div>
</div>
```

```javascript
document.getElementById('start-screen').addEventListener('click', () => {
    document.getElementById('start-screen').style.opacity = '0';
    setTimeout(() => document.getElementById('start-screen').remove(), 1000);
    audio.play();
}, { once: true });
```

---

## 10. ПРОИЗВОДИТЕЛЬНОСТЬ

### 10.1 Загрузка текстур

```javascript
// Загружать все 55 текстур до старта
const loader = new THREE.TextureLoader();
const textures = [];

async function preloadTextures() {
    const promises = [];
    for (let i = 0; i <= 55; i++) {
        const name = i === 0 ? 'img_0' : `img_${String(i).padStart(2, '0')}`;
        promises.push(
            new Promise(resolve => {
                loader.load(`./assets/images/${name}.png`, tex => {
                    textures[i] = tex;
                    resolve();
                });
            })
        );
    }
    await Promise.all(promises);
}
```

### 10.2 Видимость изображений

В каждый момент полностью рендерить только **текущее + соседние 3 изображения** с каждой стороны. Остальные — `plane.visible = false`. Обновлять видимость при каждом переходе.

```javascript
function updateVisibility(currentIndex) {
    imagePlanes.forEach((plane, i) => {
        const dist = Math.min(
            Math.abs(i - currentIndex),
            54 - Math.abs(i - currentIndex) // для кругового расстояния
        );
        plane.visible = dist <= 4;
    });
}
```

### 10.3 Разрешение текстур

- Все изображения: максимум 1024×1024px перед загрузкой
- Использовать `texture.generateMipmaps = true`
- `texture.minFilter = THREE.LinearMipmapLinearFilter`

---

## 11. ДОПОЛНИТЕЛЬНЫЕ ДЕТАЛИ

### 11.1 Ambient свет сцены

```javascript
// Очень слабый ambient для чтобы чёрный фон был абсолютно чёрным, а картинки освещены шейдером
// Освещение не нужно — изображения lit через шейдер сам по себе
// Оставить только renderer.setClearColor(0x000000, 1)
```

### 11.2 Bloom эффект (опционально, улучшит атмосферу)

```javascript
// Если используется Three.js postprocessing:
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.4,   // strength
    0.5,   // radius
    0.85   // threshold
);
// Красная точка в финале будет красиво светиться
```

### 11.3 Responsive

```javascript
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
});
```

---

## 12. ЧЕКЛИСТ РЕАЛИЗАЦИИ

```
[ ] 1. Инициализация Three.js сцены, renderer, camera
[ ] 2. Загрузка всех текстур (preloader с прогресс-баром)
[ ] 3. Создание 54 PlaneGeometry по кругу с корректной ротацией
[ ] 4. ShaderMaterial с edge smoke эффектом для каждого plane
[ ] 5. Стартовый экран с кнопкой
[ ] 6. Подключение аудио, timeupdate listener
[ ] 7. Массив TIMESTAMPS, функция определения текущего индекса
[ ] 8. Функция transitionToImage() с GSAP
[ ] 9. Микродвижение камеры (breathing)
[ ] 10. updateVisibility() для оптимизации рендера
[ ] 11. Финальная последовательность: img_54 → img_55 crossfade
[ ] 12. Dolly zoom к центру + img_0 появление
[ ] 13. StarField с fade in
[ ] 14. Arc Labels через CSS2DRenderer с stagger
[ ] 15. Красная мерцающая точка в финале
[ ] 16. Fade to black в самом конце
[ ] 17. Resize handler
[ ] 18. (Опц.) UnrealBloomPass для постпроцессинга
```

---

## 13. ЗАМЕЧАНИЯ

- Файлы изображений именуются строго: `img_01.png` ... `img_54.png`, `img_55.png`, `img_0.png`
- `img_0.png` — центральное изображение для финала (уроборос или фигура в центре круга)
- Все изображения **квадратные** (1:1), рекомендуется 1024×1024px
- Аудиофайл: `narration.mp3`, продолжительность должна совпадать с последним таймингом
- Весь проект должен работать как статичный сайт (никакого backend) — достаточно `npx serve .`
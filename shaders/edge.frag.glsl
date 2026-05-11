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

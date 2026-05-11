import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { MidiGenerator } from './music.js';

// --- CONFIGURATION ---
const R = 16000;            
const CAMERA_OFFSET = 0;    
const IMAGE_SIZE = 1200;    
const CENTER_IMAGE_SIZE = 28000;
const TOTAL_IMAGES = 54;

// Настройки полета и визуала (для тестирования)
const FLIGHT_CONFIG = {
    baseHeight: 1000,         // Изначальное расстояние до картинок (высота)
    heightMultiplier: 1.2,    // Во сколько раз поднимаемся в середине полета
    distanceMultiplier: 1.0,  // Множитель радиуса (1.0 = строго по кругу)
    breathingAmp: 8,          // Амплитуда дыхания
    breathingSpeed: 0.8,      // Скорость дыхания
    blackThreshold: 0.05,     // Порог отсечения черного (0.0 - 1.0)
    musicVolume: -10,         // Громкость музыки в дБ (-60 до 0)
    ambientVolume: -10        // Громкость фона в дБ
};

// Mapping of start times to image numbers (chronological) - corrected version
const CHRONO_MAPPING = [
    { t: 3 }, { t: 10 }, { t: 67 }, { t: 86 },
    { t: 111 }, { t: 130 }, { t: 144 }, { t: 154 },
    { t: 160 }, { t: 189 }, { t: 197 }, { t: 206 },
    { t: 218 }, { t: 235 }, { t: 254 }, { t: 297 },
    { t: 321 }, { t: 354 }, { t: 406 }, { t: 437 },
    { t: 466 }, { t: 484 }, { t: 501 }, { t: 511 },
    { t: 707 }, { t: 730 }, { t: 754 }, { t: 808 },
    { t: 818 }, { t: 868 }, { t: 875 }, { t: 894 },
    { t: 909 }, { t: 921 }, { t: 935 }, { t: 944 },
    { t: 967 }, { t: 987 }, { t: 998 }, { t: 1012 },
    { t: 1048 }, { t: 1062 }, { t: 1093 }, { t: 1113 },
    { t: 1158 }, { t: 1166 }, { t: 1185 }, { t: 1208 },
    { t: 1219 }, { t: 1230 }, { t: 1240 }, { t: 1264 },
    { t: 1270 }, { t: 1277 }
];

// Timestamps for each image (seconds)
const TIMESTAMPS = CHRONO_MAPPING.map(m => m.t);

// All narration timestamps for music accents (from transcription.md)
const ACCENT_TIMESTAMPS = [
    3, 10, 14, 20, 27, 33, 40, 48, 59, 67, 73, 86, 93, 100, 104, 111, 117, 125, 130, 135, 144, 147, 154, 160, 163, 173, 181, 189, 197, 206, 210, 214, 218, 222, 224, 228, 235, 239, 245, 254, 261, 270, 277, 281, 289, 293, 297, 303, 308, 315, 321, 328, 338, 343, 348, 354, 361, 367, 371, 376, 380, 382, 389, 392, 395, 406, 410, 416, 420, 430, 434, 437, 440, 446, 452, 454, 457, 466, 469, 473, 476, 479, 481, 484, 486, 488, 493, 498, 501, 503, 505, 511, 515, 522, 523, 529, 531, 534, 538, 541, 546, 551, 554, 557, 566, 571, 575, 579, 581, 586, 588, 589, 597, 599, 601, 604, 607, 610, 613, 618, 621, 625, 627, 634, 638, 642, 648, 651, 656, 659, 662, 667, 673, 678, 687, 690, 700, 703, 707, 708, 714, 723, 725, 730, 732, 733, 738, 740, 745, 749, 754, 756, 766, 767, 774, 780, 781, 793, 799, 801, 806, 808, 811, 818, 824, 828, 834, 838, 842, 846, 848, 852, 856, 857, 860, 863, 866, 868, 875, 878, 881, 885, 886, 894, 900, 904, 909, 912, 918, 921, 924, 929, 933, 935, 940, 944, 947, 952, 956, 960, 962, 967, 971, 974, 978, 984, 987, 991, 998, 1002, 1007, 1012, 1017, 1021, 1024, 1028, 1032, 1037, 1038, 1041, 1043, 1048, 1053, 1058, 1062, 1064, 1069, 1073, 1078, 1082, 1087, 1093, 1096, 1100, 1106, 1113, 1116, 1123, 1124, 1130, 1134, 1138, 1141, 1144, 1147, 1151, 1155, 1158, 1161, 1166, 1169, 1174, 1177, 1180, 1185, 1188, 1191, 1194, 1195, 1199, 1200, 1208, 1212, 1216, 1219, 1222, 1225, 1228, 1233, 1238, 1240, 1244, 1249, 1253, 1258, 1260, 1264, 1268, 1272, 1275, 1279, 1284
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
let centerPlane, finalPlane, rewindPlane; // img_0, img_55 and rewind plane
let starField;
let audio, midi;
let finalTimeline;
let navTimeline; // Добавляем переменную для управления текущим переходом
let isManualNavigation = false;
let isIntroActive = false;
let introTimeouts = [];
let currentImageIndex = 0;
let lastAccentIndex = -1;
let isFinalSequence = false;
let isFreeCamera = true; 
let textures = [];
let currentSubtitle = "";

const NARRATION_TEXT = [
    { t: 3, text: "Чего хотел этот мальчик?" },
    { t: 10, text: "О чём он думал?" },
    { t: 14, text: "Он читал какие-то детские книжки." },
    { t: 20, text: "Он не знал, как устроен мир совсем." },
    { t: 27, text: "Он представлял себе как-то свою жизнь." },
    { t: 33, text: "Он точно хотел сделать что-то интересное." },
    { t: 40, text: "Он не очень доверял людям, которые рядом с ним," },
    { t: 48, text: "потому что они вели себя странно и противоречиво." },
    { t: 59, text: "У него были какие-то занятия, которые ему нравились точно." },
    { t: 67, text: "Ему нравилось исследовать мир, узнавать что-то новое," },
    { t: 73, text: "пробовать, открывать." },
    { t: 86, text: "Места, в которых он жил, несмотря на их бедность," },
    { t: 93, text: "казались ему яркими, цветными," },
    { t: 100, text: "полными интересных событий, вещей," },
    { t: 104, text: "каждая из которых становилась открытием." },
    { t: 111, text: "Он думал, что если он будет следовать какой-то системе," },
    { t: 117, text: "если жизнь будет понятной," },
    { t: 125, text: "то он чего-то добьётся, наверное." },
    { t: 130, text: "Его будут уважать." },
    { t: 135, text: "Была ли у него вообще такая концепция уважения к себе?" },
    { t: 144, text: "Наверное, он мыслил в категориях" },
    { t: 147, text: "«это хорошо, приятно мне, и это не очень приятно»." },
    { t: 154, text: "И неопределённость была не очень приятной." },
    { t: 160, text: "Позже, когда он вырастет," },
    { t: 163, text: "он начнёт сомневаться в том, что определённость – это что-то хорошее," },
    { t: 173, text: "и начнёт тестировать мир на то," },
    { t: 181, text: "насколько прочен он и насколько прочен он сам." },
    { t: 189, text: "Он будет пробовать разные образы." },
    { t: 197, text: "Он захочет стать сильнее физически, интеллектуально," },
    { t: 206, text: "но среда, в которой он находится," },
    { t: 210, text: "будет продолжать диктовать ему свои условия," },
    { t: 214, text: "и он будет вынужден соглашаться." },
    { t: 218, text: "Он будет вынужден оказываться в ситуациях," },
    { t: 222, text: "в которых он не хотел бы оказаться," },
    { t: 224, text: "и соглашаться на то, на что он не хотел бы соглашаться." },
    { t: 228, text: "И он будет не до конца понимать," },
    { t: 235, text: "что взаимодействие между людьми" },
    { t: 239, text: "строится на принципе силы, подавления," },
    { t: 245, text: "и не бывает равных отношений." },
    { t: 254, text: "Когда он был совсем маленький," },
    { t: 261, text: "ему казалось, что те, кто выше его," },
    { t: 270, text: "сильнее, умнее, важнее," },
    { t: 277, text: "и что он зависит от них" },
    { t: 281, text: "и будет зависеть от них до конца жизни." },
    { t: 289, text: "Он не знал, что было до него," },
    { t: 293, text: "что будет после него." },
    { t: 297, text: "Он находился в текущем моменте" },
    { t: 303, text: "и не ставил под сомнение," },
    { t: 308, text: "не рефлексировал," },
    { t: 315, text: "и когда он взрослел," },
    { t: 321, text: "он мог быть дерзким и мог быть злобным," },
    { t: 328, text: "он мог быть жестоким," },
    { t: 338, text: "он мог быть обидчивым," },
    { t: 343, text: "он мог быть грустным," },
    { t: 348, text: "и большая часть его эмоций" },
    { t: 354, text: "создавалась его окружением." },
    { t: 361, text: "Не было такого, чтобы он решал" },
    { t: 367, text: "изнутри изменить свое состояние" },
    { t: 371, text: "или переломить ход событий." },
    { t: 376, text: "Он реагировал," },
    { t: 380, text: "и как будто бы у него не было" },
    { t: 382, text: "другого способа взаимодействия с реальностью." },
    { t: 389, text: "Не было таких моментов," },
    { t: 392, text: "когда бы он был грустным," },
    { t: 395, text: "и он находил в себе силы стать веселым." },
    { t: 406, text: "Его одежда часто была ему не по размеру," },
    { t: 410, text: "он носил вещи," },
    { t: 416, text: "которые отдавали другие люди," },
    { t: 420, text: "или его старший брат," },
    { t: 430, text: "и часто ему шили одежду," },
    { t: 434, text: "которая ему не нравилась," },
    { t: 437, text: "но он не придавал этому значения" },
    { t: 440, text: "или убеждал себя в том," },
    { t: 446, text: "что ему действительно это нравится." },
    { t: 452, text: "Так он научился жить," },
    { t: 454, text: "как ему не нравится," },
    { t: 457, text: "и не замечать этого." },
    { t: 466, text: "Он большую часть времени" },
    { t: 469, text: "чувствовал себя скованным," },
    { t: 473, text: "замкнутым," },
    { t: 476, text: "непойманным," },
    { t: 479, text: "ненайденным" },
    { t: 481, text: "и непонятным." },
    { t: 484, text: "Он еще не знал, что так чувствует себя" },
    { t: 486, text: "большая часть людей," },
    { t: 488, text: "и это нормально." },
    { t: 493, text: "Он еще не искал никаких ответов," },
    { t: 498, text: "но глубоко внутри понимал," },
    { t: 501, text: "что что-то не так" },
    { t: 503, text: "или с ним," },
    { t: 505, text: "или с миром," },
    { t: 511, text: "и, проходя по социальной лестнице" },
    { t: 515, text: "своего детства и юности," },
    { t: 522, text: "он ни с кем" },
    { t: 523, text: "не контактировал" },
    { t: 529, text: "глубоко и близко," },
    { t: 531, text: "и часто" },
    { t: 534, text: "разочаровывался в людях" },
    { t: 538, text: "и рубил с плеча," },
    { t: 541, text: "потому что он судил по себе," },
    { t: 546, text: "и люди не оправдывали его ожиданий." },
    { t: 551, text: "Ему казалось, что он предъявлял" },
    { t: 554, text: "самые обычные требования," },
    { t: 557, text: "но они не могли их выполнить." },
    { t: 566, text: "Когда он был маленький," },
    { t: 571, text: "он никогда" },
    { t: 575, text: "не делал различия между тем, чтобы" },
    { t: 579, text: "исследовать мир" },
    { t: 581, text: "и проверять себя," },
    { t: 586, text: "как будто он" },
    { t: 588, text: "часть мира," },
    { t: 589, text: "которую тоже нужно исследовать." },
    { t: 597, text: "И он рос" },
    { t: 599, text: "как росли" },
    { t: 601, text: "многие тысячи и сотни тысяч" },
    { t: 604, text: "других мальчиков" },
    { t: 607, text: "со своими надеждами," },
    { t: 610, text: "со своими достижениями," },
    { t: 613, text: "которые он позже обесценит," },
    { t: 618, text: "и он еще не знал, что он решит" },
    { t: 621, text: "перекроить самого себя" },
    { t: 625, text: "и не оставить" },
    { t: 627, text: "от себя прошлого камня на камне." },
    { t: 634, text: "На разных фотографиях" },
    { t: 638, text: "он выглядит абсолютно по-разному." },
    { t: 642, text: "Невозможно сказать, что это один и тот же человек," },
    { t: 648, text: "но определенно точно" },
    { t: 651, text: "видно, что в нем есть какая-то сила." },
    { t: 656, text: "Даже в его грусти" },
    { t: 659, text: "и в его злости," },
    { t: 662, text: "в его дерзости," },
    { t: 667, text: "в его скромности" },
    { t: 673, text: "по лицу всегда видно," },
    { t: 678, text: "что человек не прост." },
    { t: 687, text: "В нем есть" },
    { t: 690, text: "какая-то искра." },
    { t: 700, text: "Когда ты смотришь на него," },
    { t: 703, text: "кажется, что у него все впереди." },
    { t: 707, text: "Кажется," },
    { t: 708, text: "что он не оступится и сделает все правильно." },
    { t: 714, text: "Но он еще не знает, что он сделает неправильно почти все." },
    { t: 723, text: "С самого детства" },
    { t: 725, text: "он сталкивается с противоречиями в жизни." },
    { t: 730, text: "Он видит, как" },
    { t: 732, text: "люди" },
    { t: 733, text: "недостойные чего-то имеют это." },
    { t: 738, text: "И люди, которые достойны," },
    { t: 740, text: "не имеют ничего." },
    { t: 745, text: "Он не делает из этого далеко идущих выводов," },
    { t: 749, text: "но оставляет заметки." },
    { t: 754, text: "Он учится дружить" },
    { t: 756, text: "и учится терять друзей." },
    { t: 766, text: "Он проходит" },
    { t: 767, text: "школу жизни буквально." },
    { t: 774, text: "И кажется, что в этом нет ничего необычного," },
    { t: 780, text: "что через это проходят все," },
    { t: 781, text: "но каждый проходит через это по-особенному." },
    { t: 793, text: "Начиная с первого знакомства с одноклассниками" },
    { t: 799, text: "до последних дней" },
    { t: 801, text: "перед выпуском," },
    { t: 806, text: "этот мальчик" },
    { t: 808, text: "наблюдает за людьми," },
    { t: 811, text: "как если бы он был каким-нибудь аутистом." },
    { t: 818, text: "Он начинает держать дистанцию," },
    { t: 824, text: "и эта дистанция увеличивается тем дальше." },
    { t: 828, text: "Чем больше он пытается разобраться в себе и в людях," },
    { t: 834, text: "чем больше он узнает людей," },
    { t: 838, text: "тем больше ему хочется забиться в угол" },
    { t: 842, text: "и не иметь с ними никаких дел." },
    { t: 846, text: "И тем страшнее ему от мысли," },
    { t: 848, text: "что он один из них," },
    { t: 852, text: "и он такой же." },
    { t: 856, text: "Позже" },
    { t: 857, text: "именно эта мысль заставит почувствовать его" },
    { t: 860, text: "общность с другими людьми." },
    { t: 863, text: "Но сейчас" },
    { t: 866, text: "он думает," },
    { t: 868, text: "что его окружают какие-то животные." },
    { t: 875, text: "И в каждом взгляде," },
    { t: 878, text: "который он бросает" },
    { t: 881, text: "в старый пленочный фотоаппарат," },
    { t: 885, text: "видно," },
    { t: 886, text: "что он сомневается больше в других, чем в себе." },
    { t: 894, text: "Его чувство исключительности," },
    { t: 900, text: "которое не основано ни на чем," },
    { t: 904, text: "продолжает расти в нем, как зерно." },
    { t: 909, text: "И он все больше смотрит" },
    { t: 912, text: "и меньше говорит." },
    { t: 918, text: "Ему придется потерять" },
    { t: 921, text: "много друзей," },
    { t: 924, text: "много контактов с родственниками," },
    { t: 929, text: "много женщин." },
    { t: 933, text: "И каждый раз" },
    { t: 935, text: "он будет провожать их взглядом" },
    { t: 940, text: "и думать про себя." },
    { t: 944, text: "Что когда-то," },
    { t: 947, text: "когда он был маленьким мальчиком," },
    { t: 952, text: "он видел мир гораздо яснее." },
    { t: 956, text: "И когда он молча наблюдал за людьми," },
    { t: 960, text: "их суть была гораздо яснее," },
    { t: 962, text: "чем когда он коммуницировал с ними." },
    { t: 967, text: "В каждой его улыбке," },
    { t: 971, text: "обращенной к кому-то," },
    { t: 974, text: "была искренность." },
    { t: 978, text: "И даже если люди не оправдывали его ожиданий," },
    { t: 984, text: "он не мстил им," },
    { t: 987, text: "не делал им зла." },
    { t: 991, text: "Он просто старался уйти." },
    { t: 998, text: "Ему всегда было весело с самим собой." },
    { t: 1002, text: "У него было хорошее чувство юмора." },
    { t: 1007, text: "Ему нравились забавы." },
    { t: 1012, text: "Он мог менять разные образы." },
    { t: 1017, text: "И не из-за того, что он искал себя," },
    { t: 1021, text: "а потому что чувствовал," },
    { t: 1024, text: "что в этом есть сила," },
    { t: 1028, text: "чтобы быть не тем," },
    { t: 1032, text: "что ожидает от тебя среда," },
    { t: 1037, text: "а тем," },
    { t: 1038, text: "кто может меняться изнутри," },
    { t: 1041, text: "быть разным" },
    { t: 1043, text: "и менять среду вокруг себя," },
    { t: 1048, text: "плавить пространство вокруг себя так," },
    { t: 1053, text: "чтобы казалось, что это не ты живешь в мире," },
    { t: 1058, text: "а мир живет в тебе." },
    { t: 1062, text: "И даже в самый драматичный момент" },
    { t: 1064, text: "ты можешь быть настолько самодовольным" },
    { t: 1069, text: "и самовлюбленным," },
    { t: 1073, text: "как будто нет ничего кроме тебя в этом мире," },
    { t: 1078, text: "как будто ты царь," },
    { t: 1082, text: "под которого пишется вся вселенная." },
    { t: 1087, text: "Даже если твои надежды не оправдываются," },
    { t: 1093, text: "ты просто вспоминаешь," },
    { t: 1096, text: "что ты выдумал это все." },
    { t: 1100, text: "Ты выдумал это все для себя," },
    { t: 1106, text: "чтобы твоя вселенная была именно такой." },
    { t: 1113, text: "Это испытание, которое ты придумал себе сам." },
    { t: 1116, text: "И только ты можешь его пройти." },
    { t: 1123, text: "И твоя награда в том," },
    { t: 1124, text: "что ты его проходишь прямо сейчас." },
    { t: 1130, text: "Нет никакой загадки в том," },
    { t: 1134, text: "что каждому из нас тяжело," },
    { t: 1138, text: "потому что каждый из нас" },
    { t: 1141, text: "когда-то очень давно" },
    { t: 1144, text: "придумал себе этот мир" },
    { t: 1147, text: "именно таким, какой он есть," },
    { t: 1151, text: "чтобы проверить свои силы," },
    { t: 1155, text: "зная, что сил хватит," },
    { t: 1158, text: "а если их не хватит," },
    { t: 1161, text: "всегда будет еще один шанс." },
    { t: 1166, text: "Всегда будет возможность вернуться," },
    { t: 1169, text: "начать сначала придумывать себе" },
    { t: 1174, text: "ту вселенную," },
    { t: 1177, text: "которая делает тебя" },
    { t: 1180, text: "и которую делаешь ты." },
    { t: 1185, text: "И в этом бесконечном танце" },
    { t: 1188, text: "из обстоятельств," },
    { t: 1191, text: "людей," },
    { t: 1194, text: "событий," },
    { t: 1195, text: "целей," },
    { t: 1199, text: "трудностей" },
    { t: 1200, text: "ты находишь себя," },
    { t: 1208, text: "находишь других," },
    { t: 1212, text: "теряешь себя," },
    { t: 1216, text: "теряешь других." },
    { t: 1219, text: "И это повторяется так долго," },
    { t: 1222, text: "так часто," },
    { t: 1225, text: "пока до тебя наконец не дойдет," },
    { t: 1228, text: "что нет никакого тебя," },
    { t: 1233, text: "нет никаких других," },
    { t: 1238, text: "что все вокруг" },
    { t: 1240, text: "одно и то же." },
    { t: 1244, text: "Оно повторяется," },
    { t: 1249, text: "и это твоя задумка." },
    { t: 1253, text: "В этом и была вся фишка." },
    { t: 1258, text: "И ты уже не смеешься" },
    { t: 1260, text: "и не грустишь," },
    { t: 1264, text: "не психуешь," },
    { t: 1268, text: "не недоумеваешь," },
    { t: 1272, text: "не думаешь о том," },
    { t: 1275, text: "чтобы владеть чем-то," },
    { t: 1279, text: "чтобы контролировать что-то," },
    { t: 1284, text: "а начинаешь просто создавать." }
];

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

    const imageMap = {
        45: 47, // (19:15) "зная, что сил хватит" -> Колесо (было 47)
        46: 48, // (19:21) "всегда будет еще один шанс" -> Зеркала (было 48)
        47: 45, // (19:45) "и в этом бесконечном танце" -> Танец (было 45)
        48: 46, // (20:00) "ты находишь себя" -> Чистый лист (было 46)
        49: 50, // (20:19) "и это повторяется так долго" -> Лестницы (было 50)
        50: 49  // (20:28) "нет никакого тебя" -> Уроборос (было 49)
    };

    for (let i = 0; i < TOTAL_IMAGES; i++) {
        const angle = (i / TOTAL_IMAGES) * Math.PI * 2 - Math.PI / 2; // Смещение на полночь
        const x = Math.cos(angle) * R;
        const z = Math.sin(angle) * R;

        // Переопределяем индекс картинки согласно маппингу
        let textureIndex = i + 1;
        if (imageMap[textureIndex]) {
            textureIndex = imageMap[textureIndex];
        }
        
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: textures[textureIndex] || null },
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

    // Rewind Plane with Shader Mask
    const rewindMat = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { value: null },
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
    rewindPlane = new THREE.Mesh(new THREE.PlaneGeometry(IMAGE_SIZE, IMAGE_SIZE), rewindMat);
    rewindPlane.rotation.x = -Math.PI / 2;
    rewindPlane.position.y = 500; // Еще выше
    rewindPlane.visible = false;
    scene.add(rewindPlane);
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

// --- LOGIC ---

function setupAudio() {
    audio = new Audio('./assets/audio/narration.mp3');
    audio.preload = 'auto';
    audio.addEventListener('timeupdate', onAudioTimeUpdate);
}

function startExperience() {
    console.log("startExperience triggered");
    try {
        isIntroActive = true;
        const startLabel = document.getElementById('start-label');
        const loader = document.getElementById('loader');
        const startScreen = document.getElementById('start-screen');
        const mainTitle = document.getElementById('main-title');
        
        // Плавно гасим только надписи, оставляя черный экран
        gsap.to([startLabel, loader], { 
            opacity: 0, 
            duration: 1.5, 
            ease: "power2.inOut",
            onComplete: () => {
                // После того как надписи исчезли, ждем полсекунды
                const titleShowTimeout = setTimeout(() => {
                    if (!isIntroActive) return;
                    
                    // Резко показываем название
                    mainTitle.style.opacity = "1";
                    
                    // Хоррор-эффект звуком
                    if (midi) midi.playHorrorSlam();
                    
                    // Держим название 1.5 секунды
                    const titleHideTimeout = setTimeout(() => {
                        if (!isIntroActive) return;
                        
                        // Резко убираем название
                        mainTitle.style.opacity = "0";
                        
                        // Еще небольшая пауза перед началом (0.3с)
                        const startIntroTimeout = setTimeout(() => {
                            if (!isIntroActive) return;
                            
                            // Убираем черный оверлей и запускаем интро
                            startScreen.remove();
                            mainTitle.remove();
                            
                            runIntroSequence().then(() => {
                                if (!isIntroActive) return;
                                finishIntroAndStartAudio();
                            });
                        }, 300);
                        introTimeouts.push(startIntroTimeout);
                        
                    }, 1500);
                    introTimeouts.push(titleHideTimeout);
                    
                }, 500);
                introTimeouts.push(titleShowTimeout);
            }
        });
        
        // Initialize MIDI
        midi = new MidiGenerator({
            musicVolume: FLIGHT_CONFIG.musicVolume,
            ambientVolume: FLIGHT_CONFIG.ambientVolume
        });
        midi.init().catch(err => console.warn("MIDI init failed, continuing without music:", err));

        // При старте принудительно включаем кинематографический режим
        isFreeCamera = false;
        controls.enabled = false;
        
        // Скрываем все картинки перед интро
        imagePlanes.forEach(p => p.visible = false);

        window.addEventListener('keydown', handleKeyDown);

    } catch (error) {
        console.error("Critical error in startExperience:", error);
    }
}

async function runIntroSequence() {
    console.log("Phase: Intro Rewind (54 -> 1)");
    
    // Позиционируем интро-плейн там же, где будет первая картинка
    const img01 = imagePlanes[0];
    rewindPlane.position.copy(img01.position);
    rewindPlane.rotation.copy(img01.rotation);
    rewindPlane.scale.set(1, 1, 1);
    rewindPlane.visible = true;
    
    // Камера сразу на первую позицию
    setCameraToImage(0);
    camera.position.y = 2000; // Начинаем чуть выше для эффекта снижения
    
    const introImages = [...textures].slice(1, 55).reverse(); // 54 down to 1
    const stepDuration = 0.05;

    gsap.to(rewindPlane.material.uniforms.uIntensity, { value: 1.0, duration: 0.5 });
    gsap.to(camera.position, { y: FLIGHT_CONFIG.baseHeight, duration: introImages.length * stepDuration, ease: "power1.inOut" });

    return new Promise(resolve => {
        introImages.forEach((tex, i) => {
            const timeout = setTimeout(() => {
                if (!isIntroActive) return;
                rewindPlane.material.uniforms.uTexture.value = tex;
                rewindPlane.material.uniforms.uTime.value = performance.now() * 0.001;
                
                if (i === introImages.length - 1) {
                    resolve();
                }
            }, i * stepDuration * 1000);
            introTimeouts.push(timeout);
        });
    });
}

function finishIntroAndStartAudio() {
    if (!isIntroActive) return;
    isIntroActive = false;
    console.log("Intro finished, starting narration");

    // Показываем основной плейн первой картинки
    updateVisibility(0);
    const img01 = imagePlanes[0];
    img01.material.uniforms.uIntensity.value = 1.0;

    // Плавно убираем интро-плейн, оставляя под ним настоящую первую картинку
    gsap.to(rewindPlane.material.uniforms.uIntensity, { 
        value: 0, 
        duration: 0.3, 
        onComplete: () => {
            rewindPlane.visible = false;
        }
    });

    audio.play().then(() => {
        console.log("Audio playing successfully");
    }).catch(err => {
        console.error("Audio playback failed.", err);
        startFallbackTimer();
    });
}

function startFallbackTimer() {
    let currentTime = 0;
    const timer = setInterval(() => {
        currentTime += 0.1;
        onAudioTimeUpdate({ target: { currentTime } });
    }, 100);
}

function interruptIntro() {
    if (!isIntroActive) return;
    console.log("Interrupting intro sequence");
    isIntroActive = false;
    introTimeouts.forEach(t => clearTimeout(t));
    introTimeouts = [];
    rewindPlane.visible = false;
    rewindPlane.material.uniforms.uIntensity.value = 0;
}

function handleKeyDown(e) {
    if (e.key.toLowerCase() === 'c') {
        interruptIntro();
        isFreeCamera = !isFreeCamera;
        controls.enabled = isFreeCamera;
        
        if (!isFreeCamera) {
            setCameraToImage(currentImageIndex);
            updateVisibility(currentImageIndex);
        }
        console.log("Camera mode:", isFreeCamera ? "FREE" : "CINEMATIC");
    }

    // Переключение на финальную сцену для теста
    if (e.key.toLowerCase() === 'f') {
        console.log("F key pressed - Force start full final loop");
        interruptIntro();
        isManualNavigation = true;
        isFinalSequence = false; 
        currentImageIndex = TOTAL_IMAGES - 1;
        audio.currentTime = TIMESTAMPS[currentImageIndex];
        updateSubtitles(audio.currentTime, true); // МГНОВЕННОЕ ОБНОВЛЕНИЕ
        
        if (finalTimeline) finalTimeline.kill();
        if (navTimeline) navTimeline.kill();
        gsap.killTweensOf(camera.position);
        gsap.killTweensOf(camera);
        
        jumpToImage(currentImageIndex);
        
        if (audio.paused) audio.play();

        setTimeout(() => {
            isManualNavigation = false;
            startFinalSequence(false);
        }, 100);
    }

    // Переключение таймингов стрелками
    if (!isFreeCamera) {
        if (e.key === 'ArrowRight') {
            console.log("ArrowRight pressed. Current index:", currentImageIndex);
            interruptIntro();
            if (currentImageIndex < TOTAL_IMAGES - 1) {
                isManualNavigation = true;
                currentImageIndex++;
                console.log("Moving to index:", currentImageIndex, "Time:", TIMESTAMPS[currentImageIndex]);
                audio.currentTime = TIMESTAMPS[currentImageIndex];
                updateSubtitles(audio.currentTime, true); // МГНОВЕННОЕ ОБНОВЛЕНИЕ
                if (audio.paused) audio.play();
                
                jumpToImage(currentImageIndex);
                
                // Если перешли на последнюю картинку, планируем финал
                if (currentImageIndex === TOTAL_IMAGES - 1) {
                    setTimeout(() => {
                        if (!isManualNavigation && currentImageIndex === TOTAL_IMAGES - 1) {
                            startFinalSequence();
                        }
                    }, 2000);
                }
                
                setTimeout(() => isManualNavigation = false, 300); // Уменьшил задержку лока
            } else {
                console.log("Already at last image");
            }
        }
        if (e.key === 'ArrowLeft') {
            console.log("ArrowLeft pressed. Current index:", currentImageIndex);
            interruptIntro();
            if (currentImageIndex > 0) {
                isManualNavigation = true;
                currentImageIndex--;
                console.log("Moving back to index:", currentImageIndex, "Time:", TIMESTAMPS[currentImageIndex]);
                isFinalSequence = false; 
                if (finalTimeline) finalTimeline.kill();
                if (navTimeline) navTimeline.kill();
                audio.currentTime = TIMESTAMPS[currentImageIndex];
                updateSubtitles(audio.currentTime, true); // МГНОВЕННОЕ ОБНОВЛЕНИЕ
                if (audio.paused) audio.play();
                jumpToImage(currentImageIndex);
                setTimeout(() => isManualNavigation = false, 300);
            } else {
                console.log("Already at first image");
            }
        }
    }
}

function onAudioTimeUpdate(e) {
    const t = e.target ? e.target.currentTime : audio.currentTime;
    
    // ОБНОВЛЯЕМ СУБТИТРЫ ВСЕГДА (даже в финале, пока они не скрыты)
    if (!isFreeCamera && !isManualNavigation) {
        updateSubtitles(t);
    }

    if (isFinalSequence || isFreeCamera || isManualNavigation) return;
    
    // Trigger MIDI accents/motifs
    for (let j = ACCENT_TIMESTAMPS.length - 1; j >= 0; j--) {
        if (t >= ACCENT_TIMESTAMPS[j]) {
            if (j !== lastAccentIndex) {
                lastAccentIndex = j;
                if (midi) {
                    if (j % 5 === 0) {
                        midi.playAccent();
                    } else {
                        midi.playMotif();
                    }
                }
            }
            break;
        }
    }

    // Ищем индекс кадра для текущего времени
    let newIndex = -1;
    for (let i = TIMESTAMPS.length - 1; i >= 0; i--) {
        if (t >= TIMESTAMPS[i]) {
            newIndex = i;
            break;
        }
    }

    if (newIndex !== -1 && newIndex !== currentImageIndex) {
        // Если мы переходим на последний кадр (54-й), сначала показываем его
        if (newIndex === TOTAL_IMAGES - 1) {
            currentImageIndex = newIndex;
            jumpToImage(currentImageIndex);
            updateVisibility(currentImageIndex);
            // Запуск финала через небольшую паузу после показа 54-й картинки
            setTimeout(() => {
                if (!isManualNavigation && currentImageIndex === TOTAL_IMAGES - 1) {
                    startFinalSequence();
                }
            }, 2000);
        } else {
            currentImageIndex = newIndex;
            // Ограничиваем длительность перехода максимум 8 секундами, чтобы не было "дрейфа"
            const rawDuration = (TIMESTAMPS[currentImageIndex + 1] || t + 10) - TIMESTAMPS[currentImageIndex];
            const segmentDuration = Math.min(rawDuration * 0.85, 8.0); 
            transitionToImage(currentImageIndex, segmentDuration);
            updateVisibility(currentImageIndex);
        }
    }
}

function updateSubtitles(t, isJump = false) {
    // Если субтитры уже скрыты в финале, больше не обновляем их
    const container = document.getElementById('subtitle-container');
    if (!isJump && container && window.getComputedStyle(container).opacity === "0" && isFinalSequence) {
        return;
    }

    let newIndex = -1;
    for (let i = NARRATION_TEXT.length - 1; i >= 0; i--) {
        if (t >= NARRATION_TEXT[i].t) {
            newIndex = i;
            break;
        }
    }

    if (newIndex !== -1) {
        const entry = NARRATION_TEXT[newIndex];
        const newText = entry.text;

        if (newText !== currentSubtitle) {
            currentSubtitle = newText;
            const container = document.getElementById('subtitle-container');
            
            // Остановка предыдущих анимаций текста
            gsap.killTweensOf(container);
            
            // Находим время до следующей фразы для расчета скорости
            const nextT = NARRATION_TEXT[newIndex + 1] ? NARRATION_TEXT[newIndex + 1].t : t + 5;
            const availableDuration = Math.max(nextT - entry.t, 1.0); // Время жизни фразы
            const totalPrintDuration = Math.min(availableDuration * 0.8, 5.0); 

            const setInstantText = () => {
                container.innerHTML = "";
                if (newText) {
                    const chars = newText.split("");
                    chars.forEach(char => {
                        const span = document.createElement("span");
                        span.className = "char";
                        span.textContent = char === " " ? "\u00A0" : char; 
                        span.style.opacity = 1;
                        span.style.transform = "translateY(0)";
                        container.appendChild(span);
                    });
                    container.style.opacity = 1;
                }
            };

            if (isJump) {
                // При прыжке — мгновенно меняем текст без затуханий
                setInstantText();
            } else {
                // При обычном проигрывании — плавно через typewriter
                gsap.to(container, { 
                    opacity: 0, 
                    duration: 0.2, 
                    onComplete: () => {
                        container.innerHTML = "";
                        if (newText) {
                            const chars = newText.split("");
                            chars.forEach(char => {
                                const span = document.createElement("span");
                                span.className = "char";
                                span.textContent = char === " " ? "\u00A0" : char; 
                                container.appendChild(span);
                            });
                            
                            const charElements = container.querySelectorAll(".char");
                            const stagger = totalPrintDuration / chars.length;
                            
                            container.style.opacity = 1;
                            gsap.to(charElements, {
                                opacity: 1,
                                y: 0,
                                duration: 0.1,
                                stagger: stagger,
                                ease: "none"
                            });
                        }
                    }
                });
            }
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
    // Остановить все текущие анимации камеры и объектов
    if (finalTimeline) finalTimeline.kill();
    if (navTimeline) navTimeline.kill();
    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(camera);
    gsap.killTweensOf(camBasePos);
    
    // Сброс интенсивностей (на случай если мы в середине перехода или финала)
    imagePlanes.forEach((p, i) => {
        gsap.killTweensOf(p.material.uniforms.uIntensity);
        p.material.uniforms.uIntensity.value = 1.0;
    });
    gsap.killTweensOf(finalPlane.material.uniforms.uIntensity);
    finalPlane.material.uniforms.uIntensity.value = 0.0;
    gsap.killTweensOf(centerPlane.material.uniforms.uIntensity);
    centerPlane.material.uniforms.uIntensity.value = 0.0;
    
    // Плавный прыжок вместо мгновенного, если мы не в интро
    const angle = (index / TOTAL_IMAGES) * Math.PI * 2 - Math.PI / 2;
    const dist = (R - CAMERA_OFFSET) * FLIGHT_CONFIG.distanceMultiplier;
    const targetX = Math.cos(angle) * dist;
    const targetZ = Math.sin(angle) * dist;

    navTimeline = gsap.timeline();
    navTimeline.to(camera.position, {
        x: targetX,
        y: FLIGHT_CONFIG.baseHeight,
        z: targetZ,
        duration: 0.8, // Достаточно быстро, но плавно
        ease: "power2.out",
        onUpdate: () => {
            camBasePos.copy(camera.position);
            camera.rotation.set(-Math.PI / 2, 0, 0);
        }
    });
    
    updateVisibility(index);
}

function transitionToImage(targetIndex, duration) {
    // Остановить текущие анимации, чтобы избежать конфликтов
    if (navTimeline) navTimeline.kill();
    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(camBasePos);

    // Текущий угол камеры
    const currentAngle = Math.atan2(camera.position.z, camera.position.x);
    // Целевой угол
    let targetAngle = (targetIndex / TOTAL_IMAGES) * Math.PI * 2 - Math.PI / 2;
    
    // Кратчайший путь
    while (targetAngle - currentAngle > Math.PI) targetAngle -= Math.PI * 2;
    while (targetAngle - currentAngle < -Math.PI) targetAngle += Math.PI * 2;

    const animObj = { 
        angle: currentAngle, 
        height: camera.position.y,
        distScale: FLIGHT_CONFIG.distanceMultiplier
    };
    
    navTimeline = gsap.timeline();
    
    // Движение строго по дуге над окружностью
    navTimeline.to(animObj, {
        angle: targetAngle,
        height: FLIGHT_CONFIG.baseHeight * FLIGHT_CONFIG.heightMultiplier, 
        duration: duration * 0.5,
        ease: "power2.inOut",
        onUpdate: () => {
            updateCameraFromAnim(animObj);
        }
    });
    
    navTimeline.to(animObj, {
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
    if (isFreeCamera || isFinalSequence) {
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

function startFinalSequence(skipInitial = false) {
    if (isFinalSequence) return;
    isFinalSequence = true;
    console.log("Final sequence started", skipInitial ? "(skipping initial flight)" : "");
    
    // Останавливаем все фоновые процессы дыхания камеры
    if (finalTimeline) finalTimeline.kill();
    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(camera.rotation);
    gsap.killTweensOf(camera);
    
    const img01 = imagePlanes[0];
    
    // Сброс состояний материалов и ГАРАНТИЯ ВИДИМОСТИ всех картинок
    imagePlanes.forEach(p => {
        gsap.killTweensOf(p.material.uniforms.uIntensity);
        p.visible = true;
        p.material.uniforms.uIntensity.value = 1.0;
    });
    gsap.killTweensOf(finalPlane.material.uniforms.uIntensity);
    gsap.killTweensOf(centerPlane.material.uniforms.uIntensity);
    gsap.killTweensOf(starField.material);
    gsap.killTweensOf(rewindPlane.material);
    
    // Удаление старой точки если есть
    const oldDot = scene.getObjectByName("redDot");
    if (oldDot) scene.remove(oldDot);
    
    finalPlane.material.uniforms.uIntensity.value = 0.0;
    centerPlane.material.uniforms.uIntensity.value = 0.0;
    rewindPlane.material.opacity = 0;
    rewindPlane.visible = false;
    starField.material.opacity = 0;
    starField.scale.set(1, 1, 1);

    finalTimeline = gsap.timeline();
    
    if (!skipInitial) {
        // 1. ПЛАВНЫЙ перелет от текущей позиции к 1-й картинке (индекс 0)
        const angle01 = (0 / TOTAL_IMAGES) * Math.PI * 2 - Math.PI / 2;
        const dist = (R - CAMERA_OFFSET) * FLIGHT_CONFIG.distanceMultiplier;
        
        finalTimeline.to(camera.position, {
            x: Math.cos(angle01) * dist,
            y: FLIGHT_CONFIG.baseHeight,
            z: Math.sin(angle01) * dist,
            duration: 5, // Увеличил длительность для плавности
            ease: "power2.inOut",
            onUpdate: () => camera.rotation.set(-Math.PI / 2, 0, 0)
        });

        // 2. Crossfade img_01 -> img_55
        finalTimeline.add(() => {
            console.log("Phase: Crossfading img_01 to img_55");
            const img01 = imagePlanes[0];
            finalPlane.position.copy(img01.position);
            finalPlane.rotation.copy(img01.rotation);
            gsap.to(img01.material.uniforms.uIntensity, { value: 0.0, duration: 5, ease: "power1.inOut" });
            gsap.to(finalPlane.material.uniforms.uIntensity, { value: 1.0, duration: 5, ease: "power1.inOut" });
        });
        
        finalTimeline.to({}, { duration: 6 }); 
    }

    // 3. Взлет и отдаление СТРОГО К ЦЕНТРУ (0, 0, 0)
    finalTimeline.add(() => {
        console.log("Phase: Moving to absolute center, showing the circle");
        
        // Скрываем субтитры плавно, когда прошли ~20% пути к центру (18с * 0.2 = 3.6с)
        gsap.to("#subtitle-container", { opacity: 0, duration: 2, delay: 3.6 });

        gsap.to(camera.position, {
            x: 0, y: 15000, z: 0, // Цель — центр
            duration: 18,
            ease: "power2.inOut",
            onUpdate: () => {
                camera.rotation.set(-Math.PI / 2, 0, 0); // Взгляд строго вниз
            }
        });
        
        gsap.to(camera, {
            fov: 120,
            duration: 18,
            ease: "power2.inOut",
            onUpdate: () => camera.updateProjectionMatrix()
        });
        
        gsap.to(starField.material, { opacity: 1, duration: 12, delay: 2 });
        gsap.to(centerPlane.material.uniforms.uIntensity, { value: 1.0, duration: 10, delay: 5 });
    });

    // 4. Финал: Приближение к красной точке и ОБРАТНАЯ ПЕРЕМОТКА
    finalTimeline.add(() => {
        console.log("Phase: Approaching the Red Dot & Final Rewind");
        
        // Прячем всё
        gsap.to(centerPlane.material.uniforms.uIntensity, { value: 0, duration: 6 });
        
        // Красная точка (создаем и сразу запускаем пульсацию)
        const dotGeo = new THREE.SphereGeometry(15, 32, 32);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0xCC2200, transparent: true, opacity: 0 });
        const redDot = new THREE.Mesh(dotGeo, dotMat);
        redDot.name = "redDot";
        redDot.position.set(0, 200, 0);
        scene.add(redDot);
        
        // Проявляем точку
        gsap.to(redDot.material, { opacity: 1, duration: 5 });
        
        // ПУЛЬСАЦИЯ ТОЧКИ (начинается сразу и идет до конца)
        gsap.to(redDot.scale, {
            x: 1.5, y: 1.5, z: 1.5,
            duration: 0.8,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut"
        });
        
        // Схлопывание звезд (30 секунд)
        gsap.to(starField.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 30, ease: "power3.in" });
        
        // Приближение камеры к точке
        gsap.to(camera.position, {
            y: 50,
            duration: 40,
            ease: "none",
            onUpdate: () => {
                camera.rotation.set(-Math.PI / 2, 0, 0);
            }
        });

        // ПЛАВНОЕ ИСЧЕЗНОВЕНИЕ ТОЧКИ в самом конце
        const fadeTL = gsap.timeline({ delay: 35 });
        fadeTL.to(redDot.material, { 
            opacity: 0, 
            duration: 4, 
            ease: "sine.inOut", 
            onComplete: () => {
                redDot.visible = false;
                scene.children.forEach(obj => {
                    if (obj.isMesh || obj.isSprite || obj.isPoints) obj.visible = false;
                });
            }
        });

        // --- ЭФФЕКТ ОБРАТНОЙ ПЕРЕМОТКИ ---
        // Появление на последних этапах пути звезд (через 26 секунд)
        setTimeout(() => {
            console.log("Starting masked rewind effect shortly before collapse ends");
            
            // СТРОГО ЦЕНТРИРУЕМ ПЛОСКОСТЬ ПЕРЕМОТКИ (могла остаться с интро на позиции 1-й картинки)
            rewindPlane.position.set(0, 200, 0); 
            rewindPlane.rotation.set(-Math.PI / 2, 0, 0);
            rewindPlane.visible = true;
            
            const rewindImages = [...textures].slice(1, 55).reverse(); 
            const stepDuration = 0.04; 
            
            gsap.fromTo(rewindPlane.scale, 
                { x: 15, y: 15, z: 1 }, 
                { x: 0.1, y: 0.1, z: 0.1, duration: rewindImages.length * stepDuration, ease: "power2.in" }
            );
            gsap.fromTo(rewindPlane.material.uniforms.uIntensity, 
                { value: 1.0 }, 
                { value: 0.0, duration: rewindImages.length * stepDuration, ease: "power2.in" }
            );

            rewindImages.forEach((tex, i) => {
                setTimeout(() => {
                    if (rewindPlane.visible) {
                        rewindPlane.material.uniforms.uTexture.value = tex;
                        rewindPlane.material.uniforms.uTime.value = performance.now() * 0.001;
                    }
                }, i * stepDuration * 1000);
            });
            
            imagePlanes.forEach(p => p.visible = false);
            finalPlane.visible = false;

        }, 26000); 
        
        gsap.to("#fade-overlay", { opacity: 1, duration: 10, delay: 35 });
    }, "+=18");
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

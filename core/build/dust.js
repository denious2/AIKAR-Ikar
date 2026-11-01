import fs from 'fs';
import path from 'path';
import { createLogger, loadConfigs } from '../config_loader.js';

const rootDir = process.cwd();
const log = createLogger(rootDir);

try {
    log("=== СТАРТ СБОРКИ АТМОСФЕРЫ (DUST & NOISE ENGINE) ===");
    
    const { config, library } = loadConfigs(rootDir);
    
    const isTest = config.testMode && config.testMode.enabled;
    const totalDuration = isTest ? config.testMode.duration : config.project.totalDuration;
    
    const particlesCount = 50; 
    const compDir = path.join(rootDir, 'compositions');

    // Вытягиваем дизайн из библиотеки
    const activeLighting = config.effects.lightingStyle || "static_lamp";
    const activeColorGrade = config.effects.colorGrade || "none";
    const activeNoise = config.effects.noiseStyle || "soft_white";

    const lightingCSS = library.effectsPool?.lighting?.[activeLighting] || "";
    const colorGradingCSS = library.effectsPool?.colorGrading?.[activeColorGrade] || "";
    const noiseCSS = library.effectsPool?.noiseStyles?.[activeNoise] || "";
    const swingingLampKeyframes = library.effectsPool?.movements?.swingingLamp || "";

    // Подтягиваем SVG-фильтры
    let svgFiltersHTML = `<svg style="position: absolute; width: 0; height: 0;" xmlns="http://www.w3.org/2000/svg">
    <filter id="boil">
        <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="3" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" />
    </filter>
</svg>`;
    if (library.effectsPool?.svgFilters) {
        Object.values(library.effectsPool.svgFilters).forEach(svg => svgFiltersHTML += `\n${svg}`);
    }

    let html = `<!DOCTYPE html>
<html>
<head>
    <style>
        body { margin: 0; background: transparent; overflow: hidden; }
        #root { position: absolute; width: 100vw; height: 100vh; overflow: hidden; pointer-events: none; }
        
        /* Обертка теперь управляется нодами из reactors.css (переменная --beat) */
        .texture-wrapper { position: absolute; width: 100%; height: 100%; }

        .vignette-layer {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            box-shadow: inset 0 0 150px rgba(0,0,0,0.85);
            z-index: 10;
        }

        .table-lamp-light {
            position: absolute; top: -50%; left: -50%; width: 200%; height: 200%;
            z-index: 11;
            ${lightingCSS}
        }

        @keyframes swingingLamp {
            ${swingingLampKeyframes}
        }

        .noise-layer {
            position: absolute; top: -10%; left: -10%; width: 120%; height: 120%;
            z-index: 12;
            ${noiseCSS}
        }

        .color-grading-layer {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            z-index: 15;
            pointer-events: none;
            ${colorGradingCSS}
        }

        .dust {
            position: absolute; background: #050505; border-radius: 40%; 
            animation-name: dustFall; animation-timing-function: linear;
            animation-iteration-count: infinite; z-index: 13;
        }
        
        @keyframes dustFall {
            0% { opacity: 0; transform: translateY(-5vh) translateX(0) rotate(0deg); }
            10% { opacity: var(--max-opacity); }
            90% { opacity: var(--max-opacity); }
            100% { opacity: 0; transform: translateY(20vh) translateX(4vw) rotate(180deg); }
        }
    </style>
</head>
<body>
    ${svgFiltersHTML}
    <div id="root" data-composition-id="dust_scene" data-width="${config.project.resolution.width}" data-height="${config.project.resolution.height}" data-duration="${totalDuration}">
        <div class="vignette-layer"></div>
        <div class="table-lamp-light" style="--total-dur: ${totalDuration}s;"></div>
        <div class="noise-layer"></div>
        <div class="color-grading-layer"></div>
        <div class="texture-wrapper">
`;

    for (let i = 0; i < particlesCount; i++) {
        const size = (Math.random() * 1 + 0.5).toFixed(1); 
        const left = (Math.random() * 100).toFixed(1); 
        const top = (Math.random() * 100).toFixed(1); 
        const duration = (Math.random() * 15 + 10).toFixed(2); 
        const delay = (Math.random() * -20).toFixed(2); 
        const maxOpacity = (Math.random() * 0.1 + 0.05).toFixed(2); 
        html += `           <div class="dust" style="width: ${size}px; height: ${size}px; left: ${left}vw; top: ${top}vh; --max-opacity: ${maxOpacity}; animation-duration: ${duration}s; animation-delay: ${delay}s;"></div>\n`;
    }

    html += `       </div></div>
    <script>
        window.__timelines = window.__timelines || {};
        window.__timelines["dust_scene"] = document.querySelector('[data-composition-id="dust_scene"]');
    </script>
</body></html>`;

    if (!fs.existsSync(compDir)) fs.mkdirSync(compDir, { recursive: true });
    fs.writeFileSync(path.join(compDir, 'dust_scene.html'), html, 'utf8');
    
    log(`✅ УСПЕХ! Атмосфера очищена от захардкоженных битов. Цвет: ${activeColorGrade}`);
} catch (e) { 
    log(`❌ Ошибка в dust.js: ${e.message}`); 
}
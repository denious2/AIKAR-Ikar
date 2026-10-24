import fs from 'fs';
import path from 'path';

try {
    console.log("=== СТАРТ СБОРКИ ПЫЛИ И ЦВЕТОКОРРЕКЦИИ (LUT, NOISE & BEAT SYNC) ===");
    
    const configPath = path.join(process.cwd(), 'config.json');
    const libraryPath = path.join(process.cwd(), 'library-config.json');
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    // Читаем библиотеку, так как все эффекты переехали туда
    const library = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));
    
    const isTest = config.testMode && config.testMode.enabled;
    const totalDuration = isTest ? config.testMode.duration : config.project.totalDuration;
    const testStart = isTest ? config.testMode.start : 0;
    const testEnd = testStart + totalDuration;
    
    const particlesCount = 50; 
    const compDir = path.join(process.cwd(), 'compositions');

    // === ВЫТЯГИВАЕМ ДИЗАЙН ИЗ БИБЛИОТЕКИ ===
    const activeLighting = config.effects.lightingStyle || "static_lamp";
    const activeColorGrade = config.effects.colorGrade || "none";
    const activeNoise = config.effects.noiseStyle || "soft_white";

    const lightingCSS = library.effectsPool.lighting[activeLighting] || "";
    const colorGradingCSS = library.effectsPool.colorGrading[activeColorGrade] || "";
    const noiseCSS = library.effectsPool.noiseStyles[activeNoise] || "";
    const swingingLampKeyframes = library.effectsPool.movements.swingingLamp || "";

    let trackBeats = [];
    if (fs.existsSync('beats.json')) trackBeats = JSON.parse(fs.readFileSync('beats.json', 'utf8')).beats || [];

    let beatCSS = "";
    let wrapperStyle = "";
    const activeBeats = trackBeats.filter(b => b >= testStart && b <= testEnd);
    
    if (activeBeats.length > 0) {
        beatCSS += `@keyframes dustPump {\n  0%, 100% { filter: brightness(1); transform: scale(1); }\n`;
        activeBeats.forEach(b => {
            const relBeat = b - testStart;
            const pPeak = (relBeat / totalDuration) * 100;
            const pEnd = pPeak + ((0.2 / totalDuration) * 100); 
            if (pPeak >= 0 && pPeak <= 100) beatCSS += `  ${pPeak.toFixed(2)}% { filter: brightness(0.5); transform: scale(1.05); }\n`;
            if (pEnd >= 0 && pEnd <= 100) beatCSS += `  ${pEnd.toFixed(2)}% { filter: brightness(1); transform: scale(1); }\n`;
        });
        beatCSS += `}\n`;
        wrapperStyle = `animation: dustPump ${totalDuration}s linear forwards;`;
    }

    // Подтягиваем SVG-фильтры (включая boil)
    let svgFiltersHTML = `<svg style="position: absolute; width: 0; height: 0;" xmlns="http://www.w3.org/2000/svg">
    <filter id="boil">
        <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="3" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" />
    </filter>
</svg>`;
    if (library.effectsPool.svgFilters) {
        Object.values(library.effectsPool.svgFilters).forEach(svg => svgFiltersHTML += `\n${svg}`);
    }

    let html = `<!DOCTYPE html>
<html>
<head>
    <style>
        body { margin: 0; background: transparent; overflow: hidden; }
        #root { position: absolute; width: 100vw; height: 100vh; overflow: hidden; pointer-events: none; }
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

        /* 1. ДИНАМИЧЕСКИЙ ШУМ ИЗ КОНФИГА */
        .noise-layer {
            position: absolute; top: -10%; left: -10%; width: 120%; height: 120%;
            z-index: 12;
            ${noiseCSS}
        }

        /* 2. ГЛОБАЛЬНЫЙ КОРРЕКТИРУЮЩИЙ СЛОЙ ЦВЕТА (LUT) */
        .color-grading-layer {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            z-index: 15;
            pointer-events: none;
            ${colorGradingCSS}
        }

        @keyframes filmJitter {
            0% { transform: translate(0, 0); } 33% { transform: translate(-1%, 1%); }
            66% { transform: translate(1%, -1%); } 100% { transform: translate(0, 0); }
        }

        ${beatCSS}

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
        <div class="texture-wrapper" style="${wrapperStyle}">
`;

    for (let i = 0; i < particlesCount; i++) {
        const size = (Math.random() * 1 + 0.5).toFixed(1); 
        const left = (Math.random() * 100).toFixed(1); 
        const top = (Math.random() * 100).toFixed(1); 
        const duration = (Math.random() * 15 + 10).toFixed(2); 
        const delay = (Math.random() * -20).toFixed(2); 
        const maxOpacity = (Math.random() * 0.1 + 0.05).toFixed(2); 
        html += `            <div class="dust" style="width: ${size}px; height: ${size}px; left: ${left}vw; top: ${top}vh; --max-opacity: ${maxOpacity}; animation-duration: ${duration}s; animation-delay: ${delay}s;"></div>\n`;
    }

    html += `        </div></div>
    <script>
        window.__timelines = window.__timelines || {};
        window.__timelines["dust_scene"] = document.querySelector('[data-composition-id="dust_scene"]');
    </script>
</body></html>`;

    if (!fs.existsSync(compDir)) fs.mkdirSync(compDir, { recursive: true });
    fs.writeFileSync(path.join(compDir, 'dust_scene.html'), html, 'utf8');
    
    console.log(`✅ УСПЕХ! Сгенерированы атмосфера (Цвет: ${activeColorGrade}, Шум: ${activeNoise}). С пульсацией по биту.`);
} catch (e) { 
    console.error("❌ Ошибка:", e.message); 
}
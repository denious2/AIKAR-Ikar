import fs from 'fs';
import path from 'path';

try {
    console.log("=== СТАРТ ГЕНЕРАЦИИ INDEX.HTML (МЯГКИЙ SHADOW CRUSH И КИНЕТИЧЕСКИЙ БАС) ===");
    const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    const director = JSON.parse(fs.readFileSync('director-config.json', 'utf8'));
    const library = JSON.parse(fs.readFileSync('library-config.json', 'utf8'));
    
    const resW = config.project.resolution.width;
    const resH = config.project.resolution.height;
    const isTest = config.testMode && config.testMode.enabled;
    const duration = isTest ? config.testMode.duration : config.project.totalDuration;
    const testStart = isTest ? config.testMode.start : 0;
    const testEnd = testStart + duration;
    const compDir = path.join(process.cwd(), 'compositions');

    // --- ЧТЕНИЕ ОГИБАЮЩЕЙ БАСА (АУДИО-РЕАКТИВНОСТЬ) ---
    let bassCss = '';
    let rootBassAnimation = '';
    try {
        const bassPath = path.join(process.cwd(), 'bass.json');
        if (fs.existsSync(bassPath)) {
            const bassData = JSON.parse(fs.readFileSync(bassPath, 'utf8'));
            const frames = bassData.frames;
            if (frames && frames.length > 0) {
                bassCss += `@keyframes global-bass-pulse {\n`;
                frames.forEach((val, i) => {
                    const percent = (i / (frames.length - 1)) * 100;
                    bassCss += `  ${percent.toFixed(3)}% { --bass: ${val}; }\n`;
                });
                bassCss += `}\n`;
                
                const syncDuration = config.project.totalDuration; 
                rootBassAnimation = `animation: global-bass-pulse ${syncDuration}s linear forwards;`;
                console.log(`🔊 Аудио-реактивность (--bass) подключена! Кадров: ${frames.length}`);
            }
        }
    } catch (e) {
        console.log(`⚠️ Ошибка загрузки bass.json: ${e.message}`);
    }

    // --- ДОСТАЕМ ЦВЕТОКОРРЕКЦИЮ (LUT) И НАСТРОЙКИ ВСПЫШЕК ---
    const colorGradeKey = config.effects?.colorGrade || "none";
    const colorGradeCss = library.effectsPool?.colorGrading?.[colorGradeKey] || "display: none;";
    const flashBlendMode = config.effects?.flashes?.blendMode || "normal";

    const structure = (director.songStructure || config.songStructure).sort((a, b) => a.time - b.time);
    const sectionRulesMap = director.sectionTypeRules || config.sectionTypeRules || {};
    let globalFilterLayers = "";

    for (let i = 0; i < structure.length; i++) {
        const block = structure[i];
        const rules = sectionRulesMap[block.type];
        
        if (rules && rules.globalFilter) {
            const filterKey = rules.globalFilter;
            const filterCss = library.effectsPool?.globalFilters?.[filterKey] || filterKey;

            const absStart = block.time;
            const absEnd = (i < structure.length - 1) ? structure[i + 1].time : config.project.totalDuration;
            
            if (isTest && (absEnd <= testStart || absStart >= testEnd)) continue;
            
            const start = isTest ? Math.max(absStart, testStart) : absStart;
            const end = isTest ? Math.min(absEnd, testEnd) : absEnd;
            const blockDur = end - start;
            
            if (blockDur > 0) {
                const renderStart = isTest ? (start - testStart) : start;
                globalFilterLayers += `\n        <!-- ГЛОБАЛЬНЫЙ ФИЛЬТР (${block.name}) -->\n        <div id="global-filter-${i}" class="composition-layer clip" style="z-index: 9999; pointer-events: none; ${filterCss}" data-in="0" data-out="${blockDur.toFixed(3)}" data-start="${renderStart.toFixed(3)}" data-duration="${blockDur.toFixed(3)}" data-track-index="10"></div>\n`;
            }
        }
    }

    const accentsCssPath = path.join(compDir, 'accents_camera.css');
    const accentsHtmlPath = path.join(compDir, 'accents_scene.html');
    
    const cameraShakeCss = fs.existsSync(accentsCssPath) ? fs.readFileSync(accentsCssPath, 'utf8') : '';
    const shakeClass = fs.existsSync(accentsCssPath) ? 'global-shake-active' : '';
    const accentsBlendMode = director.accents?.videoGlitches?.blendMode || "screen";

    const accentsHtmlLayer = fs.existsSync(accentsHtmlPath) 
        ? `\n        <!-- 4.6 АКЦЕНТЫ (ВИДЕО-ГЛИТЧИ) -->\n        <div id="host-accents" data-composition-id="accents_scene" class="composition-layer clip" style="z-index: 9999; pointer-events: none; mix-blend-mode: ${accentsBlendMode};" data-in="0" data-out="${duration}" data-start="0" data-duration="${duration}" data-track-index="46" data-composition-src="compositions/accents_scene.html"></div>` 
        : '';

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${config.project.name}</title>
    <style>
        :root {
            --bass: 0;
            ${rootBassAnimation}
        }
        body { margin: 0; background: #000; overflow: hidden; }
        #root { position: absolute; width: ${resW}px; height: ${resH}px; overflow: hidden; }
        .composition-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
        
        /* ========================================= */
        /* SHADOW CRUSH (МЯГКИЕ ТЕНИ ПОД БАС)        */
        /* ========================================= */
        #shadow-crush-overlay {
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            background: #000000;
            mix-blend-mode: multiply; 
            /* >>> ИСПРАВЛЕНО: Приглушили силу затемнения с 0.75 до 0.4 <<< */
            opacity: calc(var(--bass) * 0.4); 
            pointer-events: none;
            /* Выше фона и картинок, но ниже субтитров и цветокора */
            z-index: 9950; 
            /* Резкое появление и тяжелое, вязкое затухание (0.3s) */
            transition: opacity 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        }

        /* ========================================= */
        /* ТИПОГРАФИЧЕСКИЙ БАС (ГЛОБАЛЬНЫЙ КОНТЕЙНЕР)*/
        /* ========================================= */
        #host-subs {
            transform: scale(calc(1 + var(--bass) * 0.04));
            transition: transform 0.05s ease-out;
            text-align: center; 
        }

        ${cameraShakeCss}
        ${bassCss}
    </style>
</head>
<body>
    <div id="root" data-composition-id="root_scene" data-width="${resW}" data-height="${resH}" data-duration="${duration}">
        
        <!-- 0. АУДИО ТРЕК (Слой -1) -->
        <div id="host-audio" data-composition-id="audio_scene" class="composition-layer clip" data-in="0" data-out="${duration}" data-start="0" data-duration="${duration}" data-track-index="-1" data-composition-src="compositions/audio_scene.html"></div>

        <!-- 1. ФОНОВЫЕ ЭФФЕКТЫ -->
        <div id="host-visuals-bg" data-composition-id="visuals_bg_scene" class="composition-layer clip ${shakeClass}" style="mix-blend-mode: multiply; z-index: 10;" data-in="0" data-out="${duration}" data-start="0" data-duration="${duration}" data-track-index="1" data-composition-src="compositions/visuals_bg_scene.html"></div>
        
        <!-- 2. ГЛАВНЫЕ СЮЖЕТЫ -->
        <div id="host-images" data-composition-id="images_scene" class="composition-layer clip ${shakeClass}" style="z-index: 20;" data-in="0" data-out="${duration}" data-start="0" data-duration="${duration}" data-track-index="2" data-composition-src="compositions/images_scene.html"></div>
        
        <!-- 3. ПЕРЕДНИЕ ЭФФЕКТЫ -->
        <div id="host-visuals-fg" data-composition-id="visuals_fg_scene" class="composition-layer clip ${shakeClass}" style="mix-blend-mode: multiply; z-index: 30;" data-in="0" data-out="${duration}" data-start="0" data-duration="${duration}" data-track-index="3" data-composition-src="compositions/visuals_fg_scene.html"></div>
        
        <!-- 4. ТЕКСТУРА: Пыль, Шум -->
        <div id="host-dust" data-composition-id="dust_scene" class="composition-layer clip ${shakeClass}" style="mix-blend-mode: multiply; z-index: 90;" data-in="0" data-out="${duration}" data-start="0" data-duration="${duration}" data-track-index="4" data-composition-src="compositions/dust_scene.html"></div>

        <!-- 4.5 РИТМИЧЕСКИЕ ВСПЫШКИ (STROBE) -->
        <div id="host-beats" data-composition-id="beats_scene" class="composition-layer clip" style="mix-blend-mode: ${flashBlendMode}; z-index: 95; pointer-events: none;" data-in="0" data-out="${duration}" data-start="0" data-duration="${duration}" data-track-index="45" data-composition-src="compositions/beats_scene.html"></div>

        <!-- >>> НОВЫЙ СЛОЙ: SHADOW CRUSH (УПЛОТНЕНИЕ ТЕНЕЙ) <<< -->
        <div id="shadow-crush-overlay" class="clip" data-in="0" data-out="${duration}" data-start="0" data-duration="${duration}"></div>

        <!-- 5. СУБТИТРЫ (Кинетический якорь) -->
        <div id="host-subs" data-composition-id="subs_scene" class="composition-layer clip" style="z-index: 10000;" data-in="0" data-out="${duration}" data-start="0" data-duration="${duration}" data-track-index="5" data-composition-src="compositions/subs_scene.html"></div>
        
        <!-- 6. ЦВЕТОКОРРЕКЦИЯ (LUT) -->
        <div id="host-color-grade" class="composition-layer clip" style="z-index: 9998; pointer-events: none; ${colorGradeCss}" data-in="0" data-out="${duration}" data-start="0" data-duration="${duration}" data-track-index="6"></div>

        ${accentsHtmlLayer}
        ${globalFilterLayers}
    </div>
    <script>
        window.__timelines = window.__timelines || {};
        window.__timelines["root_scene"] = document.querySelector('[data-composition-id="root_scene"]');
    </script>
</body>
</html>`;

    fs.writeFileSync('index.html', html, 'utf8');
    console.log(`✅ index.html успешно сгенерирован (Внедрен мягкий Shadow Crush и Kinetic Anchor).`);
} catch (e) {
    console.error("❌ Ошибка в build_index.js:", e.message);
    process.exit(1);
}
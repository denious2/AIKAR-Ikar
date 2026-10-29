import fs from 'fs';
import path from 'path';

try {
    console.log("=== СТАРТ ГЕНЕРАЦИИ INDEX.HTML (ДИНАМИЧЕСКИЕ СЛОИ) ===");
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

    // --- ДОСТАЕМ ЦВЕТОКОРРЕКЦИЮ (LUT) И НАСТРОЙКИ ВСПЫШЕК ---
    const colorGradeKey = config.effects?.colorGrade || "none";
    const colorGradeCss = library.effectsPool?.colorGrading?.[colorGradeKey] || "display: none;";
    
    // Бленд-мод для ритмических вспышек (защита от их отсутствия)
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

    // --- ЧТЕНИЕ ФИЗИКИ И СЛОЕВ АКЦЕНТОВ ---
    const accentsCssPath = path.join(compDir, 'accents_camera.css');
    const accentsHtmlPath = path.join(compDir, 'accents_scene.html');
    
    // Подключаем CSS только если файл физически существует (сгенерирован)
    const cameraShakeCss = fs.existsSync(accentsCssPath) ? fs.readFileSync(accentsCssPath, 'utf8') : '';
    const shakeClass = fs.existsSync(accentsCssPath) ? 'global-shake-active' : '';

    // >>> ИЗВЛЕКАЕМ РЕЖИМ НАЛОЖЕНИЯ ИЗ КОНФИГА <<<
    const accentsBlendMode = director.accents?.videoGlitches?.blendMode || "screen";

    // >>> ДОБАВЛЯЕМ mix-blend-mode ПРЯМО НА ХОСТ-КОНТЕЙНЕР В INDEX.HTML <<<
    // Подключаем HTML-слой акцентов только если он сгенерирован
    const accentsHtmlLayer = fs.existsSync(accentsHtmlPath) 
        ? `\n        <!-- 4.6 АКЦЕНТЫ (ВИДЕО-ГЛИТЧИ) -->\n        <div id="host-accents" data-composition-id="accents_scene" class="composition-layer clip" style="z-index: 9999; pointer-events: none; mix-blend-mode: ${accentsBlendMode};" data-in="0" data-out="${duration}" data-start="0" data-duration="${duration}" data-track-index="46" data-composition-src="compositions/accents_scene.html"></div>` 
        : '';

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${config.project.name}</title>
    <style>
        body { margin: 0; background: #fdfdfd; overflow: hidden; }
        #root { position: absolute; width: ${resW}px; height: ${resH}px; overflow: hidden; }
        .composition-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
        ${cameraShakeCss}
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
        
        <!-- 4. ТЕКСТУРА: Пыль, Шум (С MULTIPLY) -->
        <div id="host-dust" data-composition-id="dust_scene" class="composition-layer clip ${shakeClass}" style="mix-blend-mode: multiply; z-index: 90;" data-in="0" data-out="${duration}" data-start="0" data-duration="${duration}" data-track-index="4" data-composition-src="compositions/dust_scene.html"></div>

        <!-- 4.5 РИТМИЧЕСКИЕ ВСПЫШКИ (STROBE) -->
        <div id="host-beats" data-composition-id="beats_scene" class="composition-layer clip" style="mix-blend-mode: ${flashBlendMode}; z-index: 95; pointer-events: none;" data-in="0" data-out="${duration}" data-start="0" data-duration="${duration}" data-track-index="45" data-composition-src="compositions/beats_scene.html"></div>

        <!-- 5. СУБТИТРЫ (Изолированы от тряски) -->
        <div id="host-subs" data-composition-id="subs_scene" class="composition-layer clip" style="z-index: 100;" data-in="0" data-out="${duration}" data-start="0" data-duration="${duration}" data-track-index="5" data-composition-src="compositions/subs_scene.html"></div>
        
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
    console.log(`✅ index.html успешно сгенерирован (Режим наложения акцентов перенесен на мастер-хост).`);
} catch (e) {
    console.error("❌ Ошибка в build_index.js:", e.message);
    process.exit(1);
}
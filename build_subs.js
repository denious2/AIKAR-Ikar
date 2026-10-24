import fs from 'fs';
import path from 'path';

try {
    console.log("=== СТАРТ СБОРКИ СУБТИТРОВ (ЖЕСТКИЙ КОНТРОЛЬ ОШИБОК + БИБЛИОТЕКА) ===");
    
    const configPath = path.join(process.cwd(), 'config.json');
    const directorPath = path.join(process.cwd(), 'director-config.json');
    const libraryPath = path.join(process.cwd(), 'library-config.json');
    
    if (!fs.existsSync(configPath)) throw new Error("config.json не найден");
    if (!fs.existsSync(directorPath)) throw new Error("director-config.json не найден");
    if (!fs.existsSync(libraryPath)) throw new Error("library-config.json не найден");

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const director = JSON.parse(fs.readFileSync(directorPath, 'utf8'));
    const library = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));
    const compDir = path.join(process.cwd(), 'compositions');
    
    const subsFile = config.media.subtitlesFile;
    if (!fs.existsSync(subsFile)) {
        throw new Error(`Файл субтитров не найден по пути: ${subsFile}`);
    }

    const isTest = config.testMode && config.testMode.enabled;
    const totalDuration = isTest ? config.testMode.duration : config.project.totalDuration;
    const testStart = isTest ? config.testMode.start : 0;
    const testEnd = testStart + totalDuration;

    let cssLibrary = "";
    let svgFiltersHTML = "";
    let defaultTextStyle = "retro_box"; // Хардкодный fallback на всякий случай
    
    // ИЗМЕНЕНИЕ: Читаем стили из библиотеки, а не из директора
    if (library.effectsPool) {
        if (library.effectsPool.fonts) {
            Object.values(library.effectsPool.fonts).forEach(font => cssLibrary += `${font}\n`);
        }
        if (library.effectsPool.textStyles) {
            const styleKeys = Object.keys(library.effectsPool.textStyles);
            if (styleKeys.length > 0) defaultTextStyle = styleKeys[0];

            Object.entries(library.effectsPool.textStyles).forEach(([name, style]) => {
                cssLibrary += `.subtitle-style-${name} { ${style} }\n`;
            });
        }
        if (library.effectsPool.movements) {
            Object.entries(library.effectsPool.movements).forEach(([name, keyframes]) => {
                cssLibrary += `@keyframes ${name} { ${keyframes} }\n`;
            });
        }
        if (library.effectsPool.appearances) {
            Object.entries(library.effectsPool.appearances).forEach(([name, keyframes]) => {
                cssLibrary += `@keyframes ${name} { ${keyframes} }\n`;
            });
        }
        if (library.effectsPool.svgFilters) {
            Object.values(library.effectsPool.svgFilters).forEach(svg => svgFiltersHTML += `${svg}\n`);
        }
    }

    let subsHTML = "";
    const srt = fs.readFileSync(subsFile, 'utf8');
    
    function timeToSec(timeStr) {
        const parts = timeStr.trim().replace(',', '.').split(':');
        return (parseFloat(parts[0]) * 3600) + (parseFloat(parts[1]) * 60) + parseFloat(parts[2]);
    }

    const blocks = srt.replace(/\r/g, '').trim().split(/\n\s*\n/);
    let subIndex = 0;
    
    blocks.forEach(block => {
        const lines = block.split('\n');
        const timeIndex = lines.findIndex(l => l.includes('-->'));
        if (timeIndex !== -1) {
            const times = lines[timeIndex].split(/\s*-->\s*/);
            if (times.length >= 2) {
                const absStart = timeToSec(times[0]);
                const absEnd = timeToSec(times[1]);
                
                if (isTest && (absEnd <= testStart || absStart >= testEnd)) return;
                
                const renderStart = isTest ? Math.max(0, absStart - testStart) : absStart;
                const renderEnd = isTest ? Math.min(totalDuration, absEnd - testStart) : absEnd;
                const duration = renderEnd - renderStart;

                const text = lines.slice(timeIndex + 1).join('<br>');
                const subId = `sub-clip-${subIndex}`;
                
                // Безопасное определение стиля без ?.
                let overrideStyle = null;
                if (config.effects && config.effects.subtitleStyle) {
                    overrideStyle = config.effects.subtitleStyle;
                }
                const activeStyle = `subtitle-style-${overrideStyle || defaultTextStyle}`;

                subsHTML += `
<div id="${subId}" class="clip subtitle-wrapper" data-in="${renderStart.toFixed(3)}" data-out="${renderEnd.toFixed(3)}" data-start="${renderStart.toFixed(3)}" data-duration="${duration.toFixed(3)}" data-track-index="6">
    <div class="subtitle-animator" style="--dur: ${duration.toFixed(3)}s;">
        <span class="subtitle-text-inline ${activeStyle}">${text}</span>
    </div>
</div>`;
                subIndex++;
            }
        }
    });
    console.log(`Обработано ${subIndex} титульных строк.`);

    const html = `<!DOCTYPE html>
<html>
<head>
<style>
    body { margin: 0; background: transparent; overflow: hidden; }
    #root { position: absolute; width: 100vw; height: 100vh; pointer-events: none; }
    
    .subtitle-wrapper {
        position: absolute; width: 100vw; height: 100vh;
        display: flex; align-items: center; justify-content: center;
        perspective: 1000px;
        font-size: 26px; 
    }

    .subtitle-animator {
        width: 85%;
        max-width: 680px;
        text-align: center;
        animation: fly_up_fade var(--dur) ease-out forwards, micro_jitter 0.12s infinite;
    }

    .subtitle-text-inline {
        font-size: 3.5em !important; 
        white-space: pre-line; 
        display: inline;
    }
    
    ${cssLibrary}
</style>
</head>
<body>
${svgFiltersHTML}
<div id="root" data-composition-id="subs_scene" data-width="${config.project.resolution.width}" data-height="${config.project.resolution.height}" data-duration="${totalDuration}">
${subsHTML}
</div>
<script>
    // ДОБАВЛЕНО: Ждем загрузки шрифтов, чтобы не было пустых квадратов на рендере
    document.fonts.ready.then(() => {
        window.__timelines = window.__timelines || {};
        window.__timelines["subs_scene"] = document.querySelector('[data-composition-id="subs_scene"]');
    });
</script>
</body>
</html>`;

    if (!fs.existsSync(compDir)) fs.mkdirSync(compDir, { recursive: true });
    fs.writeFileSync(path.join(compDir, 'subs_scene.html'), html, 'utf8');
    console.log("✅ УСПЕХ! HTML файл субтитров перезаписан.");
} catch (e) {
    console.error("❌ ОШИБКА В BUILD_SUBS.JS:", e.message);
    process.exit(1); 
}
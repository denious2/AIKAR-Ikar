import fs from 'fs';
import path from 'path';
import { createLogger, loadConfigs } from '../config_loader.js';

const rootDir = process.cwd();
const log = createLogger(rootDir);

try {
    log("=== СТАРТ СБОРКИ СУБТИТРОВ (КИНЕТИЧЕСКИЙ БАС И СКЛЕЙКА ПРЕДЛОГОВ) ===");
    
    // Используем нашу утилиту для загрузки конфигов
    const { config, director, library } = loadConfigs(rootDir);
    const compDir = path.join(rootDir, 'compositions');
    if (!fs.existsSync(compDir)) fs.mkdirSync(compDir, { recursive: true });

    const outputPath = path.join(compDir, 'subs_scene.html');

    // --- ЗАЩИТА ОТ ОТСУТСТВИЯ СУБТИТРОВ ---
    const generateEmptyScene = () => {
        const emptyHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
    <div id="root" data-composition-id="subs_scene"></div>
    <script>
        window.__timelines = window.__timelines || {};
        window.__timelines["subs_scene"] = document.querySelector('#root');
    </script>
</body>
</html>`;
        fs.writeFileSync(outputPath, emptyHtml, 'utf8');
        log("ℹ️ Субтитры отключены или файл не найден. Сгенерирована пустая сцена.");
    };

    const subPathRel = config.media?.subtitlesFile;

    if (!subPathRel || subPathRel.trim() === '') {
        generateEmptyScene();
        process.exit(0);
    }

    const subsFile = path.join(rootDir, subPathRel);

    if (!fs.existsSync(subsFile) || fs.statSync(subsFile).isDirectory()) {
        log(`⚠️ ВНИМАНИЕ: Файл субтитров не найден или является папкой по пути: ${subsFile}`);
        generateEmptyScene();
        process.exit(0);
    }
    // ----------------------------------------

    const isTest = config.testMode && config.testMode.enabled;
    const totalDuration = isTest ? config.testMode.duration : config.project.totalDuration;
    const testStart = isTest ? config.testMode.start : 0;
    const testEnd = testStart + totalDuration;

    let cssLibrary = "";
    let svgFiltersHTML = "";
    let defaultTextStyle = "retro_box"; 
    
    // Полный парсинг библиотеки эффектов
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

    let globalFontCss = "";
    if (config.effects?.subtitles?.useCustomFont && config.effects?.subtitles?.fontFamily) {
        globalFontCss = `
        .subtitle-wrapper * { 
            font-family: ${config.effects.subtitles.fontFamily} !important; 
        }`;
    }

    const structure = (director.songStructure || config.songStructure).sort((a, b) => a.time - b.time);
    const rulesMap = director.sectionTypeRules || config.sectionTypeRules || {};

    function getStyleForTime(time) {
        let currentSection = structure[0];
        for (let i = 0; i < structure.length; i++) {
            if (time >= structure[i].time) {
                currentSection = structure[i];
            } else {
                break;
            }
        }
        const rule = rulesMap[currentSection?.type];
        const override = config.effects && config.effects.subtitleStyle;
        const styleKey = (rule && rule.textStyle) ? rule.textStyle : (override || defaultTextStyle);
        return `subtitle-style-${styleKey}`;
    }

    let subsHTML = "";
    const srt = fs.readFileSync(subsFile, 'utf8');
    
    function timeToSec(timeStr) {
        const parts = timeStr.trim().replace(',', '.').split(':');
        return (parseFloat(parts[0]) * 3600) + (parseFloat(parts[1]) * 60) + parseFloat(parts[2]);
    }

    // Разбивка фразы на слова с защитой коротких предлогов
    function processTextForBass(rawText) {
        let text = rawText.replace(/<br\s*\/?>/gi, ' _BR_ ');
        
        // Приклеиваем слова из 1-3 букв к следующему слову неразрывным пробелом (&nbsp;)
        text = text.replace(/(^|\s)([а-яА-ЯёЁa-zA-Z]{1,3})\s+/g, '$1$2&nbsp;');
        // Прогоняем второй раз для случаев, когда идут два коротких слова подряд
        text = text.replace(/(^|\s)([а-яА-ЯёЁa-zA-Z]{1,3})\s+/g, '$1$2&nbsp;');

        const words = text.split(/\s+/).filter(w => w.length > 0);
        
        let htmlOut = '';
        words.forEach(word => {
            if (word === '_BR_') {
                htmlOut += '<br>';
            } else {
                htmlOut += `<span class="bass-word">${word}</span> `;
            }
        });
        return htmlOut.trim();
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

                const rawText = lines.slice(timeIndex + 1).join('<br>');
                const processedHtmlText = processTextForBass(rawText);
                
                const subId = `sub-clip-${subIndex}`;
                const activeStyle = getStyleForTime(absStart);

                subsHTML += `
<div id="${subId}" class="clip subtitle-wrapper" data-in="${renderStart.toFixed(3)}" data-out="${renderEnd.toFixed(3)}" data-start="${renderStart.toFixed(3)}" data-duration="${duration.toFixed(3)}" data-track-index="6">
    <div class="subtitle-animator" style="--dur: ${duration.toFixed(3)}s;">
        <span class="subtitle-text-inline ${activeStyle}">${processedHtmlText}</span>
    </div>
</div>`;
                subIndex++;
            }
        }
    });
    log(`Обработано ${subIndex} титульных строк (предлоги склеены).`);

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
        white-space: normal; 
        display: inline-block;
    }
    
    /* Кинетическая реакция слов на бас (CSS transition удален для совместимости с Hyperframes) */
    .bass-word {
        display: inline-block;
        letter-spacing: calc(var(--bass) * 8px);
        padding: 0 calc(var(--bass) * 4px);
        transform: scale(calc(1 + var(--bass) * 0.05));
    }
    
    ${globalFontCss}
    ${cssLibrary}
</style>
</head>
<body>
${svgFiltersHTML}
<div id="root" data-composition-id="subs_scene" data-width="${config.project.resolution.width}" data-height="${config.project.resolution.height}" data-duration="${totalDuration}">
${subsHTML}
</div>
<script>
    // Ждем загрузки шрифтов, если они есть
    document.fonts.ready.then(() => {
        window.__timelines = window.__timelines || {};
        window.__timelines["subs_scene"] = document.querySelector('[data-composition-id="subs_scene"]');
    });
    // Запасной план на случай если шрифты не отдают ready:
    setTimeout(() => {
        window.__timelines = window.__timelines || {};
        if (!window.__timelines["subs_scene"]) {
           window.__timelines["subs_scene"] = document.querySelector('[data-composition-id="subs_scene"]');
        }
    }, 100);
</script>
</body>
</html>`;

    fs.writeFileSync(outputPath, html, 'utf8');
    log("✅ УСПЕХ! HTML файл субтитров перезаписан.");
} catch (e) {
    log(`❌ ОШИБКА В BUILD_SUBS.JS: ${e.message}`);
    process.exit(1); 
}
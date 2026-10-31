import fs from 'fs';
import path from 'path';
import { getVideoDurationInSeconds } from 'get-video-duration';
import ffprobe from 'ffprobe-static';
import { createLogger, loadConfigs } from '../config_loader.js';

const rootDir = process.cwd();
const log = createLogger(rootDir);

(async () => {
    try {
        log("=== СТАРТ СБОРКИ АКЦЕНТОВ (МОДУЛЬНАЯ ВЕРСИЯ: VJ СТЕП-СЕКВЕНСОР) ===");

        // Используем нашу утилиту для загрузки конфигов
        const { config, director, library } = loadConfigs(rootDir);
        const accentsCfg = director.accents || { enabled: false };

        if (!accentsCfg.enabled) {
            log("⚠️ Акценты выключены в director-config.json. Пропускаем.");
            process.exit(0);
        }

        const isTest = config.testMode && config.testMode.enabled;
        const totalDuration = isTest ? config.testMode.duration : config.project.totalDuration;
        const testStart = isTest ? config.testMode.start : 0;
        const testEnd = testStart + totalDuration;
        const compDir = path.join(rootDir, 'compositions');

        let accentsData = [];
        const sourceFile = path.join(rootDir, accentsCfg.sourceFile || 'accents.json');
        if (fs.existsSync(sourceFile)) {
            accentsData = JSON.parse(fs.readFileSync(sourceFile, 'utf8')).accents || [];
        } else {
            log(`⚠️ Файл акцентов не найден по пути: ${sourceFile}`);
        }

        const activeAccents = accentsData.filter(time => isTest ? (time >= testStart && time <= testEnd) : (time <= totalDuration));

        // --- НАСТРОЙКИ САБ-МОДУЛЕЙ ---
        const shakesCfg = accentsCfg.shakes || { enabled: false };
        const useShakes = shakesCfg.enabled && Array.isArray(shakesCfg.pool) && shakesCfg.pool.length > 0;
        const shkDuration = shakesCfg.duration || 0.2;
        const libShakes = library.effectsPool?.accent_movements || {};

        const vidCfg = accentsCfg.videoGlitches || { enabled: false };
        const useVideo = vidCfg.enabled && !!vidCfg.file;
        const vidDuration = vidCfg.duration || 0.15;

        // Чтение стиля
        const styleKey = vidCfg.style || "none";
        const customCss = library.effectsPool?.accentStyles?.[styleKey] || "";
        if (customCss) log(`🎨 Применен стиль акцентов: [${styleKey}]`);

        let sourceDuration = 10.0;

        if (useVideo) {
            const fullVidPath = path.join(rootDir, vidCfg.file);
            if (fs.existsSync(fullVidPath)) {
                try {
                    sourceDuration = await getVideoDurationInSeconds(fullVidPath, ffprobe.path);
                } catch (err) {
                    log(`⚠️ Ошибка чтения длины видео для акцентов: ${err.message}`);
                }
            } else {
                log(`⚠️ Видео для акцентов не найдено: ${fullVidPath}`);
            }
        }

        // --- ЛОГИКА НАРЕЗКИ (SLICES) ---
        let gridStep = 0;
        const slices = vidCfg.slices || 8;
        const sequence = vidCfg.sequence || vidCfg.allowedChunks || [];

        if (useVideo) {
            const maxStart = Math.max(0, sourceDuration - vidDuration);
            gridStep = maxStart / (slices > 1 ? slices - 1 : 1);

            log(`🎯 Видео разделено на ${slices} частей (шаг ${gridStep.toFixed(2)}s).`);
            if (sequence.length > 0) {
                log(`📜 Заряжена секвенция: [${sequence.join(', ')}]`);
            } else {
                log(`📜 Секвенция пуста, играем все ${slices} частей по кругу.`);
            }
        }

        let htmlClips = '';
        let keyframesCSS = `@keyframes masterAccentShake {\n  0% { transform: translate(0px, 0px) scale(1); }\n`;

        if (useVideo) {
            htmlClips += `<div id="host-video-accents" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; mix-blend-mode: ${vidCfg.blendMode || 'screen'}; z-index: 9999;">\n`;
        }

        let chunkIndex = 0;

        activeAccents.forEach((time, index) => {
            const renderStart = isTest ? (time - testStart) : time;
            if (renderStart < 0 || renderStart > totalDuration) return;

            // 1. ТРЯСКА
            if (useShakes) {
                const shkKey = shakesCfg.pool[index % shakesCfg.pool.length];
                const shakeSteps = libShakes[shkKey] || [];

                if (shakeSteps.length > 0) {
                    const beforeP = ((renderStart - 0.01) / totalDuration * 100).toFixed(4);
                    if (beforeP > 0) keyframesCSS += `  ${beforeP}% { transform: translate(0px, 0px) scale(1); }\n`;

                    shakeSteps.forEach(step => {
                        const stepTime = renderStart + (step.t * shkDuration);
                        const stepP = (stepTime / totalDuration * 100).toFixed(4);
                        keyframesCSS += `  ${stepP}% { transform: ${step.css}; }\n`;
                    });
                }
            }

            // 2. ВИДЕО-АКЦЕНТЫ
            if (useVideo) {
                let sliceIdx = 0;
                let skip = false;

                if (sequence.length > 0) {
                    const seqItem = sequence[chunkIndex % sequence.length];
                    if (seqItem === "none" || seqItem === null || seqItem === "null") {
                        skip = true;
                    } else {
                        sliceIdx = parseInt(seqItem, 10);
                        if (isNaN(sliceIdx)) skip = true;
                    }
                } else {
                    sliceIdx = chunkIndex % slices;
                }

                chunkIndex++;

                if (!skip) {
                    const safeSliceIdx = sliceIdx % slices;
                    const chunkStart = safeSliceIdx * gridStep;
                    const chunkEnd = chunkStart + vidDuration;
                    const vidId = `glitch-vid-${index}`;

                    htmlClips += `  <video id="${vidId}" class="clip" data-in="0" data-out="${vidDuration.toFixed(3)}" src="../${vidCfg.file}#t=${chunkStart.toFixed(3)},${chunkEnd.toFixed(3)}" data-start="${renderStart.toFixed(3)}" data-hf-media-start-basis="global" data-duration="${vidDuration.toFixed(3)}" muted playsinline style="position: absolute; width: 100%; height: 100%; object-fit: cover; mix-blend-mode: ${vidCfg.blendMode || 'screen'}; ${customCss}"></video>\n`;
                }
            }
        });

        if (useVideo) htmlClips += `</div>\n`;

        keyframesCSS += `  100% { transform: translate(0px, 0px) scale(1); }\n}\n`;
        if (useShakes) keyframesCSS += `.global-shake-active { animation: masterAccentShake ${totalDuration}s linear forwards; }\n`;

        let html = `<!DOCTYPE html>
<html>
<head>
    <style>
        body { margin: 0; background: transparent; overflow: hidden; }
        #root { position: absolute; width: 100vw; height: 100vh; }
        .clip { display: block; }
    </style>
</head>
<body>
    <div id="root" data-composition-id="accents_scene" data-width="${config.project.resolution.width}" data-height="${config.project.resolution.height}" data-duration="${totalDuration}">
${htmlClips}    </div>
    <script>
        window.__timelines = window.__timelines || {};
        window.__timelines["accents_scene"] = document.querySelector('[data-composition-id="accents_scene"]');
    </script>
</body>
</html>`;

        if (!fs.existsSync(compDir)) fs.mkdirSync(compDir, { recursive: true });
        fs.writeFileSync(path.join(compDir, 'accents_scene.html'), html, 'utf8');
        fs.writeFileSync(path.join(compDir, 'accents_camera.css'), keyframesCSS, 'utf8');

        log(`✅ УСПЕХ! Акценты собраны (Степ-секвенсор заряжен + видео жестко клипается).`);
    } catch (e) { 
        log(`❌ Ошибка: ${e.message}`); 
    }
})();
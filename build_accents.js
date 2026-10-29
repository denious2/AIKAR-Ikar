import fs from 'fs';
import path from 'path';
import { getVideoDurationInSeconds } from 'get-video-duration';
import ffprobe from 'ffprobe-static';

(async () => {
    try {
        console.log("=== СТАРТ СБОРКИ АКЦЕНТОВ (VJ СТЕП-СЕКВЕНСОР + ИСПРАВЛЕНИЕ ПРОПУСКОВ) ===");

        const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
        const directorConfig = JSON.parse(fs.readFileSync('director-config.json', 'utf8'));
        const library = JSON.parse(fs.readFileSync('library-config.json', 'utf8'));

        const accentsCfg = directorConfig.accents || { enabled: false };

        if (!accentsCfg.enabled) {
            console.log("⚠️ Акценты выключены в director-config.json. Пропускаем.");
            process.exit(0);
        }

        const isTest = config.testMode && config.testMode.enabled;
        const totalDuration = isTest ? config.testMode.duration : config.project.totalDuration;
        const testStart = isTest ? config.testMode.start : 0;
        const testEnd = testStart + totalDuration;
        const compDir = path.join(process.cwd(), 'compositions');

        let accentsData = [];
        const sourceFile = accentsCfg.sourceFile || 'accents.json';
        if (fs.existsSync(sourceFile)) {
            accentsData = JSON.parse(fs.readFileSync(sourceFile, 'utf8')).accents || [];
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
        if (customCss) console.log(`🎨 Применен стиль акцентов: [${styleKey}]`);

        let sourceDuration = 10.0;

        if (useVideo) {
            const fullVidPath = path.join(process.cwd(), vidCfg.file);
            if (fs.existsSync(fullVidPath)) {
                try {
                    sourceDuration = await getVideoDurationInSeconds(fullVidPath, ffprobe.path);
                } catch (err) {}
            }
        }

        // --- ЛОГИКА НАРЕЗКИ (SLICES) ---
        let gridStep = 0;
        const slices = vidCfg.slices || 8;
        const sequence = vidCfg.sequence || vidCfg.allowedChunks || [];

        if (useVideo) {
            const maxStart = Math.max(0, sourceDuration - vidDuration);
            // Делим доступное время на количество частей
            gridStep = maxStart / (slices > 1 ? slices - 1 : 1);

            console.log(`🎯 Видео разделено на ${slices} частей (шаг ${gridStep.toFixed(2)}s).`);
            if (sequence.length > 0) {
                console.log(`📜 Заряжена секвенция: [${sequence.join(', ')}]`);
            } else {
                console.log(`📜 Секвенция пуста, играем все ${slices} частей по кругу.`);
            }
        }

        let htmlClips = '';
        let keyframesCSS = `@keyframes masterAccentShake {\n  0% { transform: translate(0px, 0px) scale(1); }\n`;

        if (useVideo) {
            htmlClips += `<div id="host-video-accents" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; mix-blend-mode: ${vidCfg.blendMode || 'screen'}; z-index: 9999;">\n`;
        }

        let chunkIndex = 0; // Глобальный курсор нашей партитуры

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

            // 2. ВИДЕО-АКЦЕНТЫ (VJ СТЕП-СЕКВЕНСОР С ИСПРАВЛЕНИЕМ ПРОПУСКОВ)
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

                chunkIndex++; // Всегда двигаем курсор секвенции вперед с каждым битом!

                if (!skip) {
                    // Математическая защита: если юзер написал 12, а слайсов 8, берем 12 % 8 = 4
                    const safeSliceIdx = sliceIdx % slices;
                    const chunkStart = safeSliceIdx * gridStep;
                    const chunkEnd = chunkStart + vidDuration;
                    const vidId = `glitch-vid-${index}`;

                    // >>> ИСПРАВЛЕНИЕ: Добавлен class="clip" и атрибуты data-in="0" data-out="..." <<<
                    htmlClips += `  <video id="${vidId}" class="clip" data-in="0" data-out="${vidDuration.toFixed(3)}" src="${vidCfg.file}#t=${chunkStart.toFixed(3)},${chunkEnd.toFixed(3)}" data-start="${renderStart.toFixed(3)}" data-hf-media-start-basis="global" data-duration="${vidDuration.toFixed(3)}" muted playsinline style="position: absolute; width: 100%; height: 100%; object-fit: cover; mix-blend-mode: ${vidCfg.blendMode || 'screen'}; ${customCss}"></video>\n`;
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
        .clip { display: block; } /* Обязательное условие для корректного скрытия/показа */
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

        console.log(`✅ УСПЕХ! Акценты собраны (Степ-секвенсор заряжен + видео жестко клипается).`);
    } catch (e) { 
        console.error("❌ Ошибка:", e.message); 
    }
})();
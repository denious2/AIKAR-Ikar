import fs from 'fs';
import path from 'path';
import { getVideoDurationInSeconds } from 'get-video-duration';
import ffprobe from 'ffprobe-static';

const logFile = path.join(process.cwd(), 'debug_log.txt');
function log(msg) {
    console.log(msg);
    fs.appendFileSync(logFile, msg + "\n", 'utf8');
}

(async () => {
    try {
        log("=== СТАРТ СБОРКИ НАРРАТИВА (РИТМИЧЕСКИЙ МАГНИТ) ===");
        
        // Жесткая привязка к корню проекта для надежного чтения файлов
        const PROJECT_ROOT = "C:\\Users\\webpr\\YandexDisk-webproektor\\Ikar";
        const rootDir = fs.existsSync(PROJECT_ROOT) ? PROJECT_ROOT : process.cwd();

        const configPath = path.join(rootDir, 'config.json');
        const directorPath = path.join(rootDir, 'director-config.json');
        const libraryPath = path.join(rootDir, 'library-config.json');
        
        if (!fs.existsSync(configPath)) throw new Error("config.json не найден");
        if (!fs.existsSync(directorPath)) throw new Error("director-config.json не найден");
        if (!fs.existsSync(libraryPath)) throw new Error("library-config.json не найден");

        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const director = JSON.parse(fs.readFileSync(directorPath, 'utf8'));
        const library = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));
        
        const isTest = config.testMode && config.testMode.enabled;
        const totalDuration = isTest ? config.testMode.duration : config.project.totalDuration;
        const testStart = isTest ? config.testMode.start : 0;
        const testEnd = testStart + totalDuration;
        const compDir = path.join(rootDir, 'compositions');

        if (!config.effects || typeof config.effects.imageDuration === 'undefined') {
            throw new Error("КРИТИЧЕСКАЯ ОШИБКА: В config.json не задан параметр effects.imageDuration!");
        }
        const MAX_IMG_DURATION = config.effects.imageDuration; 
        const MIN_IMG_DURATION = 2.5; 
        const OVERLAP = 0.25; 

        // ====================================================================
        // РИТМИЧЕСКИЙ МАГНИТ: Абсолютная загрузка битов и субтитров
        // ====================================================================
        let beats = [];
        try {
            const beatsPath = path.join(rootDir, 'beats.json');
            if (fs.existsSync(beatsPath)) {
                const beatsData = JSON.parse(fs.readFileSync(beatsPath, 'utf8'));
                beats = beatsData.beats || [];
                log(`🎵 УСПЕХ: Загружено битов - ${beats.length}`);
            } else {
                log(`❌ КРИТИЧНО: Файл beats.json не найден по пути ${beatsPath}`);
            }
        } catch (e) {
            log(`⚠️ Ошибка чтения битов: ${e.message}`);
        }

        let subtitleStarts = [];
        try {
            const srtPath = path.join(rootDir, 'media', 'subtitles.srt');
            if (fs.existsSync(srtPath)) {
                const srtContent = fs.readFileSync(srtPath, 'utf8');
                const timeRegex = /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->/g;
                let match;
                while ((match = timeRegex.exec(srtContent)) !== null) {
                    const h = parseInt(match[1], 10);
                    const m = parseInt(match[2], 10);
                    const s = parseInt(match[3], 10);
                    const ms = parseInt(match[4], 10);
                    subtitleStarts.push(h * 3600 + m * 60 + s + ms / 1000);
                }
                log(`💬 УСПЕХ: Загружено строк субтитров - ${subtitleStarts.length}`);
            } else {
                log(`❌ КРИТИЧНО: Файл субтитров не найден по пути ${srtPath}`);
            }
        } catch (e) {
            log(`⚠️ Ошибка чтения субтитров: ${e.message}`);
        }
        // ====================================================================

        let cssLibrary = "";
        if (library.effectsPool) {
            if (library.effectsPool.movements) {
                for (const [name, keyframes] of Object.entries(library.effectsPool.movements)) {
                    cssLibrary += `@keyframes ${name} { ${keyframes} }\n`;
                }
            }
            if (library.effectsPool.appearances) {
                for (const [name, keyframes] of Object.entries(library.effectsPool.appearances)) {
                    cssLibrary += `@keyframes ${name} { ${keyframes} }\n`;
                }
            }
        }

        const styleBlock = `
            <style>
                body { margin: 0; background: transparent; overflow: hidden; }
                #root { position: absolute; width: 100vw; height: 100vh; pointer-events: none; }
                .anim-wrapper { position: absolute; width: 100%; height: 100%; pointer-events: none; transform-origin: center; }
                @keyframes wrapper_fade_in { 0% { opacity: 0.2; } 100% { opacity: 1; } }
                .image-layer { position: absolute; top: 0; left: 0; width: 100vw; height: 100vh; background-size: cover; background-position: center; transform-origin: center center; }
                .video-layer { position: absolute; top: 0; left: 0; width: 100vw; height: 100vh; object-fit: cover; transform-origin: center center; }
                ${cssLibrary}
            </style>
        `;

        const activeAssetPools = director.assetPools || config.assetPools;
        const narrativePools = {};
        
        for (const [poolName, pool] of Object.entries(activeAssetPools)) {
            if (pool.enabled && pool.class === "narrative") {
                const scenesPath = path.join(rootDir, pool.path);
                if (!fs.existsSync(scenesPath)) continue;
                
                const rawFiles = fs.readdirSync(scenesPath)
                    .filter(f => ['.jpg', '.jpeg', '.png', '.webp', '.mp4'].includes(path.extname(f).toLowerCase()))
                    .filter(f => !f.toLowerCase().includes('-prlx-'));
                    
                const files = [];
                for (const f of rawFiles) {
                    const isVideoFile = f.toLowerCase().endsWith('.mp4');
                    let realDuration = null;

                    if (isVideoFile) {
                        try {
                            const fullPath = path.join(scenesPath, f);
                            realDuration = await getVideoDurationInSeconds(fullPath, ffprobe.path);
                        } catch (err) {
                            log(`⚠️ Ошибка чтения длины видео ${f}: ${err.message}`);
                        }
                    }

                    files.push({
                        name: f,
                        path: `${pool.path}/${f}`,
                        baseName: path.parse(f).name,
                        realDuration
                    });
                }
                    
                if (files.length > 0) {
                    narrativePools[poolName] = {
                        ...pool,
                        files,
                        currentIndex: 0
                    };
                    log(`📂 Пул '${poolName}' [Слой ${pool.layerIndex}]: найдено ${files.length} медиафайлов.`);
                }
            }
        }

        if (Object.keys(narrativePools).length === 0) {
            log(`⚠️ Ни один пул сюжетов не найден. Генерирую пустую сцену.`);
            process.exit(0);
        }

        const structure = (director.songStructure || config.songStructure).sort((a, b) => a.time - b.time);
        const sectionRulesMap = director.sectionTypeRules || config.sectionTypeRules || {};

        let imagesHTML = "";
        let currentTime = 0;

        while (currentTime < config.project.totalDuration) {
            const absStart = currentTime;

            // ====================================================================
            // ИДЕНТИФИКАЦИЯ СЕКЦИИ (ЗАЩИТА ОТ ДРОБЕЙ JS)
            // ====================================================================
            const EPSILON = 0.01; // 10 миллисекунд погрешности
            let currentBlock = structure[0];
            let currentBlockEnd = totalDuration;
            for (let i = 0; i < structure.length; i++) {
                if (absStart + EPSILON >= structure[i].time) {
                    currentBlock = structure[i];
                    currentBlockEnd = (i < structure.length - 1) ? structure[i + 1].time : totalDuration;
                }
            }
            const rules = sectionRulesMap[currentBlock.type] || {};
            
            if (rules.blackout) {
                currentTime += MAX_IMG_DURATION; 
                continue; 
            }

            const allowedLayers = rules.allowedLayers || [];
            let activePool = null;
            let activePoolName = null;
            
            for (const [pName, pData] of Object.entries(narrativePools)) {
                if (allowedLayers.includes(pData.layerIndex)) {
                    activePool = pData;
                    activePoolName = pName;
                    break;
                }
            }

            if (!activePool) {
                currentTime += MAX_IMG_DURATION;
                continue;
            }

            const imageIndex = activePool.currentIndex;
            const files = activePool.files;
            const fileObj = files[imageIndex % files.length];
            const file = fileObj.path;
            
            // ====================================================================
            // ЛОГИКА РИТМИЧЕСКОГО МАГНИТА И СШИВАТЕЛЯ ГРАНИЦ
            // ====================================================================
            let maxAllowed = Math.min(MAX_IMG_DURATION, currentBlockEnd - absStart);
            let minAllowed = Math.min(MIN_IMG_DURATION, maxAllowed);
            let rhythmDuration = maxAllowed;

            const windowStart = absStart + minAllowed;
            const windowEnd = absStart + maxAllowed;

            const subsInWindow = subtitleStarts.filter(t => t >= windowStart && t <= windowEnd);
            if (subsInWindow.length > 0) {
                rhythmDuration = Math.max(...subsInWindow) - absStart;
            } else {
                const beatsInWindow = beats.filter(b => b >= windowStart && b <= windowEnd);
                if (beatsInWindow.length > 0) {
                    rhythmDuration = Math.max(...beatsInWindow) - absStart;
                }
            }

            let currentImgDuration = rhythmDuration;

            if (fileObj.realDuration && fileObj.realDuration < currentImgDuration) {
                currentImgDuration = fileObj.realDuration;
            }

            // МАГНИТ К СТЕНЕ: Если до конца секции остался некрасивый "огрызок" (меньше минимума),
            // мы не плодим короткий кадр, а растягиваем текущий ровно до границы секции!
            const timeToSectionEnd = currentBlockEnd - absStart;
            if (timeToSectionEnd - currentImgDuration > 0 && timeToSectionEnd - currentImgDuration < MIN_IMG_DURATION) {
                 currentImgDuration = timeToSectionEnd;
            }

            const fileOverride = director.directorOverrides?.files?.[file];

            if (fileOverride) {
                if (fileOverride.duration) {
                    currentImgDuration = fileOverride.duration;
                } else if (fileOverride.playToEnd) {
                    currentImgDuration = Math.max(currentImgDuration, currentBlockEnd - absStart);
                }
            }

            const absEnd = Math.min(currentTime + currentImgDuration, config.project.totalDuration);
            const duration = absEnd - absStart;

            if (duration <= 0) break;

            const allowedMoves = activePool.allowedMovements || ["none"];
            const defaultAppear = activePool.defaultAppearance || "soft_fade";
            const baseBlendMode = activePool.blendMode || 'multiply';
            const baseOpacity = activePool.baseOpacity || 1.0;

            const localShift = fileOverride?.movementShift || 0;
            const baseMove = fileOverride?.movement || allowedMoves[(imageIndex + localShift) % allowedMoves.length];

            const baseLayer = activePool.layerIndex || 2;
            const trackIdx = (baseLayer * 10) + (imageIndex % 2); 
            
            const isFirst = (absStart === 0);
            const isVideo = file.toLowerCase().endsWith('.mp4');
            
            const customEntrance = fileOverride?.entrance;
            const customExit = fileOverride?.exit;
            const legacyAppear = fileOverride?.appearance;

            let animParts = [baseMove];

            if (customEntrance || customExit) {
                if (customEntrance) animParts.push(`${customEntrance} ${duration + OVERLAP}s linear forwards`);
                if (customExit) animParts.push(`${customExit} ${duration + OVERLAP}s linear forwards`);
            } else {
                const appear = isFirst ? "" : (legacyAppear || defaultAppear);
                if (appear) animParts.push(`${appear} ${duration + OVERLAP}s linear forwards`);
            }
            
            const layersToRender = []; 
            let currentZIndex = 1; 
            
            if (!isVideo) {
                const scenesPath = path.join(rootDir, activePool.path);
                const prlxDir = path.join(scenesPath, 'prlx');
                if (fs.existsSync(prlxDir)) {
                    ['b3', 'b2', 'b1'].forEach(layerSuffix => {
                        const prlxFileName = `${fileObj.baseName}-prlx-${layerSuffix}.png`;
                        if (fs.existsSync(path.join(prlxDir, prlxFileName))) {
                            layersToRender.push({
                                id: layerSuffix,
                                path: `${activePool.path}/prlx/${prlxFileName}`,
                                zIndex: currentZIndex++
                            });
                        }
                    });
                }
            }
            
            layersToRender.push({ 
                id: 'fg', 
                path: file, 
                zIndex: 10 
            });
            
            let renderStart = absStart;
            let finalDur = duration + OVERLAP;
            
            if (isTest) {
                if (absEnd <= testStart || absStart >= testEnd) {
                    currentTime += currentImgDuration;
                    activePool.currentIndex++;
                    continue;
                }
                renderStart = Math.max(0, absStart - testStart);
                const renderEnd = Math.min(totalDuration, absEnd - testStart);
                finalDur = (renderEnd - renderStart) + OVERLAP;
            }

            const durStr = finalDur.toFixed(3);
            const startStr = renderStart.toFixed(3);
            
            const currentBlend = (layersToRender.length > 1) ? 'normal' : baseBlendMode;
            const wrapperStyle = isFirst ? "" : `animation: wrapper_fade_in ${OVERLAP}s ease-out forwards;`;

            let groupHTML = `\n<div id="wrap-${activePoolName}-${imageIndex}" class="anim-wrapper" style="${wrapperStyle}">\n`;
            
            layersToRender.forEach((layer) => {
                const layerOverride = director.directorOverrides?.files?.[layer.path];
                let finalMove = layerOverride?.movement || (layer.id === 'fg' ? baseMove : null);
                
                if (!finalMove && layer.id !== 'fg') {
                    const bgPoolKey = `allowedMovements_${layer.id}`;
                    const bgMoves = activePool[bgPoolKey] || ["none"];
                    const shiftMap = { 'b1': 1, 'b2': 2, 'b3': 3 };
                    const shift = shiftMap[layer.id] || 0;
                    const manualShift = layerOverride?.movementShift || 0;
                    finalMove = bgMoves[(imageIndex + shift + manualShift) % bgMoves.length];
                }
                
                let layerAnimParts = [`${finalMove} ${durStr}s linear forwards`];
                if (customEntrance || customExit) {
                    if (customEntrance) layerAnimParts.push(`${customEntrance} ${durStr}s linear forwards`);
                    if (customExit) layerAnimParts.push(`${customExit} ${durStr}s linear forwards`);
                } else {
                    const appear = isFirst ? "" : (legacyAppear || defaultAppear);
                    if (appear) layerAnimParts.push(`${appear} ${durStr}s linear forwards`);
                }

                const animCss = `animation: ${layerAnimParts.join(', ')};`;
                
                let opacityCss = `opacity: var(--base-opacity);`;
                if (!isFirst && (customEntrance || customExit || legacyAppear || defaultAppear)) {
                    opacityCss = "opacity: 0;";
                }

                const isMediaVideo = layer.path.toLowerCase().endsWith('.mp4');
                
                if (isMediaVideo) {
                    groupHTML += `    <video id="vid-${activePoolName}-${imageIndex}-${layer.id}" src="../${layer.path}" class="video-layer clip" data-in="0" data-out="${durStr}" data-start="${startStr}" data-duration="${durStr}" data-track-index="${trackIdx}" style="z-index: ${layer.zIndex}; mix-blend-mode: ${currentBlend}; --base-opacity: ${baseOpacity}; ${opacityCss} ${animCss}" autoplay muted playsinline></video>\n`;
                } else {
                    groupHTML += `    <div id="img-${activePoolName}-${imageIndex}-${layer.id}" class="image-layer clip" data-in="0" data-out="${durStr}" data-start="${startStr}" data-duration="${durStr}" data-track-index="${trackIdx}" style="z-index: ${layer.zIndex}; background-image: url('../${layer.path}'); mix-blend-mode: ${currentBlend}; --base-opacity: ${baseOpacity}; ${opacityCss} ${animCss}"></div>\n`;
                }
            });
            
            groupHTML += `</div>`;
            imagesHTML += groupHTML;

            currentTime += currentImgDuration;
            activePool.currentIndex++;
        }

        if (!fs.existsSync(compDir)) fs.mkdirSync(compDir, { recursive: true });

        const htmlOutput = `<!DOCTYPE html>
<html>
<head>
${styleBlock}
</head>
<body>
    <div id="root" data-composition-id="images_scene" data-width="${config.project.resolution.width}" data-height="${config.project.resolution.height}" data-duration="${totalDuration}">
${imagesHTML}
    </div>
    <script>
        window.__timelines = window.__timelines || {};
        window.__timelines["images_scene"] = document.querySelector('#root');
    </script>
</body>
</html>`;

        fs.writeFileSync(path.join(compDir, 'images_scene.html'), htmlOutput, 'utf8');
        log(`✅ УСПЕХ! Нарратив собран с поддержкой ритмического магнита (субтитры + биты).`);

    } catch (e) {
        console.error("❌ Ошибка в build_images.js:", e.message);
        process.exit(1);
    }
})();
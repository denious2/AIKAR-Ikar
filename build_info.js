import fs from 'fs';
import path from 'path';
import { getVideoDurationInSeconds } from 'get-video-duration';
import ffprobe from 'ffprobe-static';

function log(msg) {
    console.log(msg);
}

(async () => {
    try {
        log("=== СТАРТ ГЕНЕРАЦИИ РЕЖИССЕРСКОГО ЛИСТА (МАГНИТНЫЙ ТАЙМЛАЙН) ===");
        
        const rootDir = process.cwd();
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
        
        const MAX_IMG_DURATION = config.effects?.imageDuration || 4.0;
        const MIN_IMG_DURATION = 2.5;
        const activeAssetPools = director.assetPools || config.assetPools;
        const sectionRulesMap = director.sectionTypeRules || config.sectionTypeRules || {};
        const structure = (director.songStructure || config.songStructure).sort((a, b) => a.time - b.time);

        // ====================================================================
        // ЗАГРУЗКА БИТОВ И СУБТИТРОВ
        // ====================================================================
        let beats = [];
        try {
            const beatsPath = path.join(rootDir, 'beats.json');
            if (fs.existsSync(beatsPath)) {
                beats = JSON.parse(fs.readFileSync(beatsPath, 'utf8')).beats || [];
            }
        } catch (e) {}

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
            }
        } catch (e) {}

        // ====================================================================
        // 1. ЗАГРУЗКА ВСЕХ АССЕТОВ (С РАСЧЕТОМ ДЛИТЕЛЬНОСТИ ВИДЕО)
        // ====================================================================
        const loadedAssets = {};
        for (const [poolName, pool] of Object.entries(activeAssetPools)) {
            if (pool.enabled === false) continue;
            
            let paths = Array.isArray(pool.path) ? pool.path : [pool.path];
            let files = [];
            
            for (const p of paths) {
                const fullPath = path.join(rootDir, p);
                if (fs.existsSync(fullPath)) {
                    const folderContents = fs.readdirSync(fullPath);
                    const validFiles = folderContents.filter(f => ['.jpg', '.jpeg', '.png', '.webp', '.mp4'].includes(path.extname(f).toLowerCase()))
                                                     .filter(f => !f.toLowerCase().includes('-prlx-'));
                    
                    for (const f of validFiles) {
                        const isVideo = f.toLowerCase().endsWith('.mp4');
                        let realDuration = null;
                        if (isVideo) {
                            try { realDuration = await getVideoDurationInSeconds(path.join(fullPath, f), ffprobe.path); } catch (err) {}
                        }
                        files.push({
                            path: `${p}/${f}`,
                            baseName: path.parse(f).name,
                            fullDir: fullPath,
                            realDuration
                        });
                    }
                }
            }
            
            loadedAssets[poolName] = { 
                ...pool, files, currentIndex: 0,
                getNext() {
                    if (this.files.length === 0) return null;
                    const file = this.files[this.currentIndex % this.files.length];
                    this.currentIndex++;
                    return file;
                }
            };
        }

        let timelineEvents = [];

        // ====================================================================
        // А. СЕКЦИИ И ЭФФЕКТЫ (АТМОСФЕРА)
        // ====================================================================
        for (let i = 0; i < structure.length; i++) {
            const block = structure[i];
            const absBlockStart = block.time;
            const absBlockEnd = (i < structure.length - 1) ? structure[i + 1].time : config.project.totalDuration;

            if (isTest && (absBlockEnd <= testStart || absBlockStart >= testEnd)) continue;
            const start = isTest ? Math.max(absBlockStart, testStart) : absBlockStart;
            const end = isTest ? Math.min(absBlockEnd, testEnd) : absBlockEnd;
            const duration = end - start;
            
            if (duration <= 0) continue;

            const rules = sectionRulesMap[block.type] || { blackout: false, allowedLayers: [] };
            
            timelineEvents.push({
                time: start,
                isSection: true,
                title: `СЕКЦИЯ: ${block.name} [${block.type.toUpperCase()}]`,
                desc: `Разрешенные слои: [${rules.allowedLayers.join(', ')}] | Блэкаут: ${rules.blackout ? 'ДА' : 'НЕТ'}`
            });

            if (rules.blackout) continue;

            for (const [poolName, pool] of Object.entries(loadedAssets)) {
                if (pool.class === "narrative") continue; 
                if (!rules.allowedLayers.includes(pool.layerIndex) || pool.files.length === 0) continue;
                
                if ((pool.class === "splash_burst" || pool.class === "transition" || pool.class === "atmosphere") && start < 3.0 && poolName !== "sketches") {
                    continue; 
                }

                let slotDur = duration; 
                if (pool.class === "splash_burst" || pool.class === "transition") {
                    slotDur = Math.min(1.5, duration); 
                }

                const fileObj = pool.getNext();
                if (!fileObj) continue;

                const allowedMoves = pool.allowedMovements || ["none"];
                const move = allowedMoves[(i * 11 + (pool.layerIndex || 0)) % allowedMoves.length];

                timelineEvents.push({
                    time: start,
                    layer: pool.layerIndex,
                    pool: poolName,
                    file: fileObj.path,
                    move: move,
                    appear: pool.defaultAppearance,
                    duration: slotDur,
                    isParallaxGroup: false,
                    magnetLog: "Эффект секции"
                });
            }
        }

        // ====================================================================
        // Б. НАРРАТИВ (ГЛАВНЫЙ ТАЙМЛАЙН МАГНИТА)
        // ====================================================================
        const narrativePools = {};
        for (const [pName, pData] of Object.entries(loadedAssets)) {
            if (pData.class === "narrative") narrativePools[pName] = pData;
        }

        let currentTime = 0;
        const EPSILON = 0.01;

        while (currentTime < config.project.totalDuration) {
            const absStart = currentTime;

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
            const fileObj = activePool.files[imageIndex % activePool.files.length];
            
            // ВЫЧИСЛЕНИЕ МАГНИТА И СШИВАТЕЛЯ
            let maxAllowed = Math.min(MAX_IMG_DURATION, currentBlockEnd - absStart);
            let minAllowed = Math.min(MIN_IMG_DURATION, maxAllowed);
            let rhythmDuration = maxAllowed;
            let magnetLog = "[ По умолчанию ]";

            const windowStart = absStart + minAllowed;
            const windowEnd = absStart + maxAllowed;

            const subsInWindow = subtitleStarts.filter(t => t >= windowStart && t <= windowEnd);
            if (subsInWindow.length > 0) {
                rhythmDuration = Math.max(...subsInWindow) - absStart;
                magnetLog = "[ Субтитр 🧲 ]";
            } else {
                const beatsInWindow = beats.filter(b => b >= windowStart && b <= windowEnd);
                if (beatsInWindow.length > 0) {
                    rhythmDuration = Math.max(...beatsInWindow) - absStart;
                    magnetLog = "[ Бит 🥁 ]";
                }
            }

            let currentImgDuration = rhythmDuration;

            if (fileObj.realDuration && fileObj.realDuration < currentImgDuration) {
                currentImgDuration = fileObj.realDuration;
                magnetLog += " (Урезан видеофайлом)";
            }

            const timeToSectionEnd = currentBlockEnd - absStart;
            if (timeToSectionEnd - currentImgDuration > 0 && timeToSectionEnd - currentImgDuration < MIN_IMG_DURATION) {
                currentImgDuration = timeToSectionEnd;
                magnetLog += " (Сшиватель границ 🧱)";
            }

            const fileOverride = director.directorOverrides?.files?.[fileObj.path];
            if (fileOverride) {
                if (fileOverride.duration) {
                    currentImgDuration = fileOverride.duration;
                    magnetLog = "[ Режиссерский Override ]";
                } else if (fileOverride.playToEnd) {
                    currentImgDuration = Math.max(currentImgDuration, currentBlockEnd - absStart);
                    magnetLog = "[ PlayToEnd Override ]";
                }
            }

            const duration = Math.min(currentTime + currentImgDuration, config.project.totalDuration) - absStart;
            if (duration <= 0) break;

            const allowedMoves = activePool.allowedMovements || ["none"];
            const localShift = fileOverride?.movementShift || 0;
            const baseMove = fileOverride?.movement || allowedMoves[(imageIndex + localShift) % allowedMoves.length];
            const customAppear = fileOverride?.appearance;
            
            const isFirst = (absStart === 0);
            const appear = isFirst ? "hard_cut (AUTO-FIRST-FRAME)" : (customAppear ? `${customAppear} (OVERRIDE)` : (activePool.defaultAppearance || "soft_fade"));

            const isVideo = fileObj.path.toLowerCase().endsWith('.mp4');
            const parallaxDetails = [];
            
            if (!isVideo) {
                const prlxDir = path.join(fileObj.fullDir, 'prlx');
                if (fs.existsSync(prlxDir)) {
                    ['b3', 'b2', 'b1'].forEach(layerSuffix => {
                        const prlxFileName = `${fileObj.baseName}-prlx-${layerSuffix}.png`;
                        if (fs.existsSync(path.join(prlxDir, prlxFileName))) {
                            const bgPoolKey = `allowedMovements_${layerSuffix}`;
                            const bgMoves = activePool[bgPoolKey] || ["none"];
                            const shiftMap = { 'b1': 1, 'b2': 2, 'b3': 3 };
                            const shift = shiftMap[layerSuffix] || 0;
                            const manualShift = fileOverride?.movementShift || 0;
                            const finalBgMove = bgMoves[(imageIndex + shift + manualShift) % bgMoves.length];
                            
                            parallaxDetails.push({ layer: layerSuffix, file: `${activePool.path}/prlx/${prlxFileName}`, move: finalBgMove });
                        }
                    });
                }
            }
            
            parallaxDetails.push({ layer: 'FG', file: fileObj.path, move: fileOverride?.movement ? `${baseMove} (OVERRIDE)` : baseMove });

            timelineEvents.push({
                time: absStart,
                layer: activePool.layerIndex || 2,
                pool: activePoolName,
                file: fileObj.path,
                appear: appear,
                duration: duration,
                isParallaxGroup: parallaxDetails.length > 1,
                parallaxLayers: parallaxDetails,
                magnetLog: magnetLog
            });

            currentTime += currentImgDuration;
            activePool.currentIndex++;
        }

        // ====================================================================
        // 3. СОРТИРОВКА
        // ====================================================================
        timelineEvents.sort((a, b) => {
            if (Math.abs(a.time - b.time) > 0.001) return a.time - b.time;
            if (a.isSection) return -1;
            if (b.isSection) return 1;
            return a.layer - b.layer;
        });

        // ====================================================================
        // 4. ФОРМАТИРОВАНИЕ В ТЕКСТ
        // ====================================================================
        let outputText = `=== 🎬 РЕЖИССЕРСКИЙ ЛИСТ (CUE SHEET) — ${isTest ? "ТЕСТОВЫЙ РЕЖИМ" : "ПОЛНЫЙ РЕНДЕР"} ===\n`;
        outputText += `Общая длительность: ${totalDuration} сек | Окно Магнита: [${MIN_IMG_DURATION}s - ${MAX_IMG_DURATION}s]\n`;
        outputText += `================================================================================\n`;

        let lastTime = -1;
        let currentLayer = null;

        timelineEvents.forEach(ev => {
            if (Math.abs(ev.time - lastTime) > 0.001) {
                outputText += `\n\n--- [ ТАЙМКОД: ${ev.time.toFixed(3)}s ] --------------------------------------------------\n`;
                lastTime = ev.time;
                currentLayer = null;
            }

            if (ev.isSection) {
                outputText += `\n[ ${ev.title} ]\n`;
                outputText += `  > ${ev.desc}\n\n`;
                currentLayer = null;
            } else {
                const layerHeader = `Слой ${ev.layer} [${ev.pool}]`;
                
                if (currentLayer !== layerHeader) {
                    outputText += `  ${layerHeader}:\n`;
                    currentLayer = layerHeader;
                }
                
                if (ev.isParallaxGroup && ev.parallaxLayers.length > 1) {
                    outputText += `    ► ГРУППА ПАРАЛЛАКСА (${ev.parallaxLayers.length} слоя):\n`;
                    outputText += `      - Длительность: ${ev.duration.toFixed(3)}s ${ev.magnetLog}\n`;
                    outputText += `      - Появление:    ${ev.appear}\n`;
                    ev.parallaxLayers.forEach(pl => {
                        outputText += `        [${pl.layer.toUpperCase()}] Файл: ${pl.file} | Движение: ${pl.move}\n`;
                    });
                    outputText += `\n`;
                } else {
                    outputText += `    ► Файл:         ${ev.file}\n`;
                    outputText += `      - Длительность: ${ev.duration.toFixed(3)}s ${ev.magnetLog}\n`;
                    outputText += `      - Движение:     ${ev.isParallaxGroup ? ev.parallaxLayers[0].move : ev.move}\n`;
                    outputText += `      - Появление:    ${ev.appear}\n\n`;
                }
            }
        });

        const compDir = path.join(rootDir, 'compositions');
        if (!fs.existsSync(compDir)) fs.mkdirSync(compDir, { recursive: true });

        const outputPath = path.join(compDir, 'director_cue_sheet.txt');
        fs.writeFileSync(outputPath, outputText, 'utf8');

        log(`✅ УСПЕХ! Режиссерский лист сгенерирован: ${outputPath}`);

    } catch (e) {
        console.error("❌ Ошибка в build_info.js:", e.message);
    }
})();
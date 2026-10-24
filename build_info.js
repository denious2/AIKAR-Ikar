import fs from 'fs';
import path from 'path';

function log(msg) {
    console.log(msg);
}

try {
    log("=== СТАРТ ГЕНЕРАЦИИ РЕЖИССЕРСКОГО ЛИСТА (ПАРАЛЛАКС + БИБЛИОТЕКА) ===");
    
    const configPath = path.join(process.cwd(), 'config.json');
    const directorPath = path.join(process.cwd(), 'director-config.json');
    const libraryPath = path.join(process.cwd(), 'library-config.json');
    
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
    
    const IMG_DURATION = config.effects?.imageDuration || 2.64;
    const activeAssetPools = director.assetPools || config.assetPools;
    const sectionRulesMap = director.sectionTypeRules || config.sectionTypeRules || {};
    const structure = (director.songStructure || config.songStructure).sort((a, b) => a.time - b.time);

    // 1. Загрузка всех ассетов
    const loadedAssets = {};
    for (const [poolName, pool] of Object.entries(activeAssetPools)) {
        if (pool.enabled === false) continue;
        
        let paths = Array.isArray(pool.path) ? pool.path : [pool.path];
        let files = [];
        paths.forEach(p => {
            const fullPath = path.join(process.cwd(), p);
            if (fs.existsSync(fullPath)) {
                const folderContents = fs.readdirSync(fullPath);
                const validFiles = folderContents.filter(f => ['.jpg', '.jpeg', '.png', '.webp', '.mp4'].includes(path.extname(f).toLowerCase()));
                files.push(...validFiles.map(f => ({
                    path: `${p}/${f}`,
                    baseName: path.parse(f).name,
                    fullDir: fullPath
                })));
            }
        });
        
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

    // --- А. Секции и Визуальные Эффекты ---
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
                isParallaxGroup: false
            });
        }
    }

    // --- Б. Нарратив / Скетчи с Параллаксом ---
    const sketchesPool = loadedAssets['sketches'];
    if (sketchesPool && sketchesPool.files.length > 0) {
        let currentTime = 0;
        let imageIndex = 0;
        const allowedMoves = sketchesPool.allowedMovements || ["none"];
        const defaultAppear = sketchesPool.defaultAppearance || "soft_fade";

        while (currentTime < config.project.totalDuration) {
            const absStart = currentTime;
            const absEnd = Math.min(currentTime + IMG_DURATION, config.project.totalDuration);
            
            if (absEnd - absStart <= 0) break;

            if (!isTest || (absEnd > testStart && absStart < testEnd)) {
                const renderStart = isTest ? Math.max(0, absStart - testStart) : absStart;
                const renderEnd = isTest ? Math.min(totalDuration, absEnd - testStart) : absEnd;
                const renderDuration = isTest ? (renderEnd - renderStart) : (absEnd - absStart);
                
                const fileObj = sketchesPool.files[imageIndex % sketchesPool.files.length];
                const fileOverride = director.directorOverrides?.files?.[fileObj.path];
                const baseMove = fileOverride?.movement || allowedMoves[imageIndex % allowedMoves.length];
                const customAppear = fileOverride?.appearance;
                
                const isFirst = (absStart === 0);
                const appear = isFirst ? "hard_cut (AUTO-FIRST-FRAME)" : (customAppear ? `${customAppear} (OVERRIDE)` : defaultAppear);

                const isVideo = fileObj.path.toLowerCase().endsWith('.mp4');
                const parallaxDetails = [];
                
                if (!isVideo) {
                    const prlxDir = path.join(fileObj.fullDir, 'prlx');
                    if (fs.existsSync(prlxDir)) {
                        ['b3', 'b2', 'b1'].forEach(layerSuffix => {
                            const prlxFileName = `${fileObj.baseName}-prlx-${layerSuffix}.png`;
                            if (fs.existsSync(path.join(prlxDir, prlxFileName))) {
                                const bgPoolKey = `allowedMovements_${layerSuffix}`;
                                const bgMoves = sketchesPool[bgPoolKey] || ["none"];
                                const shift = layerSuffix === 'b1' ? 1 : (layerSuffix === 'b2' ? 2 : 3);
                                const finalBgMove = bgMoves[(imageIndex + shift) % bgMoves.length];
                                
                                parallaxDetails.push({ layer: layerSuffix, file: prlxFileName, move: finalBgMove });
                            }
                        });
                    }
                }
                
                parallaxDetails.push({ layer: 'FG', file: fileObj.path, move: fileOverride?.movement ? `${baseMove} (OVERRIDE)` : baseMove });

                timelineEvents.push({
                    time: renderStart,
                    layer: sketchesPool.layerIndex || 2,
                    pool: 'sketches',
                    file: fileObj.path,
                    appear: appear,
                    duration: renderDuration,
                    isParallaxGroup: true,
                    parallaxLayers: parallaxDetails
                });
            }
            currentTime += IMG_DURATION;
            imageIndex++;
        }
    }

    // 3. Сортировка
    timelineEvents.sort((a, b) => {
        if (a.time !== b.time) return a.time - b.time;
        if (a.isSection) return -1;
        if (b.isSection) return 1;
        return a.layer - b.layer;
    });

    // 4. Форматирование
    let outputText = `=== 🎬 РЕЖИССЕРСКИЙ ЛИСТ (CUE SHEET) — ${isTest ? "ТЕСТОВЫЙ РЕЖИМ" : "ПОЛНЫЙ РЕНДЕР"} ===\n`;
    outputText += `Общая длительность: ${totalDuration} сек | Смена кадров: каждые ${IMG_DURATION} сек\n`;
    outputText += `================================================================================\n`;

    let lastTime = -1;
    let currentLayer = null;

    timelineEvents.forEach(ev => {
        if (ev.time !== lastTime) {
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
                outputText += `      - Длительность: ${ev.duration.toFixed(3)}s\n`;
                outputText += `      - Появление:    ${ev.appear}\n`;
                ev.parallaxLayers.forEach(pl => {
                    outputText += `        [${pl.layer.toUpperCase()}] Файл: ${pl.file} | Движение: ${pl.move}\n`;
                });
                outputText += `\n`;
            } else {
                outputText += `    ► Файл:         ${ev.file}\n`;
                outputText += `      - Длительность: ${ev.duration.toFixed(3)}s\n`;
                outputText += `      - Движение:     ${ev.isParallaxGroup ? ev.parallaxLayers[0].move : ev.move}\n`;
                outputText += `      - Появление:    ${ev.appear}\n\n`;
            }
        }
    });

    const compDir = path.join(process.cwd(), 'compositions');
    if (!fs.existsSync(compDir)) fs.mkdirSync(compDir, { recursive: true });

    const outputPath = path.join(compDir, 'director_cue_sheet.txt');
    fs.writeFileSync(outputPath, outputText, 'utf8');

    log(`✅ УСПЕХ! Режиссерский лист сгенерирован: ${outputPath}`);

} catch (e) {
    console.error("❌ Ошибка в build_info.js:", e.message);
}
import fs from 'fs';
import path from 'path';

const logFile = path.join(process.cwd(), 'debug_log.txt');
function log(msg) {
    console.log(msg);
    fs.appendFileSync(logFile, msg + "\n", 'utf8');
}

try {
    log("=== СТАРТ СБОРКИ АТМОСФЕРЫ И ЭФФЕКТОВ (ЧИСТАЯ БАЗА) ===");
    
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
    const compDir = path.join(process.cwd(), 'compositions');

    let cssLibrary = "";
    if (library.effectsPool) {
        if (library.effectsPool.movements) {
            for (const [name, keyframes] of Object.entries(library.effectsPool.movements)) {
                cssLibrary += `@keyframes ${name} { ${keyframes} }\n`;
            }
        }
        if (library.effectsPool.appearances) {
            for (const [name, keyframes] of Object.entries(library.effectsPool.appearances)) {
                // Оставляем только замену var() на 1 для стабильности Chromium, без генерации дублей анимаций
                const fixedKeyframes = keyframes.replace(/var\(--base-opacity,\s*1\)/g, "1");
                cssLibrary += `@keyframes ${name} { ${fixedKeyframes} }\n`;
            }
        }
    }

    const styleBlock = `
        <style>
            body { margin: 0; background: transparent; overflow: hidden; }
            #root { position: absolute; width: 100vw; height: 100vh; pointer-events: none; }
            .anim-wrapper { position: absolute; width: 100%; height: 100%; pointer-events: none; }
            .visual-layer { position: absolute; width: 100%; height: 100%; background-size: cover; background-position: center; opacity: 0; }
            .video-asset-layer { position: absolute; width: 100%; height: 100vh; object-fit: cover; opacity: 0; }
            ${cssLibrary}
            .blackout { display: none !important; }
        </style>
    `;

    const activeAssetPools = director.assetPools || config.assetPools;
    const loadedAssets = {};
    for (const [poolName, pool] of Object.entries(activeAssetPools)) {
        if (pool.enabled === false || poolName.startsWith('_') || pool.class === "narrative" || pool.class === "noise") continue;
        
        let paths = Array.isArray(pool.path) ? pool.path : [pool.path];
        let files = [];
        paths.forEach(p => {
            const fullPath = path.join(process.cwd(), p);
            if (fs.existsSync(fullPath)) {
                const folderContents = fs.readdirSync(fullPath);
                const validFiles = folderContents.filter(f => ['.jpg', '.jpeg', '.png', '.webp', '.mp4'].includes(path.extname(f).toLowerCase()));
                files.push(...validFiles.map(f => `${p}/${f}`));
            }
        });
        
        log(`📂 Пул '${poolName}' (слой ${pool.layerIndex}, класс ${pool.class}): найдено ${files.length} файлов.`);

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

    let visualBgHTML = "";
    let visualFgHTML = "";
    const structure = (director.songStructure || config.songStructure).sort((a, b) => a.time - b.time);
    const sectionRulesMap = director.sectionTypeRules || config.sectionTypeRules || {};

    for (let i = 0; i < structure.length; i++) {
        const block = structure[i];
        const absBlockStart = block.time;
        const absBlockEnd = (i < structure.length - 1) ? structure[i + 1].time : config.project.totalDuration;

        if (isTest && (absBlockEnd <= testStart || absBlockStart >= testEnd)) continue;

        const start = isTest ? Math.max(absBlockStart, testStart) : absBlockStart;
        const end = isTest ? Math.min(absBlockEnd, testEnd) : absBlockEnd;
        const duration = end - start;
        if (duration <= 0) continue;

        const rules = sectionRulesMap[block.type] || { blackout: false, allowedLayers: [1, 2, 3, 5, 6, 7] };
        if (rules.blackout) continue;

        for (const [poolName, pool] of Object.entries(loadedAssets)) {
            if (!rules.allowedLayers.includes(pool.layerIndex) || pool.files.length === 0) continue;

            if (pool.class === "atmosphere" || pool.class === "splash_burst" || pool.class === "transition") {
                
                const renderStart = isTest ? (start - testStart) : start;
                let slotDur = duration; 
                if (pool.class === "splash_burst" || pool.class === "transition") {
                    slotDur = Math.min(1.5, duration); 
                }
                
                const file = pool.getNext();
                if (!file) continue;

                const allowedMoves = pool.allowedMovements || ["none"];
                const moveIndex = (i * 11 + (pool.layerIndex || 0)) % allowedMoves.length;
                const move = allowedMoves[moveIndex];
                const appear = pool.defaultAppearance || "soft_fade";
                const wrapperId = `wrap-${poolName}-sec${i}`;
                const mediaId = `vid-${poolName}-sec${i}`;
                const baseOp = pool.baseOpacity !== undefined ? pool.baseOpacity : 0.8;

                const mediaTag = file.toLowerCase().endsWith('.mp4')
                ? `<video id="${mediaId}" src="../${file}" class="video-asset-layer clip" data-in="0" data-out="${slotDur.toFixed(3)}" data-start="${renderStart.toFixed(3)}" data-hf-media-start-basis="global" data-duration="${slotDur.toFixed(3)}" data-track-index="${pool.layerIndex}" style="mix-blend-mode: ${pool.blendMode || 'multiply'}; opacity: 0; animation: ${move} ${slotDur.toFixed(3)}s linear forwards, ${appear} ${slotDur.toFixed(3)}s linear forwards;" autoplay muted loop playsinline></video>`
                : `<div id="${mediaId}" class="visual-layer clip" data-in="0" data-out="${slotDur.toFixed(3)}" data-start="${renderStart.toFixed(3)}" data-duration="${slotDur.toFixed(3)}" data-track-index="${pool.layerIndex}" style="background-image: url('../${file}'); mix-blend-mode: ${pool.blendMode || 'multiply'}; opacity: 0; animation: ${move} ${slotDur.toFixed(3)}s linear forwards, ${appear} ${slotDur.toFixed(3)}s linear forwards;"></div>`;

                const htmlChunk = `\n<div id="${wrapperId}" class="anim-wrapper" style="opacity: ${baseOp};">${mediaTag}</div>`;
                
                if (pool.layerIndex < 3) {
                    visualBgHTML += htmlChunk;
                } else {
                    visualFgHTML += htmlChunk;
                }
            } 
        }
    }

    if (!fs.existsSync(compDir)) fs.mkdirSync(compDir, { recursive: true });

    const bgOutput = `<!DOCTYPE html>\n<html>\n<head>\n${styleBlock}\n</head>\n<body>\n<div id="root" data-composition-id="visuals_bg_scene" data-width="${config.project.resolution.width}" data-height="${config.project.resolution.height}" data-duration="${totalDuration}">\n${visualBgHTML}</div>\n<script>window.__timelines = window.__timelines || {}; window.__timelines["visuals_bg_scene"] = document.querySelector('#root');</script>\n</body>\n</html>`;
    fs.writeFileSync(path.join(compDir, 'visuals_bg_scene.html'), bgOutput, 'utf8');

    const fgOutput = `<!DOCTYPE html>\n<html>\n<head>\n${styleBlock}\n</head>\n<body>\n<div id="root" data-composition-id="visuals_fg_scene" data-width="${config.project.resolution.width}" data-height="${config.project.resolution.height}" data-duration="${totalDuration}">\n${visualFgHTML}</div>\n<script>window.__timelines = window.__timelines || {}; window.__timelines["visuals_fg_scene"] = document.querySelector('#root');</script>\n</body>\n</html>`;
    fs.writeFileSync(path.join(compDir, 'visuals_fg_scene.html'), fgOutput, 'utf8');
    
    log(`✅ УСПЕХ! Сгенерированы визуальные эффекты на чистой базе.`);
} catch (e) {
    console.error("❌ Ошибка:", e.message);
    process.exit(1);
}
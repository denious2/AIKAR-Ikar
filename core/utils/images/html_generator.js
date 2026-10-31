import fs from 'fs';
import path from 'path';

// Сборка слоев параллакса (-N .. fg .. +N)
export function buildLayersStack(fileObj, file, activePool, isVideo, rootDir) {
    const layersToRender = [];
    let currentZIndex = 1;

    if (!isVideo) {
        const scenesPath = path.join(rootDir, activePool.path);
        const prlxDir = path.join(scenesPath, 'prlx');
        
        if (fs.existsSync(prlxDir)) {
            const allPrlxFiles = fs.readdirSync(prlxDir);
            const prefix = `${fileObj.baseName}-prlx-b`;
            
            let bgLayers = [];
            let fgLayers = [];
            
            allPrlxFiles.forEach(f => {
                if (f.startsWith(prefix)) {
                    const numStr = f.slice(prefix.length, f.lastIndexOf('.'));
                    const n = parseInt(numStr, 10);
                    
                    if (!isNaN(n)) {
                        if (n > 0) {
                            bgLayers.push({ id: `b${n}`, path: `${activePool.path}/prlx/${f}`, n });
                        } else if (n < 0) {
                            fgLayers.push({ id: `b${n}`, path: `${activePool.path}/prlx/${f}`, n });
                        }
                    }
                }
            });

            // 1. Фоны (n > 0): Сортируем по убыванию (3, 2, 1)
            bgLayers.sort((a, b) => b.n - a.n);
            bgLayers.forEach(layer => {
                layersToRender.push({ id: layer.id, path: layer.path, zIndex: currentZIndex++ });
            });

            // 2. Герой (fg): Оставляем зазор по z-index
            currentZIndex += 10;
            layersToRender.push({ id: 'fg', path: file, zIndex: currentZIndex++ });

            // 3. Передние слои (n < 0): Сортируем по убыванию (-1, -2), чтобы -2 лег поверх -1
            currentZIndex += 10;
            fgLayers.sort((a, b) => b.n - a.n);
            fgLayers.forEach(layer => {
                layersToRender.push({ id: layer.id, path: layer.path, zIndex: currentZIndex++ });
            });
            
        } else {
            layersToRender.push({ id: 'fg', path: file, zIndex: currentZIndex });
        }
    } else {
        layersToRender.push({ id: 'fg', path: file, zIndex: currentZIndex });
    }

    return layersToRender;
}

// Генерация HTML строки для одной группы слоев
export function generateGroupHTML(params) {
    const {
        layersToRender, activePoolName, imageIndex, wrapperStyle,
        durStr, startStr, trackIdx, currentBlend, baseOpacity,
        activePool, baseMove, customEntrance, customExit, legacyAppear, defaultAppear,
        isFirst, getOverride, OVERLAP
    } = params;

    let groupHTML = `\n<div id="wrap-${activePoolName}-${imageIndex}" class="anim-wrapper" style="${wrapperStyle}">\n`;

    layersToRender.forEach((layer) => {
        const layerOverride = getOverride(layer.path);
        let finalMove = layerOverride?.movement || (layer.id === 'fg' ? baseMove : null);
        
        // >>> НОВОЕ: Определение эшелона глубины для Node Engine <<<
        let depthClass = 'layer-hero';
        let layerN = 0;
        
        if (layer.id !== 'fg') {
            layerN = parseInt(layer.id.replace('b', ''), 10);
            if (!isNaN(layerN)) {
                depthClass = layerN > 0 ? 'layer-bg' : 'layer-fg';
            }
        }

        if (!finalMove && layer.id !== 'fg') {
            const bgPoolKey = `allowedMovements_${layer.id}`;
            const bgMoves = activePool[bgPoolKey] || ["none"];
            
            let shift = 0;
            if (!isNaN(layerN)) {
                shift = layerN > 0 ? layerN : (5 + Math.abs(layerN));
            }
            const manualShift = layerOverride?.movementShift || 0;
            finalMove = bgMoves[(imageIndex + shift + manualShift) % bgMoves.length];
        }
        
        let layerAnimParts = [`${finalMove} ${durStr}s linear forwards`];
        
        const layerEntrance = layerOverride?.entrance || customEntrance;
        const layerExit = layerOverride?.exit || customExit;
        const layerAppear = layerOverride?.appearance || legacyAppear;

        if (layerEntrance || layerExit) {
            if (layerEntrance) layerAnimParts.push(`${layerEntrance} ${durStr}s linear forwards`);
            if (layerExit) layerAnimParts.push(`${layerExit} ${durStr}s linear forwards`);
        } else {
            const appear = isFirst ? "" : (layerAppear || defaultAppear);
            if (appear) layerAnimParts.push(`${appear} ${durStr}s linear forwards`);
        }

        const animCss = `animation: ${layerAnimParts.join(', ')};`;
        
        let opacityCss = `opacity: var(--base-opacity);`;
        if (!isFirst && (layerEntrance || layerExit || layerAppear || defaultAppear)) {
            opacityCss = "opacity: 0;";
        }

        const isMediaVideo = layer.path.toLowerCase().endsWith('.mp4');
        
        if (isMediaVideo) {
            // Добавлен depthClass
            groupHTML += `    <video id="vid-${activePoolName}-${imageIndex}-${layer.id}" src="../${layer.path}" class="video-layer clip ${depthClass}" data-in="0" data-out="${durStr}" data-start="${startStr}" data-hf-media-start-basis="global" data-duration="${durStr}" data-track-index="${trackIdx}" style="z-index: ${layer.zIndex}; mix-blend-mode: ${currentBlend}; --base-opacity: ${baseOpacity}; ${opacityCss} ${animCss}" autoplay muted playsinline></video>\n`;
        } else {
            // Добавлен depthClass
            groupHTML += `    <div id="img-${activePoolName}-${imageIndex}-${layer.id}" class="image-layer clip ${depthClass}" data-in="0" data-out="${durStr}" data-start="${startStr}" data-duration="${durStr}" data-track-index="${trackIdx}" style="z-index: ${layer.zIndex}; background-image: url('../${layer.path}'); mix-blend-mode: ${currentBlend}; --base-opacity: ${baseOpacity}; ${opacityCss} ${animCss}"></div>\n`;
        }
    });
    
    groupHTML += `</div>`;
    return groupHTML;
}

// Запись финального файла
export function saveComposition(compDir, styleBlock, imagesHTML, resolution, totalDuration) {
    if (!fs.existsSync(compDir)) fs.mkdirSync(compDir, { recursive: true });

    const htmlOutput = `<!DOCTYPE html>
<html>
<head>
${styleBlock}
</head>
<body>
    <div id="root" data-composition-id="images_scene" data-width="${resolution.width}" data-height="${resolution.height}" data-duration="${totalDuration}">
${imagesHTML}
    </div>
    <script>
        window.__timelines = window.__timelines || {};
        window.__timelines["images_scene"] = document.querySelector('#root');
    </script>
</body>
</html>`;

    fs.writeFileSync(path.join(compDir, 'images_scene.html'), htmlOutput, 'utf8');
}
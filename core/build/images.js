import fs from 'fs';
import path from 'path';

// Импорт наших новых модулей
import { createLogger, loadConfigs, loadBeats, loadSubtitlesStarts } from '../config_loader.js';
import { scanPools, getOverride } from '../utils/images/media_scanner.js';
import { calculateMagnetDuration } from '../utils/images/rhythm_magnet.js';
import { buildLayersStack, generateGroupHTML, saveComposition } from '../utils/images/html_generator.js';

const rootDir = process.cwd();
const log = createLogger(rootDir);

(async () => {
    try {
        log("=== СТАРТ СБОРКИ НАРРАТИВА (МОДУЛЬНАЯ АРХИТЕКТУРА) ===");
        
        // 1. Загрузка конфигураций
        const { config, director, library } = loadConfigs(rootDir);
        const beats = loadBeats(rootDir, log);
        const subtitleStarts = loadSubtitlesStarts(rootDir, log);
        
        const isTest = config.testMode && config.testMode.enabled;
        const totalDuration = isTest ? config.testMode.duration : config.project.totalDuration;
        const testStart = isTest ? config.testMode.start : 0;
        const testEnd = testStart + totalDuration;
        
        if (!config.effects || typeof config.effects.imageDuration === 'undefined') {
            throw new Error("КРИТИЧЕСКАЯ ОШИБКА: В config.json не задан параметр effects.imageDuration!");
        }
        
        const MAX_IMG_DURATION = config.effects.imageDuration; 
        const MIN_IMG_DURATION = 2.5; 
        const OVERLAP = 0.25; 

        // 2. Генерация базовых CSS стилей
        let cssLibrary = "";
        if (library.effectsPool) {
            if (library.effectsPool.movements) {
                for (const [name, keyframes] of Object.entries(library.effectsPool.movements)) cssLibrary += `@keyframes ${name} { ${keyframes} }\n`;
            }
            if (library.effectsPool.appearances) {
                for (const [name, keyframes] of Object.entries(library.effectsPool.appearances)) cssLibrary += `@keyframes ${name} { ${keyframes} }\n`;
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

        // 3. Сканирование пулов (асинхронно через ffprobe)
        const narrativePools = await scanPools(config, director, rootDir, log);
        if (Object.keys(narrativePools).length === 0) {
            log(`⚠️ Ни один пул сюжетов не найден. Генерирую пустую сцену.`);
            process.exit(0);
        }

        const structure = (director.songStructure || config.songStructure).sort((a, b) => a.time - b.time);
        const sectionRulesMap = director.sectionTypeRules || config.sectionTypeRules || {};

        let imagesHTML = "";
        let currentTime = 0;

        // 4. Главный цикл сборки таймлайна
        while (currentTime < config.project.totalDuration) {
            const absStart = currentTime;
            const EPSILON = 0.01; 
            
            let currentBlock = structure[0];
            let currentBlockEnd = totalDuration;
            
            for (let i = 0; i < structure.length; i++) {
                if (absStart + EPSILON >= structure[i].time) {
                    currentBlock = structure[i];
                    currentBlockEnd = (i < structure.length - 1) ? structure[i + 1].time : totalDuration;
                }
            }
            
            const rules = sectionRulesMap[currentBlock.type] || {};
            if (rules.blackout) { currentTime += MAX_IMG_DURATION; continue; }

            const allowedLayers = rules.allowedLayers || [];
            let activePool = null, activePoolName = null;
            
            for (const [pName, pData] of Object.entries(narrativePools)) {
                if (allowedLayers.includes(pData.layerIndex)) { activePool = pData; activePoolName = pName; break; }
            }
            if (!activePool) { currentTime += MAX_IMG_DURATION; continue; }

            const imageIndex = activePool.currentIndex;
            const fileObj = activePool.files[imageIndex % activePool.files.length];
            const file = fileObj.path;
            
            // Умный поискOverrides
            const fileOverride = getOverride(file, config, director);

            // Математика ритмического магнита
            let currentImgDuration = calculateMagnetDuration({
                absStart, currentBlockEnd, MAX_IMG_DURATION, MIN_IMG_DURATION,
                subtitleStarts, beats, fileObj, fileOverride
            });

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
            
            // Сборка Z-стека
            const layersToRender = buildLayersStack(fileObj, file, activePool, isVideo, rootDir);
            
            let renderStart = absStart;
            let finalDur = duration + OVERLAP;
            
            if (isTest) {
                if (absEnd <= testStart || absStart >= testEnd) {
                    currentTime += currentImgDuration; activePool.currentIndex++; continue;
                }
                renderStart = Math.max(0, absStart - testStart);
                finalDur = (Math.min(totalDuration, absEnd - testStart) - renderStart) + OVERLAP;
            }

            // Генерация HTML для группы слоев
            const durStr = finalDur.toFixed(3);
            imagesHTML += generateGroupHTML({
                layersToRender, activePoolName, imageIndex, 
                wrapperStyle: isFirst ? "" : `animation: wrapper_fade_in ${OVERLAP}s ease-out forwards;`,
                durStr, startStr: renderStart.toFixed(3), trackIdx, 
                currentBlend: (layersToRender.length > 1) ? 'normal' : baseBlendMode, 
                baseOpacity, activePool, baseMove, customEntrance, customExit, legacyAppear, defaultAppear,
                isFirst, getOverride: (fPath) => getOverride(fPath, config, director), OVERLAP
            });

            currentTime += currentImgDuration;
            activePool.currentIndex++;
        }

        // 5. Финальное сохранение
        saveComposition(path.join(rootDir, 'compositions'), styleBlock, imagesHTML, config.project.resolution, totalDuration);
        log(`✅ УСПЕХ! Нарратив собран модульным движком.`);

    } catch (e) { 
        console.error("❌ Ошибка:", e.message); 
        process.exit(1); 
    }
})();
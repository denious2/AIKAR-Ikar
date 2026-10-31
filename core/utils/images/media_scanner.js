import fs from 'fs';
import path from 'path';
import { getVideoDurationInSeconds } from 'get-video-duration';
import ffprobe from 'ffprobe-static';

// Сканирование пулов ассетов и сбор информации о медиафайлах
export async function scanPools(config, director, rootDir, log) {
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
    return narrativePools;
}

// Умный поиск переопределений (Fuzzy Match по базовому имени файла)
export function getOverride(filePath, config, director) {
    const overrides = director.directorOverrides?.files || config.directorOverrides?.files || {};
    
    // 1. Ищем точное совпадение
    if (overrides[filePath]) return overrides[filePath];
    
    // 2. Ищем совпадение только по имени файла (игнорируя папки)
    const targetBase = filePath.split('/').pop().split('\\').pop();
    for (const [key, val] of Object.entries(overrides)) {
        const keyBase = key.split('/').pop().split('\\').pop();
        if (keyBase === targetBase) {
            return val;
        }
    }
    return null;
}
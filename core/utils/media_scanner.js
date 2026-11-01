import fs from 'fs';
import path from 'path';
import { createLogger } from '../config_loader.js';

const rootDir = process.cwd();
const log = createLogger(rootDir);

(async () => {
    log("=== СТАРТ СКАНИРОВАНИЯ МЕДИА-ПАСКОВ ===");

    try {
        const mediaDir = path.join(rootDir, 'media');
        if (!fs.existsSync(mediaDir)) {
            throw new Error("Папка media/ не найдена!");
        }

        const manifest = {
            scannedAt: new Date().toISOString(),
            audioTracks: [],
            scenes: [],
            sfx: []
        };

        // 1. Сканируем корень media/ на предмет аудиофайлов (.mp3, .wav)
        const rootFiles = fs.readdirSync(mediaDir);
        rootFiles.forEach(f => {
            const ext = path.extname(f).toLowerCase();
            if (ext === '.mp3' || ext === '.wav') {
                manifest.audioTracks.push({
                    fileName: f,
                    path: `media/${f}`,
                    sizeBytes: fs.statSync(path.join(mediaDir, f)).size
                });
            }
        });

        // 2. Сканируем Scenes/ (главный нарратив и параллакс)
        const scenesDir = path.join(mediaDir, 'Scenes');
        if (fs.existsSync(scenesDir)) {
            const sceneFiles = fs.readdirSync(scenesDir);
            
            // Группируем основные файлы и их параллакс
            const baseAssets = sceneFiles.filter(f => !f.includes('-prlx-') && (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.mp4')));

            baseAssets.forEach(asset => {
                const baseName = path.basename(asset, path.extname(asset));
                const assetEntry = {
                    name: baseName,
                    file: asset,
                    path: `media/Scenes/${asset}`,
                    layers: []
                };

                // Ищем соответствующие слои параллакса для этого ассета
                const prlxLayers = sceneFiles.filter(f => f.startsWith(`${baseName}-prlx-`));
                prlxLayers.forEach(layerFile => {
                    assetEntry.layers.push({
                        file: layerFile,
                        path: `media/Scenes/prlx/${layerFile}` // или прямо в Scenes
                    });
                });

                manifest.scenes.push(assetEntry);
            });
        }

        // Сохраняем результат в корневой манифест для ИИ-агента
        const manifestPath = path.join(rootDir, 'media_manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

        log(`✅ УСПЕХ! Манифест медиа создан: media_manifest.json`);
        log(`🎵 Найдено аудио: ${manifest.audioTracks.length}`);
        log(`🖼️ Найдено сцен/фокусов: ${manifest.scenes.length}`);

    } catch (e) {
        log(`❌ Ошибка сканирования медиа: ${e.message}`);
    }
})();
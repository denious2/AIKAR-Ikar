import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createLogger } from '../config_loader.js';
import ffprobe from 'ffprobe-static';

const rootDir = process.cwd();
const log = createLogger(rootDir);

// Вспомогательная функция для рекурсивного поиска файлов в подпапках
function getAllFilesRecursive(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    let allFiles = arrayOfFiles || [];
  
    files.forEach(function(file) {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            allFiles = getAllFilesRecursive(fullPath, allFiles);
        } else {
            allFiles.push(fullPath);
        }
    });
  
    return allFiles;
}

// Синхронная функция получения длительности через ffprobe
function getDurationSync(filePath) {
    try {
        const command = `"${ffprobe.path}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
        const result = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
        return parseFloat(result.trim());
    } catch (err) {
        log(`⚠️ Ошибка чтения длительности для ${filePath}: ${err.message}`);
        return null;
    }
}

// Убрали async, теперь весь скрипт строго синхронный
(() => {
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
        let audioCandidates = [];
        
        rootFiles.forEach(f => {
            const ext = path.extname(f).toLowerCase();
            if (ext === '.mp3' || ext === '.wav') {
                audioCandidates.push({
                    fileName: f,
                    path: `media/${f}`,
                    sizeBytes: fs.statSync(path.join(mediaDir, f)).size
                });
            }
        });

        // Если нашли аудио, определяем главный микс (самый тяжелый файл)
        if (audioCandidates.length > 0) {
            // Сортируем по размеру (по убыванию)
            audioCandidates.sort((a, b) => b.sizeBytes - a.sizeBytes);
            
            // Самый большой файл помечаем как кандидата на главный трек
            const mainAudio = audioCandidates[0];
            mainAudio.isMainCandidate = true;
            
            log(`⏳ Вычисляем длительность главного микса: ${mainAudio.fileName}...`);
            const fullAudioPath = path.join(rootDir, mainAudio.path);
            
            // ЖЕЛЕЗОБЕТОННЫЙ СИНХРОННЫЙ ВЫЗОВ
            const duration = getDurationSync(fullAudioPath);
            
            if (duration !== null) {
                // Округляем до 3 знаков после запятой
                mainAudio.durationSeconds = parseFloat(duration.toFixed(3));
                log(`⏱️ Точная длительность: ${mainAudio.durationSeconds}s`);
            } else {
                mainAudio.durationSeconds = null;
            }
        }
        
        manifest.audioTracks = audioCandidates;

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
                        // Исправлен путь, параллакс обычно лежит в папке prlx/
                        path: fs.existsSync(path.join(scenesDir, 'prlx', layerFile)) 
                              ? `media/Scenes/prlx/${layerFile}` 
                              : `media/Scenes/${layerFile}`
                    });
                });

                manifest.scenes.push(assetEntry);
            });
        }
        
        // 3. Сканируем SFX/ (Акценты, глитчи - рекурсивно во вложенных папках)
        const sfxDir = path.join(mediaDir, 'sfx');
        if (fs.existsSync(sfxDir)) {
            const allSfxFiles = getAllFilesRecursive(sfxDir);
            
            allSfxFiles.forEach(fullPath => {
                const ext = path.extname(fullPath).toLowerCase();
                // Ловим видео-глитчи (.mp4, .mov) и аудио-эффекты (.wav, .mp3)
                if (['.mp4', '.mov', '.wav', '.mp3'].includes(ext)) {
                    // Формируем относительный путь: media/sfx/accents/glitch.mp4
                    const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
                    const fileName = path.basename(fullPath);
                    
                    manifest.sfx.push({
                        file: fileName,
                        path: relPath
                    });
                }
            });
        }

        // Сохраняем результат в корневой манифест для ИИ-агента
        const manifestPath = path.join(rootDir, 'media_manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

        log(`✅ УСПЕХ! Манифест медиа создан: media_manifest.json`);
        log(`🎵 Найдено аудио: ${manifest.audioTracks.length}`);
        log(`🖼️ Найдено сцен/фокусов: ${manifest.scenes.length}`);
        log(`⚡ Найдено эффектов SFX: ${manifest.sfx.length}`);

    } catch (e) {
        log(`❌ Ошибка сканирования медиа: ${e.message}`);
    }
})();
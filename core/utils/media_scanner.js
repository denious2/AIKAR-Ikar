/**
 * Файл: core/utils/media_scanner.js
 * Версия: 2.3.0 (Smart Stem Exclusion & Clear Logging)
 * Описание: Сканирует media, исключает стемы из роли главного трека и обновляет config.json.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createLogger } from '../config_loader.js';
import ffprobe from 'ffprobe-static';

const rootDir = process.cwd();
const log = createLogger(rootDir);

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

        const rootFiles = fs.readdirSync(mediaDir);
        let audioFiles = [];
        let subtitlesFile = "";
        
        rootFiles.forEach(f => {
            const ext = path.extname(f).toLowerCase();
            if (ext === '.mp3' || ext === '.wav') {
                audioFiles.push({
                    fileName: f,
                    path: `media/${f}`,
                    sizeBytes: fs.statSync(path.join(mediaDir, f)).size
                });
            }
            if (ext === '.srt') {
                subtitlesFile = `media/${f}`;
            }
        });

        const configPath = path.join(rootDir, 'configs', 'config.json');
        let currentConfig = { project: {}, media: {} };
        if (fs.existsSync(configPath)) {
            currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }

        if (audioFiles.length > 0) {
            // Список ключевых слов стемов и вспомогательных файлов, которые НЕ ДОЛЖНЫ становиться главным треком
            const stemKeywords = ['bass', 'drum', 'drums', 'melody', 'vocal', 'acapella', 'accents', 'beat', 'beats', 'sfx', 'pad', 'pads', 'inst'];

            // 1. Ищем файлы, в названии которых нет ключевых слов стемов (чистые кандидаты на главный трек)
            let pureCandidates = audioFiles.filter(a => {
                const lowerName = a.fileName.toLowerCase();
                return !stemKeywords.some(keyword => lowerName.includes(keyword));
            });

            let chosenAudio = null;
            let selectionStrategy = "";

            if (pureCandidates.length > 0) {
                // Если есть чистые файлы, берем самый крупный из них
                pureCandidates.sort((a, b) => b.sizeBytes - a.sizeBytes);
                chosenAudio = pureCandidates[0];
                selectionStrategy = "Главный трек (выбран среди чистых аудиофайлов без стоп-слов)";
            } else {
                // Если чистых файлов нет вообще, берем первый попавшийся из всех
                audioFiles.sort((a, b) => b.sizeBytes - a.sizeBytes);
                chosenAudio = audioFiles[0];
                selectionStrategy = "Фолбэк (чистых треков не найдено, выбран самый тяжелый файл)";
            }

            chosenAudio.isMainCandidate = true;

            log(`🎵 СТРАТЕГИЯ ВЫБОРА АУДИО: ${selectionStrategy}`);
            log(`⏳ Вычисляем длительность выбранного трека [${chosenAudio.fileName}]...`);
            
            const fullAudioPath = path.join(rootDir, chosenAudio.path);
            const duration = getDurationSync(fullAudioPath);
            
            if (duration !== null) {
                chosenAudio.durationSeconds = parseFloat(duration.toFixed(3));
                log(`✅ УСПЕХ! Главный трек: "${chosenAudio.fileName}" | Длительность: ${chosenAudio.durationSeconds}s`);
                
                if (!currentConfig.media) currentConfig.media = {};
                if (!currentConfig.project) currentConfig.project = {};
                
                currentConfig.media.audioFile = chosenAudio.path;
                currentConfig.project.audioFile = chosenAudio.path; 
                currentConfig.project.totalDuration = chosenAudio.durationSeconds;
                
                if (subtitlesFile) {
                    currentConfig.media.subtitlesFile = subtitlesFile;
                    log(`💬 Найдены субтитры: ${subtitlesFile}`);
                }
                
                fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf8');
                log(`📝 Файл configs/config.json успешно обновлен.`);
            } else {
                chosenAudio.durationSeconds = null;
                log(`⚠️ Не удалось прочитать длительность трека.`);
            }
        }
        
        manifest.audioTracks = audioFiles;

        const scenesDir = path.join(mediaDir, 'Scenes');
        if (fs.existsSync(scenesDir)) {
            const sceneFiles = fs.readdirSync(scenesDir);
            const baseAssets = sceneFiles.filter(f => !f.includes('-prlx-') && (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.mp4')));

            baseAssets.forEach(asset => {
                const baseName = path.basename(asset, path.extname(asset));
                const assetEntry = {
                    name: baseName,
                    file: asset,
                    path: `media/Scenes/${asset}`,
                    layers: []
                };

                const prlxLayers = sceneFiles.filter(f => f.startsWith(`${baseName}-prlx-`));
                prlxLayers.forEach(layerFile => {
                    assetEntry.layers.push({
                        file: layerFile,
                        path: fs.existsSync(path.join(scenesDir, 'prlx', layerFile)) 
                              ? `media/Scenes/prlx/${layerFile}` 
                              : `media/Scenes/${layerFile}`
                    });
                });
                manifest.scenes.push(assetEntry);
            });
        }
        
        const sfxDir = path.join(mediaDir, 'sfx');
        if (fs.existsSync(sfxDir)) {
            const allSfxFiles = getAllFilesRecursive(sfxDir);
            allSfxFiles.forEach(fullPath => {
                const ext = path.extname(fullPath).toLowerCase();
                if (['.mp4', '.mov', '.wav', '.mp3'].includes(ext)) {
                    const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
                    const fileName = path.basename(fullPath);
                    manifest.sfx.push({ file: fileName, path: relPath });
                }
            });
        }

        const manifestPath = path.join(rootDir, 'media_manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

        log(`✅ Сканирование завершено. Манифест записан в media_manifest.json`);

    } catch (e) {
        log(`❌ Ошибка сканирования медиа: ${e.message}`);
    }
})();
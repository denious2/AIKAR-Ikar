/**
 * Файл: core/config_loader.js
 * Версия: 2.1.0 (Dynamic Subtitles Path)
 * Описание: Централизованная загрузка конфигураций и логгер.
 */

import fs from 'fs';
import path from 'path';

export function createLogger(rootDir) {
    const logFile = path.join(rootDir, 'debug_log.txt');
    return function log(msg) {
        console.log(msg);
        fs.appendFileSync(logFile, msg + "\n", 'utf8');
    };
}

export function loadConfigs(rootDir) {
    const configPath = path.join(rootDir, 'configs', 'config.json');
    const directorPath = path.join(rootDir, 'configs', 'director-config.json');
    const libraryPath = path.join(rootDir, 'configs', 'library-config.json');
    
    if (!fs.existsSync(configPath)) throw new Error(`config.json не найден по пути: ${configPath}`);
    if (!fs.existsSync(directorPath)) throw new Error(`director-config.json не найден по пути: ${directorPath}`);
    if (!fs.existsSync(libraryPath)) throw new Error(`library-config.json не найден по пути: ${libraryPath}`);

    return {
        config: JSON.parse(fs.readFileSync(configPath, 'utf8')),
        director: JSON.parse(fs.readFileSync(directorPath, 'utf8')),
        library: JSON.parse(fs.readFileSync(libraryPath, 'utf8'))
    };
}

export function loadBeats(rootDir, log) {
    let beats = [];
    try {
        const beatsPath = path.join(rootDir, 'beats.json');
        if (fs.existsSync(beatsPath)) {
            const beatsData = JSON.parse(fs.readFileSync(beatsPath, 'utf8'));
            beats = beatsData.beats || [];
            log(`🎵 УСПЕХ: Загружено битов - ${beats.length}`);
        } else {
            log(`ℹ️ Файл beats.json не найден по пути ${beatsPath}. Модуль пропущен.`);
        }
    } catch (e) {
        log(`⚠️ Ошибка чтения битов: ${e.message}`);
    }
    return beats;
}

export function loadSubtitlesStarts(rootDir, log) {
    let subtitleStarts = [];
    try {
        const { config } = loadConfigs(rootDir);
        const subPathRel = config.media?.subtitlesFile;
        
        if (!subPathRel || subPathRel.trim() === '') {
            return []; // Субтитры отключены
        }

        const srtPath = path.join(rootDir, subPathRel);
        
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
            log(`💬 УСПЕХ: Загружено строк субтитров - ${subtitleStarts.length} из ${subPathRel}`);
        } else {
            log(`❌ КРИТИЧНО: Файл субтитров не найден по пути ${srtPath}`);
        }
    } catch (e) {
        log(`⚠️ Ошибка чтения субтитров: ${e.message}`);
    }
    return subtitleStarts;
}
/**
 * Файл: core/utils/generate_beats.js
 * Версия: 2.2.1 (Config-Driven BPM limits)
 * Описание: Ищет ритмическую сетку (биты) и определяет BPM с опорой на audioAnalysis из конфига.
 */

import fs from 'fs';
import path from 'path';
import { AudioContext } from 'web-audio-api';
import MusicTempo from 'music-tempo';
import { createLogger, loadConfigs } from '../config_loader.js';

const rootDir = process.cwd();
const log = createLogger(rootDir);

try {
    log("🎵 Старт анализа аудиофайла на биты (BPM & Beat Grid)...");
    
    const { config, director } = loadConfigs(rootDir);
    
    // Читаем настройки анализа битов из конфига (с фолбэком на стандартные значения)
    const beatsCfg = config.audioAnalysis?.beats || director.audioAnalysis?.beats || {};
    const MIN_BPM = beatsCfg.minBpm || 60;
    const MAX_BPM = beatsCfg.maxBpm || 180;

    const audioDir = path.join(rootDir, 'media');
    
    if (!fs.existsSync(audioDir)) {
        throw new Error("Папка media не найдена!");
    }
    
    const files = fs.readdirSync(audioDir);
    let audioFileName = null;
    let searchStrategy = "";

    // 1. Ищем выделенный стем/файл битов (содержит "beat" или "drum")
    audioFileName = files.find(f => 
        (f.endsWith('.mp3') || f.endsWith('.wav')) && 
        (f.toLowerCase().includes('beat') || f.toLowerCase().includes('drum'))
    );
    if (audioFileName) searchStrategy = "Найден выделенный файл ритма (по слову 'beat' или 'drum')";

    // 2. Фолбэк на главный трек из конфига
    if (!audioFileName && config.project?.audioFile) {
        const cfgName = path.basename(config.project.audioFile);
        if (files.includes(cfgName)) {
            audioFileName = cfgName;
            searchStrategy = "Фолбэк на главный трек из config.json";
        }
    }

    // 3. Фолбэк на любой общий трек
    if (!audioFileName) {
        audioFileName = files.find(f => 
            (f.endsWith('.mp3') || f.endsWith('.wav')) && 
            (f.toLowerCase().includes('track') || f.toLowerCase().includes('main') || f.toLowerCase().includes('song') || f.toLowerCase().includes('master'))
        );
        if (audioFileName) searchStrategy = "Главный трек (по словам track/main/song/master)";
    }

    // 4. Любой аудиофайл (кроме вокала, баса, мелодии)
    if (!audioFileName) {
        audioFileName = files.find(f => 
            (f.endsWith('.mp3') || f.endsWith('.wav')) && 
            !f.toLowerCase().includes('vocal') && 
            !f.toLowerCase().includes('bass') && 
            !f.toLowerCase().includes('melody')
        );
        if (audioFileName) searchStrategy = "Фолбэк-трек (любой файл, кроме других стемов)";
    }

    // 5. Абсолютный фолбэк
    if (!audioFileName) {
        audioFileName = files.find(f => f.endsWith('.mp3') || f.endsWith('.wav'));
        if (audioFileName) searchStrategy = "Абсолютный фолбэк (любой аудиофайл)";
    }
    
    if (!audioFileName) {
        log(`⚠️ ВНИМАНИЕ: Аудиофайл для битов не найден. Модуль пропущен.`);
        process.exit(0);
    }

    log(`🥁 ИСТОЧНИК БИТОВ: выбран файл [${audioFileName}] (${searchStrategy})`);

    const audioPath = path.join(audioDir, audioFileName);
    const outputPath = path.join(rootDir, 'beats.json');
    const audioData = fs.readFileSync(audioPath);
    const context = new AudioContext();

    context.decodeAudioData(audioData, (buffer) => {
        log("⏳ Декодирование завершено. Ищу пики и грув...");
        
        let channelData = buffer.getChannelData(0);
        let mt = new MusicTempo(channelData);
        
        const bpm = Math.round(mt.tempo);
        const beatsArray = mt.beats.map(b => parseFloat(b.toFixed(3)));

        // Оцениваем адекватность сетки битов на основе параметров из config.json
        if (bpm < MIN_BPM) {
            log(`⚠️ ВНИМАНИЕ: Определен очень низкий темп (${bpm} BPM, ниже лимита ${MIN_BPM}). Возможно, алгоритм распознал половинный размер.`);
        } else if (bpm > MAX_BPM) {
            log(`⚠️ ВНИМАНИЕ: Определен очень высокий темп (${bpm} BPM, выше лимита ${MAX_BPM}). Проверьте корректность сетки.`);
        }

        const result = {
            bpm: bpm,
            sourceFile: audioFileName,
            beats: beatsArray
        };
        
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
        log(`✅ УСПЕХ! Биты сохранены в beats.json`);
        log(`⏱ Темп: ${result.bpm} BPM | Найдено ударов: ${result.beats.length}`);
        process.exit(0);
    }, (err) => {
        log(`❌ Ошибка декодирования: ${err}`);
        process.exit(1);
    });
} catch (e) {
    log(`❌ Системная ошибка: ${e.message}`);
    process.exit(1);
}
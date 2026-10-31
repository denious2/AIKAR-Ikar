import fs from 'fs';
import path from 'path';
import { AudioContext } from 'web-audio-api';
import MusicTempo from 'music-tempo';
import { createLogger, loadConfigs } from '../config_loader.js';

const rootDir = process.cwd();
const log = createLogger(rootDir);

try {
    log("🎵 Старт анализа аудиофайла...");
    
    // Используем нашу утилиту для загрузки конфига
    const { config } = loadConfigs(rootDir);
    
    // Берем основной файл из конфига (config.media.audioFile)
    const audioPath = path.join(rootDir, config.media.audioFile);
    const outputPath = path.join(rootDir, 'beats.json');

    if (!fs.existsSync(audioPath)) {
        log(`❌ Ошибка: Файл ${audioPath} не найден!`);
        process.exit(1);
    }

    const audioData = fs.readFileSync(audioPath);
    const context = new AudioContext();

    context.decodeAudioData(audioData, (buffer) => {
        log("⏳ Декодирование завершено. Ищу пики и грув...");
        
        // Берем левый канал для анализа
        let channelData = buffer.getChannelData(0);
        
        // Запускаем алгоритм
        let mt = new MusicTempo(channelData);
        
        const result = {
            bpm: Math.round(mt.tempo),
            beats: mt.beats.map(b => parseFloat(b.toFixed(3))) // Округляем до миллисекунд для чистоты JSON
        };
        
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
        log(`✅ УСПЕХ! Биты сохранены в beats.json`);
        log(`⏱ Темп: ${result.bpm} BPM | Найдено ударов: ${result.beats.length}`);
        process.exit(0);
    }, (err) => {
        log(`❌ Ошибка декодирования: ${err}`);
    });
} catch (e) {
    log(`❌ Системная ошибка: ${e.message}`);
    process.exit(1);
}
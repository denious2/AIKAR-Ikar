import fs from 'fs';
import path from 'path';
import { AudioContext } from 'web-audio-api';
import MusicTempo from 'music-tempo';

console.log("🎵 Старт анализа аудиофайла...");

const audioPath = path.join(process.cwd(), 'media', 'Икар-15s.mp3');
const outputPath = path.join(process.cwd(), 'beats.json');

if (!fs.existsSync(audioPath)) {
    console.error(`❌ Ошибка: Файл ${audioPath} не найден!`);
    process.exit(1);
}

const audioData = fs.readFileSync(audioPath);
const context = new AudioContext();

context.decodeAudioData(audioData, (buffer) => {
    console.log("⏳ Декодирование завершено. Ищу пики и грув...");
    
    // Берем левый канал для анализа
    let channelData = buffer.getChannelData(0);
    
    // Запускаем алгоритм
    let mt = new MusicTempo(channelData);
    
    const result = {
        bpm: Math.round(mt.tempo),
        beats: mt.beats.map(b => parseFloat(b.toFixed(3))) // Округляем до миллисекунд для чистоты JSON
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`✅ УСПЕХ! Биты сохранены в beats.json`);
    console.log(`⏱ Темп: ${result.bpm} BPM | Найдено ударов: ${result.beats.length}`);
    process.exit(0);
}, (err) => {
    console.error("❌ Ошибка декодирования:", err);
});
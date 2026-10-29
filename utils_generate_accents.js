import fs from 'fs';
import path from 'path';
import { AudioContext } from 'web-audio-api';

console.log("🎸 Старт анализа пиков (Peak Detection)...");

const audioPath = path.join(process.cwd(), 'media', 'accents-15s.mp3');
const outputPath = path.join(process.cwd(), 'accents.json');

if (!fs.existsSync(audioPath)) {
    console.error(`❌ Ошибка: Файл ${audioPath} не найден!`);
    process.exit(1);
}

const audioData = fs.readFileSync(audioPath);
const context = new AudioContext();

context.decodeAudioData(audioData, (buffer) => {
    console.log("⏳ Декодирование завершено. Сканирую волну на транзиенты...");
    
    let channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    
    // === НАСТРОЙКИ ГРУБОСТИ (ТВОЙ ПУЛЬТ УПРАВЛЕНИЯ) ===
    // Порог громкости от 0.0 до 1.0. 
    // 0.8 найдет только взрывные удары. 0.3 соберет даже тихие щипки струн.
    const THRESHOLD = 0.28; 
    
    // Защита от "дребезга" (Debounce). 
    // Если аккорд звучит долго, мы не хотим 50 вспышек подряд. Ждем минимум 250 мс перед следующим ударом.
    const COOLDOWN_MS = 250; 
    
    const cooldownSamples = (COOLDOWN_MS / 1000) * sampleRate;
    let accents = [];
    let lastPeakSample = -cooldownSamples;

    for (let i = 0; i < channelData.length; i++) {
        // Проверяем амплитуду волны
        if (Math.abs(channelData[i]) > THRESHOLD) {
            // Если прошло достаточно времени с предыдущего пика
            if (i - lastPeakSample > cooldownSamples) {
                accents.push(parseFloat((i / sampleRate).toFixed(3)));
                lastPeakSample = i;
            }
        }
    }
    
    const result = {
        settings: { threshold: THRESHOLD, cooldown_ms: COOLDOWN_MS },
        accents: accents 
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    
    console.log(`✅ УСПЕХ! Физические пики сохранены в accents.json`);
    console.log(`🎯 Найдено акцентов: ${accents.length}`);
    console.log(`💡 Если собрал лишнее -> увеличь THRESHOLD (например, до 0.7)`);
    console.log(`💡 Если пропустил нужные -> уменьши THRESHOLD (например, до 0.3)`);
    process.exit(0);
}, (err) => {
    console.error("❌ Ошибка декодирования:", err);
});
import fs from 'fs';
import path from 'path';
import { AudioContext } from 'web-audio-api';
import { createLogger, loadConfigs } from '../config_loader.js';

const rootDir = process.cwd();
const log = createLogger(rootDir);

try {
    log("🎸 Старт анализа пиков (Peak Detection)...");
    
    // Используем нашу утилиту для загрузки конфига
    const { config } = loadConfigs(rootDir);
    
    // Берем основной файл из конфига (config.media.audioFile)
    const audioPath = path.join(rootDir, config.media.audioFile);
    const outputPath = path.join(rootDir, 'accents.json');

    if (!fs.existsSync(audioPath)) {
        log(`❌ Ошибка: Файл ${audioPath} не найден!`);
        process.exit(1);
    }

    const audioData = fs.readFileSync(audioPath);
    const context = new AudioContext();

    context.decodeAudioData(audioData, (buffer) => {
        log("⏳ Декодирование завершено. Сканирую волну на транзиенты...");
        
        let channelData = buffer.getChannelData(0);
        const sampleRate = buffer.sampleRate;
        
        // === НАСТРОЙКИ ГРУБОСТИ (ТВОЙ ПУЛЬТ УПРАВЛЕНИЯ) ===
        // Порог громкости от 0.0 до 1.0. 
        // 0.8 найдет только взрывные удары. 0.3 соберет даже тихие щипки струн.
        const THRESHOLD = 0.5; 
        
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
        
        log(`✅ УСПЕХ! Физические пики сохранены в accents.json`);
        log(`🎯 Найдено акцентов: ${accents.length}`);
        log(`💡 Если собрал лишнее -> увеличь THRESHOLD (например, до 0.7)`);
        log(`💡 Если пропустил нужные -> уменьши THRESHOLD (например, до 0.3)`);
        process.exit(0);
    }, (err) => {
        log(`❌ Ошибка декодирования: ${err}`);
    });
} catch (e) {
    log(`❌ Системная ошибка: ${e.message}`);
    process.exit(1);
}
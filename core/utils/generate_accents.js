/**
 * Файл: core/utils/generate_accents.js
 * Версия: 2.1.0 (Smart Scan & Auto-Threshold)
 * Описание: Ищет резкие пики (транзиенты) в аудиофайле с автоматическим подбором чувствительности.
 */

import fs from 'fs';
import path from 'path';
import { AudioContext } from 'web-audio-api';
import { createLogger, loadConfigs } from '../config_loader.js';

const rootDir = process.cwd();
const log = createLogger(rootDir);

(async () => {
    log("🎸 Старт анализа пиков (Peak Detection)...");
    
    try {
        const { config, director } = loadConfigs(rootDir);
        const audioDir = path.join(rootDir, 'media');
        
        if (!fs.existsSync(audioDir)) {
            throw new Error("Папка media не найдена!");
        }
        
        const files = fs.readdirSync(audioDir);
        let audioFileName = null;
        let searchStrategy = "";

        // 1. Ищем выделенный стем/файл акцентов (содержит "accents" или "drums")
        audioFileName = files.find(f => 
            (f.endsWith('.mp3') || f.endsWith('.wav')) && 
            (f.toLowerCase().includes('accents') || f.toLowerCase().includes('drums'))
        );
        if (audioFileName) searchStrategy = "Найден выделенный файл акцентов/ударных";

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
                (f.toLowerCase().includes('track') || f.toLowerCase().includes('main') || f.toLowerCase().includes('song'))
            );
            if (audioFileName) searchStrategy = "Главный трек (по словам track/main)";
        }

        // 4. Любой файл
        if (!audioFileName) {
            audioFileName = files.find(f => f.endsWith('.mp3') || f.endsWith('.wav'));
            if (audioFileName) searchStrategy = "Абсолютный фолбэк (любой аудиофайл)";
        }
        
        if (!audioFileName) {
            log(`⚠️ ВНИМАНИЕ: Аудиофайл для акцентов не найден. Модуль пропущен.`);
            process.exit(0);
        }

        log(`🎵 ИСТОЧНИК АКЦЕНТОВ: выбран файл [${audioFileName}] (${searchStrategy})`);

        const audioPath = path.join(audioDir, audioFileName);
        const outputPath = path.join(rootDir, 'accents.json');
        const audioData = fs.readFileSync(audioPath);
        const context = new AudioContext();

        context.decodeAudioData(audioData, (buffer) => {
            log("⏳ Декодирование завершено. Сканирую волну...");
            
            let channelData = buffer.getChannelData(0);
            const sampleRate = buffer.sampleRate;
            const COOLDOWN_MS = 250; 
            const cooldownSamples = (COOLDOWN_MS / 1000) * sampleRate;

            // Настройки целевого диапазона количества акцентов
            const TARGET_MIN = 15;
            const TARGET_MAX = 50;
            
            // Читаем начальный порог из конфига, если он там есть
            let currentThreshold = director.accents?.threshold || 0.8;
            let attempts = 0;
            const MAX_ATTEMPTS = 5;
            let bestResult = null;

            function scanWave(threshold) {
                let accents = [];
                let lastPeakSample = -cooldownSamples;

                for (let i = 0; i < channelData.length; i++) {
                    if (Math.abs(channelData[i]) > threshold) {
                        if (i - lastPeakSample > cooldownSamples) {
                            accents.push(parseFloat((i / sampleRate).toFixed(3)));
                            lastPeakSample = i;
                        }
                    }
                }
                return accents;
            }

            // Цикл умного подбора (Auto-Thresholding)
            while (attempts < MAX_ATTEMPTS) {
                const accents = scanWave(currentThreshold);
                const count = accents.length;
                
                log(`🔄 Попытка ${attempts + 1}: THRESHOLD = ${currentThreshold.toFixed(2)} -> Найдено: ${count}`);

                // Запоминаем любой результат на случай, если идеальный не найдем
                bestResult = { threshold: currentThreshold, accents: accents, count: count };

                if (count >= TARGET_MIN && count <= TARGET_MAX) {
                    log(`🎯 Идеальное попадание в диапазон [${TARGET_MIN} - ${TARGET_MAX}]!`);
                    break; 
                }

                if (count > TARGET_MAX) {
                    // Слишком много акцентов -> повышаем порог, чтобы отсечь слабые звуки
                    currentThreshold = Math.min(1.0, currentThreshold + 0.1);
                } else if (count < TARGET_MIN) {
                    // Слишком мало акцентов -> снижаем порог
                    currentThreshold = Math.max(0.1, currentThreshold - 0.15);
                }
                attempts++;
            }

            const resultData = {
                settings: { 
                    threshold: parseFloat(bestResult.threshold.toFixed(2)), 
                    cooldown_ms: COOLDOWN_MS,
                    auto_tuned: attempts > 1
                },
                accents: bestResult.accents 
            };
            
            fs.writeFileSync(outputPath, JSON.stringify(resultData, null, 2));
            
            log(`✅ УСПЕХ! Физические пики сохранены в accents.json`);
            log(`🎯 Итоговый THRESHOLD: ${resultData.settings.threshold} | Акцентов: ${bestResult.count}`);
            process.exit(0);

        }, (err) => {
            log(`❌ Ошибка декодирования: ${err}`);
            process.exit(1);
        });

    } catch (e) {
        log(`❌ Системная ошибка в generate_accents.js: ${e.message}`);
        process.exit(1);
    }
})();
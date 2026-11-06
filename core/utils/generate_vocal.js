/**
 * Файл: core/utils/generate_vocal.js
 * Версия: 2.1.0 (Smart Path Resolution)
 * // Описание: Экстрактор вокала. Пропускает частоты человеческого голоса (300Hz - 3000Hz) с мягкой нормализацией.
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';
import { createLogger, loadConfigs } from '../config_loader.js';

const rootDir = process.cwd();
const log = createLogger(rootDir);

(async () => {
    log("=== СТАРТ АНАЛИЗА АУДИО (ЭКСТРАКТОР ВОКАЛА) ===");

    try {
        const { config } = loadConfigs(rootDir);
        const audioDir = path.join(rootDir, 'media');
        
        if (!fs.existsSync(audioDir)) throw new Error("Папка media не найдена!");
        const files = fs.readdirSync(audioDir);
        
        let audioFileName = null;
        let searchStrategy = "";

        // 1. Ищем выделенный вокал
        audioFileName = files.find(f => (f.endsWith('.mp3') || f.endsWith('.wav')) && (f.toLowerCase().includes('vocal') || f.toLowerCase().includes('acapella')));
        if (audioFileName) searchStrategy = "Найден выделенный вокал";

        // 2. Фолбэк на главный трек
        if (!audioFileName && config.project?.audioFile) {
            const cfgName = path.basename(config.project.audioFile);
            if (files.includes(cfgName)) {
                audioFileName = cfgName;
                searchStrategy = "Фолбэк на главный трек (будет применен Bandpass фильтр)";
            }
        }

        // 3. Фолбэк на общий трек
        if (!audioFileName) {
            audioFileName = files.find(f => 
                (f.endsWith('.mp3') || f.endsWith('.wav')) && 
                (f.toLowerCase().includes('track') || f.toLowerCase().includes('main') || f.toLowerCase().includes('song') || f.toLowerCase().includes('master'))
            );
            if (audioFileName) searchStrategy = "Главный трек (по словам track/main/song/master)";
        }

        // 4. Абсолютный фолбэк
        if (!audioFileName) {
            audioFileName = files.find(f => f.endsWith('.mp3') || f.endsWith('.wav'));
            if (audioFileName) searchStrategy = "Абсолютный фолбэк на первый попавшийся файл";
        }
        
        if (!audioFileName) {
            log(`⚠️ ВНИМАНИЕ: Аудиофайл для вокала не найден. Модуль пропущен.`);
            process.exit(0);
        }

        log(`🎤 ИСТОЧНИК ВОКАЛА: выбран файл [${audioFileName}]`);
        log(`🔍 Стратегия выбора: ${searchStrategy}`);

        const audioPath = path.join(audioDir, audioFileName);
        const FPS = 30;
        const SAMPLE_RATE = 44100;
        const BYTES_PER_SAMPLE = 2;
        const CHANNELS = 1;
        const CHUNK_SIZE = Math.floor(SAMPLE_RATE / FPS) * BYTES_PER_SAMPLE * CHANNELS;

        // Если это общий трек, выделяем частоты человеческого голоса (300Hz - 3000Hz)
        const filterStr = audioFileName.toLowerCase().includes('vocal') ? 'anull' : 'highpass=f=300,lowpass=f=3000';
        
        log(`🎛️ Запуск FFmpeg: Фильтр [${filterStr}]...`);

        const ffmpegProcess = spawn(ffmpegStatic, [
            '-i', audioPath,
            '-af', filterStr, 
            '-f', 's16le',
            '-ac', '1',
            '-ar', SAMPLE_RATE.toString(),
            'pipe:1'
        ]);

        let buffer = Buffer.alloc(0);
        const rmsValues = [];

        ffmpegProcess.stdout.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
            while (buffer.length >= CHUNK_SIZE) {
                const frameData = buffer.subarray(0, CHUNK_SIZE);
                buffer = buffer.subarray(CHUNK_SIZE);
                let sumSquares = 0;
                const sampleCount = frameData.length / BYTES_PER_SAMPLE;
                for (let i = 0; i < frameData.length; i += BYTES_PER_SAMPLE) {
                    const val = frameData.readInt16LE(i) / 32768.0; 
                    sumSquares += val * val;
                }
                rmsValues.push(Math.sqrt(sumSquares / sampleCount));
            }
        });

        ffmpegProcess.on('close', (code) => {
            if (code !== 0) return log(`❌ Ошибка FFmpeg (код ${code})`);

            // Для вокала используем мягкую нормализацию, чтобы тихие слова тоже было видно
            const maxRms = Math.max(...rmsValues);
            const minRms = Math.min(...rmsValues);
            
            const normalizedEnvelope = rmsValues.map(rms => {
                let normalized = (rms - minRms) / (maxRms - minRms || 1);
                // Корень смягчает пики, поднимая тихие звуки
                normalized = Math.sqrt(normalized); 
                return parseFloat(normalized.toFixed(3));
            });

            const outputPath = path.join(rootDir, 'vocal.json');
            fs.writeFileSync(outputPath, JSON.stringify({
                sourceFile: audioFileName,
                fps: FPS,
                frames: normalizedEnvelope
            }), 'utf8');

            log(`✅ УСПЕХ! Огибающая вокала сохранена в: vocal.json`);
        });

    } catch (e) { log(`❌ Системная ошибка: ${e.message}`); process.exit(1); }
})();
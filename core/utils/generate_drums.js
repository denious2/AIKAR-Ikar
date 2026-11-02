import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';
import { createLogger, loadConfigs } from '../config_loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

const log = createLogger(rootDir);

(async () => {
    log("=== СТАРТ АНАЛИЗА УДАРНЫХ (ЭКСТРАКТОР ДРУМ-ОГИБАЮЩЕЙ) ===");

    try {
        const { config } = loadConfigs(rootDir);
        const audioDir = path.join(rootDir, 'media');
        
        if (!fs.existsSync(audioDir)) throw new Error("Папка media не найдена!");
        const files = fs.readdirSync(audioDir);
        
        let audioFileName = null;
        let searchStrategy = "";

        // 1. Ищем файл с ключевыми словами drum, beat, perc, kick, loops
        audioFileName = files.find(f => (f.endsWith('.mp3') || f.endsWith('.wav')) && (
            f.toLowerCase().includes('drum') || 
            f.toLowerCase().includes('beat') || 
            f.toLowerCase().includes('perc') || 
            f.toLowerCase().includes('kick') ||
            f.toLowerCase().includes('loops')
        ));
        
        if (audioFileName) {
            searchStrategy = "Найден специализированный ударный стем";
        } else if (config.media?.audioFile) {
            // 2. Фолбэк на главный трек из конфига
            const cfgRelative = config.media.audioFile;
            const cfgName = path.basename(cfgRelative);
            const fullCfgPath = path.join(rootDir, cfgRelative);
            
            if (fs.existsSync(fullCfgPath)) {
                audioFileName = cfgName;
                searchStrategy = `Взят главный трек из config.json (${cfgName})`;
            }
        }

        if (!audioFileName) {
            audioFileName = files.find(f => f.endsWith('.mp3') || f.endsWith('.wav'));
            if (audioFileName) searchStrategy = "Абсолютный фолбэк на первый файл в папке";
        }
        
        if (!audioFileName) throw new Error("Аудиофайл не найден!");

        log(`🥁 ИСТОЧНИК ДЛЯ DRUMS: выбран файл [${audioFileName}]`);
        log(`🔍 Стратегия выбора: ${searchStrategy}`);

        const audioPath = path.join(audioDir, audioFileName);
        const FPS = 30;
        const SAMPLE_RATE = 44100;
        const BYTES_PER_SAMPLE = 2;
        const CHANNELS = 1;
        const CHUNK_SIZE = Math.floor(SAMPLE_RATE / FPS) * BYTES_PER_SAMPLE * CHANNELS;

        // Для барабанов пропускаем весь спектр, отсекая только гул ниже 30Гц
        const filterStr = 'highpass=f=30';
        
        log(`🎛️ Запуск FFmpeg: Фильтр [${filterStr}] (учитывает бочку и тарелки)...`);

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
            if (code !== 0) {
                log(`❌ Ошибка FFmpeg (код ${code})`);
                return;
            }

            // Узкое окно сглаживания (2 кадра), чтобы пики ударов были резкими и хлесткими
            const smoothWindow = 2;
            let smoothedValues = [...rmsValues];
            
            for (let i = 0; i < rmsValues.length; i++) {
                let sum = 0;
                let count = 0;
                for (let j = -smoothWindow; j <= smoothWindow; j++) {
                    if (i + j >= 0 && i + j < rmsValues.length) {
                        sum += rmsValues[i + j];
                        count++;
                    }
                }
                smoothedValues[i] = sum / count;
            }

            const maxRms = Math.max(...smoothedValues);
            const minRms = Math.min(...smoothedValues);
            
            const normalizedEnvelope = smoothedValues.map(rms => {
                let normalized = (rms - minRms) / (maxRms - minRms || 1);
                return parseFloat(normalized.toFixed(3));
            });

            const outputPath = path.join(rootDir, 'drums.json');
            fs.writeFileSync(outputPath, JSON.stringify({
                sourceFile: audioFileName,
                fps: FPS,
                frames: normalizedEnvelope
            }, 'utf8'), 'utf8');

            log(`✅ УСПЕХ! Огибающая ударных сохранена в: drums.json (найдено кадров: ${normalizedEnvelope.length})`);
        });

    } catch (e) { 
        log(`❌ Ошибка: ${e.message}`); 
    }
})();
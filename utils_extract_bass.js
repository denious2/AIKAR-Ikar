import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';

const logFile = path.join(process.cwd(), 'debug_log.txt');
function log(msg) {
    console.log(msg);
    fs.appendFileSync(logFile, msg + "\n", 'utf8');
}

(async () => {
    log("=== СТАРТ АНАЛИЗА АУДИО (ЭКСТРАКТОР БАСА) ===");

    try {
        const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
        
        // Ищем файл в папке media 
        const audioDir = path.join(process.cwd(), 'media');
        const files = fs.readdirSync(audioDir);
        
        // >>> ИСПРАВЛЕНИЕ: Умный поиск главного трека <<<
        // 1. Проверяем, может имя файла прямо указано в конфиге (fallback)
        let audioFileName = config.project?.audioFile ? path.basename(config.project.audioFile) : null;

        if (!audioFileName || !files.includes(audioFileName)) {
            // 2. Ищем файлы с явным названием главного трека (track, main, master, song)
            audioFileName = files.find(f => 
                (f.endsWith('.mp3') || f.endsWith('.wav')) && 
                (f.toLowerCase().includes('track') || f.toLowerCase().includes('main') || f.toLowerCase().includes('master') || f.toLowerCase().includes('song'))
            );

            // 3. Если не нашли, берем любой аудиофайл, ИСКЛЮЧАЯ стемы и SFX
            if (!audioFileName) {
                audioFileName = files.find(f => 
                    (f.endsWith('.mp3') || f.endsWith('.wav')) && 
                    !f.toLowerCase().includes('accents') && 
                    !f.toLowerCase().includes('stem') && 
                    !f.toLowerCase().includes('sfx') &&
                    !f.toLowerCase().includes('pads')
                );
            }

            // 4. Самый крайний фолбэк (как было раньше)
            if (!audioFileName) {
                audioFileName = files.find(f => f.endsWith('.mp3') || f.endsWith('.wav'));
            }
        }
        
        if (!audioFileName) {
            throw new Error("Аудиофайл (.mp3 или .wav) не найден в папке media!");
        }

        const audioPath = path.join(audioDir, audioFileName);
        log(`🎵 Найден аудиофайл: ${audioFileName}`);

        const FPS = 30; // 30 кадров в секунду для CSS-анимации
        const SAMPLE_RATE = 44100;
        const BYTES_PER_SAMPLE = 2; // 16-bit
        const CHANNELS = 1; // Mono
        const CHUNK_SIZE = Math.floor(SAMPLE_RATE / FPS) * BYTES_PER_SAMPLE * CHANNELS; // 2940 байт на 1 кадр

        log(`🎛️ Запуск FFmpeg: Low-pass фильтр 120Hz, частота дискретизации ${SAMPLE_RATE}Hz...`);

        // Команда: обрезать всё выше 120Hz, конвертировать в моно, 16-бит, и выдать в стандартный поток (stdout)
        const ffmpegProcess = spawn(ffmpegStatic, [
            '-i', audioPath,
            '-af', 'lowpass=f=120', // Пропускаем только бас
            '-f', 's16le',          // Формат Raw PCM 16-bit Little Endian
            '-ac', '1',             // Моно
            '-ar', SAMPLE_RATE.toString(),
            'pipe:1'                // Вывод в stdout
        ]);

        let buffer = Buffer.alloc(0);
        const rmsValues = [];

        ffmpegProcess.stdout.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
            
            // Нарезаем буфер на ровные куски по 1 кадру (33.3 мс)
            while (buffer.length >= CHUNK_SIZE) {
                const frameData = buffer.subarray(0, CHUNK_SIZE);
                buffer = buffer.subarray(CHUNK_SIZE);
                
                let sumSquares = 0;
                const sampleCount = frameData.length / BYTES_PER_SAMPLE;
                
                for (let i = 0; i < frameData.length; i += BYTES_PER_SAMPLE) {
                    // Читаем 16-битный сэмпл и нормализуем его от -1.0 до 1.0
                    const val = frameData.readInt16LE(i) / 32768.0; 
                    sumSquares += val * val;
                }
                
                // Вычисляем RMS (Root Mean Square) — среднеквадратичную громкость
                const rms = Math.sqrt(sumSquares / sampleCount);
                rmsValues.push(rms);
            }
        });

        ffmpegProcess.stderr.on('data', (data) => {
            // FFmpeg пишет свой лог в stderr, мы его игнорируем, чтобы не спамить консоль
        });

        ffmpegProcess.on('close', (code) => {
            if (code !== 0) {
                log(`❌ Ошибка FFmpeg (код ${code})`);
                return;
            }

            log(`📊 Анализ завершен. Обработано кадров: ${rmsValues.length}`);

            // Нормализация данных (чтобы самый сильный бас был равен 1.0)
            const maxRms = Math.max(...rmsValues);
            const minRms = Math.min(...rmsValues);
            
            log(`📈 Нормализация (Min: ${minRms.toFixed(4)}, Max: ${maxRms.toFixed(4)})`);

            const normalizedEnvelope = rmsValues.map(rms => {
                // Масштабируем от 0 до 1
                let normalized = (rms - minRms) / (maxRms - minRms || 1);
                
                // Делаем пики более резкими (квадратичная кривая). 
                // Тихие звуки станут еще тише, а удары останутся мощными.
                normalized = Math.pow(normalized, 2); 
                
                // Округляем до 3 знаков, чтобы не раздувать JSON
                return parseFloat(normalized.toFixed(3));
            });

            // Записываем результат
            const outputPath = path.join(process.cwd(), 'bass.json');
            fs.writeFileSync(outputPath, JSON.stringify({
                fps: FPS,
                frames: normalizedEnvelope
            }), 'utf8');

            log(`✅ УСПЕХ! Огибающая баса сохранена в: bass.json`);
        });

    } catch (e) {
        log(`❌ Ошибка: ${e.message}`);
    }
})();
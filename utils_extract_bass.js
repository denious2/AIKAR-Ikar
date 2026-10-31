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
        
        // Ищем файлы в папке media 
        const audioDir = path.join(process.cwd(), 'media');
        if (!fs.existsSync(audioDir)) {
            throw new Error("Папка media не найдена!");
        }
        const files = fs.readdirSync(audioDir);
        
        // >>> УМНЫЙ ПРИЦЕЛЬНЫЙ ПОИСК ФАЙЛА БАСА <<<
        let audioFileName = null;
        let searchStrategy = "";

        // 1. Ищем выделенный стем/файл баса (содержит "bass" в названии) - НАИВЫСШИЙ ПРИОРИТЕТ
        audioFileName = files.find(f => 
            (f.endsWith('.mp3') || f.endsWith('.wav')) && 
            f.toLowerCase().includes('bass')
        );
        if (audioFileName) {
            searchStrategy = "Найден выделенный басовый файл (по ключевому слову 'bass')";
        }

        // 2. Проверяем конфиг (если там явно прописан файл главного трека)
        if (!audioFileName && config.project?.audioFile) {
            const cfgName = path.basename(config.project.audioFile);
            if (files.includes(cfgName)) {
                audioFileName = cfgName;
                searchStrategy = "Фолбэк на главный трек (явно указан в config.json)";
            }
        }

        // 3. Если баса нет и конфиг пуст, ищем общий главный трек (track, main, master, song)
        if (!audioFileName) {
            audioFileName = files.find(f => 
                (f.endsWith('.mp3') || f.endsWith('.wav')) && 
                (f.toLowerCase().includes('track') || f.toLowerCase().includes('main') || f.toLowerCase().includes('master') || f.toLowerCase().includes('song'))
            );
            if (audioFileName) searchStrategy = "Главный трек (по ключевым словам track/main/master)";
        }

        // 4. Если и этого нет, берем любой аудиофайл, исключая явные побочные стемы (accents, sfx, pads)
        if (!audioFileName) {
            audioFileName = files.find(f => 
                (f.endsWith('.mp3') || f.endsWith('.wav')) && 
                !f.toLowerCase().includes('accents') && 
                !f.toLowerCase().includes('stem') && 
                !f.toLowerCase().includes('sfx') &&
                !f.toLowerCase().includes('pads')
            );
            if (audioFileName) searchStrategy = "Фолбэк-трек (без стемов и SFX)";
        }

        // 5. Самый последний запасной вариант — абсолютно любой аудиофайл
        if (!audioFileName) {
            audioFileName = files.find(f => f.endsWith('.mp3') || f.endsWith('.wav'));
            if (audioFileName) searchStrategy = "Абсолютный фолбэк (первый попавшийся аудиофайл)";
        }
        
        if (!audioFileName) {
            throw new Error("Аудиофайл (.mp3 или .wav) не найден в папке media!");
        }

        log(`🎵 ИСТОЧНИК БАСА: выбран файл [${audioFileName}]`);
        log(`🔍 Стратегия выбора: ${searchStrategy}`);

        const audioPath = path.join(audioDir, audioFileName);

        const FPS = 30; // 30 кадров в секунду для CSS-анимации
        const SAMPLE_RATE = 44100;
        const BYTES_PER_SAMPLE = 2; // 16-bit
        const CHANNELS = 1; // Mono
        const CHUNK_SIZE = Math.floor(SAMPLE_RATE / FPS) * BYTES_PER_SAMPLE * CHANNELS; // 2940 байт на 1 кадр

        log(`🎛️ Запуск FFmpeg: Low-pass фильтр 120Hz для файла ${audioFileName}...`);

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
            
            while (buffer.length >= CHUNK_SIZE) {
                const frameData = buffer.subarray(0, CHUNK_SIZE);
                buffer = buffer.subarray(CHUNK_SIZE);
                
                let sumSquares = 0;
                const sampleCount = frameData.length / BYTES_PER_SAMPLE;
                
                for (let i = 0; i < frameData.length; i += BYTES_PER_SAMPLE) {
                    const val = frameData.readInt16LE(i) / 32768.0; 
                    sumSquares += val * val;
                }
                
                const rms = Math.sqrt(sumSquares / sampleCount);
                rmsValues.push(rms);
            }
        });

        ffmpegProcess.stderr.on('data', (data) => {
            // Игнорируем служебный спам ffmpeg
        });

        ffmpegProcess.on('close', (code) => {
            if (code !== 0) {
                log(`❌ Ошибка FFmpeg (код ${code})`);
                return;
            }

            const totalSeconds = (rmsValues.length / FPS).toFixed(2);
            log(`📊 Анализ завершен. Обработано кадров: ${rmsValues.length} (~${totalSeconds} сек)`);

            const maxRms = Math.max(...rmsValues);
            const minRms = Math.min(...rmsValues);
            
            log(`📈 Нормализация баса (Min: ${minRms.toFixed(4)}, Max: ${maxRms.toFixed(4)})`);

            const normalizedEnvelope = rmsValues.map(rms => {
                let normalized = (rms - minRms) / (maxRms - minRms || 1);
                normalized = Math.pow(normalized, 2); 
                return parseFloat(normalized.toFixed(3));
            });

            const outputPath = path.join(process.cwd(), 'bass.json');
            fs.writeFileSync(outputPath, JSON.stringify({
                sourceFile: audioFileName,
                fps: FPS,
                frames: normalizedEnvelope
            }), 'utf8');

            log(`✅ УСПЕХ! Огибающая баса из файла "${audioFileName}" сохранена в: bass.json`);
        });

    } catch (e) {
        log(`❌ Ошибка в utils_extract_bass.js: ${e.message}`);
    }
})();
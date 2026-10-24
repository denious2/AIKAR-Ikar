import { execSync, spawn } from 'child_process';
import fs from 'fs';

const configPath = 'config.json';
if (!fs.existsSync(configPath)) {
    console.error("❌ Ошибка: Файл config.json не найден!");
    process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const resW = config.project.resolution.width;
const resH = config.project.resolution.height;
const safeProjectName = config.project.name.replace(/[:\\/*?"<>|]/g, '-');
const outputFileName = `${safeProjectName}_${resW}x${resH}.mp4`; 

// Читаем настройки рендера
const hideDebugLogs = config.render?.hideDebugLogs !== false;
const renderQuality = config.render?.quality; // например, "draft" или "high"
const renderFps = config.render?.fps;         // например, 60

const scripts = [
    'build_audio.js',
    'build_beats.js',      
    'build_images.js',      
    'build_visuals.js',   
    'build_dust.js',       
    'build_subs.js',
    'build_info.js',
    'build_index.js'
];

function getTime() {
    return new Date().toLocaleTimeString();
}

async function runPipeline() {
    console.log(`[${getTime()}] 🚀 ЗАПУСК ПАЙПЛАЙНА ГЕНЕРАЦИИ ВИДЕО: "${config.project.name}" (${resW}x${resH})\n`);

    try {
        scripts.forEach(script => {
            if (fs.existsSync(script)) {
                console.log(`[${getTime()}] --- Выполняется ${script} ---`);
                execSync(`node ${script}`, { stdio: 'inherit' });
                console.log(""); 
            } else {
                console.log(`⚠️ Пропущен ${script} (файл не найден в папке проекта)\n`);
            }
        });

        console.log(`[${getTime()}] 🎬 ВСЕ СЦЕНЫ СОБРАНЫ. ЗАПУСКАЮ РЕНДЕР...`);
        
        // Формируем динамический массив аргументов для hyperframes
        const renderArgs = ['hyperframes', 'render', '.'];
        
        if (renderQuality) {
            renderArgs.push('--quality', renderQuality);
            console.log(`✨ Качество рендера: ${renderQuality}`);
        }
        if (renderFps) {
            renderArgs.push('--fps', renderFps.toString());
            console.log(`🎥 Частота кадров: ${renderFps} FPS`);
        }
        
        renderArgs.push('-o', outputFileName);

        console.log(`⏳ Идет рендер файла: "${outputFileName}". Технический мусор скрыт, ожидайте прогресс...\n`);
        
        // Запускаем рендер асинхронно через spawn с перехватом потока
        await new Promise((resolve, reject) => {
            const renderProcess = spawn('npx', renderArgs, { shell: true });

            const filterOutput = (data) => {
                const text = data.toString();
                
                if (hideDebugLogs) {
                    // Глушим все строчки, содержащие мусорные теги браузера, ворнинги И ИНФО-СООБЩЕНИЯ
                    if (text.includes('[initSession') || 
                        text.includes('[BrowserManager]') || 
                        text.includes('[HyperFrames]') || 
                        text.includes('[WARN]') || 
                        text.includes('[INFO]') || 
                        text.includes('hyperframes]')) {
                        return; // Молча игнорируем
                    }
                }
                
                // Пропускаем чистый прогресс (процентаж и ошибки) на экран
                process.stdout.write(text);
            };

            renderProcess.stdout.on('data', filterOutput);
            renderProcess.stderr.on('data', filterOutput);

            renderProcess.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Процесс завершился с кодом ${code}`));
            });
        });

        console.log(`\n[${getTime()}] ✅ УСПЕХ! Рендер завершен. Видео сохранено как: ${outputFileName}`);
    } catch (error) {
        console.error(`\n[${getTime()}] ❌ ПРОЦЕСС ПРЕРВАН ИЗ-ЗА ОШИБКИ:`);
        console.error(error.message);
    }
}

// Запускаем пайплайн
runPipeline();
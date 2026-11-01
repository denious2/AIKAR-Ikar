import fs from 'fs';
import path from 'path';
import { loadConfigs } from '../config_loader.js';

try {
    console.log("=== СТАРТ ГЕНЕРАЦИИ AUDIO_SCENE.HTML ===");
    const rootDir = process.cwd();
    const { config } = loadConfigs(rootDir);
    
    const isTest = config.testMode && config.testMode.enabled;
    const duration = isTest ? config.testMode.duration : config.project.totalDuration;
    const testStart = isTest ? config.testMode.start : 0;
    
    const compDir = path.join(rootDir, 'compositions');
    if (!fs.existsSync(compDir)) fs.mkdirSync(compDir, { recursive: true });

    // БЕРЕМ ПУТЬ СТРОГО ИЗ КОНФИГА
    const audioFileRel = config.media?.audioFile; 
    let audioFile = '';

    if (audioFileRel) {
        const absoluteAudioPath = path.join(rootDir, audioFileRel);
        if (fs.existsSync(absoluteAudioPath)) {
            // Преобразуем путь для HTML (учитывая, что html лежит в папке compositions/)
            audioFile = `../${audioFileRel.replace(/\\/g, '/')}`;
            console.log(`🎵 Выбран основной трек из конфига: ${audioFileRel}`);
        } else {
            console.warn(`⚠️ ВНИМАНИЕ: Файл ${audioFileRel}, указанный в config.json, не существует на диске!`);
        }
    } else {
        console.warn("⚠️ ВНИМАНИЕ: В config.json не заполнен параметр media.audioFile!");
    }

    const dataIn = isTest ? testStart : 0;

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { margin: 0; background: transparent; overflow: hidden; }
        #root { position: absolute; width: 100%; height: 100%; }
        #main-audio { position: absolute; width: 0; height: 0; opacity: 0; pointer-events: none; }
    </style>
</head>
<body>
    <div id="root" data-composition-id="audio_scene">
        ${audioFile 
            ? `<audio id="main-audio" class="clip" src="${audioFile}" data-in="${dataIn}" data-out="${dataIn + duration}" data-start="0" data-duration="${duration}"></audio>` 
            : ``
        }
    </div>
    <script>
        window.__timelines = window.__timelines || {};
        window.__timelines["audio_scene"] = document.querySelector('#root');
    </script>
</body>
</html>`;

    const outputPath = path.join(compDir, 'audio_scene.html');
    fs.writeFileSync(outputPath, html, 'utf8');
    
    console.log(`✅ audio_scene.html сгенерирован (Смещение: ${dataIn}s)`);
} catch (e) {
    console.error("❌ Ошибка в audio.js:", e.message);
    process.exit(1);
}
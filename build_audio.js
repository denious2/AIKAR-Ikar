import fs from 'fs';
import path from 'path';

try {
    console.log("=== СТАРТ СБОРКИ АУДИО (АВТОНОМНАЯ СЦЕНА + TEST MODE) ===");
    const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    const compDir = path.join(process.cwd(), 'compositions');
    
    const audioFile = config.media.audioFile;
    const isTest = config.testMode && config.testMode.enabled;
    
    // Высчитываем тайминги с учетом тестового режима
    const testStart = isTest ? config.testMode.start : 0;
    const duration = isTest ? config.testMode.duration : config.project.totalDuration;
    
    // Откуда начинать читать медиа-файл и где заканчивать
    const audioIn = testStart;
    const audioOut = testStart + duration;

    const html = `<!DOCTYPE html>
<html>
<head>
    <style>body { margin: 0; background: transparent; overflow: hidden; }</style>
</head>
<body>
    <!-- Слой -1 для аудио. data-in смещается, если включен testMode -->
    <div id="root" data-composition-id="audio_scene" data-width="${config.project.resolution.width}" data-height="${config.project.resolution.height}" data-duration="${duration}">
        <audio id="main-audio" src="../${audioFile}" data-in="${audioIn.toFixed(3)}" data-out="${audioOut.toFixed(3)}" data-start="0" data-duration="${duration.toFixed(3)}" data-track-index="-1"></audio>
    </div>
    <script>
        window.__timelines = window.__timelines || {};
        window.__timelines["audio_scene"] = document.querySelector('[data-composition-id="audio_scene"]');
    </script>
</body>
</html>`;

    if (!fs.existsSync(compDir)) fs.mkdirSync(compDir, { recursive: true });
    fs.writeFileSync(path.join(compDir, 'audio_scene.html'), html, 'utf8');
    
    console.log(`✅ УСПЕХ! Аудио-сцена собрана (${audioFile}). Тайминг в треке: ${audioIn}s -> ${audioOut}s`);
} catch (e) {
    console.error("❌ Ошибка:", e.message);
}
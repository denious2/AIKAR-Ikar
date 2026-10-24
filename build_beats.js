import fs from 'fs';
import path from 'path';

try {
    // ИСПРАВЛЕНО: Добавлен стартовый лог
    console.log("=== СТАРТ СБОРКИ БИТОВ (ВСПЫШКИ) ===");

    const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    const isTest = config.testMode && config.testMode.enabled;
    const totalDuration = isTest ? config.testMode.duration : config.project.totalDuration;
    const testStart = isTest ? config.testMode.start : 0;
    const testEnd = testStart + totalDuration;
    const compDir = path.join(process.cwd(), 'compositions');

    let beats = [];
    if (fs.existsSync('beats.json')) beats = JSON.parse(fs.readFileSync('beats.json', 'utf8')).beats || [];

    let beatsHTML = '';
    const activeBeats = beats.filter(time => isTest ? (time >= testStart && time <= testEnd) : (time <= totalDuration));

    activeBeats.forEach(time => {
        const renderTime = isTest ? (time - testStart) : time;
        beatsHTML += `        <div class="beat-flash" style="animation-delay: ${renderTime.toFixed(3)}s;"></div>\n`;
    });

    let html = `<!DOCTYPE html>
<html>
<head>
    <style>
        body { margin: 0; background: transparent; overflow: hidden; }
        #root { position: absolute; width: 100vw; height: 100vh; }
        
        /* ИСПРАВЛЕНО: Глухое затемнение вместо градиента, чтобы не ломать движок */
        .beat-flash {
            position: absolute; top: 0; left: 0; width: 100vw; height: 100vh;
            background-color: rgba(0, 0, 0, 0.15);
            mix-blend-mode: multiply; 
            opacity: 0; pointer-events: none;
            animation: pulseVignette 0.6s ease-out forwards;
        }
        
        @keyframes pulseVignette {
            0% { opacity: 0; } 10% { opacity: 1; } 100% { opacity: 0; }
        }
    </style>
</head>
<body>
    <div id="root" data-composition-id="beats_scene" data-width="${config.project.resolution.width}" data-height="${config.project.resolution.height}" data-duration="${totalDuration}">
${beatsHTML}    </div>
    <script>
        window.__timelines = window.__timelines || {};
        window.__timelines["beats_scene"] = document.querySelector('[data-composition-id="beats_scene"]');
    </script>
</body>
</html>`;

    if (!fs.existsSync(compDir)) fs.mkdirSync(compDir, { recursive: true });
    fs.writeFileSync(path.join(compDir, 'beats_scene.html'), html, 'utf8');
    
    // ИСПРАВЛЕНО: Добавлен лог успешного завершения с подсчетом битов
    console.log(`✅ УСПЕХ! Сгенерированы визуальные биты (${activeBeats.length} вспышек).`);
} catch (e) { 
    console.error("❌ Ошибка:", e.message); 
}
import fs from 'fs';
import path from 'path';

try {
    console.log("=== СТАРТ СБОРКИ БИТОВ (ИЗОЛИРОВАННЫЕ КЛИПЫ) ===");

    const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    const isTest = config.testMode && config.testMode.enabled;
    const totalDuration = isTest ? config.testMode.duration : config.project.totalDuration;
    const testStart = isTest ? config.testMode.start : 0;
    const testEnd = testStart + totalDuration;
    const compDir = path.join(process.cwd(), 'compositions');

    let beats = [];
    if (fs.existsSync('beats.json')) {
        beats = JSON.parse(fs.readFileSync('beats.json', 'utf8')).beats || [];
    }

    const baseBeats = beats.filter(time => isTest ? (time >= testStart && time <= testEnd) : (time <= totalDuration));
    
    const flashConfig = config.effects?.flashes || {};
    const flashMultiplier = flashConfig.multiplier || config.effects?.flashMultiplier || 1;
    // ДЛЯ ТЕСТА: принудительно ставим solid и белый свет, чтобы точно их увидеть
    const flashType = flashConfig.type || "solid"; 
    const flashDynamics = flashConfig.dynamics || "sharp";
    const flashColor = flashConfig.color || "#ffffff";
    const flashIntensity = flashConfig.intensity || 0.4; // 40% яркости ударит по глазам

    let activeBeats = [];

    if (flashMultiplier > 1 && baseBeats.length > 1) {
        for (let i = 0; i < baseBeats.length - 1; i++) {
            const currentBeat = baseBeats[i];
            const nextBeat = baseBeats[i + 1];
            const step = (nextBeat - currentBeat) / flashMultiplier;
            for (let m = 0; m < flashMultiplier; m++) {
                activeBeats.push(currentBeat + (step * m));
            }
        }
        activeBeats.push(baseBeats[baseBeats.length - 1]);
    } else if (flashMultiplier > 0 && flashMultiplier < 1 && baseBeats.length > 1) {
        const skipStep = Math.round(1 / flashMultiplier);
        for (let i = 0; i < baseBeats.length; i += skipStep) {
            activeBeats.push(baseBeats[i]);
        }
    } else {
        activeBeats = baseBeats;
    }

    let beatsHTML = '';
    const flashDuration = 0.6; 

    activeBeats.forEach((time, index) => {
        const renderStart = isTest ? (time - testStart) : time;
        if (renderStart < 0 || renderStart > totalDuration) return;
        const renderOut = renderStart + flashDuration;

        // === ИЗОЛЯЦИЯ ОТ ДВИЖКА ===
        // Внешний div - только для Hyperframes. Внутренний - только для анимации.
        beatsHTML += `
        <div id="flash-clip-${index}" class="clip" 
             data-in="${renderStart.toFixed(3)}" 
             data-out="${renderOut.toFixed(3)}" 
             data-start="${renderStart.toFixed(3)}" 
             data-duration="${flashDuration.toFixed(3)}">
             <div class="beat-flash"></div>
        </div>\n`;
    });

    let backgroundStyle = `background-color: ${flashColor};`;
    if (flashType === 'vignette') {
        backgroundStyle = `background: radial-gradient(circle, transparent 20%, ${flashColor} 120%);`;
    }

    let peakPercent = '10%';
    if (flashDynamics === 'soft') {
        peakPercent = '50%';
    }

    let html = `<!DOCTYPE html>
<html>
<head>
    <style>
        body { margin: 0; background: transparent; overflow: hidden; }
        #root { position: absolute; width: 100vw; height: 100vh; }
        
        .clip { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
        
        .beat-flash {
            width: 100%; height: 100%;
            ${backgroundStyle}
            opacity: 0; pointer-events: none;
            /* Анимация сработает в момент активации clip'а */
            animation: pulseVignette ${flashDuration}s ease-out forwards;
        }
        
        @keyframes pulseVignette {
            0% { opacity: 0; } 
            ${peakPercent} { opacity: ${flashIntensity}; } 
            100% { opacity: 0; }
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
    
    console.log(`✅ УСПЕХ! Вспышки надежно изолированы. Цвет: ${flashColor}`);
} catch (e) { 
    console.error("❌ Ошибка:", e.message); 
}
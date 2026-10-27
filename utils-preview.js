import fs from 'fs';
import path from 'path';

// ==========================================
// 🛠 НАСТРОЙКИ ТЕСТОВОГО СТЕНДА
// ==========================================
const TEST_MEDIA = "media/Scenes/prlx/i-14-prlx-b2.png"; // Путь к картинке или видео
const DURATION = 4.0;                       // Длительность сцены в секундах
const MOVEMENT = "slash_anime_flyby";                // Эффект движения
const APPEARANCE = "hard_cut";             // Эффект появления (или "none")
const COLOR_GRADE = "none";                 // Цветокоррекция (например, "neon_noir" или "none")
const GLOBAL_FILTER = "none";  // Глобальный фильтр (или "none")

try {
    const libraryPath = path.join(process.cwd(), 'library-config.json');
    if (!fs.existsSync(libraryPath)) throw new Error("library-config.json не найден!");
    
    const library = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));

    // Собираем CSS анимации из библиотеки
    let cssLibrary = "";
    if (library.effectsPool?.movements) {
        for (const [name, keyframes] of Object.entries(library.effectsPool.movements)) {
            cssLibrary += `@keyframes ${name} { ${keyframes} }\n`;
        }
    }
    if (library.effectsPool?.appearances) {
        for (const [name, keyframes] of Object.entries(library.effectsPool.appearances)) {
            cssLibrary += `@keyframes ${name} { ${keyframes} }\n`;
        }
    }

    // Достаем фильтры
    const colorGradeCss = library.effectsPool?.colorGrading?.[COLOR_GRADE] || "display: none;";
    let filterCss = "display: none;";
    if (GLOBAL_FILTER !== "none") {
        filterCss = library.effectsPool?.globalFilters?.[GLOBAL_FILTER] || GLOBAL_FILTER;
    }

    // Собираем строку анимации
    const animMove = MOVEMENT !== "none" ? `${MOVEMENT} ${DURATION}s linear forwards` : "";
    const animApp = APPEARANCE !== "none" ? `${APPEARANCE} ${DURATION}s linear forwards` : "";
    const animCss = [animMove, animApp].filter(Boolean).join(", ");
    
    const isVideo = TEST_MEDIA.toLowerCase().endsWith('.mp4');
    let mediaTag = "";

    if (isVideo) {
        // Если видео, добавляем подгонку playbackRate как в основном рендере
        mediaTag = `<video id="test-media" src="${TEST_MEDIA}" class="media-layer" style="animation: ${animCss}" data-duration="${DURATION}" autoplay muted playsinline loop></video>`;
    } else {
        mediaTag = `<div id="test-media" class="media-layer" style="background-image: url('${TEST_MEDIA}'); animation: ${animCss}"></div>`;
    }

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>ПРЕВЬЮ: ${TEST_MEDIA}</title>
    <style>
        body { margin: 0; background: #333; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; font-family: sans-serif; color: white; }
        #canvas { position: relative; width: 1280px; height: 720px; background: #000; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .media-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; background-size: cover; background-position: center; transform-origin: center center; --base-opacity: 1; }
        .composition-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
        
        /* Библиотека анимаций */
        ${cssLibrary}
        
        /* UI */
        #controls { position: absolute; top: 20px; left: 20px; z-index: 10000; background: rgba(0,0,0,0.8); padding: 15px; border-radius: 8px; border: 1px solid #555; }
        button { background: #4CAF50; color: white; border: none; padding: 10px 20px; cursor: pointer; border-radius: 4px; font-weight: bold; }
        button:hover { background: #45a049; }
    </style>
</head>
<body>
    <div id="controls">
        <p><b>Файл:</b> ${TEST_MEDIA}</p>
        <p><b>Движение:</b> ${MOVEMENT} | <b>Появление:</b> ${APPEARANCE}</p>
        <p><b>Цвет:</b> ${COLOR_GRADE} | <b>Фильтр:</b> ${GLOBAL_FILTER}</p>
        <button onclick="replay()">🔄 Перезапустить анимацию</button>
    </div>

    <div id="canvas">
        ${mediaTag}
        <!-- Слой цветокоррекции -->
        <div class="composition-layer" style="${colorGradeCss}"></div>
        <!-- Слой глобального фильтра (инверсия и т.д.) -->
        <div class="composition-layer" style="${filterCss}"></div>
    </div>

    <script>
        function replay() {
            const media = document.getElementById('test-media');
            // Магия CSS: убираем анимацию, принудительно обновляем DOM и вешаем обратно
            const currentAnim = media.style.animation;
            media.style.animation = 'none';
            media.offsetHeight; /* trigger reflow */
            media.style.animation = currentAnim;
            if(media.tagName === 'VIDEO') media.currentTime = 0;
        }

        // Подгонка скорости для видео (как в основном скрипте)
        const video = document.querySelector('video');
        if (video) {
            const applyRate = () => {
                const targetDur = parseFloat(video.getAttribute('data-duration'));
                if (video.duration && targetDur && video.duration < targetDur) {
                    video.playbackRate = video.duration / targetDur;
                }
            };
            video.addEventListener('loadedmetadata', applyRate);
            if (video.readyState >= 1) applyRate();
        }
    </script>
</body>
</html>`;

    fs.writeFileSync('preview.html', html, 'utf8');
    console.log(`✅ preview.html сгенерирован! Открой его в браузере.`);
} catch (e) {
    console.error("❌ Ошибка:", e.message);
}
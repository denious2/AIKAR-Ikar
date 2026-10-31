import fs from 'fs';
import path from 'path';
import { loadConfigs, createLogger } from '../config_loader.js';

const rootDir = process.cwd();
const log = createLogger(rootDir);

try {
    log("=== СТАРТ СБОРКИ АУДИО-РЕАКТОРОВ (NODE COMPILER) ===");
    
    const { config, director } = loadConfigs(rootDir);
    const compDir = path.join(rootDir, 'compositions');

    const FPS = 30; // Стандарт для CSS-анимаций в движке
    const duration = config.project.totalDuration;
    const totalFrames = Math.ceil(duration * FPS);

    // Функция загрузки огибающих
    function loadSignal(filename) {
        const filePath = path.join(rootDir, filename);
        if (!fs.existsSync(filePath)) return null;
        try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
        catch (e) { return null; }
    }

    const bassData = loadSignal('bass.json');
    const melodyData = loadSignal('melody.json');
    const vocalData = loadSignal('vocal.json');
    const beatsData = loadSignal('beats.json');

    // Массивы кадров для каждого источника (по умолчанию 0)
    const frames = {
        bass: new Array(totalFrames).fill(0),
        melody: new Array(totalFrames).fill(0),
        vocal: new Array(totalFrames).fill(0),
        beat: new Array(totalFrames).fill(0)
    };

    // Заполнение массивов из файлов (Огибающие)
    if (bassData && bassData.frames) {
        for(let i = 0; i < totalFrames; i++) frames.bass[i] = bassData.frames[i] || 0;
        log(`🔊 Сигнал подключен: [audio.bass]`);
    }
    if (melodyData && melodyData.frames) {
        for(let i = 0; i < totalFrames; i++) frames.melody[i] = melodyData.frames[i] || 0;
        log(`🎹 Сигнал подключен: [audio.melody]`);
    }
    if (vocalData && vocalData.frames) {
        for(let i = 0; i < totalFrames; i++) frames.vocal[i] = vocalData.frames[i] || 0;
        log(`🎤 Сигнал подключен: [audio.vocal]`);
    }

    // Обработка битов (Генерация импульсов с математическим затуханием Decay)
    if (beatsData && beatsData.beats) {
        const decayFactor = 0.82; // Множитель затухания (0.82 = плавный хвост удара)
        
        // 1. Ставим пики на нужные кадры
        beatsData.beats.forEach(time => {
            const frameIdx = Math.floor(time * FPS);
            if(frameIdx < totalFrames) frames.beat[frameIdx] = 1.0;
        });
        
        // 2. Рассчитываем хвосты (Release)
        for (let i = 1; i < totalFrames; i++) {
            frames.beat[i] = Math.max(frames.beat[i], frames.beat[i - 1] * decayFactor);
            // Срезаем микро-значения, чтобы не грузить браузер
            if (frames.beat[i] < 0.02) frames.beat[i] = 0; 
        }
        log(`🥁 Сигнал подключен: [audio.beat] (Сглажен через Decay)`);
    }

    // Генерация глобального CSS @keyframes
    let css = `/* === ДИНАМИЧЕСКИЕ СИГНАЛЫ (AUDIO ENVELOPES) === */\n`;
    css += `@keyframes global-audio-reactors {\n`;
    for(let i = 0; i < totalFrames; i++) {
        const percent = (i / (totalFrames - 1) * 100).toFixed(3);
        const b = frames.bass[i].toFixed(3);
        const m = frames.melody[i].toFixed(3);
        const v = frames.vocal[i].toFixed(3);
        const bt = frames.beat[i].toFixed(3);
        
        css += `  ${percent}% { --bass: ${b}; --melody: ${m}; --vocal: ${v}; --beat: ${bt}; }\n`;
    }
    css += `}\n\n`;
    css += `:root { animation: global-audio-reactors ${duration}s linear forwards; }\n\n`;

    // Генерация правил из director-config.json (Targets)
    if (director.audioReactors && director.audioReactors.enabled && director.audioReactors.nodes) {
        css += `/* === РЕЖИССЕРСКИЕ УЗЛЫ (AUDIO REACTORS NODES) === */\n`;
        director.audioReactors.nodes.forEach(node => {
            css += `${node.target} {\n`;
            if (node.cssProperty && node.formula) {
                css += `    ${node.cssProperty}: ${node.formula};\n`;
            }
            if (node.transition) {
                css += `    transition: ${node.transition};\n`;
            }
            css += `}\n`;
        });
        log(`🎛️ Скомпилировано нод (Audio Reactors): ${director.audioReactors.nodes.length}`);
    }

    if (!fs.existsSync(compDir)) fs.mkdirSync(compDir, { recursive: true });
    fs.writeFileSync(path.join(compDir, 'reactors.css'), css, 'utf8');

    log(`✅ УСПЕХ! Матрица реакторов собрана: compositions/reactors.css`);
} catch (e) {
    log(`❌ Ошибка в reactors.js: ${e.message}`);
    process.exit(1);
}
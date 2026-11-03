import fs from 'fs';
import path from 'path';
import { loadConfigs, createLogger } from '../config_loader.js';

const rootDir = process.cwd();
const log = createLogger(rootDir);

try {
    log("=== СТАРТ СБОРКИ АУДИО-РЕАКТОРОВ (NODE COMPILER) ===");
    
    const { config, director, library } = loadConfigs(rootDir);
    const compDir = path.join(rootDir, 'compositions');

    const FPS = 30; 
    const duration = config.project.totalDuration;
    const totalFrames = Math.ceil(duration * FPS);

    function loadSignal(filename, defaultKey) {
        const filePath = path.join(rootDir, filename);
        if (!fs.existsSync(filePath)) return null;
        try { 
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (Array.isArray(data)) return data;
            if (data[defaultKey] && Array.isArray(data[defaultKey])) return data[defaultKey];
            if (data.frames && Array.isArray(data.frames)) return data.frames;
            for (let key in data) if (Array.isArray(data[key])) return data[key];
            return null;
        }
        catch (e) { return null; }
    }

    // Определяем источники из режиссерского конфига
    const beatSrc = director.beatsConfig?.sourceFile || 'beats.json';
    const bassSrc = director.bass?.sourceFile || 'bass.json';
    const melodySrc = director.melody?.sourceFile || 'melody.json';
    const vocalSrc = director.vocal?.sourceFile || 'vocal.json';

    const beatsData = loadSignal(beatSrc, 'beats');
    const bassData = loadSignal(bassSrc, 'bass');
    const melodyData = loadSignal(melodySrc, 'melody');
    const vocalData = loadSignal(vocalSrc, 'vocal');

    // Читаем ЗАТУХАНИЕ (Decay) из режиссерского конфига (с фолбеком, если не указано)
    const beatDecay = director.beatsConfig?.decay !== undefined ? director.beatsConfig.decay : 0.82;
    const bassDecay = director.bass?.decay !== undefined ? director.bass.decay : 0.90;
    const melodyDecay = director.melody?.decay !== undefined ? director.melody.decay : 0.90;
    const vocalDecay = director.vocal?.decay !== undefined ? director.vocal.decay : 0.90;

    const frames = {
        bass: new Array(totalFrames).fill(0),
        melody: new Array(totalFrames).fill(0),
        vocal: new Array(totalFrames).fill(0),
        beat: new Array(totalFrames).fill(0)
    };

    const fillFrames = (data, targetArray, decayFactor) => {
        if (!data) return;
        if (data.length > 0 && typeof data[0] === 'number' && data[data.length-1] > 1.0) {
            data.forEach(time => {
                const frameIdx = Math.floor(time * FPS);
                if(frameIdx < totalFrames) targetArray[frameIdx] = 1.0;
            });
            for (let i = 1; i < totalFrames; i++) {
                targetArray[i] = Math.max(targetArray[i], targetArray[i - 1] * decayFactor);
                if (targetArray[i] < 0.02) targetArray[i] = 0; 
            }
        } 
        else {
            for(let i = 0; i < totalFrames; i++) targetArray[i] = data[i] || 0;
        }
    };

    // Применяем Data-Driven затухание
    if (bassData) { fillFrames(bassData, frames.bass, bassDecay); log(`🔊 Сигнал подключен: [audio.bass] (Decay: ${bassDecay})`); }
    if (melodyData) { fillFrames(melodyData, frames.melody, melodyDecay); log(`🎹 Сигнал подключен: [audio.melody] (Decay: ${melodyDecay})`); }
    if (vocalData) { fillFrames(vocalData, frames.vocal, vocalDecay); log(`🎤 Сигнал подключен: [audio.vocal] (Decay: ${vocalDecay})`); }
    if (beatsData) { fillFrames(beatsData, frames.beat, beatDecay); log(`🥁 Сигнал подключен: [audio.beat] (Decay: ${beatDecay})`); }

    // 1. Генерация глобального CSS @keyframes для аудио-сигналов
    let css = `/* === ДИНАМИЧЕСКИЕ СИГНАЛЫ (AUDIO ENVELOPES) === */\n`;
    css += `@property --bass { syntax: '<number>'; inherits: true; initial-value: 0; }\n`;
    css += `@property --melody { syntax: '<number>'; inherits: true; initial-value: 0; }\n`;
    css += `@property --vocal { syntax: '<number>'; inherits: true; initial-value: 0; }\n`;
    css += `@property --beat { syntax: '<number>'; inherits: true; initial-value: 0; }\n\n`;

    css += `@keyframes global-audio-reactors {\n`;
    for(let i = 0; i < totalFrames; i++) {
        const percent = (i / (totalFrames - 1) * 100).toFixed(3);
        const b = frames.bass[i].toFixed(3);
        const m = frames.melody[i].toFixed(3);
        const v = frames.vocal[i].toFixed(3);
        const bt = frames.beat[i].toFixed(3);
        
        if (b > 0 || m > 0 || v > 0 || bt > 0 || i === 0 || i === totalFrames - 1) {
             css += `  ${percent}% { --bass: ${b}; --melody: ${m}; --vocal: ${v}; --beat: ${bt}; }\n`;
        }
    }
    css += `}\n\n`;
    css += `:root { animation: global-audio-reactors ${duration}s linear forwards; }\n\n`;

    // 2. Генерация правил из director-config.json (Ноды + Огибающие)
    if (director.audioReactors && director.audioReactors.enabled && director.audioReactors.nodes) {
        css += `/* === РЕЖИССЕРСКИЕ УЗЛЫ (AUDIO REACTORS NODES) === */\n`;
        
        const compiledMap = {}; 
        
        director.audioReactors.nodes.forEach((node, index) => {
            if (!node.target || !node.cssProperty) return;
            
            if (!compiledMap[node.target]) {
                compiledMap[node.target] = { formulas: [], transitions: [], animations: [] };
            }

            let finalFormula = "";
            if (node.formulaParts && Array.isArray(node.formulaParts)) {
                finalFormula = node.formulaParts.map(part => part.code).join(' ');
            } else if (node.formula) {
                finalFormula = node.formula;
            }

            // ОБРАБОТКА ОГИБАЮЩИХ (ENVELOPES)
            if (node.envelope) {
                const envVar = `--env_${index}`; 
                finalFormula = finalFormula.replace(/--env/g, envVar); 

                let envData = typeof node.envelope === 'string' ? library?.effectsPool?.envelopes?.[node.envelope] : node.envelope;
                if (envData && envData.points) {
                    const kfName = `env_anim_${index}`;
                    css += `@property ${envVar} { syntax: '<number>'; inherits: true; initial-value: 1; }\n`;
                    css += `@keyframes ${kfName} {\n`;
                    envData.points.forEach(pt => {
                        css += `  ${(pt.x * 100).toFixed(2)}% { ${envVar}: ${pt.y}; }\n`;
                    });
                    css += `}\n\n`;
                    compiledMap[node.target].animations.push(`${kfName} ${duration}s linear forwards`);
                }
            }

            if (finalFormula) {
                compiledMap[node.target].formulas.push({ prop: node.cssProperty, val: finalFormula });
            }
            if (node.transition) {
                compiledMap[node.target].transitions.push(node.transition);
            }
        });

        // Склейка свойств
        for (const target in compiledMap) {
            css += `${target} {\n`;
            const targetData = compiledMap[target];
            
            const propsMap = {};
            targetData.formulas.forEach(f => {
                if (!propsMap[f.prop]) propsMap[f.prop] = [];
                propsMap[f.prop].push(f.val);
            });
            
            for (const prop in propsMap) {
                css += `    ${prop}: ${propsMap[prop].join(' ')};\n`;
            }

            if (targetData.transitions.length > 0) {
                 css += `    transition: ${[...new Set(targetData.transitions)].join(', ')};\n`;
            }
            if (targetData.animations.length > 0) {
                 css += `    animation: ${[...new Set(targetData.animations)].join(', ')};\n`;
            }
            css += `}\n\n`;
        }
        log(`🎛️ Скомпилировано нод (Audio Reactors): ${director.audioReactors.nodes.length}`);
    }

    if (!fs.existsSync(compDir)) fs.mkdirSync(compDir, { recursive: true });
    fs.writeFileSync(path.join(compDir, 'reactors.css'), css, 'utf8');

    log(`✅ УСПЕХ! Матрица реакторов собрана: compositions/reactors.css`);
} catch (e) {
    log(`❌ Ошибка в reactors.js: ${e.message}`);
    process.exit(1);
}
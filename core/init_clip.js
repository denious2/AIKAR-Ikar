/**
 * Файл: core/init_clip.js
 * Версия: 2.1.0 (Deep Clean)
 * Описание: Инициализация чистой структуры для нового клипа. Удаляет старые кэши, манифесты и рендеры.
 */

import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();

console.log("=== ИНИЦИАЛИЗАЦИЯ НОВОГО КЛИПА (IKAR ENGINE) ===");

// 1. Папки, которые нужно очистить от старых результатов работы
const dirsToClean = [
    'compositions',
    'downloads'
];

dirsToClean.forEach(dirName => {
    const dirPath = path.join(rootDir, dirName);
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
        console.log(`🗑️ Очищена папка: ${dirName}/`);
    }
    fs.mkdirSync(dirPath, { recursive: true });
});

// 2. Файлы кэша анализа звука и рендера прошлого клипа, которые нужно удалить из корня
const filesToDelete = [
    'bass.json',
    'melody.json',
    'vocal.json',
    'drums.json',
    'beats.json',
    'accents.json',
    'media_manifest.json',
    'index.html'
];

filesToDelete.forEach(fileName => {
    const filePath = path.join(rootDir, fileName);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Удален старый кэш/манифест: ${fileName}`);
    }
});

// 2.5 Очистка старых .mp4 файлов в корне (чтобы не путать с новыми рендерами)
const rootFiles = fs.readdirSync(rootDir);
rootFiles.forEach(file => {
    if (file.endsWith('.mp4') && !file.startsWith('template')) {
        const filePath = path.join(rootDir, file);
        fs.unlinkSync(filePath);
        console.log(`🧹 Удалено старое видео: ${file}`);
    }
});

// 3. Проверяем наличие базовых папок медиа
const requiredDirs = [
    'media',
    'media/Scenes',
    'media/sfx'
];

requiredDirs.forEach(dirName => {
    const dirPath = path.join(rootDir, dirName);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`📁 Создана недостающая папка: ${dirName}/`);
    }
});

console.log("\n✅ ПРОЕКТ ГОТОВ К НОВОМУ КЛИПУ!");
console.log("👉 Шаг 1: Закинь новый аудиофайл и картинки/видео в папки media/");
console.log("👉 Шаг 2: Запусти 'npm run scan-media' (создание манифеста)");
console.log("👉 Шаг 3: Запусти нужные экстракторы (npm run bass, npm run accents и т.д.)");
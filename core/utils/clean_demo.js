import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();

const PROTECTED_FILES = ['.gitkeep', '.gitignore', 'README.md'];

function clearDirectory(dirPath, isScenesFolder = false) {
    if (!fs.existsSync(dirPath)) return;
    
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    entries.forEach(entry => {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
            // Если это папка sfx — защищаем её целиком и пропускаем очистку!
            if (entry.name === 'sfx') {
                console.log(`🛡️ Пропущена системная папка эффектов: ${path.relative(rootDir, fullPath)}`);
                return;
            }
            // Рекурсивно чистим остальные подпапки (например, Scenes, prlx)
            clearDirectory(fullPath, isScenesFolder || entry.name === 'Scenes');
        } else {
            if (!PROTECTED_FILES.includes(entry.name)) {
                fs.unlinkSync(fullPath);
                console.log(`🗑️ Удален демо-файл: ${path.relative(rootDir, fullPath)}`);
            }
        }
    });
}

try {
    console.log("=== СТАРТ БЕЗОПАСНОЙ ОЧИСТКИ ДЕМО-КОНТЕНТА (ZERO-MEDIA) ===");

    const mediaDir = path.join(rootDir, 'media');
    if (fs.existsSync(mediaDir)) {
        console.log("📂 Очистка папки media (Scenes и prlx очищаются, sfx защищена)...");
        clearDirectory(mediaDir);
    }

    // Удаляем сгенерированные стемы из корня
    const stemFiles = ['beats.json', 'bass.json', 'melody.json', 'vocal.json', 'accents.json', 'drums.json'];
    stemFiles.forEach(file => {
        const filePath = path.join(rootDir, file);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ Удален стем: ${file}`);
        }
    });

    const compDir = path.join(rootDir, 'compositions');
    if (fs.existsSync(compDir)) {
        console.log("🧹 Очистка папки compositions...");
        clearDirectory(compDir);
    }

    console.log("\n✅ УСПЕХ! Проект очищен, системные эффекты (sfx) и структура папок сохранены.");
} catch (e) {
    console.error("❌ Ошибка при очистке проекта:", e.message);
    process.exit(1);
}
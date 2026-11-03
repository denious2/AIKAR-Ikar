import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();

try {
    console.log("=== СТАРТ ВОССТАНОВЛЕНИЯ ДЕМО-КОНТЕНТА (RESTORE SOURCE) ===");

    // Проверяем, существует ли целевая ветка-источник (например, shrt-ikar)
    // Ты можешь легко поменять имя ветки на любую другую при необходимости
    const sourceBranch = "shrt-ikar";

    console.log(`📦 Забираем медиафайлы и стемы из ветки '${sourceBranch}'...`);

    // 1. Восстанавливаем папку media (включая Scenes и prlx)
    execSync(`git checkout ${sourceBranch} -- media/`, { stdio: 'inherit', cwd: rootDir });

    // 2. Восстанавливаем json-стемы из корня
    const stemFiles = ['beats.json', 'bass.json', 'melody.json', 'vocal.json', 'accents.json', 'drums.json'];
    stemFiles.forEach(file => {
        try {
            execSync(`git checkout ${sourceBranch} -- ${file}`, { stdio: 'pipe', cwd: rootDir });
            console.log(`📥 Восстановлен стем: ${file}`);
        } catch (e) {
            // Файл мог отсутствовать в той ветке — просто игнорируем
        }
    });

    console.log("\n✅ УСПЕХ! Демо-материалы успешно возвращены на места. Можно запускать сборку (npm run start).");
} catch (e) {
    console.error("❌ Ошибка при восстановлении контента:", e.message);
    console.error("💡 Убедись, что ветка-источник существует в твоем локальном git-репозитории.");
    process.exit(1);
}
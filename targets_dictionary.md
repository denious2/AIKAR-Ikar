# 🎯 N-Sonic Ikar Engine — Targets Dictionary
**Для ИИ-агентов:** Это справочник всех доступных слоев (targets), источников сигналов (sources), CSS-переменных и названий эффектов в движке Ikar. Используй эти точные названия при проектировании нодовых связей `audioReactors` или редактировании конфигураций (`config.json` и `director-config.json`).

## 📡 1. Источники Сигналов (Node Sources)
Эти глобальные CSS-переменные генерируются компилятором `reactors.js` и готовы к использованию в формулах нод (поле `"source"`).

### Мультитрек (Аудио)
*   `var(--bass)` (Float 0..1): Низкие частоты (бочка + бас). Для тяжелой пульсации и теней.
*   `var(--melody)` (Float 0..1): Синтезаторы, пэды, гитара (500-6000Hz). Для плавного дыхания и свечения.
*   `var(--vocal)` (Float 0..1): Вокал (300-3000Hz с мягким корнем). Для выделения главного героя/текста во время пения.
*   `var(--beat)` (Impulse 1->0): Ударные пики из `beats.json` с математическим затуханием (Decay). Вспыхивает на каждом бите.
*   `audio.accents` (Impulse 1->0): Резкие транзиенты (сбивки, акценты соло) из `accents.json`. *(Используется генераторами таймлайна, а не нодами).*

### Субтитры и Структура (Timeline)
*   `subs.active` (Bool 0|1): Равен 1, если на экране в данный момент есть текст.
*   `subs.progress` (Float 0..1): Прогресс текущей строки субтитра.
*   `section.type` (String): Текущая секция (intro, verse, hook, chorus, outro).
*   `section.progress` (Float 0..1): Прогресс текущей секции от начала до конца.

## 📦 2. Контейнеры и Слои (DOM Targets)
Эти селекторы используются в поле `"target"` для управления стилями через ноды. При создании нод всегда используй поля `"name"` и `"description"` для документации эффекта.

### Глобальные контейнеры
*   `#host-visuals-bg` — Фоновые эффекты атмосферы (Слой 1, z-index: 10).
*   `#host-images` — Главный нарратив, параллакс и картинки (Слой 2, z-index: 20).
*   `#host-visuals-fg` — Передние эффекты атмосферы (Слой 3, z-index: 30).
*   `#host-dust` — Контейнер текстур (Слой 4, z-index: 90).
*   `.texture-wrapper` — Внутренняя гибридная обертка слоев атмосферы (Пыль, текстура, шум, лампа). Идеальная цель для масштабирования от бита (`scale`).
*   `#host-beats` — Ритмические вспышки экрана (Слой 45, z-index: 95). Управляется старым генератором таймлайна.
*   `#shadow-crush-overlay` — Слой уплотнения теней (z-index: 9950, mix-blend-mode: multiply).
*   `#host-subs` — Субтитры / Текст (Слой 5, z-index: 10000).
*   `#host-color-grade` — Слой глобальной цветокоррекции LUT (Слой 6, z-index: 9998).
*   `#host-accents` — Слой глобальных видео-акцентов и глитчей (Слой 46, z-index: 9999).

### Эшелоны глубины (Deep Parallax Targets)
Эти классы применяются к элементам параллакса внутри сцен, позволяя управлять глубиной 2.5D:
*   `.layer-bg` — Все задние планы (слои b1, b2, b3). Идеально для блюра (`filter: blur(...)`).
*   `.layer-hero` — Главный объект в фокусе (слой fg). Идеально для изменения яркости (`filter: brightness(...)`).
*   `.layer-fg` — Все элементы переднего плана (слои b-1, b-2). Идеально для зума и размытия в движении.

### Глобальные модификаторы классов
*   `.global-shake-active` — Класс, который динамически вешается скриптом `accents.js` на контейнеры для вызова хаотичной тряски камеры при сильных ударах.

## 🎛️ 3. Динамические CSS-переменные
*   `--base-opacity` (локальная в `.image-layer` / `.video-layer`) — Базовая прозрачность элемента параллакса/нарратива (от 0.0 до 1.0).

## 🚀 4. Библиотека движений (Movements)
Используются в `director-config.json` -> `allowedMovements` или `overrides -> movement`.
*   **Статика/База:** `none`, `slow_pan_left`, `slow_pan_right`, `subtle_zoom`, `float_around`
*   **Дрожание/Органика:** `stop_motion_jitter`, `micro_jitter`, `organic_drift`, `slow_zoom_jitter`, `textSway`
*   **Агрессивные/Ударные:** `aggressive_shake`, `fast_dolly_in`, `chaotic_micro_zoom`, `heavy_impact`, `logo_slam_end`, `chaotic_expanding_jitter`
*   **Кинематика:** `dutch_dolly`, `swing_center`, `swing_top`, `rotate_sweep_right`, `rotate_sweep_left`, `rotate_right`
*   **Спецэффекты (Глитч/Сюр):** `ribbon_flow`, `glitch_pan_left`, `glitch_pan_right`, `rapid_pulse`, `glitch_scroll_bg`, `glitch_scroll_mask`, `electric_glow_jitter`
*   **Глубокий параллакс:** `parallax_jitterfly_up`, `parallax_snapshake_up`, `parallax_glitch_up`
*   **Аниме/Слэш:** `slash_anime_flyby`, `slash_anime_flyby_glitch`, `downfall`, `downfall_with_spin`, `rise_jitter_up`

## ✨ 5. Библиотека появлений (Appearances / Entrances)
Используются в `director-config.json` -> `defaultAppearance` или `overrides -> appearance`.
*   **Базовые:** `hard_cut`, `soft_fade`, `fade_in_base`, `fade_in_out`, `fly_up_out`
*   **Глитчи и стилизация:** `glitch_snap`, `glitch_in_out`, `scribble_flash`
*   **Чернила и бумага:** `ink_reveal`, `ink_bleed_in`, `sketch_flash`, `sketch_boil`
*   **Экстремальные:** `burn_out`
*   **Текст:** `textFade`

## 🎨 6. Атмосфера, Фильтры и Цветокоррекция (LUTs)
Настройки для `config.json` (`config.effects`) и правил секций в `director-config.json`.

*   **Настройки атмосферы (dust.js):**
    *   `noiseStyle`: `soft_white`, `heavy_grain`, `none` (Стиль пленочного шума).
    *   `lightingStyle`: `static_lamp`, `swingingLamp`, `none` (Стиль наложенного освещения).
*   **Global Filters (Стилизация секций):** `invert`, `invert_crisp`, `invert_deep_black`, `invert_neon_blue`, `cinema_dark`, `dreamy_night`, `heavy_vignette`, `deep_shadow_tint`, `red_alert`, `vintage_fade`.
*   **Global Filters (Color Burn серии):** `color_burn_power`, `color_burn_effect2`, `color_burn_middle`, `color_burn_low`, `blend_color_burn`.
*   **Color Grading (Глобальные LUTs):** `vintage_yellow`, `sepia_burn`, `cold_noir`, `neon_noir`, `midnight_blue`, `dark_purple_lut`.
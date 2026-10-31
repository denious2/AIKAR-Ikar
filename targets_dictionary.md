# 🎯 N-Sonic Ikar Engine — Targets Dictionary
**Для ИИ-агентов:** Это справочник всех доступных слоев (targets), CSS-переменных и названий эффектов в движке Ikar. Используй эти точные названия при генерации `audioReactors` или редактировании конфигураций.

## 📦 1. Контейнеры и Слои (DOM Targets)
Эти ID можно использовать в качестве `target` для аудио-реактивности (изменение стилей в реальном времени).
*   `#host-visuals-bg` — Фоновые эффекты атмосферы (Слой 1, z-index: 10)
*   `#host-images` — Главный нарратив, параллакс и картинки (Слой 2, z-index: 20)
*   `#host-visuals-fg` — Передние эффекты атмосферы (Слой 3, z-index: 30)
*   `#host-dust` — Пыль, зерно, текстуры (Слой 4, z-index: 90)
*   `#host-beats` — Ритмические вспышки (Слой 45, z-index: 95)
*   `#shadow-crush-overlay` — Слой уплотнения теней (z-index: 9950, mix-blend-mode: multiply)
*   `#host-subs` — Субтитры / Текст (Слой 5, z-index: 10000)
*   `#host-color-grade` — Слой глобальной цветокоррекции LUT (Слой 6, z-index: 9998)
*   `#host-accents` — Слой глобальных видео-акцентов и глитчей (Слой 46, z-index: 9999)

## 🎛️ 2. Динамические CSS-переменные
Эти переменные проброшены в `:root` или слои. Их можно анимировать через JS или `audioReactors`.
*   `--bass` (глобальная в `:root`) — Нормализованное значение громкости баса (0.0 ... 1.0). Сейчас управляет `opacity` в `#shadow-crush-overlay` и `transform: scale` в `#host-subs`.
*   `--base-opacity` (локальная в `.image-layer` / `.video-layer`) — Базовая прозрачность элемента параллакса/нарратива (от 0.0 до 1.0).

## 🚀 3. Библиотека движений (Movements)
Используются в `director-config.json` -> `allowedMovements` или `overrides -> movement`.
*   **Статика/База:** `none`, `slow_pan_left`, `slow_pan_right`, `subtle_zoom`, `float_around`
*   **Дрожание/Органика:** `stop_motion_jitter`, `micro_jitter`, `organic_drift`, `slow_zoom_jitter`, `textSway`
*   **Агрессивные/Ударные:** `aggressive_shake`, `fast_dolly_in`, `chaotic_micro_zoom`, `heavy_impact`, `logo_slam_end`, `chaotic_expanding_jitter`
*   **Кинематика:** `dutch_dolly`, `swing_center`, `swing_top`, `rotate_sweep_right`, `rotate_sweep_left`, `rotate_right`
*   **Спецэффекты (Глитч/Сюр):** `ribbon_flow`, `glitch_pan_left`, `glitch_pan_right`, `rapid_pulse`, `glitch_scroll_bg`, `glitch_scroll_mask`, `electric_glow_jitter`
*   **Глубокий параллакс:** `parallax_jitterfly_up`, `parallax_snapshake_up`, `parallax_glitch_up`
*   **Аниме/Слэш:** `slash_anime_flyby`, `slash_anime_flyby_glitch`, `downfall`, `downfall_with_spin`, `rise_jitter_up`

## ✨ 4. Библиотека появлений (Appearances / Entrances)
Используются в `director-config.json` -> `defaultAppearance` или `overrides -> appearance`.
*   **Базовые:** `hard_cut` (моментально), `soft_fade` (мягко из блюра), `fade_in_base`, `fade_in_out`, `fly_up_out`
*   **Глитчи и стилизация:** `glitch_snap`, `glitch_in_out`, `scribble_flash`
*   **Чернила и бумага:** `ink_reveal`, `ink_bleed_in`, `sketch_flash`, `sketch_boil`
*   **Экстремальные:** `burn_out`
*   **Текст:** `textFade`

## 🎨 5. Фильтры и Цветокоррекция (LUTs)
Используются в настройках проекта (`config.effects.colorGrade`) или секциях трека (`globalFilter`).
*   **Global Filters (Стилизация):** `invert`, `invert_crisp`, `invert_deep_black`, `invert_neon_blue`, `cinema_dark`, `dreamy_night`, `heavy_vignette`, `deep_shadow_tint`, `red_alert`, `vintage_fade`
*   **Global Filters (Color Burn серии):** `color_burn_power`, `color_burn_effect2`, `color_burn_middle`, `color_burn_low`, `blend_color_burn`
*   **Color Grading (LUTs):** `vintage_yellow`, `sepia_burn`, `cold_noir`, `neon_noir`, `midnight_blue`, `dark_purple_lut`
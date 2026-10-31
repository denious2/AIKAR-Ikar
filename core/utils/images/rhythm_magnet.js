// Расчет длительности кадра на основе битов, субтитров и настроек
export function calculateMagnetDuration(params) {
    const {
        absStart,
        currentBlockEnd,
        MAX_IMG_DURATION,
        MIN_IMG_DURATION,
        subtitleStarts,
        beats,
        fileObj,
        fileOverride
    } = params;

    let maxAllowed = Math.min(MAX_IMG_DURATION, currentBlockEnd - absStart);
    let minAllowed = Math.min(MIN_IMG_DURATION, maxAllowed);
    let rhythmDuration = maxAllowed;

    const windowStart = absStart + minAllowed;
    const windowEnd = absStart + maxAllowed;

    // 1. Ищем ближайший субтитр в окне [minAllowed ... maxAllowed]
    const subsInWindow = subtitleStarts.filter(t => t >= windowStart && t <= windowEnd);
    if (subsInWindow.length > 0) {
        rhythmDuration = Math.max(...subsInWindow) - absStart;
    } else {
        // 2. Если субтитров нет, ищем ближайший бит барабанов
        const beatsInWindow = beats.filter(b => b >= windowStart && b <= windowEnd);
        if (beatsInWindow.length > 0) {
            rhythmDuration = Math.max(...beatsInWindow) - absStart;
        }
    }

    let currentImgDuration = rhythmDuration;

    // 3. Если это видео и оно короче расчетного времени - обрезаем по реальной длине
    if (fileObj.realDuration && fileObj.realDuration < currentImgDuration) {
        currentImgDuration = fileObj.realDuration;
    }

    // 4. МАГНИТ К СТЕНЕ: Если до конца секции остался "огрызок" (меньше минимума), 
    // растягиваем текущий кадр ровно до конца секции, чтобы не плодить микро-кадры.
    const timeToSectionEnd = currentBlockEnd - absStart;
    if (timeToSectionEnd - currentImgDuration > 0 && timeToSectionEnd - currentImgDuration < MIN_IMG_DURATION) {
         currentImgDuration = timeToSectionEnd;
    }

    // 5. Жесткие переопределения из конфига (Overrides) имеют высший приоритет
    if (fileOverride) {
        if (fileOverride.duration) {
            currentImgDuration = fileOverride.duration;
        } else if (fileOverride.playToEnd) {
            currentImgDuration = Math.max(currentImgDuration, currentBlockEnd - absStart);
        }
    }

    return currentImgDuration;
}
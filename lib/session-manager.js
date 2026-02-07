const { setTimeout } = require('timers/promises');
console.log('✅ Loaded lib/session-manager.js');

/**
 * Zarządza interwałami między sesjami z losowością
 */
class SessionManager {
    constructor(config) {
        this.config = config;
        this.lastSessionTime = null;
        this.dailySchedule = {
            date: null,
            start: null,
            end: null
        };
    }

    /**
     * Parsuje czas w formacie "HH:MM"
     */
    parseTime(timeStr) {
        if (!timeStr) return null;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return { hours, minutes };
    }

    /**
     * Konwertuje czas "HH:MM" na minuty od początku dnia
     */
    timeToMinutes(timeStr) {
        const { hours, minutes } = this.parseTime(timeStr);
        return hours * 60 + minutes;
    }

    /**
     * Generuje losowy czas w zadanym przedziale
     * @param {string} minTime "HH:MM"
     * @param {string} maxTime "HH:MM"
     * @returns {string} Losowy czas "HH:MM"
     */
    generateRandomTime(minTime, maxTime) {
        const minMinutes = this.timeToMinutes(minTime);
        const maxMinutes = this.timeToMinutes(maxTime);

        const randomMinutes = Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;

        const hours = Math.floor(randomMinutes / 60);
        const minutes = randomMinutes % 60;

        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    /**
     * Pobiera (lub generuje) harmonogram na dzisiaj
     */
    getDailySchedule() {
        const today = new Date().toDateString();

        // Jeśli mamy już harmonogram na dziś, zwróć go
        if (this.dailySchedule.date === today) {
            return this.dailySchedule;
        }

        // Generuj nowy harmonogram
        const activeHours = this.config.safety.activeHours;
        let startTime, endTime;

        if (activeHours.strategy === 'randomized') {
            startTime = this.generateRandomTime(activeHours.startRange.min, activeHours.startRange.max);
            endTime = this.generateRandomTime(activeHours.endRange.min, activeHours.endRange.max);
        } else {
            // Fallback dla starej konfiguracji
            startTime = `${String(activeHours.start).padStart(2, '0')}:00`;
            endTime = `${String(activeHours.end).padStart(2, '0')}:00`;
        }

        this.dailySchedule = {
            date: today,
            start: startTime,
            end: endTime
        };

        console.log(`📅 Nowy harmonogram na dzisiaj (${today}):`);
        console.log(`   ⏰ Start pracy: ${startTime}`);
        console.log(`   🏁 Koniec pracy: ${endTime}`);

        return this.dailySchedule;
    }

    /**
     * Oblicza losowy interwał między sesjami z uwzględnieniem godzin szczytu
     * @returns {number} - czas w ms
     */
    getRandomInterval() {
        const intervalConfig = this.config.safety.intervalMinutes;
        let baseMin, baseMax;

        if (typeof intervalConfig === 'object' && intervalConfig.min && intervalConfig.max) {
            baseMin = intervalConfig.min;
            baseMax = intervalConfig.max;
        } else {
            baseMin = intervalConfig || 15;
            baseMax = intervalConfig || 15;
        }

        // Sprawdź czy jesteśmy w godzinach szczytu
        const activityMultiplier = this.getActivityMultiplier();

        // W godzinach szczytu - krótsze przerwy, poza szczytem - dłuższe
        const adjustedMin = Math.floor(baseMin / activityMultiplier);
        const adjustedMax = Math.floor(baseMax / activityMultiplier);

        const minMs = adjustedMin * 60 * 1000;
        const maxMs = adjustedMax * 60 * 1000;

        return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    }

    /**
     * Pobiera mnożnik aktywności na podstawie aktualnej godziny
     * @returns {number} - mnożnik aktywności
     */
    getActivityMultiplier() {
        const now = new Date();
        const currentHour = now.getHours();

        if (!this.config.safety.activeHours || !this.config.safety.activeHours.peakHours) {
            return 1.0; // Brak konfiguracji godzin szczytu
        }

        // Sprawdź godziny szczytu
        for (const peak of this.config.safety.activeHours.peakHours) {
            if (currentHour >= peak.start && currentHour < peak.end) {
                return peak.activityMultiplier;
            }
        }

        return 1.0; // Standardowa aktywność
    }

    /**
     * Sprawdza czy dzisiaj jest dzień roboczy
     * @returns {boolean}
     */
    isWorkingDay() {
        if (!this.config.safety.workingDays || !this.config.safety.workingDays.enabled) {
            return true; // Brak ograniczeń dni roboczych
        }

        const now = new Date();
        const dayName = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

        return this.config.safety.workingDays.days.includes(dayName);
    }

    /**
     * Pobiera mnożnik aktywności dla weekendu
     * @returns {number}
     */
    getWeekendMultiplier() {
        if (!this.isWorkingDay() && this.config.safety.workingDays) {
            // ETAP 7.2: weekendReduction: 0 oznacza bot OFF (nie fallback na 0.7)
            const reduction = this.config.safety.workingDays.weekendReduction;
            return reduction !== undefined ? reduction : 0.7;
        }
        return 1.0;
    }

    /**
     * Czeka losowy czas między sesjami
     * @param {string} reason - powód oczekiwania (log)
     */
    async waitForInterval(reason = 'between sessions') {
        const intervalMs = this.getRandomInterval();
        const weekendMultiplier = this.getWeekendMultiplier();
        const adjustedIntervalMs = Math.floor(intervalMs / weekendMultiplier);
        const minutes = Math.round(adjustedIntervalMs / (60 * 1000));

        console.log(`⏰ Oczekiwanie ${minutes} minut przed następną sesją (${reason})...`);
        if (weekendMultiplier < 1.0) {
            console.log(`   📅 Weekend - wydłużony czas oczekiwania (${weekendMultiplier}x)`);
        }

        const startTime = Date.now();
        const totalMs = adjustedIntervalMs;

        // Pokaż postęp co 30 sekund
        while (Date.now() - startTime < totalMs) {
            const elapsed = Date.now() - startTime;
            const remaining = Math.ceil((totalMs - elapsed) / (60 * 1000));

            if (remaining > 0 && elapsed % 30000 < 1000) { // co 30 sekund
                process.stdout.write(`\r⏰ Pozostało: ${remaining} minut...`);
            }

            await setTimeout(1000);
        }

        console.log('\n✅ Czas oczekiwania zakończony.');
        this.lastSessionTime = Date.now();
    }

    /**
     * Sprawdza czy jesteśmy w aktywnych godzinach
     * @returns {boolean}
     */
    isActiveHours() {
        const schedule = this.getDailySchedule();
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        const startMinutes = this.timeToMinutes(schedule.start);
        const endMinutes = this.timeToMinutes(schedule.end);

        return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }

    /**
     * Sprawdza czy powinno się działać w danym momencie
     * @returns {boolean}
     */
    shouldWork() {
        // Sprawdź dzień roboczy
        if (!this.isWorkingDay()) {
            console.log('📅 Dzień nie roboczy - bot odpoczywa');
            return false;
        }

        // Sprawdź aktywne godziny
        if (!this.isActiveHours()) {
            const schedule = this.getDailySchedule();
            console.log(`🌙 Poza aktywnymi godzinami (${schedule.start} - ${schedule.end}) - bot odpoczywa`);
            return false;
        }

        return true;
    }

    /**
     * Czeka do aktywnych godzin jeśli trzeba
     */
    async waitForActiveHours() {
        if (this.isActiveHours()) {
            return; // Jesteśmy w aktywnych godzinach
        }

        const schedule = this.getDailySchedule();
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const startMinutes = this.timeToMinutes(schedule.start);

        let msToWait;

        if (currentMinutes >= this.timeToMinutes(schedule.end)) {
            // Jest już po pracy dzisiaj, czekamy do jutra
            // Uwaga: To uproszczenie zakłada, że jutro też są te same zakresy losowania
            // Idealnie powinniśmy wylosować już godzinę na jutro, ale dla uproszczenia
            // poczekajmy do północy i wtedy 'getDailySchedule' wylosuje nowe godziny

            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);
            msToWait = tomorrow.getTime() - now.getTime();

            // Dodajemy mały bufor żeby przeskoczyć północ
            msToWait += 1000;

            console.log(`🌙 Koniec pracy na dziś (Koniec: ${schedule.end}). Czekam do jutra...`);
        } else {
            // Jest jeszcze przed pracą dzisiaj
            const targetTime = new Date(now);
            const { hours, minutes } = this.parseTime(schedule.start);
            targetTime.setHours(hours, minutes, 0, 0);

            msToWait = targetTime.getTime() - now.getTime();
            console.log(`🌙 Jeszcze nie czas na pracę. Start o: ${schedule.start}`);
        }

        if (msToWait > 0) {
            const hoursWait = Math.floor(msToWait / (1000 * 60 * 60));
            const minutesWait = Math.floor((msToWait % (1000 * 60 * 60)) / (1000 * 60));

            console.log(`⏰ Oczekiwanie ${hoursWait}h ${minutesWait}m na uruchomienie...`);
            await setTimeout(msToWait);
            console.log('☀️ Aktywne godziny rozpoczęte.');

            // Po obudzeniu wymuś odświeżenie harmonogramu (jeśli przeszliśmy na nowy dzień)
            this.getDailySchedule();
        }
    }
}

module.exports = SessionManager;

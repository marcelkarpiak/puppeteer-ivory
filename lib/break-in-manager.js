const fs = require('fs');
const path = require('path');
console.log('✅ Loaded lib/break-in-manager.js');

/**
 * Zarzadza stopniowym zwiekszaniem aktywnosci bota na nowej maszynie.
 * Pierwszy tydzien bot pracuje na zwolnionych obrotach.
 */
class BreakInManager {
    constructor(dataPath) {
        this.dataFile = path.join(dataPath, 'break-in-state.json');
        this.state = this.loadState();
    }

    loadState() {
        try {
            if (fs.existsSync(this.dataFile)) {
                return JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
            }
        } catch (e) {}
        // Pierwsze uruchomienie - zacznij break-in
        const state = {
            firstRunDate: new Date().toISOString(),
            totalSessionsCompleted: 0
        };
        this.saveState(state);
        return state;
    }

    saveState(state) {
        fs.writeFileSync(this.dataFile, JSON.stringify(state || this.state, null, 2));
    }

    getDaysSinceFirstRun() {
        const firstRun = new Date(this.state.firstRunDate);
        return Math.floor((Date.now() - firstRun) / (24 * 60 * 60 * 1000));
    }

    // Zwraca mnoznik aktywnosci (0.0 - 1.0)
    getActivityMultiplier() {
        const days = this.getDaysSinceFirstRun();
        if (days <= 1) return 0.2;   // Dzien 1-2: 20% aktywnosci (1-2 sesje, max 5 postow)
        if (days <= 3) return 0.4;   // Dzien 3-4: 40% (2-3 sesje, max 8 postow)
        if (days <= 6) return 0.7;   // Dzien 5-7: 70% (3-4 sesje, max 12 postow)
        return 1.0;                   // Tydzien 2+: pelna predkosc
    }

    getMaxPostsForDay() {
        const multiplier = this.getActivityMultiplier();
        const baseMax = 15;
        return Math.max(3, Math.floor(baseMax * multiplier));
    }

    getMaxSessionsForDay() {
        const multiplier = this.getActivityMultiplier();
        const baseMax = 6;
        return Math.max(1, Math.floor(baseMax * multiplier));
    }

    recordSessionCompleted() {
        this.state.totalSessionsCompleted++;
        this.saveState();
    }

    getStatus() {
        const days = this.getDaysSinceFirstRun();
        const mult = this.getActivityMultiplier();
        return {
            daysSinceFirstRun: days,
            activityMultiplier: mult,
            maxPosts: this.getMaxPostsForDay(),
            maxSessions: this.getMaxSessionsForDay(),
            phase: days <= 1 ? 'rozruch' : days <= 3 ? 'rozgrzewka' : days <= 6 ? 'przyspieszanie' : 'pelna-predkosc'
        };
    }
}

module.exports = BreakInManager;

// lib/browser-lock.js
// Zapewnia ze tylko jeden bot na raz uzywa wspolnego profilu Chrome.

const fs = require('fs');
const path = require('path');

class BrowserLock {
    constructor(lockDir) {
        this.lockFile = path.join(lockDir, 'browser.lock');
    }

    /**
     * Probuje zablokowac profil dla danego bota.
     * Zwraca true jesli udalo sie zablokowac, false jesli inny bot juz dziala.
     */
    acquire(botName) {
        // Sprawdz czy lock istnieje
        if (fs.existsSync(this.lockFile)) {
            try {
                const lockData = JSON.parse(fs.readFileSync(this.lockFile, 'utf8'));

                // Sprawdz czy proces ktory zalozyl lock nadal zyje
                try {
                    process.kill(lockData.pid, 0); // signal 0 = sprawdz czy zyje
                    // Proces zyje - nie mozna uruchomic drugiego bota
                    console.error(`⛔ Profil Chrome zablokowany przez: ${lockData.botName} (PID: ${lockData.pid}, start: ${lockData.startedAt})`);
                    console.error(`   Poczekaj az ${lockData.botName} zakonczy prace lub zatrzymaj go recznie.`);
                    return false;
                } catch (e) {
                    // Proces nie zyje - osierocony lock, usuwamy
                    console.log(`🔓 Usuwam osierocony lock (${lockData.botName} PID ${lockData.pid} juz nie dziala)`);
                    fs.unlinkSync(this.lockFile);
                }
            } catch (e) {
                // Uszkodzony plik lock - usuwamy
                console.log('🔓 Usuwam uszkodzony plik lock');
                fs.unlinkSync(this.lockFile);
            }
        }

        // Utworz nowy lock
        const lockData = {
            pid: process.pid,
            botName: botName,
            startedAt: new Date().toISOString()
        };
        fs.writeFileSync(this.lockFile, JSON.stringify(lockData, null, 2));
        console.log(`🔒 Profil Chrome zablokowany przez: ${botName} (PID: ${process.pid})`);

        // Automatyczne zwolnienie przy zamknieciu procesu
        const cleanup = () => {
            this.release(botName);
        };
        process.on('exit', cleanup);
        process.on('SIGINT', () => { cleanup(); process.exit(); });
        process.on('SIGTERM', () => { cleanup(); process.exit(); });
        process.on('uncaughtException', (err) => {
            console.error('Uncaught exception:', err);
            cleanup();
            process.exit(1);
        });

        return true;
    }

    /**
     * Zwalnia lock (usuwamy plik).
     */
    release(botName) {
        try {
            if (fs.existsSync(this.lockFile)) {
                const lockData = JSON.parse(fs.readFileSync(this.lockFile, 'utf8'));
                // Zwolnij tylko jesli to nasz lock
                if (lockData.pid === process.pid) {
                    fs.unlinkSync(this.lockFile);
                    console.log(`🔓 Lock zwolniony przez: ${botName}`);
                }
            }
        } catch (e) {
            // Ignoruj bledy przy czyszczeniu
        }
    }
}

module.exports = BrowserLock;

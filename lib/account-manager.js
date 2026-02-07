console.log('✅ Loaded lib/account-manager.js');

const fs = require('fs');
const path = require('path');

/**
 * Wykrywa sciezke do Chrome/Chromium na podstawie systemu operacyjnego
 */
function getChromePath() {
    switch (process.platform) {
        case 'linux':
            if (fs.existsSync('/usr/bin/google-chrome')) return '/usr/bin/google-chrome';
            if (fs.existsSync('/usr/bin/google-chrome-stable')) return '/usr/bin/google-chrome-stable';
            if (fs.existsSync('/usr/bin/chromium-browser')) return '/usr/bin/chromium-browser';
            if (fs.existsSync('/usr/bin/chromium')) return '/usr/bin/chromium';
            throw new Error('Chrome/Chromium nie znaleziony na Linux');
        case 'darwin':
            return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        case 'win32':
            return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        default:
            throw new Error(`Nieobslugiwany system: ${process.platform}`);
    }
}

/**
 * Account Manager - zarządza wieloma kontami Facebooka z pełną separacją przeglądarek
 */
class AccountManager {
    constructor() {
        this.accounts = new Map();
        this.accountsPath = path.join(__dirname, '../accounts');
        this.loadAccounts();
    }

    /**
     * Ładuje wszystkie konta z folderu accounts/
     */
    loadAccounts() {
        try {
            if (!fs.existsSync(this.accountsPath)) {
                console.log('⚠️ Folder accounts/ nie istnieje');
                return;
            }

            const accountFolders = fs.readdirSync(this.accountsPath);
            
            for (const folder of accountFolders) {
                const configPath = path.join(this.accountsPath, folder, 'config.json');
                if (fs.existsSync(configPath)) {
                    try {
                        const config = require(configPath);
                        this.accounts.set(config.accountName, {
                            ...config,
                            folderPath: path.join(this.accountsPath, folder)
                        });
                        console.log(`✅ Załadowano konto: ${config.accountName}`);
                    } catch (error) {
                        console.error(`❌ Błąd ładowania konta ${folder}:`, error.message);
                    }
                }
            }
            
            console.log(`📊 Załadowano ${this.accounts.size} kont`);
            
        } catch (error) {
            console.error('❌ Błąd ładowania kont:', error);
        }
    }

    /**
     * Pobiera konto po nazwie
     */
    getAccount(accountName) {
        return this.accounts.get(accountName);
    }

    /**
     * Pobiera konto do skanowania
     */
    getScannerAccount() {
        return Array.from(this.accounts.values())
            .find(acc => acc.accountType === 'scanner' || acc.accountType === 'main');
    }

    /**
     * Pobiera konto do screenshotów
     */
    getScreenshotAccount() {
        return Array.from(this.accounts.values())
            .find(acc => acc.accountType === 'screenshot' || acc.accountType === 'main');
    }

    /**
     * Pobiera wszystkie konta
     */
    getAllAccounts() {
        return Array.from(this.accounts.values());
    }

    /**
     * Pobiera aktywne konta
     */
    getActiveAccounts() {
        return this.getAllAccounts().filter(account => {
            const cookiesPath = path.join(account.folderPath, 'fb-session', 'cookies.json');
            return fs.existsSync(cookiesPath);
        });
    }

    /**
     * Tworzy foldery dla konta
     */
    createAccountFolders(accountConfig) {
        Object.values(accountConfig.paths).forEach(folderPath => {
            const fullPath = path.resolve(__dirname, '..', folderPath);
            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
                console.log(`📁 Utworzono folder: ${fullPath}`);
            }
        });
    }

    /**
     * 🆕 Pobiera opcje przeglądarki dla konta z pełną separacją
     */
    getBrowserOptions(accountConfig, botRole = null, additionalOptions = {}) {
        // Wybierz profil przegladarki: dedykowany per botRole lub domyslny
        let profilePath;
        if (botRole && accountConfig.paths.browserProfiles && accountConfig.paths.browserProfiles[botRole]) {
            profilePath = accountConfig.paths.browserProfiles[botRole];
        } else {
            profilePath = accountConfig.paths.browserProfile;
        }
        const browserProfilePath = path.resolve(__dirname, '..', profilePath);

        // Upewnij się że folder profilu istnieje
        if (!fs.existsSync(browserProfilePath)) {
            fs.mkdirSync(browserProfilePath, { recursive: true });
            console.log(`🌐 Utworzono profil przeglądarki: ${browserProfilePath}`);
        }
        
        const baseOptions = {
            headless: accountConfig.browserConfig?.headless || false,
            executablePath: getChromePath(),
            userDataDir: browserProfilePath,  // 🗝️ Kluczowe: oddzielny profil!
            defaultViewport: accountConfig.browserConfig?.windowSize || { width: 1366, height: 768 },
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--no-first-run',
                '--disable-blink-features=AutomationControlled',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-infobars',
                '--disable-features=IsolateOrigins,site-per-process',
                `--user-data-dir=${browserProfilePath}`
            ]
            // USUNIETE flagi (sygnatury automatyzacji/Docker, audit #5/#24):
            // --single-process  - prawdziwy Chrome NIGDY nie uzywa, trywialnie wykrywalne
            // --no-zygote       - companion do single-process, typowe dla Docker
            // --disable-gpu     - zmienia fingerprint WebGL/canvas
            // --disable-accelerated-2d-canvas - zmienia fingerprint canvas
            // --disable-background-networking - moze przerwac FB keepalive
        };

        // Dodaj user agent jeśli skonfigurowany
        if (accountConfig.browserConfig?.userAgent) {
            baseOptions.args.push(`--user-agent=${accountConfig.browserConfig.userAgent}`);
        }

        // Merge: base args + dodatkowe args z bota (zamiast nadpisywania)
        const { args: additionalArgs, ...restAdditional } = additionalOptions;
        const mergedArgs = [...baseOptions.args, ...(additionalArgs || [])];
        return { ...baseOptions, ...restAdditional, args: mergedArgs };
    }

    /**
     * Sprawdza status konta
     */
    getAccountStatus(accountName) {
        const account = this.getAccount(accountName);
        if (!account) {
            return { status: 'not_found', message: 'Konto nie znalezione' };
        }

        const cookiesPath = path.join(account.folderPath, 'fb-session', 'cookies.json');
        const hasCookies = fs.existsSync(cookiesPath);
        
        const cachePath = path.join(account.folderPath, 'cache');
        const cacheSize = this.getFolderSize(cachePath);
        
        const learningPath = path.join(account.folderPath, 'learning-data');
        const learningSize = this.getFolderSize(learningPath);

        const browserProfilePath = path.join(account.folderPath, 'browser-profile');
        const browserProfileSize = this.getFolderSize(browserProfilePath);

        return {
            status: hasCookies ? 'ready' : 'needs_cookies',
            hasCookies,
            cacheSize,
            learningSize,
            browserProfileSize,
            accountType: account.accountType,
            email: account.facebookProfile.email,
            browserProfile: browserProfilePath
        };
    }

    /**
     * Pobiera rozmiar folderu
     */
    getFolderSize(folderPath) {
        try {
            if (!fs.existsSync(folderPath)) {
                return 0;
            }
            
            const files = fs.readdirSync(folderPath);
            let totalSize = 0;
            
            files.forEach(file => {
                const filePath = path.join(folderPath, file);
                const stats = fs.statSync(filePath);
                totalSize += stats.size;
            });
            
            return totalSize;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Generuje raport wszystkich kont
     */
    generateAccountReport() {
        const accounts = this.getAllAccounts();
        const report = {
            totalAccounts: accounts.length,
            activeAccounts: this.getActiveAccounts().length,
            accounts: []
        };

        accounts.forEach(account => {
            const status = this.getAccountStatus(account.accountName);
            report.accounts.push({
                name: account.accountName,
                type: account.accountType,
                email: account.facebookProfile.email,
                status: status.status,
                hasCookies: status.hasCookies,
                cacheSize: status.cacheSize,
                learningSize: status.learningSize,
                browserProfileSize: status.browserProfileSize,
                browserProfile: status.browserProfile
            });
        });

        return report;
    }

    /**
     * Czyści profile przeglądarek
     */
    cleanBrowserProfiles() {
        const accounts = this.getAllAccounts();
        
        accounts.forEach(account => {
            const browserProfilePath = path.join(account.folderPath, 'browser-profile');
            
            if (fs.existsSync(browserProfilePath)) {
                try {
                    // Usuń zawartość profilu ale zachowaj folder
                    const files = fs.readdirSync(browserProfilePath);
                    files.forEach(file => {
                        const filePath = path.join(browserProfilePath, file);
                        const stats = fs.statSync(filePath);
                        
                        if (stats.isDirectory()) {
                            fs.rmSync(filePath, { recursive: true, force: true });
                        } else {
                            fs.unlinkSync(filePath);
                        }
                    });
                    
                    console.log(`🧹 Wyczyszczono profil przeglądarki: ${account.accountName}`);
                } catch (error) {
                    console.error(`❌ Błąd czyszczenia profilu ${account.accountName}:`, error);
                }
            }
        });
    }

    /**
     * Przeładowuje konta
     */
    reloadAccounts() {
        this.accounts.clear();
        this.loadAccounts();
    }
}

module.exports = AccountManager;
module.exports.getChromePath = getChromePath;

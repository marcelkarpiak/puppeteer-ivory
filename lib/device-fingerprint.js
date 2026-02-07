console.log('✅ Loaded lib/device-fingerprint.js');

/**
 * Zarządza fingerprintingiem urządzenia - rozdzielczość, timezone, język, platforma.
 * User-Agent NIE jest nadpisywany - Chrome uzywa swojego natywnego UA,
 * dzieki czemu UA, Sec-CH-UA i navigator.userAgentData sa automatycznie spojne.
 */
class DeviceFingerprint {
    constructor() {
        // ETAP 2.6: Viewport musi byc <= rozdzielczosc monitora
        // UZUPELNIC wg monitora klienta (sprawdzic: xrandr | grep '*')
        const MONITOR_WIDTH = 1920;
        const MONITOR_HEIGHT = 1080;

        this.viewports = [
            { width: 1920, height: 1080 },
            { width: 1366, height: 768 },
            { width: 1440, height: 900 },
            { width: 1536, height: 864 },
            { width: 1280, height: 720 },
            { width: 1600, height: 900 },
        ].filter(v => v.width <= MONITOR_WIDTH && v.height <= MONITOR_HEIGHT);

        // ETAP 2.3: Tylko Polska - rozne strefy na polskim koncie z polskiego IP to red flag
        this.timezones = ['Europe/Warsaw'];

        // ETAP 2.4: Tylko polski - spójne z kontem i IP
        this.languages = [
            ['pl-PL', 'pl', 'en-US', 'en'],
            ['pl-PL', 'pl', 'en'],
        ];

        // ETAP 2.2: Tylko Linux - spójne z OS
        this.platforms = ['Linux x86_64'];
    }

    /**
     * Generuje losowy fingerprint urządzenia
     */
    generateFingerprint() {
        return {
            viewport: this.getRandomViewport(),
            timezone: this.getRandomTimezone(),
            language: this.getRandomLanguage(),
            platform: this.getRandomPlatform(),
        };
    }

    getRandomViewport() {
        // Standardowe rozdzielczosci - bez losowego offsetu.
        // Viewport 1373x761 jest bardziej podejrzany niz standardowy 1366x768,
        // bo prawdziwi uzytkownicy nie modyfikuja rozdzielczosci o losowe piksele.
        return this.viewports[Math.floor(Math.random() * this.viewports.length)];
    }

    getRandomTimezone() {
        return this.timezones[Math.floor(Math.random() * this.timezones.length)];
    }

    getRandomLanguage() {
        return this.languages[Math.floor(Math.random() * this.languages.length)];
    }

    getRandomPlatform() {
        return this.platforms[Math.floor(Math.random() * this.platforms.length)];
    }

    /**
     * Aplikuje fingerprint do strony Puppeteer
     */
    async applyFingerprint(page, fingerprint = null) {
        const fp = fingerprint || this.generateFingerprint();
        
        console.log(`🔧 Fingerprint: natywny UA Chrome (bez override)`);
        console.log(`   📱 Rozdzielczość: ${fp.viewport.width}x${fp.viewport.height}`);
        console.log(`   🌍 Timezone: ${fp.timezone}`);

        // User-Agent: NIE nadpisujemy - Chrome uzywa swojego natywnego UA.
        // Dzieki temu UA, Sec-CH-UA headers i navigator.userAgentData sa
        // automatycznie spojne (wszystkie z tego samego binary).
        // Kazda manipulacja (setUserAgent) ryzykuje mismatch z Client Hints.

        // Ustaw rozdzielczość
        await page.setViewport(fp.viewport);
        
        // Ustaw timezone i język
        await page.emulateTimezone(fp.timezone);
        
        // Ustaw języki
        await page.setExtraHTTPHeaders({
            'Accept-Language': fp.language.join(',')
        });
        
        // ETAP 2.5: Losuj hardwareConcurrency i deviceMemory RAZ na sesje (nie przy kazdym odczycie)
        const sessionHwConcurrency = Math.floor(Math.random() * 8) + 4; // 4-12 watkow
        const sessionDeviceMemory = [4, 8, 16][Math.floor(Math.random() * 3)];

        // ETAP 2.6: Stale rozdzielczosci monitora (uzupelnic wg monitora klienta)
        const MONITOR_WIDTH = 1920;
        const MONITOR_HEIGHT = 1080;

        // Nadpisz właściwości navigatora
        await page.evaluateOnNewDocument((platform, languages, hwConcurrency, deviceMem, monitorW, monitorH) => {
            // Platform
            Object.defineProperty(navigator, 'platform', {
                get: () => platform,
                configurable: true
            });

            // Języki
            Object.defineProperty(navigator, 'language', {
                get: () => languages[0],
                configurable: true
            });

            Object.defineProperty(navigator, 'languages', {
                get: () => languages,
                configurable: true
            });

            // ETAP 2.5: Stala wartosc na cala sesje (fix bugu)
            Object.defineProperty(navigator, 'hardwareConcurrency', {
                get: () => hwConcurrency,
                configurable: true
            });

            Object.defineProperty(navigator, 'deviceMemory', {
                get: () => deviceMem,
                configurable: true
            });

            // Screen properties
            Object.defineProperty(screen, 'colorDepth', {
                get: () => 24,
                configurable: true
            });

            Object.defineProperty(screen, 'pixelDepth', {
                get: () => 24,
                configurable: true
            });

            // ETAP 2.6: Screen dimensions spójne z monitorem
            Object.defineProperty(screen, 'width', {
                get: () => monitorW,
                configurable: true
            });
            Object.defineProperty(screen, 'height', {
                get: () => monitorH,
                configurable: true
            });
            Object.defineProperty(screen, 'availWidth', {
                get: () => monitorW,
                configurable: true
            });
            Object.defineProperty(screen, 'availHeight', {
                get: () => monitorH - 48, // taskbar
                configurable: true
            });

            // Canvas, WebGL, Audio: NIE nadpisujemy prototypow natywnych funkcji.
            // Prawdziwy sprzet (GPU, karta dzwiekowa) daje STALY fingerprint - jak u realnego usera.
            // Nadpisywanie prototype.toString() zdradza manipulacje (audit #11).
            // --disable-gpu zostalo usuniete (audit #5), wiec Chrome uzywa prawdziwego GPU.

            // === ETAP 9.1: CDP DETECTION EVASION ===
            // Ukryj Error.stack traces z puppeteer/devtools:
            const originalPrepareStackTrace = Error.prepareStackTrace;
            if (originalPrepareStackTrace) {
                Error.prepareStackTrace = function(error, stack) {
                    const filtered = stack.filter(frame => {
                        const fn = frame.getFileName() || '';
                        return !fn.includes('puppeteer') && !fn.includes('devtools');
                    });
                    return originalPrepareStackTrace(error, filtered);
                };
            }

            // Ukryj window.cdc_ (ChromeDriver marker - nie istnieje w Puppeteer, ale safety net):
            for (const key of Object.keys(window)) {
                if (key.match(/^cdc_/)) {
                    delete window[key];
                }
            }
            // UWAGA: NIE usuwamy __webdriver ani chrome.runtime - to legit API prawdziwego Chrome.
            // Ich brak jest bardziej podejrzany niz obecnosc.

            // Ukryj Permissions API anomalie:
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = function(parameters) {
                if (parameters.name === 'notifications') {
                    return Promise.resolve({ state: Notification.permission });
                }
                return originalQuery.call(this, parameters);
            };
        }, fp.platform, fp.language, sessionHwConcurrency, sessionDeviceMemory, MONITOR_WIDTH, MONITOR_HEIGHT);
        
        return fp;
    }
}

module.exports = DeviceFingerprint;

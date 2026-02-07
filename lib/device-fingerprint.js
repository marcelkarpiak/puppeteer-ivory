/**
 * Fingerprinting urzadzenia.
 *
 * ZASADA: Na stacjonarnym komputerze fingerprint jest STALY.
 * Prawdziwy uzytkownik nie zmienia rozdzielczosci, CPU ani RAM miedzy sesjami.
 *
 * Co Chrome raportuje POPRAWNIE sam z prawdziwego hardware (NIE nadpisujemy):
 *   - navigator.hardwareConcurrency (prawdziwa liczba rdzeni CPU)
 *   - navigator.deviceMemory (prawdziwy RAM, cap 8 GB)
 *   - screen.width / screen.height (prawdziwy monitor)
 *   - screen.availWidth / screen.availHeight (monitor minus taskbar)
 *   - screen.colorDepth / screen.pixelDepth (prawdziwa glebia kolorow)
 *   - viewport (rozmiar okna - zarzadzany przez --start-maximized + defaultViewport: null)
 *   - WebGL renderer, canvas fingerprint (prawdziwy GPU)
 *   - User-Agent, Sec-CH-UA, navigator.userAgentData (natywne z binary Chrome)
 *
 * Co nadpisujemy (bo moze nie odpowiadac kontekstowi konta FB):
 *   - timezone (Europe/Warsaw - spójne z polskim kontem)
 *   - navigator.language / languages (pl-PL - spójne z kontem)
 *   - navigator.platform (Linux x86_64 - explicit dla pewnosci)
 *   - CDP detection evasion (ukrywanie sladow Puppeteer)
 */
class DeviceFingerprint {
    constructor() {
        this.timezone = 'Europe/Warsaw';
        this.platform = 'Linux x86_64';
        this.language = ['pl-PL', 'pl', 'en-US', 'en'];
    }

    /**
     * Aplikuje fingerprint do strony Puppeteer.
     * Viewport i hardware NIE sa nadpisywane - Chrome uzywa prawdziwych wartosci.
     */
    async applyFingerprint(page) {
        console.log('🔧 Fingerprint: natywne wartosci Chrome (hardware z prawdziwego komputera)');
        console.log(`   🌍 Timezone: ${this.timezone}`);
        console.log(`   🌐 Jezyk: ${this.language[0]}`);

        // Timezone
        await page.emulateTimezone(this.timezone);

        // Jezyk w naglowkach HTTP
        await page.setExtraHTTPHeaders({
            'Accept-Language': this.language.join(',')
        });

        const platform = this.platform;
        const languages = this.language;

        await page.evaluateOnNewDocument((plat, langs) => {
            // Platform - explicit dla spójnosci z OS
            Object.defineProperty(navigator, 'platform', {
                get: () => plat,
                configurable: true
            });

            // Jezyki - spójne z polskim kontem FB
            Object.defineProperty(navigator, 'language', {
                get: () => langs[0],
                configurable: true
            });

            Object.defineProperty(navigator, 'languages', {
                get: () => Object.freeze([...langs]),
                configurable: true
            });

            // hardwareConcurrency, deviceMemory, screen.*: NIE NADPISUJEMY.
            // Chrome raportuje prawdziwe wartosci z hardware komputera.
            // Kazde nadpisanie tworzy ryzyko niesójnosci z innymi sygnalami
            // (np. WebGL renderer zdradza prawdziwy GPU, a sfałszowany RAM
            // nie pasuje do klasy sprzetu).

            // Canvas, WebGL, Audio: NIE nadpisujemy prototypow natywnych funkcji.
            // Prawdziwy sprzet (GPU, karta dzwiekowa) daje STALY fingerprint.

            // === CDP DETECTION EVASION ===

            // Ukryj Error.stack traces z puppeteer/devtools
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

            // Ukryj window.cdc_ (ChromeDriver marker - safety net)
            for (const key of Object.keys(window)) {
                if (key.match(/^cdc_/)) {
                    delete window[key];
                }
            }
            // NIE usuwamy __webdriver ani chrome.runtime - to legit API prawdziwego Chrome.

            // Permissions API normalizacja
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = function(parameters) {
                if (parameters.name === 'notifications') {
                    return Promise.resolve({ state: Notification.permission });
                }
                return originalQuery.call(this, parameters);
            };
        }, platform, languages);
    }
}

module.exports = DeviceFingerprint;

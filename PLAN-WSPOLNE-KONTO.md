# Plan wdrozeniowy: Jedno konto Facebook + minimalizacja ryzyka bana

## Kontekst wdrozenia

- **Srodowisko:** Ubuntu, komputer stacjonarny w biurze klienta
- **Konto FB:** Wygrzane, uzywane przez ludzi po godzinach pracy
- **Architektura:** Dwa boty (scanner + screenshot) dzialajace SEKWENCYJNIE (nigdy rownoczesnie)
- **Cel:** Minimalizacja ryzyka bana na Facebooku przy zachowaniu pelnej funkcjonalnosci

## Szacowane ryzyko bana

| Scenariusz | Ryzyko (miesiac) |
|---|---|
| Bez zmian (aktualne) | ~50-60% |
| Po wdrozeniu ETAPU 1-2 | ~25-30% |
| Po wdrozeniu ETAPU 1-4 | ~12-15% |
| Po wdrozeniu ETAPU 1-6 | ~5-8% |
| Po wdrozeniu WSZYSTKIEGO + aktywnosc ludzka | ~3-5% |

---

# ETAP 1: Wspolne konto + adaptacja Ubuntu

## Krok 1.1: Struktura folderow `accounts/main-account/`

Utworzyc `accounts/main-account/` z podfolderami:

```
accounts/main-account/
├── config.json
├── fb-session/
│   └── cookies.json
├── cache/
├── learning-data/
├── screenshots/
├── browser-profile/        # JEDEN wspolny profil Chrome dla obu botow
└── logs/
```

**Dlaczego jeden profil zamiast dwoch?** Dwa profile Chrome to z perspektywy Facebooka dwa oddzielne urzadzenia - rozny localStorage, cache, historia. Facebook widzialby konto przeskakujace miedzy dwoma desktopami naprzemiennie, codziennie, jak w zegarku. To nienaturalne i latwe do wykrycia. Jeden profil = jedno urzadzenie = spójny fingerprint. Bezpieczenstwo przed jednoczesnym uruchomieniem zapewnia mechanizm lock-file (krok 1.8).

Kazdy podfolder powinien zawierac `.gitkeep` (zeby git stworzy foldery) i byc dodany do `.gitignore` (zeby dane sesji nie trafialy do repo).

## Krok 1.2: Plik `accounts/main-account/config.json`

```json
{
    "accountType": "main",
    "accountName": "main-account",
    "accountDescription": "Glowne konto Facebook - wspolne dla scanner i screenshot bota",
    "facebookProfile": {
        "email": "UZUPELNIC_EMAIL_KLIENTA",
        "name": "main-account"
    },
    "paths": {
        "session": "../accounts/main-account/fb-session",
        "cache": "../accounts/main-account/cache",
        "learning": "../accounts/main-account/learning-data",
        "screenshots": "../accounts/main-account/screenshots",
        "browserProfile": "../accounts/main-account/browser-profile",
        "logs": "../accounts/main-account/logs"
    },
    "capabilities": ["scraping", "processing"],
    "browserConfig": {
        "headless": false,
        "windowSize": { "width": 1366, "height": 768 },
        "userAgent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    },
    "settings": {
        "maxSessionsPerHour": 3,
        "maxPostsPerSession": 15,
        "enableScreenshots": true,
        "enableLearning": true
    }
}
```

**Uwaga:** `maxPostsPerSession` obnizony z 25 do 15 (realistyczne tempo czlowieka).

## Krok 1.3: Kopia cookies

Skopiowac istniejace `accounts/scanner-account/fb-session/cookies.json` do `accounts/main-account/fb-session/cookies.json`.

## Krok 1.4: Zmiany w `lib/account-manager.js`

### 1.4a: Fallback na `main` w `getScannerAccount()` i `getScreenshotAccount()`

```javascript
// BYLO:
getScannerAccount() {
    return Array.from(this.accounts.values())
        .find(acc => acc.accountType === 'scanner');
}

// JEST:
getScannerAccount() {
    return Array.from(this.accounts.values())
        .find(acc => acc.accountType === 'scanner' || acc.accountType === 'main');
}
```

Analogicznie dla `getScreenshotAccount()`:
```javascript
getScreenshotAccount() {
    return Array.from(this.accounts.values())
        .find(acc => acc.accountType === 'screenshot' || acc.accountType === 'main');
}
```

### 1.4b: Parametr `botRole` w `getBrowserOptions()`

Zmiana sygnatury:
```javascript
// BYLO:
getBrowserOptions(accountConfig, additionalOptions = {})

// JEST:
getBrowserOptions(accountConfig, botRole = null, additionalOptions = {})
```

Logika wyboru profilu przegladarki:
```javascript
let profilePath;
if (botRole && accountConfig.paths.browserProfiles && accountConfig.paths.browserProfiles[botRole]) {
    profilePath = accountConfig.paths.browserProfiles[botRole];
} else {
    profilePath = accountConfig.paths.browserProfile;
}
const browserProfilePath = path.resolve(__dirname, '..', profilePath);
```

**Uwaga:** W docelowej konfiguracji config.json uzywa `browserProfile` (jeden profil), wiec parametr `botRole` nie wplywa na wybor profilu - oba boty uzywaja tego samego. Parametr `botRole` pozostaje w sygnaturze na wypadek przyszlej potrzeby rozdzielenia profili, oraz jest uzywany przez mechanizm lock-file (krok 1.8) do identyfikacji ktory bot aktualnie dziala.

### 1.4c: Chrome path - wykrywanie OS zamiast hardcodu

Zmienic **wszystkie** wystapienia hardcoded macOS path na detekcje systemu:

```javascript
function getChromePath() {
    switch (process.platform) {
        case 'linux':
            // Sprawdz najpierw google-chrome, potem chromium
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
```

**Pliki do zmiany (hardcoded macOS path):**

| Plik | Linia | Zmiana |
|------|-------|--------|
| `lib/account-manager.js` | ~118 | `executablePath: getChromePath()` |
| `fb-scanner-bot.js` | ~1103 | `executablePath: getChromePath()` |
| `fb-screenshot-bot.js` | ~184 | `executablePath: getChromePath()` |
| `test-system-chrome.js` | ~11 | `executablePath: getChromePath()` |

Funkcje `getChromePath()` umiescic w `lib/account-manager.js` i eksportowac, lub w osobnym pliku `lib/chrome-path.js`.

## Krok 1.5: Wywolanie `getBrowserOptions` z `botRole` w botach

**`fb-scanner-bot.js` (linia ~1120):**
```javascript
// BYLO:
const browserOptions = accountManager.getBrowserOptions(scannerAccount, puppeteerOptions);

// JEST:
const browserOptions = accountManager.getBrowserOptions(scannerAccount, 'scanner', puppeteerOptions);
```

**`fb-screenshot-bot.js` (linia ~183):**
```javascript
// BYLO:
const browserOptions = accountManager.getBrowserOptions(screenshotAccount, {...});

// JEST:
const browserOptions = accountManager.getBrowserOptions(screenshotAccount, 'screenshot', {...});
```

## Krok 1.6: BUGFIX - brakujacy `puppeteer.launch()` w screenshot bocie

W `fb-screenshot-bot.js`, funkcja `runScreenshotBot()` (linia ~183) - opcje przegladarki sa przygotowane ale `puppeteer.launch()` nigdy nie jest wywolane. Zmienna `browser` jest uzywana pozniej (linie 199, 225) ale nigdzie nie jest zdefiniowana.

```javascript
async function runScreenshotBot() {
    // ... browserOptions config ...

    // DODAC:
    const browser = await puppeteer.launch(browserOptions);
    console.log('🌐 Przegladarka uruchomiona');

    let running = true;
    // ... reszta kodu ...
}
```

## Krok 1.7: Archiwizacja starych kont

```bash
mkdir -p accounts/_archive
mv accounts/scanner-account accounts/_archive/scanner-account
mv accounts/screenshot-account accounts/_archive/screenshot-account
```

`AccountManager` nie zaladuje starych kont (bo nie sa juz w `accounts/`), ale dane zachowane na wypadek potrzeby powrotu.

## Krok 1.8: Mechanizm lock-file (ochrona jednego profilu Chrome)

### O co chodzi z lock-file?

Chrome pozwala tylko jednej instancji przegladarki korzystac z danego profilu (`userDataDir`) w tym samym czasie. Jesli dwa procesy sprobuja otworzyc ten sam profil - Chrome sie crashuje lub zachowuje nieprzewidywalnie.

Poniewaz oba boty (scanner i screenshot) uzywaja **jednego wspolnego profilu Chrome**, musimy zagwarantowac ze **nigdy nie dzialaja jednoczesnie**. Lock-file to prosty mechanizm:

1. Bot chce uruchomic przegladarke → sprawdza czy istnieje plik `browser.lock`
2. Jesli NIE istnieje → tworzy `browser.lock` z informacja kto i kiedy go stworzyl → uruchamia Chrome
3. Jesli ISTNIEJE → sprawdza czy proces ktory go stworzyl nadal zyje (po PID)
   - Jesli proces zyje → **odmawia startu**, loguje blad ("scanner aktualnie uzywa przegladarki")
   - Jesli proces nie zyje → to "osierocony" lock (np. po crashu), kasuje go i tworzy nowy
4. Po zakonczeniu pracy bota → kasuje `browser.lock`

### Nowy plik: `lib/browser-lock.js`

```javascript
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

                // Sprawdz czy proces ktory zalozoyl lock nadal zyje
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
```

### Integracja w `fb-scanner-bot.js`

```javascript
const BrowserLock = require('./lib/browser-lock');

// Przed puppeteer.launch():
const browserLock = new BrowserLock(scannerAccount.folderPath);
if (!browserLock.acquire('fb-scanner-bot')) {
    console.error('❌ Nie mozna uruchomic scannera - profil Chrome jest uzywany przez innego bota');
    process.exit(1);
}

// puppeteer.launch() ...
// ... sesja skanowania ...
// Po browser.close():
browserLock.release('fb-scanner-bot');
```

### Integracja w `fb-screenshot-bot.js`

```javascript
const BrowserLock = require('./lib/browser-lock');

// Przed puppeteer.launch():
const browserLock = new BrowserLock(screenshotAccount.folderPath);
if (!browserLock.acquire('fb-screenshot-bot')) {
    console.error('❌ Nie mozna uruchomic screenshot bota - profil Chrome jest uzywany przez innego bota');
    process.exit(1);
}

// puppeteer.launch() ...
// ... sesja screenshotow ...
// Po browser.close():
browserLock.release('fb-screenshot-bot');
```

### Co sie dzieje w praktyce

```
09:00  Scanner chce wystartowac
       → browser.lock nie istnieje
       → tworzy browser.lock {pid: 1234, bot: "scanner", time: "09:00"}
       → uruchamia Chrome, skanuje grupy

09:15  Screenshot chce wystartowac (przypadkowo)
       → browser.lock ISTNIEJE
       → sprawdza PID 1234 → proces zyje
       → "Profil zablokowany przez scanner" → ODMAWIA STARTU

09:20  Scanner konczy
       → kasuje browser.lock
       → zamyka Chrome

10:30  Screenshot startuje
       → browser.lock nie istnieje
       → tworzy browser.lock {pid: 5678, bot: "screenshot", time: "10:30"}
       → uruchamia Chrome, robi screenshoty

10:30  (scenariusz awaryjny) Scanner zcrashowal sie o 09:10 bez kasowania locka
       → browser.lock ISTNIEJE z PID 1234
       → sprawdza PID 1234 → proces NIE zyje (crash)
       → "Osierocony lock, usuwam"
       → tworzy nowy lock → startuje normalnie
```

---

# ETAP 2: Naprawa krytycznych fingerprintow

## Krok 2.1: User-Agent TYLKO Linux

**Plik: `lib/device-fingerprint.js`**

Zastapic tablice `this.userAgents` wersjami TYLKO Linux (bo bot dziala na Ubuntu):

```javascript
this.userAgents = [
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
];
```

**Usunac** Windows i macOS user-agenty - na Ubuntu maszynie sa natychmiast wykrywalne jako mismatch.

## Krok 2.2: Platform spójny z OS

**Plik: `lib/device-fingerprint.js`**

Zastapic tablice platform na tylko Linux:
```javascript
// BYLO: ['Win32', 'MacIntel', 'Linux x86_64']
// JEST:
this.platforms = ['Linux x86_64'];
```

## Krok 2.3: Timezone - tylko polski

Skoro klient jest w Polsce i konto jest polskie:
```javascript
// BYLO: ['Europe/Warsaw', 'Europe/London', 'Europe/Berlin', ...]
// JEST:
this.timezones = ['Europe/Warsaw'];
```

Rozne strefy czasowe na polskim koncie z polskiego IP to red flag.

## Krok 2.4: Language - tylko polski

```javascript
// BYLO: [['pl-PL', 'pl', 'en'], ['en-US', 'en'], ['en-GB', 'en'], ['de-DE', 'de', 'en']]
// JEST:
this.languages = [
    ['pl-PL', 'pl', 'en-US', 'en'],
    ['pl-PL', 'pl', 'en'],
];
```

## Krok 2.5: FIX `hardwareConcurrency` - losowac RAZ na sesje

**Plik: `lib/device-fingerprint.js`**

Problem: `hardwareConcurrency` zwraca losowa wartosc przy KAZDYM odczycie. Prawdziwy komputer zwraca zawsze te sama.

```javascript
// BYLO (bug):
Object.defineProperty(navigator, 'hardwareConcurrency', {
    get: () => Math.floor(Math.random() * 8) + 4  // ROZNA WARTOSC ZA KAZDYM RAZEM
});

// JEST (fix):
// Wylosowac wartosc PRZED evaluateOnNewDocument:
const sessionHwConcurrency = Math.floor(Math.random() * 8) + 4;
const sessionDeviceMemory = [4, 8, 16][Math.floor(Math.random() * 3)];

await page.evaluateOnNewDocument((hwConcurrency, deviceMem) => {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => hwConcurrency  // STALA WARTOSC NA CALA SESJE
    });
    Object.defineProperty(navigator, 'deviceMemory', {
        get: () => deviceMem      // STALA WARTOSC NA CALA SESJE
    });
}, sessionHwConcurrency, sessionDeviceMemory);
```

## Krok 2.6: Viewport spójny z ekranem

**Plik: `lib/device-fingerprint.js`**

Viewport nie moze byc wiekszy niz `screen.width/height`. Na Ubuntu trzeba odczytac rozdzielczosc monitora i ustawic viewport odpowiednio.

```javascript
// Ustawic screen na stale wartosci odpowiadajace monitorowi klienta
// (sprawdzic: xrandr | grep '*' na maszynie Ubuntu)
const MONITOR_WIDTH = 1920;   // UZUPELNIC wg monitora klienta
const MONITOR_HEIGHT = 1080;  // UZUPELNIC wg monitora klienta

// Viewport musi byc <= rozdzielczosc monitora
this.viewports = [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 1280, height: 720 },
    { width: 1600, height: 900 },
    { width: 1920, height: 1080 },
].filter(v => v.width <= MONITOR_WIDTH && v.height <= MONITOR_HEIGHT);

// W evaluateOnNewDocument ustawic screen:
Object.defineProperty(screen, 'width', { get: () => MONITOR_WIDTH });
Object.defineProperty(screen, 'height', { get: () => MONITOR_HEIGHT });
Object.defineProperty(screen, 'availWidth', { get: () => MONITOR_WIDTH });
Object.defineProperty(screen, 'availHeight', { get: () => MONITOR_HEIGHT - 48 }); // taskbar
```

## Krok 2.7: Dodac zapis cookies po kazdej sesji

**Pliki: `fb-scanner-bot.js` i `fb-screenshot-bot.js`**

Dodac funkcje `saveCookies()`:

```javascript
async function saveCookies(page) {
    try {
        const cookies = await page.cookies();
        if (cookies.length > 0) {
            fs.writeFileSync(SESSION_PATH, JSON.stringify(cookies, null, 2));
            console.log(`🍪 Zapisano ${cookies.length} cookies`);
        }
    } catch (err) {
        console.error('⚠️ Blad zapisu cookies:', err.message);
    }
}
```

Wywolywac **PRZED zamknieciem przegladarki** w obu botach:
```javascript
// Przed browser.close() lub page.close():
await saveCookies(page);
```

Dzieki temu cookies sa odswiezane po kazdej sesji. Dodatkowo ludzie uzywajacy konta po godzinach tez odswiezaja cookies naturalnie.

---

# ETAP 3: Browser fingerprint spoofing

## Krok 3.1: Canvas fingerprint spoofing

**Plik: `lib/device-fingerprint.js`** - dodac w metodzie `applyFingerprint()`, wewnatrz `evaluateOnNewDocument`:

```javascript
// === CANVAS FINGERPRINT SPOOFING ===
// Facebook rysuje ukryty canvas i czyta piksele - kazdy GPU renderuje minimalnie inaczej.
// Dodajemy mikroszum (+/-1 na kanalach RGB) zeby fingerprint wyglądal jak prawdziwy sprzet,
// ale nie byl identyczny miedzy sesjami.

const canvasNoiseSeed = Math.random();

const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
HTMLCanvasElement.prototype.toDataURL = function(type) {
    const ctx = this.getContext('2d');
    if (ctx && this.width < 500 && this.height < 500) {
        // Maly canvas = prawdopodobnie fingerprinting
        try {
            const imageData = ctx.getImageData(0, 0, this.width, this.height);
            for (let i = 0; i < imageData.data.length; i += 4) {
                // Deterministyczny szum bazowany na seedzie (spójny w ramach sesji)
                const noise = ((canvasNoiseSeed * (i + 1) * 9301 + 49297) % 233280) / 233280;
                imageData.data[i] += Math.floor(noise * 3) - 1;     // R: -1, 0, +1
                imageData.data[i+1] += Math.floor(noise * 5) - 2;   // G: -2 do +2
            }
            ctx.putImageData(imageData, 0, 0);
        } catch(e) {}
    }
    return originalToDataURL.apply(this, arguments);
};

const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
CanvasRenderingContext2D.prototype.getImageData = function() {
    const imageData = originalGetImageData.apply(this, arguments);
    if (this.canvas.width < 500 && this.canvas.height < 500) {
        for (let i = 0; i < imageData.data.length; i += 4) {
            const noise = ((canvasNoiseSeed * (i + 1) * 9301 + 49297) % 233280) / 233280;
            imageData.data[i] += Math.floor(noise * 3) - 1;
        }
    }
    return imageData;
};
```

## Krok 3.2: WebGL fingerprint spoofing

**Plik: `lib/device-fingerprint.js`** - dodac w `evaluateOnNewDocument`:

```javascript
// === WEBGL FINGERPRINT SPOOFING ===
// Facebook odpytuje WEBGL_debug_renderer_info zeby poznac GPU.
// Puppeteer na Ubuntu bez GPU zwraca "SwiftShader" lub "llvmpipe" = sygnatura bota.
// Ustawic na wartosci odpowiadajace prawdziwej karcie w komputerze klienta.

// UWAGA: Uzupelnic ponizsze wartosci na podstawie:
// W Chrome klienta otworzyc chrome://gpu i odczytac "GL_RENDERER" i "GL_VENDOR"

const REAL_GPU_VENDOR = 'Google Inc. (Intel)';
const REAL_GPU_RENDERER = 'ANGLE (Intel, Mesa Intel UHD Graphics 630 (CFL GT2), OpenGL 4.6)';

const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
WebGLRenderingContext.prototype.getParameter = function(param) {
    if (param === 37445) return REAL_GPU_VENDOR;      // UNMASKED_VENDOR_WEBGL
    if (param === 37446) return REAL_GPU_RENDERER;     // UNMASKED_RENDERER_WEBGL
    return originalGetParameter.call(this, param);
};

// Pokryc tez WebGL2:
const originalGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
WebGL2RenderingContext.prototype.getParameter = function(param) {
    if (param === 37445) return REAL_GPU_VENDOR;
    if (param === 37446) return REAL_GPU_RENDERER;
    return originalGetParameter2.call(this, param);
};
```

**WAZNE:** Wartosci `REAL_GPU_VENDOR` i `REAL_GPU_RENDERER` musza odpowiadac prawdziwej karcie graficznej komputera klienta. Odczytac z `chrome://gpu` na tym komputerze.

## Krok 3.3: AudioContext fingerprint spoofing

**Plik: `lib/device-fingerprint.js`** - dodac w `evaluateOnNewDocument`:

```javascript
// === AUDIOCONTEXT FINGERPRINT SPOOFING ===
// Facebook tworzy OfflineAudioContext i generuje sygnal przez OscillatorNode.
// Dodajemy mikroszum do wynikow.

const audioNoiseSeed = Math.random() * 0.00001;

const originalGetFloatFrequencyData = AnalyserNode.prototype.getFloatFrequencyData;
AnalyserNode.prototype.getFloatFrequencyData = function(array) {
    originalGetFloatFrequencyData.call(this, array);
    for (let i = 0; i < array.length; i++) {
        array[i] += audioNoiseSeed * (i % 7);
    }
};

const originalGetChannelData = AudioBuffer.prototype.getChannelData;
AudioBuffer.prototype.getChannelData = function(channel) {
    const data = originalGetChannelData.call(this, channel);
    for (let i = 0; i < data.length; i += 100) {
        data[i] += audioNoiseSeed;
    }
    return data;
};
```

## Krok 3.4: Instalacja fontow na Ubuntu

Na maszynie klienta zainstalowac popularne fonty zeby fingerprint fontow wygladal jak typowy desktop:

```bash
sudo apt install -y fonts-liberation ttf-mscorefonts-installer fonts-noto fonts-dejavu
sudo fc-cache -fv
```

Bez tego Ubuntu ma ograniczony zestaw fontow co jest latwe do wykrycia.

---

# ETAP 4: Human-like behavior - rozgrzewka i schladzanie sesji

## Krok 4.1: Nowy plik `lib/session-warmup.js`

Przed skanowaniem grupy bot musi zachowywac sie jak czlowiek otwierajacy Facebooka:

```javascript
// lib/session-warmup.js

const { humanDelay, humanClick, humanScroll } = require('./human-behavior');

async function warmupSession(page) {
    console.log('🔥 Rozgrzewka sesji...');

    // 1. Wejdz na strone glowna Facebooka (nie od razu na grupe)
    await page.goto('https://www.facebook.com', { waitUntil: 'networkidle2' });
    await humanDelay('afterPageLoad');

    // 2. Scrolluj newsfeed 15-45 sekund
    const scrollDuration = 15000 + Math.random() * 30000;
    const scrollEnd = Date.now() + scrollDuration;
    while (Date.now() < scrollEnd) {
        await humanScroll(page);
        await humanDelay('betweenActions');
    }

    // 3. 30% szans: kliknij powiadomienia
    if (Math.random() < 0.3) {
        try {
            const notifButton = await page.$('[aria-label="Powiadomienia"], [aria-label="Notifications"]');
            if (notifButton) {
                await humanClick(page, notifButton);
                await humanDelay('afterPageLoad');
                // Poczekaj 3-8 sekund "czytajac" powiadomienia
                await new Promise(r => setTimeout(r, 3000 + Math.random() * 5000));
                // Zamknij powiadomienia klikajac gdzies indziej
                await page.mouse.click(100, 300);
                await humanDelay('betweenActions');
            }
        } catch (e) { /* ignoruj */ }
    }

    // 4. 20% szans: kliknij losowy post na feedzie
    if (Math.random() < 0.2) {
        try {
            const posts = await page.$$('[role="article"]');
            if (posts.length > 2) {
                const randomPost = posts[Math.floor(Math.random() * Math.min(posts.length, 5))];
                await randomPost.scrollIntoView();
                await humanDelay('beforeScroll');
                // "Czytaj" post 5-15 sekund
                await new Promise(r => setTimeout(r, 5000 + Math.random() * 10000));
            }
        } catch (e) { /* ignoruj */ }
    }

    console.log('✅ Rozgrzewka zakonczona');
}

module.exports = { warmupSession };
```

## Krok 4.2: Nowy plik `lib/session-cooldown.js`

Po skanowaniu grupy bot nie powinien natychmiast zamykac przegladarki:

```javascript
// lib/session-cooldown.js

const { humanDelay, humanScroll } = require('./human-behavior');

async function cooldownSession(page) {
    console.log('❄️ Schladzanie sesji...');

    // 1. Zostań na stronie jeszcze 10-30 sekund
    const stayDuration = 10000 + Math.random() * 20000;
    const stayEnd = Date.now() + stayDuration;
    while (Date.now() < stayEnd) {
        if (Math.random() < 0.5) {
            await humanScroll(page);
        }
        await humanDelay('readingTime');
    }

    // 2. 40% szans: wroc na newsfeed
    if (Math.random() < 0.4) {
        try {
            await page.goto('https://www.facebook.com', { waitUntil: 'networkidle2' });
            await humanDelay('afterPageLoad');
            // Scrolluj 10-20 sekund
            const scrollDuration = 10000 + Math.random() * 10000;
            const scrollEnd = Date.now() + scrollDuration;
            while (Date.now() < scrollEnd) {
                await humanScroll(page);
                await humanDelay('betweenActions');
            }
        } catch (e) { /* ignoruj */ }
    }

    // 3. 15% szans: odwiedz profil losowej osoby z feeda
    if (Math.random() < 0.15) {
        try {
            const profileLinks = await page.$$('a[href*="/profile.php"], a[href*="facebook.com/"][role="link"]');
            if (profileLinks.length > 3) {
                const randomLink = profileLinks[Math.floor(Math.random() * Math.min(profileLinks.length, 8))];
                await randomLink.click();
                await humanDelay('afterPageLoad');
                await new Promise(r => setTimeout(r, 3000 + Math.random() * 7000));
                await page.goBack();
            }
        } catch (e) { /* ignoruj */ }
    }

    console.log('✅ Schladzanie zakonczone');
}

module.exports = { cooldownSession };
```

## Krok 4.3: Integracja warmup/cooldown w `fb-scanner-bot.js`

W `runSingleSession()` (lub odpowiedniej funkcji sesji):

```javascript
const { warmupSession } = require('./lib/session-warmup');
const { cooldownSession } = require('./lib/session-cooldown');

async function runSingleSession(targetGroup, coordinator) {
    // ... lancuh przegladarki ...

    // NOWE - rozgrzewka PRZED skanowaniem:
    await warmupSession(page);

    // Dopiero teraz nawiguj do grupy:
    await page.goto(targetGroup.url, { waitUntil: 'networkidle2' });

    // ... skanowanie postow (istniejacy kod) ...

    // NOWE - schladzanie PO skanowaniu:
    await cooldownSession(page);

    // Zapis cookies przed zamknieciem:
    await saveCookies(page);

    // Zamknij przegladarke
    await browser.close();
}
```

## Krok 4.4: Integracja warmup/cooldown w `fb-screenshot-bot.js`

W screenshot bocie rozgrzewka jest prostsza (bot wchodzi na konkretne URL-e postow):

```javascript
const { warmupSession } = require('./lib/session-warmup');

// Przed rozpoczeciem petli screenshotow:
const page = await browser.newPage();
await warmupSession(page);

// ... petla screenshotow ...

// Po zakonczeniu:
await saveCookies(page);
```

---

# ETAP 5: Sekwencyjne dzialanie + losowe opoznienia

## Krok 5.1: Screenshot bot - opozniony start po skanowaniu

**Plik: `fb-screenshot-bot.js`**

Zamiast pollowac Supabase co 5 sekund i natychmiast procesowac nowe posty, screenshot bot powinien czekac losowy czas od momentu zeskanowania postu:

```javascript
// W petli glownej screenshot bota:
const { data: posts, error } = await supabase
    .from('posts')
    .select('*')
    .eq('status', 'new')
    .order('scraped_at', { ascending: true })
    .limit(1);

if (posts && posts.length > 0) {
    const post = posts[0];
    const scrapedAt = new Date(post.scraped_at);
    const now = new Date();
    const timeSinceScrape = now - scrapedAt;

    // Minimalna przerwa: 15-90 minut od momentu zeskanowania
    const minDelayMs = 15 * 60 * 1000;   // 15 minut
    const maxDelayMs = 90 * 60 * 1000;   // 90 minut
    // Losowy delay per post (deterministyczny - bazowany na ID posta)
    const postHash = post.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const targetDelay = minDelayMs + (postHash % (maxDelayMs - minDelayMs));

    if (timeSinceScrape < targetDelay) {
        const remaining = Math.ceil((targetDelay - timeSinceScrape) / 60000);
        console.log(`⏳ Post ${post.id}: czekam jeszcze ${remaining} min`);
        await sleep(30000); // sprawdz ponownie za 30s
        continue;
    }

    // Minelo wystarczajaco duzo czasu - rob screenshot
    await supabase.from('posts').update({ status: 'processing' }).eq('id', post.id);
    await processPost(post, browser);
} else {
    // Brak postow do procesowania
    process.stdout.write('.');
    await sleep(60000); // sprawdzaj co minute zamiast co 5 sekund
}
```

**Wazne:** Polling co 60 sekund zamiast co 5 sekund - mniej requestow do Supabase, mniej obciazenia.

## Krok 5.2: Screenshot bot - grupowanie screenshotow

Zamiast robic screenshot natychmiast po znalezieniu 1 postu, zbierz kilka i zrob je w jednej "sesji" (jak czlowiek ktory wraca do kilku postow):

```javascript
// Zbierz gotowe posty (max 5 na raz)
const { data: readyPosts } = await supabase
    .from('posts')
    .select('*')
    .eq('status', 'new')
    .order('scraped_at', { ascending: true })
    .limit(5);

// Filtruj tylko te ktore przeczekaly wymagany delay
const postsToProcess = readyPosts.filter(post => {
    const timeSince = Date.now() - new Date(post.scraped_at).getTime();
    const minDelay = 15 * 60 * 1000;
    return timeSince >= minDelay;
});

if (postsToProcess.length >= 2 || /* lub minelo > 2h od najstarszego */) {
    // Uruchom przegladarke, zrob rozgrzewke, zrob screeny, zamknij
    for (const post of postsToProcess) {
        await processPost(post, browser);
        // Przerwa miedzy screenshotami: 30-120 sekund
        await sleep(30000 + Math.random() * 90000);
    }
}
```

---

# ETAP 6: Wzorce nawigacji i zachowania

## Krok 6.1: Rotacja kolejnosci grup

**Plik: `fb-scanner-bot.js`**

Zamiast skanowac grupy w stalej kolejnosci lub losowo jednej:

```javascript
// W kazdej sesji losowo wybierz 1-2 grupy (nie zawsze wszystkie 3)
function selectGroupsForSession(allGroups) {
    const shuffled = [...allGroups].sort(() => Math.random() - 0.5);
    const count = Math.random() < 0.6 ? 1 : 2; // 60% szans: 1 grupa, 40%: 2 grupy
    return shuffled.slice(0, count);
}
```

## Krok 6.2: Zroznicowanie dlugosci sesji

**Plik: `config/scraper.json`**

```json
"maxPostsPerSession": {
    "shortSession": { "min": 3, "max": 6,  "probability": 0.3 },
    "normalSession": { "min": 7, "max": 12, "probability": 0.5 },
    "longSession":   { "min": 13, "max": 18, "probability": 0.2 }
}
```

**Implementacja w `fb-scanner-bot.js`:**
```javascript
function getMaxPostsForSession() {
    const roll = Math.random();
    if (roll < 0.3) {
        // Krotka sesja (30%) - "sprawdzam szybko co nowego"
        return 3 + Math.floor(Math.random() * 4);  // 3-6
    } else if (roll < 0.8) {
        // Normalna sesja (50%) - "przegladam grupe"
        return 7 + Math.floor(Math.random() * 6);  // 7-12
    } else {
        // Dluga sesja (20%) - "mam czas, czytam wszystko"
        return 13 + Math.floor(Math.random() * 6); // 13-18
    }
}
```

## Krok 6.3: Micro-interakcje z trescia (hover na reakcjach)

**Plik: `lib/human-behavior.js`** - dodac nowa funkcje:

```javascript
async function simulateContentEngagement(page, postElement) {
    // 10% szans: najedz mysza na przycisk reakcji (hover bez kliknięcia)
    if (Math.random() < 0.10) {
        try {
            const likeButton = await postElement.$('[aria-label*="Lubię"], [aria-label*="Like"]');
            if (likeButton) {
                const box = await likeButton.boundingBox();
                if (box) {
                    await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
                    await new Promise(r => setTimeout(r, 800 + Math.random() * 1500)); // hover 0.8-2.3s
                    // Odjedz mysza bez klikania
                    await page.mouse.move(box.x + 100, box.y + 50);
                }
            }
        } catch (e) { /* ignoruj */ }
    }

    // 8% szans: najedz na zdjecie profilowe autora
    if (Math.random() < 0.08) {
        try {
            const avatar = await postElement.$('image, img[alt]');
            if (avatar) {
                const box = await avatar.boundingBox();
                if (box) {
                    await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
                    await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
                    await page.mouse.move(box.x - 50, box.y + 30);
                }
            }
        } catch (e) { /* ignoruj */ }
    }
}
```

Wywolywac w scannerze po przetworzeniu kazdego posta.

## Krok 6.4: Symulacja `visibilitychange` (zmiana taba)

**Plik: `lib/human-idle-behaviors.js`** - dodac nowa akcje idle:

```javascript
async tabSwitch(page) {
    // Symuluj przejscie na inny tab i powrot
    // Facebook nasluchuje visibilitychange - konto ktore NIGDY nie traci focusu jest podejrzane
    try {
        await page.evaluate(() => {
            Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true });
            Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true, configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));
        });

        // "Nieobecny" 5-30 sekund
        await new Promise(r => setTimeout(r, 5000 + Math.random() * 25000));

        await page.evaluate(() => {
            Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
            Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true, configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));
        });
    } catch (e) { /* ignoruj */ }
}
```

Wywolywac losowo w trakcie sesji:
- Co 5-10 minut sesji: 40% szans na `tabSwitch()`

## Krok 6.5: Referrer chain - nawigacja PRZEZ facebook.com

**Plik: `fb-scanner-bot.js`**

Zamiast bezposrednio wchodzic na URL grupy:

```javascript
// BYLO:
await page.goto(groupUrl, { waitUntil: 'networkidle2' });

// JEST:
// Warmup juz nas umieszcza na facebook.com
// Teraz nawiguj do grupy przez klikniecie lub wpis w URL bar
// (goto z facebook.com ma prawidlowy referrer)
await page.goto(groupUrl, {
    waitUntil: 'networkidle2',
    referer: 'https://www.facebook.com/'
});
```

---

# ETAP 7: Dywersyfikacja godzin i break-in period

## Krok 7.1: Szerszy zakres godzin startu

**Plik: `config/scraper.json`**

```json
"activeHours": {
    "enabled": true,
    "strategy": "randomized",
    "startRange": {
        "min": "07:30",
        "max": "09:30"
    },
    "endRange": {
        "min": "16:30",
        "max": "18:30"
    },
    "peakHours": [
        { "start": 9, "end": 11, "activityMultiplier": 1.3 },
        { "start": 13, "end": 15, "activityMultiplier": 1.2 }
    ]
}
```

**Zmiany wzgledem oryginalu:**
- Zakres startu: 7:30-9:30 (bylo 7:56-8:17) - roznica 2h zamiast 20min
- Zakres konca: 16:30-18:30 (bylo 17:49-18:21) - roznica 2h zamiast 30min
- Usunieto peak 19-21 (wieczorny) - bot nie powinien dzialac wieczorem, to czas dla ludzi
- Zmniejszono multiplier z 1.5 na 1.3 (mniej agresywne przyspieszanie)

## Krok 7.2: Weekendy - bot OFF

**Plik: `config/scraper.json`**

```json
"workingDays": {
    "enabled": true,
    "days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
    "weekendReduction": 0
}
```

**Zmiana:** Usuniety `saturday`, `weekendReduction: 0` (wylaczony calkowicie). W weekendy konto uzywa TYLKO czlowiek z telefonu.

## Krok 7.3: Break-in period (stopniowe zwiększanie aktywnosci)

**Nowy plik: `lib/break-in-manager.js`**

```javascript
// lib/break-in-manager.js
// Zarzadza stopniowym zwiekszaniem aktywnosci bota na nowej maszynie.
// Pierwszy tydzien bot pracuje na zwolnionych obrotach.

const fs = require('fs');
const path = require('path');

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
```

**Integracja w `fb-scanner-bot.js`:**
```javascript
const BreakInManager = require('./lib/break-in-manager');
const breakIn = new BreakInManager(scannerAccount.paths.learning || './learning-data');

// Przed sesja:
const status = breakIn.getStatus();
console.log(`📊 Break-in: dzien ${status.daysSinceFirstRun}, faza: ${status.phase}, mnoznik: ${status.activityMultiplier}`);

// Uzyj breakIn.getMaxPostsForDay() zamiast CONFIG.safety.maxPostsPerSession
const maxPosts = Math.min(getMaxPostsForSession(), breakIn.getMaxPostsForDay());
```

## Krok 7.4: Interwaly miedzy sesjami - wiekszy rozrzut

**Plik: `config/scraper.json`**

```json
"intervalMinutes": {
    "min": 25,
    "max": 75
}
```

**Zmiana:** Z 10-45 minut na 25-75 minut. Mniejsza czestotliwosc sesji = mniej podejrzane.

---

# ETAP 8: Obsluga checkpointow i alertow

## Krok 8.1: Ulepszona reakcja na checkpoint

**Plik: `lib/human-behavior.js`** - zmodyfikowac `checkBanRisk()`:

```javascript
async function handleCheckpoint(page, alertCallback) {
    console.log('🚨 CHECKPOINT WYKRYTY!');

    // 1. NIE zamykaj przegladarki natychmiast - czlowiek czyta komunikat
    await new Promise(r => setTimeout(r, 30000 + Math.random() * 30000)); // 30-60 sekund

    // 2. Zrob screenshot checkpointu (do analizy)
    try {
        const screenshotPath = `./logs/checkpoint-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`📸 Screenshot checkpointu: ${screenshotPath}`);
    } catch (e) {}

    // 3. Wyslij alert do klienta
    if (alertCallback) {
        await alertCallback({
            type: 'checkpoint',
            message: 'Facebook wyswietlil checkpoint - konto wymaga recznej weryfikacji',
            url: page.url(),
            timestamp: new Date().toISOString(),
            action: 'STOP_BOT_24H'
        });
    }

    // 4. Zwroc informacje o koniecznosci zatrzymania
    return {
        shouldStop: true,
        cooldownHours: 24,
        requiresHumanAction: true
    };
}
```

## Krok 8.2: Automatyczny cooldown po checkpoint

**Plik: `fb-scanner-bot.js`** - dodac obsluge cooldownu:

```javascript
// Po wykryciu checkpointu:
const checkpoint = await handleCheckpoint(page, async (alert) => {
    // Zapisz alert do Supabase
    await supabase.from('bot_alerts').insert(alert);
    // Opcjonalnie: webhook do Slacka/emaila klienta
});

if (checkpoint.shouldStop) {
    console.log(`⛔ Bot zatrzymany na ${checkpoint.cooldownHours}h - wymagana reczna weryfikacja`);
    // Zapisz czas cooldownu
    const cooldownUntil = new Date(Date.now() + checkpoint.cooldownHours * 60 * 60 * 1000);
    fs.writeFileSync('./logs/cooldown-until.json', JSON.stringify({ until: cooldownUntil.toISOString() }));
    // Zamknij przegladarke i zakoncz
    await browser.close();
    process.exit(1); // PM2 nie powinno automatycznie restartowac
}
```

## Krok 8.3: Sprawdzanie cooldownu przy starcie

```javascript
// Na poczatku runBot():
const cooldownFile = './logs/cooldown-until.json';
if (fs.existsSync(cooldownFile)) {
    const { until } = JSON.parse(fs.readFileSync(cooldownFile, 'utf8'));
    if (new Date() < new Date(until)) {
        const remaining = Math.ceil((new Date(until) - Date.now()) / 3600000);
        console.log(`⛔ Bot w trybie cooldown - pozostalo ${remaining}h. Wymaga recznej weryfikacji checkpointu.`);
        process.exit(0);
    } else {
        // Cooldown minął - usun plik
        fs.unlinkSync(cooldownFile);
        console.log('✅ Cooldown zakonczony - wznawianie pracy');
    }
}
```

---

# ETAP 9: Zabezpieczenie CDP (Chrome DevTools Protocol)

## Krok 9.1: Dodatkowe ukrycie sladow automatyzacji

**Plik: `lib/device-fingerprint.js`** - dodac w `evaluateOnNewDocument`:

```javascript
// === CDP DETECTION EVASION ===
// Facebook moze sprawdzac slady Chrome DevTools Protocol.
// StealthPlugin obsluguje wiekszosc, ale dodajemy warstwy zabezpieczen.

// Ukryj Error.stack traces z puppeteer:
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

// Ukryj window.cdc_ (Chrome Driver marker):
for (const key of Object.keys(window)) {
    if (key.match(/^cdc_|^__webdriver/)) {
        delete window[key];
    }
}

// Ukryj Permissions API anomalie:
const originalQuery = window.navigator.permissions.query;
window.navigator.permissions.query = function(parameters) {
    if (parameters.name === 'notifications') {
        return Promise.resolve({ state: Notification.permission });
    }
    return originalQuery.call(this, parameters);
};
```

---

# Podsumowanie zmian

## Nowe pliki do utworzenia

| Plik | Opis |
|------|------|
| `accounts/main-account/config.json` | Config wspolnego konta |
| `lib/browser-lock.js` | Mechanizm lock-file - zapobiega jednoczesnej pracy dwoch botow na jednym profilu Chrome |
| `lib/session-warmup.js` | Rozgrzewka sesji (newsfeed → powiadomienia → grupa) |
| `lib/session-cooldown.js` | Schladzanie sesji (scrollowanie → powrot na feed) |
| `lib/break-in-manager.js` | Stopniowe zwiekszanie aktywnosci (tydzien rozruchowy) |

## Istniejace pliki do modyfikacji

| Plik | Zakres zmian |
|------|-------------|
| `lib/account-manager.js` | `getScannerAccount()` / `getScreenshotAccount()` fallback na `main`; `getBrowserOptions()` + `botRole`; `getChromePath()` zamiast hardcoded path |
| `lib/device-fingerprint.js` | Linux-only UA; `hardwareConcurrency` fix; Canvas/WebGL/Audio spoofing; screen vs viewport; CDP evasion; timezone/language/platform uproszczenie |
| `lib/human-behavior.js` | `simulateContentEngagement()` (hover na reakcjach); `handleCheckpoint()` ulepszone |
| `lib/human-idle-behaviors.js` | `tabSwitch()` z `visibilitychange` events |
| `fb-scanner-bot.js` | `getBrowserOptions` + `'scanner'`; integracja warmup/cooldown; `saveCookies()`; break-in manager; rotacja grup; checkpoint handling; referer chain |
| `fb-screenshot-bot.js` | `getBrowserOptions` + `'screenshot'`; `puppeteer.launch()` bugfix; opozniony start (15-90 min); `saveCookies()`; grupowanie screenshotow |
| `config/scraper.json` | Szerszy zakres godzin; weekendy OFF; wieksze interwaly (25-75 min); zroznicowane dlugosci sesji; obnizony maxPostsPerSession |

## Czynnosci na maszynie Ubuntu klienta

| Czynnosc | Komenda |
|----------|---------|
| Instalacja fontow | `sudo apt install -y fonts-liberation ttf-mscorefonts-installer fonts-noto fonts-dejavu && sudo fc-cache -fv` |
| Sprawdzenie GPU (do WebGL spoofing) | Otworzyc `chrome://gpu` w Chrome i odczytac GL_VENDOR + GL_RENDERER |
| Sprawdzenie rozdzielczosci monitora | `xrandr \| grep '*'` |
| Sprawdzenie sciezki Chrome | `which google-chrome` lub `which chromium-browser` |

## Zalecenia operacyjne dla klienta

| Zalecenie | Czestotliwosc |
|-----------|--------------|
| Zalogowac sie na konto FB z telefonu | Codziennie rano (przed botem) |
| Polajkowac 2-3 posty recznie | Codziennie |
| Napisac komentarz na FB | Co 2-3 dni |
| Wyslac wiadomosc na Messengerze | Co tydzien |
| Bot NIE dziala w weekendy | Sobota-niedziela |
| Przy checkpointcie: rozwiazac recznie z telefonu, dopiero potem wznowic bota | Natychmiast po alercie |
| Zalogowac sie na telefonie w trakcie pracy bota | Czasem (buduje wiarygodnosc "multi-device") |

## Kolejnosc wdrazania

```
ETAP 1 (KRYTYCZNY): Wspolne konto + Ubuntu path        → bez tego nie ruszy
ETAP 2 (KRYTYCZNY): Naprawa fingerprintow               → bez tego ban w dni
ETAP 3 (WYSOKI):    Canvas/WebGL/Audio spoofing          → znaczaca redukcja ryzyka
ETAP 4 (WYSOKI):    Warmup/cooldown sesji                → human-like behavior
ETAP 5 (WYSOKI):    Sekwencyjne boty + opoznienia        → eliminacja koordynacji
ETAP 6 (SREDNI):    Wzorce nawigacji + engagement         → dodatkowa ochrona
ETAP 7 (SREDNI):    Break-in period + godziny             → dlugoterminowa stabilnosc
ETAP 8 (SREDNI):    Checkpoint handling + alerty           → zapobieganie eskalacji
ETAP 9 (NISKI):     CDP evasion                            → warstwa dodatkowa
```

## Weryfikacja po wdrozeniu

1. Uruchom `fb-scanner-bot.js` - powinien zaladowac `main-account`, uzyc `browser-profile/`, cookies z `main-account/fb-session/`
2. Sprawdz logi: `Break-in: dzien 0, faza: rozruch, mnoznik: 0.2`
3. Sprawdz lock-file: podczas pracy scannera plik `accounts/main-account/browser.lock` powinien istniec; po zakonczeniu powinien zniknac
4. Sprobuj uruchomic `fb-screenshot-bot.js` PODCZAS pracy scannera - powinien odmowic startu z komunikatem o zablokowanym profilu
3. Sprawdz czy rozgrzewka dziala: bot wchodzi na facebook.com, scrolluje, dopiero potem na grupe
4. Sprawdz czy cookies sa zapisywane po sesji (plik `cookies.json` uaktualniony)
5. Uruchom `fb-screenshot-bot.js` PO scannerze - powinien czekac 15-90 min od zeskanowania postu
6. Sprawdz checkpoint handling: wejdz na `facebook.com/checkpoint` → bot powinien zrobic screenshot, wyslac alert, zatrzymac sie
7. Sprawdz Canvas fingerprint: w konsoli `document.createElement('canvas').toDataURL()` powinno zwracac rozne wartosci miedzy sesjami
8. Sprawdz UA: `navigator.userAgent` powinno zawierac `X11; Linux x86_64`
9. Sprawdz `navigator.hardwareConcurrency` - wielokrotne odczyty w jednej sesji powinny zwracac TE SAMA wartosc
10. Po 7 dniach break-in: bot powinien osiagnac pelna predkosc (mnoznik 1.0)

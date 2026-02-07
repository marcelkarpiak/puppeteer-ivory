const AccountManager = require("./lib/account-manager");
const { getChromePath } = require("./lib/account-manager");
const BrowserLock = require("./lib/browser-lock");
console.log('✅ Loaded fb-screenshot-bot.js V2 (Updated)');
require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const {
    humanDelay,
    checkBanRisk,
    handleCheckpoint,
    sleep
} = require('./lib/human-behavior');
const { warmupSession } = require('./lib/session-warmup');
const DeviceFingerprint = require('./lib/device-fingerprint');

// Konfiguracja
puppeteer.use(StealthPlugin());

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xyz.supabase.co';

// Preferuj SERVICE_ROLE_KEY dla botów (omija RLS), fallback na inne klucze
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_KEY = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY || 'xyz';

if (!SUPABASE_SERVICE_KEY) {
    console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY nie ustawiony - używam ANON_KEY (może nie działać z RLS)');
}

// 🆕 Account manager dla multi-account
const accountManager = new AccountManager();
const screenshotAccount = accountManager.getScreenshotAccount();
if (!screenshotAccount) {
    console.error("❌ Nie znaleziono konfiguracji screenshot-account");
    process.exit(1);
}
const SCREENSHOTS_DIR = path.join(__dirname, screenshotAccount.paths.screenshots);

if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const SESSION_PATH = path.join(__dirname, screenshotAccount.paths.session, 'cookies.json');
const LEARNING_PATH = path.resolve(__dirname, screenshotAccount.paths.learning || './learning-data');
if (!fs.existsSync(LEARNING_PATH)) fs.mkdirSync(LEARNING_PATH, { recursive: true });

/**
 * ETAP 8: Logowanie alertu do Supabase (tabela alerts)
 */
async function logAlert(type, message, metadata = {}) {
    try {
        await supabase.from('alerts').insert({
            type,
            message,
            metadata,
            status: 'new',
            created_at: new Date().toISOString()
        });
        console.log(`🚨 ALERT: [${type}] ${message}`);
    } catch (err) {
        console.error('⚠️ Blad zapisywania alertu:', err.message);
    }
}

/**
 * ETAP 2.7: Zapisuje cookies po kazdej sesji (odswiezanie sesji)
 */
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

/**
 * Ładuje ciasteczka (tym razem wewnątrz bota)
 */
async function loadCookiesForPage(page) {
    const cookiesPath = path.join(__dirname, screenshotAccount.paths.session, 'cookies.json');
    if (fs.existsSync(cookiesPath)) {
        const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
        if (cookies.length > 0) {
            await page.setCookie(...cookies);
            return true;
        }
    }
    return false;
}

/**
 * Przetwarza pojedyncze zadanie (post)
 */
async function processPost(post, browser, fingerprintManager, sessionFingerprint) {
    console.log(`📸 Przetwarzam post: ${post.id} (${post.post_url})`);
    const page = await browser.newPage();

    try {
        // Aplikuj fingerprint urzadzenia (UA, viewport, timezone, canvas, WebGL, audio spoofing)
        await fingerprintManager.applyFingerprint(page, sessionFingerprint);

        // navigator.webdriver: obslugiwany przez --disable-blink-features + StealthPlugin

        await loadCookiesForPage(page);

        // Walidacja URL
        if (!post.post_url || typeof post.post_url !== 'string' || !post.post_url.startsWith('http')) {
            throw new Error(`Invalid URL: ${post.post_url}`);
        }

        // Nawigacja
        await page.goto(post.post_url, { waitUntil: 'networkidle2', timeout: 60000 });
        await sleep(humanDelay('afterPageLoad'));

        // Sprawdzenie bana
        if (await checkBanRisk(page)) {
            // ETAP 8: Obsluga checkpointu jak czlowiek
            const checkpoint = await handleCheckpoint(page, async (alert) => {
                await logAlert('checkpoint', alert.message, { url: alert.url, action: alert.action });
            });
            if (checkpoint.shouldStop) {
                const cooldownUntil = new Date(Date.now() + checkpoint.cooldownHours * 60 * 60 * 1000);
                const cooldownFile = path.join(LEARNING_PATH, 'cooldown-until.json');
                fs.writeFileSync(cooldownFile, JSON.stringify({ until: cooldownUntil.toISOString() }));
                console.log(`⛔ Bot zatrzymany na ${checkpoint.cooldownHours}h - wymagana reczna weryfikacja`);
            }
            throw new Error('Ban detected - checkpoint');
        }

        // Screenshot LOCAL
        const filename = `post_${post.id}_${Date.now()}.png`;
        const filepath = path.join(SCREENSHOTS_DIR, filename);

        await page.screenshot({ path: filepath, fullPage: false });
        console.log(`   ✅ Screenshot zapisany lokalnie: ${filename}`);

        // --- UPLOAD DO SUPABASE STORAGE ---
        console.log('   ☁️ Uploading to Supabase Storage...');
        const fileContent = fs.readFileSync(filepath);
        const { data: uploadData, error: uploadError } = await supabase
            .storage
            .from('screenshots')
            .upload(filename, fileContent, {
                contentType: 'image/png',
                upsert: true
            });

        let publicUrl = filepath; // Fallback to local path w razie błędu uploadu

        if (uploadError) {
            console.error('   ⚠️ Upload failed:', uploadError.message);
        } else {
            const { data: publicUrlData } = supabase
                .storage
                .from('screenshots')
                .getPublicUrl(filename);

            publicUrl = publicUrlData.publicUrl;
            console.log('   ☁️ Upload success! Public URL:', publicUrl);
        }

        // Aktualizacja w Supabase DB - Zapisujemy PUBLICZNY URL
        const { error } = await supabase
            .from('posts')
            .update({
                status: 'done',
                screenshot_url: publicUrl,
                scraped_at: new Date().toISOString()
            })
            .eq('id', post.id);

        if (error) throw error;

    } catch (error) {
        console.error(`   ❌ Błąd przetwarzania posta ${post.id}:`, error.message);

        let errorPublicUrl = null;

        // Próba zrobienia i wysłania screenshota błędu
        try {
            const errorFilename = `error_${post.id}_${Date.now()}.png`;
            const errorFilepath = path.join(SCREENSHOTS_DIR, errorFilename);
            if (!page.isClosed()) {
                await page.screenshot({ path: errorFilepath, fullPage: false });
                console.log(`   📸 Zapisano screenshot błędu: ${errorFilename}`);

                // Upload error screenshot
                const fileContent = fs.readFileSync(errorFilepath);
                const { error: uploadError } = await supabase
                    .storage
                    .from('screenshots')
                    .upload(errorFilename, fileContent, { contentType: 'image/png' });

                if (!uploadError) {
                    const { data } = supabase.storage.from('screenshots').getPublicUrl(errorFilename);
                    errorPublicUrl = data.publicUrl;
                    console.log('   ☁️ Error screenshot uploaded:', errorPublicUrl);
                }
            }
        } catch (screenshotError) {
            console.error('   ⚠️ Nie udało się obsłużyć screenshota błędu:', screenshotError.message);
        }

        // Aktualizuj status i URL zdjęcia błędu
        await supabase
            .from('posts')
            .update({
                status: 'error',
                screenshot_url: errorPublicUrl
            })
            .eq('id', post.id);

    } finally {
        // ETAP 2.7: Zapisz cookies przed zamknieciem strony
        if (!page.isClosed()) {
            await saveCookies(page);
            await page.close();
        }
    }
}

/**
 * Główna pętla pollingu - architektura sesyjna
 * Chrome i lock sa zajmowane TYLKO na czas aktywnej pracy (warmup + screenshoty + zamkniecie).
 * Miedzy sesjami lock jest wolny - scanner moze dzialac.
 */
async function runScreenshotBot() {
    console.log('📸 Uruchamiam FB Screenshot Bot (tryb sesyjny)...');

    // ETAP 8.3: Sprawdz cooldown po checkpoincie
    const cooldownFile = path.join(LEARNING_PATH, 'cooldown-until.json');
    if (fs.existsSync(cooldownFile)) {
        try {
            const { until } = JSON.parse(fs.readFileSync(cooldownFile, 'utf8'));
            if (new Date() < new Date(until)) {
                const remaining = Math.ceil((new Date(until) - Date.now()) / 3600000);
                console.log(`⛔ Bot w trybie cooldown - pozostalo ${remaining}h. Wymaga recznej weryfikacji checkpointu.`);
                process.exit(0);
            } else {
                fs.unlinkSync(cooldownFile);
                console.log('✅ Cooldown zakonczony - wznawianie pracy');
            }
        } catch (e) {
            fs.unlinkSync(cooldownFile);
        }
    }

    console.log('   Czekam na zadania w Supabase...');

    // Opcje przegladarki przygotowane z gory (uzywane przy kazdej sesji)
    const browserOptions = accountManager.getBrowserOptions(screenshotAccount, 'screenshot', {
        executablePath: getChromePath(),
        headless: false,
        args: [
            // Flagi specyficzne dla screenshot bota (wspolne flagi sa w account-manager)
            '--window-size=1280,800'
        ]
    });

    let running = true;

    // Obsługa zamknięcia procesu
    process.on('SIGINT', () => {
        console.log('🛑 Zatrzymywanie bota...');
        running = false;
    });

    while (running) {
        try {
            // Sprawdz Supabase BEZ uruchomionej przegladarki (lekkie zapytanie)
            const { data: posts, error } = await supabase
                .from('posts')
                .select('*')
                .eq('status', 'new')
                .order('scraped_at', { ascending: true })
                .limit(5);

            if (error) {
                console.error('Błąd Supabase:', error.message);
                await sleep(5000);
                continue;
            }

            if (posts && posts.length > 0) {
                // Filtruj posty ktore przeczekaly wymagany delay (15-90 min)
                const minDelayMs = 15 * 60 * 1000;
                const maxDelayMs = 90 * 60 * 1000;
                const maxWaitMs = 2 * 60 * 60 * 1000; // 2h - nie zostawiaj postow w nieskonczonosc

                const postsToProcess = posts.filter(post => {
                    const timeSince = Date.now() - new Date(post.scraped_at).getTime();
                    const postHash = String(post.id).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
                    const targetDelay = minDelayMs + (postHash % (maxDelayMs - minDelayMs));
                    return timeSince >= targetDelay;
                });

                const oldestTimeSince = Date.now() - new Date(posts[0].scraped_at).getTime();
                const hasOldPost = oldestTimeSince >= maxWaitMs;

                if (postsToProcess.length >= 2 || hasOldPost) {
                    const batch = postsToProcess.length > 0 ? postsToProcess : [posts[0]];

                    // === SESJA: lock → Chrome → warmup → screenshoty → zamknij → zwolnij lock ===
                    const browserLock = new BrowserLock(screenshotAccount.folderPath);
                    if (!browserLock.acquire('fb-screenshot-bot')) {
                        console.log('⏳ Profil Chrome zajety przez scanner - ponawiam za 2 min...');
                        await sleep(120000);
                        continue;
                    }

                    let browser;
                    try {
                        browser = await puppeteer.launch(browserOptions);
                        console.log('🌐 Przegladarka uruchomiona');

                        // Fingerprint - generuj RAZ na cala sesje (identyczny na warmup i screenshoty)
                        const fingerprintManager = new DeviceFingerprint();
                        const sessionFingerprint = fingerprintManager.generateFingerprint();

                        // Warmup sesji z fingerprintem
                        const warmupPage = await browser.newPage();
                        await fingerprintManager.applyFingerprint(warmupPage, sessionFingerprint);
                        await loadCookiesForPage(warmupPage);
                        await warmupSession(warmupPage);
                        await saveCookies(warmupPage);
                        await warmupPage.close();

                        // Przetwarzaj batch screenshotow
                        console.log(`📦 Przetwarzam grupe ${batch.length} postow`);
                        for (let i = 0; i < batch.length; i++) {
                            const post = batch[i];
                            await supabase.from('posts').update({ status: 'processing' }).eq('id', post.id);
                            await processPost(post, browser, fingerprintManager, sessionFingerprint);

                            // Przerwa miedzy screenshotami: 30-120 sekund
                            if (i < batch.length - 1) {
                                const pauseMs = 30000 + Math.random() * 90000;
                                console.log(`   ⏸️ Przerwa ${Math.round(pauseMs / 1000)}s przed nastepnym...`);
                                await sleep(pauseMs);
                            }
                        }

                        console.log('✅ Sesja screenshotow zakonczona');
                    } finally {
                        if (browser) {
                            console.log('🔒 Zamykam przeglądarkę...');
                            await browser.close();
                        }
                        browserLock.release('fb-screenshot-bot');
                    }
                    // === KONIEC SESJI - lock zwolniony ===

                    // Po sesji: czekaj 5-15 minut przed kolejnym sprawdzeniem
                    const cooldownMs = 300000 + Math.random() * 600000;
                    console.log(`😴 Nastepne sprawdzenie za ${Math.round(cooldownMs / 60000)} min`);
                    await sleep(cooldownMs);

                } else if (postsToProcess.length === 1) {
                    const remaining = Math.ceil((maxWaitMs - oldestTimeSince) / 60000);
                    console.log(`⏳ 1 post gotowy, czekam na wiecej (lub ${remaining} min do wymuszenia)`);
                    await sleep(30000);
                } else {
                    const nextPost = posts[0];
                    const timeSince = Date.now() - new Date(nextPost.scraped_at).getTime();
                    const postHash = String(nextPost.id).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
                    const targetDelay = minDelayMs + (postHash % (maxDelayMs - minDelayMs));
                    const remaining = Math.ceil((targetDelay - timeSince) / 60000);
                    console.log(`⏳ Najblizszy post za ${remaining} min`);
                    await sleep(30000);
                }
            } else {
                // Brak postow - sprawdzaj co minute
                process.stdout.write('.');
                await sleep(60000);
            }

        } catch (err) {
            console.error('Nieoczekiwany błąd pętli:', err);
            await sleep(5000);
        }
    }
}

runScreenshotBot();

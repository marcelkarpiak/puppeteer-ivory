const AccountManager = require("./lib/account-manager");
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
    sleep
} = require('./lib/human-behavior');

// Konfiguracja
puppeteer.use(StealthPlugin());

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xyz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'xyz';

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
async function processPost(post, browser) {
    console.log(`📸 Przetwarzam post: ${post.id} (${post.post_url})`);
    const page = await browser.newPage();

    try {
        await loadCookiesForPage(page);

        // Ustawienie viewportu
        await page.setViewport({ width: 1280, height: 800 });

        // Walidacja URL
        if (!post.post_url || typeof post.post_url !== 'string' || !post.post_url.startsWith('http')) {
            throw new Error(`Invalid URL: ${post.post_url}`);
        }

        // Nawigacja
        await page.goto(post.post_url, { waitUntil: 'networkidle2', timeout: 60000 });
        await sleep(humanDelay('afterPageLoad'));

        // Sprawdzenie bana
        if (await checkBanRisk(page)) {
            throw new Error('Ban detected');
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
        if (!page.isClosed()) {
            await page.close();
        }
    }
}

/**
 * Główna pętla pollingu
 */
async function runScreenshotBot() {
    console.log('📸 Uruchamiam FB Screenshot Bot...');
    console.log('   Czekam na zadania w Supabase...');

    // 🆕 Browser isolation - użyj opcji z konta
    const browserOptions = accountManager.getBrowserOptions(screenshotAccount, {
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: false, // FALSE: mniejsza szansa na checkpoint/ban (realistyczne)
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=1280,800'
        ]
    });

    let running = true;

    // Obsługa zamknięcia procesu
    process.on('SIGINT', async () => {
        console.log('🛑 Zatrzymywanie bota...');
        running = false;
        await browser.close();
        process.exit();
    });

    while (running) {
        try {
            // Pobierz 1 post "new" lub "processing" który utknął (opcjonalne, na razie tylko "new")
            // Dla bezpieczeństwa bierzemy tylko te, które nie są 'done' ani 'error'
            const { data: posts, error } = await supabase
                .from('posts')
                .select('*')
                .eq('status', 'new')
                .limit(1);

            if (error) {
                console.error('Błąd Supabase:', error.message);
                await sleep(5000);
                continue;
            }

            if (posts && posts.length > 0) {
                const post = posts[0];

                // Oznacz jako processing, żeby inny bot nie wziął
                await supabase.from('posts').update({ status: 'processing' }).eq('id', post.id);

                await processPost(post, browser);

                // Losowa pauza po pracy
                await sleep(humanDelay('betweenActions'));
            } else {
                // Brak zadań - czekaj dłużej
                process.stdout.write('.');
                await sleep(5000);
            }

        } catch (err) {
            console.error('Nieoczekiwany błąd pętli:', err);
            await sleep(5000);
        }
    }
}

runScreenshotBot();

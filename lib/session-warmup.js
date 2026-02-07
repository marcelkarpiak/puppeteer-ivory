// lib/session-warmup.js
// ETAP 4.1: Rozgrzewka sesji - przed skanowaniem grup bot zachowuje sie
// jak czlowiek otwierajacy Facebooka (newsfeed, powiadomienia, scrollowanie).

const { humanDelay, humanClick, humanScroll, sleep } = require('./human-behavior');

/**
 * Sprawdza czy uzytkownik jest zalogowany na Facebooku.
 * Wykrywa strone logowania po URL, tytule i elementach formularza.
 * @returns {boolean} true jesli zalogowany
 */
async function checkLoginStatus(page) {
    // 1. Sprawdz URL - czy zawiera /login
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('login.php')) {
        console.log('   🔍 Wykryto URL logowania:', currentUrl);
        return false;
    }

    // 2. Sprawdz tytul strony
    const title = await page.title();
    const titleLower = title.toLowerCase();
    if (titleLower.includes('log in') || titleLower.includes('zaloguj') || titleLower.includes('log into')) {
        console.log('   🔍 Wykryto tytul strony logowania:', title);
        return false;
    }

    // 3. Sprawdz obecnosc formularza logowania
    const hasLoginForm = await page.evaluate(() => {
        const emailInput = document.querySelector('input[name="email"]');
        const loginButton = document.querySelector('#loginbutton') || document.querySelector('button[name="login"]');
        return !!(emailInput && loginButton);
    });

    if (hasLoginForm) {
        console.log('   🔍 Wykryto formularz logowania na stronie');
        return false;
    }

    return true;
}

async function warmupSession(page) {
    console.log('🔥 Rozgrzewka sesji...');

    // 1. Wejdz na strone glowna Facebooka (nie od razu na grupe)
    await page.goto('https://www.facebook.com', { waitUntil: 'networkidle2' });
    await sleep(humanDelay('afterPageLoad'));

    // Sprawdz czy uzytkownik jest zalogowany
    const isLoggedIn = await checkLoginStatus(page);
    if (!isLoggedIn) {
        console.log('⚠️ Uzytkownik NIE jest zalogowany na Facebooku!');
        return { loggedIn: false };
    }

    // 2. Scrolluj newsfeed 15-45 sekund
    const scrollDuration = 15000 + Math.random() * 30000;
    const scrollEnd = Date.now() + scrollDuration;
    while (Date.now() < scrollEnd) {
        await humanScroll(page);
        await sleep(humanDelay('betweenActions'));
    }

    // 3. 30% szans: kliknij powiadomienia
    if (Math.random() < 0.3) {
        try {
            const notifButton = await page.$('[aria-label="Powiadomienia"], [aria-label="Notifications"]');
            if (notifButton) {
                await notifButton.click();
                await sleep(humanDelay('afterPageLoad'));
                // Poczekaj 3-8 sekund "czytajac" powiadomienia
                await sleep(3000 + Math.random() * 5000);
                // Zamknij powiadomienia klikajac gdzies indziej
                await page.mouse.click(100, 300);
                await sleep(humanDelay('betweenActions'));
            }
        } catch (e) { /* ignoruj */ }
    }

    // 4. 20% szans: zatrzymaj sie na losowym poscie na feedzie
    if (Math.random() < 0.2) {
        try {
            const posts = await page.$$('[role="article"]');
            if (posts.length > 2) {
                const randomPost = posts[Math.floor(Math.random() * Math.min(posts.length, 5))];
                await randomPost.scrollIntoView();
                await sleep(humanDelay('beforeScroll'));
                // "Czytaj" post 5-15 sekund
                await sleep(5000 + Math.random() * 10000);
            }
        } catch (e) { /* ignoruj */ }
    }

    console.log('✅ Rozgrzewka zakonczona');
    return { loggedIn: true };
}

module.exports = { warmupSession };

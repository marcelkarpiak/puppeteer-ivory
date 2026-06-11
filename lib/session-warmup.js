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

    // 3. Klasyfikacja stanu strony.
    // WAZNE: zwracamy true TYLKO gdy POZYTYWNIE widac UI zalogowanego uzytkownika.
    // Dzieki temu modal zgody na cookie (ktory zaslania formularz logowania)
    // nie powoduje falszywego "zalogowany" -> bot NIE zaczyna scrollowac strony logowania.
    const status = await page.evaluate(() => {
        // Jawne markery strony/ formularza logowania -> niezalogowany
        if (document.querySelector('input[name="email"]') ||
            document.querySelector('input#email') ||
            document.querySelector('input#pass') ||
            document.querySelector('[data-testid="royal_login_form"]') ||
            document.querySelector('form[action*="login"]')) {
            return 'logged_out';
        }

        // Markery UI dostepnego dopiero PO zalogowaniu (feed, lewa nawigacja, konto)
        const loggedInUI = document.querySelector('[role="feed"]') ||
            document.querySelector('[aria-label="Strona główna"]') ||
            document.querySelector('[aria-label="Home"]') ||
            document.querySelector('[aria-label="Konto"]') ||
            document.querySelector('[aria-label="Account"]') ||
            document.querySelector('[aria-label="Twój profil"]') ||
            document.querySelector('[aria-label="Your profile"]');
        if (loggedInUI) return 'logged_in';

        // Nic pewnego (np. modal cookie zaslania DOM) -> traktuj jako niezalogowany.
        // Bezpiecznie: bot poczeka i NIE bedzie ruszal strona.
        return 'unknown';
    });

    if (status !== 'logged_in') {
        console.log(`   🔍 Strona nie jest potwierdzona jako zalogowana (${status}) — bot NIE rusza stroną`);
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
    let isLoggedIn = await checkLoginStatus(page);

    // Jesli nie - daj czas na RECZNE logowanie. Bot CZEKA i NIE rusza strona
    // (zadnego scrollowania), zeby nie przeszkadzac w wpisywaniu danych.
    if (!isLoggedIn) {
        console.log('⏸️  Nie jesteś zalogowany na Facebooku.');
        console.log('   👉 Zaloguj się RĘCZNIE w oknie Chrome (e-mail, hasło, 2FA).');
        console.log('   ⏳ Bot czeka spokojnie do 5 minut i NIE rusza stroną...');

        const loginDeadline = Date.now() + 5 * 60 * 1000; // 5 minut
        while (Date.now() < loginDeadline) {
            await sleep(4000); // poll co 4s, bez dotykania strony
            isLoggedIn = await checkLoginStatus(page);
            if (isLoggedIn) {
                console.log('✅ Wykryto zalogowanie! Daję chwilę na zapis cookies...');
                await sleep(4000); // pozwol Chrome zapisac c_user/xs na dysk
                break;
            }
        }
    }

    if (!isLoggedIn) {
        console.log('⚠️ Upłynął limit czasu na logowanie — sesja przerwana.');
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

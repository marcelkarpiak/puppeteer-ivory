// lib/session-warmup.js
// ETAP 4.1: Rozgrzewka sesji - przed skanowaniem grup bot zachowuje sie
// jak czlowiek otwierajacy Facebooka (newsfeed, powiadomienia, scrollowanie).

const { humanDelay, humanClick, humanScroll, sleep } = require('./human-behavior');

async function warmupSession(page) {
    console.log('🔥 Rozgrzewka sesji...');

    // 1. Wejdz na strone glowna Facebooka (nie od razu na grupe)
    await page.goto('https://www.facebook.com', { waitUntil: 'networkidle2' });
    await sleep(humanDelay('afterPageLoad'));

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
}

module.exports = { warmupSession };

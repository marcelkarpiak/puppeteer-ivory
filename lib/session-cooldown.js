// lib/session-cooldown.js
// ETAP 4.2: Schladzanie sesji - po skanowaniu bot nie zamyka przegladarki od razu,
// tylko zachowuje sie jak czlowiek konczacy przegladanie (scroll, powrot na feed).

const { humanDelay, humanScroll, sleep } = require('./human-behavior');

async function cooldownSession(page) {
    console.log('❄️ Schladzanie sesji...');

    // 1. Zostan na stronie jeszcze 10-30 sekund
    const stayDuration = 10000 + Math.random() * 20000;
    const stayEnd = Date.now() + stayDuration;
    while (Date.now() < stayEnd) {
        if (Math.random() < 0.5) {
            await humanScroll(page);
        }
        await sleep(humanDelay('readingTime'));
    }

    // 2. 40% szans: wroc na newsfeed
    if (Math.random() < 0.4) {
        try {
            await page.goto('https://www.facebook.com', { waitUntil: 'networkidle2' });
            await sleep(humanDelay('afterPageLoad'));
            // Scrolluj 10-20 sekund
            const scrollDuration = 10000 + Math.random() * 10000;
            const scrollEnd = Date.now() + scrollDuration;
            while (Date.now() < scrollEnd) {
                await humanScroll(page);
                await sleep(humanDelay('betweenActions'));
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
                await sleep(humanDelay('afterPageLoad'));
                await sleep(3000 + Math.random() * 7000);
                await page.goBack();
            }
        } catch (e) { /* ignoruj */ }
    }

    console.log('✅ Schladzanie zakonczone');
}

module.exports = { cooldownSession };

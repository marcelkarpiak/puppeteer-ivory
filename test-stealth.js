const { connect } = require('puppeteer-real-browser');

(async () => {
    console.log('Testing puppeteer-real-browser stealth...');
    let browser;
    try {
        const result = await connect({
            headless: false,
            disableXvfb: true,
            connectOption: { defaultViewport: null },
        });
        browser = result.browser;
        const page = result.page;

        console.log('✅ puppeteer-real-browser launched successfully!');
        await page.goto('https://example.com');
        console.log('✅ Page loaded');

        // Sprawdź podstawowe sygnały wykrywalności
        const checks = await page.evaluate(() => ({
            webdriver: navigator.webdriver,
            chrome: !!window.chrome,
            languages: navigator.languages.length,
        }));
        console.log('🔍 Detection checks:', checks);
        console.log(checks.webdriver === false || checks.webdriver === undefined
            ? '✅ navigator.webdriver nie wykryty'
            : '⚠️ navigator.webdriver = true');

    } catch (e) {
        console.error('❌ Test failed:', e.message);
    } finally {
        if (browser) await browser.close();
    }
})();

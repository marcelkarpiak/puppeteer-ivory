const { connect } = require('puppeteer-real-browser');
const { getChromePath } = require('./lib/account-manager');

(async () => {
    console.log('Testing SYSTEM CHROME z puppeteer-real-browser...');
    let browser;
    try {
        const result = await connect({
            headless: false,
            disableXvfb: true,
            customConfig: {
                chromePath: getChromePath(),
            },
            connectOption: { defaultViewport: null },
        });
        browser = result.browser;
        const page = result.page;

        console.log('✅ SYSTEM CHROME launched successfully!');
        console.log('   Chrome path:', getChromePath());
        await page.goto('https://example.com');
        console.log('✅ Page loaded');
        await sleep(2000);

    } catch (e) {
        console.error('❌ SYSTEM CHROME failed:', e.message);
    } finally {
        if (browser) await browser.close();
    }
})();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const AccountManager = require("./lib/account-manager");
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const {
    humanDelay,
    humanScroll,
    humanClick,
    checkBanRisk,
    sleep
} = require('./lib/human-behavior');
const SessionManager = require('./lib/session-manager');
const DeviceFingerprint = require('./lib/device-fingerprint');
const HumanIdleBehaviors = require('./lib/human-idle-behaviors');
const ProxyRotation = require('./lib/proxy-rotation');
const HumanErrorSimulation = require('./lib/human-error-simulation');
const CacheManager = require('./lib/cache-manager');
const BehavioralLearning = require('./lib/behavioral-learning');
const RiskPrediction = require('./lib/risk-prediction');
const StatefulScanner = require('./lib/stateful-scanner');
const FaultTolerance = require('./lib/fault-tolerance');
const DistributedCoordinator = require('./lib/distributed-coordinator');

// Supabase client
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'your-anon-key';
const supabase = createClient(supabaseUrl, supabaseKey);

// Konfiguracja
puppeteer.use(StealthPlugin());

const CONFIG = require('./config/scraper.json');
const KEYWORDS = require('./config/keywords.json');

// Dynamic paths from account manager
const accountManager = new AccountManager();
const scannerAccount = accountManager.getScannerAccount();
if (!scannerAccount) {
    console.error("❌ Nie znaleziono konfiguracji scanner-account");
    process.exit(1);
}
const SESSION_PATH = path.join(__dirname, scannerAccount.paths.session, 'cookies.json');

/**
 * Losuje grupę docelową z dostępnej puli
 */
function getRandomGroup() {
    if (CONFIG.groups && CONFIG.groups.length > 0) {
        const randomIndex = Math.floor(Math.random() * CONFIG.groups.length);
        return CONFIG.groups[randomIndex];
    }
    // Fallback do starej konfiguracji
    return CONFIG.group;
}

/**
 * Ładuje ciasteczka z pliku
 */
async function loadCookies(page) {
    if (fs.existsSync(SESSION_PATH)) {
        const cookies = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
        if (cookies.length > 0) {
            await page.setCookie(...cookies);
            console.log(`🍪 Załadowano ${cookies.length} ciasteczek.`);
            return true;
        }
    }
    console.log('⚠️ Brak ciasteczek sesji. Bot może zostać przekierowany do logowania.');
    return false;
}

/**
 * Sprawdza czy tekst zawiera słowa kluczowe
 */
function matchKeywords(text) {
    if (!text) return { matched: false, keywords: [] };

    const lowerText = text.toLowerCase();
    const foundKeywords = [];
    let categoryMatch = null;

    for (const [category, data] of Object.entries(KEYWORDS.categories)) {
        for (const keyword of data.keywords) {
            if (lowerText.includes(keyword.toLowerCase())) {
                foundKeywords.push(keyword);
                if (!categoryMatch) categoryMatch = category;
            }
        }
    }

    return {
        matched: foundKeywords.length > 0,
        keywords: foundKeywords,
        category: categoryMatch
    };
}

/**
 * Wysyła dane do n8n
 */
async function sendToN8n(data) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(CONFIG.n8n.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
            console.log('   ✅ Wysłano do n8n!');
            return true;
        } else {
            console.log(`   ⚠️ n8n zwrócił błąd: ${response.status}`);
            return false;
        }
    } catch (error) {
        console.error(`   ❌ Błąd wysyłania do n8n: ${error.message}`);
        return false;
    }
}

/**
 * Logika scrapowania dla Reddita (Mock Mode)
 */
async function scrapeReddit(page) {
    console.log('🤖 Tryb MOCK: Scrapowanie Reddita...');

    await humanScroll(page);

    const posts = await page.$$('div.thing.link');
    console.log(`🔎 Znaleziono ${posts.length} potencjalnych postów.`);

    let processedCount = 0;

    for (const postHandle of posts) {
        if (processedCount >= CONFIG.safety.maxPostsPerSession) break;

        const data = await page.evaluate(el => {
            const titleEl = el.querySelector('a.title');
            const authorEl = el.querySelector('a.author');
            const timeEl = el.querySelector('time');
            return {
                title: titleEl ? titleEl.innerText : '',
                url: titleEl ? titleEl.href : '',
                author: authorEl ? authorEl.innerText : 'unknown',
                postedAt: timeEl ? timeEl.getAttribute('datetime') : new Date().toISOString()
            };
        }, postHandle);

        const textToAnalyze = data.title; // Na liście reddita głównie tytuły
        const matchResult = matchKeywords(textToAnalyze);

        if (matchResult.matched) {
            console.log(`   🎯 TRAFIENIE: "${data.title.substring(0, 30)}..." [${matchResult.keywords.join(', ')}]`);

            await sendToN8n({
                source: 'Reddit Mock',
                ...data,
                matchedKeywords: matchResult.keywords,
                category: matchResult.category,
                scrapedAt: new Date().toISOString()
            });
            processedCount++;
        }

        // Małe opóźnienie między przetwarzaniem elementów DOM (symulacja czytania)
        if (Math.random() > 0.8) await sleep(500);
    }
}

/**
 * Logika scrapowania dla Facebooka
 */
async function scrapeFacebook(page, targetGroup = null) {
    const groupName = targetGroup ? targetGroup.name : CONFIG.group.name;
    console.log('👤 Tryb LIVE: Scrapowanie Facebooka...');
    
    // Inicjalizuj zachowania bezczynności
    const idleBehaviors = new HumanIdleBehaviors(page);
    const errorSimulation = new HumanErrorSimulation(page);
    const cacheManager = new CacheManager('./cache');
    const behavioralLearning = new BehavioralLearning('./learning-data');
    const riskPrediction = new RiskPrediction();
    const statefulScanner = new StatefulScanner(supabase, CONFIG);
    const faultTolerance = new FaultTolerance(CONFIG.faultTolerance || {});

    // 1. Inicjalizuj Stateful Scanner
    try {
        await statefulScanner.initialize(groupName);
    } catch (e) {
        console.error('❌ Błąd inicjalizacji Stateful Scanner:', e);
        console.log('⚠️ Kontynuowanie bez stateful scanning...');
    }

    // 2. Czekaj na feed i zrób wstępny scroll z Fault Tolerance
    await faultTolerance.executeWithRetry(async () => {
        try {
            await page.waitForSelector('[role="feed"]', { timeout: 15000 });
            console.log('   ✅ Feed znaleziony');
        } catch (e) {
            console.log('⚠️ Nie znaleziono feedu (timeout). Sprawdzam bana...');
            if (await checkBanRisk(page)) throw new Error('Ban detected');
        }
    }, 'feed_detection', { groupName });

    // 2. Wykonaj losową ścieżkę nawigacji
    await performRandomNavigation(page);

    // 3. Scrolluj żeby załadować posty
    await humanScroll(page);
    await sleep(2000);

    // 3. Pobierz posty
    const particleHandles = await page.$$('[role="article"]');
    console.log(`   🔎 Znaleziono ${particleHandles.length} elementów (postów/reklam).`);

    let processedCount = 0;
    const maxPosts = typeof CONFIG.safety.maxPostsPerSession === 'object' 
        ? Math.floor(Math.random() * (CONFIG.safety.maxPostsPerSession.max - CONFIG.safety.maxPostsPerSession.min + 1)) + CONFIG.safety.maxPostsPerSession.min
        : CONFIG.safety.maxPostsPerSession;

    console.log(`   🎯 Limit postów na sesję: ${maxPosts}`);
    
    // Resetuj statystyki Stateful Scanner
    statefulScanner.resetSessionStats();

    // Przetwarzaj posty z Stateful Scanning
    for (const postHandle of particleHandles) {
        if (processedCount >= maxPosts) {
            console.log(`   🛑 Osiągnięto limit postów na sesję: ${maxPosts}.`);
            break;
        }

        // Losowe zachowanie bezczynności między postami
        await idleBehaviors.performIdleAction();
        
        // Symuluj ludzkie błędy
        await errorSimulation.simulateHumanErrors();
        
        // Rejestruj akcję w systemie uczenia się
        behavioralLearning.recordAction('process_post', { 
            postIndex: processedCount,
            timestamp: Date.now()
        });

        try {
            // Ekstrakcja danych w kontekście strony
            const postData = await page.evaluate(el => {
                // Helper do szukania tekstu wewnątrz elementu
                const getText = (selector) => {
                    const node = el.querySelector(selector);
                    return node ? node.innerText : '';
                };

                // --- AUTOR ---
                let author = 'Nieznany';
                let authorUrl = '';

                // 1. Szukanie linku profilowego (najlepsza metoda)
                const profileLink = Array.from(el.querySelectorAll('a')).find(a => {
                    const href = a.href;
                    const isProfile = (href.includes('/user/') || href.includes('/groups/')) &&
                        !href.includes('/posts/') &&
                        !href.includes('/permalink/') &&
                        !href.includes('/photo');

                    return isProfile && (a.innerText.length > 2);
                });

                if (profileLink) {
                    authorUrl = profileLink.href;
                    author = profileLink.innerText.split('\n')[0].trim();
                }

                // 2. Fallback: Szukanie w nagłówkach
                if (author === 'Nieznany' || !author) {
                    const headerStrong = el.querySelector('strong');
                    if (headerStrong) {
                        author = headerStrong.innerText;
                    }
                }

                // 3. Fallback: Aria-labels
                if (author === 'Nieznany') {
                    const ariaElement = el.querySelector('[aria-label]');
                    if (ariaElement && ariaElement.getAttribute('aria-label').length < 50) {
                        author = ariaElement.getAttribute('aria-label');
                    }
                }

                // 4. Fallback ostateczny: Pierwsza linia tekstu
                if (author === 'Nieznany') {
                    const contentText = el.innerText || '';
                    const firstLine = contentText.split('\n')[0].trim();
                    if (firstLine.length > 3 && firstLine.length < 30 && !/\d/.test(firstLine)) {
                        author = firstLine;
                    }
                }

                // --- TREŚĆ ---
                const contentNode = el.querySelector('[data-ad-comet-preview="message"]');
                const content = contentNode ? contentNode.innerText : (el.innerText || '');

                // --- URL POSTA & DATA ---
                const permalinkNode = Array.from(el.querySelectorAll('a')).find(a =>
                    a.href.includes('/posts/') || a.href.includes('/permalink/')
                );

                const url = permalinkNode ? permalinkNode.href : '';
                const postedAt = permalinkNode ? permalinkNode.innerText : new Date().toISOString();

                // ID posta (z URL)
                let externalId = '';
                if (url) {
                    const match = url.match(/\/posts\/(\d+)/) || url.match(/\/permalink\/(\d+)/);
                    if (match) externalId = match[1];
                }

                return {
                    title: content.substring(0, 50) + '...',
                    textContent: content,
                    url: url,
                    externalId: externalId,
                    author: author,
                    authorUrl: authorUrl,
                    postedAtRaw: postedAt
                };
            }, postHandle);

            // Walidacja - czy to faktycznie post
            if (!postData.textContent || postData.textContent.length < 5) {
                continue;
            }
            if (!postData.url || !postData.externalId) {
                continue;
            }

            // Stateful Scanning - przetwarzaj post z Fault Tolerance
            const result = await faultTolerance.executeWithRetry(async () => {
                return await statefulScanner.processPost(
                    groupName, 
                    postData.externalId, 
                    postData, 
                    async (data) => {
                        // Analiza słów kluczowych
                        const matchResult = matchKeywords(data.textContent);

                        if (matchResult.matched) {
                            console.log(`   🎯 TRAFIENIE: [${data.author}] "${data.title}"`);
                            console.log(`      Keywords: ${matchResult.keywords.join(', ')}`);

                            // Wyślij do n8n z Fault Tolerance
                            await faultTolerance.executeWithRetry(async () => {
                                await sendToN8n({
                                    source: 'Facebook Group',
                                    groupName: groupName,
                                    ...data,
                                    post_url: data.url,
                                    content: data.textContent,
                                    matchedKeywords: matchResult.keywords,
                                    category: matchResult.category,
                                    scrapedAt: new Date().toISOString()
                                });
                            }, 'send_to_n8n', { postId: data.externalId });

                            // Symuluj czytanie po znalezieniu
                            await idleBehaviors.simulateReading(2000);
                            
                            // Losowy błąd po znalezieniu (ekscytacja?)
                            await errorSimulation.simulateRandomError();
                            
                            // Rejestruj sukces w systemie uczenia się
                            behavioralLearning.recordSuccess('keyword_match', {
                                keywords: matchResult.keywords,
                                category: matchResult.category
                            });
                            
                            return true; // Sukces
                        }
                        
                        return false; // Nie znaleziono keywordów
                    }
                );
            }, 'process_post', { postId: postData.externalId });

            if (result.shouldStop) {
                console.log(`   🛑 Zatrzymano skanowanie po ${result.consecutiveKnown} znanych postach`);
                break;
            }

            if (result.isNew) {
                processedCount++;
            }

        } catch (err) {
            console.error('   ❌ Błąd przetwarzania posta:', err.message);
        }

        // Losowe zachowanie co kilka postów
        if (processedCount > 0 && processedCount % 3 === 0) {
            await idleBehaviors.simulateThinking();
        }
    }

    // Pokaż końcowe statystyki Stateful Scanner
    const sessionReport = statefulScanner.generateSessionReport(groupName);
    console.log(`   ${sessionReport}`);
    
    // Pokaż status Fault Tolerance
    const faultStatus = faultTolerance.getSystemStatus();
    console.log(`   🛡️ Fault Tolerance: ${faultStatus.health.isHealthy ? '✅ Healthy' : '❌ Issues'} | Recoveries: ${faultStatus.recovery.totalRecoveries}`);
    
    // Oblicz i pokaż ryzyko sesji
    const sessionData = {
        postsProcessed: processedCount,
        sessionDuration: Date.now() - behavioralLearning.currentSession.startTime,
        actionSpeed: behavioralLearning.currentSession.actions.length > 0 ? 
            (Date.now() - behavioralLearning.currentSession.startTime) / behavioralLearning.currentSession.actions.length : 0
    };
    
    const riskScore = riskPrediction.calculateRiskScore(sessionData);
    const riskReport = riskPrediction.getRiskReport();
    
    console.log(`   🚨 Wynik ryzyka: ${(riskScore * 100).toFixed(1)}% (${riskReport.riskLevel})`);
    
    if (riskReport.alerts.length > 0) {
        console.log(`   ⚠️ Alerty: ${riskReport.alerts.map(a => a.message).join(', ')}`);
    }
    
    // Zakończ sesję uczenia się
    behavioralLearning.endSession(true, false);
    
    // Pokaż statystyki uczenia się
    const learningStats = behavioralLearning.getLearningStats();
    console.log(`   🧠 Statystyki uczenia: ${learningStats.sessions} sesji, ${(learningStats.successRate * 100).toFixed(1)}% success rate`);
    
    // Zastosuj działania mitigacyjne jeśli potrzebne
    if (riskReport.mitigationActions.length > 0) {
        console.log(`   🛡️ Działania mitigacyjne: ${riskReport.mitigationActions.map(a => a.description).join(', ')}`);
    }
}

/**
 * Wykonuje losową ścieżkę nawigacji w grupie
 */
async function performRandomNavigation(page) {
    const paths = [
        // Ścieżka 1: Przeglądaj posty
        async () => {
            console.log('   🛤️ Ścieżka: Przeglądanie postów');
            await humanScroll(page);
            await sleep(humanDelay('readingTime'));
        },
        
        // Ścieżka 2: Sprawdź członków
        async () => {
            console.log('   🛤️ Ścieżka: Sprawdzanie członków');
            try {
                const membersLink = await page.$('a[href*="members"]');
                if (membersLink) {
                    await humanClick(page, 'a[href*="members"]');
                    await sleep(2000);
                    await humanScroll(page);
                    await sleep(1000);
                    // Wróć do głównego feedu
                    await page.goBack();
                    await sleep(1000);
                }
            } catch (e) {
                console.log('   ⚠️ Nie udało się sprawdzić członków');
            }
        },
        
        // Ścieżka 3: Przeglądaj z zakładką "About"
        async () => {
            console.log('   🛤️ Ścieżka: Sprawdzanie informacji o grupie');
            try {
                const aboutLink = await page.$('a[href*="about"]');
                if (aboutLink) {
                    await humanClick(page, 'a[href*="about"]');
                    await sleep(2000);
                    await humanScroll(page);
                    await sleep(1000);
                    await page.goBack();
                    await sleep(1000);
                }
            } catch (e) {
                console.log('   ⚠️ Nie udało się sprawdzić informacji o grupie');
            }
        },
        
        // Ścieżka 4: Losowe scrollowanie w różnych miejscach
        async () => {
            console.log('   🛤️ Ścieżka: Losowe eksplorowanie');
            for (let i = 0; i < 3; i++) {
                await humanScroll(page);
                if (Math.random() > 0.5) {
                    await sleep(humanDelay('readingTime'));
                }
            }
        }
    ];

    // Wybierz losową ścieżkę
    const randomPath = paths[Math.floor(Math.random() * paths.length)];
    await randomPath();
}

/**
 * Główna funkcja bota z distributed architecture
 */
async function runBot() {
    console.log('🚀 Uruchamianie Facebook Bot v2.0 z Distributed Architecture...');
    
    // Inicjalizuj Distributed Coordinator
    const coordinator = new DistributedCoordinator(CONFIG.distributed || {});
    await coordinator.initialize();
    
    const sessionManager = new SessionManager(CONFIG);
    let running = true;
    
    // Obsługa zamknięcia procesu
    process.on('SIGINT', async () => {
        console.log('🛑 Zatrzymywanie bota...');
        running = false;
        await coordinator.shutdown();
        process.exit();
    });

    while (running) {
        try {
            
            // Losuj grupę docelową
            const targetGroup = getRandomGroup();
            console.log(`🎯 Sesja: ${targetGroup.name} (${targetGroup.url})`);

            // Użyj distributed coordinator do wykonania zadania
            if (coordinator.isCoordinator) {
                // Jako koordynator, rozdziel zadanie
                const task = {
                    type: 'scrape_group',
                    targetGroup: targetGroup,
                    priority: 'normal',
                    metadata: {
                        timestamp: Date.now(),
                        instanceId: coordinator.instanceId
                    }
                };
                
                await coordinator.distributeTask(task);
            } else {
                // Jako worker, wykonaj zadanie lokalnie
                await runSingleSession(targetGroup, coordinator);
            }

            // Czekaj losowy czas między sesjami
            if (running) {
                await sessionManager.waitForInterval('między sesjami');
            }

        } catch (error) {
            console.error('❌ Błąd w pętli sesji:', error);
            // Krótkie oczekiwanie po błędzie przed próbą ponowną
            await sleep(30000); // 30 sekund
        }
        
        // Pokaż statystyki co 10 sesji
        if (Math.random() < 0.1) { // 10% szans
            const stats = coordinator.getSystemStats();
            console.log(`📊 Distributed Stats: ${stats.instances.length} instances, ${stats.tasks.successRate} success rate`);
        }
    }
}

/**
 * Uruchamia pojedynczą sesję scrapowania
 */
async function runSingleSession(targetGroup, coordinator = null) {
    let browser;
    const fingerprintManager = new DeviceFingerprint();
    const proxyManager = new ProxyRotation(CONFIG.proxy);
    
    try {
        // Generuj losowy fingerprint dla tej sesji
        const fingerprint = fingerprintManager.generateFingerprint();
        
        // Pobierz proxy (jeśli włączone)
        const proxy = CONFIG.proxy.enabled ? proxyManager.getNextProxy() : null;
        
        // Konfiguruj opcje Puppeteer z proxy
        let puppeteerOptions = {
            executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            headless: false,
            args: [
                '--disable-infobars',
                '--window-position=0,0',
                '--ignore-certificate-errors',
                '--ignore-certificate-errors-spki-list',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
            ]
        };

        if (CONFIG.proxy.enabled) {
            puppeteerOptions = await proxyManager.configurePuppeteerWithProxy(puppeteerOptions, proxy);
        }

        // 🆕 Browser isolation - użyj opcji z konta
        const browserOptions = accountManager.getBrowserOptions(scannerAccount, puppeteerOptions);
        browser = await puppeteer.launch(browserOptions);
        const page = await browser.newPage();

        // Aplikuj fingerprint urządzenia
        await fingerprintManager.applyFingerprint(page, fingerprint);

        // Ustaw losowe headers
        const randomHeaders = proxyManager.getRandomHeaders();
        await page.setExtraHTTPHeaders(randomHeaders);

        // Symuluj warunki sieciowe
        if (CONFIG.proxy.networkConditions) {
            await proxyManager.simulateNetworkConditions(page, CONFIG.proxy.networkConditions);
        }

        // Dodatkowe ukrycie WebDriver
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            delete navigator.__proto__.webdriver;
            delete window.chrome.runtime;
        });

        // Testuj proxy (jeśli włączone i skonfigurowane)
        if (CONFIG.proxy.enabled && proxy && CONFIG.proxy.testOnStartup) {
            const proxyWorks = await proxyManager.testProxy(browser, proxy);
            if (!proxyWorks) {
                proxyManager.markProxyFailed(proxy);
                throw new Error(`Proxy test failed: ${proxy}`);
            }
        }

        // Załaduj cookies
        await loadCookies(page);

        // Wejdź na stronę
        console.log(`🔗 Nawigacja do: ${targetGroup.url}`);
        if (proxy) {
            console.log(`🌐 Używam proxy: ${proxy}`);
        }
        
        await page.goto(targetGroup.url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Losowe opóźnienie "rozruchowe"
        await sleep(humanDelay('afterPageLoad'));

        // Wybór trybu
        if (targetGroup.isMock || targetGroup.url.includes('reddit')) {
            await scrapeReddit(page);
        } else {
            await scrapeFacebook(page, targetGroup);
        }

        console.log('✅ Sesja zakończona sukcesem');

    } catch (error) {
        console.error('❌ Błąd sesji:', error);
        
        // Oznacz proxy jako niedziałające jeśli błąd sieciowy
        if (CONFIG.proxy.enabled && error.message.includes('proxy') || error.message.includes('timeout')) {
            const proxy = proxyManager.getNextProxy();
            proxyManager.markProxyFailed(proxy);
        }
        
    } finally {
        if (browser) {
            console.log('🔒 Zamykam przeglądarkę...');
            await browser.close();
        }
    }
}

// Uruchomienie i obsługa błędów top-level
runBot().catch(err => {
    console.error('❌ Nieobsłużony błąd (Top Level):', err);
});

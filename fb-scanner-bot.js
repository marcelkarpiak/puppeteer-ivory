const os = require('os'); // Added for hostname

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

// Supabase client - używamy SERVICE_ROLE_KEY dla botów (omija RLS)
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Preferuj SERVICE_ROLE_KEY dla botów (omija RLS), fallback na ANON_KEY
const supabaseKey = supabaseServiceKey || supabaseAnonKey;
if (!supabaseServiceKey) {
    console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY nie ustawiony - używam ANON_KEY (może nie działać z RLS)');
}
const supabase = createClient(supabaseUrl, supabaseKey);

// Konfiguracja
puppeteer.use(StealthPlugin());

const CONFIG = require('./config/scraper.json');
const KEYWORDS_JSON = require('./config/keywords.json'); // Fallback

// Cache dla danych z bazy (odświeżane co sesję)
let dbGroups = null;
let dbKeywords = null;
let dbUserId = null; // ID użytkownika (admina) do przypisywania postów

// Dynamic paths from account manager
const accountManager = new AccountManager();
const scannerAccount = accountManager.getScannerAccount();
if (!scannerAccount) {
    console.error("❌ Nie znaleziono konfiguracji scanner-account");
    process.exit(1);
}
const SESSION_PATH = path.join(__dirname, scannerAccount.paths.session, 'cookies.json');

// Globalne zmienne dla monitorowania
let botInstanceId = null;
let heartbeatInterval = null;
const BOT_NAME = `FB-Scanner-${os.hostname()}`;
let postsProcessedToday = 0;

/**
 * Rejestruje bota w bazie danych (Upsert)
 */
async function registerBot() {
    try {
        console.log(`🤖 Rejestrowanie bota: ${BOT_NAME}...`);

        // Sprawdź czy bot już istnieje (po nazwie)
        const { data: existingBot } = await supabase
            .from('bot_instances')
            .select('id, posts_today, last_heartbeat') // Pobierz posts_today aby kontynuować licznik jeśli restart był niedawno
            .eq('name', BOT_NAME)
            .single();

        let initialPostsToday = 0;

        // Jeśli bot istniał i był aktywny niedawno (< 24h), może zachowajmy licznik? 
        // Wg specyfikacji "Posts Today" powinno się resetować o północy, ale tutaj uprośćmy:
        // Przy starcie procesu resetujemy licznik sesji lokalnej, ale w bazie nadpiszemy.

        const { data, error } = await supabase
            .from('bot_instances')
            .upsert({
                name: BOT_NAME,
                type: 'scanner',
                status: 'online',
                last_heartbeat: new Date().toISOString(),
                config: CONFIG,
                // posts_today: 0 // Nie resetujmy od razu, heartbeat to nadpisze
                // user_id zostanie dodany przez RLS lub trzeba go podać jeśli Service Role (admin)
                // Używając Service Role nie musimy podawać user_id jeśli tabela pozwala na null,
                // ale w schemacie user_id jest wymagane dla RLS.
                // Jeśli używamy RLS i anon key, user_id będzie z auth.
                // Tu używamy service key, więc teoretycznie możemy pominąć lub wpisać ID admina.
                // Zobaczmy czy w 'fb-scanner-bot.js' mamy dbUserId.
                user_id: dbUserId || undefined
            }, { onConflict: 'name' }) // Zakładamy unikalność po nazwie dla uproszczenia, lub po ID jeśli to persistent
            .select()
            .single();

        if (error) throw error;

        botInstanceId = data.id;
        console.log(`✅ Zarejestrowano bota. Instance ID: ${botInstanceId}`);
        return true;
    } catch (err) {
        console.error('❌ Błąd rejestracji bota:', err.message);
        return false;
    }
}

/**
 * Uruchamia pętlę heartbeat (co 60s)
 */
function startHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);

    // Pierwszy heartbeat natychmiast
    sendHeartbeat();

    heartbeatInterval = setInterval(async () => {
        await sendHeartbeat();
    }, 60000); // 1 minuta
}

/**
 * Wysyła heartbeat do bazy
 */
async function sendHeartbeat() {
    if (!botInstanceId) return;

    try {
        const { error } = await supabase
            .from('bot_instances')
            .update({
                status: 'online',
                last_heartbeat: new Date().toISOString(),
                posts_today: postsProcessedToday
            })
            .eq('id', botInstanceId);

        if (error) console.error('⚠️ Błąd wysyłania heartbeat:', error.message);
    } catch (err) {
        console.error('⚠️ Błąd wysyłania heartbeat:', err.message);
    }
}

/**
 * Aktualizuje status bota na offline
 */
async function setBotOffline() {
    if (!botInstanceId) return;

    try {
        await supabase
            .from('bot_instances')
            .update({
                status: 'offline',
                last_heartbeat: new Date().toISOString()
            })
            .eq('id', botInstanceId);
        console.log('💤 Bot status ustawiony na offline.');
    } catch (err) {
        console.error('❌ Błąd ustawiania offline:', err.message);
    }
}

/**
 * Loguje alert do bazy danych
 * @param {string} type - 'checkpoint', 'error', 'pattern_risk', 'bot_offline'
 * @param {string} message - Treść alertu
 * @param {object} metadata - Dodatkowe dane
 */
async function logAlert(type, message, metadata = {}) {
    try {
        console.log(`🚨 LOGGING ALERT: [${type}] ${message}`);

        const alertData = {
            type,
            message,
            metadata: {
                ...metadata,
                bot_name: BOT_NAME,
                bot_id: botInstanceId
            },
            status: 'new',
            created_at: new Date().toISOString(),
            user_id: dbUserId || undefined
        };

        const { error } = await supabase
            .from('alerts')
            .insert(alertData);

        if (error) throw error;

    } catch (err) {
        console.error('❌ Błąd zapisywania alertu:', err.message);
    }
}

// ... existing code ...

// Wewnątrz runBot(), po refreshDataFromDB()
/*
    await refreshDataFromDB();
    
    // --> REJESTRACJA I HEARTBEAT
    await registerBot();
    startHeartbeat();
*/

// Wewnątrz process.on('SIGINT')
/*
    process.on('SIGINT', async () => {
        console.log('🛑 Zatrzymywanie bota...');
        running = false;
        
        // --> SET OFFLINE
        await setBotOffline();
        
        await coordinator.shutdown();
        process.exit();
    });
*/

// Wewnątrz pętli przetwarzania posta, inkrementacja licznika
/*
    if (result.isNew) {
        processedCount++;
        postsProcessedToday++; // GLOBAL COUNTER FOR HEARTBEAT
    }
*/

// Wewnątrz checkBanRisk (requires modification to logAlert instead of just returning true)
// Ale checkBanRisk jest w 'lib/human-behavior.js', który jest importowany.
// Najlepiej zmodyfikować checkBanRisk w 'lib/human-behavior.js' żeby przyjmował callback,
// albo tutaj sprawdzać wynik i logować. 
// W `scrapeFacebook` mamy wywołanie `checkBanRisk(page)`.

/*
    // Feed detection catch block
    if (await checkBanRisk(page)) {
        await logAlert('checkpoint', 'Wykryto ryzyko bana/checkpoint podczas ładowania feedu');
        throw new Error('Ban detected');
    }
*/

/**
 * Logika scrapowania dla Facebooka
 */
async function scrapeFacebook(page, targetGroup = null) {
    // ...
    // Po inicjalizacji RiskPrediction
    // ...

    /*
        // Sprawdź ban (z logowaniem alertu)
        await faultTolerance.executeWithRetry(async () => {
             // ...
        }, 'feed_detection', { groupName });
    */

    // ... wewnątrz pętli ...

    // ... po update Risk Score ...
    /*
        const riskReport = riskPrediction.getRiskReport();
        console.log(`   🚨 Wynik ryzyka: ${(riskScore * 100).toFixed(1)}% (${riskReport.riskLevel})`);
        
        // Logowanie alertów ryzyka do bazy
        if (riskReport.riskLevel === 'critical' || riskReport.riskLevel === 'high') {
             // Unikaj spamowania alertami - np. sprawdź czy ostatni alert tego typu nie był < 5 min temu.
             // (Tu uproszczone - logujemy zawsze jak wykryje)
             await logAlert('pattern_risk', `Wysokie ryzyko bana (Score: ${(riskScore * 100).toFixed(0)}%)`, { riskReport });
        }
    */
}

/**
 * Pobiera aktywne grupy z bazy danych
 * Fallback na config/scraper.json jeśli baza pusta lub błąd
 */
async function fetchGroupsFromDB() {
    try {
        const { data: groups, error } = await supabase
            .from('groups')
            .select('id, user_id, name, url, category_id, is_active')
            .eq('is_active', true)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('❌ Błąd pobierania grup z bazy:', error.message);
            return null;
        }

        if (!groups || groups.length === 0) {
            console.log('⚠️ Brak aktywnych grup w bazie - używam config/scraper.json');
            return null;
        }

        // Zapisz user_id pierwszej grupy (zakładamy że wszystkie grupy należą do tego samego admina)
        if (groups[0].user_id) {
            dbUserId = groups[0].user_id;
        }

        console.log(`✅ Pobrano ${groups.length} aktywnych grup z bazy danych`);
        return groups;
    } catch (err) {
        console.error('❌ Błąd fetchGroupsFromDB:', err.message);
        return null;
    }
}

/**
 * Pobiera aktywne słowa kluczowe z bazy danych
 * Fallback na config/keywords.json jeśli baza pusta lub błąd
 */
async function fetchKeywordsFromDB() {
    try {
        const { data: keywords, error } = await supabase
            .from('keywords')
            .select('id, keyword, category_id, is_active')
            .eq('is_active', true);

        if (error) {
            console.error('❌ Błąd pobierania słów kluczowych z bazy:', error.message);
            return null;
        }

        if (!keywords || keywords.length === 0) {
            console.log('⚠️ Brak aktywnych słów kluczowych w bazie - używam config/keywords.json');
            return null;
        }

        // Pobierz też nazwy kategorii dla logowania
        const { data: categories } = await supabase
            .from('categories')
            .select('id, name');

        const categoryMap = {};
        if (categories) {
            categories.forEach(c => categoryMap[c.id] = c.name);
        }

        // Dodaj nazwę kategorii do każdego słowa
        const keywordsWithCategory = keywords.map(k => ({
            ...k,
            category_name: k.category_id ? categoryMap[k.category_id] : 'Inne'
        }));

        console.log(`✅ Pobrano ${keywords.length} aktywnych słów kluczowych z bazy danych`);
        return keywordsWithCategory;
    } catch (err) {
        console.error('❌ Błąd fetchKeywordsFromDB:', err.message);
        return null;
    }
}

/**
 * Aktualizuje match_count dla słowa kluczowego
 */
async function incrementKeywordMatchCount(keywordId) {
    try {
        // Użyj RPC lub update z increment
        const { error } = await supabase.rpc('increment_keyword_match_count', { keyword_id: keywordId });

        // Fallback jeśli RPC nie istnieje
        if (error && error.code === 'PGRST202') {
            // RPC nie istnieje, użyj standardowego update
            const { data: keyword } = await supabase
                .from('keywords')
                .select('match_count')
                .eq('id', keywordId)
                .single();

            if (keyword) {
                await supabase
                    .from('keywords')
                    .update({ match_count: (keyword.match_count || 0) + 1 })
                    .eq('id', keywordId);
            }
        }
    } catch (err) {
        // Nie przerywaj działania bota jeśli nie uda się zaktualizować licznika
        console.error('⚠️ Błąd aktualizacji match_count:', err.message);
    }
}

/**
 * Odświeża dane z bazy (grupy i słowa kluczowe)
 */
async function refreshDataFromDB() {
    console.log('🔄 Odświeżam dane z bazy...');
    dbGroups = await fetchGroupsFromDB();
    dbKeywords = await fetchKeywordsFromDB();
}

/**
 * Losuje grupę docelową z dostępnej puli
 * Priorytet: grupy z bazy > grupy z CONFIG > pojedyncza grupa z CONFIG
 */
function getRandomGroup() {
    // 1. Najpierw sprawdź grupy z bazy
    if (dbGroups && dbGroups.length > 0) {
        const randomIndex = Math.floor(Math.random() * dbGroups.length);
        const group = dbGroups[randomIndex];
        return {
            id: group.id,
            name: group.name,
            url: group.url,
            category_id: group.category_id,
            user_id: group.user_id
        };
    }

    // 2. Fallback na grupy z CONFIG (JSON)
    if (CONFIG.groups && CONFIG.groups.length > 0) {
        const randomIndex = Math.floor(Math.random() * CONFIG.groups.length);
        return CONFIG.groups[randomIndex];
    }

    // 3. Fallback do pojedynczej grupy z CONFIG
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
 * Używa słów z bazy danych (dbKeywords) lub fallback na JSON
 */
function matchKeywords(text) {
    if (!text) return { matched: false, keywords: [], keywordIds: [] };

    const lowerText = text.toLowerCase();
    const foundKeywords = [];
    const foundKeywordIds = [];
    let categoryMatch = null;
    let categoryId = null;

    // 1. Najpierw sprawdź słowa z bazy
    if (dbKeywords && dbKeywords.length > 0) {
        for (const kw of dbKeywords) {
            if (lowerText.includes(kw.keyword.toLowerCase())) {
                foundKeywords.push(kw.keyword);
                foundKeywordIds.push(kw.id);
                if (!categoryMatch) {
                    categoryMatch = kw.category_name || 'Inne';
                    categoryId = kw.category_id;
                }
            }
        }
    } else {
        // 2. Fallback na słowa z JSON
        for (const [category, data] of Object.entries(KEYWORDS_JSON.categories)) {
            for (const keyword of data.keywords) {
                if (lowerText.includes(keyword.toLowerCase())) {
                    foundKeywords.push(keyword);
                    if (!categoryMatch) categoryMatch = category;
                }
            }
        }
    }

    return {
        matched: foundKeywords.length > 0,
        keywords: foundKeywords,
        keywordIds: foundKeywordIds,
        category: categoryMatch,
        category_id: categoryId
    };
}

/**
 * Zapisuje post do bazy danych Supabase
 * @param {Object} postData - dane posta
 * @param {Object} targetGroup - informacje o grupie (opcjonalne)
 */
async function savePostToSupabase(postData, targetGroup = null) {
    try {
        // Przygotuj dane do zapisu
        const insertData = {
            external_id: postData.externalId,
            author_name: postData.author,
            author_url: postData.authorUrl,
            content: postData.content || postData.textContent,
            post_url: postData.post_url || postData.url,
            matched_keywords: postData.matchedKeywords || [],
            category: postData.category,
            status: 'new',
            scraped_at: new Date().toISOString(),
            human_action_taken: false
        };

        // Dodaj user_id jeśli dostępny (z grup z bazy)
        if (targetGroup?.user_id) {
            insertData.user_id = targetGroup.user_id;
        } else if (dbUserId) {
            insertData.user_id = dbUserId;
        }

        // Dodaj group_id jeśli dostępny
        if (targetGroup?.id) {
            insertData.group_id = targetGroup.id;
        }

        // Dodaj category_id jeśli dostępny
        if (postData.category_id) {
            insertData.category_id = postData.category_id;
        }

        const { data, error } = await supabase
            .from('posts')
            .insert(insertData)
            .select()
            .single();

        if (error) {
            // Jeśli to błąd duplikatu, to OK - post już istnieje
            if (error.code === '23505') {
                console.log(`   ⚠️ Post ${postData.externalId} już istnieje w bazie`);
                return null;
            }
            throw error;
        }

        console.log(`   💾 Post zapisany w Supabase (ID: ${data.id})`);
        return data;

    } catch (error) {
        console.error('   ❌ Błąd zapisu do Supabase:', error.message);
        return null;
    }
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
            if (await checkBanRisk(page)) {
                await logAlert('checkpoint', 'Wykryto ryzyko bana/checkpoint podczas ładowania feedu (Timeout feedu)');
                throw new Error('Ban detected');
            }
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

                            // Aktualizuj match_count dla znalezionych słów kluczowych
                            for (const keywordId of matchResult.keywordIds) {
                                await incrementKeywordMatchCount(keywordId);
                            }

                            // Zapisz post do Supabase z user_id
                            await savePostToSupabase({
                                externalId: data.externalId,
                                author: data.author,
                                authorUrl: data.authorUrl,
                                content: data.textContent,
                                post_url: data.url,
                                matchedKeywords: matchResult.keywords,
                                category: matchResult.category,
                                category_id: matchResult.category_id
                            }, targetGroup);

                            // Wyślij do n8n z Fault Tolerance (opcjonalne - jeśli używasz n8n)
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
                postsProcessedToday++; // Global counter for heartbeat
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

    // LOGOWANIE ALERTU DO BAZY (New Feature)
    if (riskReport.riskLevel === 'critical' || riskReport.riskLevel === 'high') {
        await logAlert('pattern_risk', `Wysokie ryzyko wykrycia bota (Score: ${(riskScore * 100).toFixed(0)}%)`, {
            score: riskScore,
            level: riskReport.riskLevel,
            group: groupName
        });
    }

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

    // Pobierz dane z bazy przy starcie
    await refreshDataFromDB();

    // REJESTRACJA I MONITORAOWANIE BOTÓW (Feature 2.4)
    if (await registerBot()) {
        startHeartbeat();
    } else {
        console.warn('⚠️ Kontynuuję bez rejestracji w monitoringu (błąd rejestracji)');
    }

    // Inicjalizuj Distributed Coordinator
    const coordinator = new DistributedCoordinator(CONFIG.distributed || {});
    await coordinator.initialize();

    const sessionManager = new SessionManager(CONFIG);
    let running = true;

    // Obsługa zamknięcia procesu
    process.on('SIGINT', async () => {
        console.log('🛑 Zatrzymywanie bota...');
        running = false;

        // Zaktualizuj status na offline
        await setBotOffline();

        await coordinator.shutdown();
        process.exit();
    });

    while (running) {
        try {
            // Odśwież dane z bazy przed każdą sesją
            await refreshDataFromDB();

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

const os = require('os'); // Added for hostname

const AccountManager = require("./lib/account-manager");
const { getChromePath } = require("./lib/account-manager");
const BrowserLock = require("./lib/browser-lock");
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const {
    humanDelay,
    humanScroll,
    humanClick,
    checkBanRisk,
    handleCheckpoint,
    sleep,
    simulateContentEngagement
} = require('./lib/human-behavior');
const SessionManager = require('./lib/session-manager');
const DeviceFingerprint = require('./lib/device-fingerprint');
const HumanIdleBehaviors = require('./lib/human-idle-behaviors');

const HumanErrorSimulation = require('./lib/human-error-simulation');
const CacheManager = require('./lib/cache-manager');
const BehavioralLearning = require('./lib/behavioral-learning');
const RiskPrediction = require('./lib/risk-prediction');
const StatefulScanner = require('./lib/stateful-scanner');
const FaultTolerance = require('./lib/fault-tolerance');
const DistributedCoordinator = require('./lib/distributed-coordinator');
const { warmupSession } = require('./lib/session-warmup');
const { cooldownSession } = require('./lib/session-cooldown');
const BreakInManager = require('./lib/break-in-manager');
const SocialInteractions = require('./lib/social-interactions');

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
// ETAP 7.3: Break-in manager (stopniowe zwiekszanie aktywnosci)
const LEARNING_PATH = path.resolve(__dirname, scannerAccount.paths.learning || './learning-data');
if (!fs.existsSync(LEARNING_PATH)) fs.mkdirSync(LEARNING_PATH, { recursive: true });
const breakInManager = new BreakInManager(LEARNING_PATH);

const SCREENSHOTS_DIR = path.join(__dirname, scannerAccount.paths.screenshots || 'accounts/main-account/screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

// Globalne zmienne dla monitorowania
let botInstanceId = null;
let heartbeatInterval = null;
const BOT_NAME = `FB-Bot-${os.hostname()}`;
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
                type: 'unified',
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
 * ETAP 6.1: Rotacja kolejnosci grup
 * W kazdej sesji losowo wybiera 1-2 grupy (nie zawsze wszystkie).
 * 60% szans: 1 grupa, 40% szans: 2 grupy.
 */
function selectGroupsForSession() {
    let allGroups = [];

    // 1. Grupy z bazy
    if (dbGroups && dbGroups.length > 0) {
        allGroups = dbGroups.map(g => ({
            id: g.id,
            name: g.name,
            url: g.url,
            category_id: g.category_id,
            user_id: g.user_id
        }));
    }
    // 2. Fallback na grupy z CONFIG
    else if (CONFIG.groups && CONFIG.groups.length > 0) {
        allGroups = CONFIG.groups;
    }
    // 3. Fallback na pojedyncza grupe
    else {
        return [CONFIG.group];
    }

    // Jesli tylko 1 grupa dostepna - zwroc ja
    if (allGroups.length <= 1) return allGroups;

    // Losowa kolejnosc (Fisher-Yates)
    const shuffled = [...allGroups];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // 60% szans: 1 grupa, 40% szans: 2 grupy
    const count = Math.random() < 0.6 ? 1 : 2;
    return shuffled.slice(0, Math.min(count, shuffled.length));
}

/**
 * ETAP 6.2: Zroznicowanie dlugosci sesji
 * Losuje limit postow na sesje - krotka, normalna lub dluga.
 */
function getMaxPostsForSession() {
    const roll = Math.random();
    if (roll < 0.3) {
        // Krotka sesja (30%) - "sprawdzam szybko co nowego"
        return 3 + Math.floor(Math.random() * 4);  // 3-6
    } else if (roll < 0.8) {
        // Normalna sesja (50%) - "przegladam grupe"
        return 7 + Math.floor(Math.random() * 6);  // 7-12
    } else {
        // Dluga sesja (20%) - "mam czas, czytam wszystko"
        return 13 + Math.floor(Math.random() * 6); // 13-18
    }
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
async function savePostToSupabase(postData, targetGroup = null, screenshotUrl = null) {
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
            status: screenshotUrl ? 'done' : 'new',
            screenshot_url: screenshotUrl,
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
 * Rozwija obciete posty klikajac "Zobacz wiecej" / "See more"
 */
async function expandTruncatedPost(postHandle) {
    try {
        const clicked = await postHandle.evaluate(el => {
            const buttons = el.querySelectorAll('[role="button"], a, span');
            for (const btn of buttons) {
                const text = btn.innerText.trim().toLowerCase();
                if (text === 'see more' || text === 'zobacz więcej' || text === 'zobacz wiecej') {
                    btn.click();
                    return true;
                }
            }
            return false;
        });
        if (clicked) {
            await sleep(1000 + Math.random() * 1000);
        }
        return clicked;
    } catch (e) {
        return false;
    }
}

/**
 * Robi screenshot elementu i uploaduje do Supabase Storage
 */
async function takePostScreenshot(postHandle, postId) {
    try {
        const filename = `post_${postId}_${Date.now()}.png`;
        const filepath = path.join(SCREENSHOTS_DIR, filename);

        // Screenshot elementu (nie strony)
        await postHandle.screenshot({ path: filepath });
        console.log(`   📸 Screenshot: ${filename}`);

        // Upload do Supabase Storage
        const fileContent = fs.readFileSync(filepath);
        const { error: uploadError } = await supabase
            .storage
            .from('screenshots')
            .upload(filename, fileContent, {
                contentType: 'image/png',
                upsert: true
            });

        if (uploadError) {
            console.error('   ⚠️ Upload failed:', uploadError.message);
            return { success: false, screenshotUrl: null };
        }

        const { data: urlData } = supabase
            .storage
            .from('screenshots')
            .getPublicUrl(filename);

        // Usun plik lokalny po uplaodzie
        try { fs.unlinkSync(filepath); } catch (e) {}

        return { success: true, screenshotUrl: urlData.publicUrl };
    } catch (err) {
        console.error('   ❌ Screenshot error:', err.message);
        return { success: false, screenshotUrl: null };
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
    const socialInteractions = new SocialInteractions(page);

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
    // ETAP 6.2 + 7.3: Zroznicowane dlugosci sesji, ograniczone przez break-in
    const breakInMaxPosts = breakInManager.getMaxPostsForDay();
    const maxPosts = Math.min(getMaxPostsForSession(), breakInMaxPosts);
    const sessionType = maxPosts <= 6 ? 'krotka' : maxPosts <= 12 ? 'normalna' : 'dluga';
    console.log(`   🎯 Sesja ${sessionType}: limit ${maxPosts} postow (break-in limit: ${breakInMaxPosts})`);
    console.log(`   🤝 Budzet interakcji: ${socialInteractions.getBudgetSummary()}`);

    // Resetuj statystyki Stateful Scanner
    statefulScanner.resetSessionStats();

    // Przetwarzaj posty z Stateful Scanning
    for (const [postIndex, postHandle] of particleHandles.entries()) {
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

                            // Screenshot inline - rozwij post i zrob screenshot
                            await expandTruncatedPost(postHandle);
                            const screenshotResult = await takePostScreenshot(postHandle, data.externalId);

                            // Aktualizuj match_count dla znalezionych słów kluczowych
                            for (const keywordId of matchResult.keywordIds) {
                                await incrementKeywordMatchCount(keywordId);
                            }

                            // Zapisz post do Supabase z screenshot URL
                            await savePostToSupabase({
                                externalId: data.externalId,
                                author: data.author,
                                authorUrl: data.authorUrl,
                                content: data.textContent,
                                post_url: data.url,
                                matchedKeywords: matchResult.keywords,
                                category: matchResult.category,
                                category_id: matchResult.category_id
                            }, targetGroup, screenshotResult.screenshotUrl);

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
                                    screenshot_url: screenshotResult.screenshotUrl,
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

            // Social interactions: reakcje/porzucone komentarze na NIE-keywordowych postach
            const isKwMatch = matchKeywords(postData.textContent).matched;
            const interactionAction = socialInteractions.decideInteraction(
                postIndex, particleHandles.length, isKwMatch
            );
            if (interactionAction === 'reaction') {
                await socialInteractions.performReaction(postHandle);
            } else if (interactionAction === 'comment_attempt') {
                await socialInteractions.performCommentAttempt(postHandle);
            }

        } catch (err) {
            console.error('   ❌ Błąd przetwarzania posta:', err.message);
        }

        // ETAP 6.3: Micro-interakcje z trescia (hover na reakcjach/avatarze)
        await simulateContentEngagement(page, postHandle);

        // Losowe zachowanie co kilka postów
        if (processedCount > 0 && processedCount % 3 === 0) {
            await idleBehaviors.simulateThinking();
        }

        // ETAP 6.4: Symulacja zmiany taba - losowy interwal (nie co stala liczbe postow)
        if (processedCount > 0 && Math.random() < 0.07) {
            console.log('   🔄 Symulacja zmiany taba...');
            await idleBehaviors.tabSwitch();
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

    // ETAP 8.3: Sprawdz czy bot jest w cooldownie po checkpoincie
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

    // Pobierz dane z bazy przy starcie
    await refreshDataFromDB();

    // REJESTRACJA I MONITORAOWANIE BOTÓW (Feature 2.4)
    if (await registerBot()) {
        startHeartbeat();
    } else {
        console.warn('⚠️ Kontynuuję bez rejestracji w monitoringu (błąd rejestracji)');
    }

    // Inicjalizuj Distributed Coordinator (initialize() wywoływane automatycznie w konstruktorze)
    const coordinator = new DistributedCoordinator(CONFIG.distributed || {});

    const sessionManager = new SessionManager(CONFIG);
    let dailySessionCount = 0;
    let lastSessionDate = new Date().toDateString();
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

            // ETAP 7: Sprawdz czy powinien pracowac (dzien roboczy + aktywne godziny)
            if (!sessionManager.shouldWork()) {
                await sessionManager.waitForActiveHours();
                continue; // Po obudzeniu sprawdz ponownie warunki
            }

            // ETAP 7.3: Break-in period - stopniowe zwiekszanie aktywnosci
            const today = new Date().toDateString();
            if (lastSessionDate !== today) {
                dailySessionCount = 0;
                lastSessionDate = today;
            }
            const breakInStatus = breakInManager.getStatus();
            console.log(`📊 Break-in: dzien ${breakInStatus.daysSinceFirstRun}, faza: ${breakInStatus.phase}, mnoznik: ${breakInStatus.activityMultiplier}`);

            if (dailySessionCount >= breakInStatus.maxSessions) {
                console.log(`🛑 Break-in limit: osiagnieto ${dailySessionCount}/${breakInStatus.maxSessions} sesji na dzis. Czekam do jutra.`);
                await sessionManager.waitForActiveHours();
                continue;
            }

            // ETAP 6.1: Wybierz 1-2 grupy na ta sesje (losowa kolejnosc)
            const sessionGroups = selectGroupsForSession();
            console.log(`🎯 Sesja: ${sessionGroups.length} grup - ${sessionGroups.map(g => g.name).join(', ')}`);

            for (const targetGroup of sessionGroups) {
                if (!running) break;

                console.log(`   📂 Skanuje: ${targetGroup.name} (${targetGroup.url})`);

                // Użyj distributed coordinator do wykonania zadania
                if (coordinator.isCoordinator) {
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
                    await runSingleSession(targetGroup, coordinator);
                }

                // Przerwa miedzy grupami (jesli wiecej niz 1): 3-8 minut
                if (sessionGroups.indexOf(targetGroup) < sessionGroups.length - 1) {
                    const breakMs = 180000 + Math.random() * 300000;
                    console.log(`   ⏸️ Przerwa ${Math.round(breakMs / 60000)} min przed nastepna grupa...`);
                    await sleep(breakMs);
                }
            }

            // ETAP 7.3: Zapisz ukonczenie sesji
            dailySessionCount++;
            breakInManager.recordSessionCompleted();

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
    let page;
    let browserLock;
    const fingerprintManager = new DeviceFingerprint();

    try {
        const puppeteerOptions = {
            executablePath: getChromePath(),
            headless: false,
            args: [
                '--window-position=0,0',
            ]
        };

        // 🔒 Lock-file - zapobiega jednoczesnej pracy dwoch botow na jednym profilu Chrome
        browserLock = new BrowserLock(scannerAccount.folderPath);
        if (!browserLock.acquire('fb-bot')) {
            console.error('❌ Nie mozna uruchomic bota - profil Chrome jest uzywany przez innego bota');
            return;
        }

        // 🆕 Browser isolation - użyj opcji z konta
        const browserOptions = accountManager.getBrowserOptions(scannerAccount, 'scanner', puppeteerOptions);
        browser = await puppeteer.launch(browserOptions);
        page = await browser.newPage();

        // Aplikuj fingerprint urządzenia (timezone, jezyk, CDP evasion)
        await fingerprintManager.applyFingerprint(page);

        // navigator.webdriver jest obslugiwany przez:
        // 1. --disable-blink-features=AutomationControlled (natywnie w Chrome)
        // 2. puppeteer-extra-plugin-stealth
        // NIE usuwamy recznie z prototypu - brak chrome.runtime/webdriver = sygnal bota

        // ETAP 4.3: Rozgrzewka sesji PRZED nawigacja do grupy
        const warmupResult = await warmupSession(page);
        if (!warmupResult.loggedIn) {
            console.error('❌ SESJA PRZERWANA: Uzytkownik nie jest zalogowany na Facebooku!');
            console.error('   👉 Zaloguj sie recznie w profilu Chrome i uruchom ponownie.');
            await logAlert('auth_error', 'Bot nie jest zalogowany na Facebooku', {
                group: targetGroup.name,
                action: 'Wymagane reczne logowanie w profilu Chrome'
            });
            return;
        }

        // Wejdź na stronę
        console.log(`🔗 Nawigacja do: ${targetGroup.url}`);

        // ETAP 6.5: Referrer chain - nawigacja "z Facebooka" (warmup umieszcza nas na facebook.com)
        await page.goto(targetGroup.url, { waitUntil: 'networkidle2', timeout: 60000, referer: 'https://www.facebook.com/' });

        // Losowe opóźnienie "rozruchowe"
        await sleep(humanDelay('afterPageLoad'));

        // Wybór trybu
        if (targetGroup.isMock || targetGroup.url.includes('reddit')) {
            await scrapeReddit(page);
        } else {
            await scrapeFacebook(page, targetGroup);
        }

        // ETAP 4.3: Schladzanie sesji PO skanowaniu
        await cooldownSession(page);

        console.log('✅ Sesja zakończona sukcesem');

    } catch (error) {
        console.error('❌ Błąd sesji:', error);

    } finally {
        if (browser) {
            console.log('🔒 Zamykam przeglądarkę...');
            await browser.close();
        }
        // Zwolnij lock profilu Chrome
        if (browserLock) {
            browserLock.release('fb-bot');
        }
    }
}

// Eksport dla distributed-coordinator
module.exports = { runSingleSession };

// Uruchomienie i obsługa błędów top-level
runBot().catch(err => {
    console.error('❌ Nieobsłużony błąd (Top Level):', err);
});

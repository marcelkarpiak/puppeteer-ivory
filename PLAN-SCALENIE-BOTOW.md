# Plan: Scalenie Scanner + Screenshot Bot w jeden fb-bot.js (Architektura C)

## Kontekst

Obecna architektura uzywa dwoch osobnych botow:
- `fb-scanner-bot.js` - skanuje feed grup FB, zapisuje posty do Supabase ze statusem `'new'`
- `fb-screenshot-bot.js` - polluje Supabase, otwiera permalinki postow w osobnej sesji Chrome, robi screenshoty

Problem: kazdy zeskanowany post wymaga DWOCH osobnych sesji przegladarki, co podwaja ryzyko wykrycia przez Facebook. Screenshot bot generuje anomalny wzorzec nawigacji (sekwencyjne odwiedzanie permalinkow).

Cel: Jeden scalony bot `fb-bot.js` ktory skanuje feed i robi screenshoty inline uzywajac `postHandle.screenshot()` - zero dodatkowych requestow do FB. Przy okazji naprawiamy 4 bugi z audytu bezpieczenstwa.

Szacowana redukcja ryzyka bana: z ~10% do ~3-5% miesiecznie.

---

## Kluczowe pliki

| Plik | Rola w planie |
|------|---------------|
| `fb-scanner-bot.js` | Zrodlo - kopiujemy do fb-bot.js, potem archiwizujemy |
| `fb-screenshot-bot.js` | Zrodlo logiki screenshotow (upload do Storage), potem archiwizujemy |
| `lib/session-manager.js` | Bug fix: isWorkingDay() |
| `lib/account-manager.js` | Bez zmian (getBrowserOptions, getChromePath juz OK) |
| `lib/browser-lock.js` | Bez zmian |
| `lib/device-fingerprint.js` | Bez zmian |
| `start-system.sh` | Aktualizacja: 1 bot zamiast 2 |
| `manage-accounts.sh` | Aktualizacja: 1 bot zamiast 2 |
| `frontend/components/dashboard/BotControl.tsx` | Aktualizacja: 1 karta zamiast 2 |

---

## Kroki implementacji

### KROK 1: Bug fix - `isWorkingDay()` w session-manager.js

**Plik:** `lib/session-manager.js` linia 151

**Problem:** `{ weekday: 'lowercase' }` nie jest prawidlowa wartosc. Skutek: bot nigdy nie rozpoznaje dnia roboczego.

**Zmiana:**
```
PRZED: const dayName = now.toLocaleDateString('en-US', { weekday: 'lowercase' });
PO:    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
```

Zwraca `'monday'`, `'tuesday'` itd. - pasuje do wartosci w `config/scraper.json`.

---

### KROK 2: Utworzenie fb-bot.js na bazie fb-scanner-bot.js

**Akcja:** Skopiowac `fb-scanner-bot.js` do `fb-bot.js`. Nastepnie w `fb-bot.js` wprowadzic nastepujace zmiany:

#### 2a. Zmiana nazwy bota i stala SCREENSHOTS_DIR

```javascript
// PRZED:
const BOT_NAME = `FB-Scanner-${os.hostname()}`;

// PO:
const BOT_NAME = `FB-Bot-${os.hostname()}`;
```

Dodac po definicji `scannerAccount`:
```javascript
const SCREENSHOTS_DIR = path.join(__dirname, scannerAccount.paths.screenshots || 'accounts/main-account/screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
```

W `registerBot()` zmienic `type: 'scanner'` na `type: 'unified'`.

#### 2b. Usunac caly mechanizm cookies JSON

Usunac:
- Stala `SESSION_PATH` (linia 67)
- Funkcje `saveCookies()` (linia 505-515) i `loadCookies()` (linia 520-531)
- Wywolanie `loadCookies(page)` w `runSingleSession()` (linia 1286)
- Wywolanie `saveCookies(page)` w bloku `finally` (linia 1317-1319)
- To samo w `session-warmup.js` jesli jest tam loadCookies

**Dlaczego:** Bot uzywa `userDataDir` (wspolny profil Chrome), ktory automatycznie zapisuje cookies w SQLite. Reczne `setCookie()` z pliku JSON jest zbedne i powoduje konflikty.

#### 2c. Fix scoping browserLock

W `runSingleSession()` przeniesc deklaracje `browserLock` przed blok `try`:

```javascript
async function runSingleSession(targetGroup, coordinator = null) {
    let browser;
    let page;
    let browserLock;  // PRZENIESIONE - bylo wewnatrz try
    const fingerprintManager = new DeviceFingerprint();

    try {
        // ...
        browserLock = new BrowserLock(scannerAccount.folderPath);
        if (!browserLock.acquire('fb-bot')) {
            console.error('...');
            return; // NIE process.exit - pozwol petli glownej kontynuowac
        }
        // ...
    } finally {
        if (page && !page.isClosed()) {
            // nie saveCookies - userDataDir obsluguje
        }
        if (browser) await browser.close();
        if (browserLock) browserLock.release('fb-bot');
    }
}
```

Zmiana: `process.exit(1)` na `return` - jesli lock jest zajety, nie zabijaj calego procesu, tylko pomin sesje.

#### 2d. Fix shuffle w selectGroupsForSession()

```javascript
// PRZED:
const shuffled = [...allGroups].sort(() => Math.random() - 0.5);

// PO (Fisher-Yates):
const shuffled = [...allGroups];
for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}
```

---

### KROK 3: Dodanie funkcji screenshotowych do fb-bot.js

Dodac 2 nowe funkcje (przed `scrapeFacebook`):

#### 3a. `expandTruncatedPost(postHandle)`

Rozwija obciete posty klikajac "Zobacz wiecej" / "See more":

```javascript
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
```

#### 3b. `takePostScreenshot(postHandle, postId)`

Robi screenshot elementu i uploaduje do Supabase Storage:

```javascript
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
```

---

### KROK 4: Modyfikacja savePostToSupabase()

**Plik:** `fb-bot.js`, funkcja `savePostToSupabase`

Dodac parametr `screenshotUrl` i zmienic status na `'done'`:

```javascript
// PRZED:
async function savePostToSupabase(postData, targetGroup = null) {
    // ...
    status: 'new',
    // ...

// PO:
async function savePostToSupabase(postData, targetGroup = null, screenshotUrl = null) {
    // ...
    status: screenshotUrl ? 'done' : 'new',  // 'done' jesli jest screenshot, 'new' jesli nie
    screenshot_url: screenshotUrl,
    // ...
```

Jesli screenshot sie udal -> post od razu ze statusem `'done'` i `screenshot_url`.
Jesli screenshot sie nie udal -> post ze statusem `'new'` (dashboard moze pokazac ze brak screena).

---

### KROK 5: Integracja screenshotow w petli skanowania

**Plik:** `fb-bot.js`, w `scrapeFacebook()`, wewnatrz callbacku `statefulScanner.processPost()`

Po znalezieniu matcha keywords, PRZED zapisem do Supabase, dodac logike screenshota:

```javascript
if (matchResult.matched) {
    console.log(`   🎯 TRAFIENIE: [${data.author}] "${data.title}"`);
    console.log(`      Keywords: ${matchResult.keywords.join(', ')}`);

    // --- NOWE: Screenshot inline ---
    await expandTruncatedPost(postHandle);
    const screenshotResult = await takePostScreenshot(postHandle, data.externalId);
    // --- KONIEC screenshot ---

    // Keyword match counts
    for (const keywordId of matchResult.keywordIds) {
        await incrementKeywordMatchCount(keywordId);
    }

    // Zapis do Supabase z screenshot URL
    await savePostToSupabase({
        externalId: data.externalId,
        author: data.author,
        authorUrl: data.authorUrl,
        content: data.textContent,
        post_url: data.url,
        matchedKeywords: matchResult.keywords,
        category: matchResult.category,
        category_id: matchResult.category_id
    }, targetGroup, screenshotResult.screenshotUrl);  // <-- trzeci parametr

    // Webhook n8n (dodac screenshot_url)
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
    // ...
}
```

**WAZNE:** `postHandle` jest dostepny w closure scope petli `for (const postHandle of particleHandles)`. Callback jest definiowany wewnatrz iteracji petli, wiec postHandle jest valid.

---

### KROK 6: Usunac import screenshotowych zaleznosci z fb-bot.js

Usunac z importow (jesli sa):
- Nie importujemy juz nic specyficznego dla screenshot bota
- Dodac `const SCREENSHOTS_DIR` (juz zrobione w kroku 2a)

Upewnic sie ze `supabase.storage` jest dostepne (jest - supabase client jest juz zainicjalizowany).

---

### KROK 7: Archiwizacja starych plikow

```
mkdir -p _archive
mv fb-scanner-bot.js _archive/fb-scanner-bot.js
mv fb-screenshot-bot.js _archive/fb-screenshot-bot.js
```

Jesli istnieja pliki `.bak` lub `.backup-*`, tez przenosimy do `_archive/`.

---

### KROK 8: Aktualizacja start-system.sh

**Plik:** `start-system.sh`

Zmiany:
1. Usunac check cookies.json (linie 23-28) - nie uzywamy juz JSON cookies
2. Zamienic 2 uruchomienia botow na 1:

```bash
# PRZED:
echo -e "${BLUE}📡 Uruchamiam Scanner Bot...${NC}"
open_terminal "🔍 FB Scanner Bot" "node fb-scanner-bot.js"
sleep 2
echo -e "${BLUE}📸 Uruchamiam Screenshot Bot...${NC}"
open_terminal "📷 FB Screenshot Bot" "node fb-screenshot-bot.js"
sleep 2

# PO:
echo -e "${BLUE}🤖 Uruchamiam FB Bot...${NC}"
open_terminal "🤖 FB Bot" "node fb-bot.js"
sleep 2
```

---

### KROK 9: Aktualizacja manage-accounts.sh

**Plik:** `manage-accounts.sh`

Zmiany w sekcji `setup` (linie 55-57):
```bash
echo "   node fb-bot.js"
```

Zmiany w sekcji `test` (linie 96-116):
```bash
echo "Uruchamiam bota w tle..."
node fb-bot.js &
BOT_PID=$!
# ... usunac SCREENSHOT_PID ...
kill $BOT_PID 2>/dev/null
```

---

### KROK 10: Aktualizacja frontend BotControl.tsx

**Plik:** `frontend/components/dashboard/BotControl.tsx`

Zastapic dwie karty (Scanner + Screenshot) jedna karta:

- Usunac `screenshotStatus` state
- Jedna karta "FB Bot" z ikona Activity
- Opis: "Skanuje grupy Facebook, robi screenshoty pasujacych postow i uploaduje do Storage"
- Workflow:
  1. Skanuje feed grupy
  2. Filtruje posty wedlug slow kluczowych
  3. Robi screenshot bezposrednio z feeda
  4. Uploaduje do Supabase Storage
  5. Zapisuje post ze statusem "done"
- Komenda: `node fb-bot.js`
- Sekcja instrukcji: 1 terminal zamiast 2

---

## Zmiany w Supabase

**Schemat bazy: BEZ ZMIAN.** Tabela `posts` juz ma kolumny `screenshot_url` (nullable) i `status`. Bucket Storage `screenshots` juz istnieje. Jedyna roznica behawioralna: posty sa teraz insertowane od razu ze statusem `'done'` + `screenshot_url`, zamiast `'new'` → pozniej update na `'done'`.

Frontend: Typ `Post` w `frontend/lib/supabase.ts` zachowuje wszystkie statusy (`'new' | 'processing' | 'done' | 'error'`) dla kompatybilnosci wstecznej z istniejacymi danymi.

---

## Obsluga bledow screenshota

| Scenariusz | Co sie dzieje |
|---|---|
| `postHandle.screenshot()` sie udal | Post zapisany z `status: 'done'`, `screenshot_url: public_url` |
| `postHandle.screenshot()` failuje | Post zapisany z `status: 'new'`, `screenshot_url: null` |
| Upload do Storage failuje | Post zapisany z `status: 'new'`, `screenshot_url: null` |
| Post juz istnieje w Supabase | Duplikat obsluzony przez unique constraint (error 23505) |

**Bez mechanizmu retry.** Screenshot elementu jest operacja jednorazowa - element po scrollu jest niedostepny. Dane tekstowe posta (najwazniejsza wartosc) sa zawsze zapisane.

---

## Weryfikacja po wdrozeniu

1. **Uruchom `node fb-bot.js`** - powinien zaladowac konto `main-account`, wyswietlic break-in status, skanowac grupy
2. **Sprawdz logi** - powinny zawierac `FB-Bot-*` (nie `FB-Scanner-*`), `📸 Screenshot:` przy matchach
3. **Sprawdz Supabase** - nowe posty powinny miec `status: 'done'` i `screenshot_url` od razu
4. **Sprawdz Supabase Storage** - bucket `screenshots` powinien zawierac nowe pliki `post_*.png`
5. **Sprawdz dashboard** - posty z screenshotami powinny byc widoczne, karta bota powinna pokazywac 1 bota
6. **Sprawdz isWorkingDay()** - bot powinien dzialac w dni robocze i odpoczywac w weekendy
7. **Sprawdz lock-file** - podczas pracy bota `accounts/main-account/browser.lock` istnieje, po zakonczeniu znika
8. **Sprawdz `start-system.sh`** - powinien uruchomic 1 bota + frontend (2 terminale)
9. **Test "Zobacz wiecej"** - na dlugim poscie bot powinien rozwinac tresc przed screenshotem

# Facebook Group Scraper - Dokumentacja Techniczna

---

## 1. Architektura Systemu

```
┌───────────────────────────────────────────────────────────────┐
│                        FB-BOT.JS                              │
│                   (unified bot - 1 proces)                    │
│                                                               │
│  1. Skanuje feed grupy FB                                     │
│  2. Filtruje posty wedlug slow kluczowych                     │
│  3. Robi screenshot elementu DOM (inline, 0 dodatkowych HTTP) │
│  4. Uploaduje screenshot do Supabase Storage                  │
│  5. Zapisuje post do Supabase (status='done')                 │
│  6. Wysyla webhook do n8n                                     │
└───────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌───────────────────────────────────────────────────────────────┐
│                         SUPABASE                              │
│  - Database: posts, groups, keywords, categories, alerts      │
│  - Storage: bucket 'screenshots' (publiczny)                  │
│  - Auth: user_profiles z rolami (admin/user)                  │
│  - RLS: izolacja danych per user_id                           │
└───────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌───────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                          │
│  - Dashboard z postami, statystykami, filtrami                │
│  - Zarzadzanie grupami, slowami kluczowymi, kategoriami      │
│  - Monitorowanie botow (heartbeat, alerty)                    │
│  - Panel admina (zarzadzanie uzytkownikami)                   │
└───────────────────────────────────────────────────────────────┘
```

---

## 2. Struktura Projektu

```
puppeteer-demo_final-main/
├── fb-bot.js                      # Glowny bot (scanner + screenshot)
├── config/
│   ├── scraper.json               # Konfiguracja: grupy, safety, n8n webhook
│   └── keywords.json              # Slowa kluczowe (fallback)
├── accounts/
│   └── main-account/
│       ├── config.json            # Konfiguracja konta
│       ├── browser-profile/       # Chrome userDataDir (cookies, sesja)
│       ├── screenshots/           # Tymczasowe screenshoty (przed uploadem)
│       ├── learning-data/         # Stan break-in, cooldown
│       ├── cache/                 # Cache postow
│       └── logs/                  # Logi sesji
├── lib/
│   ├── account-manager.js         # Zarzadzanie kontami + getChromePath()
│   ├── browser-lock.js            # Lock-file dla wspolnego profilu Chrome
│   ├── device-fingerprint.js      # Fingerprinting (viewport, TZ, lang, CPU)
│   ├── human-behavior.js          # Ludzkie zachowania (scroll, click, type)
│   ├── human-error-simulation.js  # Symulacja bledow (misclick, typo)
│   ├── human-idle-behaviors.js    # Mikro-ruchy, zmiana focusu
│   ├── session-manager.js         # Godziny pracy, dni robocze
│   ├── session-warmup.js          # Rozgrzewka sesji (newsfeed, powiadomienia)
│   ├── session-cooldown.js        # Schladzanie sesji (scroll, powrot na feed)
│   ├── break-in-manager.js        # Stopniowe zwiekszanie aktywnosci (tydzien 1)
│   ├── stateful-scanner.js        # Deduplikacja (processed_posts)
│   ├── fault-tolerance.js         # Circuit breaker, health checks
│   ├── distributed-coordinator.js # Koordynacja wielu instancji
│   ├── cache-manager.js           # Lokalny cache postow
│   ├── behavioral-learning.js     # Uczenie sie wzorcow zachowan
│   └── risk-prediction.js         # Ocena ryzyka bana
├── frontend/                      # Next.js dashboard
│   ├── app/
│   │   ├── (auth)/login/          # Strona logowania
│   │   └── (dashboard)/           # Chronione strony
│   │       ├── page.tsx           # Dashboard glowny
│   │       ├── bots/              # Monitorowanie botow
│   │       ├── groups/            # Zarzadzanie grupami
│   │       ├── keywords/          # Zarzadzanie slowami kluczowymi
│   │       ├── categories/        # Zarzadzanie kategoriami
│   │       ├── alerts/            # Alerty systemowe
│   │       └── admin/users/       # Zarzadzanie uzytkownikami (admin)
│   ├── components/
│   │   ├── Dashboard.tsx          # Kontener dashboardu
│   │   ├── dashboard/             # PostsTable, BotControl, StatsCards...
│   │   └── ui/                    # shadcn/ui
│   ├── lib/
│   │   ├── supabase.ts            # Klient Supabase + typy
│   │   ├── auth-context.tsx       # Kontekst autoryzacji
│   │   └── admin-context.tsx      # Kontekst admina
│   └── middleware.ts              # Ochrona tras (auth + role)
├── supabase/
│   ├── schema.sql                 # Pelny schemat bazy z RLS
│   └── migrations/                # Migracje SQL
├── start-system.sh                # Uruchamianie systemu (1 bot + frontend)
├── manage-accounts.sh             # Zarzadzanie kontami
└── .env                           # Zmienne srodowiskowe
```

---

## 3. Schemat Bazy Danych

### Tabela: `posts`

| Kolumna             | Typ              | Opis                                              |
|---------------------|------------------|----------------------------------------------------|
| `id`                | UUID (PK)        | Unikalny identyfikator                             |
| `external_id`       | TEXT             | ID posta z Facebooka                               |
| `user_id`           | UUID (FK)        | Wlasciciel (admin)                                 |
| `group_id`          | UUID (FK)        | Grupa zrodlowa                                     |
| `category_id`       | UUID (FK)        | Kategoria                                          |
| `author_name`       | TEXT             | Nazwa autora posta                                 |
| `author_url`        | TEXT             | Link do profilu autora                             |
| `content`           | TEXT             | Pelna tresc posta                                  |
| `post_url`          | TEXT             | Permalink do posta na FB                           |
| `screenshot_url`    | TEXT (nullable)  | URL screenshota w Supabase Storage                 |
| `matched_keywords`  | TEXT[]           | Tablica dopasowanych slow kluczowych               |
| `category`          | TEXT             | Nazwa kategorii                                    |
| `status`            | TEXT             | Status workflow                                    |
| `scraped_at`        | TIMESTAMPTZ      | Data scrapowania                                   |
| `human_action_taken`| BOOLEAN          | Czy pracownik podjal akcje                         |

### Tabela: `groups`

| Kolumna       | Typ         | Opis                          |
|---------------|-------------|--------------------------------|
| `id`          | UUID (PK)   | Unikalny identyfikator         |
| `user_id`     | UUID (FK)   | Wlasciciel                     |
| `name`        | TEXT        | Nazwa grupy (np. 'mywpolsce')  |
| `url`         | TEXT        | URL grupy FB                   |
| `category_id` | UUID (FK)   | Domyslna kategoria             |
| `is_active`   | BOOLEAN     | Czy aktywna do skanowania      |

### Tabela: `keywords`

| Kolumna       | Typ         | Opis                          |
|---------------|-------------|--------------------------------|
| `id`          | UUID (PK)   | Unikalny identyfikator         |
| `user_id`     | UUID (FK)   | Wlasciciel                     |
| `keyword`     | TEXT        | Slowo kluczowe (np. 'visa')    |
| `category_id` | UUID (FK)   | Kategoria                      |
| `match_count` | INTEGER     | Licznik trafien                 |
| `is_active`   | BOOLEAN     | Czy aktywne                    |

### Tabela: `categories`

| Kolumna      | Typ         | Opis                          |
|--------------|-------------|--------------------------------|
| `id`         | UUID (PK)   | Unikalny identyfikator         |
| `user_id`    | UUID (FK)   | Wlasciciel                     |
| `name`       | TEXT        | Nazwa (np. 'legalizacja')      |
| `color`      | TEXT        | Kolor w UI                     |
| `is_default` | BOOLEAN     | Czy domyslna                   |

### Tabela: `bot_instances`

| Kolumna          | Typ         | Opis                                     |
|------------------|-------------|-------------------------------------------|
| `id`             | UUID (PK)   | Unikalny identyfikator                    |
| `user_id`        | UUID (FK)   | Wlasciciel                                |
| `name`           | TEXT        | Nazwa bota (np. 'FB-Bot-MacBook.local')   |
| `type`           | TEXT        | Typ: 'unified'                            |
| `status`         | TEXT        | 'online' / 'offline' / 'error'           |
| `last_heartbeat` | TIMESTAMPTZ | Ostatni heartbeat (co 60s)                |
| `posts_today`    | INTEGER     | Licznik postow dzisiaj                    |
| `config`         | JSONB       | Konfiguracja bota                         |

### Tabela: `alerts`

| Kolumna       | Typ         | Opis                                               |
|---------------|-------------|-----------------------------------------------------|
| `id`          | UUID (PK)   | Unikalny identyfikator                              |
| `user_id`     | UUID (FK)   | Wlasciciel                                          |
| `type`        | TEXT        | 'checkpoint' / 'error' / 'pattern_risk' / 'bot_offline' |
| `message`     | TEXT        | Tresc alertu                                        |
| `metadata`    | JSONB       | Dodatkowe dane (risk score, URL)                    |
| `status`      | TEXT        | 'new' / 'reviewed' / 'resolved'                    |

### Tabela: `processed_posts` (state tracking)

| Kolumna        | Typ         | Opis                          |
|----------------|-------------|--------------------------------|
| `id`           | UUID (PK)   | Unikalny identyfikator         |
| `group_id`     | UUID (FK)   | Grupa                          |
| `external_id`  | TEXT        | ID posta z FB                  |
| `processed_at` | TIMESTAMPTZ | Data przetworzenia             |
| UNIQUE         |             | (group_id, external_id)        |

### Tabela: `user_profiles`

| Kolumna        | Typ         | Opis                          |
|----------------|-------------|--------------------------------|
| `id`           | UUID (PK/FK)| FK do auth.users               |
| `email`        | TEXT        | Email uzytkownika              |
| `role`         | TEXT        | 'admin' / 'user'              |
| `display_name` | TEXT        | Nazwa wyswietlana              |

### Statusy postow

| Status       | Ustawiany przez | Opis                                       |
|--------------|-----------------|---------------------------------------------|
| `new`        | fb-bot.js       | Screenshot sie nie udal (brak screena)      |
| `done`       | fb-bot.js       | Gotowy - ma screenshot i dane              |
| `error`      | fb-bot.js       | Blad przetwarzania                          |
| `processed`  | Frontend        | Opracowany przez pracownika                 |
| `rejected`   | Frontend        | Odrzucony przez pracownika                  |

### Storage

- **Bucket:** `screenshots` (publiczny)
- **Format nazwy:** `post_{externalId}_{timestamp}.png`
- **URL:** `https://[PROJECT].supabase.co/storage/v1/object/public/screenshots/[filename]`

---

## 4. Workflow Bota

### 4.1 Cykl zycia sesji

```
runBot()
  │
  ├─ Sprawdz cooldown (checkpoint w ciagu 24h?)
  ├─ Pobierz grupy i slowa kluczowe z Supabase
  ├─ Zarejestruj bota w bot_instances
  ├─ Uruchom heartbeat (co 60s)
  │
  └─ PETLA:
      │
      ├─ refreshDataFromDB()
      ├─ sessionManager.shouldWork()?
      │   ├─ isWorkingDay() → Pon-Pt (config)
      │   └─ isActiveHours() → losowy zakres np. 08:15-17:45
      │
      ├─ breakInManager.getStatus()
      │   └─ Dzien 1-2: 20% | Dzien 3-4: 40% | Dzien 5-7: 70% | Tydzien 2+: 100%
      │
      ├─ selectGroupsForSession()
      │   ├─ Fisher-Yates shuffle
      │   └─ 60% szans: 1 grupa, 40%: 2 grupy
      │
      └─ Dla kazdej grupy:
          │
          ├─ browserLock.acquire('fb-bot')
          ├─ puppeteer.launch({ userDataDir: browser-profile/ })
          ├─ deviceFingerprint.applyFingerprint(page)
          ├─ warmupSession(page)
          │   ├─ facebook.com → scroll newsfeed 15-45s
          │   ├─ 30%: klik powiadomienia
          │   └─ 20%: czytaj losowy post 5-15s
          │
          ├─ page.goto(grupa.url)
          ├─ performRandomNavigation(page)
          ├─ scrapeFacebook(page, grupa)
          │   │
          │   ├─ Czekaj na [role="feed"]
          │   ├─ humanScroll()
          │   ├─ Pobierz [role="article"] elementy
          │   │
          │   └─ Dla kazdego posta:
          │       ├─ idleBehaviors.performIdleAction()
          │       ├─ errorSimulation.simulateHumanErrors()
          │       ├─ Ekstrakcja: autor, tresc, URL, externalId
          │       ├─ statefulScanner.processPost()
          │       │   └─ Sprawdz processed_posts → skip jesli znany
          │       ├─ matchKeywords(tresc)
          │       │
          │       └─ Jesli TRAFIENIE:
          │           ├─ expandTruncatedPost() → klik "Zobacz wiecej"
          │           ├─ takePostScreenshot() → postHandle.screenshot()
          │           │   ├─ Upload do Supabase Storage
          │           │   └─ Usun plik lokalny
          │           ├─ savePostToSupabase(status: 'done', screenshot_url)
          │           ├─ sendToN8n(webhook)
          │           └─ incrementKeywordMatchCount()
          │
          ├─ cooldownSession(page)
          │   ├─ Zostan 10-30s, scrolluj
          │   ├─ 40%: wroc na newsfeed
          │   └─ 15%: odwiedz losowy profil
          │
          ├─ browser.close()
          └─ browserLock.release('fb-bot')
```

### 4.2 Obsluga bledow screenshota

| Scenariusz                     | Rezultat                                          |
|--------------------------------|---------------------------------------------------|
| Screenshot + upload OK         | Post: `status: 'done'`, `screenshot_url: URL`     |
| Screenshot failuje             | Post: `status: 'new'`, `screenshot_url: null`     |
| Upload do Storage failuje      | Post: `status: 'new'`, `screenshot_url: null`     |
| Post juz istnieje w Supabase   | Duplikat obsluzony (error 23505), skip            |

---

## 5. Mechanizmy Anty-Detekcji

### 5.1 Fingerprinting urzadzenia

Kazda sesja generuje losowy fingerprint:

| Parametr           | Wartosc                                              |
|--------------------|-------------------------------------------------------|
| Viewport           | 1920x1080, 1366x768, 1440x900, 1536x864, 1280x720  |
| Timezone           | Europe/Warsaw                                         |
| Jezyk              | pl-PL, en-US, pl (rozne kombinacje)                 |
| Platform           | Linux x86_64                                          |
| CPU cores          | 4-12 (losowe)                                         |
| RAM                | 4/8/16 GB (losowe)                                    |
| Screen             | 1920x1080 (stale)                                     |
| User-Agent         | Natywny Chrome (nie nadpisujemy)                      |

### 5.2 Ludzkie zachowania

- **Mysz:** Krzywe Beziera z jitterem (10-25 krokow), losowy offset w elemencie
- **Scroll:** Plynny w losowym kierunku (80% w dol), micro-scroll wstecz (30%), pauzy czytelnicze
- **Pisanie:** 50-150ms/znak, okazjonalne literowki z korekcja backspace
- **Opoznienia:** Rozklad Gaussa: 2-5s miedzy akcjami, 1-3s przed scrollem, 3-8s po ladowaniu strony

### 5.3 Symulacja bledow

- 5-10% szans na klikniecie obok celu (±20-30px)
- Literowki z natychmiastowa korekcja
- Over-scrolling i cofanie
- Podwojne klikniecia

### 5.4 Zachowania bezczynnosci

- Mikro-ruchy myszy (jitter 2-5px)
- Nawigacja klawiatura (strzalki, Tab, Escape)
- Zmiana focusu elementow
- Przejscia blur/focus strony
- 7% szans na symulacje zmiany taba

### 5.5 Harmonogram pracy

| Parametr              | Wartosc                                    |
|-----------------------|--------------------------------------------|
| Dni robocze           | Poniedzialek-Piatek                        |
| Godziny startu        | Losowe 07:30-09:30 (nowe codziennie)      |
| Godziny konca         | Losowe 16:30-18:30 (nowe codziennie)      |
| Godziny szczytu       | 9-11 (1.3x), 13-15 (1.2x)                |
| Przerwa miedzy sesjami| 25-75 minut (losowe)                       |
| Weekend               | Bot nie dziala (weekendReduction: 0)       |

### 5.6 Break-in (stopniowe zwiekszanie aktywnosci)

| Okres       | Aktywnosc | Max sesji/dzien | Max postow/dzien |
|-------------|-----------|-----------------|-------------------|
| Dzien 1-2   | 20%       | 1-2             | 3-5               |
| Dzien 3-4   | 40%       | 2-3             | ~8                |
| Dzien 5-7   | 70%       | 3-4             | ~12               |
| Tydzien 2+  | 100%      | Bez limitu      | Bez limitu        |

### 5.7 Deduplikacja (Stateful Scanning)

- Tabela `processed_posts`: pamiec przetworzonych postow (24h TTL)
- Cache w pamieci per sesja
- Stop po 3 znanych postach z rzedu (consecutiveKnownLimit)
- Zapobiega nieskonczonemu scrollowaniu tych samych postow

### 5.8 Wykrywanie checkpointow

- Detekcja ekranow weryfikacji Facebooka
- Screenshot checkpointu + alert do bazy
- Cooldown 24h (wymaga recznej weryfikacji)

---

## 6. Frontend (Dashboard)

### 6.1 Stack technologiczny

- **Next.js 15** + TypeScript
- **Tailwind CSS** + **shadcn/ui**
- **Supabase** (Auth, Database, Realtime, Storage)
- **Lucide React** (ikony)

### 6.2 Strony

| Strona          | Opis                                                |
|-----------------|------------------------------------------------------|
| `/`             | Dashboard: posty, statystyki, filtry                 |
| `/bots`         | Monitorowanie instancji botow (heartbeat, status)    |
| `/groups`       | CRUD grup Facebook do skanowania                     |
| `/keywords`     | CRUD slow kluczowych + bulk import                   |
| `/categories`   | CRUD kategorii (kolory, nazwy)                       |
| `/alerts`       | Przegladanie alertow systemowych                     |
| `/admin/users`  | Zarzadzanie uzytkownikami (tylko admin)               |
| `/login`        | Logowanie (Supabase Auth)                            |

### 6.3 Role uzytkownikow

| Rola    | Uprawnienia                                              |
|---------|-----------------------------------------------------------|
| `admin` | Pelny CRUD na grupach/slowach/kategoriach + zarzadzanie uzytkownikami |
| `user`  | Podglad konfiguracji + zarzadzanie postami (status)       |

### 6.4 Realtime

Dashboard subskrybuje zmiany w tabeli `posts` przez Supabase Realtime - nowe posty pojawiaja sie automatycznie bez odswiezania strony.

---

## 7. Konfiguracja

### 7.1 Zmienne srodowiskowe (.env)

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# Frontend
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Bot preferuje `SUPABASE_SERVICE_ROLE_KEY` (omija RLS). Frontend uzywa `ANON_KEY` (RLS aktywne).

### 7.2 Konfiguracja konta (accounts/main-account/config.json)

```json
{
    "accountType": "main",
    "paths": {
        "screenshots": "../accounts/main-account/screenshots",
        "browserProfile": "../accounts/main-account/browser-profile",
        "learning": "../accounts/main-account/learning-data"
    },
    "browserConfig": {
        "headless": false,
        "windowSize": { "width": 1366, "height": 768 }
    }
}
```

Kluczowe: `browserProfile` wskazuje na folder `userDataDir` - Chrome przechowuje tam cookies w SQLite (nie uzywamy JSON cookies).

### 7.3 Konfiguracja scrapera (config/scraper.json)

Zawiera: liste grup, webhook n8n, limity bezpieczenstwa (godziny, dni, interwaly, peak hours), konfiguracje fault tolerance i distributed coordinator.

---

## 8. Uruchamianie

### 8.1 Pierwsze Logowanie

Pierwsze logowanie - RECZNIE

To jest kluczowy moment. Bot NIE loguje sie automatycznie. Musisz:

1. Uruchom bota: node fb-bot.js
2. Bot otworzy Chrome z pustym profilem (accounts/main-account/browser-profile/)
3. Warmup (session-warmup.js:11) przechodzi na https://www.facebook.com
4. Facebook pokaze strone logowania (bo profil jest swiezy)
5. Zaloguj sie recznie w tym oknie Chrome - wpisz email, haslo, 2FA
6. Po zalogowaniu zamknij bota (Ctrl+C)
7. Chrome zapisal sesje w browser-profile/ - cookies, localStorage, wszystko

Od tego momentu kazde nastepne node fb-bot.js otworzy Chrome z zapisana sesja i Facebook bedzie Cie "pamietal".

Nie musisz tworzyc zadnych plikow cookies ani folderow recznie - account-manager.js:138-141 automatycznie tworzy
brakujace foldery:
if (!fs.existsSync(browserProfilePath)) {
    fs.mkdirSync(browserProfilePath, { recursive: true });
}

### Szybki start

```bash
# 1. Zainstaluj zaleznosci
npm install
cd frontend && npm install && cd ..

# 2. Skopiuj i wypelnij .env
cp .env.example .env

# 3. Zaloguj sie na FB w profilu Chrome
#    (uruchom raz recznie, zaloguj sie, zamknij)

# 4. Uruchom bota
node fb-bot.js

# 5. Uruchom frontend (osobny terminal)
cd frontend && npm run dev
```

### Skrypt startowy

```bash
./start-system.sh   # Uruchamia fb-bot.js + frontend w osobnych terminalach
```

### Zarzadzanie kontami

```bash
./manage-accounts.sh status   # Status kont
./manage-accounts.sh test     # Test bota
./manage-accounts.sh clean    # Czyszczenie cache/profili
```

---

## 9. Monitorowanie

### Heartbeat

Bot wysyla heartbeat co 60s do tabeli `bot_instances`:
- `status: 'online'` / `'offline'`
- `last_heartbeat` (timestamp)
- `posts_today` (licznik)

### Alerty

Bot loguje alerty do tabeli `alerts`:
- `checkpoint` - wykryto ekran weryfikacji FB
- `pattern_risk` - wysoki wynik ryzyka bana (>high)
- `error` - bledy systemowe

### Risk Prediction

Po kazdej sesji bot oblicza wynik ryzyka na podstawie:
- Liczby przetworzonych postow
- Czasu trwania sesji
- Predkosci akcji
- Wynik > high/critical → alert do bazy

---

## 10. Bezpieczenstwo

- **Supabase Auth** - logowanie emailem
- **RLS (Row Level Security)** - izolacja danych per user_id
- **Service Role Key** - bot omija RLS (zapisuje posty dla dowolnego usera)
- **Middleware** - ochrona tras w Next.js (auth + role check)
- **Browser Lock** - zapobiega jednoczesnej pracy dwoch instancji na jednym profilu Chrome
- **puppeteer-extra-plugin-stealth** - ukrywanie automatyzacji
- **Brak --single-process/--no-zygote** - usuniete flagi typowe dla Docker/botow

---

*Dokumentacja v2.0 - 2026-02-07 (po scaleniu scanner + screenshot bot)*

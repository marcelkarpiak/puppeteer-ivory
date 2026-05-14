# Architecture

## System Overview

```
┌───────────────────────────────────────────────────────────────┐
│                        FB-BOT.JS                              │
│                   (unified bot - 1 proces)                    │
│                                                               │
│  1. Skanuje feed grupy FB                                     │
│  2. Filtruje posty według słów kluczowych                     │
│  3. Robi screenshot elementu DOM (inline)                     │
│  4. Uploaduje screenshot do Supabase Storage                  │
│  5. Zapisuje post do Supabase (status='done')                 │
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
│                    FRONTEND (Next.js 16)                      │
│  - Dashboard z postami, statystykami, filtrami                │
│  - Zarządzanie grupami, słowami kluczowymi, kategoriami       │
│  - Monitorowanie botów (heartbeat, alerty)                    │
│  - Panel admina (zarządzanie użytkownikami)                   │
└───────────────────────────────────────────────────────────────┘
```

## Struktura projektu

```
puppeteer-ivory/
├── fb-bot.js                      # Główny bot
├── config/
│   └── scraper.json               # Safety/timing settings (czytane tylko z bazy)
├── accounts/
│   └── main-account/
│       ├── config.json            # Konfiguracja konta
│       ├── browser-profile/       # Chrome userDataDir (cookies, sesja)
│       ├── screenshots/           # Tymczasowe screenshoty przed uploadem
│       ├── learning-data/         # Stan break-in, cooldown
│       ├── cache/                 # Cache postów
│       └── logs/                  # Logi sesji
├── lib/                           # Moduły bota (patrz niżej)
├── frontend/                      # Next.js dashboard
├── supabase/
│   ├── setup_complete.sql         # Schemat bazy (single source of truth)
│   └── migrations/                # Historia migracji
├── shared-state/                  # State dla DistributedCoordinator
├── cache/                         # Cache postów (CacheManager)
└── learning-data/                 # Wzorce zachowań (BehavioralLearning)
```

## Moduły lib/

| Moduł | Funkcja |
|-------|---------|
| `account-manager.js` | Ładuje konta z `accounts/*/config.json`, `getChromePath()`, `getBrowserOptions()` |
| `browser-lock.js` | File-lock zapobiegający równoczesnemu dostępowi do profilu Chrome |
| `session-manager.js` | Active hours, working days, peak hours |
| `session-warmup.js` | Pre-scan warmup (newsfeed, powiadomienia) — weryfikuje login |
| `session-cooldown.js` | Post-scan cooldown |
| `device-fingerprint.js` | Override timezone/language/platform + CDP evasion. Hardware (CPU/RAM/screen/WebGL) z prawdziwego Chrome |
| `social-interactions.js` | Session-budgeted reactions (65% sesji = 0 interakcji). Nigdy na keyword-matched posts |
| `break-in-manager.js` | Stopniowa rampa aktywności w pierwszym tygodniu |
| `stateful-scanner.js` | Deduplikacja przez tabelę `processed_posts` |
| `human-behavior.js` | Delays, scrolling, clicking, ban detection, checkpoint handling |
| `human-idle-behaviors.js` | Mikro-ruchy myszy, scroll, tab switches |
| `human-error-simulation.js` | Misclicks, typos, over-scrolling |
| `behavioral-learning.js` | Zapisuje akcje do analizy wzorców |
| `risk-prediction.js` | Wynik ryzyka detekcji per sesja |
| `fault-tolerance.js` | Retry + circuit breaker |
| `distributed-coordinator.js` | Koordynacja wielu instancji (`shared-state/`) |
| `cache-manager.js` | Lokalny cache postów |

## Workflow bota

```
runSingleSession()
  ├─ Pobierz grupy i słowa kluczowe z Supabase
  ├─ sessionManager.shouldWork()?
  │   ├─ isWorkingDay() → dni z config
  │   └─ isActiveHours() → losowy zakres np. 08:15-17:45
  │
  ├─ breakInManager.getStatus()
  │   └─ Dzień 1-2: 20% | 3-4: 40% | 5-7: 70% | Tydzień 2+: 100%
  │
  ├─ selectGroupsForSession() — 60% szans: 1 grupa, 40%: 2 grupy
  │
  └─ Dla każdej grupy:
      ├─ browserLock.acquire('fb-bot')
      ├─ puppeteer.launch({ userDataDir: browser-profile/ })
      ├─ deviceFingerprint.applyFingerprint(page)
      ├─ warmupSession(page) — facebook.com → scroll newsfeed 15-45s
      │
      ├─ page.goto(grupa.url)
      ├─ scrapeFacebook(page, grupa)
      │   └─ Dla każdego posta:
      │       ├─ statefulScanner.processPost() → skip jeśli znany
      │       ├─ matchKeywords(treść)
      │       │
      │       └─ Jeśli TRAFIENIE:
      │           ├─ expandTruncatedPost() → klik "Zobacz więcej"
      │           ├─ takePostScreenshot() → upload do Supabase Storage
      │           ├─ savePostToSupabase(status: 'done', screenshot_url)
      │           └─ incrementKeywordMatchCount()
      │
      ├─ cooldownSession(page)
      ├─ browser.close()
      └─ browserLock.release('fb-bot')
```

### Obsługa błędów screenshota

| Scenariusz | Rezultat |
|------------|----------|
| Screenshot + upload OK | `status: 'done'`, `screenshot_url: URL` |
| Screenshot failuje | `status: 'new'`, `screenshot_url: null` |
| Upload do Storage failuje | `status: 'new'`, `screenshot_url: null` |
| Post już istnieje | Duplikat (error 23505), skip |

## Schemat bazy danych

### `posts`
| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | UUID | PK |
| `external_id` | TEXT | ID posta z Facebooka |
| `user_id` | UUID | FK do auth.users |
| `group_id` | UUID | FK do `groups` |
| `category_id` | UUID | FK do `categories` |
| `author_name`, `author_url` | TEXT | Autor |
| `content` | TEXT | Treść posta |
| `post_url` | TEXT | Permalink |
| `screenshot_url` | TEXT | URL w Supabase Storage (nullable) |
| `matched_keywords` | TEXT[] | Dopasowane słowa |
| `category` | TEXT | Nazwa kategorii |
| `status` | TEXT | `new` / `done` / `error` / `processed` / `rejected` |
| `scraped_at` | TIMESTAMPTZ | |
| `human_action_taken` | BOOLEAN | |

### `groups`
| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | UUID | PK |
| `user_id` | UUID | Właściciel |
| `name`, `url` | TEXT | |
| `category_id` | UUID | Domyślna kategoria |
| `is_active` | BOOLEAN | |

### `keywords`
| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | UUID | PK |
| `user_id` | UUID | |
| `keyword` | TEXT | |
| `category_id` | UUID | |
| `match_count` | INTEGER | Licznik trafień |
| `is_active` | BOOLEAN | |

### `categories`
| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | UUID | PK |
| `user_id` | UUID | |
| `name`, `color` | TEXT | |
| `is_default` | BOOLEAN | |

Domyślne kategorie tworzone automatycznie przy rejestracji użytkownika: Voiceboty, Chatboty, Automatyzacje, Custom Software, AI / ML, Inne.

### `bot_instances`
| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | UUID | PK |
| `user_id` | UUID | |
| `name` | TEXT | np. `FB-Bot-MacBook.local` |
| `status` | TEXT | `online` / `offline` / `error` |
| `last_heartbeat` | TIMESTAMPTZ | co 60s |
| `posts_today` | INTEGER | |
| `config` | JSONB | |

### `alerts`
| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | UUID | PK |
| `user_id` | UUID | |
| `type` | TEXT | `checkpoint` / `error` / `pattern_risk` / `bot_offline` |
| `message` | TEXT | |
| `metadata` | JSONB | |
| `status` | TEXT | `new` / `reviewed` / `resolved` |

### `processed_posts` (deduplikacja)
| Kolumna | Typ |
|---------|-----|
| `group_id` + `external_id` | UNIQUE |
| `processed_at` | TIMESTAMPTZ |

### `user_profiles`
| Kolumna | Typ | Opis |
|---------|-----|------|
| `id` | UUID | FK do auth.users |
| `email` | TEXT | |
| `role` | TEXT | `admin` / `user` |
| `display_name` | TEXT | |

### Storage
- Bucket: `screenshots` (publiczny)
- Format nazwy: `post_{externalId}_{timestamp}.png`

## Mechanizmy anty-detekcji

### Fingerprinting
| Parametr | Wartość |
|----------|---------|
| Timezone | Europe/Warsaw |
| Język | pl-PL, en-US, pl |
| Platform | Linux x86_64 |
| Hardware (CPU/RAM/screen/WebGL) | Natywne Chrome — NIE nadpisujemy |
| User-Agent | Natywne Chrome |

### Ludzkie zachowania
- **Mysz:** krzywe Beziera z jitterem (10-25 kroków)
- **Scroll:** płynny, 80% w dół, micro-scroll wstecz (30%), pauzy czytelnicze
- **Pisanie:** 50-150ms/znak, literówki z korekcją
- **Opóźnienia:** rozkład Gaussa, 2-5s między akcjami

### Symulacja błędów
- 5-10% szans na klik obok celu (±20-30px)
- Literówki z natychmiastową korekcją
- Over-scrolling i cofanie

### Harmonogram pracy
| Parametr | Wartość |
|----------|---------|
| Dni robocze | Pon-Pt (konfigurowalne) |
| Start | Losowe 06:00-07:00 (nowe codziennie) |
| Koniec | Losowe 23:00-23:59 |
| Peak hours | 9-11 (1.3x), 13-15 (1.2x) |
| Przerwa między sesjami | 25-75 min |

### Break-in
| Okres | Aktywność | Max sesji/dzień |
|-------|-----------|-----------------|
| Dzień 1-2 | 20% | 1-2 |
| Dzień 3-4 | 40% | 2-3 |
| Dzień 5-7 | 70% | 3-4 |
| Tydzień 2+ | 100% | Bez limitu |

### Deduplikacja
- Tabela `processed_posts` (TTL 24h)
- Stop po 3 znanych postach z rzędu

### Wykrywanie checkpointów
- Detekcja ekranów weryfikacji FB
- Screenshot + alert do bazy
- Cooldown 24h (wymaga ręcznej weryfikacji)

## Frontend

### Stack
- Next.js 16 + React 19 + TypeScript
- Tailwind 4 + shadcn/ui (Radix)
- Supabase (Auth, DB, Realtime, Storage)

### Strony
| Strona | Opis |
|--------|------|
| `/` | Dashboard: posty, statystyki, filtry |
| `/bots` | Monitoring instancji botów |
| `/groups` | CRUD grup FB |
| `/keywords` | CRUD słów kluczowych + bulk import |
| `/categories` | CRUD kategorii (admin) |
| `/alerts` | Alerty systemowe |
| `/admin/users` | Zarządzanie użytkownikami (admin) |
| `/login` | Supabase Auth |

### Role
| Rola | Uprawnienia |
|------|-------------|
| `admin` | Pełny CRUD + zarządzanie użytkownikami |
| `user` | Read-only konfiguracja, zarządzanie statusami postów |

### Realtime
Dashboard subskrybuje zmiany w `posts` przez Supabase Realtime — nowe posty pojawiają się bez odświeżania.

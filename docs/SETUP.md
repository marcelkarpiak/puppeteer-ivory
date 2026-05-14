# Setup

## Wymagania
- Node.js 18+
- Chrome (system-wide install, nie Chromium z puppeteera)
- Konto Supabase z dostępem do projektu

## Instalacja

```bash
# 1. Klonuj repo i zainstaluj zależności
npm install
cd frontend && npm install && cd ..

# 2. Skopiuj i wypełnij .env
cp .env.example .env

# 3. Uruchom Supabase setup (jeśli nowy projekt)
#    Wykonaj supabase/setup_complete.sql w SQL Editor
```

## Zmienne środowiskowe

### Root `.env` (bot)
```env
SUPABASE_URL=https://[project].supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...           # Preferowany — omija RLS
SUPABASE_ANON_KEY=eyJ...                   # Fallback
```

### `frontend/.env.local`
```env
NEXT_PUBLIC_SUPABASE_URL=https://[project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Bot preferuje `SUPABASE_SERVICE_ROLE_KEY` (omija RLS, może zapisywać posty dla dowolnego użytkownika). Frontend zawsze używa `ANON_KEY` z aktywnym RLS.

## Konfiguracja konta

`accounts/main-account/config.json`:

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

`browserProfile` to ścieżka do `userDataDir` — Chrome przechowuje tam cookies w SQLite. **Nie używamy plików cookies JSON.**

## Konfiguracja scrapera

`config/scraper.json` zawiera tylko ustawienia bezpieczeństwa/timing — grupy i słowa kluczowe są zarządzane przez dashboard:

- `safety.activeHours` — godziny pracy (losowane z zakresu)
- `safety.workingDays` — dni robocze
- `safety.intervalMinutes` — przerwa między sesjami (25-75 min)
- `safety.faultTolerance` — retry + circuit breaker
- `safety.distributed` — koordynacja wielu instancji

## Pierwsze logowanie do Facebooka

**Bot NIE loguje się automatycznie.** Pierwsza sesja wymaga ręcznego logowania:

1. `node fb-bot.js`
2. Bot otworzy Chrome z pustym profilem
3. Warmup nawiguje na `https://www.facebook.com`
4. Facebook pokaże stronę logowania
5. **Zaloguj się ręcznie** w oknie Chrome (email, hasło, 2FA)
6. Zamknij bota (`Ctrl+C`)
7. Sesja zapisana w `accounts/main-account/browser-profile/`

Od tego momentu każde `node fb-bot.js` otworzy Chrome z zapisaną sesją.

`account-manager.js` automatycznie tworzy brakujące foldery (`browser-profile/`, `cache/`, `learning-data/`, `screenshots/`, `logs/`).

## Konfiguracja Supabase

Po utworzeniu projektu w Supabase:

1. Wykonaj `supabase/setup_complete.sql` w SQL Editor (tabele, RLS, triggery, bucket storage)
2. W panelu Authentication włącz Email provider
3. Utwórz pierwszego użytkownika (zarejestruj się przez frontend lub przez Auth panel)
4. Ustaw mu rolę `admin` w tabeli `user_profiles`:
   ```sql
   UPDATE user_profiles SET role = 'admin' WHERE email = 'twoj@email.pl';
   ```

Po zalogowaniu jako admin dodaj grupy FB i słowa kluczowe przez dashboard.

## Sprawdzenie stealth

```bash
node test-stealth.js          # Test ukrywania automatyzacji
node test-system-chrome.js    # Test detekcji systemowego Chrome
```

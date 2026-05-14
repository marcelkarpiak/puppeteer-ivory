# IvoryLab FB Scraper

System monitorowania grup Facebook pod kątem lead generation dla usług IvoryLab (voiceboty, chatboty, automatyzacje, custom software, AI).

Bot Puppeteer skanuje wybrane grupy Facebook, dopasowuje posty do słów kluczowych, zapisuje dane i screenshoty w Supabase. Dashboard Next.js służy do konfiguracji i przeglądu znalezisk.

```
fb-bot.js  ──►  Supabase (DB + Storage + Auth)  ◄──  Frontend (Next.js dashboard)
```

Bot i frontend są **niezależne** — komunikują się wyłącznie przez Supabase.

---

## Wymagania

- Node.js 18+
- Google Chrome zainstalowany w domyślnej lokalizacji systemu
- Konto Supabase z wdrożonym schematem (`supabase/setup_complete.sql`)

---

## Instalacja

```bash
# 1. Zależności bota
npm install

# 2. Zależności dashboardu
cd frontend && npm install && cd ..
```

---

## Zmienne środowiskowe

**Bot — plik `.env` w katalogu głównym:**
```env
SUPABASE_URL=https://twoj-projekt.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # klucz service role (Settings → API)
SUPABASE_ANON_KEY=eyJ...           # klucz anon (fallback)
```

**Dashboard — plik `frontend/.env.local`:**
```env
NEXT_PUBLIC_SUPABASE_URL=https://twoj-projekt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

---

## Pierwsze uruchomienie — logowanie do Facebooka

Bot używa trwałego profilu Chrome (`accounts/main-account/browser-profile/`) zamiast cookies w pliku JSON. Sesja logowania zachowuje się między restartami bota.

**Logowanie wykonuje się RAZ — ręcznie, przed pierwszym uruchomieniem bota.**

### Krok 1 — otwórz Chrome z profilem bota

**macOS:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --user-data-dir="$(pwd)/accounts/main-account/browser-profile"
```

**Linux:**
```bash
google-chrome --user-data-dir="$(pwd)/accounts/main-account/browser-profile"
```

**Windows (PowerShell):**
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --user-data-dir="$PWD\accounts\main-account\browser-profile"
```

### Krok 2 — zaloguj się do Facebooka

W otwartym oknie Chrome przejdź na `facebook.com` i zaloguj się na konto botowe. Zaznacz **„Pozostań zalogowany"**.

### Krok 3 — zamknij Chrome

Zamknij okno Chrome — sesja jest zapisana w profilu.

### Krok 4 — uruchom bota

```bash
node fb-bot.js
```

Bot otworzy Chrome z tym samym profilem i będzie już zalogowany. Przy każdym kolejnym uruchomieniu logowanie nie jest wymagane — chyba że Facebook wymusi ponowną weryfikację (checkpoint).

---

## Codzienna obsługa

### Uruchomienie bota

```bash
node fb-bot.js
```

Bot działa w pętli — samodzielnie zarządza harmonogramem (aktywne godziny, dni robocze, przerwy). Zatrzymanie: `Ctrl+C`.

### Uruchomienie dashboardu

```bash
npm run dev --prefix frontend
# lub
cd frontend && npm run dev
```

Dashboard dostępny na `http://localhost:3000`.

### Testy przed pierwszym uruchomieniem

```bash
node test-system-chrome.js   # sprawdza czy Chrome startuje poprawnie
node test-stealth.js         # sprawdza czy navigator.webdriver nie jest wykryty
```

---

## Konfiguracja systemu (dashboard)

Po zalogowaniu do dashboardu skonfiguruj:

1. **Kategorie** (`/categories`) — grupowanie słów kluczowych (np. Voiceboty, Chatboty)
2. **Słowa kluczowe** (`/keywords`) — frazy do wyszukiwania w postach
3. **Grupy** (`/groups`) — URL-e grup Facebook do monitorowania

Bot pobiera grupy i słowa kluczowe z Supabase przed każdą sesją. Jeśli tabele są puste, sesja jest pomijana z ostrzeżeniem w logach.

---

## Troubleshooting

**Bot wyświetla `Uzytkownik NIE jest zalogowany`**
→ Wykonaj ponownie kroki 1–3 z sekcji logowania powyżej.

**Chrome nie startuje**
→ Sprawdź czy Chrome jest zainstalowany w domyślnej lokalizacji. Uruchom `node test-system-chrome.js`.

**Checkpoint Facebooka (weryfikacja tożsamości)**
→ Bot zatrzymuje się automatycznie na 24h i zapisuje alert w dashboardzie. Otwórz Chrome z profilem bota (krok 1), przejdź przez weryfikację ręcznie, zamknij Chrome, uruchom bota ponownie.

**Brak postów mimo aktywnych słów kluczowych**
→ Sprawdź czy grupy i słowa kluczowe są ustawione jako aktywne w dashboardzie.

---

## Stack

- **Bot:** Node.js, `puppeteer-real-browser`, Supabase JS
- **Frontend:** Next.js 16, React 19, Tailwind 4, shadcn/ui, Supabase Auth
- **Backend:** Supabase (PostgreSQL + Storage + Auth)

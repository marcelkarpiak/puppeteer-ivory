# 🚀 Deployment na Vercel

Instrukcja wrzucenia frontendu na Vercel (darmowy hosting).

## 📋 Wymagania

- Konto GitHub (do połączenia z Vercel)
- Konto Vercel (darmowe) - https://vercel.com
- Dane Supabase (URL i ANON_KEY)

## 🎯 Krok po kroku

### 1. Przygotuj repozytorium Git

```bash
# W katalogu głównego projektu
git init
git add .
git commit -m "Initial commit - Scraper Dashboard"

# Stwórz repo na GitHub i pushuj
git remote add origin https://github.com/twoj-username/scraper-dashboard.git
git push -u origin main
```

### 2. Połącz z Vercel

1. Wejdź na https://vercel.com
2. Kliknij **"Add New Project"**
3. **Import Git Repository** - wybierz swoje repo
4. **Root Directory** - ustaw na `frontend`
5. **Framework Preset** - automatycznie wykryje Next.js

### 3. Skonfiguruj zmienne środowiskowe

W ustawieniach projektu Vercel dodaj:

```
NEXT_PUBLIC_SUPABASE_URL=https://twoj-projekt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=twoj-anon-key
```

**Ważne:** Zmienne MUSZĄ zaczynać się od `NEXT_PUBLIC_` żeby działały w przeglądarce!

### 4. Deploy

Kliknij **"Deploy"** - Vercel automatycznie:
- Zainstaluje zależności (`npm install`)
- Zbuduje projekt (`npm run build`)
- Wdroży na CDN

### 5. Gotowe! 🎉

Twój dashboard będzie dostępny pod adresem:
```
https://twoj-projekt.vercel.app
```

## 🔄 Automatyczne deploymenty

Każdy push do brancha `main` automatycznie wdroży nową wersję!

```bash
# Zmieniasz kod
git add .
git commit -m "Update dashboard"
git push

# Vercel automatycznie deployuje ✨
```

## 🔧 Konfiguracja lokalna (boty)

Boty nadal uruchamiasz **lokalnie na swoim komputerze**:

```bash
node fb-bot.js
```

## 📊 Jak to działa

```
┌──────────────────────────────────┐
│  VERCEL (24/7 online)            │
│  https://twoj-projekt.vercel.app │
│  - Dashboard                     │
│  - Wyświetla posty               │
└──────────────────────────────────┘
           ↓ ↑
      (czyta dane)
           ↓ ↑
┌──────────────────────────────────┐
│  SUPABASE (24/7 online)          │
│  - Database                      │
│  - Storage                       │
│  - Realtime                      │
└──────────────────────────────────┘
           ↑
      (zapisuje)
           ↑
┌──────────────────────────────────┐
│  TWÓJ KOMPUTER (8h dziennie)     │
│  - fb-bot.js                     │
└──────────────────────────────────┘
```

## ✅ Zalety tego setupu

- ✨ **Frontend zawsze dostępny** - sprawdzisz posty z telefonu/laptopa
- 💰 **Darmowy** - Vercel Free tier wystarczy
- 🔄 **Auto-deploy** - push do GitHub = nowa wersja live
- 🚀 **Szybki** - Vercel CDN na całym świecie
- 🔒 **Bezpieczny** - boty działają lokalnie, masz kontrolę

## 🛠️ Troubleshooting

### Problem: Build fails na Vercel
**Rozwiązanie:** Sprawdź czy `Root Directory` jest ustawiony na `frontend`

### Problem: Dashboard nie łączy się z Supabase
**Rozwiązanie:** 
- Sprawdź zmienne środowiskowe w Vercel
- Muszą zaczynać się od `NEXT_PUBLIC_`
- Redeploy po dodaniu zmiennych

### Problem: Realtime nie działa
**Rozwiązanie:** Sprawdź w Supabase Dashboard czy Realtime jest włączony dla tabeli `posts`

## 📱 Dostęp z telefonu

Po deploymencie możesz:
- Otworzyć dashboard na telefonie
- Sprawdzać nowe posty w czasie rzeczywistym
- Opracowywać posty z dowolnego miejsca

## 🔗 Przydatne linki

- [Vercel Dashboard](https://vercel.com/dashboard)
- [Vercel Docs - Next.js](https://vercel.com/docs/frameworks/nextjs)
- [Supabase Dashboard](https://app.supabase.com)

## 💡 Pro tips

1. **Custom domain** - możesz dodać własną domenę w Vercel (darmowe)
2. **Preview deployments** - każdy branch dostaje własny URL do testów
3. **Analytics** - Vercel pokazuje statystyki odwiedzin
4. **Logs** - możesz sprawdzić logi w czasie rzeczywistym

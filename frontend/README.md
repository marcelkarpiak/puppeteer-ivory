# Scraper Dashboard

Nowoczesny panel zarządzania dla systemu automatycznego skanowania grup.

## 🚀 Funkcje

- **Dashboard w czasie rzeczywistym** - automatyczne odświeżanie postów przez Supabase Realtime
- **Zarządzanie postami** - przeglądaj, filtruj i zmieniaj status postów
- **Podgląd screenshotów** - wyświetlanie zrobionych zrzutów ekranu
- **Panel kontrolny botów** - instrukcje uruchamiania i monitorowania
- **Statystyki** - liczniki postów według statusów
- **Kategorie** - filtrowanie według słów kluczowych

## 📋 Wymagania

- Node.js 18+
- Konto Supabase z skonfigurowaną bazą danych
- Uruchomiony bot (fb-bot.js)

## 🛠️ Instalacja

1. **Skopiuj zmienne środowiskowe z głównego projektu:**

```bash
# Utwórz plik .env.local w katalogu frontend
cp ../.env .env.local
```

2. **Upewnij się, że plik .env.local zawiera:**

```env
NEXT_PUBLIC_SUPABASE_URL=twój-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=twój-supabase-anon-key
```

3. **Zainstaluj zależności:**

```bash
npm install
```

4. **Uruchom serwer deweloperski:**

```bash
npm run dev
```

5. **Otwórz przeglądarkę:**

```
http://localhost:3000
```

## 📊 Struktura

```
frontend/
├── app/
│   ├── page.tsx          # Główna strona (Dashboard)
│   └── globals.css       # Style globalne
├── components/
│   ├── Dashboard.tsx     # Główny komponent dashboardu
│   ├── PostsTable.tsx    # Tabela postów z akcjami
│   ├── StatsCards.tsx    # Karty statystyk
│   ├── BotControl.tsx    # Panel kontrolny botów
│   └── ui/               # Komponenty shadcn/ui
└── lib/
    ├── supabase.ts       # Klient Supabase + typy
    └── utils.ts          # Utility functions
```

## 🎯 Jak używać

### 1. Uruchom bota

```bash
cd ..
node fb-bot.js
```

### 2. Zarządzaj postami w dashboardzie

- **Wszystkie** - wszystkie posty w bazie
- **Gotowe** - posty ze screenshotami, gotowe do opracowania
- **W trakcie** - posty w trakcie przetwarzania
- **Błędy** - posty z błędami (wymagają uwagi)
- **Opracowane** - posty oznaczone jako przetworzone
- **Boty** - panel kontrolny i instrukcje

### 3. Akcje na postach

- 👁️ **Podgląd** - zobacz szczegóły posta i screenshot
- ✅ **Opracuj** - oznacz post jako przetworzony
- ❌ **Odrzuć** - odrzuć nieistotny post

## 🔄 Workflow

1. **Scraper Bot** skanuje grupę → filtruje według słów kluczowych → robi screenshot inline → uploaduje do Storage → zapisuje do Supabase (status: `done`)
2. **Dashboard** wyświetla posty `done` → pracownik oznacza jako `processed` lub `rejected`

## 🎨 Stack technologiczny

- **Next.js 15** - React framework
- **TypeScript** - type safety
- **Tailwind CSS** - styling
- **shadcn/ui** - komponenty UI
- **Supabase** - backend (database + storage + realtime)
- **Lucide React** - ikony
- **date-fns** - formatowanie dat

## 📝 Statusy postów

| Status | Opis |
|--------|------|
| `new` | Czeka na screenshot |
| `processing` | Bot robi screenshot |
| `done` | Gotowy do wyświetlenia (ma screenshot) |
| `error` | Wystąpił błąd |
| `processed` | Opracowany przez pracownika |
| `rejected` | Odrzucony przez pracownika |

## 🚀 Deployment na Vercel

Frontend możesz wrzucić na Vercel (darmowy hosting):

1. Pushuj kod na GitHub
2. Połącz repo z Vercel
3. Ustaw `Root Directory` na `frontend`
4. Dodaj zmienne środowiskowe:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Deploy!

**Szczegółowa instrukcja:** [VERCEL-DEPLOYMENT.md](./VERCEL-DEPLOYMENT.md)

## 🔗 Linki

- [Dokumentacja główna](../DOCUMENTATION.md)
- [Instrukcja n8n](../INSTRUKCJA-N8N.md)
- [Deployment na Vercel](./VERCEL-DEPLOYMENT.md)

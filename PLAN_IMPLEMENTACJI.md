# Plan implementacji - Dashboard Scrapera Facebook

## Podsumowanie

Rozbudowa dashboardu o: system autentykacji (Admin/User), zarządzanie grupami/słowami kluczowymi/kategoriami, ulepszenia postów (Kopiuj link, Przywróć), filtrowanie, alerty i monitoring botów.

---

## Faza 1: Fundament (Krytyczna)

### 1.1 Migracja bazy danych

**Plik:** `/supabase/migrations/001_multi_user_support.sql`

**Nowe tabele:**
```sql
-- Profile użytkowników (rozszerzenie Supabase Auth)
user_profiles (id, email, role, display_name, created_at)
  - role: 'admin' | 'user'

-- Kategorie leadów
categories (id, user_id, name, color, is_default, created_at)

-- Grupy Facebook
groups (id, user_id, name, url, category_id, is_active, stats, created_at)

-- Słowa kluczowe
keywords (id, user_id, keyword, category_id, match_count, is_active, created_at)

-- Alerty
alerts (id, user_id, type, message, metadata, status, created_at, resolved_at)

-- Instancje botów
bot_instances (id, user_id, name, type, status, last_heartbeat, posts_today, config)
```

**Modyfikacje istniejących tabel:**
```sql
ALTER TABLE posts ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE posts ADD COLUMN group_id UUID REFERENCES groups(id);
ALTER TABLE posts ADD COLUMN category_id UUID REFERENCES categories(id);
ALTER TABLE scraper_sessions ADD COLUMN user_id UUID;
ALTER TABLE scraper_sessions ADD COLUMN bot_instance_id UUID;
```

**RLS Policies:** Każda tabela z `user_id` dostanie polityki:
- SELECT: `auth.uid() = user_id`
- INSERT: `auth.uid() = user_id`
- UPDATE: `auth.uid() = user_id`
- DELETE: `auth.uid() = user_id`

---

### 1.2 System autentykacji

**Nowe pliki:**
```
frontend/
├── middleware.ts                    # Ochrona tras
├── lib/
│   ├── supabase-browser.ts         # Klient przeglądarki z SSR
│   ├── supabase-server.ts          # Klient serwerowy
│   └── auth-context.tsx            # Context Provider
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx              # Layout bez sidebara
│   │   └── login/page.tsx          # Strona logowania
│   └── (dashboard)/
│       ├── layout.tsx              # Layout z sidebarem
│       └── ...                     # Wszystkie chronione strony
```

**Middleware** sprawdza:
1. Czy użytkownik jest zalogowany → redirect na `/login`
2. Czy trasy `/admin/*` → sprawdź `role === 'admin'`

**Role:**
- **Admin:** Pełny dostęp - grupy, słowa kluczowe, kategorie, użytkownicy
- **User:** Tylko podgląd konfiguracji + zarządzanie postami

---

### 1.3 Nowe komponenty shadcn/ui

```bash
npx shadcn@latest add toast dropdown-menu checkbox switch tooltip popover calendar
```

---

### 1.4 Struktura nawigacji (Sidebar)

```
Dashboard (/)           - Wszyscy
Grupy (/groups)         - Admin: CRUD, User: podgląd
Słowa kluczowe (/keywords) - Admin: CRUD, User: podgląd
Kategorie (/categories)  - Admin tylko
Alerty (/alerts)         - Wszyscy (swoje alerty)
Boty (/bots)             - Wszyscy (swoje instancje)
Ustawienia (/settings)   - Wszyscy
Użytkownicy (/admin/users) - Admin tylko
```

---

### 1.5 Ulepszenia PostsTable

**Plik:** `/frontend/components/dashboard/PostsTable.tsx`

**Nowe funkcje:**

1. **Przycisk "Kopiuj link"** (KRYTYCZNY)
   - Ikona: `Copy` z lucide-react
   - Pozycja: Wyraźnie widoczny przy każdym poście
   - Akcja: `navigator.clipboard.writeText(post.post_url)`
   - Feedback: Toast "Link skopiowany do schowka"
   - Tooltip: "Kopiuj do komentowania z innych kont"

2. **Przycisk "Przywróć"**
   - Widoczny dla statusów: `processed`, `rejected`
   - Akcja: Zmiana statusu na `done`
   - Ikona: `RotateCcw`

3. **Badge kategorii z kolorem**
   - Pobierz kolor z tabeli `categories`
   - Wyświetl jako kolorowy badge

---

### 1.6 Zarządzanie kategoriami (Admin)

**Plik:** `/frontend/app/(dashboard)/categories/page.tsx`

**Komponenty:**
- `CategoriesTable.tsx` - lista z kolorem, liczba grup/słów
- `CategoryForm.tsx` - formularz z color pickerem

**Domyślne kategorie przy rejestracji:**
- Tłumaczenia (#3B82F6)
- Praca (#10B981)
- Wizy (#F59E0B)
- Dokumenty (#8B5CF6)
- Inne (#6B7280)

---

### 1.7 Zarządzanie grupami (Admin)

**Plik:** `/frontend/app/(dashboard)/groups/page.tsx`

**Komponenty:**
- `GroupsTable.tsx` - lista z stats, toggle active
- `GroupForm.tsx` - walidacja URL Facebook
- `BulkImportDialog.tsx` - wklejanie listy

**Walidacja URL:**
```typescript
const FB_GROUP_REGEX = /^https?:\/\/(www\.)?facebook\.com\/groups\/[\w.-]+\/?$/
```

**Migracja z config:** Import z `/config/scraper.json` przy pierwszym uruchomieniu admina

---

### 1.8 Zarządzanie słowami kluczowymi (Admin)

**Plik:** `/frontend/app/(dashboard)/keywords/page.tsx`

**Komponenty:**
- `KeywordsTable.tsx` - lista z match_count, kategoria
- `KeywordForm.tsx` - przypisanie kategorii
- `BulkImportDialog.tsx` - jedno słowo na linię

**Migracja z config:** Import z `/config/keywords.json`

---

### 1.9 Aktualizacja botów

**Pliki do modyfikacji:**
- `/fb-scanner-bot.js` (linie 34-36, 77-98)
- `/fb-screenshot-bot.js`

**Zmiany:**
1. Dodaj `SUPABASE_SERVICE_ROLE_KEY` do .env (dla omijania RLS)
2. Pobieraj grupy z tabeli `groups` zamiast JSON
3. Pobieraj słowa kluczowe z tabeli `keywords` zamiast JSON
4. Dodawaj `user_id` przy insercie postów
5. Aktualizuj `match_count` przy dopasowaniu słowa

---

## Faza 2: Zaawansowane funkcje

### 2.1 Filtrowanie i wyszukiwanie

**Plik:** `/frontend/components/dashboard/PostsFilters.tsx`

**Filtry:**
- Status: Multi-select (pending, done, processed, rejected, error)
- Zakres dat: DatePicker od-do
- Grupa: Dropdown z listą grup
- Kategoria: Dropdown z listą kategorii
- Słowo kluczowe: Dropdown
- Autor: Text input z debounce
- Sortowanie: data, autor, kategoria (asc/desc)

**URL State:** Persist filtry w query params

---

### 2.2 System alertów

**Plik:** `/frontend/app/(dashboard)/alerts/page.tsx`

**Typy alertów:**
- `checkpoint` - Facebook checkpoint
- `error` - Błąd bota
- `no_activity` - Brak postów >6h
- `bot_offline` - Bot offline >10min

**Statusy:** `new` → `reviewed` → `resolved`

**Badge w sidebarze:** Licznik `new` alertów

---

### 2.3 Statystyki i eksport

**Rozszerzenie StatsCards:**
- Leady: dzisiaj / tydzień / miesiąc
- Conversion rate: processed / total
- Top 3 aktywne grupy

**Export CSV:**
```typescript
const exportToCsv = (posts: Post[], filters: Filters) => {
  // Kolumny: autor, treść, URL, grupa, słowa, status, data, kategoria
}
```

---

### 2.4 Monitoring botów

**Plik:** `/frontend/app/(dashboard)/bots/page.tsx`

**Komponenty:**
- `BotInstancesTable.tsx`
- `BotStatusCard.tsx` - status, heartbeat, posts_today
- `HeartbeatIndicator.tsx` - pulsująca kropka

**Heartbeat endpoint:**
```
POST /api/bots/heartbeat
Body: { bot_instance_id, posts_count }
```

**Cron job w Supabase:** Sprawdzaj offline co 5 min

---

## Kluczowe pliki do modyfikacji

| Plik | Zmiana |
|------|--------|
| `/supabase/schema.sql` | Nowe tabele + RLS |
| `/frontend/lib/supabase.ts` | Auth SSR |
| `/frontend/components/PostsTable.tsx` | Kopiuj link, Przywróć, kategoria |
| `/frontend/app/layout.tsx` | AuthProvider, Toaster |
| `/fb-scanner-bot.js` | Pobieranie z DB, user_id |
| `/fb-screenshot-bot.js` | user_id przy update |
| `/config/scraper.json` | Zachowaj jako fallback |
| `/config/keywords.json` | Zachowaj jako fallback |

---

## Weryfikacja

### Faza 1:
- [ ] Rejestracja/logowanie działa
- [ ] Middleware chroni trasy
- [ ] RLS blokuje cudze dane
- [ ] CRUD kategorii (admin)
- [ ] CRUD grup (admin)
- [ ] CRUD słów kluczowych (admin)
- [ ] User widzi tylko podgląd
- [ ] Kopiuj link z toast działa
- [ ] Przywróć post działa
- [ ] Bot zapisuje posty z user_id
- [ ] Real-time nadal działa

### Faza 2:
- [ ] Wszystkie filtry działają
- [ ] Filtry w URL params
- [ ] Alerty się tworzą
- [ ] Badge alertów w sidebarze
- [ ] Export CSV pobiera plik
- [ ] Heartbeat aktualizuje status
- [ ] Alert przy offline bocie

---

## Zależności npm do dodania

```bash
cd frontend
npm install @supabase/ssr
npx shadcn@latest add toast dropdown-menu checkbox switch tooltip popover calendar
```

---

## Kolejność implementacji

1. ~~**Migracja SQL** → uruchom w Supabase Dashboard~~ ✅ ZROBIONE
2. **Auth middleware** → ochrona tras
3. **Login page** → formularz logowania
4. **Layout z sidebarą** → nawigacja
5. **Kategorie CRUD** → podstawa dla grup/słów
6. **Grupy CRUD** → z importem z JSON
7. **Słowa kluczowe CRUD** → z importem z JSON
8. **PostsTable ulepszenia** → Kopiuj link, Przywróć
9. **Aktualizacja botów** → pobieranie z DB
10. **Filtrowanie** → komponenty filtrów
11. **Alerty** → panel + badge
12. **Monitoring botów** → heartbeat
13. **Export CSV** → przycisk eksportu

---

## Instrukcje konfiguracji

### 1. SUPABASE_SERVICE_ROLE_KEY (wymagane dla botów)

**Co to jest:** Klucz z pełnymi uprawnieniami, który omija Row Level Security. Boty potrzebują go, aby zapisywać posty dla różnych użytkowników.

**Jak znaleźć:**
1. Otwórz Supabase Dashboard → Twój projekt
2. Idź do **Project Settings** (ikona zębatki w lewym menu)
3. Kliknij **API** w sekcji "Configuration"
4. Znajdź sekcję **Project API keys**
5. Skopiuj klucz `service_role` (NIE `anon`!)

**Konfiguracja:**
```bash
# Dodaj do .env w głównym katalogu projektu
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**UWAGA:** Nigdy nie commituj tego klucza do repozytorium! Jest to klucz z pełnymi uprawnieniami.

---

### 2. Tworzenie konta Admin (ręcznie)

**Krok 1: Utwórz użytkownika w Supabase Auth**
1. Supabase Dashboard → Authentication → Users
2. Kliknij "Add user" → "Create new user"
3. Wypełnij email i hasło dla admina
4. Zapisz User ID (UUID)

**Krok 2: Ustaw rolę admin w bazie**
```sql
-- Po uruchomieniu migracji, wykonaj w SQL Editor:
UPDATE user_profiles
SET role = 'admin'
WHERE email = 'twoj_email@example.com';
```

---

### 3. Migracja istniejących postów

Po utworzeniu admina, uruchom w Supabase SQL Editor:

```sql
-- Przypisz wszystkie istniejące posty do admina
UPDATE posts
SET user_id = (
  SELECT id FROM user_profiles WHERE role = 'admin' LIMIT 1
)
WHERE user_id IS NULL;
```

---

## Uwagi techniczne

- Cały UI w języku polskim (zgodnie z istniejącym kodem)
- Zachowaj spójność z obecnym stylem (gradientowe nagłówki, karty shadcn)
- Boty używają `SUPABASE_SERVICE_ROLE_KEY` (omija RLS)
- Dashboard używa `SUPABASE_ANON_KEY` + Auth (respektuje RLS)
- Fallback: Jeśli bazy grup/słów są puste, boty czytają z JSON

# Plan implementacji - Panel Użytkownika + Rozbudowa Panelu Admina

## Podsumowanie

Implementacja panelu użytkownika (rola `user`) z widokiem read-only na grupy i słowa kluczowe. Rozbudowa panelu admina o: zarządzanie użytkownikami (`/admin/users`), selektor kontekstu użytkownika (admin widzi/zarządza danymi dowolnego usera), aktualizacja polityk RLS aby admin miał dostęp do danych wszystkich użytkowników.

---

## Faza 1: Migracja RLS i fundament uprawnień (Krytyczna)

### 1.1 Migracja polityk RLS - dostęp admina do wszystkich danych

**Nowy plik:** `supabase/migrations/004_admin_rls_policies.sql`

**Problem:** Obecne polityki RLS używają `auth.uid() = user_id` — admin widzi tylko swoje dane. Admin musi widzieć i zarządzać danymi wszystkich userów.

**Rozwiązanie:** Funkcja pomocnicza `is_admin()` + nowe polityki per-operacja:

```sql
-- Funkcja: czy zalogowany user jest adminem
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Wzorzec dla KAŻDEJ tabeli (categories, groups, keywords, alerts, bot_instances, posts, scraper_sessions):
-- DROP stara polityka "Users can CRUD own X"
-- CREATE osobne polityki SELECT/INSERT/UPDATE/DELETE z warunkiem:
--   USING (auth.uid() = user_id OR public.is_admin())
--   WITH CHECK (auth.uid() = user_id OR public.is_admin())

-- user_profiles: admin widzi WSZYSTKICH + może UPDATE (zmiana roli)
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
CREATE POLICY "Users can view own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id OR public.is_admin());
CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id OR public.is_admin())
    WITH CHECK (auth.uid() = id OR public.is_admin());
```

Tabele do aktualizacji: `user_profiles`, `categories`, `groups`, `keywords`, `alerts`, `bot_instances`, `posts`, `scraper_sessions`

---

### 1.2 API Route - zarządzanie użytkownikami (service_role)

**Nowy plik:** `frontend/app/api/admin/users/route.ts`

**Problem:** Tworzenie/usuwanie kont wymaga Supabase Admin API (`service_role` key), który NIE może być w przeglądarce.

**Zmienna środowiskowa:** Dodać `SUPABASE_SERVICE_ROLE_KEY` do `.env.local` (bez `NEXT_PUBLIC_`)

**Endpointy:**
| Metoda | Opis | Body |
|--------|------|------|
| `GET` | Lista userów | - |
| `POST` | Tworzenie usera | `{ email, password, displayName, role }` |
| `PATCH` | Zmiana roli | `{ userId, role }` |
| `DELETE` | Usunięcie usera | `{ userId }` |

**Zabezpieczenia w każdym endpoincie:**
1. Pobierz sesję z ciasteczek (`createServerClient`)
2. Sprawdź `role = 'admin'` w `user_profiles`
3. Jeśli nie admin → `403 Forbidden`

**Klient admin:**
```typescript
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
)
```

---

### 1.3 Middleware - ochrona tras /admin/*

**Plik:** `frontend/middleware.ts` (linia ~50, po sprawdzeniu usera)

**Zmiana:** Dodać sprawdzanie roli admin dla `/admin/*`:
```typescript
if (user && request.nextUrl.pathname.startsWith('/admin')) {
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()
    if (profile?.role !== 'admin') {
        return NextResponse.redirect(new URL('/', request.url))
    }
}
```

---

## Faza 2: Selektor kontekstu użytkownika (Admin)

### 2.1 AdminContext Provider

**Nowy plik:** `frontend/lib/admin-context.tsx`

**Interfejs:**
```typescript
type AdminContextType = {
    selectedUserId: string | null        // null = brak filtra (admin widzi wszystko)
    selectedUser: UserProfile | null
    users: UserProfile[]
    setSelectedUserId: (id: string | null) => void
    isManagingOtherUser: boolean
    loading: boolean
}
```

**Logika:**
- Jeśli `isAdmin` → pobierz listę userów z `GET /api/admin/users`
- Jeśli nie admin → zwróć puste wartości, nie rób żadnych zapytań
- Przechowuj `selectedUserId` w state

### 2.2 Komponent UserSelector

**Nowy plik:** `frontend/components/admin/UserSelector.tsx`

**Design:** Dropdown `Select` z shadcn/ui:
- Opcja "Wszyscy użytkownicy" (brak filtra)
- Opcja "Moje dane" (`selectedUserId = admin.id`)
- Lista userów z badge roli

### 2.3 Integracja w layout

**Plik:** `frontend/app/(dashboard)/layout.tsx`
- Opakowac `DashboardShell` w `<AdminProvider>`

**Plik:** `frontend/components/DashboardShell.tsx` (linia ~39-43)
- Dodać `{isAdmin && <UserSelector />}` w headerze obok `<UserNav />`

### 2.4 Modyfikacja stron admin - użycie selectedUserId

**Pliki:** `groups/page.tsx`, `keywords/page.tsx`, `categories/page.tsx`

Przy fetchowaniu danych admin używa jawnego filtra:
```typescript
const { selectedUserId } = useAdminContext()
let query = supabase.from('groups').select('*')
if (selectedUserId) {
    query = query.eq('user_id', selectedUserId)
}
```

**Modyfikacja formularzy** (`GroupForm.tsx`, `KeywordForm.tsx`, `KeywordsBulkImport.tsx`):
- Nowy prop `targetUserId?: string`
- W INSERT: `user_id = targetUserId || user.id`

---

## Faza 3: Panel użytkownika (read-only)

### 3.1 GroupsTable - tryb readOnly

**Plik:** `frontend/components/dashboard/GroupsTable.tsx`

Zmiany:
1. Nowy prop `readOnly?: boolean`
2. Switch → Badge (aktywna/nieaktywna) gdy `readOnly`
3. Ukryć kolumnę "Akcje" (Edit, Delete) gdy `readOnly`
4. Nie renderować dialogu usuwania gdy `readOnly`

### 3.2 KeywordsTable - tryb readOnly

**Plik:** `frontend/components/dashboard/KeywordsTable.tsx`

Zmiany identyczne jak GroupsTable.

### 3.3 Groups page - obsługa roli user

**Plik:** `frontend/app/(dashboard)/groups/page.tsx`

Zmiany:
1. **Usunąć** redirect non-admin (`router.push('/')`) i `if (!isAdmin) return null`
2. Fetch danych: `if (user)` zamiast `if (user && isAdmin)`
3. Ukryć przycisk "Nowa grupa" dla non-admin
4. Przekazać `readOnly={!isAdmin}` do `GroupsTable`
5. Renderować `GroupForm` tylko dla admina
6. Zmienić opis strony dla usera

### 3.4 Keywords page - obsługa roli user

**Plik:** `frontend/app/(dashboard)/keywords/page.tsx`

Zmiany analogiczne do Groups:
1. Usunąć redirect non-admin
2. Ukryć "Nowe słowo" i "Importuj wiele" dla non-admin
3. `readOnly={!isAdmin}` do `KeywordsTable`
4. Formularze tylko dla admina

### 3.5 Categories - BEZ ZMIAN (admin-only)

User widzi kategorie pośrednio w filtrach dashboardu i badge'ach w tabelach.

### 3.6 Sidebar - bez zmian

Konfiguracja `adminOnly` jest już poprawna — Groups i Keywords mają `adminOnly: false`.

---

## Faza 4: Strona zarządzania użytkownikami

### 4.1 Nowe pliki

```
frontend/
├── app/(dashboard)/admin/users/page.tsx     # Strona główna
├── components/admin/
│   ├── UserSelector.tsx                      # (z Fazy 2)
│   ├── UsersTable.tsx                        # Tabela użytkowników
│   └── UserForm.tsx                          # Formularz tworzenia usera
```

### 4.2 Strona /admin/users/page.tsx

**Funkcje:**
- Nagłówek "Zarządzanie użytkownikami" + badge z liczbą
- Przycisk "Nowy użytkownik"
- Tabela użytkowników (UsersTable)
- Formularz tworzenia (UserForm - Dialog)

### 4.3 UsersTable

**Kolumny:** Email | Nazwa | Rola | Data utworzenia | Akcje

**Akcje:**
- Zmień rolę (`PATCH /api/admin/users`)
- Usuń użytkownika (`DELETE /api/admin/users` z dialogiem potwierdzenia)
- Zabezpieczenie: admin nie może usunąć/zdegradować siebie

### 4.4 UserForm

**Pola:** Email (wymagany) | Hasło (min 6 znaków) | Nazwa (opcjonalnie) | Rola (Select: user/admin)

**Akcja:** `POST /api/admin/users`

---

## Faza 5: Integracja AdminContext z Dashboard/Alerts/Bots

### 5.1 Dashboard

**Plik:** `frontend/components/Dashboard.tsx`

Jeśli admin i `selectedUserId` → filtruj posty `.eq('user_id', selectedUserId)`.
Dodać banner informacyjny gdy admin przegląda dane innego usera.

### 5.2 Alerts i Bots

**Pliki:** `alerts/page.tsx`, `bots/page.tsx`, `BotInstancesTable.tsx`

Analogicznie — jeśli admin z selectedUserId → filtruj po user_id.

---

## Pliki do modyfikacji/utworzenia

| Plik | Zmiana |
|------|--------|
| `supabase/migrations/004_admin_rls_policies.sql` | **NOWY** — RLS z dostępem admina |
| `frontend/app/api/admin/users/route.ts` | **NOWY** — API zarządzania userami |
| `frontend/lib/admin-context.tsx` | **NOWY** — Context selektora usera |
| `frontend/components/admin/UserSelector.tsx` | **NOWY** — Dropdown wyboru usera |
| `frontend/components/admin/UsersTable.tsx` | **NOWY** — Tabela userów |
| `frontend/components/admin/UserForm.tsx` | **NOWY** — Formularz tworzenia usera |
| `frontend/app/(dashboard)/admin/users/page.tsx` | **NOWY** — Strona admin/users |
| `frontend/middleware.ts` | Sprawdzanie roli admin dla /admin/* |
| `frontend/components/DashboardShell.tsx` | UserSelector w headerze |
| `frontend/app/(dashboard)/layout.tsx` | Opakowanie w AdminProvider |
| `frontend/components/dashboard/GroupsTable.tsx` | Prop `readOnly` |
| `frontend/components/dashboard/KeywordsTable.tsx` | Prop `readOnly` |
| `frontend/app/(dashboard)/groups/page.tsx` | Obsługa roli user (read-only) |
| `frontend/app/(dashboard)/keywords/page.tsx` | Obsługa roli user (read-only) |
| `frontend/components/dashboard/GroupForm.tsx` | Prop `targetUserId` |
| `frontend/components/dashboard/KeywordForm.tsx` | Prop `targetUserId` |
| `frontend/components/dashboard/KeywordsBulkImport.tsx` | Prop `targetUserId` |
| `frontend/components/Dashboard.tsx` | Filtrowanie po selectedUserId |
| `frontend/app/(dashboard)/alerts/page.tsx` | Filtrowanie po selectedUserId |
| `frontend/components/dashboard/BotInstancesTable.tsx` | Filtrowanie po selectedUserId |

---

## Kolejność implementacji

1. Migracja SQL (004) → uruchom w Supabase SQL Editor
2. Weryfikacja RLS → admin widzi dane innych userów
3. API Route (`/api/admin/users`)
4. AdminContext (`admin-context.tsx`)
5. UserSelector (`UserSelector.tsx`)
6. Layout + DashboardShell → integracja AdminProvider i UserSelector
7. GroupsTable readOnly prop
8. KeywordsTable readOnly prop
9. Groups page → obsługa roli user
10. Keywords page → obsługa roli user
11. Formularze → prop `targetUserId`
12. UsersTable + UserForm → komponenty admin/users
13. Strona `/admin/users`
14. Middleware → sprawdzanie admina dla /admin/*
15. Dashboard + Alerts + Bots → integracja z AdminContext
16. Testowanie end-to-end

---

## Weryfikacja

### RLS + API:
- [ ] Admin widzi dane wszystkich użytkowników
- [ ] Admin może CRUD rekordy dla dowolnego usera
- [ ] User widzi TYLKO swoje dane
- [ ] User NIE może modyfikować cudzych danych
- [ ] API `/api/admin/users` zwraca 403 dla non-admina
- [ ] Tworzenie użytkownika działa (profil via trigger)
- [ ] Usuwanie kaskadowo usuwa dane

### Selektor kontekstu:
- [ ] Admin widzi dropdown z listą userów w headerze
- [ ] Zmiana usera odświeża dane na stronie
- [ ] Tworzenie grup/keywords dla wybranego usera działa
- [ ] User NIE widzi dropdowna

### Panel usera:
- [ ] User wchodzi na `/groups` → widzi swoje grupy (read-only)
- [ ] User wchodzi na `/keywords` → widzi swoje słowa (read-only)
- [ ] User NIE widzi przycisków Dodaj/Edytuj/Usuń
- [ ] User NIE widzi Switcha aktywacji
- [ ] User NIE może wejść na `/categories` (redirect)
- [ ] User NIE może wejść na `/admin/users` (redirect)

### Zarządzanie użytkownikami:
- [ ] `/admin/users` wyświetla listę użytkowników
- [ ] Tworzenie nowego użytkownika działa
- [ ] Zmiana roli działa
- [ ] Usuwanie z potwierdzeniem działa
- [ ] Admin nie może usunąć/zdegradować siebie

### Integracja:
- [ ] Dashboard admina → dane wybranego usera
- [ ] Alerty/Boty → filtrowane po wybranym userze
- [ ] Middleware blokuje `/admin/*` dla non-admina
- [ ] Real-time subscriptions nadal działają

---

## Uwagi techniczne

- `is_admin()` — `SECURITY DEFINER STABLE` — omija RLS na user_profiles, wynik cachowany w transakcji
- API route — jedyne miejsce z `service_role` key; frontend używa `anon` key + RLS
- AdminContext — lazy loading — pobiera userów TYLKO dla admina
- Cały UI w języku polskim (etykiety, toasty, komunikaty)
- Wzorzec komponentów — shadcn/ui, gradient headers, date-fns z locale `pl`
- Backward compatibility — obecne zachowanie się nie zmienia

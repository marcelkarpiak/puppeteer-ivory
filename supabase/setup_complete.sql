-- ============================================================================
-- KOMPLETNY SETUP BAZY DANYCH - Nowe konto Supabase
-- ============================================================================
-- Uruchom ten plik w Supabase SQL Editor na nowym projekcie.
-- Kolejność jest istotna - tabele z zależnościami tworzą się po tabelach bazowych.
--
-- Po uruchomieniu tego pliku:
-- 1. Zarejestruj pierwszego użytkownika przez dashboard (Auth → Users → Invite)
-- 2. Ustaw go jako admina: UPDATE user_profiles SET role = 'admin' WHERE email = 'email@example.com';
-- 3. Skonfiguruj .env z SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY
-- ============================================================================


-- ============================================================================
-- KROK 1: TABELE BAZOWE (bez zależności)
-- ============================================================================

-- Profil użytkownika (rozszerzenie Supabase Auth)
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    display_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Posty (główna tabela danych)
CREATE TABLE IF NOT EXISTS posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id TEXT UNIQUE,
    author_name TEXT,
    author_url TEXT,
    content TEXT,
    post_url TEXT,
    screenshot_url TEXT,
    matched_keywords TEXT[],
    category TEXT,
    status TEXT DEFAULT 'new',
    scraped_at TIMESTAMPTZ DEFAULT NOW(),
    human_action_taken BOOLEAN DEFAULT false
);

-- Sesje scrapera (monitoring)
CREATE TABLE IF NOT EXISTS scraper_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    posts_found INTEGER DEFAULT 0,
    posts_matched INTEGER DEFAULT 0,
    status TEXT DEFAULT 'running',
    error_log TEXT,
    bot_type TEXT DEFAULT 'scanner'
);

-- Kategorie
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6B7280',
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, name)
);


-- ============================================================================
-- KROK 2: TABELE Z ZALEŻNOŚCIAMI
-- ============================================================================

-- Grupy (zależy od categories)
CREATE TABLE IF NOT EXISTS groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    stats JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Słowa kluczowe (zależy od categories)
CREATE TABLE IF NOT EXISTS keywords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    match_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alerty
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'new',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- Instancje botów
CREATE TABLE IF NOT EXISTS bot_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL UNIQUE,
    type TEXT,
    status TEXT DEFAULT 'offline',
    last_heartbeat TIMESTAMPTZ,
    posts_today INTEGER DEFAULT 0,
    config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Przetworzone posty (deduplikacja stateful-scanner)
CREATE TABLE IF NOT EXISTS processed_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id TEXT NOT NULL,
    external_id TEXT NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, external_id)
);


-- ============================================================================
-- KROK 3: DODATKOWE KOLUMNY (relacje między tabelami)
-- ============================================================================

ALTER TABLE posts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id);

ALTER TABLE scraper_sessions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE scraper_sessions ADD COLUMN IF NOT EXISTS bot_instance_id UUID REFERENCES bot_instances(id);


-- ============================================================================
-- KROK 4: INDEKSY
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_scraped_at ON posts(scraped_at);
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_external_id ON posts(external_id);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);

CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);

CREATE INDEX IF NOT EXISTS idx_groups_user_id ON groups(user_id);
CREATE INDEX IF NOT EXISTS idx_groups_is_active ON groups(is_active);

CREATE INDEX IF NOT EXISTS idx_keywords_user_id ON keywords(user_id);
CREATE INDEX IF NOT EXISTS idx_keywords_is_active ON keywords(is_active);

CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);

CREATE INDEX IF NOT EXISTS idx_bot_instances_user_id ON bot_instances(user_id);
CREATE INDEX IF NOT EXISTS idx_bot_instances_status ON bot_instances(status);

CREATE INDEX IF NOT EXISTS idx_processed_posts_group_id ON processed_posts(group_id);
CREATE INDEX IF NOT EXISTS idx_processed_posts_processed_at ON processed_posts(processed_at);

CREATE INDEX IF NOT EXISTS idx_scraper_sessions_status ON scraper_sessions(status);


-- ============================================================================
-- KROK 5: ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_posts ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- KROK 6: FUNKCJA POMOCNICZA - is_admin()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;


-- ============================================================================
-- KROK 7: POLITYKI RLS - user_profiles
-- ============================================================================

CREATE POLICY "Users can view own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id OR public.is_admin())
    WITH CHECK (auth.uid() = id OR public.is_admin());

CREATE POLICY "Users can insert own profile" ON user_profiles
    FOR INSERT WITH CHECK (true);


-- ============================================================================
-- KROK 8: POLITYKI RLS - tabele z user_id (admin widzi wszystko)
-- ============================================================================

-- Categories
CREATE POLICY "admin_all_access_select_categories" ON categories
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "admin_all_access_insert_categories" ON categories
    FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "admin_all_access_update_categories" ON categories
    FOR UPDATE USING (auth.uid() = user_id OR public.is_admin())
    WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "admin_all_access_delete_categories" ON categories
    FOR DELETE USING (auth.uid() = user_id OR public.is_admin());

-- Groups
CREATE POLICY "admin_all_access_select_groups" ON groups
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "admin_all_access_insert_groups" ON groups
    FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "admin_all_access_update_groups" ON groups
    FOR UPDATE USING (auth.uid() = user_id OR public.is_admin())
    WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "admin_all_access_delete_groups" ON groups
    FOR DELETE USING (auth.uid() = user_id OR public.is_admin());

-- Keywords
CREATE POLICY "admin_all_access_select_keywords" ON keywords
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "admin_all_access_insert_keywords" ON keywords
    FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "admin_all_access_update_keywords" ON keywords
    FOR UPDATE USING (auth.uid() = user_id OR public.is_admin())
    WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "admin_all_access_delete_keywords" ON keywords
    FOR DELETE USING (auth.uid() = user_id OR public.is_admin());

-- Alerts
CREATE POLICY "admin_all_access_select_alerts" ON alerts
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "admin_all_access_insert_alerts" ON alerts
    FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "admin_all_access_update_alerts" ON alerts
    FOR UPDATE USING (auth.uid() = user_id OR public.is_admin())
    WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "admin_all_access_delete_alerts" ON alerts
    FOR DELETE USING (auth.uid() = user_id OR public.is_admin());

-- Bot Instances
CREATE POLICY "admin_all_access_select_bot_instances" ON bot_instances
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "admin_all_access_insert_bot_instances" ON bot_instances
    FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "admin_all_access_update_bot_instances" ON bot_instances
    FOR UPDATE USING (auth.uid() = user_id OR public.is_admin())
    WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "admin_all_access_delete_bot_instances" ON bot_instances
    FOR DELETE USING (auth.uid() = user_id OR public.is_admin());

-- Posts
CREATE POLICY "admin_all_access_select_posts" ON posts
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "admin_all_access_insert_posts" ON posts
    FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "admin_all_access_update_posts" ON posts
    FOR UPDATE USING (auth.uid() = user_id OR public.is_admin())
    WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "admin_all_access_delete_posts" ON posts
    FOR DELETE USING (auth.uid() = user_id OR public.is_admin());

-- Scraper Sessions
CREATE POLICY "admin_all_access_select_scraper_sessions" ON scraper_sessions
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "admin_all_access_insert_scraper_sessions" ON scraper_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "admin_all_access_update_scraper_sessions" ON scraper_sessions
    FOR UPDATE USING (auth.uid() = user_id OR public.is_admin())
    WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "admin_all_access_delete_scraper_sessions" ON scraper_sessions
    FOR DELETE USING (auth.uid() = user_id OR public.is_admin());

-- Processed Posts - bot używa service_role (bypass RLS), ale na wszelki wypadek:
CREATE POLICY "service_role_all_processed_posts" ON processed_posts
    FOR ALL USING (true) WITH CHECK (true);


-- ============================================================================
-- KROK 9: FUNKCJE
-- ============================================================================

-- Funkcja: Tworzenie profilu przy rejestracji (Auth trigger)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_profiles (id, email, role, display_name)
    VALUES (
        NEW.id,
        NEW.email,
        'user',
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user trigger failed for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Funkcja: Tworzenie domyślnych kategorii dla nowego użytkownika
CREATE OR REPLACE FUNCTION create_default_categories()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO categories (user_id, name, color, is_default)
    VALUES
        (NEW.id, 'Tłumaczenia', '#3B82F6', true),
        (NEW.id, 'Praca', '#10B981', true),
        (NEW.id, 'Wizy', '#F59E0B', true),
        (NEW.id, 'Dokumenty', '#8B5CF6', true),
        (NEW.id, 'Inne', '#6B7280', true);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Funkcja: Inkrementacja match_count dla słowa kluczowego
CREATE OR REPLACE FUNCTION increment_keyword_match_count(keyword_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE keywords
    SET match_count = COALESCE(match_count, 0) + 1
    WHERE id = keyword_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_keyword_match_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_keyword_match_count(UUID) TO service_role;


-- ============================================================================
-- KROK 10: TRIGGERY
-- ============================================================================

-- Trigger: Auth → user_profiles (automatyczny profil przy rejestracji)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- Trigger: user_profiles → categories (domyślne kategorie po utworzeniu profilu)
DROP TRIGGER IF EXISTS on_user_profile_created ON user_profiles;
CREATE TRIGGER on_user_profile_created
    AFTER INSERT ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION create_default_categories();


-- ============================================================================
-- KROK 11: SUPABASE STORAGE - Bucket na screenshoty
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('screenshots', 'screenshots', true)
ON CONFLICT (id) DO NOTHING;

-- Polityka: Upload screenshotów (bot używa service_role)
CREATE POLICY "Allow public uploads" ON storage.objects
    FOR INSERT TO public
    WITH CHECK (bucket_id = 'screenshots');

-- Polityka: Publiczny podgląd screenshotów
CREATE POLICY "Allow public view" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'screenshots');


-- ============================================================================
-- KROK 12: WŁĄCZENIE REALTIME (dla dashboardu)
-- ============================================================================
-- Dashboard nasłuchuje zmian w tabelach: posts, alerts, bot_instances
-- W Supabase: Database → Replication → włącz dla tych tabel
-- Lub przez SQL:

ALTER PUBLICATION supabase_realtime ADD TABLE posts;
ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE bot_instances;


-- ============================================================================
-- GOTOWE!
-- ============================================================================
-- Następne kroki:
-- 1. Utwórz użytkownika w Supabase Auth (Dashboard → Authentication → Users → Invite)
-- 2. Ustaw admina: UPDATE user_profiles SET role = 'admin' WHERE email = 'twoj@email.com';
-- 3. Skonfiguruj .env (root) z kluczami Supabase
-- 4. Skonfiguruj frontend/.env.local z kluczami Supabase
-- 5. Uruchom bota: node fb-bot.js
-- 6. Uruchom dashboard: npm run dev --prefix frontend

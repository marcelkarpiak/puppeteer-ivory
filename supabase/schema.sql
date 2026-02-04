-- Tabela postów
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE,           -- ID posta z platformy (FB/Reddit)
  author_name TEXT,
  author_url TEXT,
  content TEXT,
  post_url TEXT,
  screenshot_url TEXT,
  matched_keywords TEXT[],           -- Tablica znalezionych słów kluczowych
  category TEXT,                     -- Kategoria (np. legalizacja)
  status TEXT DEFAULT 'new',         -- new | processing | done | rejected
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  human_action_taken BOOLEAN DEFAULT false
);

-- Tabela sesji scrapera (do monitoringu aktywności botów)
CREATE TABLE IF NOT EXISTS scraper_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  posts_found INTEGER DEFAULT 0,
  posts_matched INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running',     -- running | completed | error
  error_log TEXT,
  bot_type TEXT DEFAULT 'scanner'    -- scanner | screenshoter
);

-- Indeksy dla szybszego wyszukiwania
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_scraped_at ON posts(scraped_at);
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);

-- --- STORAGE SETUP ---
-- Wklej to w Supabase -> SQL Editor, aby skonfigurować przechowywanie zdjęć.

-- 1. Utworzenie bucketa
INSERT INTO storage.buckets (id, name, public) 
VALUES ('screenshots', 'screenshots', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Polityka: Pozwól na upload (INSERT) dla każdego (anonimowego klucza)
-- Uwaga: W produkcji warto to ograniczyć do service_role lub zalogowanych userów
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
CREATE POLICY "Allow public uploads" 
ON storage.objects 
FOR INSERT 
TO public 
WITH CHECK (bucket_id = 'screenshots');

-- 3. Polityka: Pozwól na podgląd (SELECT) dla każdego
DROP POLICY IF EXISTS "Allow public view" ON storage.objects;
CREATE POLICY "Allow public view" 
ON storage.objects 
FOR SELECT 
TO public 
USING (bucket_id = 'screenshots');


-- ==========================================
-- FAZA 1.6 - 1.8: TABELE CRUD I RELACJE
-- ==========================================

-- PROFILE UŻYTKOWNIKÓW
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- KATEGORIE
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#94a3b8',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Unikalna nazwa kategorii dla użytkownika
  CONSTRAINT categories_user_name_unique UNIQUE (user_id, name)
);

-- GRUPY
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

-- SŁOWA KLUCZOWE
CREATE TABLE IF NOT EXISTS keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  match_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ALERTY
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- checkpoint, error, no_activity, bot_offline
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'new', -- new, reviewed, resolved
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- INSTANCJE BOTÓW
CREATE TABLE IF NOT EXISTS bot_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT,
  status TEXT DEFAULT 'offline',
  last_heartbeat TIMESTAMPTZ,
  posts_today INTEGER DEFAULT 0,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AKTUALIZACJA ISTNIEJĄCYCH TABEL (POWIĄZANIA)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id);

ALTER TABLE scraper_sessions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE scraper_sessions ADD COLUMN IF NOT EXISTS bot_instance_id UUID REFERENCES bot_instances(id);

-- WŁĄCZENIE RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_sessions ENABLE ROW LEVEL SECURITY;

-- POLITYKI BEZPIECZEŃSTWA (RLS POLICIES)

-- User Profiles
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
CREATE POLICY "Users can view own profile" ON user_profiles FOR SELECT USING (auth.uid() = id);

-- Categories
DROP POLICY IF EXISTS "Users can CRUD own categories" ON categories;
CREATE POLICY "Users can CRUD own categories" ON categories FOR ALL USING (auth.uid() = user_id);

-- Groups
DROP POLICY IF EXISTS "Users can CRUD own groups" ON groups;
CREATE POLICY "Users can CRUD own groups" ON groups FOR ALL USING (auth.uid() = user_id);

-- Keywords
DROP POLICY IF EXISTS "Users can CRUD own keywords" ON keywords;
CREATE POLICY "Users can CRUD own keywords" ON keywords FOR ALL USING (auth.uid() = user_id);

-- Alerts
DROP POLICY IF EXISTS "Users can CRUD own alerts" ON alerts;
CREATE POLICY "Users can CRUD own alerts" ON alerts FOR ALL USING (auth.uid() = user_id);

-- Bot Instances
DROP POLICY IF EXISTS "Users can CRUD own bot instances" ON bot_instances;
CREATE POLICY "Users can CRUD own bot instances" ON bot_instances FOR ALL USING (auth.uid() = user_id);

-- Posts
DROP POLICY IF EXISTS "Users can view own posts" ON posts;
DROP POLICY IF EXISTS "Users can update own posts" ON posts;
DROP POLICY IF EXISTS "Users can insert own posts" ON posts;
DROP POLICY IF EXISTS "Users can delete own posts" ON posts;
CREATE POLICY "Users can view own posts" ON posts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own posts" ON posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own posts" ON posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own posts" ON posts FOR DELETE USING (auth.uid() = user_id);

-- Scraper Sessions
DROP POLICY IF EXISTS "Users can view own sessions" ON scraper_sessions;
CREATE POLICY "Users can view own sessions" ON scraper_sessions FOR ALL USING (auth.uid() = user_id);


-- AUTOMATYZACJA: Tworzenie profilu i domyślnych kategorii

-- Funkcja: Tworzenie domyślnych kategorii
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

-- Trigger: Po utworzeniu profilu użytkownika
DROP TRIGGER IF EXISTS on_user_profile_created ON user_profiles;
CREATE TRIGGER on_user_profile_created
    AFTER INSERT ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION create_default_categories();

-- Funkcja: Tworzenie profilu przy rejestracji (Auth)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, display_name)
  VALUES (new.id, new.email, split_part(new.email, '@', 1));
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Auth -> User Profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

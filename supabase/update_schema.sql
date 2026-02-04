-- Skrypt aktualizujący schemat bazy danych dla funkcjonalności CRUD
-- Uruchom ten skrypt w Supabase SQL Editor

-- 1. Tworzenie nowych tabel (jeśli nie istnieją)

-- KATEGORIE
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#94a3b8',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
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

-- 2. Aktualizacja istniejących tabel (dodanie kolumn, jeśli nie istnieją)

-- POSTS: Dodanie powiązań
ALTER TABLE posts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id);

-- SCRAPER_SESSIONS: Dodanie powiązań
ALTER TABLE scraper_sessions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE scraper_sessions ADD COLUMN IF NOT EXISTS bot_instance_id UUID REFERENCES bot_instances(id);

-- 3. Włączenie RLS (Row Level Security)

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_instances ENABLE ROW LEVEL SECURITY;
-- Posts i scraper_sessions powinny mieć już włączone RLS w poprzednim kroku, ale dla pewności:
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_sessions ENABLE ROW LEVEL SECURITY;

-- 4. Polityki Bezpieczeństwa (Policies)
-- Usuwamy stare polityki jeśli istnieją, aby uniknąć błędów duplikatów przy ponownym uruchamianiu
DROP POLICY IF EXISTS "Users can CRUD own categories" ON categories;
DROP POLICY IF EXISTS "Users can CRUD own groups" ON groups;
DROP POLICY IF EXISTS "Users can CRUD own keywords" ON keywords;
DROP POLICY IF EXISTS "Users can CRUD own alerts" ON alerts;
DROP POLICY IF EXISTS "Users can CRUD own bot instances" ON bot_instances;

-- Tworzenie polityk: Każdy użytkownik zarządza tylko swoimi danymi

CREATE POLICY "Users can CRUD own categories" ON categories
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own groups" ON groups
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own keywords" ON keywords
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own alerts" ON alerts
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can CRUD own bot instances" ON bot_instances
  FOR ALL USING (auth.uid() = user_id);

-- Upewnijmy się, że polityki dla posts są poprawne (aktualizacja)
DROP POLICY IF EXISTS "Users can view own posts" ON posts;
DROP POLICY IF EXISTS "Users can update own posts" ON posts;
DROP POLICY IF EXISTS "Users can insert own posts" ON posts;
DROP POLICY IF EXISTS "Users can delete own posts" ON posts;

CREATE POLICY "Users can view own posts" ON posts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own posts" ON posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own posts" ON posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own posts" ON posts FOR DELETE USING (auth.uid() = user_id);

-- Dodanie przykładowych kategorii domyślnych (opcjonalnie, przypisane do aktualnego usera w momencie insertu, 
-- ale to zapytanie trzeba by specyficznie skonstruować. Pomińmy to w generycznym skrypcie).

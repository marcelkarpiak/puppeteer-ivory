-- Migracja: Tabela kategorii
-- Opis: Tworzy tabelę kategorii z politykami RLS

-- Tabela kategorii
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6B7280',
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unikalna nazwa kategorii dla użytkownika
    UNIQUE(user_id, name)
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);

-- Włącz RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Polityki RLS dla categories
-- SELECT: Użytkownik widzi tylko swoje kategorie
CREATE POLICY "Users can view own categories"
ON categories FOR SELECT
USING (auth.uid() = user_id);

-- INSERT: Użytkownik może dodawać tylko swoje kategorie
CREATE POLICY "Users can insert own categories"
ON categories FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- UPDATE: Użytkownik może edytować tylko swoje kategorie
CREATE POLICY "Users can update own categories"
ON categories FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- DELETE: Użytkownik może usuwać tylko swoje kategorie (nie domyślne)
CREATE POLICY "Users can delete own categories"
ON categories FOR DELETE
USING (auth.uid() = user_id AND is_default = false);

-- Funkcja do tworzenia domyślnych kategorii dla nowego użytkownika
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

-- Trigger: Utwórz domyślne kategorie przy tworzeniu profilu użytkownika
DROP TRIGGER IF EXISTS on_user_profile_created ON user_profiles;
CREATE TRIGGER on_user_profile_created
    AFTER INSERT ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION create_default_categories();

-- Komentarz: Aby dodać kategorie dla istniejących użytkowników, uruchom:
-- INSERT INTO categories (user_id, name, color, is_default)
-- SELECT up.id, c.name, c.color, true
-- FROM user_profiles up
-- CROSS JOIN (
--     VALUES
--         ('Tłumaczenia', '#3B82F6'),
--         ('Praca', '#10B981'),
--         ('Wizy', '#F59E0B'),
--         ('Dokumenty', '#8B5CF6'),
--         ('Inne', '#6B7280')
-- ) AS c(name, color)
-- WHERE NOT EXISTS (
--     SELECT 1 FROM categories cat
--     WHERE cat.user_id = up.id AND cat.name = c.name
-- );

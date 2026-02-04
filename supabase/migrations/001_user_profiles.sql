-- Migracja: Profile użytkowników
-- Opis: Tworzy tabelę profili użytkowników z rolami (admin/user)

-- Tabela profili użytkowników (rozszerzenie Supabase Auth)
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    display_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);

-- Włącz RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Polityki RLS dla user_profiles
-- SELECT: Użytkownik widzi swój profil, admin widzi wszystkie
CREATE POLICY "Users can view own profile"
ON user_profiles FOR SELECT
USING (
    auth.uid() = id
    OR EXISTS (
        SELECT 1 FROM user_profiles up
        WHERE up.id = auth.uid() AND up.role = 'admin'
    )
);

-- UPDATE: Użytkownik może edytować tylko swój profil (ale nie rolę)
CREATE POLICY "Users can update own profile"
ON user_profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- INSERT: Tylko system (przez trigger)
CREATE POLICY "System can insert profiles"
ON user_profiles FOR INSERT
WITH CHECK (auth.uid() = id);

-- Funkcja do automatycznego tworzenia profilu przy rejestracji
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_profiles (id, email, role, display_name)
    VALUES (
        NEW.id,
        NEW.email,
        'user',
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Utwórz profil przy nowym użytkowniku
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- Komentarz: Aby ustawić pierwszego admina, uruchom:
-- UPDATE user_profiles SET role = 'admin' WHERE email = 'twoj_email@example.com';

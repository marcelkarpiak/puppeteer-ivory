-- 1. Funkcja sprawdzająca czy użytkownik jest adminem
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2. Aktualizacja polityk dla tabeli user_profiles
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles; -- Na wszelki wypadek

CREATE POLICY "Users can view own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id OR public.is_admin())
    WITH CHECK (auth.uid() = id OR public.is_admin());

-- Insert jest zazwyczaj obsługiwany przez trigger przy rejestracji, ale dla spójności:
CREATE POLICY "Users can insert own profile" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id OR public.is_admin());


-- 3. Funkcja pomocnicza do generowania polityk dla standardowych tabel
-- (categories, groups, keywords, alerts, bot_instances, posts, scraper_sessions)
DO $$
DECLARE
    t text;
    tables text[] := ARRAY['categories', 'groups', 'keywords', 'alerts', 'bot_instances', 'posts', 'scraper_sessions'];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        -- Usuwanie starych polityk (najczęstsze nazwy)
        EXECUTE format('DROP POLICY IF EXISTS "Users can view own %I" ON %I', t, t);
        EXECUTE format('DROP POLICY IF EXISTS "Users can insert own %I" ON %I', t, t);
        EXECUTE format('DROP POLICY IF EXISTS "Users can update own %I" ON %I', t, t);
        EXECUTE format('DROP POLICY IF EXISTS "Users can delete own %I" ON %I', t, t);
        EXECUTE format('DROP POLICY IF EXISTS "Enable read access for own data" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Enable insert access for own data" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Enable update access for own data" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Enable delete access for own data" ON %I', t);
        
        -- Nowe polityki uwzględniające admina
        EXECUTE format('CREATE POLICY "admin_all_access_select_%I" ON %I FOR SELECT USING (auth.uid() = user_id OR public.is_admin())', t, t);
        EXECUTE format('CREATE POLICY "admin_all_access_insert_%I" ON %I FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_admin())', t, t);
        EXECUTE format('CREATE POLICY "admin_all_access_update_%I" ON %I FOR UPDATE USING (auth.uid() = user_id OR public.is_admin()) WITH CHECK (auth.uid() = user_id OR public.is_admin())', t, t);
        EXECUTE format('CREATE POLICY "admin_all_access_delete_%I" ON %I FOR DELETE USING (auth.uid() = user_id OR public.is_admin())', t, t);
    END LOOP;
END $$;

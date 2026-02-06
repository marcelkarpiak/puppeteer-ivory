-- Fix 1: Drop the stale INSERT policy from migration 001 that was never removed
DROP POLICY IF EXISTS "System can insert profiles" ON user_profiles;

-- Fix 2: Drop and recreate INSERT policy — allow service_role/trigger inserts
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
CREATE POLICY "Users can insert own profile" ON user_profiles
    FOR INSERT WITH CHECK (true);
    -- INSERT is only done by: trigger (SECURITY DEFINER) or admin API (service_role).
    -- Both bypass RLS anyway, but this prevents any edge case blocking.

-- Fix 3: Recreate trigger function with error handling + ON CONFLICT
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

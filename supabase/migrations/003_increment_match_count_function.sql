-- Funkcja do inkrementacji match_count dla słowa kluczowego
-- Używana przez boty przy dopasowaniu słowa kluczowego

CREATE OR REPLACE FUNCTION increment_keyword_match_count(keyword_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE keywords
    SET match_count = COALESCE(match_count, 0) + 1
    WHERE id = keyword_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Pozwól na wywołanie funkcji przez authenticated users i service role
GRANT EXECUTE ON FUNCTION increment_keyword_match_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_keyword_match_count(UUID) TO service_role;

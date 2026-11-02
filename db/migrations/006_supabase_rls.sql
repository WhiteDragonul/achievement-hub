-- 006 — Row Level Security (specific Supabase, D1)
-- Supabase expune automat schema "public" printr-un API REST pentru rolurile anon/authenticated.
-- RLS activat FĂRĂ politici = acele roluri nu văd niciun rând. Backend-ul se conectează ca "postgres",
-- proprietarul tabelelor, pe care RLS nu îl afectează. Pe un Postgres obișnuit comenzile sunt inofensive.
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens    ENABLE ROW LEVEL SECURITY;
ALTER TABLE platforms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE games             ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_games        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_runs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports           ENABLE ROW LEVEL SECURITY;

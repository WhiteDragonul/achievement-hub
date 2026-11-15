-- 008: Clasamentul precalculat (materialized view, etapa 4, D44).
-- Clasamentul agregă TOATE deblocările (~640k rânduri) la fiecare cerere: ~170 ms, și niciun index nu evită
-- citirea lor, pentru că rezultatul chiar depinde de toate. Soluția: calculăm o dată scorul fiecărui user pe fiecare
-- platformă și îl păstrăm ca tabel; cererile citesc doar ~20k rânduri precalculate.
-- Prețul: datele sunt „vechi” până la următorul REFRESH (făcut de worker după fiecare sync și la fiecare 5 minute).

CREATE MATERIALIZED VIEW leaderboard_scores AS
SELECT pa.user_id,
       pa.platform_id,
       count(*) AS achievements,
       count(*) FILTER (WHERE a.rarity IN ('ultra_rare', 'very_rare')) AS rare_achievements,
       -- Aceleași puncte ca înainte: ultra rar 50, foarte rar 20, rar 5, comun 1.
       sum(CASE a.rarity WHEN 'ultra_rare' THEN 50 WHEN 'very_rare' THEN 20 WHEN 'rare' THEN 5 ELSE 1 END) AS score
FROM platform_accounts pa
JOIN user_achievements ua ON ua.platform_account_id = pa.id
JOIN achievements a       ON a.id = ua.achievement_id
GROUP BY pa.user_id, pa.platform_id;

-- Indexul unic e obligatoriu pentru REFRESH MATERIALIZED VIEW CONCURRENTLY, care reface datele fără să blocheze
-- citirile (clasamentul rămâne disponibil în timpul refresh-ului).
CREATE UNIQUE INDEX leaderboard_scores_uq ON leaderboard_scores (user_id, platform_id);

-- Pe Supabase, rolurile anon / authenticated primesc implicit acces la obiectele din „public”, iar un materialized view
-- nu poate avea RLS (vezi 006). Le retragem accesul; pe un Postgres obișnuit rolurile nu există și blocul nu face nimic.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON leaderboard_scores FROM anon, authenticated;
    END IF;
END $$;

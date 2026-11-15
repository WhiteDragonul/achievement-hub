-- 007: Indecși pentru interogările aplicației (etapa 4). Măsurătorile EXPLAIN ANALYZE înainte / după: docs/indexes.md,
-- reproductibile cu `npm run db:explain` (din api/).
-- Postgres creează automat indecși doar pentru PRIMARY KEY și UNIQUE, NU și pentru cheile străine.

-- 1. user_achievements.achievement_id: FK fără index. PK-ul (platform_account_id, achievement_id) nu ajută când
--    căutăm după a doua coloană, deci „cine a deblocat achievement-ul X” și ștergerea unui achievement / joc
--    (ON DELETE CASCADE caută rândurile copil după achievement_id) citeau tot tabelul (~640k rânduri).
CREATE INDEX user_achievements_achievement_idx ON user_achievements (achievement_id);

-- 2. friendships.addressee_id: lista de prieteni și filtrul „doar prietenii” din clasament caută
--    WHERE requester_id = X OR addressee_id = X. PK-ul (requester_id, addressee_id) acoperă doar prima parte;
--    cu acest index Postgres combină cele două indexuri (BitmapOr) în loc să scaneze tot tabelul.
CREATE INDEX friendships_addressee_idx ON friendships (addressee_id);

-- 3. sync_runs: istoricul unui cont, cele mai noi primele (WHERE platform_account_id = X ORDER BY created_at DESC LIMIT 5).
--    Indexul compus dă rândurile deja în ordinea cerută: fără sortare, se opresc după primele 5.
CREATE INDEX sync_runs_account_created_idx ON sync_runs (platform_account_id, created_at DESC);

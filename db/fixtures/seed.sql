-- Fixtures: date de test generate integral în SQL, cu generate_series + random() (D14).
-- Rulat de api/src/db/seed.ts într-o singură tranzacție, doar dacă tabelul users e gol.
-- Parametri setați de seed.ts cu set_config() și citiți aici cu current_setting():
--   seed.password_hash: hash argon2 al parolei FIXTURE_PASSWORD (comun tuturor userilor de test)
--   seed.token_key    : TOKEN_ENCRYPTION_KEY, pentru criptarea tokenurilor mock cu pgcrypto
--
-- Volum țintă: ~5.000 useri, ~10.000 conturi de platformă, ~65.000 jocuri deținute, ~650.000 achievement-uri deblocate.

-- Seed fix pentru random(): fiecare rulare generează exact aceleași date (reproductibil pentru EXPLAIN și load test).
SELECT setseed(0.42);


-- 1. Utilizatori -------------------------------------------------------------------------------------------
-- Trei conturi cunoscute pentru demo, câte unul pe rol ...
INSERT INTO users (username, email, password_hash, role, display_name, created_at) VALUES
    ('admin',     'admin@achievementhub.test',     current_setting('seed.password_hash'), 'admin',     'Admin',       now() - interval '2 years'),
    ('moderator', 'moderator@achievementhub.test', current_setting('seed.password_hash'), 'moderator', 'Moderator',   now() - interval '2 years'),
    ('demo',      'demo@achievementhub.test',      current_setting('seed.password_hash'), 'user',      'Demo Player', now() - interval '1 year');

-- ... și 5.000 de jucători generați. Fiecare al 250-lea e moderator (20 în total).
INSERT INTO users (username, email, password_hash, role, display_name, created_at)
SELECT 'player' || n,
       'player' || n || '@achievementhub.test',
       current_setting('seed.password_hash'),
       CASE WHEN n % 250 = 0 THEN 'moderator' ELSE 'user' END,
       (ARRAY['Swift','Silent','Crimson','Lucky','Frozen','Iron','Shadow','Golden','Wild','Cosmic'])[1 + n % 10]
           || (ARRAY['Wolf','Raven','Fox','Dragon','Ninja','Knight','Pixel','Ghost','Tiger','Falcon'])[1 + (n / 10) % 10],
       now() - random() * interval '3 years'
FROM generate_series(1, 5000) AS n;


-- 2. Jocuri ------------------------------------------------------------------------------------------------
-- 200 de titluri (20 prefixe × 10 sufixe). Fiecare titlu apare pe fiecare platformă cu probabilitate 60%,
-- deci multe jocuri sunt multi-platformă, ca în realitate. external_id imită formatul fiecărei platforme.
INSERT INTO games (platform_id, external_id, title, created_at)
SELECT p.id,
       CASE p.code
           WHEN 'steam' THEN (100000 + t.n * 10)::text                    -- appid
           WHEN 'psn'   THEN 'NPWR' || lpad(t.n::text, 5, '0') || '_00'   -- NP Communication ID
           WHEN 'xbox'  THEN (1700000000 + t.n)::text                     -- titleId
           ELSE 'epic-' || md5(t.n::text)                                 -- id opac
       END,
       t.title,
       now() - random() * interval '5 years'
FROM (
    SELECT n,
           (ARRAY['Shadow','Iron','Crimson','Eternal','Galactic','Silent','Neon','Ancient','Frozen','Savage',
                  'Lost','Broken','Hidden','Royal','Rogue','Stellar','Dark','Wild','Mystic','Final'])[1 + n % 20]
           || ' ' ||
           (ARRAY['Legends','Odyssey','Tactics','Frontier','Kingdom','Protocol','Saga','Arena','Horizon','Dynasty'])[1 + (n / 20) % 10]
           AS title
    FROM generate_series(0, 199) AS n
) AS t
CROSS JOIN platforms AS p
WHERE random() < 0.6;


-- 3. Achievement-uri ---------------------------------------------------------------------------------------
-- Între 10 și 50 per joc. global_unlock_pct = 100 · random()²: ridicarea la pătrat împinge valorile spre 0,
-- ca pe platformele reale (multe achievement-uri rare). Rezultă ~10% ultra_rare (<1%), ~12% very_rare (<5%),
-- ~22% rare (<20%), ~55% common.
INSERT INTO achievements (game_id, external_id, name, description, is_hidden, global_unlock_pct)
SELECT g.id,
       'ACH_' || lpad(a.n::text, 3, '0'),
       (ARRAY['First Steps','Collector','Speedrunner','Untouchable','Explorer','Perfectionist','Survivor',
              'Veteran','Sharpshooter','Treasure Hunter','Pacifist','Completionist'])[1 + a.n % 12] || ' ' || a.n,
       'Achievement generat pentru datele de test.',
       random() < 0.1,
       round((100 * power(random(), 2))::numeric, 2)
FROM games AS g
CROSS JOIN LATERAL generate_series(1, 10 + (g.id % 41)::int) AS a(n);


-- 4. Conturi de platformă ----------------------------------------------------------------------------------
-- Fiecare platformă e legată cu altă probabilitate (Steam e cea mai populară): în medie ~2 conturi per user,
-- iar unii useri nu au niciun cont (profil gol, tot un caz real). Userul "demo" le are pe toate 4.
-- Tokenul mock e criptat cu pgcrypto, exact cum va face providerul în etapa 5; Steam nu are token per user (D7).
INSERT INTO platform_accounts (user_id, platform_id, external_id, display_name, access_token_enc, linked_at, last_synced_at)
SELECT u.id,
       p.id,
       CASE p.code
           WHEN 'steam' THEN (76561197960265728 + u.id)::text   -- SteamID64 = bază fixă + id-ul contului
           ELSE p.code || '-' || md5(u.id::text || p.code)
       END,
       u.username,
       CASE WHEN p.is_mock
            THEN pgp_sym_encrypt('mock-token-' || u.id || '-' || p.code, current_setting('seed.token_key'))
       END,
       u.created_at,
       greatest(u.created_at, now() - random() * interval '30 days')
FROM users AS u
CROSS JOIN platforms AS p
WHERE u.username = 'demo'
   OR random() < CASE p.code WHEN 'steam' THEN 0.8 WHEN 'psn' THEN 0.5 WHEN 'xbox' THEN 0.4 ELSE 0.3 END;


-- 5. Jocuri deținute ---------------------------------------------------------------------------------------
-- Fiecare cont deține între 3 și 10 jocuri aleatoare de pe platforma lui.
-- LATERAL: subquery-ul se execută separat pentru fiecare cont, pentru că depinde de pa.platform_id și pa.id.
INSERT INTO user_games (platform_account_id, game_id, playtime_minutes, last_played_at)
SELECT pa.id,
       g.id,
       (power(random(), 2) * 20000)::int,   -- majoritatea jucate câteva ore, puține sute de ore
       now() - random() * interval '1 year'
FROM platform_accounts AS pa
CROSS JOIN LATERAL (
    SELECT games.id
    FROM games
    WHERE games.platform_id = pa.platform_id
    ORDER BY random()
    LIMIT 3 + pa.id % 8
) AS g;


-- 6. Achievement-uri deblocate (tabelul mare) ---------------------------------------------------------------
-- Fiecare achievement al unui joc deținut e deblocat cu probabilitatea global_unlock_pct / 100, deci raritatea
-- din date e consistentă cu procentul afișat: un achievement de 2% e deblocat de ~2% dintre cei care au jocul.
INSERT INTO user_achievements (platform_account_id, achievement_id, unlocked_at)
SELECT ug.platform_account_id,
       a.id,
       ug.last_played_at - random() * interval '2 years'
FROM user_games AS ug
JOIN achievements AS a ON a.game_id = ug.game_id
WHERE random() * 100 < a.global_unlock_pct;


-- 7. Prietenii ---------------------------------------------------------------------------------------------
-- Fiecare user trimite 5 cereri către useri aleatori. Perechile duplicate (inclusiv inversate, prinse de
-- indexul unic friendships_pair_uq) sunt ignorate de ON CONFLICT DO NOTHING. 85% sunt acceptate.
INSERT INTO friendships (requester_id, addressee_id, status, created_at, responded_at)
SELECT f.requester_id,
       f.addressee_id,
       CASE WHEN f.accepted THEN 'accepted' ELSE 'pending' END,
       f.created_at,
       CASE WHEN f.accepted THEN f.created_at + interval '1 day' END
FROM (
    SELECT u.id AS requester_id,
           ids.arr[1 + floor(random() * cardinality(ids.arr))::int] AS addressee_id,
           random() < 0.85 AS accepted,
           now() - interval '1 day' - random() * interval '1 year' AS created_at
    FROM users AS u
    CROSS JOIN generate_series(1, 5)
    CROSS JOIN (SELECT array_agg(id) AS arr FROM users) AS ids
) AS f
WHERE f.requester_id <> f.addressee_id
ON CONFLICT DO NOTHING;


-- 8. Raportări ---------------------------------------------------------------------------------------------
-- 300 de raportări între useri obișnuiți: ~60% deschise, restul rezolvate sau respinse de un moderator aleator.
WITH user_ids AS (SELECT array_agg(id) AS arr FROM users WHERE role = 'user'),
     mod_ids  AS (SELECT array_agg(id) AS arr FROM users WHERE role = 'moderator'),
     r AS (
         SELECT user_ids.arr[1 + floor(random() * cardinality(user_ids.arr))::int] AS reporter_id,
                user_ids.arr[1 + floor(random() * cardinality(user_ids.arr))::int] AS target_user_id,
                mod_ids.arr[1 + floor(random() * cardinality(mod_ids.arr))::int]   AS moderator_id,
                (ARRAY['open','open','open','resolved','rejected'])[1 + floor(random() * 5)::int] AS status,
                (ARRAY['Achievement-uri deblocate imposibil de repede',
                       'Suspect de folosirea unui achievement unlocker',
                       'Nume de profil ofensator',
                       'Spam în cererile de prietenie'])[1 + floor(random() * 4)::int] AS reason,
                now() - interval '1 day' - random() * interval '180 days' AS created_at
         FROM generate_series(1, 300), user_ids, mod_ids
     )
INSERT INTO reports (reporter_id, target_user_id, reason, status, resolved_by, resolution_note, created_at, resolved_at)
SELECT reporter_id,
       target_user_id,
       reason,
       status,
       CASE WHEN status <> 'open' THEN moderator_id END,
       CASE status WHEN 'resolved' THEN 'Utilizator ascuns din clasamente.'
                   WHEN 'rejected' THEN 'Nu am găsit dovezi.' END,
       created_at,
       CASE WHEN status <> 'open' THEN created_at + interval '12 hours' END
FROM r
WHERE reporter_id <> target_user_id;

-- Consecința unei raportări rezolvate: ținta e ascunsă din clasamente.
UPDATE users SET hidden_from_leaderboards = true
WHERE id IN (SELECT target_user_id FROM reports WHERE status = 'resolved');


-- 9. Istoricul sincronizărilor -----------------------------------------------------------------------------
-- Un sync reușit per cont, cu numerele reale din fixtures ...
INSERT INTO sync_runs (platform_account_id, status, created_at, started_at, finished_at, games_synced, achievements_synced)
SELECT pa.id,
       'succeeded',
       pa.last_synced_at - interval '20 seconds',
       pa.last_synced_at - interval '20 seconds',
       pa.last_synced_at,
       (SELECT count(*) FROM user_games AS ug WHERE ug.platform_account_id = pa.id),
       (SELECT count(*) FROM user_achievements AS ua WHERE ua.platform_account_id = pa.id)
FROM platform_accounts AS pa;

-- ... și ~5% eșuate cu o zi înainte, ca să existe erori de afișat în UI și rapoarte.
INSERT INTO sync_runs (platform_account_id, status, created_at, started_at, finished_at, error_message)
SELECT pa.id,
       'failed',
       pa.last_synced_at - interval '1 day',
       pa.last_synced_at - interval '1 day',
       pa.last_synced_at - interval '1 day' + interval '5 seconds',
       (ARRAY['Timeout la API-ul platformei',
              'Profil privat: lista de jocuri nu e publică',
              'Rate limit depășit (HTTP 429)'])[1 + floor(random() * 3)::int]
FROM platform_accounts AS pa
WHERE random() < 0.05;


-- Statistici proaspete pentru planner, altfel primele EXPLAIN-uri ar folosi estimări pentru tabele goale.
ANALYZE;

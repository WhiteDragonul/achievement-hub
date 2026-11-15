# Indecși și optimizări — EXPLAIN ANALYZE înainte / după (etapa 4)

Migrații: [`007_indexes.sql`](../db/migrations/007_indexes.sql) (3 indecși) și
[`008_leaderboard_view.sql`](../db/migrations/008_leaderboard_view.sql) (clasamentul precalculat).

## Cum s-a măsurat

```bash
cd api
npm run db:explain
```

Scriptul [`api/src/cli/explain.ts`](../api/src/cli/explain.ts) rulează fiecare interogare cu `EXPLAIN (ANALYZE, BUFFERS)`
de 5 ori **fără** optimizare și de 5 ori **cu** ea, și raportează mediana. „Fără index” se obține fără să stricăm
baza: fiecare rulare e o tranzacție `BEGIN → DROP INDEX → EXPLAIN ANALYZE → ROLLBACK`. În Postgres și DDL-ul e
tranzacțional, deci `ROLLBACK` readuce indexul. Același `ROLLBACK` anulează și `DELETE`-ul măsurat în cazul 2.
Valorile (id-urile) sunt alese automat dintre cele mai „populare” din baza curentă.

**Date:** fixtures generate la pornire — 5.003 useri, 9.928 conturi legate, 13.940 achievement-uri,
638.642 `user_achievements`, 24.984 prietenii, 10.419 sincronizări. Postgres 18, local (fără latența rețelei),
cache cald (`shared hit` = pagini citite din memorie).
Pe Supabase timpii absoluți diferă, dar planurile și raportul înainte/după rămân aceleași — se poate verifica
rulând aceeași comandă cu `.env`-ul de Supabase.

## Rezumat

| Caz | Înainte (ms) | După (ms) | De câte ori mai rapid |
|---|---:|---:|---:|
| 1. Câți jucători au deblocat un achievement (achievement_id = 13563) | 28.764 | 0.046 | 625× |
| 2. Ștergerea unui achievement (ON DELETE CASCADE în user_achievements) | 19.688 | 0.136 | 145× |
| 3. Prieteniile unui user (requester_id = X OR addressee_id = X, X = 2042) | 0.871 | 0.026 | 34× |
| 4. Ultimele 5 sincronizări ale unui cont (platform_account_id = 9720) | 0.283 | 0.012 | 24× |
| 5. Clasamentul global (top 20) | 142.963 | 7.073 | 20× |

## De ce fiecare optimizare

**Postgres creează automat indecși doar pentru `PRIMARY KEY` și `UNIQUE`, nu și pentru cheile străine.**
Un index compus `(a, b)` poate fi folosit pentru căutări după `a` sau după `a` și `b`, dar nu doar după `b`.

1. **`user_achievements (achievement_id)`** — PK-ul e `(platform_account_id, achievement_id)`, deci căutarea doar după
   `achievement_id` citea tot tabelul (Parallel Seq Scan, 4.068 de pagini). Cu indexul: *Index Only Scan*, 4 pagini —
   Postgres nici nu mai citește tabelul, numărul vine direct din index.
2. **Același index, la ștergere** — `ON DELETE CASCADE` e implementat ca un trigger care caută rândurile copil după cheia
   străină. Fără index, ștergerea unui singur achievement (sau a unui joc, care șterge zeci de achievement-uri)
   scana toate cele ~640k deblocări pentru fiecare achievement. În plan se vede direct:
   `Trigger for constraint user_achievements_achievement_id_fkey`.
3. **`friendships (addressee_id)`** — condiția `requester_id = X OR addressee_id = X` folosea doar PK-ul pentru prima
   parte, deci planificatorul alegea Seq Scan. Cu indexul, Postgres combină două scanări de index cu **BitmapOr**.
   Tabelul e mic (25k rânduri), dar interogarea rulează la fiecare deschidere a paginii Prieteni și la filtrul
   „Doar prietenii” din clasament.
4. **`sync_runs (platform_account_id, created_at DESC)`** — indexul compus întoarce rândurile deja în ordinea cerută:
   dispare nodul `Sort`, iar `LIMIT 5` se oprește după primele 5 intrări din index.
5. **Clasamentul → materialized view** — clasamentul agregă *toate* deblocările (3 × Hash Join peste ~640k rânduri),
   deci niciun index nu poate evita citirea lor: rezultatul chiar depinde de toate. `leaderboard_scores` păstrează
   scorul precalculat al fiecărui user pe fiecare platformă (~10k rânduri); cererea citește 266 de pagini în loc de 5.781.
   **Compromisul:** datele pot fi „vechi” câteva minute. Worker-ul face `REFRESH MATERIALIZED VIEW CONCURRENTLY` după
   fiecare sync și la fiecare 5 minute (job programat în pg-boss). `CONCURRENTLY` cere un index unic pe view
   (`leaderboard_scores_uq`) și lasă clasamentul vechi vizibil cât timp se calculează cel nou.

**Ce nu am indexat:** `games` (471 de rânduri) și `reports` (300) — tabele atât de mici încât Seq Scan e deja sub 0,1 ms;
un index ar costa la fiecare `INSERT` fără câștig măsurabil. Fiecare index încetinește scrierile (trebuie actualizat
la fiecare `INSERT`/`UPDATE`/`DELETE`) și ocupă spațiu, deci îl adăugăm doar unde o interogare reală îl folosește.

## Planurile complete (rezumate)

### 1. Câți jucători au deblocat un achievement (achievement_id = 13563) — index user_achievements_achievement_idx

Înainte:
```
Finalize Aggregate  (actual time=23.466..26.375 rows=1.00 loops=1)
        ->  Partial Aggregate  (actual time=6.140..6.140 rows=1.00 loops=3)
              ->  Parallel Seq Scan on user_achievements  (actual time=5.960..6.133 rows=83.67 loops=3)
Execution Time: 26.396 ms
Pagini citite: 4068
```
După:
```
Aggregate  (actual time=0.051..0.051 rows=1.00 loops=1)
  ->  Index Only Scan using user_achievements_achievement_idx on user_achievements  (actual time=0.006..0.027 rows=251.00 loops=1)
Execution Time: 0.059 ms
Pagini citite: 7
```
Mediană din 5 rulări: **28.764 ms → 0.046 ms**

### 2. Ștergerea unui achievement (ON DELETE CASCADE în user_achievements) — același index

Înainte:
```
  ->  Index Scan using achievements_pkey on achievements  (actual time=0.010..0.011 rows=1.00 loops=1)
Trigger for constraint user_achievements_achievement_id_fkey: time=19.385 calls=1
Execution Time: 19.420 ms
Pagini citite: 5
```
După:
```
  ->  Index Scan using achievements_pkey on achievements  (actual time=0.007..0.007 rows=1.00 loops=1)
Trigger for constraint user_achievements_achievement_id_fkey: time=0.112 calls=1
Execution Time: 0.131 ms
Pagini citite: 5
```
Mediană din 5 rulări: **19.688 ms → 0.136 ms**

### 3. Prieteniile unui user (requester_id = X OR addressee_id = X, X = 2042) — index friendships_addressee_idx

Înainte:
```
Seq Scan on friendships  (actual time=0.008..0.840 rows=22.00 loops=1)
Execution Time: 0.846 ms
Pagini citite: 227
```
După:
```
Bitmap Heap Scan on friendships  (actual time=0.007..0.011 rows=22.00 loops=1)
  ->  BitmapOr  (actual time=0.003..0.004 rows=0.00 loops=1)
        ->  Bitmap Index Scan on friendships_pkey  (actual time=0.002..0.002 rows=5.00 loops=1)
        ->  Bitmap Index Scan on friendships_addressee_idx  (actual time=0.001..0.001 rows=17.00 loops=1)
Execution Time: 0.016 ms
Pagini citite: 22
```
Mediană din 5 rulări: **0.871 ms → 0.026 ms**

### 4. Ultimele 5 sincronizări ale unui cont (platform_account_id = 9720) — index sync_runs_account_created_idx

Înainte:
```
        ->  Seq Scan on sync_runs  (actual time=0.252..0.270 rows=2.00 loops=1)
Execution Time: 0.280 ms
Pagini citite: 130
```
După:
```
  ->  Index Scan using sync_runs_account_created_idx on sync_runs  (actual time=0.005..0.005 rows=2.00 loops=1)
Execution Time: 0.012 ms
Pagini citite: 4
```
Mediană din 5 rulări: **0.283 ms → 0.012 ms**

### 5. Clasamentul global (top 20) — agregare pe toate deblocările vs. materialized view leaderboard_scores

Înainte:
```
                    ->  Finalize HashAggregate  (actual time=138.988..141.172 rows=4737.00 loops=1)
                                ->  Partial HashAggregate  (actual time=118.860..119.252 rows=4736.33 loops=3)
                                      ->  Hash Join  (actual time=6.410..88.712 rows=209582.33 loops=3)
                                            ->  Hash Join  (actual time=3.482..63.840 rows=209582.33 loops=3)
                                                  ->  Hash Join  (actual time=2.120..38.496 rows=212880.67 loops=3)
                                                        ->  Parallel Seq Scan on user_achievements ua  (actual time=0.005..8.823 rows=212880.67 loops=3)
                                                              ->  Seq Scan on platform_accounts pa  (actual time=0.472..1.287 rows=9928.00 loops=3)
                                                        ->  Seq Scan on users u  (actual time=0.322..0.919 rows=4935.00 loops=3)
                                                  ->  Seq Scan on achievements a  (actual time=0.334..1.672 rows=13940.00 loops=3)
Execution Time: 142.330 ms
Pagini citite: 5781
```
După:
```
                    ->  HashAggregate  (actual time=4.674..5.488 rows=4737.00 loops=1)
                          ->  Hash Join  (actual time=0.826..2.423 rows=9785.00 loops=1)
                                ->  Seq Scan on leaderboard_scores s  (actual time=0.005..0.351 rows=9928.00 loops=1)
                                      ->  Seq Scan on users u  (actual time=0.004..0.437 rows=4935.00 loops=1)
Execution Time: 6.716 ms
Pagini citite: 266
```
Mediană din 5 rulări: **142.963 ms → 7.073 ms**

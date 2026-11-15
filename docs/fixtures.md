# Fixtures (date de test)

Generate de [`db/fixtures/seed.sql`](../db/fixtures/seed.sql), încărcate automat la pornirea API-ului dacă tabelul `users`
e gol (`SEED_ON_START=true`). Totul rulează într-o singură tranzacție: dacă ceva eșuează, baza rămâne goală.

## Volum (`setseed(0.42)`)

Cifrele sunt de pe Postgres local (PGlite). Pe Supabase (Postgres 17) aceeași rulare a dat valori foarte apropiate,
dar nu identice (ex. 648.436 `user_achievements`), pentru că secvența `random()` diferă între versiuni de Postgres.

| Tabel | Rânduri | Cum sunt generate |
|---|---:|---|
| `users` | 5.003 | 3 conturi demo (admin / moderator / demo) + 5.000 `playerN`; fiecare al 250-lea e moderator |
| `platform_accounts` | 9.928 | Steam 80%, PSN 50%, Xbox 40%, Epic 30% per user; ~200 useri fără niciun cont |
| `games` | 471 | 200 de titluri, fiecare pe fiecare platformă cu probabilitate 60% |
| `achievements` | 13.940 | 10–50 per joc; `global_unlock_pct = 100·random()²` |
| `user_games` | 64.532 | 3–10 jocuri aleatoare per cont, de pe platforma contului |
| `user_achievements` | **638.506** | fiecare achievement al unui joc deținut, deblocat cu probabilitatea `global_unlock_pct/100` |
| `friendships` | 24.984 | 5 cereri per user, 85% acceptate; duplicatele sunt ignorate |
| `reports` | 300 | ~55% deschise, restul rezolvate/respinse; țintele rezolvate sunt ascunse din clasamente |
| `sync_runs` | 10.418 | un sync reușit per cont + ~5% eșuate |

Durată: ~11–28 s pe un Postgres local; pe Supabase depinde de planul instanței.

## Distribuția rarității (verificată)

| Raritate | Achievement-uri | % mediu declarat | % real deblocat în fixtures |
|---|---:|---:|---:|
| ultra_rare (< 1%) | 1.437 | 0,3 | 0,2 |
| very_rare (< 5%) | 1.686 | 2,8 | 2,2 |
| rare (< 20%) | 3.118 | 11,6 | 9,8 |
| common | 7.699 | 55,3 | 55,8 |

Procentul real e apropiat de cel declarat, deci clasamentele „după raritate” au sens pe datele de test.

## Conturi de test

Toate au parola din `FIXTURE_PASSWORD` (implicit în `.env.example`).

| Email | Rol | Particularitate |
|---|---|---|
| `admin@achievementhub.test` | admin | |
| `moderator@achievementhub.test` | moderator | |
| `demo@achievementhub.test` | user | are toate cele 4 platforme legate |
| `player1@…` … `player5000@achievementhub.test` | user / moderator | date aleatoare |

## Re-generare

Fixtures **nu** se mai încarcă implicit (D45): baza aplicației conține doar conturile reale.
Pentru evaluare sau load test: `SEED_ON_START=true` în `.env` (la pornire, doar dacă nu există useri) sau `npm run db:seed`.
Fixtures se încarcă doar pe o bază fără useri. Ca să le regenerezi, golește tabelele (ex. în SQL Editor:
`TRUNCATE users, platforms, games RESTART IDENTITY CASCADE;` urmat de re-inserarea platformelor din migrația 003)
sau recreează proiectul. Comanda separată: `npm run db:seed` (în `api/`).

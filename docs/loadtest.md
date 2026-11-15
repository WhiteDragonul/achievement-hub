# Load test (k6) — etapa 4

Script: [`loadtest/api.js`](../loadtest/api.js).

## Scenariul

Fiecare utilizator virtual (VU) face ce face un jucător obișnuit, cu o pauză de 1 s între iterații:

1. `GET /api/leaderboard?limit=20` — clasamentul global (cea mai grea interogare, acum din materialized view);
2. `GET /api/users/:id/profile` — profilul unui user ales aleator dintre cei 5.000 din fixtures;
3. `GET /api/users/:id/games?limit=12` — biblioteca lui;
4. `GET /api/games/:id/achievements?user_id=…` — achievement-urile unuia dintre jocuri.

Login-ul se face o singură dată (`setup`), pentru că argon2 e lent intenționat (~50 ms / hash) și ar domina măsurătoarea.

Încărcare: 0 → 20 VU în 20 s, 20 → 50 VU în 60 s, apoi coborâre în 10 s.

**Praguri** (testul pică dacă nu sunt respectate): sub 1% erori; p95 sub 800 ms pentru clasament și sub 500 ms
pentru celelalte rute.

## Rulare

```bash
k6 run -e API_URL=http://localhost:3000 loadtest/api.js
```

Pe Windows, k6 se instalează cu `winget install k6 --source winget` (sau din https://grafana.com/docs/k6/latest/set-up/install-k6/).

## Rezultate

Rulat pe 15.11.2026 cu k6 v2.4.0, pe aceeași mașină cu API-ul (Node 24) și un Postgres 18 local cu fixtures
(5.003 useri, 638.642 deblocări). Durata: 1 min 30 s, maximum 50 VU.

**Toate pragurile au trecut.**

| Rută | medie | mediană | p90 | p95 | max |
|---|---:|---:|---:|---:|---:|
| clasament (`/leaderboard`) | 9,91 ms | 9,15 ms | 12,26 ms | **14,86 ms** | 146,5 ms |
| profil (`/users/:id/profile`) | 1,93 ms | 1,95 ms | 2,98 ms | **3,36 ms** | 23,9 ms |
| bibliotecă (`/users/:id/games`) | 1,41 ms | 1,41 ms | 2,44 ms | **2,59 ms** | 5,4 ms |
| achievement-urile unui joc | 1,51 ms | 1,50 ms | 2,48 ms | **2,74 ms** | 6,1 ms |
| **toate cererile** | 3,72 ms | 1,99 ms | 9,56 ms | **10,68 ms** | 146,5 ms |

- **9.958 cereri**, 0 erori (`http_req_failed` = 0,00%), 100% din verificări reușite;
- 2.513 iterații complete, ~110 cereri/s (ritmul e limitat de pauza de 1 s a fiecărui „jucător”, nu de server);
- maximul de 146 ms la clasament e un vârf izolat; p95 rămâne sub 15 ms.

**Interpretare:** clasamentul rămâne cea mai lentă rută, dar p95 e de peste 50 de ori sub prag datorită materialized view-ului
(fără el, doar interogarea dura ~143 ms — vezi [indexes.md](indexes.md), cazul 5). Celelalte rute folosesc indecșii
(PK-uri compuse și cei din 007) și răspund în 1–3 ms.

**Limitări:** API-ul, baza de date și k6 rulează pe aceeași mașină, deci lipsește latența rețelei. Pe Supabase fiecare
interogare adaugă câteva zeci de ms (drumul până la serverul din eu-west-1), dar raportul dintre rute rămâne același.

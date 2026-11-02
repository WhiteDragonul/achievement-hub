# Achievement Hub — brief de proiect (Baze de date avansate)

Proiect individual, evaluat la susținerea orală: autorul trebuie să poată explica/modifica orice componentă fără asistență.
**Prioritate: cod clar și explicabil, nu „smart”.** Fără abstracții inutile; comentarii doar pentru logica neevidentă.

## Tema
Utilizatorul își face cont, își leagă conturile Steam / PlayStation / Xbox / Epic, iar aplicația sincronizează jocurile
și achievement-urile într-un profil unificat (progres, raritate, clasamente, prieteni).
- Steam: integrare reală (Steam Web API + login Steam OpenID).
- PSN, Xbox, Epic: interfață comună `AchievementProvider` + `MockProvider` cu date realiste; arhitectura permite un provider real ulterior.

## Stack (fix — nu se schimbă fără acordul autorului)
- **PostgreSQL găzduit pe Supabase** (singurul SGBD), `pgcrypto` pentru criptarea tokenurilor platformelor.
  Supabase e folosit DOAR ca Postgres: fără Supabase Auth, fără PostgREST din client (vezi DECISIONS.md D1).
- Backend: TypeScript + Fastify, Kysely (SQL vizibil, fără ORM greu).
- Migrații: fișiere `.sql` numerotate în `/db/migrations`.
- Auth: argon2 pentru parole, JWT de acces scurt + refresh token stocat (hash) în DB.
- Joburi de sync: pg-boss.
- Frontend: React + Vite + TanStack Query + Tailwind (în `/web`).
- Shell multi-platformă: Tauri 2 în `/app` (src-tauri) — desktop (Win/Linux/macOS), Android, iOS. Aplicația e doar client;
  URL-ul API-ului vine din variabilă de mediu la build. Tokenuri în Keychain/Keystore (plugin Tauri), nu în localStorage.
  Login Steam prin deep-link `achievementhub://auth/callback`. UI mobile-first (bottom tabs pe mobil, sidebar pe desktop).
- Rapoarte: CSV (COPY/stream), Excel (exceljs), PDF (pdfkit).
- Load test: k6, scripturi în `/loadtest`.
- Docker Compose: `docker compose up` pornește API + worker + web (DB-ul e pe Supabase).
- CI: GitHub Actions — Linux, Windows, Android (ubuntu) + macOS, iOS (macos runner); artefacte la fiecare release.

## Cerințe obligatorii
1. Documentație: domeniu + fiecare pagină din UI (`/docs`).
2. Model de date: ≥ 6 tabele, FK / UNIQUE / CHECK / NOT NULL corecte.
3. Fixtures automate la pornire: mii de useri, sute de mii de `user_achievements`.
4. CRUD pentru toate entitățile.
5. Autentificare explicită (stocare parole, sesiuni/tokenuri).
6. ≥ 3 roluri: `user`, `moderator`, `admin`.
7. Indecși justificați cu EXPLAIN ANALYZE înainte/după → `/docs/indexes.md`.
8. Load test pe API cu rezultate → `/docs/loadtest.md`.
9. Rapoarte PDF, CSV, Excel.

## Reguli de lucru
- După fiecare etapă: intrare în `AI_LOG.md` (ce + prompt), decizii în `DECISIONS.md` (cu justificare), commit mic cu mesaj clar.
- Oprire după fiecare etapă pentru verificare; la final de etapă, explicație scurtă reproductibilă la susținere.

## Etape (aliniate cu slide-ul de evaluare, D20)
La fiecare verificare se prezintă etapa curentă; cerințele etapelor anterioare trebuie să rămână îndeplinite.
Documentul de prezentare (`docs/prezentare.md`) se completează la fiecare etapă.
0. Tema — documentul cu domeniul temei
1. Modelare — schema (ER + migrații), ≥ 6 tabele, relații, fixtures, Docker Compose — **gata**
2. CRUD — API CRUD pentru toate entitățile + frontend React (paginile) + descrierea paginilor
3. Autentificare — argon2, JWT + refresh, 3 roluri aplicate peste CRUD
3b. Extra: sync (Steam real + mock providers, pg-boss)
3c. Extra: shell Tauri 2 + build multi-platformă (+ `/docs/build.md`, CI, decizii Tauri / stocare securizată)
4. Performanță — indecși cu EXPLAIN ANALYZE înainte/după + load test k6
5. Rapoarte — PDF, CSV, Excel
6. Susținere — prezentarea finală

## Stare curentă
Etapele 0, 1 și 2 gata (2a API CRUD, 2b pagini React, 2c descrierea paginilor); urmează etapa 3 (autentificare + roluri).

# DECISIONS — decizii de design și justificări

Format: **Dn — decizie.** Justificare. Alternative respinse.

---

## Etapa 1 — Baza de date

**D1 — Postgres găzduit pe Supabase, folosit strict ca Postgres.**
Supabase oferă un PostgreSQL administrat (backup, dashboard SQL, `pgcrypto` preinstalat), deci rămânem pe un singur SGBD,
cum cere brief-ul. NU folosim Supabase Auth și nici API-ul auto-generat (PostgREST): autentificarea trebuie implementată
explicit (cerința 5), iar tot accesul la date trece prin API-ul nostru Fastify, unde sunt verificate rolurile.
Consecințe:
- Toate tabelele au **RLS activat fără politici** (migrația 006): rolurile Supabase `anon`/`authenticated` nu pot citi nimic
  prin API-ul public, chiar dacă cineva găsește cheia publică. Backend-ul se conectează ca `postgres` (proprietarul
  tabelelor), care nu e afectat de RLS.
- Conexiunea se face prin **Session pooler** (port 5432), nu Transaction pooler: pg-boss folosește `LISTEN`/advisory locks
  care au nevoie de o sesiune stabilă; conexiunea directă e doar IPv6, ceea ce în Docker pe Windows de obicei nu merge.
- Versiunea: proiectele Supabase noi rulează Postgres 17 (brief-ul zicea 16). Nu folosim nimic specific 17, schema merge pe 16.
Alternative respinse: Postgres local în Docker (brief-ul inițial) — schimbat la cererea autorului.

**D2 — Chei primare `bigint GENERATED ALWAYS AS IDENTITY`.**
Standard SQL, mai mici și mai rapide la join decât UUID, ușor de citit în EXPLAIN și în demo. `ALWAYS` împiedică inserarea
manuală de id-uri (evită desincronizarea secvenței). UUID nu aduce nimic aici (nu generăm id-uri pe client).

**D3 — Rolul ca coloană `text` + `CHECK (role IN ('user','moderator','admin'))`.**
Un utilizator are exact un rol, iar rolurile nu au atribute proprii → un tabel `roles` + tabel de legătură ar fi o abstracție
inutilă. Am preferat `text + CHECK` în loc de `CREATE TYPE ... AS ENUM` pentru toate „enum-urile” (rol, status-uri):
o valoare nouă se adaugă modificând un CHECK, iar valorile sunt vizibile direct în definiția tabelului.

**D4 — Un joc aparține unei singure platforme (`games.platform_id`).**
Același titlu pe Steam și pe PSN are achievement-uri diferite (liste, id-uri, procente diferite), deci sunt rânduri diferite.
Profilul „unificat” = agregare peste toate conturile utilizatorului. Unificarea titlurilor între platforme ar cere potrivire
fuzzy de nume — complexitate fără valoare pentru cerințele proiectului.

**D5 — Progresul (`user_games`, `user_achievements`) e legat de `platform_account_id`, nu direct de `user_id`.**
Un achievement e deblocat pe un cont de platformă. Când utilizatorul își dezleagă contul Xbox, `ON DELETE CASCADE` șterge
automat tot progresul de pe acel cont, fără cod în aplicație. Costul: clasamentele fac un join în plus
(`user_achievements → platform_accounts → users`) — exact genul de query pe care îl optimizăm în etapa 7.
Garanția „maxim un cont per platformă per utilizator” vine din `UNIQUE (user_id, platform_id)`.

**D6 — Refresh tokenurile se stochează ca hash SHA-256 (`bytea`), nu în clar.**
Dacă baza e compromisă, hash-urile nu pot fi folosite pentru a obține sesiuni. SHA-256 (nu argon2) e suficient pentru că
tokenul e aleator de 256 biți — nu poate fi ghicit prin brute-force, spre deosebire de o parolă. Revocarea = `revoked_at`.

**D7 — Tokenurile platformelor sunt criptate cu `pgp_sym_encrypt` (pgcrypto), cheia vine din variabilă de mediu.**
Spre deosebire de parole, tokenurile trebuie citite înapoi (le trimitem la API-ul platformei), deci criptare reversibilă,
nu hash. Cheia NU e stocată în DB; aplicația o trimite ca parametru în query. Notă: Steam folosește o cheie API globală a
serverului + SteamID public, deci pentru Steam `access_token_enc` e NULL; coloana e pentru providerii care au token per
utilizator (PSN/Xbox reali; mock-ul salvează un token fals criptat ca demonstrație).

**D8 — Raritatea e o coloană generată (`achievements.rarity GENERATED ALWAYS AS (...) STORED`).**
Pragurile (ultra_rare < 1%, very_rare < 5%, rare < 20%, common) sunt definite într-un singur loc, în DB, și nu pot ajunge
inconsistente cu `global_unlock_pct`. Fiind `STORED`, poate fi indexată și filtrată ieftin.

**D9 — Prietenii: un singur rând per pereche, cu index unic pe `(LEAST(a,b), GREATEST(a,b))`.**
PK-ul `(requester_id, addressee_id)` singur ar permite și A→B și B→A. Indexul unic pe perechea neordonată blochează
duplicatul invers. `CHECK (requester_id <> addressee_id)` blochează prietenia cu sine. O cerere refuzată se șterge.

**D10 — Indecșii secundari se adaugă abia în etapa 7.**
Migrațiile din etapa 1 creează doar indecșii impliciți din PRIMARY KEY / UNIQUE (necesari pentru corectitudine). Indecșii de
performanță (FK-uri, clasamente, căutări) vin în etapa 7, fiecare cu EXPLAIN ANALYZE înainte/după, ca să avem o măsurătoare
reală „fără index” și nu doar o afirmație.

**D11 — CHECK-uri de consistență între coloane, nu doar pe valori.**
Exemple: `reports` — `(status = 'open') = (resolved_at IS NULL)`; `friendships` — `(status = 'pending') = (responded_at IS NULL)`;
`sync_runs` — un job `failed` trebuie să aibă `error_message`. Astfel starea invalidă nu poate fi scrisă nici de un bug în API.

**D12 — `user_achievements.unlocked_at >= '2000-01-01'`.**
Steam întoarce `unlocktime = 0` (1970-01-01) pentru achievement-uri neobținute; CHECK-ul prinde bug-ul în care am salva
un achievement nedeblocat ca fiind deblocat.

**D13 — Evidența migrațiilor în tabelul `schema_migrations (filename PK, applied_at)`.**
Runner-ul (etapa 2) aplică doar fișierele din `db/migrations` care nu apar în tabel, fiecare într-o tranzacție.
Prima aplicare pe Supabase s-a făcut manual din SQL Editor (conectorul AI era pe alt cont), cu un fișier generat care
marchează 001–006 ca aplicate — astfel aplicarea manuală și cea automată rămân compatibile.

---

## Etapa 2 — Docker Compose + fixtures

**D14 — Fixtures generate în SQL (`generate_series` + `random()`), nu din Node.**
Datele se generează direct pe serverul Postgres, deci nu trimitem ~650.000 de rânduri prin rețea până la Supabase (din Node,
cu INSERT-uri în loturi, ar dura minute). Fișierul `db/fixtures/seed.sql` e SQL pur, ușor de citit și de explicat secțiune
cu secțiune. `setseed(0.42)` face datele reproductibile, deci EXPLAIN-urile din etapa 7 și load test-ul din etapa 9 rulează
mereu pe aceleași date. Realismul vine din probabilități: un achievement e deblocat cu probabilitatea `global_unlock_pct`,
deci raritatea afișată corespunde datelor (verificat în `docs/fixtures.md`).
Un singur hash argon2 pentru toți userii de test: argon2 e lent intenționat, 5.000 de hash-uri ar dura minute.

**D15 — TLS spre Supabase cu `rejectUnauthorized: false`.**
Conexiunea e criptată, dar certificatul nu e validat, pentru că e semnat de CA-ul propriu Supabase, nu de un CA public.
Varianta strictă (de făcut în producție): descărcăm certificatul CA din dashboard și îl dăm lui `pg` (`ssl: { ca }`).
Am ales simplitatea pentru proiect; riscul rămas e un atac man-in-the-middle între server și Supabase.

**D16 — Migrațiile și fixtures rulează la pornirea API-ului (`main.ts`: migrate → seed → listen).**
Așa `docker compose up` e singura comandă necesară, cum cere brief-ul. Funcționează pentru că avem o singură instanță de API;
cu mai multe instanțe am muta migrațiile într-un pas separat (sau am folosi un advisory lock).

**D17 — Tipurile Kysely scrise de mână (`api/src/db/types.ts`), nu generate (kysely-codegen).**
Un fișier citibil care oglindește migrațiile, fără încă un tool în proiect. Dezavantaj: trebuie actualizat manual la fiecare
migrație nouă.

**D18 — `bigint` și `numeric` convertite în `number` în TypeScript.**
`pg` le întoarce implicit ca string (ca să nu piardă precizie peste 2^53). Id-urile și count-urile noastre nu se apropie de
2^53, iar `numeric(5,2)` e un procent, deci conversia e sigură și codul rămâne simplu.

**D19 — Imagine Docker multi-stage, scripturile de instalare npm dezactivate (`allowScripts: false`).**
Prima etapă compilează TypeScript; imaginea finală conține doar dependențele de producție și JS-ul compilat. `argon2` vine cu
binare precompilate, deci nu are nevoie de scriptul de instalare (care ar cere compilator C++ în imagine).

---

## Reorganizarea etapelor

**D20 — Etapele urmează slide-ul de evaluare: Tema → Modelare → CRUD → Autentificare → Performanță → Rapoarte → Susținere.**
La fiecare verificare se prezintă etapa curentă, deci ordinea de lucru trebuie să fie ordinea verificărilor.
Consecințe față de planul inițial (aprobate de autor):
- documentul de prezentare (`docs/prezentare.md`) există de la etapa 0 și crește la fiecare etapă;
- frontend-ul vine odată cu CRUD-ul (etapa 2), pentru că slide-ul cere „descrierea paginilor” acolo;
- CRUD-ul se face înaintea autentificării; în etapa 3 rutele existente primesc protecție pe roluri
  (ușor de demonstrat „înainte / după”);
- sync-ul cu platformele și aplicația Tauri nu apar în slide, deci sunt extra, după etapa 3
  (legarea unui cont Steam presupune un utilizator logat);
- indecșii și load test-ul se prezintă împreună (etapa 4, „Performanță”).

---

## Etapa 2 — CRUD

**D21 — Constrângerile rămân în baza de date; API-ul doar traduce erorile Postgres în coduri HTTP.**
Nu verificăm în TypeScript unicitatea sau valorile permise înainte de INSERT: ar fi cod duplicat și ar avea race
conditions (două cereri simultane trec amândouă verificarea). Baza e sursa de adevăr; `errors.ts` mapează SQLSTATE
(`23505` unique, `23503` foreign key, `23001` restrict, `23514` check, `23502` not null) în 409/400 și trimite numele
constrângerii, deci clientul vede exact regula încălcată. Schema JSON a fiecărei rute validează doar forma cererii
(tipuri, câmpuri obligatorii, enum-uri).

**D22 — CRUD-ul e întâi deschis, autentificarea se adaugă peste el în etapa 3.**
Urmează ordinea verificărilor (D20) și face vizibilă diferența „înainte / după” la prezentarea etapei 3.

**D23 — Câte un fișier de rute per entitate, fără un generator CRUD generic.**
Un „CRUD factory” ar scurta codul, dar fiecare rută ar deveni mai greu de explicat și de modificat individual
(ex. rezolvarea raportărilor are o tranzacție, prieteniile au cheie compusă). Repetiția e intenționată și citibilă.

**D24 — Valorile `undefined` în `.set({...})` pentru câmpuri opționale.**
Kysely ignoră cheile `undefined`, deci un PATCH modifică doar coloanele trimise, fără construcții condiționale.

**D25 — Testele de integrare rulează pe PGlite (Postgres compilat în WebAssembly), nu pe Supabase.**
Aceleași migrații și aceleași constrângeri ca în producție, dar într-o bază în memorie creată la fiecare rulare:
testele nu ating datele reale și nu au nevoie de Docker. Testele au prins o eroare reală: `ON DELETE RESTRICT`
întoarce SQLSTATE `23001`, nu `23503`, deci ștergerea unei platforme folosite dădea 500 în loc de 409.

**D26 — Rutele agregate pentru pagini (`views.ts`) sunt scrise ca SQL direct, nu cu query builder-ul.**
Clasamentul, profilul și biblioteca au JOIN-uri, GROUP BY, funcții fereastră (`rank() OVER`) și subquery-uri corelate.
În SQL direct se citesc exact ca în EXPLAIN ANALYZE din etapa 4, iar parametrii rămân legați (`${valoare}` din șablonul
`sql` devine `$1`, `$2`…, deci nu există risc de SQL injection). Filtrele opționale sunt fragmente `sql` adăugate doar
când sunt cerute, în loc de `($1 IS NULL OR ...)`, care ar împiedica planner-ul să folosească indecși.
Clasamentul global durează ~3 s pe Supabase (agregare peste ~650.000 de rânduri): punct de plecare pentru etapa 4.

**D27 — Frontend: React Router + TanStack Query, fără state manager global.**
Datele vin din server, deci starea lor e cache-ul TanStack Query; după fiecare modificare invalidăm cheile afectate
și listele se reîncarcă singure. Starea locală (filtre, formulare) e `useState` în pagina respectivă.

**D28 — Mobile-first cu Tailwind: tab-uri jos pe telefon, sidebar de la 768px în sus.**
Aceeași aplicație va rula în Tauri pe telefon și desktop (etapa 3c). Bara de tab-uri respectă zona de gesturi
(`env(safe-area-inset-bottom)`), iar butoanele au minim 40px înălțime pentru atingere.

**D29 — Selector temporar „Acționezi ca” în loc de login, până la etapa 3.**
Paginile au nevoie de un user curent (profilul meu, prietenii mei). Până la autentificare îl alegem manual (implicit
userul `demo`); în etapa 3 id-ul va veni din token, iar selectorul dispare.

**D30 — În dezvoltare, Vite face proxy pentru `/api`; în Docker, nginx face același lucru.**
Browserul vede o singură origine, deci nu e nevoie de CORS. Aplicația Tauri (etapa 3c) va folosi `VITE_API_URL`.

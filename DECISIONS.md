# DECISIONS: decizii de design și justificări

Format: **Dn: decizie.** Justificare. Alternative respinse.

---

## Etapa 1: Baza de date

**D1: Postgres găzduit pe Supabase, folosit strict ca Postgres.**
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
Alternative respinse: Postgres local în Docker (brief-ul inițial): schimbat la cererea autorului.

**D2: Chei primare `bigint GENERATED ALWAYS AS IDENTITY`.**
Standard SQL, mai mici și mai rapide la join decât UUID, ușor de citit în EXPLAIN și în demo. `ALWAYS` împiedică inserarea
manuală de id-uri (evită desincronizarea secvenței). UUID nu aduce nimic aici (nu generăm id-uri pe client).

**D3: Rolul ca coloană `text` + `CHECK (role IN ('user','moderator','admin'))`.**
Un utilizator are exact un rol, iar rolurile nu au atribute proprii → un tabel `roles` + tabel de legătură ar fi o abstracție
inutilă. Am preferat `text + CHECK` în loc de `CREATE TYPE ... AS ENUM` pentru toate „enum-urile” (rol, status-uri):
o valoare nouă se adaugă modificând un CHECK, iar valorile sunt vizibile direct în definiția tabelului.

**D4: Un joc aparține unei singure platforme (`games.platform_id`).**
Același titlu pe Steam și pe PSN are achievement-uri diferite (liste, id-uri, procente diferite), deci sunt rânduri diferite.
Profilul „unificat” = agregare peste toate conturile utilizatorului. Unificarea titlurilor între platforme ar cere potrivire
fuzzy de nume: complexitate fără valoare pentru cerințele proiectului.

**D5: Progresul (`user_games`, `user_achievements`) e legat de `platform_account_id`, nu direct de `user_id`.**
Un achievement e deblocat pe un cont de platformă. Când utilizatorul își dezleagă contul Xbox, `ON DELETE CASCADE` șterge
automat tot progresul de pe acel cont, fără cod în aplicație. Costul: clasamentele fac un join în plus
(`user_achievements → platform_accounts → users`): exact genul de query pe care îl optimizăm în etapa 7.
Garanția „maxim un cont per platformă per utilizator” vine din `UNIQUE (user_id, platform_id)`.

**D6: Refresh tokenurile se stochează ca hash SHA-256 (`bytea`), nu în clar.**
Dacă baza e compromisă, hash-urile nu pot fi folosite pentru a obține sesiuni. SHA-256 (nu argon2) e suficient pentru că
tokenul e aleator de 256 biți: nu poate fi ghicit prin brute-force, spre deosebire de o parolă. Revocarea = `revoked_at`.

**D7: Tokenurile platformelor sunt criptate cu `pgp_sym_encrypt` (pgcrypto), cheia vine din variabilă de mediu.**
Spre deosebire de parole, tokenurile trebuie citite înapoi (le trimitem la API-ul platformei), deci criptare reversibilă,
nu hash. Cheia NU e stocată în DB; aplicația o trimite ca parametru în query. Notă: Steam folosește o cheie API globală a
serverului + SteamID public, deci pentru Steam `access_token_enc` e NULL; coloana e pentru providerii care au token per
utilizator (PSN/Xbox reali; mock-ul salvează un token fals criptat ca demonstrație).

**D8: Raritatea e o coloană generată (`achievements.rarity GENERATED ALWAYS AS (...) STORED`).**
Pragurile (ultra_rare < 1%, very_rare < 5%, rare < 20%, common) sunt definite într-un singur loc, în DB, și nu pot ajunge
inconsistente cu `global_unlock_pct`. Fiind `STORED`, poate fi indexată și filtrată ieftin.

**D9: Prietenii: un singur rând per pereche, cu index unic pe `(LEAST(a,b), GREATEST(a,b))`.**
PK-ul `(requester_id, addressee_id)` singur ar permite și A→B și B→A. Indexul unic pe perechea neordonată blochează
duplicatul invers. `CHECK (requester_id <> addressee_id)` blochează prietenia cu sine. O cerere refuzată se șterge.

**D10: Indecșii secundari se adaugă abia în etapa 7.**
Migrațiile din etapa 1 creează doar indecșii impliciți din PRIMARY KEY / UNIQUE (necesari pentru corectitudine). Indecșii de
performanță (FK-uri, clasamente, căutări) vin în etapa 7, fiecare cu EXPLAIN ANALYZE înainte/după, ca să avem o măsurătoare
reală „fără index” și nu doar o afirmație.

**D11: CHECK-uri de consistență între coloane, nu doar pe valori.**
Exemple: `reports`: `(status = 'open') = (resolved_at IS NULL)`; `friendships`: `(status = 'pending') = (responded_at IS NULL)`;
`sync_runs`: un job `failed` trebuie să aibă `error_message`. Astfel starea invalidă nu poate fi scrisă nici de un bug în API.

**D12: `user_achievements.unlocked_at >= '2000-01-01'`.**
Steam întoarce `unlocktime = 0` (1970-01-01) pentru achievement-uri neobținute; CHECK-ul prinde bug-ul în care am salva
un achievement nedeblocat ca fiind deblocat.

**D13: Evidența migrațiilor în tabelul `schema_migrations (filename PK, applied_at)`.**
Runner-ul (etapa 2) aplică doar fișierele din `db/migrations` care nu apar în tabel, fiecare într-o tranzacție.
Prima aplicare pe Supabase s-a făcut manual din SQL Editor (conectorul AI era pe alt cont), cu un fișier generat care
marchează 001–006 ca aplicate: astfel aplicarea manuală și cea automată rămân compatibile.

---

## Etapa 2: Docker Compose + fixtures

**D14: Fixtures generate în SQL (`generate_series` + `random()`), nu din Node.**
Datele se generează direct pe serverul Postgres, deci nu trimitem ~650.000 de rânduri prin rețea până la Supabase (din Node,
cu INSERT-uri în loturi, ar dura minute). Fișierul `db/fixtures/seed.sql` e SQL pur, ușor de citit și de explicat secțiune
cu secțiune. `setseed(0.42)` face datele reproductibile, deci EXPLAIN-urile din etapa 7 și load test-ul din etapa 9 rulează
mereu pe aceleași date. Realismul vine din probabilități: un achievement e deblocat cu probabilitatea `global_unlock_pct`,
deci raritatea afișată corespunde datelor (verificat în `docs/fixtures.md`).
Un singur hash argon2 pentru toți userii de test: argon2 e lent intenționat, 5.000 de hash-uri ar dura minute.

**D15: TLS spre Supabase cu `rejectUnauthorized: false`.**
Conexiunea e criptată, dar certificatul nu e validat, pentru că e semnat de CA-ul propriu Supabase, nu de un CA public.
Varianta strictă (de făcut în producție): descărcăm certificatul CA din dashboard și îl dăm lui `pg` (`ssl: { ca }`).
Am ales simplitatea pentru proiect; riscul rămas e un atac man-in-the-middle între server și Supabase.

**D16: Migrațiile și fixtures rulează la pornirea API-ului (`main.ts`: migrate → seed → listen).**
Așa `docker compose up` e singura comandă necesară, cum cere brief-ul. Funcționează pentru că avem o singură instanță de API;
cu mai multe instanțe am muta migrațiile într-un pas separat (sau am folosi un advisory lock).

**D17: Tipurile Kysely scrise de mână (`api/src/db/types.ts`), nu generate (kysely-codegen).**
Un fișier citibil care oglindește migrațiile, fără încă un tool în proiect. Dezavantaj: trebuie actualizat manual la fiecare
migrație nouă.

**D18: `bigint` și `numeric` convertite în `number` în TypeScript.**
`pg` le întoarce implicit ca string (ca să nu piardă precizie peste 2^53). Id-urile și count-urile noastre nu se apropie de
2^53, iar `numeric(5,2)` e un procent, deci conversia e sigură și codul rămâne simplu.

**D19: Imagine Docker multi-stage, scripturile de instalare npm dezactivate (`allowScripts: false`).**
Prima etapă compilează TypeScript; imaginea finală conține doar dependențele de producție și JS-ul compilat. `argon2` vine cu
binare precompilate, deci nu are nevoie de scriptul de instalare (care ar cere compilator C++ în imagine).

---

## Reorganizarea etapelor

**D20: Etapele urmează slide-ul de evaluare: Tema → Modelare → CRUD → Autentificare → Performanță → Rapoarte → Susținere.**
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

## Etapa 2: CRUD

**D21: Constrângerile rămân în baza de date; API-ul doar traduce erorile Postgres în coduri HTTP.**
Nu verificăm în TypeScript unicitatea sau valorile permise înainte de INSERT: ar fi cod duplicat și ar avea race
conditions (două cereri simultane trec amândouă verificarea). Baza e sursa de adevăr; `errors.ts` mapează SQLSTATE
(`23505` unique, `23503` foreign key, `23001` restrict, `23514` check, `23502` not null) în 409/400 și trimite numele
constrângerii, deci clientul vede exact regula încălcată. Schema JSON a fiecărei rute validează doar forma cererii
(tipuri, câmpuri obligatorii, enum-uri).

**D22: CRUD-ul e întâi deschis, autentificarea se adaugă peste el în etapa 3.**
Urmează ordinea verificărilor (D20) și face vizibilă diferența „înainte / după” la prezentarea etapei 3.

**D23: Câte un fișier de rute per entitate, fără un generator CRUD generic.**
Un „CRUD factory” ar scurta codul, dar fiecare rută ar deveni mai greu de explicat și de modificat individual
(ex. rezolvarea raportărilor are o tranzacție, prieteniile au cheie compusă). Repetiția e intenționată și citibilă.

**D24: Valorile `undefined` în `.set({...})` pentru câmpuri opționale.**
Kysely ignoră cheile `undefined`, deci un PATCH modifică doar coloanele trimise, fără construcții condiționale.

**D25: Testele de integrare rulează pe PGlite (Postgres compilat în WebAssembly), nu pe Supabase.**
Aceleași migrații și aceleași constrângeri ca în producție, dar într-o bază în memorie creată la fiecare rulare:
testele nu ating datele reale și nu au nevoie de Docker. Testele au prins o eroare reală: `ON DELETE RESTRICT`
întoarce SQLSTATE `23001`, nu `23503`, deci ștergerea unei platforme folosite dădea 500 în loc de 409.

**D26: Rutele agregate pentru pagini (`views.ts`) sunt scrise ca SQL direct, nu cu query builder-ul.**
Clasamentul, profilul și biblioteca au JOIN-uri, GROUP BY, funcții fereastră (`rank() OVER`) și subquery-uri corelate.
În SQL direct se citesc exact ca în EXPLAIN ANALYZE din etapa 4, iar parametrii rămân legați (`${valoare}` din șablonul
`sql` devine `$1`, `$2`…, deci nu există risc de SQL injection). Filtrele opționale sunt fragmente `sql` adăugate doar
când sunt cerute, în loc de `($1 IS NULL OR ...)`, care ar împiedica planner-ul să folosească indecși.
Clasamentul global durează ~3 s pe Supabase (agregare peste ~650.000 de rânduri): punct de plecare pentru etapa 4.

**D27: Frontend: React Router + TanStack Query, fără state manager global.**
Datele vin din server, deci starea lor e cache-ul TanStack Query; după fiecare modificare invalidăm cheile afectate
și listele se reîncarcă singure. Starea locală (filtre, formulare) e `useState` în pagina respectivă.

**D28: Mobile-first cu Tailwind: tab-uri jos pe telefon, sidebar de la 768px în sus.**
Aceeași aplicație va rula în Tauri pe telefon și desktop (etapa 3c). Bara de tab-uri respectă zona de gesturi
(`env(safe-area-inset-bottom)`), iar butoanele au minim 40px înălțime pentru atingere.

**D29: Selector temporar „Acționezi ca” în loc de login, până la etapa 3.**
Paginile au nevoie de un user curent (profilul meu, prietenii mei). Până la autentificare îl alegem manual (implicit
userul `demo`); în etapa 3 id-ul va veni din token, iar selectorul dispare.

**D30: În dezvoltare, Vite face proxy pentru `/api`; în Docker, nginx face același lucru.**
Browserul vede o singură origine, deci nu e nevoie de CORS. Aplicația Tauri (etapa 3c) va folosi `VITE_API_URL`.

## Etapa 3: Autentificare și roluri

**D31: JWT de acces (15 min, HS256) scris direct cu `node:crypto`, fără bibliotecă.**
Un JWT are trei părți `header.payload.semnătură`; semnătura e HMAC-SHA256 peste primele două cu `JWT_SECRET`.
Implementarea are ~20 de linii (`api/src/auth.ts`), deci se poate explica integral; compararea semnăturii folosește
`timingSafeEqual`. Tokenul conține doar `id`, `role`, `username` și `exp`, nu date sensibile (payload-ul nu e criptat).

**D32: Refresh token opac (32 de octeți aleatori), în DB doar `sha256(token)`, cu rotație și detectarea refolosirii.**
La fiecare `/auth/refresh` tokenul vechi primește `revoked_at` și se emite unul nou. Dacă cineva prezintă un token
deja revocat, înseamnă că a fost copiat → revocăm toate sesiunile userului. Hash-ul (nu tokenul) e în DB: o scurgere
a bazei nu dă acces la sesiuni. sha256 e suficient aici (nu argon2), pentru că tokenul e aleator, nu o parolă ghicibilă.

**D33: Pe web, tokenul de acces stă doar în memorie, refresh token-ul în `localStorage`.**
Compromis acceptat pentru proiect: un atac XSS ar putea citi refresh token-ul (o alternativă ar fi cookie `httpOnly`,
care cere protecție CSRF). În aplicația Tauri locul lui e Keychain / Keystore (D20 din brief). La 401 clientul face un
singur refresh pentru toate cererile simultane și repetă cererea.

**D34: Rolurile sunt ierarhice (`user` < `moderator` < `admin`) și se verifică în API, nu în interfață.**
Hook-ul `authenticate` protejează tot `/api` în afară de `/auth/*` (encapsulare Fastify). Regulile stau lângă rute:
catalogul (platforme, jocuri, achievement-uri): scriere doar admin; progresul și conturile: doar proprietarul;
raportări: oricine creează, moderatorul vede și rezolvă, adminul șterge; suspendare / ascundere: moderator;
schimbarea rolului: doar admin. Interfața ascunde butoanele nepermise doar pentru confort.

**D35: Un user suspendat pierde toate sesiunile; rolul se recitește din DB la fiecare refresh.**
Tokenul de acces nu se verifică în DB la fiecare cerere (ar costa o interogare), deci o schimbare de rol sau o
suspendare se aplică în cel mult 15 minute. La suspendare revocăm imediat refresh token-urile.

## Etapa 3b: Sincronizare

**D36: `AchievementProvider` cu două implementări: `SteamProvider` (Steam Web API real) și `MockProvider`.**
Mock-ul alege jocuri reale din catalogul platformei și „deblochează” achievement-uri cu probabilitatea dată de procentul
lor global, determinist (seed = id-ul extern al contului), deci un al doilea sync nu schimbă nimic. Steam: doar jocurile
jucate, cel mult 60 per sync (limita de cereri Steam); profilul trebuie să aibă „Game details” public.

**D37: Coada de sync în pg-boss, în același Postgres; worker separat.**
API-ul doar inserează rândul în `sync_runs` și trimite jobul; worker-ul îl execută. Un sync Steam poate dura zeci de
secunde: nu trebuie să țină ocupată o cerere HTTP. pg-boss folosește `SELECT … FOR UPDATE SKIP LOCKED`, deci mai mulți
workeri pot rula în paralel fără să ia același job. Scrierea rezultatelor e o singură tranzacție cu UPSERT
(`ON CONFLICT DO UPDATE` pentru catalog, `DO NOTHING` pentru deblocări: data primei deblocări nu se schimbă).

**D38: Login Steam prin OpenID 2.0, verificat de Steam (`check_authentication`), tokenurile în fragmentul URL.**
Steam confirmă doar SteamID-ul; la prima autentificare se creează un user fără email/parolă, cu contul Steam legat.
Destinațiile după login sunt fixe (web sau deep-link Tauri), deci nu există „open redirect”. Fragmentul (`#…`) nu e
trimis la niciun server și e șters imediat din bara de adrese.

## Etapa 5: Rapoarte

**D39: CSV generat de Postgres cu `COPY (SELECT …) TO STDOUT`, trimis ca stream.**
Postgres produce direct CSV-ul (ghilimele, escape) și serverul nu ține fișierul în memorie. `COPY` nu acceptă parametri,
deci id-ul e interpolat: sigur doar pentru că schema rutei garantează un întreg.

**D40: Excel cu exceljs: două foi, coloana „Progres” ca formulă Excel.**
Formula (`=E2/F2`) rămâne corectă dacă cineva modifică datele în Excel; antet înghețat și filtru automat.

**D41: PDF cu pdfkit și fontul DejaVu Sans (pachet npm).**
Fontul implicit al PDF-ului (Helvetica) nu are ă, ș, ț. Raportul de ansamblu e doar pentru moderatori și admini.

## Etapa 4: Performanță

**D43: Indecși doar unde o interogare reală îi folosește, măsurați cu EXPLAIN ANALYZE în tranzacții cu ROLLBACK.**
Trei indecși (007): cheia străină `user_achievements.achievement_id`, `friendships.addressee_id`,
`sync_runs (platform_account_id, created_at DESC)`. Tabelele mici (`games`, `reports`) rămân fără index suplimentar.
Detalii și cifre: `docs/indexes.md`.

**D44: Clasamentul citește dintr-un materialized view reîmprospătat de worker.**
Agregarea peste toate deblocările nu poate fi accelerată cu indecși. Acceptăm întârziere de câteva minute
(refresh după fiecare sync + la 5 minute) pentru ~20× mai puțin timp per cerere: clasamentul e cea mai frecventă cerere.

## Interfață

**D42: Stil „Liquid Glass”: suprafețe translucide cu `backdrop-filter`, implementate ca utilitare Tailwind.**
`glass`, `glass-bar`, `glass-pill`, `glass-field`, `glass-tint` (în `web/src/index.css`): blur + saturație pe fundalul
din spate, margine luminoasă și reflex în colț; fundalul are pete de culoare animate („aurora”). Tab-ul activ e marcat
de o bulă care alunecă (transform + curbă „cu arc”). Animațiile se opresc la `prefers-reduced-motion`.

**D45: Implicit doar date reale: fixtures și platformele cu date generate sunt opționale.**
Aplicația urmează să fie folosită de jucători reali, deci un profil nu trebuie să conțină date inventate.
`SEED_ON_START` e acum `false` implicit; fixtures rămân disponibile pentru evaluare și load test (`SEED_ON_START=true` sau
`npm run db:seed`), fără să schimbe codul. PSN / Xbox / Epic n-au încă un provider real, deci legarea lor e oprită
(`ALLOW_MOCK_PLATFORMS=false`); interfața le arată „În curând”. Fără fixtures nu există admin: primul se numește cu
`npm run user:role -- <username> admin` (are nevoie de acces la server, deci nu poate fi folosit de un vizitator).

**D46: Personalizarea profilului: coloane în `users` + tabelul `profile_showcase`.**
Bio, accent, banner, joc preferat sunt atribute 1:1 ale userului → coloane în `users`. Accentul și bannerul sunt
alese dintr-o listă fixă (CHECK), nu culori / imagini libere: fiecare valoare are o temă testată în interfață și nu
există conținut încărcat de user de moderat. Vitrina e o relație 1:N cu ordine → tabel separat cu PK (`user_id`, `position`),
`position` 1–3 (CHECK limitează la 3), UNIQUE ca același achievement să nu apară de două ori. Regula „doar achievement-uri
deblocate” cere un join prin `platform_accounts`, deci e verificată în API (o alternativă ar fi un trigger).
`avatar_url` primește CHECK `^https://`, ca un link `javascript:` sau nesecurizat să nu ajungă în `<img>`.

**D47: Contul Steam se leagă doar prin login Steam (OpenID), cu un „state” semnat.**
Legarea manuală (SteamID scris de mână) ar permite oricui să-și atribuie profilul Steam al altcuiva, iar userii puneau
link-ul profilului în loc de SteamID64. Acum `POST /auth/steam/link` dă un token „state” (JWT HS256, `purpose: steam-link`,
10 minute) cu id-ul userului logat; browserul pleacă la Steam fără header-ul Authorization, iar la întoarcere
API-ul află din state cui îi leagă SteamID-ul confirmat de Steam. Tokenul are `purpose`, deci `verifyAccessToken`
îl respinge: nu poate fi folosit ca token de acces. După legare (și la primul login Steam) se pornește automat un sync.
Sync-ul Steam ia acum până la 250 de jocuri deținute (și cele neîncepute), câte 6 în paralel.

**D48: Prezentarea de pe telefon: frontend pe GitHub Pages, API prin tunel Cloudflare de pe laptop.**
GitHub Pages găzduiește doar fișiere statice, deci acolo stă doar `web/` (workflow `.github/workflows/pages.yml`,
`--base=/achievement-hub/`, `404.html` = `index.html` ca rutele React să meargă la reîncărcare). API-ul, worker-ul și baza
rămân pe laptop; `scripts/present.mjs` pornește un „quick tunnel” Cloudflare (gratuit, fără cont) care dă o adresă https
publică, o pune în variabila de repo `API_URL` și republică frontend-ul. Alternativa (Render + Supabase) ar fi mers și cu
laptopul închis, dar cere un cont nou și are pornire la rece de ~30 s. Fiind pe alt domeniu, API-ul acceptă acum CORS,
doar de la originea din `WEB_URL` și de la Vite local. Pages gratuit cere repo public: `.env` (cheile) nu e în repo.

**D49: Stilul „Sunset Glass”: liquid glass peste o scenă de apus tropical, font Roboto bold (înlocuiește D42).**
Autorul a cerut o interfață mai lucrată: liquid glass complet, Roboto bold, atmosferă de apus pe coasta unui stat
tropical fictiv (inspirație de atmosferă, fără nume, logo sau artă din vreun joc existent). Petele animate din D42 au fost
înlocuite cu o scenă desenată (`<Scene>` în `Layout.tsx`): cer în degrade (CSS), soare cu benzi (mask), reflexia lui pe apă
și palmieri (SVG). Sticla are nevoie de un fundal colorat ca blur-ul să aibă ce prelua. Tokenurile de culoare sunt semantice
(`surface`, `line`, `fg`, `muted`, `gold`, `rarity-*`) în `index.css`, deci paginile nu conțin culori brute.
Accentul e apusul (roz → portocaliu, butonul principal); auriul e rezervat trofeelor (locul 1, ultra rar, 100%); raritatea
se arată cu punct colorat + text (nu doar culoare). Fonturile sunt incluse în aplicație (fontsource), ca să meargă offline în Tauri.
Detaliu tehnic: un strămoș cu `transform` rămas după o animație (fill-mode `both`) oprește `backdrop-filter` în Chrome, deci
animația de intrare (`rise`) folosește `backwards` și se aplică doar titlului paginii, nu lui `<main>`.

**D50: Găzduire gratuită: API + worker pe Render (un singur serviciu), baza pe Supabase, ping la 10 minute.**
Aplicația trebuie să meargă fără laptop (prezentarea la convenție, aplicațiile instalate). Render are un plan gratuit
pentru un serviciu web din Docker, dar nu și pentru un worker separat, deci joburile pg-boss rulează în procesul API-ului
când `RUN_WORKER_IN_API=true` (logica mutată în `api/src/sync/jobs.ts`, folosită și de `worker.ts`, deci Docker Compose
rămâne la fel). Serviciul gratuit adoarme după 15 minute, iar Supabase gratuit se oprește după 7 zile fără activitate;
workflow-ul `keepalive.yml` cheamă `/health` (care face o interogare în DB) la 10 minute și le ține pe amândouă pornite.
Alternative: Fly.io / Railway (mereu pornite, dar cer card), laptopul cu tunel (D48, depinde de laptop). D48 rămâne
pentru dezvoltare.

**D51: Shell Tauri 2 (`app/`) peste aceeași interfață; tokenul în Keychain; login Steam prin deep-link.**
Aplicația nu are logică proprie: încarcă build-ul din `web/` (modul `app`, cu adresa API-ului din `web/.env.app`).
Codul nativ (`app/src-tauri/src/lib.rs`) face doar ce browserul nu poate: păstrează refresh token-ul în stocarea sigură a
sistemului (crate-ul `keyring`: Keychain pe macOS / iOS, Credential Manager pe Windows), primește deep-link-ul
`achievementhub://auth/callback` (plugin-ul deep-link, plus single-instance pe desktop) și deschide login-ul Steam în
browserul sistemului (plugin-ul opener: Steam nu permite login în ferestre încorporate). Toate diferențele site / aplicație
sunt în `web/src/native.ts`, iar pachetele Tauri se încarcă dinamic, deci site-ul nu le descarcă. Windows se construiește
pe GitHub Actions (nu se poate de pe Mac); iOS pe telefon cere semnare Apple (vezi `docs/build.md`).
Logo-ul (trofeu cu coroana în spate, pe apus) e desenat ca SVG în `app/icon/logo.svg`; iconițele sunt generate cu `tauri icon`.

**D52: Interfața și mesajele API-ului sunt în engleză; codul, comentariile și documentația rămân în română.**
Aplicația se prezintă la o convenție, cu public internațional. Tot ce vede utilizatorul e în engleză: textele din `web/`,
formatarea datelor și numerelor (`en-US`), mesajele de eroare ale API-ului (inclusiv traducerea erorilor Postgres din
`errors.ts`), antetele CSV, foile Excel și raportul PDF. Comentariile, documentația din `/docs` și jurnalele rămân în
română, pentru susținerea proiectului. Excepție: erorile pentru programator (ex. `useAuth` folosit în afara provider-ului).

**D53: Logo final și tema „Leonida” în Settings.** Logo-ul (cupă cu coroană în spate, pe apus) e imaginea finală a autorului;
din ea se generează favicon-ul, iconița web și iconițele aplicațiilor (`tauri icon`; colțuri rotunjite pe desktop, pătrat pe iOS,
unde sistemul rotunjește singur). Tema e o preferință locală (`localStorage`), nu un câmp în baza de date: nu ține de cont și
nu trebuie sincronizată. O singură temă acum; lista din `theme.ts` permite adăugarea altora.

**D54: PSN / Xbox / Epic se pot lega din nou, cu date demo (revine parțial asupra D45).**
Platformele n-au API public pentru achievement-uri (Epic deloc, Xbox și PSN doar cu înregistrare de dezvoltator / API
neoficial), dar aplicația trebuie prezentată cu toate cele 4 platforme. `ALLOW_MOCK_PLATFORMS=true` (în `.env` și `render.yaml`)
le activează prin `MockProvider`; butonul spune „Link (demo)”, deci utilizatorul știe că datele sunt generate. După legare
pornește singur primul sync, ca la Steam. Un provider real se adaugă ulterior fără schimbări în UI sau în schemă.

**D55: PSN și Xbox cu date reale; Epic rămâne demo.**
- Xbox: API-ul oficial Xbox Live. Userul se loghează cu contul Microsoft (OAuth, aplicație Azure: `XBOX_CLIENT_ID` /
  `XBOX_CLIENT_SECRET`, redirect `<PUBLIC_API_URL>/api/auth/xbox/callback`), deci dovedește că e contul lui, ca la Steam.
  Se păstrează criptat (pgcrypto, D7) doar refresh token-ul Microsoft, reînnoit la fiecare sync.
- PSN: Sony nu are API public și nici login pentru aplicații terțe. Biblioteca `psn-api` folosește serviciile aplicației
  PlayStation cu tokenul NPSSO al autorului (`PSN_NPSSO`); contul se leagă după Online ID și trebuie să aibă trofeele
  publice. Limită asumată: nu se poate dovedi că Online ID-ul e al userului; UNIQUE (platform_id, external_id) împiedică
  legarea aceluiași cont la doi useri. Tokenul NPSSO expiră după ~2 luni și trebuie reînnoit.
- Migrația 010 marchează `psn` și `xbox` ca `is_mock = false`; `getProvider` alege `PsnProvider` / `XboxProvider`.
- Epic: niciun API public pentru achievement-uri (Epic Online Services e doar pentru propriul joc al dezvoltatorului),
  deci rămâne pe `MockProvider` (D54).

**D56: Avatarul profilului se alege dintre conturile legate sau e propriu.**
Fiecare cont de platformă are acum `avatar_url` (migrația 011, CHECK https), completat la legare și actualizat la fiecare
sync prin metoda opțională `fetchAvatar` a providerului (Steam: persona, PSN: profilul după Online ID, Xbox: GameDisplayPicRaw).
La editarea profilului userul alege unul dintre ele, un link propriu („Custom”) sau inițialele. Se salvează doar adresa
aleasă în `users.avatar_url`, deci restul aplicației (clasamente, prieteni) nu se schimbă.

**D57: Xbox se leagă după gamertag, ca PSN (înlocuiește login-ul Microsoft din D55).**
Login-ul Microsoft cerea o aplicație înregistrată în Azure, iar contul personal al autorului nu are un director Azure.
Acum serverul se autentifică o singură dată cu contul Xbox al autorului (clientul public al aplicației Xbox, fără secret;
`npm run xbox:token` scrie `XBOX_REFRESH_TOKEN` în `.env`) și citește achievement-urile publice ale oricărui gamertag.
PSN și Xbox folosesc aceleași rute (`/auth/:platform/search`, `/auth/:platform/link`) și aceeași căutare cu avatar în
profil. Aceeași limită ca la PSN: nu se dovedește că gamertag-ul e al userului; profilul trebuie să fie public.

**D58: Temele Dark și Light (alb-negru), lângă Leonida.**
Aceleași componente, alte valori pentru tokenurile din `index.css` (`:root[data-theme="dark|light"]`): în locul apusului,
forme mari estompate în tonuri de gri care plutesc încet; sticla rămâne (blur, reflex sus), doar fără culoare; butonul
principal e alb pe negru / negru pe alb. Culorile de raritate rămân,
pentru că poartă sens. Câmpurile și cutia de eroare au acum tokenuri proprii (`--color-field`, `--color-error-*`),
ca să arate bine pe fundal deschis. Tema rămâne o preferință a dispozitivului (localStorage), ca în D53.

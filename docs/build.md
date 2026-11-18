# Build și găzduire: site, aplicații, server

Achievement Hub are trei părți care rulează în locuri diferite:

| Parte | Unde rulează | Cum ajunge acolo |
|---|---|---|
| Baza de date (PostgreSQL) | Supabase (D1) | migrațiile se aplică singure la pornirea API-ului |
| API + worker (Node, Fastify, pg-boss) | Render, plan gratuit (D50) | `render.yaml`, construit din `api/Dockerfile` |
| Site (React) | GitHub Pages | workflow `.github/workflows/pages.yml` la fiecare push pe `main` |
| Aplicații (Tauri 2) | Windows, macOS, iOS (D51) | workflow `.github/workflows/app.yml` sau local |

Aplicația e doar un client: aceeași interfață din `web/`, ambalată într-o fereastră nativă. Datele vin din API-ul de pe Render,
la adresa din `web/.env.app`.

## 1. Baza de date mereu pornită (Supabase)

1. În Supabase: proiectul → **Connect** → **Session pooler** → copiază adresa (`postgresql://postgres.<ref>:<parola>@aws-...pooler.supabase.com:5432/postgres`).
2. Pune-o în `.env` la `DATABASE_URL` și setează `DATABASE_SSL=true`.
3. `npm run dev --prefix api`: la pornire API-ul aplică migrațiile 001–009 (cele deja aplicate sunt sărite).

Pe planul gratuit, Supabase pune proiectul pe pauză după 7 zile fără nicio cerere. Workflow-ul `keepalive.yml` cheamă
`/health` la 10 minute, iar `/health` face o interogare în bază, deci proiectul rămâne activ.

## 2. Serverul API pe Render (gratuit)

1. Cont pe [render.com](https://render.com) (cu contul GitHub).
2. **New → Blueprint** → repo-ul `achievement-hub` → Render citește `render.yaml`.
3. Completează variabilele marcate „sync: false”: `DATABASE_URL` (de la pasul 1), `TOKEN_ENCRYPTION_KEY`
   (aceeași ca în `.env`, altfel tokenurile deja criptate nu se mai pot citi), `STEAM_API_KEY`.
4. După deploy: `https://achievement-hub-api.onrender.com/health` trebuie să răspundă `{"status":"ok"}`.

Planul gratuit are un singur serviciu, deci worker-ul rulează în procesul API-ului (`RUN_WORKER_IN_API=true`).
Serviciul adoarme după 15 minute fără cereri; ping-ul din `keepalive.yml` îl ține treaz. Înainte de o prezentare,
deschide o dată `/health` ca să fii sigur că a pornit (prima cerere după somn durează ~30 s).

## 3. Aplicațiile (Tauri 2, folderul `app/`)

Cerințe locale: Node 24, Rust (stable), Xcode pentru macOS / iOS.

```bash
cd app && npm install
npm run dev                                    # fereastra desktop, cu interfața din Vite (hot reload)
npm run build                                  # macOS: .app + .dmg în src-tauri/target/release/bundle/
npx tauri ios build --target aarch64-sim       # iOS, pentru simulator
```

`tauri build` construiește întâi interfața cu `npm run build:app --prefix ../web` (modul `app`, adresa API-ului din `web/.env.app`).

**Windows** nu se poate construi de pe Mac: îl construiește GitHub Actions (`app.yml`, runner `windows-latest`).
Pornești workflow-ul din tab-ul Actions („Run workflow”) sau cu un tag: `git tag v1.0.0 && git push --tags`.
La un tag, installerele (.exe, .msi, .dmg) apar într-un GitHub Release.

**iOS pe telefon:** un .ipa instalabil cere semnare Apple. Variante:
- cont Apple gratuit: deschizi `app/src-tauri/gen/apple/achievement-hub.xcodeproj` în Xcode, alegi echipa ta la
  „Signing & Capabilities”, conectezi iPhone-ul și apeși Run (aplicația merge 7 zile);
- cont Apple Developer (99$/an): TestFlight sau distribuire ad-hoc.
CI-ul construiește varianta pentru simulator (fără semnare), ca dovadă că se compilează.

**macOS** nesemnat: la prima deschidere, clic dreapta pe aplicație → Open (Gatekeeper avertizează că dezvoltatorul nu e
verificat). Semnarea și notarizarea cer tot un cont Apple Developer.

## Ce face shell-ul Tauri (`app/src-tauri/src/lib.rs`)

- **Stocarea sigură a sesiunii:** refresh token-ul stă în Keychain (macOS, iOS) / Credential Manager (Windows), prin
  comenzile `secure_get` / `secure_set` / `secure_delete` (crate-ul `keyring`). Pe site rămâne în `localStorage`.
  Tokenul de acces (15 minute) stă doar în memorie, ca pe site. Diferențele sunt toate în `web/src/native.ts`.
- **Login Steam:** se deschide în browserul sistemului (`/auth/steam?client=app`); după login, API-ul trimite la
  `achievementhub://auth/callback#tokenuri`, sistemul deschide aplicația, iar pagina `/auth/callback` preia tokenurile.
- **CORS:** API-ul acceptă și originile Tauri (`tauri://localhost`, `http://tauri.localhost`).

## Verificat

- macOS: `npm run build` → `Achievement Hub.app` pornește, schema `achievementhub://` e înregistrată în `Info.plist`.
- iOS: build pentru simulator, rulat pe iPhone 18 Pro (simulator): pagina de login se afișează corect.
- Windows și build-ul iOS din CI: se verifică la prima rulare a workflow-ului `app.yml`.

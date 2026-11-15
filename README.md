# Achievement Hub

Profil unificat de achievement-uri pentru Steam, PlayStation, Xbox și Epic. Proiect pentru „Baze de date avansate”.

## Pornire

1. Copiază `.env.example` în `.env` și completează `DATABASE_URL` (Supabase → **Connect** → **Session pooler**),
   `TOKEN_ENCRYPTION_KEY` și `JWT_SECRET` (opțional `STEAM_API_KEY` pentru sync-ul Steam real).
2. `docker compose up --build` — pornește `api`, `worker` (sync + reîmprospătarea clasamentului) și `web`.

La pornire API-ul aplică migrațiile lipsă din `db/migrations`, apoi ascultă pe http://localhost:3000.
Interfața: http://localhost:8080. Verificare rapidă: http://localhost:3000/health.

**Doar date reale (implicit, D45):** baza pornește goală; îți faci cont, apeși **Conectează Steam** pe profil și jocurile
se importă automat (cere `STEAM_API_KEY` și profil Steam cu „Detalii joc” pe Public). Primul admin:
`npm run user:role -- <username> admin` (în `api/`).

**Date de test (pentru evaluare / load test):** `SEED_ON_START=true` sau `npm run db:seed` generează fixtures
([docs/fixtures.md](docs/fixtures.md)): `admin@`, `moderator@`, `demo@achievementhub.test`, parola `Parola123!`.
`ALLOW_MOCK_PLATFORMS=true` permite și legarea conturilor PSN / Xbox / Epic cu date generate.

### Fără Docker

Trei terminale:

```bash
cd api
npm ci
npm run dev
```

```bash
cd api
npm run dev:worker
```

```bash
cd web
npm ci
npm run dev
```

Interfața: http://localhost:5173 (Vite trimite cererile `/api` către API-ul de pe portul 3000).

Comenzi utile (în `api/`): `npm test`, `npm run db:migrate`, `npm run db:seed`, `npm run db:explain` (EXPLAIN ANALYZE
înainte/după pentru indecși), `npm run typecheck`. Load test: `k6 run loadtest/api.js` ([docs/loadtest.md](docs/loadtest.md)).

## Structură

| Folder | Conținut |
|---|---|
| `db/migrations/` | migrațiile SQL numerotate |
| `db/fixtures/` | generarea datelor de test (SQL) |
| `api/` | backend TypeScript + Fastify + Kysely |
| `web/` | frontend React + Vite + TanStack Query + Tailwind |
| `loadtest/` | scriptul k6 |
| `docs/` | [prezentare](docs/prezentare.md), [schema](docs/schema.md), [fixtures](docs/fixtures.md), [API](docs/api.md), [pagini](docs/pagini.md), [indecși](docs/indexes.md), [load test](docs/loadtest.md) |

Decizii de design: [DECISIONS.md](DECISIONS.md). Jurnalul folosirii AI: [AI_LOG.md](AI_LOG.md).

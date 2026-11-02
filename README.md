# Achievement Hub

Profil unificat de achievement-uri pentru Steam, PlayStation, Xbox și Epic. Proiect pentru „Baze de date avansate”.

## Pornire

1. Copiază `.env.example` în `.env` și completează `DATABASE_URL` (Supabase → **Connect** → **Session pooler**)
   și `TOKEN_ENCRYPTION_KEY`.
2. `docker compose up --build`

La pornire API-ul aplică migrațiile lipsă din `db/migrations`, generează fixtures dacă baza e goală
(vezi [docs/fixtures.md](docs/fixtures.md)), apoi ascultă pe http://localhost:3000.
Interfața: http://localhost:8080. Verificare rapidă: http://localhost:3000/health și http://localhost:3000/stats (numărul de rânduri din fiecare tabel).

### Fără Docker

Două terminale:

```bash
cd api
npm ci
npm run dev
```

```bash
cd web
npm ci
npm run dev
```

Interfața: http://localhost:5173 (Vite trimite cererile `/api` către API-ul de pe portul 3000).

Comenzi utile (în `api/`): `npm test`, `npm run db:migrate`, `npm run db:seed`, `npm run typecheck`.

## Structură

| Folder | Conținut |
|---|---|
| `db/migrations/` | migrațiile SQL numerotate |
| `db/fixtures/` | generarea datelor de test (SQL) |
| `api/` | backend TypeScript + Fastify + Kysely |
| `web/` | frontend React + Vite + TanStack Query + Tailwind |
| `docs/` | [prezentare](docs/prezentare.md), [schema](docs/schema.md), [fixtures](docs/fixtures.md), [API](docs/api.md) |

Decizii de design: [DECISIONS.md](DECISIONS.md). Jurnalul folosirii AI: [AI_LOG.md](AI_LOG.md).

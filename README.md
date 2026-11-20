# 🏆 Achievement Hub

**One profile for all your gaming achievements.** Achievement Hub connects your Steam, PlayStation, Xbox and Epic accounts,
syncs your games and trophies into a single unified profile, and lets you compare progress, rarity and rankings with friends.

> Academic project for the *Advanced Databases* course. The focus is on a clean relational model, indexing,
> role-based access, and reports, built on PostgreSQL.

---

## ✨ Features

- **Unified profile**: all your games and achievements from every linked platform in one place.
- **Real Steam integration**: sign in with Steam (OpenID) and import your library through the Steam Web API.
- **PlayStation and Xbox**: real account sync by name.
- **Epic Games**: demo provider with realistic generated data.
- **Rarity scoring**: achievements are weighted by how rare they are (ultra rare, very rare, rare, common).
- **Leaderboards**: global or friends-only, filterable by platform, with pagination.
- **Friends**: send, accept and remove friend requests.
- **Reports**: export your data as **CSV**, **Excel** or **PDF**.
- **Roles**: `user`, `moderator` and `admin`, enforced on every API request.
- **Customizable profile**: avatar and display settings, with a "Sunset Glass" liquid-glass UI and light/dark themes.
- **Desktop and mobile apps**: a Tauri 2 shell for Windows, macOS, Linux, Android and iOS.

## 🧱 Tech stack

| Layer | Technology |
|---|---|
| Database | PostgreSQL (hosted on [Supabase](https://supabase.com)), `pgcrypto` for encrypting platform tokens |
| Backend | TypeScript, [Fastify](https://fastify.dev), [Kysely](https://kysely.dev) (visible SQL, no heavy ORM) |
| Background jobs | [pg-boss](https://github.com/timgit/pg-boss) (sync and leaderboard refresh) |
| Auth | argon2 password hashing, short-lived JWT access tokens, hashed refresh tokens stored in the database |
| Frontend | React, Vite, TanStack Query, Tailwind CSS |
| Desktop / mobile | Tauri 2 (tokens stored in the OS keychain / keystore) |
| Reports | exceljs (Excel), pdfkit (PDF), streamed CSV via `COPY` |
| Load testing | [k6](https://k6.io) |
| Deployment | Docker Compose, Render (API), GitHub Pages (web), GitHub Actions CI |

## 🗂️ Repository structure

| Folder | Contents |
|---|---|
| `db/migrations/` | Numbered SQL migrations (applied automatically on API start) |
| `db/fixtures/` | Test data generation (thousands of users, hundreds of thousands of achievements) |
| `api/` | Backend: Fastify API, pg-boss worker, CLI tools |
| `web/` | React frontend |
| `app/` | Tauri 2 shell for desktop and mobile |
| `loadtest/` | k6 load test script |
| `docs/` | Project documentation (see below) |

## 📚 Documentation

- [Project presentation](docs/prezentare.md) and [data model](docs/schema.md)
- [Pages of the app](docs/pagini.md) (with screenshots)
- [API reference](docs/api.md)
- [Indexes with `EXPLAIN ANALYZE` before and after](docs/indexes.md)
- [Load test results](docs/loadtest.md)
- [Test fixtures](docs/fixtures.md)
- [Build instructions](docs/build.md)
- [Design decisions](DECISIONS.md)

## 🚀 Getting started

### Prerequisites

- Docker and Docker Compose, or Node.js 20+ for running without Docker
- A PostgreSQL database (a free [Supabase](https://supabase.com) project works)

### 1. Configure the environment

```bash
cp .env.example .env
```

Fill in at least:

- `DATABASE_URL`: from Supabase → **Connect** → **Session pooler**
- `TOKEN_ENCRYPTION_KEY` and `JWT_SECRET`
- `STEAM_API_KEY` (optional, for real Steam sync)

### 2. Run with Docker

```bash
docker compose up --build
```

This starts the API, the sync worker and the web app.

- Web app: http://localhost:8080
- API: http://localhost:3000 (health check: `/health`)

The API applies any missing migrations on startup. The database starts empty; create an account and link Steam.
To create the first admin:

```bash
cd api
npm run user:role -- <username> admin
```

### 3. Run without Docker

Open three terminals:

```bash
cd api && npm ci && npm run dev          # API
cd api && npm run dev:worker             # background worker
cd web && npm ci && npm run dev          # web app on http://localhost:5173
```

### Test data

To generate fixtures for evaluation or load testing, set `SEED_ON_START=true` or run `npm run db:seed` (in `api/`).
See [docs/fixtures.md](docs/fixtures.md) for the accounts it creates.

### Useful commands (in `api/`)

| Command | Purpose |
|---|---|
| `npm test` | Run the test suite |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Generate test data |
| `npm run db:explain` | Run `EXPLAIN ANALYZE` for the indexes |
| `npm run typecheck` | Type-check the code |

Load test: `k6 run loadtest/api.js`.

## 👥 Roles

| Role | Can do |
|---|---|
| `user` | Manage own profile, link platform accounts, sync, add friends, export reports |
| `moderator` | Review reports, hide users from the leaderboard, suspend accounts, generate the PDF report |
| `admin` | Everything above, plus manage roles, games, platforms and delete records |

## 📄 License

Academic project. All rights reserved by the author unless a license file is added.

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { sql } from 'kysely';
import { config } from './config.js';
import { db } from './db/db.js';
import { authenticate, requireRole } from './auth.js';
import { errorHandler } from './errors.js';
import { authRoutes, meRoutes } from './routes/auth.js';
import { steamAuthRoutes, steamLinkRoutes } from './routes/steam-auth.js';
import { achievementsRoutes } from './routes/achievements.js';
import { exportsRoutes } from './routes/exports.js';
import { friendshipsRoutes } from './routes/friendships.js';
import { gamesRoutes } from './routes/games.js';
import { platformAccountsRoutes } from './routes/platform-accounts.js';
import { platformsRoutes } from './routes/platforms.js';
import { reportsRoutes } from './routes/reports.js';
import { syncRunsRoutes } from './routes/sync-runs.js';
import { userAchievementsRoutes } from './routes/user-achievements.js';
import { userGamesRoutes } from './routes/user-games.js';
import { usersRoutes } from './routes/users.js';
import { viewsRoutes } from './routes/views.js';

export function buildServer({ logger = true } = {}) {
  const app = Fastify({ logger });
  app.setErrorHandler(errorHandler);

  // Frontend-ul de pe GitHub Pages (WEB_URL) cheamă API-ul de pe alt domeniu, deci browserul cere CORS (D48).
  // Permitem doar originea frontend-ului, serverul Vite local și aplicațiile Tauri, nu orice site.
  // Tauri servește interfața de pe tauri://localhost (macOS, iOS) și http://tauri.localhost (Windows).
  app.register(cors, {
    origin: [new URL(config.webUrl).origin, 'http://localhost:5173', 'tauri://localhost', 'http://tauri.localhost'],
  });

  // Verifică și conexiunea la DB, nu doar că procesul rulează (folosit de healthcheck-ul din Docker Compose).
  app.get('/health', async () => {
    await sql`SELECT 1`.execute(db);
    return { status: 'ok' };
  });

  app.register(async (root) => {
    // Rute publice: login (email sau Steam), înregistrare, refresh, logout.
    await root.register(authRoutes);
    await root.register(steamAuthRoutes);

    // Tot restul cere token de acces. Hook-ul adăugat în acest context (encapsulare Fastify) se aplică
    // doar rutelor înregistrate aici, nu și celor publice de mai sus.
    // Regulile pe roluri / proprietar sunt în fiecare fișier de rute (vezi docs/api.md, secțiunea Roluri).
    await root.register(async (api) => {
      api.addHook('onRequest', authenticate);
      await api.register(meRoutes);
      await api.register(steamLinkRoutes);
      await api.register(usersRoutes);
      await api.register(platformsRoutes);
      await api.register(platformAccountsRoutes);
      await api.register(gamesRoutes);
      await api.register(achievementsRoutes);
      await api.register(userGamesRoutes);
      await api.register(userAchievementsRoutes);
      await api.register(syncRunsRoutes);
      await api.register(friendshipsRoutes);
      await api.register(reportsRoutes);
      // Rute de citire agregate pentru paginile aplicației (clasament, profil, bibliotecă).
      await api.register(viewsRoutes);
      // Rapoarte descărcabile: CSV, Excel, PDF.
      await api.register(exportsRoutes);

      // Câte rânduri are fiecare tabel: ca să vedem rapid că fixtures s-au încărcat.
      api.get('/stats', { preHandler: requireRole('admin') }, async () => {
        const { rows } = await sql<{ table_name: string; rows: number }>`
          SELECT 'users' AS table_name, count(*) AS rows FROM users
          UNION ALL SELECT 'platform_accounts', count(*) FROM platform_accounts
          UNION ALL SELECT 'games', count(*) FROM games
          UNION ALL SELECT 'achievements', count(*) FROM achievements
          UNION ALL SELECT 'user_games', count(*) FROM user_games
          UNION ALL SELECT 'user_achievements', count(*) FROM user_achievements
          UNION ALL SELECT 'friendships', count(*) FROM friendships
          UNION ALL SELECT 'reports', count(*) FROM reports
          UNION ALL SELECT 'sync_runs', count(*) FROM sync_runs
          UNION ALL SELECT 'profile_showcase', count(*) FROM profile_showcase
        `.execute(db);
        return Object.fromEntries(rows.map((row) => [row.table_name, row.rows]));
      });
    });
  }, { prefix: '/api' });

  return app;
}

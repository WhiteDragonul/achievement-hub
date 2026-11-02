import Fastify from 'fastify';
import { sql } from 'kysely';
import { db } from './db/db.js';
import { errorHandler } from './errors.js';
import { achievementsRoutes } from './routes/achievements.js';
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

  // Verifică și conexiunea la DB, nu doar că procesul rulează (folosit de healthcheck-ul din Docker Compose).
  app.get('/health', async () => {
    await sql`SELECT 1`.execute(db);
    return { status: 'ok' };
  });

  // Câte rânduri are fiecare tabel — ca să vedem rapid că fixtures s-au încărcat.
  // TODO etapa 3: accesibil doar pentru admin.
  app.get('/stats', async () => {
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
    `.execute(db);
    return Object.fromEntries(rows.map((row) => [row.table_name, row.rows]));
  });

  // CRUD pentru toate entitățile, sub prefixul /api. Deocamdată fără autentificare: se adaugă în etapa 3.
  // (refresh_tokens nu are CRUD aici: sesiunile se creează la login și se gestionează în etapa 3.)
  app.register(async (api) => {
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
  }, { prefix: '/api' });

  return app;
}

// Rute de citire pentru paginile aplicației: combină mai multe tabele într-un singur răspuns.
// Interogările sunt scrise ca SQL direct (nu cu query builder-ul), pentru că sunt agregări mai lungi
// și trebuie să se citească exact ca în EXPLAIN ANALYZE (etapa 4 — Performanță).
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { db } from '../db/db.js';
import { idParams, notFound, paginationProperties, type IdParams, type Pagination } from './common.js';

type ShowcaseItem = {
  id: number; name: string; description: string | null; icon_url: string | null; rarity: string;
  global_unlock_pct: number | null; game_id: number; game_title: string;
};

export async function viewsRoutes(app: FastifyInstance) {
  // Ultimele achievement-uri deblocate de un user (profil + alegerea vitrinei), cele mai rare primele la egalitate.
  app.get<{ Params: IdParams; Querystring: Pagination }>('/users/:id/achievements', {
    schema: { params: idParams, querystring: { type: 'object', properties: paginationProperties } },
  }, async (request) => {
    const { limit, offset } = request.query;
    const { rows } = await sql<ShowcaseItem & { unlocked_at: Date }>`
      SELECT a.id, a.name, a.description, a.icon_url, a.rarity, a.global_unlock_pct,
             g.id AS game_id, g.title AS game_title, ua.unlocked_at
      FROM platform_accounts pa
      JOIN user_achievements ua ON ua.platform_account_id = pa.id
      JOIN achievements a ON a.id = ua.achievement_id
      JOIN games g ON g.id = a.game_id
      WHERE pa.user_id = ${request.params.id}
      ORDER BY ua.unlocked_at DESC, a.global_unlock_pct ASC NULLS LAST
      LIMIT ${limit} OFFSET ${offset}
    `.execute(db);
    return rows;
  });

  // Clasament: global, pe o platformă, sau doar între prietenii unui user.
  // Citește scorurile precalculate din leaderboard_scores (un rând per user și platformă, migrația 008) în loc să
  // agrege toate deblocările la fiecare cerere. Scorul: ultra rar 50, foarte rar 20, rar 5, comun 1 punct.
  app.get<{ Querystring: Pagination & { platform_id?: number; friends_of?: number } }>('/leaderboard', {
    schema: {
      querystring: {
        type: 'object',
        properties: { ...paginationProperties, platform_id: { type: 'integer' }, friends_of: { type: 'integer' } },
      },
    },
  }, async (request) => {
    const { limit, offset, platform_id, friends_of } = request.query;

    // Filtrele opționale sunt adăugate în SQL doar dacă sunt cerute (sql`` gol altfel).
    const platformFilter = platform_id ? sql`AND s.platform_id = ${platform_id}` : sql``;
    const friendsFilter = friends_of
      ? sql`AND u.id IN (
              SELECT ${friends_of}::bigint
              UNION SELECT addressee_id FROM friendships WHERE requester_id = ${friends_of} AND status = 'accepted'
              UNION SELECT requester_id FROM friendships WHERE addressee_id = ${friends_of} AND status = 'accepted'
            )`
      : sql``;

    const { rows } = await sql<{
      rank: number; user_id: number; username: string; display_name: string | null;
      achievements: number; rare_achievements: number; score: number;
    }>`
      SELECT rank() OVER (ORDER BY sum(s.score) DESC) AS rank,
             u.id AS user_id,
             u.username,
             u.display_name,
             sum(s.achievements) AS achievements,
             sum(s.rare_achievements) AS rare_achievements,
             sum(s.score) AS score
      FROM leaderboard_scores s
      JOIN users u ON u.id = s.user_id
      WHERE NOT u.hidden_from_leaderboards
        AND NOT u.is_banned
        ${platformFilter}
        ${friendsFilter}
      GROUP BY u.id
      ORDER BY score DESC, u.id
      LIMIT ${limit} OFFSET ${offset}
    `.execute(db);
    return rows;
  });

  // Profilul unificat: userul, conturile lui cu totaluri și câte achievement-uri are din fiecare raritate.
  app.get<{ Params: IdParams }>('/users/:id/profile', { schema: { params: idParams } }, async (request, reply) => {
    const userId = request.params.id;

    const user = await db.selectFrom('users')
      .select([
        'id', 'username', 'display_name', 'avatar_url', 'bio', 'accent_color', 'banner', 'favorite_game_id',
        'role', 'is_banned', 'hidden_from_leaderboards', 'created_at',
      ])
      .where('id', '=', userId)
      .executeTakeFirst();
    if (!user) return reply.code(404).send(notFound('Utilizatorul'));

    const accounts = await sql<{
      id: number; platform_id: number; platform_code: string; platform_name: string; external_id: string;
      display_name: string; linked_at: Date; last_synced_at: Date | null; games: number; achievements: number;
    }>`
      SELECT pa.id, pa.platform_id, p.code AS platform_code, p.name AS platform_name,
             pa.external_id, pa.display_name, pa.linked_at, pa.last_synced_at,
             (SELECT count(*) FROM user_games ug WHERE ug.platform_account_id = pa.id) AS games,
             (SELECT count(*) FROM user_achievements ua WHERE ua.platform_account_id = pa.id) AS achievements
      FROM platform_accounts pa
      JOIN platforms p ON p.id = pa.platform_id
      WHERE pa.user_id = ${userId}
      ORDER BY p.id
    `.execute(db);

    const rarity = await sql<{ rarity: string; count: number }>`
      SELECT a.rarity, count(*) AS count
      FROM platform_accounts pa
      JOIN user_achievements ua ON ua.platform_account_id = pa.id
      JOIN achievements a ON a.id = ua.achievement_id
      WHERE pa.user_id = ${userId}
      GROUP BY a.rarity
    `.execute(db);

    // Totaluri pentru capul profilului: jocuri distincte, ore jucate, jocuri terminate 100%.
    const totals = await sql<{ games: number; playtime_minutes: number; perfect_games: number }>`
      SELECT count(DISTINCT ug.game_id) AS games,
             coalesce(sum(ug.playtime_minutes), 0) AS playtime_minutes,
             count(*) FILTER (WHERE g.total > 0 AND g.unlocked = g.total) AS perfect_games
      FROM platform_accounts pa
      JOIN user_games ug ON ug.platform_account_id = pa.id
      CROSS JOIN LATERAL (
        SELECT (SELECT count(*) FROM achievements a WHERE a.game_id = ug.game_id) AS total,
               (SELECT count(*) FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id
                WHERE ua.platform_account_id = pa.id AND a.game_id = ug.game_id) AS unlocked
      ) g
      WHERE pa.user_id = ${userId}
    `.execute(db);

    const favoriteGame = user.favorite_game_id
      ? await db.selectFrom('games').select(['id', 'title', 'icon_url']).where('id', '=', user.favorite_game_id).executeTakeFirst()
      : undefined;

    const showcase = await sql<ShowcaseItem>`
      SELECT a.id, a.name, a.description, a.icon_url, a.rarity, a.global_unlock_pct, g.id AS game_id, g.title AS game_title
      FROM profile_showcase ps
      JOIN achievements a ON a.id = ps.achievement_id
      JOIN games g ON g.id = a.game_id
      WHERE ps.user_id = ${userId}
      ORDER BY ps.position
    `.execute(db);

    return {
      user,
      accounts: accounts.rows,
      rarity_counts: Object.fromEntries(rarity.rows.map((row) => [row.rarity, row.count])),
      totals: totals.rows[0],
      favorite_game: favoriteGame ?? null,
      showcase: showcase.rows,
    };
  });

  // Biblioteca unificată: jocurile de pe toate conturile userului, cu progresul (deblocate / total) pe fiecare.
  app.get<{ Params: IdParams; Querystring: Pagination }>('/users/:id/games', {
    schema: { params: idParams, querystring: { type: 'object', properties: paginationProperties } },
  }, async (request) => {
    const { limit, offset } = request.query;
    const { rows } = await sql<{
      game_id: number; title: string; platform_code: string; platform_account_id: number;
      playtime_minutes: number; last_played_at: Date | null; total_achievements: number; unlocked_achievements: number;
    }>`
      SELECT g.id AS game_id, g.title, g.icon_url, p.code AS platform_code, ug.platform_account_id,
             ug.playtime_minutes, ug.last_played_at,
             (SELECT count(*) FROM achievements a WHERE a.game_id = g.id) AS total_achievements,
             (SELECT count(*)
                FROM user_achievements ua
                JOIN achievements a ON a.id = ua.achievement_id
               WHERE ua.platform_account_id = ug.platform_account_id AND a.game_id = g.id) AS unlocked_achievements
      FROM platform_accounts pa
      JOIN user_games ug ON ug.platform_account_id = pa.id
      JOIN games g ON g.id = ug.game_id
      JOIN platforms p ON p.id = g.platform_id
      WHERE pa.user_id = ${request.params.id}
      ORDER BY ug.last_played_at DESC NULLS LAST, g.id
      LIMIT ${limit} OFFSET ${offset}
    `.execute(db);
    return rows;
  });

  // Achievement-urile unui joc, cu data deblocării pentru un anumit user (NULL = nedeblocat).
  // Întoarce și contul userului pe platforma jocului, ca pagina să poată marca achievement-uri ca deblocate.
  app.get<{ Params: IdParams; Querystring: { user_id: number } }>('/games/:id/achievements', {
    schema: {
      params: idParams,
      querystring: { type: 'object', required: ['user_id'], properties: { user_id: { type: 'integer' } } },
    },
  }, async (request, reply) => {
    const gameId = request.params.id;
    const userId = request.query.user_id;

    const game = await db.selectFrom('games').select(['id', 'platform_id']).where('id', '=', gameId).executeTakeFirst();
    if (!game) return reply.code(404).send(notFound('Jocul'));

    const account = await db.selectFrom('platform_accounts')
      .select('id')
      .where('user_id', '=', userId)
      .where('platform_id', '=', game.platform_id)
      .executeTakeFirst();

    const ownsGame = account
      ? Boolean(await db.selectFrom('user_games').select('game_id')
          .where('platform_account_id', '=', account.id)
          .where('game_id', '=', gameId)
          .executeTakeFirst())
      : false;

    // LEFT JOIN: toate achievement-urile jocului apar, chiar dacă userul nu le-a deblocat.
    const { rows } = await sql<{
      id: number; name: string; description: string | null; is_hidden: boolean;
      global_unlock_pct: number | null; rarity: string | null; unlocked_at: Date | null;
    }>`
      SELECT a.id, a.name, a.description, a.is_hidden, a.global_unlock_pct, a.rarity, ua.unlocked_at
      FROM achievements a
      LEFT JOIN user_achievements ua
             ON ua.achievement_id = a.id AND ua.platform_account_id = ${account?.id ?? null}
      WHERE a.game_id = ${gameId}
      ORDER BY a.global_unlock_pct DESC NULLS LAST, a.id
    `.execute(db);

    return { platform_account_id: account?.id ?? null, owns_game: ownsGame, achievements: rows };
  });
}

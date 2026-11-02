import type { FastifyInstance } from 'fastify';
import { db } from '../db/db.js';
import { notFound, paginationProperties, type Pagination } from './common.js';

// Cheie primară compusă (platform_account_id, achievement_id).
const keyParams = {
  type: 'object',
  required: ['platformAccountId', 'achievementId'],
  properties: {
    platformAccountId: { type: 'integer', minimum: 1 },
    achievementId: { type: 'integer', minimum: 1 },
  },
} as const;
type KeyParams = { platformAccountId: number; achievementId: number };

export async function userAchievementsRoutes(app: FastifyInstance) {
  // Achievement-urile deblocate de un cont, cele mai recente primele, cu numele, raritatea și jocul.
  app.get<{ Querystring: Pagination & { platform_account_id: number; game_id?: number } }>('/user-achievements', {
    schema: {
      querystring: {
        type: 'object',
        required: ['platform_account_id'],
        properties: { ...paginationProperties, platform_account_id: { type: 'integer' }, game_id: { type: 'integer' } },
      },
    },
  }, async (request) => {
    const { limit, offset, platform_account_id, game_id } = request.query;
    let query = db.selectFrom('user_achievements')
      .innerJoin('achievements', 'achievements.id', 'user_achievements.achievement_id')
      .innerJoin('games', 'games.id', 'achievements.game_id')
      .select([
        'user_achievements.platform_account_id', 'user_achievements.achievement_id', 'user_achievements.unlocked_at',
        'achievements.name', 'achievements.rarity', 'achievements.global_unlock_pct',
        'games.id as game_id', 'games.title as game_title',
      ])
      .where('user_achievements.platform_account_id', '=', platform_account_id)
      .orderBy('user_achievements.unlocked_at', 'desc')
      .limit(limit)
      .offset(offset);
    if (game_id) query = query.where('games.id', '=', game_id);
    return query.execute();
  });

  app.get<{ Params: KeyParams }>('/user-achievements/:platformAccountId/:achievementId', {
    schema: { params: keyParams },
  }, async (request, reply) => {
    const { platformAccountId, achievementId } = request.params;
    const row = await db.selectFrom('user_achievements').selectAll()
      .where('platform_account_id', '=', platformAccountId)
      .where('achievement_id', '=', achievementId)
      .executeTakeFirst();
    return row ?? reply.code(404).send(notFound('Achievement-ul deblocat'));
  });

  // PRIMARY KEY compus → un achievement nu poate fi deblocat de două ori (409).
  // CHECK unlocked_at >= 2000-01-01 → 400 pentru date imposibile (D12).
  app.post<{ Body: { platform_account_id: number; achievement_id: number; unlocked_at?: string } }>(
    '/user-achievements',
    {
      schema: {
        body: {
          type: 'object',
          required: ['platform_account_id', 'achievement_id'],
          properties: {
            platform_account_id: { type: 'integer' },
            achievement_id: { type: 'integer' },
            unlocked_at: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    async (request, reply) => {
      const { platform_account_id, achievement_id, unlocked_at } = request.body;
      const row = await db.insertInto('user_achievements')
        .values({ platform_account_id, achievement_id, unlocked_at: unlocked_at ?? new Date() })
        .returningAll()
        .executeTakeFirstOrThrow();
      return reply.code(201).send(row);
    },
  );

  app.patch<{ Params: KeyParams; Body: { unlocked_at: string } }>(
    '/user-achievements/:platformAccountId/:achievementId',
    {
      schema: {
        params: keyParams,
        body: {
          type: 'object',
          required: ['unlocked_at'],
          properties: { unlocked_at: { type: 'string', format: 'date-time' } },
        },
      },
    },
    async (request, reply) => {
      const { platformAccountId, achievementId } = request.params;
      const row = await db.updateTable('user_achievements')
        .set({ unlocked_at: request.body.unlocked_at })
        .where('platform_account_id', '=', platformAccountId)
        .where('achievement_id', '=', achievementId)
        .returningAll()
        .executeTakeFirst();
      return row ?? reply.code(404).send(notFound('Achievement-ul deblocat'));
    },
  );

  app.delete<{ Params: KeyParams }>('/user-achievements/:platformAccountId/:achievementId', {
    schema: { params: keyParams },
  }, async (request, reply) => {
    const { platformAccountId, achievementId } = request.params;
    const result = await db.deleteFrom('user_achievements')
      .where('platform_account_id', '=', platformAccountId)
      .where('achievement_id', '=', achievementId)
      .executeTakeFirst();
    if (result.numDeletedRows === 0n) return reply.code(404).send(notFound('Achievement-ul deblocat'));
    return reply.code(204).send();
  });
}

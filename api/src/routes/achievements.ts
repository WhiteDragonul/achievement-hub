import type { FastifyInstance } from 'fastify';
import { requireRole } from '../auth.js';
import { db } from '../db/db.js';
import { idParams, notFound, paginationProperties, type IdParams, type Pagination } from './common.js';

type Rarity = 'ultra_rare' | 'very_rare' | 'rare' | 'common';

type AchievementBody = {
  game_id: number;
  external_id: string;
  name: string;
  description?: string;
  icon_url?: string;
  is_hidden?: boolean;
  global_unlock_pct?: number;
};

const achievementBodyProperties = {
  game_id: { type: 'integer' },
  external_id: { type: 'string', minLength: 1 },
  name: { type: 'string', minLength: 1 },
  description: { type: 'string' },
  icon_url: { type: 'string' },
  is_hidden: { type: 'boolean' },
  global_unlock_pct: { type: 'number' }, // intervalul 0–100 e verificat de CHECK-ul din DB
} as const;

export async function achievementsRoutes(app: FastifyInstance) {
  // Catalogul se modifică doar de admin (sau de sync); citirea e permisă oricărui user autentificat.
  app.addHook('preHandler', async (request) => {
    if (request.method !== 'GET') await requireRole('admin')(request);
  });

  app.get<{ Querystring: Pagination & { game_id?: number; rarity?: Rarity } }>('/achievements', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          ...paginationProperties,
          game_id: { type: 'integer' },
          rarity: { enum: ['ultra_rare', 'very_rare', 'rare', 'common'] },
        },
      },
    },
  }, async (request) => {
    const { limit, offset, game_id, rarity } = request.query;
    let query = db.selectFrom('achievements').selectAll().orderBy('id').limit(limit).offset(offset);
    if (game_id) query = query.where('game_id', '=', game_id);
    // rarity e coloană generată (D8), deci se poate filtra direct pe ea.
    if (rarity) query = query.where('rarity', '=', rarity);
    return query.execute();
  });

  app.get<{ Params: IdParams }>('/achievements/:id', { schema: { params: idParams } }, async (request, reply) => {
    const achievement = await db.selectFrom('achievements').selectAll()
      .where('id', '=', request.params.id)
      .executeTakeFirst();
    return achievement ?? reply.code(404).send(notFound('Achievement-ul'));
  });

  app.post<{ Body: AchievementBody }>('/achievements', {
    schema: {
      body: { type: 'object', required: ['game_id', 'external_id', 'name'], properties: achievementBodyProperties },
    },
  }, async (request, reply) => {
    const achievement = await db.insertInto('achievements').values(request.body).returningAll().executeTakeFirstOrThrow();
    return reply.code(201).send(achievement);
  });

  // Dacă se schimbă global_unlock_pct, Postgres recalculează automat rarity (coloană GENERATED ... STORED).
  app.patch<{ Params: IdParams; Body: Partial<AchievementBody> }>('/achievements/:id', {
    schema: { params: idParams, body: { type: 'object', minProperties: 1, properties: achievementBodyProperties } },
  }, async (request, reply) => {
    const achievement = await db.updateTable('achievements').set(request.body)
      .where('id', '=', request.params.id)
      .returningAll()
      .executeTakeFirst();
    return achievement ?? reply.code(404).send(notFound('Achievement-ul'));
  });

  app.delete<{ Params: IdParams }>('/achievements/:id', { schema: { params: idParams } }, async (request, reply) => {
    const result = await db.deleteFrom('achievements').where('id', '=', request.params.id).executeTakeFirst();
    if (result.numDeletedRows === 0n) return reply.code(404).send(notFound('Achievement-ul'));
    return reply.code(204).send();
  });
}

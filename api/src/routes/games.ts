import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { db } from '../db/db.js';
import { idParams, notFound, paginationProperties, type IdParams, type Pagination } from './common.js';

type GameBody = { platform_id: number; external_id: string; title: string; icon_url?: string };

const gameBodyProperties = {
  platform_id: { type: 'integer' },
  external_id: { type: 'string', minLength: 1 },
  title: { type: 'string' },
  icon_url: { type: 'string' },
} as const;

export async function gamesRoutes(app: FastifyInstance) {
  app.get<{ Querystring: Pagination & { platform_id?: number; search?: string } }>('/games', {
    schema: {
      querystring: {
        type: 'object',
        properties: { ...paginationProperties, platform_id: { type: 'integer' }, search: { type: 'string', minLength: 1 } },
      },
    },
  }, async (request) => {
    const { limit, offset, platform_id, search } = request.query;
    let query = db.selectFrom('games').selectAll().orderBy('title').orderBy('id').limit(limit).offset(offset);
    if (platform_id) query = query.where('platform_id', '=', platform_id);
    // ILIKE = LIKE fără să conteze literele mari/mici; caută oriunde în titlu.
    if (search) query = query.where('title', 'ilike', `%${search}%`);
    return query.execute();
  });

  // Detaliul unui joc include și numărul de achievement-uri (subquery corelat).
  app.get<{ Params: IdParams }>('/games/:id', { schema: { params: idParams } }, async (request, reply) => {
    const game = await db.selectFrom('games')
      .selectAll()
      .select(sql<number>`(SELECT count(*) FROM achievements WHERE achievements.game_id = games.id)`.as('achievements_count'))
      .where('id', '=', request.params.id)
      .executeTakeFirst();
    return game ?? reply.code(404).send(notFound('Jocul'));
  });

  // UNIQUE (platform_id, external_id) → 409; CHECK pe titlu gol → 400.
  app.post<{ Body: GameBody }>('/games', {
    schema: { body: { type: 'object', required: ['platform_id', 'external_id', 'title'], properties: gameBodyProperties } },
  }, async (request, reply) => {
    const game = await db.insertInto('games').values(request.body).returningAll().executeTakeFirstOrThrow();
    return reply.code(201).send(game);
  });

  app.patch<{ Params: IdParams; Body: Partial<GameBody> }>('/games/:id', {
    schema: { params: idParams, body: { type: 'object', minProperties: 1, properties: gameBodyProperties } },
  }, async (request, reply) => {
    const game = await db.updateTable('games').set(request.body)
      .where('id', '=', request.params.id)
      .returningAll()
      .executeTakeFirst();
    return game ?? reply.code(404).send(notFound('Jocul'));
  });

  // Șterge în cascadă achievement-urile jocului și progresul utilizatorilor pe el.
  app.delete<{ Params: IdParams }>('/games/:id', { schema: { params: idParams } }, async (request, reply) => {
    const result = await db.deleteFrom('games').where('id', '=', request.params.id).executeTakeFirst();
    if (result.numDeletedRows === 0n) return reply.code(404).send(notFound('Jocul'));
    return reply.code(204).send();
  });
}

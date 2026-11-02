import type { FastifyInstance } from 'fastify';
import { db } from '../db/db.js';
import { notFound, paginationProperties, type Pagination } from './common.js';

// Cheie primară compusă (platform_account_id, game_id), deci ruta are doi parametri.
const keyParams = {
  type: 'object',
  required: ['platformAccountId', 'gameId'],
  properties: { platformAccountId: { type: 'integer', minimum: 1 }, gameId: { type: 'integer', minimum: 1 } },
} as const;
type KeyParams = { platformAccountId: number; gameId: number };

type UserGameBody = {
  platform_account_id: number;
  game_id: number;
  playtime_minutes?: number;
  last_played_at?: string;
};

export async function userGamesRoutes(app: FastifyInstance) {
  // Jocurile unui cont, cu titlul jocului (JOIN cu games).
  app.get<{ Querystring: Pagination & { platform_account_id: number } }>('/user-games', {
    schema: {
      querystring: {
        type: 'object',
        required: ['platform_account_id'],
        properties: { ...paginationProperties, platform_account_id: { type: 'integer' } },
      },
    },
  }, async (request) => {
    const { limit, offset, platform_account_id } = request.query;
    return db.selectFrom('user_games')
      .innerJoin('games', 'games.id', 'user_games.game_id')
      .select([
        'user_games.platform_account_id', 'user_games.game_id', 'games.title',
        'user_games.playtime_minutes', 'user_games.last_played_at',
      ])
      .where('user_games.platform_account_id', '=', platform_account_id)
      .orderBy('user_games.last_played_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();
  });

  app.get<{ Params: KeyParams }>('/user-games/:platformAccountId/:gameId', {
    schema: { params: keyParams },
  }, async (request, reply) => {
    const { platformAccountId, gameId } = request.params;
    const userGame = await db.selectFrom('user_games').selectAll()
      .where('platform_account_id', '=', platformAccountId)
      .where('game_id', '=', gameId)
      .executeTakeFirst();
    return userGame ?? reply.code(404).send(notFound('Jocul deținut'));
  });

  // PRIMARY KEY compus → 409 dacă jocul e deja în lista contului.
  app.post<{ Body: UserGameBody }>('/user-games', {
    schema: {
      body: {
        type: 'object',
        required: ['platform_account_id', 'game_id'],
        properties: {
          platform_account_id: { type: 'integer' },
          game_id: { type: 'integer' },
          playtime_minutes: { type: 'integer' },
          last_played_at: { type: 'string', format: 'date-time' },
        },
      },
    },
  }, async (request, reply) => {
    const userGame = await db.insertInto('user_games').values(request.body).returningAll().executeTakeFirstOrThrow();
    return reply.code(201).send(userGame);
  });

  app.patch<{ Params: KeyParams; Body: { playtime_minutes?: number; last_played_at?: string } }>(
    '/user-games/:platformAccountId/:gameId',
    {
      schema: {
        params: keyParams,
        body: {
          type: 'object',
          minProperties: 1,
          properties: { playtime_minutes: { type: 'integer' }, last_played_at: { type: 'string', format: 'date-time' } },
        },
      },
    },
    async (request, reply) => {
      const { platformAccountId, gameId } = request.params;
      const userGame = await db.updateTable('user_games').set(request.body)
        .where('platform_account_id', '=', platformAccountId)
        .where('game_id', '=', gameId)
        .returningAll()
        .executeTakeFirst();
      return userGame ?? reply.code(404).send(notFound('Jocul deținut'));
    },
  );

  app.delete<{ Params: KeyParams }>('/user-games/:platformAccountId/:gameId', {
    schema: { params: keyParams },
  }, async (request, reply) => {
    const { platformAccountId, gameId } = request.params;
    const result = await db.deleteFrom('user_games')
      .where('platform_account_id', '=', platformAccountId)
      .where('game_id', '=', gameId)
      .executeTakeFirst();
    if (result.numDeletedRows === 0n) return reply.code(404).send(notFound('Jocul deținut'));
    return reply.code(204).send();
  });
}

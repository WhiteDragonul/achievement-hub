import type { FastifyInstance } from 'fastify';
import { db } from '../db/db.js';
import { idParams, notFound, type IdParams } from './common.js';

type PlatformBody = { code: string; name: string; is_mock?: boolean };

const platformBodyProperties = {
  code: { type: 'string' },
  name: { type: 'string', minLength: 1 },
  is_mock: { type: 'boolean' },
} as const;

export async function platformsRoutes(app: FastifyInstance) {
  // Doar 4 platforme: nu are nevoie de paginare.
  app.get('/platforms', async () => {
    return db.selectFrom('platforms').selectAll().orderBy('id').execute();
  });

  app.get<{ Params: IdParams }>('/platforms/:id', { schema: { params: idParams } }, async (request, reply) => {
    const platform = await db.selectFrom('platforms').selectAll()
      .where('id', '=', request.params.id)
      .executeTakeFirst();
    return platform ?? reply.code(404).send(notFound('Platforma'));
  });

  app.post<{ Body: PlatformBody }>('/platforms', {
    schema: { body: { type: 'object', required: ['code', 'name'], properties: platformBodyProperties } },
  }, async (request, reply) => {
    const platform = await db.insertInto('platforms').values(request.body).returningAll().executeTakeFirstOrThrow();
    return reply.code(201).send(platform);
  });

  app.patch<{ Params: IdParams; Body: Partial<PlatformBody> }>('/platforms/:id', {
    schema: { params: idParams, body: { type: 'object', minProperties: 1, properties: platformBodyProperties } },
  }, async (request, reply) => {
    const platform = await db.updateTable('platforms').set(request.body)
      .where('id', '=', request.params.id)
      .returningAll()
      .executeTakeFirst();
    return platform ?? reply.code(404).send(notFound('Platforma'));
  });

  // ON DELETE RESTRICT: o platformă cu conturi sau jocuri nu poate fi ștearsă → 409 din errorHandler.
  app.delete<{ Params: IdParams }>('/platforms/:id', { schema: { params: idParams } }, async (request, reply) => {
    const result = await db.deleteFrom('platforms').where('id', '=', request.params.id).executeTakeFirst();
    if (result.numDeletedRows === 0n) return reply.code(404).send(notFound('Platforma'));
    return reply.code(204).send();
  });
}

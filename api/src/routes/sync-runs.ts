import type { FastifyInstance } from 'fastify';
import { assertOwnsAccount, requireRole } from '../auth.js';
import { db } from '../db/db.js';
import { requestSync } from '../sync/queue.js';
import { idParams, notFound, paginationProperties, type IdParams, type Pagination } from './common.js';

type SyncStatus = 'queued' | 'running' | 'succeeded' | 'failed';
const statuses = ['queued', 'running', 'succeeded', 'failed'];

type UpdateSyncRunBody = {
  status?: SyncStatus;
  started_at?: string;
  finished_at?: string;
  games_synced?: number;
  achievements_synced?: number;
  error_message?: string;
};

// În etapa de sync, worker-ul va crea și actualiza aceste rânduri; rutele de aici permit același lucru manual.
export async function syncRunsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: Pagination & { platform_account_id?: number; status?: SyncStatus } }>('/sync-runs', {
    schema: {
      querystring: {
        type: 'object',
        properties: { ...paginationProperties, platform_account_id: { type: 'integer' }, status: { enum: statuses } },
      },
    },
  }, async (request) => {
    const { limit, offset, platform_account_id, status } = request.query;
    let query = db.selectFrom('sync_runs').selectAll().orderBy('created_at', 'desc').limit(limit).offset(offset);
    if (platform_account_id) query = query.where('platform_account_id', '=', platform_account_id);
    if (status) query = query.where('status', '=', status);
    return query.execute();
  });

  app.get<{ Params: IdParams }>('/sync-runs/:id', { schema: { params: idParams } }, async (request, reply) => {
    const run = await db.selectFrom('sync_runs').selectAll().where('id', '=', request.params.id).executeTakeFirst();
    return run ?? reply.code(404).send(notFound('Sincronizarea'));
  });

  // O sincronizare nouă pornește mereu cu status 'queued' (valoarea DEFAULT din tabel).
  app.post<{ Body: { platform_account_id: number } }>('/sync-runs', {
    schema: {
      body: { type: 'object', required: ['platform_account_id'], properties: { platform_account_id: { type: 'integer' } } },
    },
  }, async (request, reply) => {
    await assertOwnsAccount(request, request.body.platform_account_id);
    // Jobul ajunge în coada pg-boss; worker-ul îl execută și actualizează rândul (running → succeeded / failed).
    return reply.code(201).send(await requestSync(request.body.platform_account_id));
  });

  // Consistența e păzită de CHECK-uri: 'failed' fără error_message → 400, finished_at < started_at → 400.
  // Starea unei sincronizări o schimbă worker-ul; manual, doar adminul.
  app.patch<{ Params: IdParams; Body: UpdateSyncRunBody }>('/sync-runs/:id', {
    preHandler: requireRole('admin'),
    schema: {
      params: idParams,
      body: {
        type: 'object',
        minProperties: 1,
        properties: {
          status: { enum: statuses },
          started_at: { type: 'string', format: 'date-time' },
          finished_at: { type: 'string', format: 'date-time' },
          games_synced: { type: 'integer' },
          achievements_synced: { type: 'integer' },
          error_message: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const run = await db.updateTable('sync_runs').set(request.body)
      .where('id', '=', request.params.id)
      .returningAll()
      .executeTakeFirst();
    return run ?? reply.code(404).send(notFound('Sincronizarea'));
  });

  app.delete<{ Params: IdParams }>('/sync-runs/:id', { schema: { params: idParams }, preHandler: requireRole('admin') }, async (request, reply) => {
    const result = await db.deleteFrom('sync_runs').where('id', '=', request.params.id).executeTakeFirst();
    if (result.numDeletedRows === 0n) return reply.code(404).send(notFound('Sincronizarea'));
    return reply.code(204).send();
  });
}

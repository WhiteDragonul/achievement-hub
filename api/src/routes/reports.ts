import type { FastifyInstance } from 'fastify';
import { db } from '../db/db.js';
import { idParams, notFound, paginationProperties, type IdParams, type Pagination } from './common.js';

type ReportStatus = 'open' | 'resolved' | 'rejected';
const statuses = ['open', 'resolved', 'rejected'];

type UpdateReportBody = { status?: ReportStatus; resolved_by?: number; resolution_note?: string; reason?: string };

export async function reportsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: Pagination & { status?: ReportStatus; target_user_id?: number } }>('/reports', {
    schema: {
      querystring: {
        type: 'object',
        properties: { ...paginationProperties, status: { enum: statuses }, target_user_id: { type: 'integer' } },
      },
    },
  }, async (request) => {
    const { limit, offset, status, target_user_id } = request.query;
    let query = db.selectFrom('reports')
      .innerJoin('users as reporter', 'reporter.id', 'reports.reporter_id')
      .innerJoin('users as target', 'target.id', 'reports.target_user_id')
      .selectAll('reports')
      .select(['reporter.username as reporter_username', 'target.username as target_username'])
      .orderBy('reports.created_at', 'desc')
      .limit(limit)
      .offset(offset);
    if (status) query = query.where('reports.status', '=', status);
    if (target_user_id) query = query.where('reports.target_user_id', '=', target_user_id);
    return query.execute();
  });

  app.get<{ Params: IdParams }>('/reports/:id', { schema: { params: idParams } }, async (request, reply) => {
    const report = await db.selectFrom('reports').selectAll().where('id', '=', request.params.id).executeTakeFirst();
    return report ?? reply.code(404).send(notFound('Raportarea'));
  });

  // CHECK-uri: nu te poți raporta singur, motivul are 5–1000 de caractere.
  app.post<{ Body: { reporter_id: number; target_user_id: number; reason: string } }>('/reports', {
    schema: {
      body: {
        type: 'object',
        required: ['reporter_id', 'target_user_id', 'reason'],
        properties: { reporter_id: { type: 'integer' }, target_user_id: { type: 'integer' }, reason: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const report = await db.insertInto('reports').values(request.body).returningAll().executeTakeFirstOrThrow();
    return reply.code(201).send(report);
  });

  // Rezolvarea unei raportări. Două modificări care trebuie să se întâmple împreună sau deloc,
  // deci rulează într-o tranzacție: raportarea primește statusul nou, iar dacă e 'resolved',
  // utilizatorul raportat e ascuns din clasamente.
  app.patch<{ Params: IdParams; Body: UpdateReportBody }>('/reports/:id', {
    schema: {
      params: idParams,
      body: {
        type: 'object',
        minProperties: 1,
        properties: {
          status: { enum: statuses },
          resolved_by: { type: 'integer' },
          resolution_note: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { status } = request.body;
    // resolved_at trebuie să fie completat exact când status nu e 'open' (CHECK reports_resolution_chk).
    const resolvedAt = status === undefined ? undefined : status === 'open' ? null : new Date();

    const report = await db.transaction().execute(async (trx) => {
      const updated = await trx.updateTable('reports')
        .set({ ...request.body, resolved_at: resolvedAt })
        .where('id', '=', request.params.id)
        .returningAll()
        .executeTakeFirst();

      if (updated?.status === 'resolved') {
        await trx.updateTable('users')
          .set({ hidden_from_leaderboards: true, updated_at: new Date() })
          .where('id', '=', updated.target_user_id)
          .execute();
      }
      return updated;
    });

    return report ?? reply.code(404).send(notFound('Raportarea'));
  });

  app.delete<{ Params: IdParams }>('/reports/:id', { schema: { params: idParams } }, async (request, reply) => {
    const result = await db.deleteFrom('reports').where('id', '=', request.params.id).executeTakeFirst();
    if (result.numDeletedRows === 0n) return reply.code(404).send(notFound('Raportarea'));
    return reply.code(204).send();
  });
}

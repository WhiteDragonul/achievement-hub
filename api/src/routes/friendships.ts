import type { FastifyInstance } from 'fastify';
import { assertSelf, forbid, hasRole } from '../auth.js';
import { db } from '../db/db.js';
import { notFound, paginationProperties, type Pagination } from './common.js';

// Cheie primară compusă (requester_id, addressee_id).
const pairParams = {
  type: 'object',
  required: ['requesterId', 'addresseeId'],
  properties: { requesterId: { type: 'integer', minimum: 1 }, addresseeId: { type: 'integer', minimum: 1 } },
} as const;
type PairParams = { requesterId: number; addresseeId: number };

export async function friendshipsRoutes(app: FastifyInstance) {
  // Prieteniile unui user, în ambele direcții (trimise și primite), cu username-urile ambelor părți.
  // Tabelul users apare de două ori în JOIN, deci are două alias-uri: requester și addressee.
  app.get<{ Querystring: Pagination & { user_id: number; status?: 'pending' | 'accepted' } }>('/friendships', {
    schema: {
      querystring: {
        type: 'object',
        required: ['user_id'],
        properties: { ...paginationProperties, user_id: { type: 'integer' }, status: { enum: ['pending', 'accepted'] } },
      },
    },
  }, async (request) => {
    const { limit, offset, user_id, status } = request.query;
    // Lista de prieteni a altcuiva o văd doar moderatorii.
    if (user_id !== request.user.id && !hasRole(request.user, 'moderator')) forbid();
    let query = db.selectFrom('friendships')
      .innerJoin('users as requester', 'requester.id', 'friendships.requester_id')
      .innerJoin('users as addressee', 'addressee.id', 'friendships.addressee_id')
      .select([
        'friendships.requester_id', 'requester.username as requester_username',
        'friendships.addressee_id', 'addressee.username as addressee_username',
        'friendships.status', 'friendships.created_at', 'friendships.responded_at',
      ])
      .where((eb) => eb.or([
        eb('friendships.requester_id', '=', user_id),
        eb('friendships.addressee_id', '=', user_id),
      ]))
      .orderBy('friendships.created_at', 'desc')
      .limit(limit)
      .offset(offset);
    if (status) query = query.where('friendships.status', '=', status);
    return query.execute();
  });

  app.get<{ Params: PairParams }>('/friendships/:requesterId/:addresseeId', {
    schema: { params: pairParams },
  }, async (request, reply) => {
    const { requesterId, addresseeId } = request.params;
    if (![requesterId, addresseeId].includes(request.user.id) && !hasRole(request.user, 'moderator')) forbid();
    const friendship = await db.selectFrom('friendships').selectAll()
      .where('requester_id', '=', requesterId)
      .where('addressee_id', '=', addresseeId)
      .executeTakeFirst();
    return friendship ?? reply.code(404).send(notFound('Prietenia'));
  });

  // Cerere nouă (status 'pending'). Cererea inversă (B→A când există A→B) e blocată de indexul unic
  // friendships_pair_uq → 409; cererea către sine e blocată de CHECK → 400.
  app.post<{ Body: { requester_id: number; addressee_id: number } }>('/friendships', {
    schema: {
      body: {
        type: 'object',
        required: ['requester_id', 'addressee_id'],
        properties: { requester_id: { type: 'integer' }, addressee_id: { type: 'integer' } },
      },
    },
  }, async (request, reply) => {
    assertSelf(request, request.body.requester_id); // cererea pleacă de la userul logat
    const friendship = await db.insertInto('friendships').values(request.body).returningAll().executeTakeFirstOrThrow();
    return reply.code(201).send(friendship);
  });

  // Singura modificare permisă: acceptarea unei cereri în așteptare. Refuzul = DELETE.
  app.patch<{ Params: PairParams; Body: { status: 'accepted' } }>('/friendships/:requesterId/:addresseeId', {
    schema: {
      params: pairParams,
      body: { type: 'object', required: ['status'], properties: { status: { const: 'accepted' } } },
    },
  }, async (request, reply) => {
    const { requesterId, addresseeId } = request.params;
    assertSelf(request, addresseeId); // doar destinatarul acceptă cererea
    const friendship = await db.updateTable('friendships')
      // CHECK-ul friendships_responded_chk cere responded_at completat când status nu mai e 'pending'.
      .set({ status: 'accepted', responded_at: new Date() })
      .where('requester_id', '=', requesterId)
      .where('addressee_id', '=', addresseeId)
      .where('status', '=', 'pending')
      .returningAll()
      .executeTakeFirst();
    return friendship ?? reply.code(404).send(notFound('Pending friend request'));
  });

  app.delete<{ Params: PairParams }>('/friendships/:requesterId/:addresseeId', {
    schema: { params: pairParams },
  }, async (request, reply) => {
    const { requesterId, addresseeId } = request.params;
    // Oricare dintre cei doi poate anula / refuza prietenia.
    if (![requesterId, addresseeId].includes(request.user.id) && !hasRole(request.user, 'admin')) forbid();
    const result = await db.deleteFrom('friendships')
      .where('requester_id', '=', requesterId)
      .where('addressee_id', '=', addresseeId)
      .executeTakeFirst();
    if (result.numDeletedRows === 0n) return reply.code(404).send(notFound('Prietenia'));
    return reply.code(204).send();
  });
}

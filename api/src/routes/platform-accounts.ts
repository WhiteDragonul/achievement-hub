import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { config } from '../config.js';
import { db } from '../db/db.js';
import { idParams, notFound, paginationProperties, type IdParams, type Pagination } from './common.js';

// Tokenul criptat nu iese din API; spunem doar dacă există.
const publicColumns = [
  'id', 'user_id', 'platform_id', 'external_id', 'display_name', 'linked_at', 'last_synced_at',
  sql<boolean>`access_token_enc IS NOT NULL`.as('has_access_token'),
] as const;

// Criptare simetrică în Postgres (pgcrypto, D7). Cheia vine din variabila de mediu și e trimisă ca parametru,
// deci nu e salvată nicăieri în baza de date.
const encrypt = (token: string) => sql<Buffer>`pgp_sym_encrypt(${token}, ${config.tokenEncryptionKey})`;

type CreateAccountBody = {
  user_id: number;
  platform_id: number;
  external_id: string;
  display_name: string;
  access_token?: string;
};

export async function platformAccountsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: Pagination & { user_id?: number; platform_id?: number } }>('/platform-accounts', {
    schema: {
      querystring: {
        type: 'object',
        properties: { ...paginationProperties, user_id: { type: 'integer' }, platform_id: { type: 'integer' } },
      },
    },
  }, async (request) => {
    const { limit, offset, user_id, platform_id } = request.query;
    let query = db.selectFrom('platform_accounts').select(publicColumns).orderBy('id').limit(limit).offset(offset);
    if (user_id) query = query.where('user_id', '=', user_id);
    if (platform_id) query = query.where('platform_id', '=', platform_id);
    return query.execute();
  });

  app.get<{ Params: IdParams }>('/platform-accounts/:id', { schema: { params: idParams } }, async (request, reply) => {
    const account = await db.selectFrom('platform_accounts').select(publicColumns)
      .where('id', '=', request.params.id)
      .executeTakeFirst();
    return account ?? reply.code(404).send(notFound('Contul de platformă'));
  });

  // UNIQUE (user_id, platform_id) și UNIQUE (platform_id, external_id) → 409 dacă se încalcă.
  app.post<{ Body: CreateAccountBody }>('/platform-accounts', {
    schema: {
      body: {
        type: 'object',
        required: ['user_id', 'platform_id', 'external_id', 'display_name'],
        properties: {
          user_id: { type: 'integer' },
          platform_id: { type: 'integer' },
          external_id: { type: 'string', minLength: 1 },
          display_name: { type: 'string', minLength: 1 },
          access_token: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { access_token, ...fields } = request.body;
    const account = await db.insertInto('platform_accounts')
      .values({ ...fields, access_token_enc: access_token ? encrypt(access_token) : null })
      .returning(publicColumns)
      .executeTakeFirstOrThrow();
    return reply.code(201).send(account);
  });

  app.patch<{ Params: IdParams; Body: { display_name?: string; access_token?: string } }>('/platform-accounts/:id', {
    schema: {
      params: idParams,
      body: {
        type: 'object',
        minProperties: 1,
        properties: { display_name: { type: 'string', minLength: 1 }, access_token: { type: 'string', minLength: 1 } },
      },
    },
  }, async (request, reply) => {
    const { display_name, access_token } = request.body;
    // Kysely ignoră valorile undefined: coloanele netrimise în body nu se modifică.
    const account = await db.updateTable('platform_accounts')
      .set({ display_name, access_token_enc: access_token ? encrypt(access_token) : undefined })
      .where('id', '=', request.params.id)
      .returning(publicColumns)
      .executeTakeFirst();
    return account ?? reply.code(404).send(notFound('Contul de platformă'));
  });

  // Dezlegarea unui cont: progresul lui (user_games, user_achievements, sync_runs) dispare prin ON DELETE CASCADE.
  app.delete<{ Params: IdParams }>('/platform-accounts/:id', { schema: { params: idParams } }, async (request, reply) => {
    const result = await db.deleteFrom('platform_accounts').where('id', '=', request.params.id).executeTakeFirst();
    if (result.numDeletedRows === 0n) return reply.code(404).send(notFound('Contul de platformă'));
    return reply.code(204).send();
  });
}

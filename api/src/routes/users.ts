import type { FastifyInstance } from 'fastify';
import argon2 from 'argon2';
import { sql } from 'kysely';
import { db } from '../db/db.js';
import type { Role } from '../db/types.js';
import { idParams, notFound, paginationProperties, type IdParams, type Pagination } from './common.js';

// password_hash nu iese niciodată din API: selectăm explicit doar coloanele publice.
const publicColumns = [
  'id', 'username', 'email', 'role', 'display_name', 'avatar_url',
  'is_banned', 'hidden_from_leaderboards', 'created_at', 'updated_at',
] as const;

const roles = ['user', 'moderator', 'admin'];

type CreateUserBody = {
  username: string;
  email?: string;
  password?: string;
  role?: Role;
  display_name?: string;
  avatar_url?: string;
};
type UpdateUserBody = Partial<CreateUserBody> & { is_banned?: boolean; hidden_from_leaderboards?: boolean };

const userBodyProperties = {
  username: { type: 'string' },
  email: { type: 'string' },
  password: { type: 'string', minLength: 8 },
  role: { enum: roles },
  display_name: { type: 'string', maxLength: 64 },
  avatar_url: { type: 'string' },
} as const;

export async function usersRoutes(app: FastifyInstance) {
  app.get<{ Querystring: Pagination & { search?: string; role?: Role } }>('/users', {
    schema: {
      querystring: {
        type: 'object',
        properties: { ...paginationProperties, search: { type: 'string', minLength: 1 }, role: { enum: roles } },
      },
    },
  }, async (request) => {
    const { limit, offset, search, role } = request.query;
    let query = db.selectFrom('users').select(publicColumns).orderBy('id').limit(limit).offset(offset);
    // Căutare după începutul username-ului, fără să conteze literele mari/mici.
    if (search) query = query.where(sql`lower(username)`, 'like', `${search.toLowerCase()}%`);
    if (role) query = query.where('role', '=', role);
    return query.execute();
  });

  app.get<{ Params: IdParams }>('/users/:id', { schema: { params: idParams } }, async (request, reply) => {
    const user = await db.selectFrom('users').select(publicColumns)
      .where('id', '=', request.params.id)
      .executeTakeFirst();
    return user ?? reply.code(404).send(notFound('Utilizatorul'));
  });

  app.post<{ Body: CreateUserBody }>('/users', {
    schema: { body: { type: 'object', required: ['username'], properties: userBodyProperties } },
  }, async (request, reply) => {
    const { password, ...fields } = request.body;
    const user = await db.insertInto('users')
      .values({
        ...fields,
        // Parola se stochează doar ca hash argon2 (sare + parametri sunt incluși în string).
        password_hash: password ? await argon2.hash(password) : null,
      })
      .returning(publicColumns)
      .executeTakeFirstOrThrow();
    return reply.code(201).send(user);
  });

  app.patch<{ Params: IdParams; Body: UpdateUserBody }>('/users/:id', {
    schema: {
      params: idParams,
      body: {
        type: 'object',
        minProperties: 1,
        properties: {
          ...userBodyProperties,
          is_banned: { type: 'boolean' },
          hidden_from_leaderboards: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const { password, ...fields } = request.body;
    const user = await db.updateTable('users')
      .set({
        ...fields,
        // undefined = Kysely nu atinge coloana (parola rămâne neschimbată dacă nu e trimisă)
        password_hash: password ? await argon2.hash(password) : undefined,
        updated_at: new Date(),
      })
      .where('id', '=', request.params.id)
      .returning(publicColumns)
      .executeTakeFirst();
    return user ?? reply.code(404).send(notFound('Utilizatorul'));
  });

  // Ștergerea unui user șterge în cascadă (ON DELETE CASCADE) conturile, progresul, prieteniile și raportările lui.
  app.delete<{ Params: IdParams }>('/users/:id', { schema: { params: idParams } }, async (request, reply) => {
    const result = await db.deleteFrom('users').where('id', '=', request.params.id).executeTakeFirst();
    if (result.numDeletedRows === 0n) return reply.code(404).send(notFound('Utilizatorul'));
    return reply.code(204).send();
  });
}

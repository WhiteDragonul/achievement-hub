// Rutele de autentificare (publice, fără token de acces): înregistrare, login, refresh, logout.
// /auth/me e înregistrat separat, între rutele protejate (vezi server.ts).
import type { FastifyInstance } from 'fastify';
import argon2 from 'argon2';
import { sql } from 'kysely';
import { createSession, hashToken, type AuthUser } from '../auth.js';
import { db } from '../db/db.js';

const refreshBody = {
  type: 'object',
  required: ['refresh_token'],
  properties: { refresh_token: { type: 'string', minLength: 10 } },
} as const;

// Același răspuns pentru „email inexistent” și „parolă greșită”: nu dezvăluim ce emailuri au cont.
const INVALID_LOGIN = { error: 'Email sau parolă greșită' };

export async function authRoutes(app: FastifyInstance) {
  // Contul nou are mereu rolul 'user'; rolurile superioare le dă doar un admin (PATCH /users/:id).
  app.post<{ Body: { username: string; email: string; password: string } }>('/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'email', 'password'],
        properties: {
          username: { type: 'string' },
          email: { type: 'string' },
          password: { type: 'string', minLength: 8, maxLength: 128 },
        },
      },
    },
  }, async (request, reply) => {
    const { username, email, password } = request.body;
    // Formatul username-ului / emailului și unicitatea lor sunt verificate de DB (CHECK + indecși unici → 400 / 409).
    const user = await db.insertInto('users')
      .values({ username, email, password_hash: await argon2.hash(password) })
      .returning(['id', 'role', 'username'])
      .executeTakeFirstOrThrow();
    return reply.code(201).send({ user, ...(await createSession(user, request.headers['user-agent'])) });
  });

  app.post<{ Body: { email: string; password: string } }>('/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: { email: { type: 'string' }, password: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body;
    const row = await db.selectFrom('users')
      .select(['id', 'role', 'username', 'password_hash', 'is_banned'])
      .where(sql`lower(email)`, '=', email.toLowerCase())
      .executeTakeFirst();

    // argon2.verify citește sarea și parametrii din hash-ul stocat și recalculează hash-ul parolei primite.
    if (!row?.password_hash || !(await argon2.verify(row.password_hash, password))) {
      return reply.code(401).send(INVALID_LOGIN);
    }
    if (row.is_banned) return reply.code(403).send({ error: 'Contul este suspendat' });

    const user: AuthUser = { id: row.id, role: row.role, username: row.username };
    return { user, ...(await createSession(user, request.headers['user-agent'])) };
  });

  // Rotație: tokenul folosit e revocat și primești o pereche nouă.
  // Dacă cineva prezintă un token deja revocat, probabil a fost furat → revocăm toate sesiunile acelui user.
  app.post<{ Body: { refresh_token: string } }>('/auth/refresh', { schema: { body: refreshBody } }, async (request, reply) => {
    const session = await db.selectFrom('refresh_tokens')
      .innerJoin('users', 'users.id', 'refresh_tokens.user_id')
      .select([
        'refresh_tokens.id', 'refresh_tokens.user_id', 'refresh_tokens.expires_at', 'refresh_tokens.revoked_at',
        'users.role', 'users.username', 'users.is_banned',
      ])
      .where('refresh_tokens.token_hash', '=', hashToken(request.body.refresh_token))
      .executeTakeFirst();

    if (!session) return reply.code(401).send({ error: 'Sesiune invalidă' });
    if (session.revoked_at) {
      await db.updateTable('refresh_tokens').set({ revoked_at: new Date() })
        .where('user_id', '=', session.user_id)
        .where('revoked_at', 'is', null)
        .execute();
      return reply.code(401).send({ error: 'Sesiune revocată' });
    }
    if (new Date(session.expires_at) < new Date()) return reply.code(401).send({ error: 'Sesiune expirată' });
    if (session.is_banned) return reply.code(403).send({ error: 'Contul este suspendat' });

    await db.updateTable('refresh_tokens').set({ revoked_at: new Date() }).where('id', '=', session.id).execute();
    // Rolul se citește din DB la fiecare refresh: o schimbare de rol se vede în cel mult 15 minute.
    const user: AuthUser = { id: session.user_id, role: session.role, username: session.username };
    return { user, ...(await createSession(user, request.headers['user-agent'])) };
  });

  app.post<{ Body: { refresh_token: string } }>('/auth/logout', { schema: { body: refreshBody } }, async (request, reply) => {
    await db.updateTable('refresh_tokens').set({ revoked_at: new Date() })
      .where('token_hash', '=', hashToken(request.body.refresh_token))
      .where('revoked_at', 'is', null)
      .execute();
    return reply.code(204).send();
  });
}

// Userul din tokenul de acces, cu datele actuale din DB (rută protejată).
export async function meRoutes(app: FastifyInstance) {
  app.get('/auth/me', async (request) => {
    return db.selectFrom('users')
      .select(['id', 'username', 'email', 'role', 'display_name', 'avatar_url', 'is_banned', 'created_at'])
      .where('id', '=', request.user.id)
      .executeTakeFirstOrThrow();
  });
}

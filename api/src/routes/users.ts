import type { FastifyInstance } from 'fastify';
import argon2 from 'argon2';
import { sql } from 'kysely';
import { assertSelf, forbid, hasRole, requireRole, type AuthUser } from '../auth.js';
import { db } from '../db/db.js';
import { accentColors, banners, type AccentColor, type Banner, type Role } from '../db/types.js';
import { idParams, notFound, paginationProperties, type IdParams, type Pagination } from './common.js';

// password_hash nu iese niciodată din API: selectăm explicit doar coloanele publice.
const publicColumns = [
  'id', 'username', 'email', 'role', 'display_name', 'avatar_url', 'bio', 'accent_color', 'banner', 'favorite_game_id',
  'is_banned', 'hidden_from_leaderboards', 'created_at', 'updated_at',
] as const;

const roles = ['user', 'moderator', 'admin'];

type CreateUserBody = {
  username: string;
  email?: string;
  password?: string;
  role?: Role;
  display_name?: string;
  avatar_url?: string | null;
};
type UpdateUserBody = Partial<CreateUserBody> & {
  is_banned?: boolean;
  hidden_from_leaderboards?: boolean;
  // personalizarea profilului (009)
  bio?: string | null;
  accent_color?: AccentColor;
  banner?: Banner;
  favorite_game_id?: number | null;
};

const userBodyProperties = {
  username: { type: 'string' },
  email: { type: 'string' },
  password: { type: 'string', minLength: 8 },
  role: { enum: roles },
  display_name: { type: 'string', maxLength: 64 },
  avatar_url: { type: ['string', 'null'] },
} as const;

// Personalizarea profilului: limitele sunt aceleași ca CHECK-urile din 009; DB-ul le verifică oricum.
const profileProperties = {
  bio: { type: ['string', 'null'], maxLength: 300 },
  accent_color: { enum: accentColors },
  banner: { enum: banners },
  favorite_game_id: { type: ['integer', 'null'] },
} as const;

// Jocul preferat trebuie să fie în biblioteca userului (pe oricare dintre conturile lui).
async function ownsGame(userId: number, gameId: number): Promise<boolean> {
  const row = await db.selectFrom('user_games')
    .innerJoin('platform_accounts as pa', 'pa.id', 'user_games.platform_account_id')
    .select('user_games.game_id')
    .where('pa.user_id', '=', userId)
    .where('user_games.game_id', '=', gameId)
    .executeTakeFirst();
  return row !== undefined;
}

// Emailul e dată personală: îl văd doar proprietarul și staff-ul (moderator / admin).
function hideEmail<T extends { id: number; email: string | null }>(viewer: AuthUser, user: T): T {
  return viewer.id === user.id || hasRole(viewer, 'moderator') ? user : { ...user, email: null };
}

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
    return (await query.execute()).map((user) => hideEmail(request.user, user));
  });

  app.get<{ Params: IdParams }>('/users/:id', { schema: { params: idParams } }, async (request, reply) => {
    const user = await db.selectFrom('users').select(publicColumns)
      .where('id', '=', request.params.id)
      .executeTakeFirst();
    return user ? hideEmail(request.user, user) : reply.code(404).send(notFound('Utilizatorul'));
  });

  // Conturile noi se creează prin /auth/register; aici adminul poate crea direct (inclusiv cu alt rol).
  app.post<{ Body: CreateUserBody }>('/users', {
    preHandler: requireRole('admin'),
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
          ...profileProperties,
          is_banned: { type: 'boolean' },
          hidden_from_leaderboards: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    // Cine ce poate modifica:
    //  - userul: propriul profil (username, email, parolă, nume afișat, avatar);
    //  - moderatorul: în plus is_banned / hidden_from_leaderboards la oricine (moderare);
    //  - adminul: orice, inclusiv rolul.
    const me = request.user;
    const isSelf = me.id === request.params.id;
    const moderationKeys = ['is_banned', 'hidden_from_leaderboards'];
    const keys = Object.keys(request.body);
    if (request.body.role !== undefined && !hasRole(me, 'admin')) forbid('Only an admin can change roles');
    if (keys.some((key) => moderationKeys.includes(key)) && !hasRole(me, 'moderator')) {
      forbid('Only moderators can ban or hide users');
    }
    if (keys.some((key) => !moderationKeys.includes(key)) && !isSelf && !hasRole(me, 'admin')) {
      forbid('You can only edit your own profile');
    }

    const { favorite_game_id } = request.body;
    if (favorite_game_id && !(await ownsGame(request.params.id, favorite_game_id))) {
      return reply.code(400).send({ error: 'Your favorite game must be in your library' });
    }

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
    // Un cont suspendat pierde toate sesiunile: nu mai poate obține tokenuri de acces noi.
    if (user && request.body.is_banned) {
      await db.updateTable('refresh_tokens').set({ revoked_at: new Date() })
        .where('user_id', '=', user.id)
        .where('revoked_at', 'is', null)
        .execute();
    }
    return user ?? reply.code(404).send(notFound('Utilizatorul'));
  });

  // Vitrina profilului: lista completă (0–3 achievement-uri, în ordine) înlocuiește vitrina veche.
  app.put<{ Params: IdParams; Body: { achievement_ids: number[] } }>('/users/:id/showcase', {
    schema: {
      params: idParams,
      body: {
        type: 'object',
        required: ['achievement_ids'],
        properties: { achievement_ids: { type: 'array', items: { type: 'integer' }, maxItems: 3, uniqueItems: true } },
      },
    },
  }, async (request, reply) => {
    assertSelf(request, request.params.id);
    const ids = request.body.achievement_ids;
    if (ids.length > 0) {
      // Doar achievement-uri deblocate de acest user (pe oricare cont al lui).
      const unlocked = await db.selectFrom('user_achievements as ua')
        .innerJoin('platform_accounts as pa', 'pa.id', 'ua.platform_account_id')
        .select('ua.achievement_id')
        .distinct()
        .where('pa.user_id', '=', request.params.id)
        .where('ua.achievement_id', 'in', ids)
        .execute();
      if (unlocked.length !== ids.length) return reply.code(400).send({ error: 'You can only showcase unlocked achievements' });
    }
    // Ștergere + inserare în aceeași tranzacție: vitrina nu rămâne niciodată pe jumătate scrisă.
    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom('profile_showcase').where('user_id', '=', request.params.id).execute();
      if (ids.length > 0) {
        await trx.insertInto('profile_showcase')
          .values(ids.map((achievement_id, index) => ({ user_id: request.params.id, position: index + 1, achievement_id })))
          .execute();
      }
    });
    return reply.code(204).send();
  });

  // Ștergerea unui user șterge în cascadă (ON DELETE CASCADE) conturile, progresul, prieteniile și raportările lui.
  app.delete<{ Params: IdParams }>('/users/:id', { schema: { params: idParams } }, async (request, reply) => {
    assertSelf(request, request.params.id); // propriul cont sau adminul
    const result = await db.deleteFrom('users').where('id', '=', request.params.id).executeTakeFirst();
    if (result.numDeletedRows === 0n) return reply.code(404).send(notFound('Utilizatorul'));
    return reply.code(204).send();
  });
}

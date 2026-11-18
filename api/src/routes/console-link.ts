// Legarea conturilor PlayStation și Xbox (D55). La fel ca la Steam, contul nou legat primește automat un prim sync.
//  - PSN: userul își scrie Online ID-ul; îl căutăm în PSN și salvăm accountId-ul. Sony nu oferă login pentru
//    aplicații terțe, deci nu se poate dovedi că ID-ul e al lui; UNIQUE (platform_id, external_id) împiedică
//    totuși ca același cont PSN să fie legat la doi useri.
//  - Xbox: login cu contul Microsoft (OAuth). /auth/xbox/link dă adresa de login; Microsoft trimite userul înapoi la
//    /auth/xbox/callback cu un cod, din care aflăm identitatea Xbox (XUID, gamertag). Asta dovedește că e contul lui.
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { signXboxLinkState, verifyXboxLinkState } from '../auth.js';
import { config } from '../config.js';
import { db } from '../db/db.js';
import { requestSync } from '../sync/queue.js';
import { findPsnAccount } from '../sync/psn-provider.js';
import { linkXboxAccount, xboxAuthorizeUrl } from '../sync/xbox-provider.js';
import { clientTargets, type Client } from './steam-auth.js';

const platformId = async (code: string) =>
  (await db.selectFrom('platforms').select('id').where('code', '=', code).executeTakeFirstOrThrow()).id;

// Cine are deja legat contul extern (pentru mesajul de eroare); null dacă e liber.
const ownerOf = (platform: number, externalId: string) => db.selectFrom('platform_accounts').select('user_id')
  .where('platform_id', '=', platform).where('external_id', '=', externalId).executeTakeFirst();

// Rute protejate (cer token de acces).
export async function consoleLinkRoutes(app: FastifyInstance) {
  // Căutarea din profil: userul scrie Online ID-ul, vede avatarul și numele, apoi confirmă cu „Connect”.
  app.get<{ Querystring: { online_id: string } }>('/auth/psn/search', {
    schema: {
      querystring: {
        type: 'object', required: ['online_id'],
        properties: { online_id: { type: 'string', pattern: '^[A-Za-z0-9_-]{3,16}$' } },
      },
    },
  }, async (request, reply) => {
    if (!config.psnNpsso) return reply.code(503).send({ error: 'PlayStation linking is not configured on the server (PSN_NPSSO)' });
    const found = await findPsnAccount(request.query.online_id);
    if (!found) return reply.code(404).send({ error: `No PlayStation account named "${request.query.online_id}"` });
    const linked = await ownerOf(await platformId('psn'), found.accountId);
    return { online_id: found.onlineId, avatar_url: found.avatarUrl, already_linked: Boolean(linked) };
  });

  app.post<{ Body: { online_id: string } }>('/auth/psn/link', {
    schema: {
      body: {
        type: 'object', required: ['online_id'], additionalProperties: false,
        // Online ID: 3–16 caractere, litere, cifre, „-” și „_” (regula Sony).
        properties: { online_id: { type: 'string', pattern: '^[A-Za-z0-9_-]{3,16}$' } },
      },
    },
  }, async (request, reply) => {
    if (!config.psnNpsso) return reply.code(503).send({ error: 'PlayStation linking is not configured on the server (PSN_NPSSO)' });
    const found = await findPsnAccount(request.body.online_id);
    if (!found) return reply.code(404).send({ error: `No PlayStation account named "${request.body.online_id}"` });

    const psn = await platformId('psn');
    if (await ownerOf(psn, found.accountId)) {
      return reply.code(409).send({ error: 'This PlayStation account is already linked to a user' });
    }
    // UNIQUE (user_id, platform_id) → eroare dacă userul are deja un cont PSN.
    const account = await db.insertInto('platform_accounts')
      .values({ user_id: request.user.id, platform_id: psn, external_id: found.accountId, display_name: found.onlineId, avatar_url: found.avatarUrl })
      .returning('id')
      .executeTakeFirst()
      .catch(() => null);
    if (!account) return reply.code(409).send({ error: 'You already have a linked PlayStation account. Unlink it first.' });
    await requestSync(account.id);
    return reply.code(201).send({ id: account.id });
  });

  app.post<{ Body: { client?: Client } }>('/auth/xbox/link', {
    schema: { body: { type: 'object', properties: { client: { enum: ['web', 'app'] } } } },
  }, async (request, reply) => {
    if (!config.xboxClientId || !config.xboxClientSecret) {
      return reply.code(503).send({ error: 'Xbox linking is not configured on the server (XBOX_CLIENT_ID / SECRET)' });
    }
    return { url: xboxAuthorizeUrl(signXboxLinkState(request.user.id, request.body?.client ?? 'web')) };
  });
}

// Rută publică: aici revine browserul de la Microsoft (fără tokenul nostru de acces; userul vine din `state`).
export async function xboxCallbackRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { code?: string; state?: string; error_description?: string } }>('/auth/xbox/callback', async (request, reply) => {
    const state = verifyXboxLinkState(request.query.state ?? '');
    const client: Client = state?.client === 'app' ? 'app' : 'web';
    const back = (fragment: Record<string, string>) =>
      reply.redirect(`${clientTargets[client]()}#${new URLSearchParams(fragment)}`);

    if (!state) return back({ error: 'The link request expired. Please try again.' });
    if (!request.query.code) return back({ error: request.query.error_description ?? 'Microsoft sign-in was cancelled' });

    let xbox;
    try {
      xbox = await linkXboxAccount(request.query.code);
    } catch (error) {
      return back({ error: (error as Error).message });
    }

    const platform = await platformId('xbox');
    const owner = await ownerOf(platform, xbox.xuid);
    if (owner && owner.user_id !== state.userId) return back({ error: 'This Xbox account is already linked to another user' });
    if (!owner) {
      const account = await db.insertInto('platform_accounts')
        .values({
          user_id: state.userId, platform_id: platform, external_id: xbox.xuid, display_name: xbox.gamertag,
          access_token_enc: sql<Buffer>`pgp_sym_encrypt(${xbox.refreshToken}, ${config.tokenEncryptionKey})`,
        })
        .returning('id')
        .executeTakeFirst()
        .catch(() => null);
      if (!account) return back({ error: 'You already have a linked Xbox account. Unlink it first.' });
      await requestSync(account.id);
    }
    return back({ linked: 'xbox' });
  });
}

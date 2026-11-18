// Legarea conturilor PlayStation și Xbox (D55, D57). Sony și Microsoft nu oferă login simplu pentru aplicații terțe,
// așa că serverul citește datele publice cu contul autorului, iar userul își caută contul după nume:
//   GET  /auth/:platform/search?name=…  → contul găsit (nume + avatar), ca userul să-l recunoască;
//   POST /auth/:platform/link {name}    → îl leagă și pornește primul sync (ca la Steam).
// Nu se poate dovedi că numele e al userului; UNIQUE (platform_id, external_id) împiedică totuși ca același cont
// să fie legat la doi useri.
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { db } from '../db/db.js';
import { requestSync } from '../sync/queue.js';
import { findPsnAccount } from '../sync/psn-provider.js';
import { findXboxAccount } from '../sync/xbox-provider.js';

type Found = { accountId: string; name: string; avatarUrl: string | null };

const consoles = {
  psn: {
    label: 'PlayStation',
    configured: () => Boolean(config.psnNpsso),
    missingKey: 'PSN_NPSSO',
    find: async (name: string): Promise<Found | null> => {
      const found = await findPsnAccount(name);
      return found ? { accountId: found.accountId, name: found.onlineId, avatarUrl: found.avatarUrl } : null;
    },
  },
  xbox: {
    label: 'Xbox',
    configured: () => Boolean(config.xboxRefreshToken),
    missingKey: 'XBOX_REFRESH_TOKEN',
    find: findXboxAccount,
  },
};
type Console = keyof typeof consoles;

const params = { type: 'object', required: ['platform'], properties: { platform: { enum: ['psn', 'xbox'] } } };
// Online ID PSN: 3–16 caractere; gamertag Xbox: până la 15, poate avea spații și un sufix „#1234”.
const name = { type: 'string', minLength: 1, maxLength: 20, pattern: '^[A-Za-z0-9_ -]+(#[0-9]{1,4})?$' };

// Contul de pe platformă al userului, după nume; trimite eroarea potrivită dacă nu se poate.
async function lookup(platform: Console, text: string) {
  const target = consoles[platform];
  if (!target.configured()) {
    return { error: 503, message: `${target.label} linking is not configured on the server (${target.missingKey})` } as const;
  }
  const found = await target.find(text.trim());
  if (!found) return { error: 404, message: `No ${target.label} account named "${text.trim()}"` } as const;
  const platformId = (await db.selectFrom('platforms').select('id').where('code', '=', platform).executeTakeFirstOrThrow()).id;
  const owner = await db.selectFrom('platform_accounts').select('user_id')
    .where('platform_id', '=', platformId).where('external_id', '=', found.accountId).executeTakeFirst();
  return { found, platformId, linked: Boolean(owner) };
}

// Rute protejate (cer token de acces).
export async function consoleLinkRoutes(app: FastifyInstance) {
  app.get<{ Params: { platform: Console }; Querystring: { name: string } }>('/auth/:platform/search', {
    schema: { params, querystring: { type: 'object', required: ['name'], properties: { name } } },
  }, async (request, reply) => {
    const result = await lookup(request.params.platform, request.query.name);
    if (result.error) return reply.code(result.error).send({ error: result.message });
    return { name: result.found.name, avatar_url: result.found.avatarUrl, already_linked: result.linked };
  });

  app.post<{ Params: { platform: Console }; Body: { name: string } }>('/auth/:platform/link', {
    schema: { params, body: { type: 'object', required: ['name'], additionalProperties: false, properties: { name } } },
  }, async (request, reply) => {
    const { platform } = request.params;
    const result = await lookup(platform, request.body.name);
    if (result.error) return reply.code(result.error).send({ error: result.message });
    const label = consoles[platform].label;
    if (result.linked) return reply.code(409).send({ error: `This ${label} account is already linked to a user` });

    // UNIQUE (user_id, platform_id) → eroare dacă userul are deja un cont pe platforma asta.
    const account = await db.insertInto('platform_accounts')
      .values({
        user_id: request.user.id, platform_id: result.platformId, external_id: result.found.accountId,
        display_name: result.found.name, avatar_url: result.found.avatarUrl,
      })
      .returning('id')
      .executeTakeFirst()
      .catch(() => null);
    if (!account) return reply.code(409).send({ error: `You already have a linked ${label} account. Unlink it first.` });
    await requestSync(account.id);
    return reply.code(201).send({ id: account.id });
  });
}

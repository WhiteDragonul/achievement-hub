// Login și legarea contului Steam (OpenID 2.0, D38, D47). Steam nu dă parole sau tokenuri: confirmă doar
// „acesta e SteamID-ul X”.
//  1. /auth/steam            → redirect către pagina de login Steam;
//  2. Steam trimite userul înapoi la /auth/steam/callback cu parametrii semnați;
//  3. îi retrimitem la Steam (check_authentication) ca să confirme că nu au fost falsificați;
//  4a. login: găsim userul după contul Steam legat sau creăm unul nou, apoi trimitem tokenurile clientului;
//  4b. legare (parametrul `link`): adăugăm contul Steam userului deja logat.
// În ambele cazuri contul Steam nou legat primește automat o primă sincronizare (jocuri + achievement-uri).
import type { FastifyInstance } from 'fastify';
import { createSession, signSteamLinkState, verifySteamLinkState } from '../auth.js';
import { config } from '../config.js';
import { db } from '../db/db.js';
import { requestSync } from '../sync/queue.js';
import { fetchSteamPersona } from '../sync/steam-provider.js';

const STEAM_OPENID = 'https://steamcommunity.com/openid/login';

// Doar aceste destinații sunt permise după login (fără „open redirect” către un site oarecare).
const clientTargets = {
  web: () => `${config.webUrl}/auth/callback`,
  app: () => 'achievementhub://auth/callback', // deep-link-ul aplicației Tauri
};
type Client = keyof typeof clientTargets;

type CallbackQuery = Record<string, string> & { client?: Client; link?: string };

function steamLoginUrl(client: Client, link?: string): string {
  const returnTo = new URL(`${config.publicApiUrl}/api/auth/steam/callback`);
  returnTo.searchParams.set('client', client);
  if (link) returnTo.searchParams.set('link', link);
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo.toString(),
    'openid.realm': config.publicApiUrl,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });
  return `${STEAM_OPENID}?${params}`;
}

// Pasul 3: Steam confirmă semnătura; întoarce SteamID64 sau null.
async function verifySteamResponse(query: Record<string, string>): Promise<string | null> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith('openid.')) params.set(key, value);
  }
  params.set('openid.mode', 'check_authentication');
  const check = await fetch(STEAM_OPENID, { method: 'POST', body: params });
  if (!(await check.text()).includes('is_valid:true')) return null;
  return /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(query['openid.claimed_id'] ?? '')?.[1] ?? null;
}

// Rute publice (fără token de acces): login-ul și întoarcerea de la Steam.
export async function steamAuthRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { client?: Client; link?: string } }>('/auth/steam', {
    schema: {
      querystring: { type: 'object', properties: { client: { enum: ['web', 'app'] }, link: { type: 'string' } } },
    },
  }, async (request, reply) => reply.redirect(steamLoginUrl(request.query.client ?? 'web', request.query.link)));

  app.get<{ Querystring: CallbackQuery }>('/auth/steam/callback', async (request, reply) => {
    const client: Client = request.query.client === 'app' ? 'app' : 'web';
    const back = (fragment: Record<string, string>) =>
      reply.redirect(`${clientTargets[client]()}#${new URLSearchParams(fragment)}`);
    const fail = (message: string) => back({ error: message });

    const steamid = await verifySteamResponse(request.query);
    if (!steamid) return fail('Invalid Steam sign-in');

    const steam = await db.selectFrom('platforms').select('id').where('code', '=', 'steam').executeTakeFirstOrThrow();
    const owner = await db.selectFrom('platform_accounts')
      .innerJoin('users', 'users.id', 'platform_accounts.user_id')
      .select(['users.id', 'users.role', 'users.username', 'users.is_banned'])
      .where('platform_accounts.platform_id', '=', steam.id)
      .where('platform_accounts.external_id', '=', steamid)
      .executeTakeFirst();

    // ---- 4b. Legare la userul logat ----
    if (request.query.link !== undefined) {
      const userId = verifySteamLinkState(request.query.link);
      if (!userId) return fail('The link request expired. Please try again.');
      if (owner && owner.id !== userId) return fail('This Steam account is already linked to another user');
      if (!owner) {
        const persona = await fetchSteamPersona(steamid);
        const account = await db.transaction().execute(async (trx) => {
          // UNIQUE (user_id, platform_id) → eroare dacă userul are deja alt cont Steam legat.
          const created = await trx.insertInto('platform_accounts')
            .values({ user_id: userId, platform_id: steam.id, external_id: steamid, display_name: persona?.name ?? steamid, avatar_url: persona?.avatar ?? null })
            .returning('id')
            .executeTakeFirstOrThrow();
          // Avatarul Steam devine avatarul profilului, doar dacă userul nu are deja unul.
          if (persona?.avatar) {
            await trx.updateTable('users').set({ avatar_url: persona.avatar })
              .where('id', '=', userId).where('avatar_url', 'is', null).execute();
          }
          return created;
        }).catch(() => null);
        if (!account) return fail('You already have a linked Steam account. Unlink it first.');
        await requestSync(account.id);
      }
      return back({ linked: 'steam' });
    }

    // ---- 4a. Login ----
    let user = owner;
    if (!user) {
      // Cont nou, fără email și fără parolă (permis de schemă: users_password_needs_email_chk).
      const persona = await fetchSteamPersona(steamid);
      const created = await db.transaction().execute(async (trx) => {
        const newUser = await trx.insertInto('users')
          .values({ username: `steam_${steamid}`, display_name: persona?.name ?? null, avatar_url: persona?.avatar ?? null })
          .returning(['id', 'role', 'username', 'is_banned'])
          .executeTakeFirstOrThrow();
        const account = await trx.insertInto('platform_accounts')
          .values({ user_id: newUser.id, platform_id: steam.id, external_id: steamid, display_name: persona?.name ?? steamid, avatar_url: persona?.avatar ?? null })
          .returning('id')
          .executeTakeFirstOrThrow();
        return { newUser, accountId: account.id };
      });
      await requestSync(created.accountId);
      user = created.newUser;
    }
    if (user.is_banned) return fail('This account is suspended');

    const session = await createSession({ id: user.id, role: user.role, username: user.username }, request.headers['user-agent']);
    // Tokenurile merg în fragmentul URL-ului (#...): browserul nu îl trimite la niciun server și nu apare în loguri.
    return back({ access_token: session.access_token, refresh_token: session.refresh_token });
  });
}

// Rută protejată (cere token de acces): întoarce adresa la care clientul trimite userul ca să-și lege contul Steam.
export async function steamLinkRoutes(app: FastifyInstance) {
  app.post<{ Body: { client?: Client } }>('/auth/steam/link', {
    schema: { body: { type: 'object', properties: { client: { enum: ['web', 'app'] } } } },
  }, async (request) => ({
    url: `${config.publicApiUrl}/api/auth/steam?${new URLSearchParams({
      client: request.body?.client ?? 'web',
      link: signSteamLinkState(request.user.id),
    })}`,
  }));
}

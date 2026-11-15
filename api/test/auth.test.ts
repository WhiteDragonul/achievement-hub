// Teste pentru autentificare (register / login / refresh / logout) și regulile pe roluri.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './setup.js';

let ctx: Awaited<ReturnType<typeof startTestApp>>;

before(async () => {
  ctx = await startTestApp();
});
after(async () => {
  await ctx.stop();
});

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object, token?: string) {
  const response = await ctx.app.inject({
    method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: response.statusCode, body: response.body ? response.json() : undefined };
}

describe('autentificare', () => {
  test('register → login → me → refresh (rotație) → logout', async () => {
    const registered = await call('POST', '/api/auth/register', { username: 'dana', email: 'dana@test.ro', password: 'parola-sigura' });
    assert.equal(registered.status, 201);
    assert.equal(registered.body.user.role, 'user', 'contul nou are mereu rolul user');

    const { rows } = await ctx.pool.query('SELECT token_hash FROM refresh_tokens WHERE user_id = $1', [registered.body.user.id]);
    assert.equal(rows[0].token_hash.length, 32, 'în DB e doar sha256 (32 de octeți), nu tokenul');

    assert.equal((await call('POST', '/api/auth/login', { email: 'dana@test.ro', password: 'gresit' })).status, 401);
    const login = await call('POST', '/api/auth/login', { email: 'DANA@test.ro', password: 'parola-sigura' });
    assert.equal(login.status, 200);

    const me = await call('GET', '/api/auth/me', undefined, login.body.access_token);
    assert.equal(me.body.username, 'dana');

    const refreshed = await call('POST', '/api/auth/refresh', { refresh_token: login.body.refresh_token });
    assert.equal(refreshed.status, 200);
    assert.notEqual(refreshed.body.refresh_token, login.body.refresh_token);

    // Tokenul vechi a fost revocat la rotație; refolosirea lui revocă toate sesiunile (inclusiv cea nouă).
    assert.equal((await call('POST', '/api/auth/refresh', { refresh_token: login.body.refresh_token })).status, 401);
    assert.equal((await call('POST', '/api/auth/refresh', { refresh_token: refreshed.body.refresh_token })).status, 401);

    const again = await call('POST', '/api/auth/login', { email: 'dana@test.ro', password: 'parola-sigura' });
    assert.equal((await call('POST', '/api/auth/logout', { refresh_token: again.body.refresh_token })).status, 204);
    assert.equal((await call('POST', '/api/auth/refresh', { refresh_token: again.body.refresh_token })).status, 401);
  });

  test('fără token sau cu token falsificat → 401', async () => {
    assert.equal((await call('GET', '/api/games')).status, 401);
    const forged = ctx.adminToken.slice(0, -2) + 'xx';
    assert.equal((await call('GET', '/api/games', undefined, forged)).status, 401);
  });
});

describe('roluri', () => {
  let user: string;
  let other: string;
  let moderator: string;
  let ids: { user: number; other: number };

  before(async () => {
    const a = await call('POST', '/api/auth/register', { username: 'user_a', email: 'a@test.ro', password: 'parola-sigura' });
    const b = await call('POST', '/api/auth/register', { username: 'user_b', email: 'b@test.ro', password: 'parola-sigura' });
    const m = await call('POST', '/api/auth/register', { username: 'mod_m', email: 'm@test.ro', password: 'parola-sigura' });
    await call('PATCH', `/api/users/${m.body.user.id}`, { role: 'moderator' }, ctx.adminToken);
    user = a.body.access_token;
    other = b.body.access_token;
    // Rolul nou apare în token după refresh (rolul se citește din DB la fiecare refresh).
    moderator = (await call('POST', '/api/auth/refresh', { refresh_token: m.body.refresh_token })).body.access_token;
    ids = { user: a.body.user.id, other: b.body.user.id };
  });

  test('userul își modifică doar profilul propriu și nu își poate da alt rol', async () => {
    assert.equal((await call('PATCH', `/api/users/${ids.user}`, { display_name: 'A' }, user)).status, 200);
    assert.equal((await call('PATCH', `/api/users/${ids.other}`, { display_name: 'X' }, user)).status, 403);
    assert.equal((await call('PATCH', `/api/users/${ids.user}`, { role: 'admin' }, user)).status, 403);
    assert.equal((await call('GET', `/api/users/${ids.other}`, undefined, user)).body.email, null, 'emailul altuia e ascuns');
  });

  test('catalogul (platforme, jocuri) se modifică doar de admin', async () => {
    assert.equal((await call('POST', '/api/games', { platform_id: 1, external_id: '1', title: 'X' }, user)).status, 403);
    assert.equal((await call('POST', '/api/games', { platform_id: 1, external_id: '1', title: 'X' }, ctx.adminToken)).status, 201);
  });

  test('conturile de platformă se leagă doar pentru tine', async () => {
    const forOther = await call('POST', '/api/platform-accounts', {
      user_id: ids.other, platform_id: 2, external_id: 'psn-b', display_name: 'b',
    }, user);
    assert.equal(forOther.status, 403);
    const own = await call('POST', '/api/platform-accounts', {
      user_id: ids.user, platform_id: 2, external_id: 'psn-a', display_name: 'a',
    }, user);
    assert.equal(own.status, 201);
    assert.equal((await call('DELETE', `/api/platform-accounts/${own.body.id}`, undefined, other)).status, 403);
  });

  test('raportările: userul raportează, moderatorul vede și suspendă', async () => {
    const report = await call('POST', '/api/reports', { reporter_id: ids.user, target_user_id: ids.other, reason: 'Profil suspect' }, user);
    assert.equal(report.status, 201);
    assert.equal((await call('GET', '/api/reports', undefined, user)).status, 403);
    assert.equal((await call('GET', '/api/reports', undefined, moderator)).status, 200);

    assert.equal((await call('PATCH', `/api/users/${ids.other}`, { is_banned: true }, user)).status, 403);
    assert.equal((await call('PATCH', `/api/users/${ids.other}`, { is_banned: true }, moderator)).status, 200);
    // Contul suspendat nu se mai poate loga.
    assert.equal((await call('POST', '/api/auth/login', { email: 'b@test.ro', password: 'parola-sigura' })).status, 403);
    assert.equal((await call('DELETE', `/api/reports/${report.body.id}`, undefined, moderator)).status, 403);
    assert.equal((await call('GET', '/api/stats', undefined, moderator)).status, 403);
  });
});

// Teste pentru personalizarea profilului (009) și legarea contului Steam (D45–D47).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './setup.js';

let ctx: Awaited<ReturnType<typeof startTestApp>>;
let userId: number;
let userToken: string;
const ids = {} as Record<'game' | 'otherGame' | 'unlocked' | 'locked', number>;

async function call(method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: object, token = ctx.adminToken) {
  const response = await ctx.app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
  return { status: response.statusCode, body: response.body ? response.json() : null };
}

before(async () => {
  ctx = await startTestApp();
  const steam = (await call('GET', '/api/platforms')).body.find((p: { code: string }) => p.code === 'steam');
  userId = (await call('POST', '/api/users', { username: 'customizer' })).body.id;
  userToken = ctx.signAccessToken({ id: userId, role: 'user', username: 'customizer' });

  ids.game = (await call('POST', '/api/games', { platform_id: steam.id, external_id: '500', title: 'Portal' })).body.id;
  ids.otherGame = (await call('POST', '/api/games', { platform_id: steam.id, external_id: '501', title: 'Neavut' })).body.id;
  ids.unlocked = (await call('POST', '/api/achievements', { game_id: ids.game, external_id: 'a', name: 'A' })).body.id;
  ids.locked = (await call('POST', '/api/achievements', { game_id: ids.game, external_id: 'b', name: 'B' })).body.id;

  // Contul Steam îl leagă adminul (userul obișnuit ar trebui să treacă prin login Steam).
  const account = (await call('POST', '/api/platform-accounts', {
    user_id: userId, platform_id: steam.id, external_id: '76561197960265730', display_name: 'customizer',
  })).body.id;
  await call('POST', '/api/user-games', { platform_account_id: account, game_id: ids.game, playtime_minutes: 120 });
  await call('POST', '/api/user-achievements', { platform_account_id: account, achievement_id: ids.unlocked });
});

after(async () => {
  await ctx.stop();
});

test('userul își personalizează profilul; valorile din afara listei sunt respinse', async () => {
  const ok = await call('PATCH', `/api/users/${userId}`, {
    bio: 'Vânez achievement-uri rare.', accent_color: 'rose', banner: 'sunset', favorite_game_id: ids.game,
  }, userToken);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.accent_color, 'rose');

  assert.equal((await call('PATCH', `/api/users/${userId}`, { accent_color: 'mov' }, userToken)).status, 400);
  // Avatarul doar prin https (CHECK users_avatar_url_chk).
  assert.equal((await call('PATCH', `/api/users/${userId}`, { avatar_url: 'javascript:alert(1)' }, userToken)).status, 400);
  // Jocul preferat trebuie să fie în bibliotecă.
  assert.equal((await call('PATCH', `/api/users/${userId}`, { favorite_game_id: ids.otherGame }, userToken)).status, 400);
});

test('vitrina acceptă doar achievement-uri deblocate și apare în profil', async () => {
  assert.equal((await call('PUT', `/api/users/${userId}/showcase`, { achievement_ids: [ids.locked] }, userToken)).status, 400);
  assert.equal((await call('PUT', `/api/users/${userId}/showcase`, { achievement_ids: [ids.unlocked] }, userToken)).status, 204);

  const profile = await call('GET', `/api/users/${userId}/profile`, undefined, userToken);
  assert.deepEqual(profile.body.showcase.map((item: { id: number }) => item.id), [ids.unlocked]);
  assert.equal(profile.body.favorite_game.title, 'Portal');
  assert.equal(Number(profile.body.totals.games), 1);

  // Altcineva nu poate modifica vitrina userului.
  const other = ctx.signAccessToken({ id: userId + 1, role: 'user', username: 'altul' });
  assert.equal((await call('PUT', `/api/users/${userId}/showcase`, { achievement_ids: [] }, other)).status, 403);
});

test('Steam se leagă doar prin login Steam; tokenul de legare nu e token de acces', async () => {
  const steam = (await call('GET', '/api/platforms')).body.find((p: { code: string }) => p.code === 'steam');
  const other = (await call('POST', '/api/users', { username: 'manual_linker' })).body.id;
  const otherToken = ctx.signAccessToken({ id: other, role: 'user', username: 'manual_linker' });
  const manual = await call('POST', '/api/platform-accounts', {
    user_id: other, platform_id: steam.id, external_id: '76561197960265731', display_name: 'x',
  }, otherToken);
  assert.equal(manual.status, 403);

  const link = await call('POST', '/api/auth/steam/link', { client: 'web' }, otherToken);
  assert.equal(link.status, 200);
  const state = new URL(link.body.url).searchParams.get('link')!;
  // Tokenul „state” e semnat cu aceeași cheie, dar nu deschide API-ul.
  assert.equal((await call('GET', '/api/auth/me', undefined, state)).status, 401);
});

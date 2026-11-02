// Teste pentru rutele de citire agregate (clasament, profil, bibliotecă, achievement-urile unui joc).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './setup.js';

let ctx: Awaited<ReturnType<typeof startTestApp>>;
const ids = {} as Record<'alice' | 'bob' | 'carol' | 'game' | 'aliceAccount' | 'ultra' | 'very' | 'common', number>;

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) {
  const response = await ctx.app.inject({ method, url, payload });
  return { status: response.statusCode, body: response.json() };
}

// Date mici, cu scoruri ușor de calculat de mână:
// alice: ultra_rare (50) + very_rare (20) = 70; bob: common (1); carol: ascunsă din clasamente.
before(async () => {
  ctx = await startTestApp();
  const steam = (await call('GET', '/api/platforms')).body.find((p: { code: string }) => p.code === 'steam');

  for (const name of ['alice', 'bob', 'carol'] as const) {
    ids[name] = (await call('POST', '/api/users', { username: name })).body.id;
  }
  await call('PATCH', `/api/users/${ids.carol}`, { hidden_from_leaderboards: true });

  ids.game = (await call('POST', '/api/games', { platform_id: steam.id, external_id: '10', title: 'Counter' })).body.id;
  for (const [key, pct] of [['ultra', 0.5], ['very', 3], ['common', 60]] as const) {
    ids[key] = (await call('POST', '/api/achievements', {
      game_id: ids.game, external_id: key, name: key, global_unlock_pct: pct,
    })).body.id;
  }

  const unlocks = { alice: ['ultra', 'very'], bob: ['common'], carol: ['ultra', 'very', 'common'] } as const;
  for (const name of ['alice', 'bob', 'carol'] as const) {
    const account = (await call('POST', '/api/platform-accounts', {
      user_id: ids[name], platform_id: steam.id, external_id: `steam-${name}`, display_name: name,
    })).body.id;
    if (name === 'alice') ids.aliceAccount = account;
    await call('POST', '/api/user-games', { platform_account_id: account, game_id: ids.game, playtime_minutes: 60 });
    for (const achievement of unlocks[name]) {
      await call('POST', '/api/user-achievements', { platform_account_id: account, achievement_id: ids[achievement] });
    }
  }
  await call('POST', '/api/friendships', { requester_id: ids.bob, addressee_id: ids.alice });
  await call('PATCH', `/api/friendships/${ids.bob}/${ids.alice}`, { status: 'accepted' });
});
after(async () => {
  await ctx.stop();
});

test('clasamentul ordonează după scorul ponderat cu raritatea și exclude userii ascunși', async () => {
  const { body } = await call('GET', '/api/leaderboard');
  assert.deepEqual(
    body.map((row: { username: string; score: number; rank: number }) => [row.rank, row.username, row.score]),
    [[1, 'alice', 70], [2, 'bob', 1]],
  );
  assert.equal(body[0].rare_achievements, 2);
});

test('clasamentul între prieteni', async () => {
  const { body } = await call('GET', `/api/leaderboard?friends_of=${ids.bob}`);
  assert.deepEqual(body.map((row: { username: string }) => row.username), ['alice', 'bob']);
});

test('profilul are conturile și numărul de achievement-uri pe raritate', async () => {
  const { body } = await call('GET', `/api/users/${ids.alice}/profile`);
  assert.equal(body.user.username, 'alice');
  assert.equal(body.accounts[0].platform_code, 'steam');
  assert.equal(body.accounts[0].achievements, 2);
  assert.deepEqual(body.rarity_counts, { ultra_rare: 1, very_rare: 1 });
  assert.equal((await call('GET', '/api/users/999999/profile')).status, 404);
});

test('biblioteca arată progresul pe fiecare joc', async () => {
  const { body } = await call('GET', `/api/users/${ids.alice}/games`);
  assert.equal(body.length, 1);
  assert.equal(body[0].unlocked_achievements, 2);
  assert.equal(body[0].total_achievements, 3);
});

test('achievement-urile unui joc marchează ce a deblocat userul', async () => {
  const { body } = await call('GET', `/api/games/${ids.game}/achievements?user_id=${ids.alice}`);
  assert.equal(body.platform_account_id, ids.aliceAccount);
  assert.equal(body.owns_game, true);
  const unlocked = body.achievements.filter((a: { unlocked_at: string | null }) => a.unlocked_at).map((a: { name: string }) => a.name);
  assert.deepEqual(unlocked.sort(), ['ultra', 'very']);
});

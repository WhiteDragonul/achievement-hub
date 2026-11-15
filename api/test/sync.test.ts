// Test pentru sync cu MockProvider: datele ajung în user_games / user_achievements, iar un al doilea sync nu dublează nimic.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './setup.js';

let ctx: Awaited<ReturnType<typeof startTestApp>>;

before(async () => {
  ctx = await startTestApp();
});
after(async () => {
  await ctx.stop();
});

async function call(method: 'GET' | 'POST', url: string, payload?: object) {
  const response = await ctx.app.inject({ method, url, payload, headers: { authorization: `Bearer ${ctx.adminToken}` } });
  return response.json();
}

test('sync mock: queued → succeeded, idempotent la a doua rulare', async () => {
  const psn = (await call('GET', '/api/platforms')).find((p: { code: string }) => p.code === 'psn');
  // Un catalog PSN mic: 40 de jocuri cu câte 5 achievement-uri comune (60% îl au).
  for (let i = 1; i <= 40; i++) {
    const game = await call('POST', '/api/games', { platform_id: psn.id, external_id: `NPWR${i}`, title: `Joc ${i}` });
    for (let j = 1; j <= 5; j++) {
      await call('POST', '/api/achievements', { game_id: game.id, external_id: `t${j}`, name: `Trofeu ${j}`, global_unlock_pct: 60 });
    }
  }
  const user = await call('POST', '/api/users', { username: 'syncer' });
  const account = await call('POST', '/api/platform-accounts', {
    user_id: user.id, platform_id: psn.id, external_id: 'psn-syncer', display_name: 'syncer',
  });

  const { runSync } = await import('../src/sync/sync.js');
  const first = await call('POST', '/api/sync-runs', { platform_account_id: account.id });
  assert.equal(first.status, 'queued');
  await runSync(first.id);

  const done = await call('GET', `/api/sync-runs/${first.id}`);
  assert.equal(done.status, 'succeeded', done.error_message);
  assert.ok(done.games_synced > 0);
  assert.ok(done.achievements_synced > 0);

  const { rows } = await ctx.pool.query('SELECT count(*)::int AS n FROM user_achievements WHERE platform_account_id = $1', [account.id]);
  assert.equal(rows[0].n, done.achievements_synced);

  const second = await call('POST', '/api/sync-runs', { platform_account_id: account.id });
  await runSync(second.id);
  const again = await call('GET', `/api/sync-runs/${second.id}`);
  assert.equal(again.status, 'succeeded');
  assert.equal(again.games_synced, done.games_synced, 'același cont → aceeași bibliotecă');
  assert.equal(again.achievements_synced, 0, 'nimic nou de deblocat');
});

test('rapoarte: CSV (COPY), Excel și PDF', async () => {
  const user = (await ctx.pool.query("SELECT id FROM users WHERE username = 'syncer'")).rows[0];
  const get = (url: string) => ctx.app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${ctx.adminToken}` } });

  const csv = await get(`/api/exports/users/${user.id}/achievements.csv`);
  assert.equal(csv.statusCode, 200);
  const lines = csv.body.trim().split('\n');
  assert.equal(lines[0], 'platforma,joc,achievement,raritate,procent_global,deblocat_la');
  assert.ok(lines.length > 1);

  const xlsx = await get(`/api/exports/users/${user.id}/library.xlsx`);
  assert.equal(xlsx.statusCode, 200);
  assert.equal(xlsx.rawPayload.subarray(0, 2).toString(), 'PK', 'fișierul .xlsx e o arhivă zip');

  const pdf = await get('/api/exports/overview.pdf');
  assert.equal(pdf.statusCode, 200);
  assert.equal(pdf.rawPayload.subarray(0, 5).toString(), '%PDF-');

  // Raportul altui user nu e accesibil unui user obișnuit.
  const other = ctx.signAccessToken({ id: user.id + 999, role: 'user', username: 'x' });
  const denied = await ctx.app.inject({ method: 'GET', url: `/api/exports/users/${user.id}/library.xlsx`, headers: { authorization: `Bearer ${other}` } });
  assert.equal(denied.statusCode, 403);
});

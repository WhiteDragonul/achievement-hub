// Teste de integrare pentru CRUD: cereri HTTP reale (app.inject) pe un Postgres real (PGlite).
// Pe lângă operațiile de bază, verifică faptul că regulile din baza de date ajung la client ca erori HTTP corecte.
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

// Mic ajutor ca testele să rămână scurte: trimite cererea și întoarce status + body parsat.
async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) {
  const response = await ctx.app.inject({ method, url, payload });
  return { status: response.statusCode, body: response.body ? response.json() : undefined };
}

describe('users', () => {
  test('create, read, update, delete', async () => {
    const created = await call('POST', '/api/users', { username: 'Ana', email: 'ana@test.ro', password: 'parola-lunga' });
    assert.equal(created.status, 201);
    assert.equal(created.body.role, 'user');
    assert.equal(created.body.password_hash, undefined, 'hash-ul parolei nu iese din API');

    const { rows } = await ctx.pool.query('SELECT password_hash FROM users WHERE id = $1', [created.body.id]);
    assert.match(rows[0].password_hash, /^\$argon2id\$/, 'parola e stocată ca hash argon2');

    const read = await call('GET', `/api/users/${created.body.id}`);
    assert.equal(read.body.username, 'Ana');

    const updated = await call('PATCH', `/api/users/${created.body.id}`, { display_name: 'Ana P.', role: 'moderator' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.role, 'moderator');

    assert.equal((await call('DELETE', `/api/users/${created.body.id}`)).status, 204);
    assert.equal((await call('GET', `/api/users/${created.body.id}`)).status, 404);
  });

  test('username unic fără să conteze literele mari → 409 cu numele constrângerii', async () => {
    await call('POST', '/api/users', { username: 'bogdan' });
    const duplicate = await call('POST', '/api/users', { username: 'BOGDAN' });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.constraint, 'users_username_lower_uq');
  });

  test('validări: schema JSON (400) și CHECK din DB (400)', async () => {
    assert.equal((await call('POST', '/api/users', { username: 'x1', role: 'root' })).status, 400); // enum din schema
    const badUsername = await call('POST', '/api/users', { username: 'a b' }); // regex din CHECK
    assert.equal(badUsername.status, 400);
    assert.equal(badUsername.body.constraint, 'users_username_format_chk');
  });

  test('listă cu căutare și paginare', async () => {
    const list = await call('GET', '/api/users?search=BOG&limit=5');
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.map((u: { username: string }) => u.username), ['bogdan']);
  });
});

describe('platforme, conturi, jocuri, achievement-uri, progres', () => {
  test('flux complet + cascade la dezlegarea contului', async () => {
    const platforms = await call('GET', '/api/platforms');
    assert.equal(platforms.body.length, 4);
    const psn = platforms.body.find((p: { code: string }) => p.code === 'psn');

    const user = (await call('POST', '/api/users', { username: 'gamer' })).body;
    const account = await call('POST', '/api/platform-accounts', {
      user_id: user.id, platform_id: psn.id, external_id: 'psn-123', display_name: 'gamer', access_token: 'secret',
    });
    assert.equal(account.status, 201);
    assert.equal(account.body.has_access_token, true);

    // Tokenul e salvat criptat și se poate decripta doar cu cheia corectă.
    const { rows } = await ctx.pool.query(
      `SELECT pgp_sym_decrypt(access_token_enc, 'cheie-de-test') AS token FROM platform_accounts WHERE id = $1`,
      [account.body.id],
    );
    assert.equal(rows[0].token, 'secret');

    // Al doilea cont PSN pentru același user → 409 (UNIQUE user_id, platform_id).
    const second = await call('POST', '/api/platform-accounts', {
      user_id: user.id, platform_id: psn.id, external_id: 'psn-999', display_name: 'alt',
    });
    assert.equal(second.status, 409);

    const game = (await call('POST', '/api/games', { platform_id: psn.id, external_id: 'NPWR1', title: 'Test Game' })).body;
    const rare = await call('POST', '/api/achievements', {
      game_id: game.id, external_id: 'A1', name: 'Rar', global_unlock_pct: 0.5,
    });
    assert.equal(rare.body.rarity, 'ultra_rare', 'raritatea e calculată de coloana generată');
    assert.equal((await call('POST', '/api/achievements', {
      game_id: game.id, external_id: 'A2', name: 'Imposibil', global_unlock_pct: 150,
    })).status, 400);

    // Schimbarea procentului recalculează raritatea.
    const patched = await call('PATCH', `/api/achievements/${rare.body.id}`, { global_unlock_pct: 50 });
    assert.equal(patched.body.rarity, 'common');

    assert.equal((await call('GET', `/api/games/${game.id}`)).body.achievements_count, 1);

    assert.equal((await call('POST', '/api/user-games', {
      platform_account_id: account.body.id, game_id: game.id, playtime_minutes: 90,
    })).status, 201);
    assert.equal((await call('POST', '/api/user-achievements', {
      platform_account_id: account.body.id, achievement_id: rare.body.id,
    })).status, 201);
    // Același achievement de două ori → 409 (cheie primară compusă).
    assert.equal((await call('POST', '/api/user-achievements', {
      platform_account_id: account.body.id, achievement_id: rare.body.id,
    })).status, 409);
    // Data 0 de la Steam (1970) → 400 (CHECK D12).
    assert.equal((await call('PATCH', `/api/user-achievements/${account.body.id}/${rare.body.id}`, {
      unlocked_at: '1970-01-01T00:00:00Z',
    })).status, 400);

    const unlocked = await call('GET', `/api/user-achievements?platform_account_id=${account.body.id}`);
    assert.equal(unlocked.body[0].game_title, 'Test Game');

    // Platforma folosită nu poate fi ștearsă (ON DELETE RESTRICT) → 409.
    assert.equal((await call('DELETE', `/api/platforms/${psn.id}`)).status, 409);

    // Dezlegarea contului șterge progresul în cascadă.
    assert.equal((await call('DELETE', `/api/platform-accounts/${account.body.id}`)).status, 204);
    const left = await ctx.pool.query('SELECT count(*)::int AS n FROM user_achievements');
    assert.equal(left.rows[0].n, 0);
  });
});

describe('sync runs', () => {
  test('failed fără mesaj de eroare → 400 (CHECK)', async () => {
    const steam = (await call('GET', '/api/platforms')).body.find((p: { code: string }) => p.code === 'steam');
    const user = (await call('POST', '/api/users', { username: 'syncer' })).body;
    const account = (await call('POST', '/api/platform-accounts', {
      user_id: user.id, platform_id: steam.id, external_id: '76561197960265729', display_name: 'syncer',
    })).body;

    const run = await call('POST', '/api/sync-runs', { platform_account_id: account.id });
    assert.equal(run.body.status, 'queued');
    assert.equal((await call('PATCH', `/api/sync-runs/${run.body.id}`, { status: 'failed' })).status, 400);
    const failed = await call('PATCH', `/api/sync-runs/${run.body.id}`, { status: 'failed', error_message: 'timeout' });
    assert.equal(failed.status, 200);
  });
});

describe('prietenii și raportări', () => {
  test('cererea inversă e respinsă, acceptarea completează responded_at', async () => {
    const a = (await call('POST', '/api/users', { username: 'alice' })).body;
    const b = (await call('POST', '/api/users', { username: 'bob' })).body;

    assert.equal((await call('POST', '/api/friendships', { requester_id: a.id, addressee_id: b.id })).status, 201);
    const reverse = await call('POST', '/api/friendships', { requester_id: b.id, addressee_id: a.id });
    assert.equal(reverse.status, 409);
    assert.equal(reverse.body.constraint, 'friendships_pair_uq');
    assert.equal((await call('POST', '/api/friendships', { requester_id: a.id, addressee_id: a.id })).status, 400);

    const accepted = await call('PATCH', `/api/friendships/${a.id}/${b.id}`, { status: 'accepted' });
    assert.equal(accepted.body.status, 'accepted');
    assert.ok(accepted.body.responded_at);

    const list = await call('GET', `/api/friendships?user_id=${b.id}`);
    assert.equal(list.body[0].requester_username, 'alice');
  });

  test('raportare rezolvată → ținta e ascunsă din clasamente (tranzacție)', async () => {
    const reporter = (await call('POST', '/api/users', { username: 'reporter' })).body;
    const cheater = (await call('POST', '/api/users', { username: 'cheater' })).body;
    const moderator = (await call('POST', '/api/users', { username: 'mod1', role: 'moderator' })).body;

    const report = await call('POST', '/api/reports', {
      reporter_id: reporter.id, target_user_id: cheater.id, reason: 'Achievement-uri imposibile',
    });
    assert.equal(report.body.status, 'open');

    const resolved = await call('PATCH', `/api/reports/${report.body.id}`, {
      status: 'resolved', resolved_by: moderator.id, resolution_note: 'confirmat',
    });
    assert.equal(resolved.status, 200);
    assert.ok(resolved.body.resolved_at);
    assert.equal((await call('GET', `/api/users/${cheater.id}`)).body.hidden_from_leaderboards, true);
  });
});

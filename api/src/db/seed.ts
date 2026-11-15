// Încarcă fixtures (db/fixtures/seed.sql) dacă baza nu are încă utilizatori.
import fs from 'node:fs/promises';
import path from 'node:path';
import argon2 from 'argon2';
import { config } from '../config.js';
import { refreshLeaderboard } from './leaderboard.js';
import { pool } from './db.js';

const SEED_FILE = path.resolve(import.meta.dirname, '../../../db/fixtures/seed.sql');

const COUNTED_TABLES = [
  'users', 'platform_accounts', 'games', 'achievements', 'user_games',
  'user_achievements', 'friendships', 'reports', 'sync_runs',
];

export async function seedIfEmpty(): Promise<void> {
  const { rows } = await pool.query<{ n: number }>('SELECT count(*) AS n FROM users');
  if (rows[0].n > 0) {
    console.log('[seed] baza are deja utilizatori, sar peste fixtures');
    return;
  }

  const seedSql = await fs.readFile(SEED_FILE, 'utf8');
  // Un singur hash pentru toți userii de test: argon2 e lent intenționat (~50 ms/hash),
  // 5.000 de hash-uri separate ar adăuga câteva minute la pornire.
  const passwordHash = await argon2.hash(config.fixturePassword);

  console.log('[seed] generez fixtures (poate dura până la un minut)...');
  const startedAt = Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Parametrii pentru seed.sql. Al treilea argument (true) = valabili doar în tranzacția curentă.
    await client.query(
      `SELECT set_config('seed.password_hash', $1, true), set_config('seed.token_key', $2, true)`,
      [passwordHash, config.tokenEncryptionKey],
    );
    // Generarea durează mai mult decât timeout-ul implicit pe care îl pot avea conexiunile (ex. pe Supabase).
    await client.query('SET LOCAL statement_timeout = 0');
    await client.query(seedSql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  // Clasamentul precalculat (008) a fost creat pe tabele goale; îl calculăm acum, pe datele generate.
  await refreshLeaderboard();

  const counts: Record<string, number> = {};
  for (const table of COUNTED_TABLES) {
    // Numele tabelelor vin din lista fixă de mai sus, nu de la utilizator, deci interpolarea e sigură.
    const result = await pool.query<{ n: number }>(`SELECT count(*) AS n FROM ${table}`);
    counts[table] = result.rows[0].n;
  }
  console.log(`[seed] gata în ${((Date.now() - startedAt) / 1000).toFixed(1)} s`, counts);
}

// Pornește un Postgres în memorie (PGlite) care vorbește protocolul Postgres pe un port local,
// aplică migrațiile reale și construiește aplicația. Testele rulează astfel pe aceleași constrângeri ca în producție,
// fără să atingă baza de pe Supabase.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const PORT = 54329;

export async function startTestApp() {
  const pglite = await PGlite.create({ extensions: { pgcrypto } });
  const server = new PGLiteSocketServer({ db: pglite, port: PORT, host: '127.0.0.1' });
  await server.start();

  // Variabilele trebuie setate înainte de a importa config.ts / db.ts, care le citesc la import.
  process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`;
  process.env.DATABASE_SSL = 'false';
  process.env.TOKEN_ENCRYPTION_KEY = 'cheie-de-test';

  const { migrate } = await import('../src/db/migrate.js');
  const { buildServer } = await import('../src/server.js');
  const { pool } = await import('../src/db/db.js');

  await migrate();
  const app = buildServer({ logger: process.env.TEST_LOG === '1' }); // TEST_LOG=1 afișează logurile serverului

  async function stop() {
    await app.close();
    await pool.end();
    await server.stop();
    await pglite.close();
  }

  return { app, pool, stop };
}

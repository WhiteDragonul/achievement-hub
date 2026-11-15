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
  process.env.JWT_SECRET = 'secret-de-test';
  process.env.DATABASE_POOL_MAX = '1';
  process.env.ALLOW_MOCK_PLATFORMS = 'true'; // testele de sync folosesc MockProvider

  const { migrate } = await import('../src/db/migrate.js');
  const { buildServer } = await import('../src/server.js');
  const { pool } = await import('../src/db/db.js');
  const { signAccessToken } = await import('../src/auth.js');

  await migrate();
  const app = buildServer({ logger: process.env.TEST_LOG === '1' }); // TEST_LOG=1 afișează logurile serverului

  // Testele CRUD rulează ca admin (care are voie la orice); regulile pe roluri sunt testate separat în auth.test.ts.
  const adminToken = signAccessToken({ id: 1_000_000, role: 'admin', username: 'test_admin' });

  async function stop() {
    await app.close();
    await pool.end();
    await server.stop();
    await pglite.close();
  }

  return { app, pool, stop, adminToken, signAccessToken };
}

// Runner de migrații (D13): aplică, în ordinea numelui, fișierele din db/migrations care nu apar
// în tabelul schema_migrations. Fiecare fișier rulează într-o tranzacție: se aplică tot sau nimic.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from './db.js';

// Aceeași cale relativă funcționează și din src/db (tsx) și din dist/db (build), local și în Docker.
const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../../../db/migrations');

export async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
          filename   text        PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
    `);

    const { rows } = await client.query<{ filename: string }>('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.filename));

    // Numerotarea 001_, 002_ ... face ca ordinea alfabetică să fie ordinea corectă.
    const files = (await fs.readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort();

    for (const file of files) {
      if (applied.has(file)) continue;

      const migrationSql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        // Fără parametri, pg trimite textul ca "simple query", deci un fișier poate conține mai multe instrucțiuni.
        await client.query(migrationSql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[migrate] aplicat ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migrația ${file} a eșuat: ${(error as Error).message}`);
      }
    }
    console.log(`[migrate] schema la zi (${files.length} migrații)`);
  } finally {
    client.release();
  }
}

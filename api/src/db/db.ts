import pg from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import { config } from '../config.js';
import type { Database } from './types.js';

// pg întoarce implicit bigint (int8) și numeric ca string, ca să nu piardă precizie.
// Id-urile și count(*) nu vor depăși niciodată 2^53, iar numeric-urile noastre sunt procente (numeric(5,2)),
// deci le convertim în number ca să lucrăm simplu cu ele în TypeScript.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  // Supabase acceptă doar conexiuni TLS. Certificatul pooler-ului e semnat de CA-ul propriu Supabase,
  // nu de un CA public, deci conexiunea e criptată, dar certificatul nu e verificat (D15).
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 10,
});

// Pooler-ul Supabase închide conexiunile inactive. Fără acest handler, eroarea emisă de o conexiune
// care stă în pool ar opri tot procesul; așa doar o logăm, iar pool-ul deschide alta la următorul query.
pool.on('error', (error) => {
  console.error('[db] conexiune inactivă închisă de server:', error.message);
});

// Kysely = query builder tipizat: scriem SQL aproape 1:1, dar TypeScript verifică numele de tabele/coloane.
export const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

// Coada de joburi (pg-boss, D37): ține joburile în tabele Postgres (schema „pgboss”), deci nu e nevoie de Redis.
// API-ul doar adaugă joburi; worker-ul (worker.ts) le execută, separat, ca un sync lent să nu blocheze cererile HTTP.
import { PgBoss } from 'pg-boss';
import { config } from '../config.js';
import { db } from '../db/db.js';

export const SYNC_QUEUE = 'sync-account';
export const LEADERBOARD_QUEUE = 'refresh-leaderboard';

let boss: PgBoss | null = null;

export async function startQueue(): Promise<PgBoss> {
  boss = new PgBoss({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : false, // la fel ca în db.ts (D15)
    schema: 'pgboss',
    max: 3,
  });
  boss.on('error', (error) => console.error('[queue]', error.message));
  await boss.start();
  await boss.createQueue(SYNC_QUEUE);
  await boss.createQueue(LEADERBOARD_QUEUE);
  return boss;
}

// Dacă coada nu e pornită (în testele automate), rândul din sync_runs rămâne 'queued'.
export async function enqueueSync(syncRunId: number): Promise<void> {
  if (!boss) return;
  // singletonKey: un singur job activ per sincronizare, chiar dacă cererea se repetă.
  await boss.send(SYNC_QUEUE, { syncRunId }, { singletonKey: String(syncRunId), retryLimit: 1 });
}

// O sincronizare nouă = rând în sync_runs ('queued') + job în coadă. Folosită de butonul „Sincronizează”
// și automat după legarea unui cont Steam.
export async function requestSync(platformAccountId: number) {
  const run = await db.insertInto('sync_runs')
    .values({ platform_account_id: platformAccountId })
    .returningAll()
    .executeTakeFirstOrThrow();
  await enqueueSync(run.id);
  return run;
}

export async function stopQueue(): Promise<void> {
  await boss?.stop();
}

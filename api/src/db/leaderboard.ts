// Reîmprospătarea clasamentului precalculat (materialized view leaderboard_scores, migrația 008, D44).
// CONCURRENTLY: clasamentul vechi rămâne vizibil cât timp se calculează cel nou (cere indexul unic din 008).
import { sql } from 'kysely';
import { db } from './db.js';

export async function refreshLeaderboard(): Promise<void> {
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_scores`.execute(db);
}

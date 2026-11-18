// Ce face worker-ul: execută joburile de sync și reîmprospătează clasamentul.
// Rulează fie în procesul separat src/worker.ts (Docker Compose), fie în procesul API-ului
// când RUN_WORKER_IN_API=true (hosting gratuit cu un singur serviciu, D50).
import type { PgBoss } from 'pg-boss';
import { refreshLeaderboard } from '../db/leaderboard.js';
import { runSync } from './sync.js';
import { LEADERBOARD_QUEUE, SYNC_QUEUE } from './queue.js';

export async function registerJobs(boss: PgBoss) {
  // pg-boss trimite joburile în loturi (implicit 1 job per lot).
  await boss.work<{ syncRunId: number }>(SYNC_QUEUE, async (jobs) => {
    for (const job of jobs) {
      console.log(`[worker] sync ${job.data.syncRunId}`);
      await runSync(job.data.syncRunId);
    }
    // Deblocările noi intră în clasament imediat după sync.
    await refreshLeaderboard();
  });

  // Și periodic, pentru modificările făcute direct prin CRUD (pg-boss ține programarea în DB, ca un cron).
  await boss.schedule(LEADERBOARD_QUEUE, '*/5 * * * *');
  await boss.work(LEADERBOARD_QUEUE, async () => {
    await refreshLeaderboard();
  });
}

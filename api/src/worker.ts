// Procesul worker: preia joburile de sync din coada pg-boss și le execută (serviciul „worker” din docker-compose).
import { refreshLeaderboard } from './db/leaderboard.js';
import { runSync } from './sync/sync.js';
import { LEADERBOARD_QUEUE, startQueue, SYNC_QUEUE } from './sync/queue.js';

const boss = await startQueue();

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
console.log('[worker] aștept joburi de sync');

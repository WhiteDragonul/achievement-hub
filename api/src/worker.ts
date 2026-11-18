// Procesul worker: preia joburile de sync din coada pg-boss și le execută (serviciul „worker” din docker-compose).
import { registerJobs } from './sync/jobs.js';
import { startQueue } from './sync/queue.js';

const boss = await startQueue();
await registerJobs(boss);
console.log('[worker] aștept joburi de sync');

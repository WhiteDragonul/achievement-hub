// Punctul de pornire al API-ului: migrații → fixtures (doar pe DB gol) → server HTTP.
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { seedIfEmpty } from './db/seed.js';
import { buildServer } from './server.js';
import { registerJobs } from './sync/jobs.js';
import { startQueue } from './sync/queue.js';

await migrate();
if (config.seedOnStart) await seedIfEmpty();

// API-ul trimite joburi în coadă; le execută procesul worker (src/worker.ts),
// sau chiar API-ul, când hostingul are un singur serviciu (RUN_WORKER_IN_API=true, D50).
const boss = await startQueue();
if (config.runWorkerInApi) await registerJobs(boss);

const app = buildServer();
// 0.0.0.0 ca serverul să fie accesibil din afara containerului Docker.
await app.listen({ host: '0.0.0.0', port: config.port });

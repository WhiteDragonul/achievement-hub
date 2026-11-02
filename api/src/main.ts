// Punctul de pornire al API-ului: migrații → fixtures (doar pe DB gol) → server HTTP.
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { seedIfEmpty } from './db/seed.js';
import { buildServer } from './server.js';

await migrate();
if (config.seedOnStart) await seedIfEmpty();

const app = buildServer();
// 0.0.0.0 ca serverul să fie accesibil din afara containerului Docker.
await app.listen({ host: '0.0.0.0', port: config.port });

// npm run db:migrate: rulează doar migrațiile, fără să pornească serverul.
import { pool } from '../db/db.js';
import { migrate } from '../db/migrate.js';

await migrate();
await pool.end();

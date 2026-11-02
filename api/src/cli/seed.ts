// npm run db:seed — încarcă fixtures (doar dacă tabelul users e gol), fără să pornească serverul.
import { pool } from '../db/db.js';
import { seedIfEmpty } from '../db/seed.js';

await seedIfEmpty();
await pool.end();

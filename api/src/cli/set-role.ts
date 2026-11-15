// `npm run user:role -- <username> <user|moderator|admin>` — schimbă rolul unui user direct în DB.
// Fără fixtures nu există niciun admin: primul admin se numește din linia de comandă (cine are acces la server).
import { db } from '../db/db.js';
import type { Role } from '../db/types.js';

const [username, role] = process.argv.slice(2);
if (!username || !['user', 'moderator', 'admin'].includes(role)) {
  console.error('Folosire: npm run user:role -- <username> <user|moderator|admin>');
  process.exit(1);
}
const updated = await db.updateTable('users')
  .set({ role: role as Role, updated_at: new Date() })
  .where((eb) => eb(eb.fn('lower', ['username']), '=', username.toLowerCase()))
  .returning(['id', 'username', 'role'])
  .executeTakeFirst();
console.log(updated ? `${updated.username} (id ${updated.id}) are acum rolul ${updated.role}` : `Nu există userul ${username}`);
await db.destroy();

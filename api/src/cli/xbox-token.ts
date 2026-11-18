// Obține refresh token-ul Xbox al autorului și îl scrie în .env (XBOX_REFRESH_TOKEN), o singură dată (D57).
// Rulezi `npm run xbox:token`, intri pe adresa afișată, scrii codul și te loghezi cu contul Xbox; tokenul se scrie
// direct în .env (nu se afișează nicăieri). API-ul și worker-ul repornesc singure când se schimbă .env.
import fs from 'node:fs';
import path from 'node:path';
import { xboxDeviceLogin } from '../sync/xbox-provider.js';

const token = await xboxDeviceLogin((url, code) => {
  console.log(`Deschide ${url} și scrie codul: ${code}\nApoi loghează-te cu contul Xbox. Aștept...`);
});

const envPath = path.resolve(import.meta.dirname, '../../../.env');
const env = fs.readFileSync(envPath, 'utf8');
const line = `XBOX_REFRESH_TOKEN=${token}`;
const updated = /^XBOX_REFRESH_TOKEN=.*$/m.test(env)
  ? env.replace(/^XBOX_REFRESH_TOKEN=.*$/m, line)
  : `${env.trimEnd()}\n# Xbox (D57): refresh token-ul contului Xbox al autorului (npm run xbox:token)\n${line}\n`;
fs.writeFileSync(envPath, updated);
console.log('Gata: XBOX_REFRESH_TOKEN e în .env.');

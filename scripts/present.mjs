// Pornește aplicația pentru prezentare, accesibilă de pe telefon (D48):
//  1. un tunel Cloudflare (gratuit, fără cont) face API-ul local accesibil la o adresă https publică;
//  2. adresa ajunge în variabila de repo API_URL și se republică frontend-ul pe GitHub Pages;
//  3. pornesc API-ul și worker-ul cu adresele publice (necesare pentru CORS și pentru login-ul Steam).
// Rulare din rădăcina proiectului: node scripts/present.mjs   (oprire: Ctrl+C)
// Cere: cloudflared și gh (logat) instalate; baza de date din .env pornită.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const WEB_URL = 'https://whitedragonul.github.io/achievement-hub';

function start(name, command, args, options = {}) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
  child.on('exit', (code) => console.log(`[${name}] s-a oprit (cod ${code})`));
  process.on('exit', () => child.kill());
  return child;
}

// winget instalează cloudflared aici; terminalele deschise înainte de instalare nu îl au încă în PATH.
const winPath = 'C:/Program Files (x86)/cloudflared/cloudflared.exe';
const tunnel = start('tunel', existsSync(winPath) ? winPath : 'cloudflared', ['tunnel', '--url', 'http://localhost:3000', '--no-autoupdate']);
// cloudflared scrie adresa generată (https://xxx.trycloudflare.com) în stderr.
const apiUrl = await new Promise((resolve) => {
  tunnel.stderr.on('data', (chunk) => {
    const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(chunk.toString());
    if (match) resolve(match[0]);
  });
});
console.log(`API public: ${apiUrl}`);

execFileSync('gh', ['variable', 'set', 'API_URL', '--body', apiUrl], { stdio: 'inherit' });
execFileSync('gh', ['workflow', 'run', 'pages.yml'], { stdio: 'inherit' });
console.log('Frontend-ul se republică pe GitHub Pages (~1 min): gh run watch');

const env = { ...process.env, PUBLIC_API_URL: apiUrl, WEB_URL };
for (const [name, file] of [['api', 'src/main.ts'], ['worker', 'src/worker.ts']]) {
  const child = start(name, 'node', ['--env-file=../.env', '--import', 'tsx', file], { cwd: 'api', env });
  child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`));
}

console.log(`\nDeschide pe telefon: ${WEB_URL}/\n`);
process.on('SIGINT', () => process.exit(0));

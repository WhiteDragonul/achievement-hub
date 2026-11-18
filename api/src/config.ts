// Toată configurația vine din variabile de mediu (.env local, env_file în Docker Compose).

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Lipsește variabila de mediu ${name} (vezi .env.example)`);
  return value;
}

export const config = {
  databaseUrl: required('DATABASE_URL'),
  databaseSsl: process.env.DATABASE_SSL !== 'false',
  port: Number(process.env.PORT ?? 3000),
  // Cheia pentru pgp_sym_encrypt / pgp_sym_decrypt (tokenurile platformelor, D7). Nu ajunge niciodată în DB.
  tokenEncryptionKey: required('TOKEN_ENCRYPTION_KEY'),
  // Cheia HMAC cu care se semnează tokenurile de acces (JWT, D31).
  jwtSecret: required('JWT_SECRET'),
  // Unde redirecționează login-ul Steam după succes (aplicația web sau deep-link-ul Tauri).
  webUrl: process.env.WEB_URL ?? 'http://localhost:5173',
  publicApiUrl: process.env.PUBLIC_API_URL ?? 'http://localhost:3000',
  // Steam Web API key (https://steamcommunity.com/dev/apikey). Fără ea, sync-ul Steam eșuează explicit.
  steamApiKey: process.env.STEAM_API_KEY ?? '',
  // PSN (D55): tokenul NPSSO al autorului, din https://ca.account.sony.com/api/v1/ssocookie (după login pe playstation.com).
  psnNpsso: process.env.PSN_NPSSO ?? '',
  // Xbox (D57): refresh token-ul contului Xbox al autorului, obținut o dată cu `npm run xbox:token`.
  xboxRefreshToken: process.env.XBOX_REFRESH_TOKEN ?? '',
  // Fixtures (mii de useri generați) doar la cerere: implicit baza conține doar date reale (D45).
  seedOnStart: process.env.SEED_ON_START === 'true',
  // Epic nu are provider real (D54, D55); cu true se poate lega cu date demo.
  allowMockPlatforms: process.env.ALLOW_MOCK_PLATFORMS === 'true',
  // Pe hosting gratuit (un singur serviciu) joburile de sync rulează în procesul API-ului (D50).
  runWorkerInApi: process.env.RUN_WORKER_IN_API === 'true',
  fixturePassword: process.env.FIXTURE_PASSWORD ?? 'Parola123!',
};

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
  seedOnStart: process.env.SEED_ON_START !== 'false',
  fixturePassword: process.env.FIXTURE_PASSWORD ?? 'Parola123!',
};

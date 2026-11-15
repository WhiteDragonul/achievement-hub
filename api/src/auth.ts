// Autentificare (etapa 3, D31–D35):
//  - token de acces = JWT semnat HS256, valabil 15 minute, ținut de client doar în memorie;
//  - refresh token = 32 de octeți aleatori; în DB (refresh_tokens) stocăm doar sha256(token), deci o scurgere
//    a bazei de date nu dă acces la sesiuni. La fiecare /auth/refresh tokenul vechi e revocat și se emite altul (rotație).
// JWT-ul e implementat direct cu node:crypto (≈20 de linii) ca să se vadă exact ce se semnează și ce se verifică.
import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { db } from './db/db.js';
import type { Role } from './db/types.js';

export const ACCESS_TOKEN_SECONDS = 15 * 60;
export const REFRESH_TOKEN_DAYS = 30;

export type AuthUser = { id: number; role: Role; username: string };

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
  }
}

// ---- JWT (HS256) ----

const base64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');
const sign = (data: string) => crypto.createHmac('sha256', config.jwtSecret).update(data).digest('base64url');

function signJwt(claims: Record<string, unknown>, seconds: number): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({ ...claims, iat: now, exp: now + seconds }));
  return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
}

// Întoarce conținutul tokenului sau null dacă semnătura e greșită / tokenul a expirat.
function verifyJwt(token: string): Record<string, unknown> | null {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) return null;

  // timingSafeEqual: comparația nu se oprește la primul caracter diferit (nu dezvăluie semnătura prin timp).
  const expected = Buffer.from(sign(`${header}.${payload}`));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;

  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (typeof claims.exp !== 'number' || claims.exp < Date.now() / 1000) return null;
  return claims;
}

export function signAccessToken(user: AuthUser): string {
  return signJwt({ sub: user.id, role: user.role, username: user.username }, ACCESS_TOKEN_SECONDS);
}

export function verifyAccessToken(token: string): AuthUser | null {
  const claims = verifyJwt(token);
  // Un token cu „purpose” (ex. legarea Steam) nu e token de acces, chiar dacă e semnat cu aceeași cheie.
  if (!claims || claims.purpose !== undefined) return null;
  return { id: claims.sub as number, role: claims.role as Role, username: claims.username as string };
}

// Legarea unui cont Steam la userul logat (D47): browserul pleacă la Steam fără header-ul Authorization,
// așa că userul e transmis printr-un token „state” semnat, valabil 10 minute și bun doar pentru acest scop.
export const signSteamLinkState = (userId: number) => signJwt({ sub: userId, purpose: 'steam-link' }, 10 * 60);

export function verifySteamLinkState(token: string): number | null {
  const claims = verifyJwt(token);
  return claims?.purpose === 'steam-link' ? (claims.sub as number) : null;
}

// ---- Refresh tokens ----

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest();

// Creează o sesiune nouă: rând în refresh_tokens + perechea de tokenuri pentru client.
export async function createSession(user: AuthUser, userAgent: string | undefined) {
  const refreshToken = crypto.randomBytes(32).toString('base64url');
  await db.insertInto('refresh_tokens').values({
    user_id: user.id,
    token_hash: hashToken(refreshToken),
    user_agent: userAgent ?? null,
    expires_at: new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 3600 * 1000),
  }).execute();
  return { access_token: signAccessToken(user), refresh_token: refreshToken, expires_in: ACCESS_TOKEN_SECONDS };
}

// ---- Verificări folosite de rute ----

// Hook pe toate rutele protejate: fără token valid → 401.
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  const user = header?.startsWith('Bearer ') ? verifyAccessToken(header.slice(7)) : null;
  if (!user) return reply.code(401).send({ error: 'Autentificare necesară' });
  request.user = user;
}

// Rolurile sunt ierarhice: admin poate tot ce poate moderatorul, moderatorul tot ce poate userul.
const roleRank: Record<Role, number> = { user: 1, moderator: 2, admin: 3 };
export const hasRole = (user: AuthUser, role: Role) => roleRank[user.role] >= roleRank[role];

// Erorile aruncate cu statusCode < 500 sunt trimise clientului de errorHandler (errors.ts).
export function forbid(message = 'Nu ai dreptul să faci această operație'): never {
  throw Object.assign(new Error(message), { statusCode: 403 });
}

// preHandler pentru rute întregi: { preHandler: requireRole('admin') }.
export const requireRole = (role: Role) => async (request: FastifyRequest) => {
  if (!hasRole(request.user, role)) forbid();
};

// Operația e permisă doar pe datele proprii (sau de către admin).
export function assertSelf(request: FastifyRequest, userId: number) {
  if (request.user.id !== userId && !hasRole(request.user, 'admin')) forbid();
}

// Progresul (user_games, user_achievements, sync_runs) aparține proprietarului contului de platformă.
export async function assertOwnsAccount(request: FastifyRequest, platformAccountId: number) {
  if (hasRole(request.user, 'admin')) return;
  const account = await db.selectFrom('platform_accounts').select('user_id')
    .where('id', '=', platformAccountId)
    .executeTakeFirst();
  // Contul inexistent e lăsat să ajungă la DB, care răspunde cu 404 / 409 (FK) ca înainte.
  if (account && account.user_id !== request.user.id) forbid();
}

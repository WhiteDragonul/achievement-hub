// Provider real pentru Xbox (D55), prin API-ul oficial Xbox Live.
// Legarea: userul se loghează cu contul Microsoft (OAuth, aplicație înregistrată în Azure: XBOX_CLIENT_ID / SECRET);
// păstrăm criptat doar refresh token-ul Microsoft (platform_accounts.access_token_enc).
// La fiecare sync: refresh token → token Microsoft → token Xbox Live (user) → token XSTS → cereri către Xbox Live.
import { sql } from 'kysely';
import { config } from '../config.js';
import { db } from '../db/db.js';
import { mapWithLimit } from './limit.js';
import type { AchievementProvider, LinkedAccount, ProviderGame } from './providers.js';

const MS_OAUTH = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const SCOPE = 'XboxLive.signin offline_access';
const MAX_GAMES = 250;
const CONCURRENCY = 4;

export const xboxRedirectUri = () => `${config.publicApiUrl}/api/auth/xbox/callback`;

export function xboxAuthorizeUrl(state: string): string {
  if (!config.xboxClientId) throw new Error('XBOX_CLIENT_ID is missing from the configuration');
  return `${MS_OAUTH}/authorize?${new URLSearchParams({
    client_id: config.xboxClientId, response_type: 'code', redirect_uri: xboxRedirectUri(), scope: SCOPE, state,
  })}`;
}

// Cod de autorizare (la legare) sau refresh token (la sync) → tokenuri Microsoft.
async function microsoftToken(grant: { code: string } | { refresh_token: string }) {
  const body = new URLSearchParams({
    client_id: config.xboxClientId, client_secret: config.xboxClientSecret, scope: SCOPE, redirect_uri: xboxRedirectUri(),
    ...('code' in grant ? { grant_type: 'authorization_code', code: grant.code } : { grant_type: 'refresh_token', refresh_token: grant.refresh_token }),
  });
  const response = await fetch(`${MS_OAUTH}/token`, { method: 'POST', body });
  if (!response.ok) throw new Error('Microsoft sign-in expired: unlink Xbox and connect it again');
  return response.json() as Promise<{ access_token: string; refresh_token: string }>;
}

async function xblPost<T>(url: string, body: object): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-xbl-contract-version': '1' },
    body: JSON.stringify(body),
  });
  // 401 la XSTS = contul Microsoft nu are profil Xbox (n-a intrat niciodată pe Xbox).
  if (!response.ok) throw new Error(`This Microsoft account has no Xbox profile (HTTP ${response.status})`);
  return response.json() as Promise<T>;
}

type XboxSession = { authorization: string; xuid: string; gamertag: string };

// Token Microsoft → token Xbox Live → token XSTS; antetul Authorization pentru toate cererile Xbox Live.
async function xboxSession(msAccessToken: string): Promise<XboxSession> {
  const user = await xblPost<{ Token: string }>('https://user.auth.xboxlive.com/user/authenticate', {
    RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT',
    Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msAccessToken}` },
  });
  type Xsts = { Token: string; DisplayClaims: { xui: { uhs: string; xid: string; gtg: string }[] } };
  const xsts = await xblPost<Xsts>('https://xsts.auth.xboxlive.com/xsts/authorize', {
    RelyingParty: 'http://xboxlive.com', TokenType: 'JWT', Properties: { SandboxId: 'RETAIL', UserTokens: [user.Token] },
  });
  const claims = xsts.DisplayClaims.xui[0];
  return { authorization: `XBL3.0 x=${claims.uhs};${xsts.Token}`, xuid: claims.xid, gamertag: claims.gtg };
}

// Folosită la legare: din codul primit de la Microsoft obținem identitatea Xbox și refresh token-ul de păstrat.
export async function linkXboxAccount(code: string) {
  const tokens = await microsoftToken({ code });
  const session = await xboxSession(tokens.access_token);
  return { xuid: session.xuid, gamertag: session.gamertag, refreshToken: tokens.refresh_token };
}

async function xblGet<T>(url: string, authorization: string): Promise<T> {
  const response = await fetch(url, {
    headers: { authorization, 'x-xbl-contract-version': '2', 'accept-language': 'en-US' },
  });
  if (!response.ok) throw new Error(`Xbox Live ${new URL(url).host}: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

type TitleHistory = {
  titles: { titleId: string; name: string; displayImage?: string; achievement?: { totalAchievements: number }; titleHistory?: { lastTimePlayed?: string } }[];
};
type Achievements = {
  achievements: {
    id: string; name: string; description?: string; lockedDescription?: string; isSecret: boolean; progressState: string;
    progression?: { timeUnlocked?: string }; mediaAssets?: { type: string; url: string }[]; rarity?: { currentPercentage?: number };
  }[];
};

export class XboxProvider implements AchievementProvider {
  // Sesiunea Xbox Live din fetchLibrary, refolosită de fetchAvatar (un provider nou se creează la fiecare sync).
  private session: XboxSession | null = null;

  async fetchAvatar(): Promise<string | null> {
    if (!this.session) return null;
    type Settings = { profileUsers: { settings: { id: string; value: string }[] }[] };
    const data = await xblGet<Settings>(
      `https://profile.xboxlive.com/users/xuid(${this.session.xuid})/profile/settings?settings=GameDisplayPicRaw`,
      this.session.authorization,
    );
    const url = data.profileUsers[0]?.settings.find((s) => s.id === 'GameDisplayPicRaw')?.value ?? null;
    return url?.replace(/^http:/, 'https:') ?? null;
  }

  async fetchLibrary(account: LinkedAccount): Promise<ProviderGame[]> {
    if (!account.access_token) throw new Error('Xbox sign-in missing: unlink Xbox and connect it again');
    const tokens = await microsoftToken({ refresh_token: account.access_token });
    // Microsoft dă un refresh token nou la fiecare folosire; îl salvăm (criptat) pentru sync-ul următor.
    await db.updateTable('platform_accounts')
      .set({ access_token_enc: sql<Buffer>`pgp_sym_encrypt(${tokens.refresh_token}, ${config.tokenEncryptionKey})` })
      .where('id', '=', account.id)
      .execute();
    this.session = await xboxSession(tokens.access_token);
    const { authorization, xuid } = this.session;

    const history = await xblGet<TitleHistory>(
      `https://titlehub.xboxlive.com/users/xuid(${xuid})/titles/titlehistory/decoration/achievement,image?maxItems=${MAX_GAMES}`,
      authorization,
    );
    // Doar jocurile cu achievement-uri (titlehub întoarce și aplicații: Netflix, YouTube etc.).
    const games = history.titles.filter((title) => (title.achievement?.totalAchievements ?? 0) > 0);

    return mapWithLimit(games, CONCURRENCY, async (title): Promise<ProviderGame> => {
      const data = await xblGet<Achievements>(
        `https://achievements.xboxlive.com/users/xuid(${xuid})/achievements?titleId=${title.titleId}&maxItems=1000`,
        authorization,
      );
      return {
        external_id: title.titleId,
        title: title.name,
        icon_url: title.displayImage ?? null,
        playtime_minutes: 0, // Xbox Live nu dă timpul de joc în aceste API-uri
        last_played_at: title.titleHistory?.lastTimePlayed ? new Date(title.titleHistory.lastTimePlayed) : null,
        achievements: data.achievements.map((a) => ({
          external_id: a.id,
          name: a.name,
          description: a.description || a.lockedDescription || null,
          icon_url: a.mediaAssets?.find((m) => m.type === 'Icon')?.url ?? null,
          is_hidden: a.isSecret,
          global_unlock_pct: a.rarity?.currentPercentage ?? null,
          // timeUnlocked = „0001-01-01…” la cele neobținute; ne bazăm pe progressState.
          unlocked_at: a.progressState === 'Achieved' && a.progression?.timeUnlocked ? new Date(a.progression.timeUnlocked) : null,
        })),
      };
    });
  }
}

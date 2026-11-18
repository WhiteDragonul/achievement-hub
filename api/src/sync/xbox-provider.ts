// Provider real pentru Xbox (D55, D57), prin serviciile Xbox Live. Funcționează ca la PSN: serverul se autentifică o
// singură dată cu contul Xbox al autorului (XBOX_REFRESH_TOKEN în .env, obținut cu `npm run xbox:token`) și cu el citește
// achievement-urile publice ale oricărui jucător. Un cont Xbox se leagă după gamertag; external_id = XUID-ul numeric.
// Lanțul de autentificare: refresh token Microsoft → token Microsoft → token Xbox Live (user) → token XSTS.
import { config } from '../config.js';
import { mapWithLimit } from './limit.js';
import type { AchievementProvider, LinkedAccount, ProviderGame } from './providers.js';

const LIVE = 'https://login.live.com';
// Client public Microsoft folosit de jocurile de consolă pentru login pe alt dispozitiv (fără secret, fără Azure).
const CLIENT_ID = '00000000441cc96b';
const SCOPE = 'service::user.auth.xboxlive.com::MBI_SSL';
const MAX_GAMES = 250;
const CONCURRENCY = 4;

async function livePost<T>(path: string, fields: Record<string, string>): Promise<T> {
  const response = await fetch(`${LIVE}/${path}`, { method: 'POST', body: new URLSearchParams({ client_id: CLIENT_ID, ...fields }) });
  return response.json() as Promise<T>;
}

type LiveTokens = { access_token?: string; refresh_token?: string; error?: string };

async function liveRefresh(token: string): Promise<{ access_token: string; refresh_token: string }> {
  const tokens = await livePost<LiveTokens>('oauth20_token.srf', { grant_type: 'refresh_token', scope: SCOPE, refresh_token: token });
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('The Xbox sign-in of the server expired: run `npm run xbox:token` again');
  }
  return { access_token: tokens.access_token, refresh_token: tokens.refresh_token };
}

// Login pe alt dispozitiv (folosit de cli/xbox-token.ts): Microsoft dă un cod scurt pe care autorul îl introduce pe
// https://www.microsoft.com/link; apoi întrebăm periodic dacă s-a logat și primim refresh token-ul.
export async function xboxDeviceLogin(show: (url: string, code: string) => void): Promise<string> {
  const device = await livePost<{ user_code: string; device_code: string; verification_uri: string; interval: number; expires_in: number }>(
    'oauth20_connect.srf', { scope: SCOPE, response_type: 'device_code' },
  );
  show(device.verification_uri, device.user_code);
  const deadline = Date.now() + device.expires_in * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, device.interval * 1000));
    const tokens = await livePost<LiveTokens>('oauth20_token.srf', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: device.device_code,
    });
    if (tokens.refresh_token) return tokens.refresh_token;
    if (tokens.error !== 'authorization_pending') throw new Error(`Microsoft sign-in failed: ${tokens.error}`);
  }
  throw new Error('The code expired before sign-in. Run the command again.');
}

async function xblPost<T>(url: string, body: object): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-xbl-contract-version': '1' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Xbox Live sign-in failed (HTTP ${response.status})`);
  return response.json() as Promise<T>;
}

// Tokenul XSTS e valabil câteva ore; îl păstrăm în memorie. Microsoft dă la fiecare reînnoire un refresh token nou,
// pe care îl folosim data viitoare (cel din .env rămâne valabil ca punct de pornire după o repornire a serverului).
let refreshToken = '';
let cached: { authorization: string; expiresAt: number } | null = null;

async function xboxAuthorization(): Promise<string> {
  if (!config.xboxRefreshToken) throw new Error('XBOX_REFRESH_TOKEN is missing from the configuration');
  if (cached && cached.expiresAt > Date.now()) return cached.authorization;

  const tokens = await liveRefresh(refreshToken || config.xboxRefreshToken);
  refreshToken = tokens.refresh_token;
  const user = await xblPost<{ Token: string }>('https://user.auth.xboxlive.com/user/authenticate', {
    RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT',
    Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `t=${tokens.access_token}` },
  });
  const xsts = await xblPost<{ Token: string; NotAfter: string; DisplayClaims: { xui: { uhs: string }[] } }>(
    'https://xsts.auth.xboxlive.com/xsts/authorize',
    { RelyingParty: 'http://xboxlive.com', TokenType: 'JWT', Properties: { SandboxId: 'RETAIL', UserTokens: [user.Token] } },
  );
  const authorization = `XBL3.0 x=${xsts.DisplayClaims.xui[0].uhs};${xsts.Token}`;
  cached = { authorization, expiresAt: new Date(xsts.NotAfter).getTime() - 5 * 60_000 };
  return authorization;
}

async function xblGet<T>(url: string): Promise<T | null> {
  const response = await fetch(url, {
    headers: { authorization: await xboxAuthorization(), 'x-xbl-contract-version': '2', 'accept-language': 'en-US' },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Xbox Live ${new URL(url).host}: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

type ProfileSettings = { profileUsers: { id: string; settings: { id: string; value: string }[] }[] };

// Profilul după `gt(<gamertag>)` sau `xuid(<xuid>)`: XUID, gamertag și avatar (pe https, ca să nu fie blocat).
async function xboxProfile(user: string): Promise<{ xuid: string; gamertag: string; avatarUrl: string | null } | null> {
  const data = await xblGet<ProfileSettings>(
    `https://profile.xboxlive.com/users/${user}/profile/settings?settings=Gamertag,GameDisplayPicRaw`,
  );
  const profile = data?.profileUsers[0];
  if (!profile) return null;
  const setting = (id: string) => profile.settings.find((s) => s.id === id)?.value ?? null;
  return { xuid: profile.id, gamertag: setting('Gamertag') ?? '', avatarUrl: setting('GameDisplayPicRaw')?.replace(/^http:/, 'https:') ?? null };
}

// Gamertag → { accountId (XUID), name, avatarUrl } sau null dacă nu există (căutarea din profil și legarea).
export async function findXboxAccount(gamertag: string) {
  const profile = await xboxProfile(`gt(${encodeURIComponent(gamertag)})`);
  return profile ? { accountId: profile.xuid, name: profile.gamertag, avatarUrl: profile.avatarUrl } : null;
}

type TitleHistory = {
  titles: { titleId: string; name: string; type: string; displayImage?: string; titleHistory?: { lastTimePlayed?: string } }[];
};
type Achievements = {
  achievements: {
    id: string; name: string; description?: string; lockedDescription?: string; isSecret: boolean; progressState: string;
    progression?: { timeUnlocked?: string }; mediaAssets?: { type: string; url: string }[]; rarity?: { currentPercentage?: number };
  }[];
};

export class XboxProvider implements AchievementProvider {
  async fetchAvatar(account: LinkedAccount): Promise<string | null> {
    return (await xboxProfile(`xuid(${account.external_id})`))?.avatarUrl ?? null;
  }

  async fetchLibrary(account: LinkedAccount): Promise<ProviderGame[]> {
    const xuid = account.external_id;
    const history = await xblGet<TitleHistory>(
      `https://titlehub.xboxlive.com/users/xuid(${xuid})/titles/titlehistory/decoration/achievement,image?maxItems=${MAX_GAMES}`,
    );
    if (!history) throw new Error('Xbox is hiding your games: set "Game and app history" to Everybody in Xbox privacy settings');
    // Doar jocurile (titlehub întoarce și aplicații: Netflix, YouTube etc.). Nu filtrăm după totalAchievements:
    // la unele jocuri (ex. Battlefield 6) titlehub raportează 0, deși jocul are achievement-uri.
    const games = history.titles.filter((title) => title.type === 'Game');

    return mapWithLimit(games, CONCURRENCY, async (title): Promise<ProviderGame> => {
      const data = await xblGet<Achievements>(
        `https://achievements.xboxlive.com/users/xuid(${xuid})/achievements?titleId=${title.titleId}&maxItems=1000`,
      );
      return {
        external_id: title.titleId,
        title: title.name,
        icon_url: title.displayImage?.replace(/^http:/, 'https:') ?? null,
        playtime_minutes: 0, // Xbox Live nu dă timpul de joc în aceste API-uri
        last_played_at: title.titleHistory?.lastTimePlayed ? new Date(title.titleHistory.lastTimePlayed) : null,
        achievements: (data?.achievements ?? []).map((a) => ({
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

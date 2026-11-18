// Provider real pentru PlayStation (D55). Sony nu are un API public, așa că folosim biblioteca `psn-api`, care apelează
// aceleași servicii ca aplicația PlayStation. Autentificarea se face o singură dată, cu tokenul NPSSO al autorului
// (PSN_NPSSO în .env); cu el se pot citi trofeele oricărui jucător care are trofeele vizibile pentru „Anyone”.
// Un cont PSN se leagă după Online ID (vezi routes/console-link.ts); external_id = accountId-ul numeric.
import {
  exchangeAccessCodeForAuthTokens, exchangeNpssoForAccessCode, getProfileFromUserName, getTitleTrophies,
  getUserTitles, getUserTrophiesEarnedForTitle, type AuthorizationPayload,
} from 'psn-api';
import { config } from '../config.js';
import { mapWithLimit } from './limit.js';
import type { AchievementProvider, LinkedAccount, ProviderGame } from './providers.js';

const MAX_GAMES = 250; // ca la Steam: cele mai recente MAX_GAMES jocuri
const CONCURRENCY = 4;

// Tokenul de acces PSN e valabil ~1 oră; îl păstrăm în memorie ca să nu refacem schimbul NPSSO la fiecare cerere.
let cached: { auth: AuthorizationPayload; expiresAt: number } | null = null;

async function psnAuth(): Promise<AuthorizationPayload> {
  if (!config.psnNpsso) throw new Error('PSN_NPSSO is missing from the configuration');
  if (cached && cached.expiresAt > Date.now()) return cached.auth;
  const code = await exchangeNpssoForAccessCode(config.psnNpsso);
  const tokens = await exchangeAccessCodeForAuthTokens(code);
  cached = { auth: { accessToken: tokens.accessToken }, expiresAt: Date.now() + (tokens.expiresIn - 60) * 1000 };
  return cached.auth;
}

// Online ID → { accountId, onlineId, avatarUrl } sau null dacă nu există (pentru căutarea din profil și pentru legare).
export async function findPsnAccount(onlineId: string): Promise<{ accountId: string; onlineId: string; avatarUrl: string | null } | null> {
  const auth = await psnAuth();
  try {
    const { profile } = await getProfileFromUserName(auth, onlineId);
    // Sony dă avatarul în mai multe mărimi (îl luăm pe ultimul, cel mai mare) și pe http; îl cerem pe https,
    // altfel site-ul (https) și aplicația îl blochează ca „mixed content”.
    const avatarUrl = profile.avatarUrls.at(-1)?.avatarUrl.replace(/^http:/, 'https:') ?? null;
    return { accountId: profile.accountId, onlineId: profile.onlineId, avatarUrl };
  } catch {
    return null;
  }
}

export class PsnProvider implements AchievementProvider {
  // display_name = Online ID-ul salvat la legare.
  async fetchAvatar(account: LinkedAccount): Promise<string | null> {
    return (await findPsnAccount(account.display_name))?.avatarUrl ?? null;
  }

  async fetchLibrary(account: LinkedAccount): Promise<ProviderGame[]> {
    const auth = await psnAuth();
    const accountId = account.external_id;

    let titles;
    try {
      titles = (await getUserTitles(auth, accountId, { limit: MAX_GAMES })).trophyTitles;
    } catch {
      throw new Error('PlayStation is hiding your trophies: in PSN privacy settings set "Trophies" to Anyone');
    }

    return mapWithLimit(titles, CONCURRENCY, async (title): Promise<ProviderGame> => {
      // PS5 („trophy2”) și PS4 / PS3 / Vita („trophy”) folosesc servicii diferite.
      const options = { npServiceName: title.npServiceName };
      const [definitions, earned] = await Promise.all([
        getTitleTrophies(auth, title.npCommunicationId, 'all', options),
        getUserTrophiesEarnedForTitle(auth, accountId, title.npCommunicationId, 'all', options),
      ]);
      const progress = new Map(earned.trophies.map((t) => [t.trophyId, t]));

      return {
        external_id: title.npCommunicationId,
        title: title.trophyTitleName,
        icon_url: title.trophyTitleIconUrl ?? null,
        playtime_minutes: 0, // PSN nu dă timpul de joc pe același identificator ca trofeele
        last_played_at: title.lastUpdatedDateTime ? new Date(title.lastUpdatedDateTime) : null,
        achievements: definitions.trophies.map((trophy) => {
          const mine = progress.get(trophy.trophyId);
          return {
            external_id: String(trophy.trophyId),
            name: trophy.trophyName ?? `Trophy ${trophy.trophyId}`,
            description: trophy.trophyDetail ?? null,
            icon_url: trophy.trophyIconUrl ?? null,
            is_hidden: trophy.trophyHidden,
            global_unlock_pct: mine?.trophyEarnedRate ? Number(mine.trophyEarnedRate) : null,
            unlocked_at: mine?.earned && mine.earnedDateTime ? new Date(mine.earnedDateTime) : null,
          };
        }),
      };
    });
  }
}

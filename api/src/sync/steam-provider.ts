// Provider real pentru Steam (Steam Web API, https://developer.valvesoftware.com/wiki/Steam_Web_API).
// Pentru fiecare joc deținut: schema achievement-urilor (nume, descriere, icon), ce a deblocat userul și procentul global.
// Profilul Steam trebuie să aibă „Game details” public, altfel Steam răspunde 403 la achievement-uri.
import { config } from '../config.js';
import type { AchievementProvider, LinkedAccount, ProviderGame } from './providers.js';

const API = 'https://api.steampowered.com';
// Limită ca un cont cu mii de jocuri să nu facă mii de cereri la un sync (Steam limitează la ~100.000 cereri/zi).
// Se iau cele mai jucate MAX_GAMES jocuri (toate, dacă sunt mai puține), inclusiv cele neîncepute.
const MAX_GAMES = 250;
// Câte jocuri se interoghează în paralel: destul de rapid, dar fără să lovim limitele Steam.
const CONCURRENCY = 6;

// Aplică `fn` pe toate elementele, cu cel mult `limit` apeluri în desfășurare simultan; păstrează ordinea.
async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function steamGet<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const url = new URL(API + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url);
  // 400 / 403 la un joc fără achievement-uri sau cu statistici private: îl tratăm ca „fără date”, nu ca eroare.
  if (response.status === 400 || response.status === 403) return null;
  if (!response.ok) throw new Error(`Steam API ${path}: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

type OwnedGames = {
  response: { games?: { appid: number; name: string; playtime_forever: number; rtime_last_played?: number; img_icon_url?: string }[] };
};
type Schema = {
  game?: { availableGameStats?: { achievements?: { name: string; displayName: string; description?: string; icon?: string; hidden: number }[] } };
};
type PlayerAchievements = { playerstats?: { achievements?: { apiname: string; achieved: number; unlocktime: number }[] } };
type GlobalPercentages = { achievementpercentages?: { achievements?: { name: string; percent: number | string }[] } };

export class SteamProvider implements AchievementProvider {
  async fetchLibrary(account: LinkedAccount): Promise<ProviderGame[]> {
    if (!config.steamApiKey) throw new Error('STEAM_API_KEY is missing from the configuration');
    const key = config.steamApiKey;
    const steamid = account.external_id;

    const owned = await steamGet<OwnedGames>('/IPlayerService/GetOwnedGames/v1/', {
      key, steamid, include_appinfo: '1', include_played_free_games: '1',
    });
    if (!owned?.response.games) {
      throw new Error('Steam is hiding your games: in Steam go to Profile → Privacy Settings and set "Game details" to Public');
    }

    // Cele mai jucate primele; jocurile neîncepute intră și ele (au achievement-uri, doar că 0 deblocate).
    const games = owned.response.games
      .sort((a, b) => b.playtime_forever - a.playtime_forever)
      .slice(0, MAX_GAMES);

    const result = await mapWithLimit(games, CONCURRENCY, async (game): Promise<ProviderGame> => {
      const appid = String(game.appid);
      const schema = await steamGet<Schema>('/ISteamUserStats/GetSchemaForGame/v2/', { key, appid, l: 'english' });
      const definitions = schema?.game?.availableGameStats?.achievements ?? [];

      let unlocked = new Map<string, number>();
      let percentages = new Map<string, number>();
      if (definitions.length > 0) {
        // Un joc nejucat nu poate avea achievement-uri deblocate: sărim peste cererea pentru progres.
        const player = game.playtime_forever > 0
          ? await steamGet<PlayerAchievements>('/ISteamUserStats/GetPlayerAchievements/v1/', { key, steamid, appid })
          : null;
        // unlocktime = 0 înseamnă neobținut (D12), deci păstrăm doar achieved = 1.
        unlocked = new Map((player?.playerstats?.achievements ?? [])
          .filter((a) => a.achieved === 1 && a.unlocktime > 0)
          .map((a) => [a.apiname, a.unlocktime]));
        const global = await steamGet<GlobalPercentages>('/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/', { gameid: appid });
        percentages = new Map((global?.achievementpercentages?.achievements ?? [])
          .map((a) => [a.name, Math.round(Number(a.percent) * 100) / 100]));
      }

      return {
        external_id: appid,
        title: game.name,
        icon_url: game.img_icon_url
          ? `https://media.steampowered.com/steamcommunity/public/images/apps/${appid}/${game.img_icon_url}.jpg`
          : null,
        playtime_minutes: game.playtime_forever,
        last_played_at: game.rtime_last_played ? new Date(game.rtime_last_played * 1000) : null,
        achievements: definitions.map((definition) => {
          const unlockTime = unlocked.get(definition.name);
          return {
            external_id: definition.name,
            name: definition.displayName,
            description: definition.description ?? null,
            icon_url: definition.icon ?? null,
            is_hidden: definition.hidden === 1,
            global_unlock_pct: percentages.get(definition.name) ?? null,
            unlocked_at: unlockTime ? new Date(unlockTime * 1000) : null,
          };
        }),
      };
    });
    return result;
  }
}

// Numele afișat al unui cont Steam (folosit la login-ul Steam). Fără cheie API întoarce null.
export async function fetchSteamPersona(steamid: string): Promise<{ name: string; avatar: string | null } | null> {
  if (!config.steamApiKey) return null;
  type Summaries = { response: { players: { personaname: string; avatarfull?: string }[] } };
  const data = await steamGet<Summaries>('/ISteamUser/GetPlayerSummaries/v2/', { key: config.steamApiKey, steamids: steamid });
  const player = data?.response.players[0];
  return player ? { name: player.personaname, avatar: player.avatarfull ?? null } : null;
}

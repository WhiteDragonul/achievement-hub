// Provider simulat pentru PSN / Xbox / Epic (D36): nu avem acces la API-urile lor, așa că alegem jocuri reale
// din catalogul platformei (generat de fixtures) și „deblocăm” achievement-uri cu probabilitatea dată de raritatea lor.
// Rezultatul e determinist: același cont primește mereu aceeași bibliotecă (seed = external_id),
// deci un sync repetat nu schimbă nimic: exact ca un provider real pentru un cont neschimbat.
import { db } from '../db/db.js';
import type { AchievementProvider, LinkedAccount, ProviderGame } from './providers.js';

// Generator pseudo-aleator mic (mulberry32): același seed → aceeași secvență de numere în [0, 1).
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string) {
  let h = 0;
  for (const char of text) h = (Math.imul(h, 31) + char.charCodeAt(0)) | 0;
  return h;
}

export class MockProvider implements AchievementProvider {
  async fetchLibrary(account: LinkedAccount): Promise<ProviderGame[]> {
    const rand = random(hash(account.external_id));

    const games = await db.selectFrom('games')
      .select(['id', 'external_id', 'title', 'icon_url'])
      .where('platform_id', '=', account.platform_id)
      .orderBy('id')
      .limit(40)
      .execute();
    const picked = games.filter(() => rand() < 0.25); // ~10 jocuri din 40
    if (picked.length === 0) return [];

    const achievements = await db.selectFrom('achievements')
      .select(['game_id', 'external_id', 'name', 'description', 'icon_url', 'is_hidden', 'global_unlock_pct'])
      .where('game_id', 'in', picked.map((game) => game.id))
      .orderBy('id')
      .execute();

    const now = Date.now();
    return picked.map((game) => {
      const playtime = Math.floor(rand() * 6000) + 30;
      return {
        external_id: game.external_id,
        title: game.title,
        icon_url: game.icon_url,
        playtime_minutes: playtime,
        last_played_at: new Date(now - Math.floor(rand() * 90) * 86_400_000),
        achievements: achievements
          .filter((a) => a.game_id === game.id)
          .map((a) => ({
            external_id: a.external_id,
            name: a.name,
            description: a.description,
            icon_url: a.icon_url,
            is_hidden: a.is_hidden,
            global_unlock_pct: a.global_unlock_pct,
            // Un achievement obținut de 60% din jucători are șanse mari, unul de 0,5% aproape niciodată.
            unlocked_at: rand() * 100 < (a.global_unlock_pct ?? 10)
              ? new Date(now - Math.floor(rand() * 365) * 86_400_000)
              : null,
          })),
      };
    });
  }
}

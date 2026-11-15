// Interfața comună a platformelor (D36). Sync-ul (sync.ts) nu știe de unde vin datele: primește o listă de jocuri
// cu achievement-uri și le scrie în DB. Un provider real pentru PSN / Xbox / Epic ar implementa doar fetchLibrary.
import { MockProvider } from './mock-provider.js';
import { SteamProvider } from './steam-provider.js';

export type ProviderAchievement = {
  external_id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  is_hidden: boolean;
  global_unlock_pct: number | null;
  unlocked_at: Date | null; // null = neobținut
};

export type ProviderGame = {
  external_id: string;
  title: string;
  icon_url: string | null;
  playtime_minutes: number;
  last_played_at: Date | null;
  achievements: ProviderAchievement[];
};

export type LinkedAccount = {
  platform_id: number;
  external_id: string;     // SteamID64, accountId PSN etc.
  access_token: string | null; // decriptat din platform_accounts.access_token_enc
};

export interface AchievementProvider {
  fetchLibrary(account: LinkedAccount): Promise<ProviderGame[]>;
}

export function getProvider(platformCode: string, isMock: boolean): AchievementProvider {
  if (!isMock && platformCode === 'steam') return new SteamProvider();
  return new MockProvider();
}

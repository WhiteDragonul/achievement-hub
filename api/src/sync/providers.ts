// Interfața comună a platformelor (D36). Sync-ul (sync.ts) nu știe de unde vin datele: primește o listă de jocuri
// cu achievement-uri și le scrie în DB. Provideri reali: Steam, PSN, Xbox (D55); Epic rămâne pe MockProvider.
import { MockProvider } from './mock-provider.js';
import { PsnProvider } from './psn-provider.js';
import { SteamProvider } from './steam-provider.js';
import { XboxProvider } from './xbox-provider.js';

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
  id: number;              // platform_accounts.id
  platform_id: number;
  external_id: string;     // SteamID64, accountId PSN etc.
  display_name: string;    // numele de pe platformă (la PSN: Online ID-ul)
  access_token: string | null; // decriptat din platform_accounts.access_token_enc (Xbox: refresh token-ul Microsoft)
};

export interface AchievementProvider {
  fetchLibrary(account: LinkedAccount): Promise<ProviderGame[]>;
  // Avatarul contului pe platformă (opțional: MockProvider n-are). Se cere după fetchLibrary, în același sync.
  fetchAvatar?(account: LinkedAccount): Promise<string | null>;
}

export function getProvider(platformCode: string, isMock: boolean): AchievementProvider {
  if (!isMock && platformCode === 'steam') return new SteamProvider();
  if (!isMock && platformCode === 'psn') return new PsnProvider();
  if (!isMock && platformCode === 'xbox') return new XboxProvider();
  return new MockProvider();
}

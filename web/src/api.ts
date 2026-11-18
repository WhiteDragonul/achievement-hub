import { isApp, secureStore } from './native';
// Clientul HTTP pentru API și tipurile răspunsurilor.
// În browser (dezvoltare) cererile merg relativ la /api, prin proxy-ul Vite.
// În aplicația Tauri (etapa 3c) VITE_API_URL conține adresa serverului.
const BASE_URL = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(public status: number, message: string, public constraint?: string) {
    super(message);
  }
}

// ---- Tokenuri (D33) ----
// Tokenul de acces stă doar în memorie (dispare la reîncărcarea paginii); refresh token-ul e păstrat
// ca sesiunea să supraviețuiască reîncărcării. În aplicația Tauri (etapa 3c) locul lui e Keychain / Keystore.
const REFRESH_KEY = 'achievementhub.refresh_token';
let accessToken: string | null = null;

export type Session = { user: { id: number; role: Role; username: string }; access_token: string; refresh_token: string };

export async function saveSession(session: Pick<Session, 'access_token' | 'refresh_token'>) {
  accessToken = session.access_token;
  await secureStore.set(REFRESH_KEY, session.refresh_token);
}

export async function clearSession() {
  accessToken = null;
  await secureStore.delete(REFRESH_KEY);
}

export const storedRefreshToken = () => secureStore.get(REFRESH_KEY);

// Mai multe cereri pot primi 401 în același timp; facem un singur refresh pentru toate.
let refreshing: Promise<boolean> | null = null;
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const refresh_token = await storedRefreshToken();
    if (!refresh_token) return false;
    const response = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token }),
    });
    if (!response.ok) {
      await clearSession();
      return false;
    }
    await saveSession(await response.json());
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function request(path: string, options: { method?: string; body?: unknown }) {
  const headers: Record<string, string> = {};
  if (options.body) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return fetch(`${BASE_URL}/api${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

// Când tokenul de acces expiră (401), îl reînnoim o dată cu refresh token-ul și repetăm cererea.
async function authorizedFetch(path: string, options: { method?: string; body?: unknown } = {}) {
  let response = await request(path, options);
  if (response.status === 401 && !path.startsWith('/auth/') && (await refreshSession())) {
    response = await request(path, options);
  }
  if (response.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('session-expired'));
  return response;
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await authorizedFetch(path, options);
  if (response.status === 204) return undefined as T;

  const data = await response.json();
  // Erorile API-ului au forma { error, constraint? } (vezi api/src/errors.ts).
  if (!response.ok) throw new ApiError(response.status, data.error ?? 'Error', data.constraint);
  return data as T;
}

// Descarcă un raport (CSV / Excel / PDF): cererea trebuie să aibă tokenul, deci nu poate fi un simplu <a href>.
export async function download(path: string, filename: string) {
  const response = await authorizedFetch(path);
  if (!response.ok) throw new ApiError(response.status, (await response.json()).error ?? 'Error');
  const url = URL.createObjectURL(await response.blob());
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}

// În aplicație, Steam trimite înapoi la deep-link-ul achievementhub://, nu la site.
export const steamLoginUrl = `${BASE_URL}/api/auth/steam?client=${isApp ? 'app' : 'web'}`;

// ---- Tipuri (oglindesc răspunsurile din api/src/routes) ----

export type Role = 'user' | 'moderator' | 'admin';
export type Rarity = 'ultra_rare' | 'very_rare' | 'rare' | 'common';

export type User = {
  id: number;
  username: string;
  email: string | null;
  role: Role;
  display_name: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  accent_color?: AccentColor;
  banner?: Banner;
  favorite_game_id?: number | null;
  is_banned: boolean;
  hidden_from_leaderboards: boolean;
  created_at: string;
};

export type Platform = { id: number; code: string; name: string; is_mock: boolean; linkable: boolean };

// Aceleași liste ca CHECK-urile din migrația 009.
export const accentColors = ['violet', 'blue', 'cyan', 'emerald', 'amber', 'rose'] as const;
export const banners = ['aurora', 'sunset', 'ocean', 'forest', 'midnight'] as const;
export type AccentColor = (typeof accentColors)[number];
export type Banner = (typeof banners)[number];

export type UnlockedAchievement = {
  id: number;
  name: string;
  description: string | null;
  icon_url: string | null;
  rarity: Rarity | null;
  global_unlock_pct: number | null;
  game_id: number;
  game_title: string;
  unlocked_at?: string;
};

export type Game = { id: number; platform_id: number; external_id: string; title: string; created_at: string };
export type GameDetail = Game & { achievements_count: number };

export type LeaderboardRow = {
  rank: number;
  user_id: number;
  username: string;
  display_name: string | null;
  achievements: number;
  rare_achievements: number;
  score: number;
};

export type ProfileAccount = {
  id: number;
  platform_id: number;
  platform_code: string;
  platform_name: string;
  external_id: string;
  display_name: string;
  linked_at: string;
  last_synced_at: string | null;
  games: number;
  achievements: number;
};

export type Profile = {
  user: Omit<User, 'email'>;
  accounts: ProfileAccount[];
  rarity_counts: Partial<Record<Rarity, number>>;
  totals: { games: number; playtime_minutes: number; perfect_games: number };
  favorite_game: { id: number; title: string; icon_url: string | null } | null;
  showcase: UnlockedAchievement[];
};

export type LibraryGame = {
  game_id: number;
  title: string;
  icon_url?: string | null;
  platform_code: string;
  platform_account_id: number;
  playtime_minutes: number;
  last_played_at: string | null;
  total_achievements: number;
  unlocked_achievements: number;
};

export type GameAchievement = {
  id: number;
  name: string;
  description: string | null;
  is_hidden: boolean;
  global_unlock_pct: number | null;
  rarity: Rarity | null;
  unlocked_at: string | null;
};

export type GameAchievements = {
  platform_account_id: number | null;
  owns_game: boolean;
  achievements: GameAchievement[];
};

export type Friendship = {
  requester_id: number;
  requester_username: string;
  addressee_id: number;
  addressee_username: string;
  status: 'pending' | 'accepted';
  created_at: string;
  responded_at: string | null;
};

export type Report = {
  id: number;
  reporter_id: number;
  reporter_username: string;
  target_user_id: number;
  target_username: string;
  reason: string;
  status: 'open' | 'resolved' | 'rejected';
  resolved_by: number | null;
  resolution_note: string | null;
  created_at: string;
};

export type SyncRun = {
  id: number;
  platform_account_id: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  created_at: string;
  games_synced: number;
  achievements_synced: number;
  error_message: string | null;
};

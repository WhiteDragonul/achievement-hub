// Clientul HTTP pentru API și tipurile răspunsurilor.
// În browser (dezvoltare) cererile merg relativ la /api, prin proxy-ul Vite.
// În aplicația Tauri (etapa 3c) VITE_API_URL va conține adresa serverului.
const BASE_URL = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(public status: number, message: string, public constraint?: string) {
    super(message);
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}/api${path}`, {
    method: options.method ?? 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (response.status === 204) return undefined as T;

  const data = await response.json();
  // Erorile API-ului au forma { error, constraint? } (vezi api/src/errors.ts).
  if (!response.ok) throw new ApiError(response.status, data.error ?? 'Eroare', data.constraint);
  return data as T;
}

// ---- Tipuri (oglindesc răspunsurile din api/src/routes) ----

export type Role = 'user' | 'moderator' | 'admin';
export type Rarity = 'ultra_rare' | 'very_rare' | 'rare' | 'common';

export type User = {
  id: number;
  username: string;
  email: string | null;
  role: Role;
  display_name: string | null;
  is_banned: boolean;
  hidden_from_leaderboards: boolean;
  created_at: string;
};

export type Platform = { id: number; code: string; name: string; is_mock: boolean };

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
};

export type LibraryGame = {
  game_id: number;
  title: string;
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

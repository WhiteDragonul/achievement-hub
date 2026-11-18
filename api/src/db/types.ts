// Tipurile tabelelor pentru Kysely: oglindesc 1:1 migrațiile din db/migrations.
// Când schimbi o migrație, schimbi și aici.
//
// ColumnType<Select, Insert, Update>:
//   - coloanele GENERATED ALWAYS (id-uri, rarity) au Insert/Update = never: nu le putem scrie;
//   - Generated<T> = coloană cu DEFAULT, opțională la insert;
//   - T | null = coloană nullable, opțională la insert.
import type { ColumnType, Generated } from 'kysely';

type GeneratedAlways<T> = ColumnType<T, never, never>;
type Timestamp = ColumnType<Date, Date | string, Date | string>;
// Timestamp cu DEFAULT now(): opțional la insert.
type TimestampDefault = ColumnType<Date, Date | string | undefined, Date | string>;

export type Role = 'user' | 'moderator' | 'admin';

export const accentColors = ['violet', 'blue', 'cyan', 'emerald', 'amber', 'rose'] as const;
export const banners = ['aurora', 'sunset', 'ocean', 'forest', 'midnight'] as const;
export type AccentColor = (typeof accentColors)[number];
export type Banner = (typeof banners)[number];

export interface UsersTable {
  id: GeneratedAlways<number>;
  username: string;
  email: string | null;
  password_hash: string | null;
  role: Generated<Role>;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  accent_color: Generated<AccentColor>;
  banner: Generated<Banner>;
  favorite_game_id: number | null;
  is_banned: Generated<boolean>;
  hidden_from_leaderboards: Generated<boolean>;
  created_at: TimestampDefault;
  updated_at: TimestampDefault;
}

export interface RefreshTokensTable {
  id: GeneratedAlways<number>;
  user_id: number;
  token_hash: Buffer;
  user_agent: string | null;
  created_at: TimestampDefault;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
}

export interface PlatformsTable {
  id: GeneratedAlways<number>;
  code: string;
  name: string;
  is_mock: Generated<boolean>;
}

export interface PlatformAccountsTable {
  id: GeneratedAlways<number>;
  user_id: number;
  platform_id: number;
  external_id: string;
  display_name: string;
  access_token_enc: Buffer | null;
  avatar_url: string | null;
  linked_at: TimestampDefault;
  last_synced_at: Timestamp | null;
}

export interface GamesTable {
  id: GeneratedAlways<number>;
  platform_id: number;
  external_id: string;
  title: string;
  icon_url: string | null;
  created_at: TimestampDefault;
}

export interface AchievementsTable {
  id: GeneratedAlways<number>;
  game_id: number;
  external_id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  is_hidden: Generated<boolean>;
  global_unlock_pct: number | null;
  rarity: GeneratedAlways<'ultra_rare' | 'very_rare' | 'rare' | 'common' | null>;
}

export interface UserGamesTable {
  platform_account_id: number;
  game_id: number;
  playtime_minutes: Generated<number>;
  last_played_at: Timestamp | null;
}

export interface UserAchievementsTable {
  platform_account_id: number;
  achievement_id: number;
  unlocked_at: Timestamp;
}

export interface SyncRunsTable {
  id: GeneratedAlways<number>;
  platform_account_id: number;
  status: Generated<'queued' | 'running' | 'succeeded' | 'failed'>;
  created_at: TimestampDefault;
  started_at: Timestamp | null;
  finished_at: Timestamp | null;
  games_synced: Generated<number>;
  achievements_synced: Generated<number>;
  error_message: string | null;
}

export interface FriendshipsTable {
  requester_id: number;
  addressee_id: number;
  status: Generated<'pending' | 'accepted'>;
  created_at: TimestampDefault;
  responded_at: Timestamp | null;
}

export interface ReportsTable {
  id: GeneratedAlways<number>;
  reporter_id: number;
  target_user_id: number;
  reason: string;
  status: Generated<'open' | 'resolved' | 'rejected'>;
  resolved_by: number | null;
  resolution_note: string | null;
  created_at: TimestampDefault;
  resolved_at: Timestamp | null;
}

export interface ProfileShowcaseTable {
  user_id: number;
  position: number;
  achievement_id: number;
}

export interface Database {
  users: UsersTable;
  refresh_tokens: RefreshTokensTable;
  platforms: PlatformsTable;
  platform_accounts: PlatformAccountsTable;
  games: GamesTable;
  achievements: AchievementsTable;
  user_games: UserGamesTable;
  user_achievements: UserAchievementsTable;
  sync_runs: SyncRunsTable;
  friendships: FriendshipsTable;
  reports: ReportsTable;
  profile_showcase: ProfileShowcaseTable;
}

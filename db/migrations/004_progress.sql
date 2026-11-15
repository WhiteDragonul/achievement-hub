-- 004: Progresul utilizatorilor (tabelele mari: aici vor fi sutele de mii de rânduri)
-- Legate de platform_account_id, nu de user_id: dezlegarea unui cont șterge în cascadă progresul lui (D5).

CREATE TABLE user_games (
    platform_account_id bigint      NOT NULL REFERENCES platform_accounts (id) ON DELETE CASCADE,
    game_id             bigint      NOT NULL REFERENCES games (id) ON DELETE CASCADE,
    playtime_minutes    integer     NOT NULL DEFAULT 0,
    last_played_at      timestamptz,

    PRIMARY KEY (platform_account_id, game_id),
    CONSTRAINT user_games_playtime_chk CHECK (playtime_minutes >= 0)
);


CREATE TABLE user_achievements (
    platform_account_id bigint      NOT NULL REFERENCES platform_accounts (id) ON DELETE CASCADE,
    achievement_id      bigint      NOT NULL REFERENCES achievements (id) ON DELETE CASCADE,
    unlocked_at         timestamptz NOT NULL,

    PRIMARY KEY (platform_account_id, achievement_id),
    -- Steam raportează unlocktime = 0 pentru achievement-urile neobținute (D12)
    CONSTRAINT user_achievements_unlocked_chk CHECK (unlocked_at >= '2000-01-01')
);


-- Istoricul sincronizărilor (pg-boss ține coada în schema lui; aici păstrăm rezultatul pentru UI și rapoarte).
CREATE TABLE sync_runs (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    platform_account_id bigint      NOT NULL REFERENCES platform_accounts (id) ON DELETE CASCADE,
    status              text        NOT NULL DEFAULT 'queued',
    created_at          timestamptz NOT NULL DEFAULT now(),
    started_at          timestamptz,
    finished_at         timestamptz,
    games_synced        integer     NOT NULL DEFAULT 0,
    achievements_synced integer     NOT NULL DEFAULT 0,
    error_message       text,

    CONSTRAINT sync_runs_status_chk CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
    CONSTRAINT sync_runs_counts_chk CHECK (games_synced >= 0 AND achievements_synced >= 0),
    CONSTRAINT sync_runs_time_chk   CHECK (finished_at >= started_at),
    CONSTRAINT sync_runs_error_chk  CHECK (status <> 'failed' OR error_message IS NOT NULL)
);

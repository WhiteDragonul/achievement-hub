-- 003: Platforme, conturi legate, catalogul de jocuri și achievement-uri

CREATE TABLE platforms (
    id      smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code    text    NOT NULL UNIQUE,       -- folosit în cod pentru a alege providerul
    name    text    NOT NULL,
    is_mock boolean NOT NULL DEFAULT true, -- true = date generate de MockProvider

    CONSTRAINT platforms_code_chk CHECK (code ~ '^[a-z]{2,16}$')
);

-- Date de referință (nu fixtures): aplicația nu funcționează fără ele.
INSERT INTO platforms (code, name, is_mock) VALUES
    ('steam', 'Steam',               false),
    ('psn',   'PlayStation Network', true),
    ('xbox',  'Xbox Network',        true),
    ('epic',  'Epic Games',          true);


CREATE TABLE platform_accounts (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id          bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    platform_id      smallint    NOT NULL REFERENCES platforms (id) ON DELETE RESTRICT,
    external_id      text        NOT NULL,  -- SteamID64, accountId PSN, XUID etc.
    display_name     text        NOT NULL,
    access_token_enc bytea,                 -- pgp_sym_encrypt(token, cheie din env); NULL la Steam (D7)
    linked_at        timestamptz NOT NULL DEFAULT now(),
    last_synced_at   timestamptz,

    -- un singur cont Steam (PSN, ...) per utilizator
    CONSTRAINT platform_accounts_user_platform_uq UNIQUE (user_id, platform_id),
    -- același cont Steam nu poate fi legat de doi utilizatori
    CONSTRAINT platform_accounts_external_uq      UNIQUE (platform_id, external_id)
);


CREATE TABLE games (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    platform_id smallint    NOT NULL REFERENCES platforms (id) ON DELETE RESTRICT,
    external_id text        NOT NULL,  -- appid la Steam, NPWR... la PSN
    title       text        NOT NULL,
    icon_url    text,
    created_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT games_external_uq UNIQUE (platform_id, external_id),
    CONSTRAINT games_title_chk   CHECK (length(trim(title)) > 0)
);


CREATE TABLE achievements (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    game_id           bigint       NOT NULL REFERENCES games (id) ON DELETE CASCADE,
    external_id       text         NOT NULL,  -- "apiname" la Steam
    name              text         NOT NULL,
    description       text,
    icon_url          text,
    is_hidden         boolean      NOT NULL DEFAULT false,
    global_unlock_pct numeric(5,2),           -- % din jucătorii platformei care îl au; NULL = necunoscut

    -- Coloană generată (D8): pragurile de raritate sunt definite o singură dată, aici.
    rarity text GENERATED ALWAYS AS (
        CASE
            WHEN global_unlock_pct IS NULL THEN NULL
            WHEN global_unlock_pct < 1     THEN 'ultra_rare'
            WHEN global_unlock_pct < 5     THEN 'very_rare'
            WHEN global_unlock_pct < 20    THEN 'rare'
            ELSE 'common'
        END
    ) STORED,

    CONSTRAINT achievements_external_uq UNIQUE (game_id, external_id),
    CONSTRAINT achievements_pct_chk     CHECK (global_unlock_pct BETWEEN 0 AND 100)
);

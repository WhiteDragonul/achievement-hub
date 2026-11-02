-- 002 — Utilizatori și sesiuni

CREATE TABLE users (
    id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username                 text        NOT NULL,
    email                    text,                 -- NULL pentru conturile create prin login Steam
    password_hash            text,                 -- hash argon2 (include salt + parametri); NULL = fără login cu parolă
    role                     text        NOT NULL DEFAULT 'user',
    display_name             text,
    avatar_url               text,
    is_banned                boolean     NOT NULL DEFAULT false,
    hidden_from_leaderboards boolean     NOT NULL DEFAULT false,  -- setat de moderatori (ex. achievement-uri suspecte)
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT users_role_chk            CHECK (role IN ('user', 'moderator', 'admin')),
    CONSTRAINT users_username_format_chk CHECK (username ~ '^[A-Za-z0-9_]{3,32}$'),
    CONSTRAINT users_email_format_chk    CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    -- login cu parolă = email + parolă, deci o parolă fără email n-ar putea fi folosită niciodată
    CONSTRAINT users_password_needs_email_chk CHECK (password_hash IS NULL OR email IS NOT NULL)
);

-- Unicitate case-insensitive: "Ana" și "ana" sunt același username.
-- Indexul unic pe expresie ignoră NULL-urile, deci pot exista oricâți useri fără email.
CREATE UNIQUE INDEX users_username_lower_uq ON users (lower(username));
CREATE UNIQUE INDEX users_email_lower_uq    ON users (lower(email));


CREATE TABLE refresh_tokens (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash bytea       NOT NULL UNIQUE,   -- sha256(token); tokenul în clar există doar la client (D6)
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,                   -- logout sau rotație; NULL = încă valid (dacă nu a expirat)

    CONSTRAINT refresh_tokens_expiry_chk  CHECK (expires_at > created_at),
    CONSTRAINT refresh_tokens_revoked_chk CHECK (revoked_at >= created_at)
);

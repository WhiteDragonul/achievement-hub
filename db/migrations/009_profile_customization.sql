-- 009 — Personalizarea profilului (D46)
-- Câmpurile noi au valori implicite, deci userii existenți nu trebuie actualizați.

ALTER TABLE users
    ADD COLUMN bio              text,
    ADD COLUMN accent_color     text   NOT NULL DEFAULT 'violet',
    ADD COLUMN banner           text   NOT NULL DEFAULT 'aurora',
    -- Jocul preferat, afișat pe profil. Dacă jocul dispare din catalog, câmpul devine NULL (nu se șterge userul).
    ADD COLUMN favorite_game_id bigint REFERENCES games (id) ON DELETE SET NULL,
    ADD CONSTRAINT users_bio_len_chk    CHECK (char_length(bio) <= 300),
    -- Valori dintr-o listă fixă (nu culori libere): interfața are câte o temă pentru fiecare.
    ADD CONSTRAINT users_accent_chk     CHECK (accent_color IN ('violet', 'blue', 'cyan', 'emerald', 'amber', 'rose')),
    ADD CONSTRAINT users_banner_chk     CHECK (banner IN ('aurora', 'sunset', 'ocean', 'forest', 'midnight')),
    ADD CONSTRAINT users_avatar_url_chk CHECK (avatar_url ~ '^https://');

-- Vitrina: până la 3 achievement-uri alese de user, afișate în capul profilului.
CREATE TABLE profile_showcase (
    user_id        bigint   NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    position       smallint NOT NULL,
    achievement_id bigint   NOT NULL REFERENCES achievements (id) ON DELETE CASCADE,

    PRIMARY KEY (user_id, position),
    CONSTRAINT profile_showcase_position_chk CHECK (position BETWEEN 1 AND 3),
    CONSTRAINT profile_showcase_unique_uq    UNIQUE (user_id, achievement_id)  -- același achievement o singură dată
);
-- Că achievement-ul e chiar deblocat de user se verifică în API (ar cere un trigger: join prin platform_accounts).

ALTER TABLE profile_showcase ENABLE ROW LEVEL SECURITY;  -- la fel ca restul tabelelor (006)

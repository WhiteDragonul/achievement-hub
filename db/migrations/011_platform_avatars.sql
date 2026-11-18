-- 011: Avatarul fiecărui cont de platformă (Steam / PSN / Xbox), actualizat la fiecare sync.
-- Userul își poate alege avatarul profilului dintre ele sau unul propriu (users.avatar_url rămâne sursa afișată).
ALTER TABLE platform_accounts
    ADD COLUMN avatar_url text,
    ADD CONSTRAINT platform_accounts_avatar_url_chk CHECK (avatar_url ~ '^https://');

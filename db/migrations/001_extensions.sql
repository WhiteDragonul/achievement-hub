-- 001 — Extensii
-- pgcrypto: pgp_sym_encrypt / pgp_sym_decrypt pentru tokenurile platformelor (vezi DECISIONS.md D7).
-- Pe Supabase extensia e deja instalată (în schema "extensions", care e în search_path), deci comanda nu face nimic.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

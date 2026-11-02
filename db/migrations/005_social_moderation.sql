-- 005 — Prieteni și raportări (moderare)

CREATE TABLE friendships (
    requester_id bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    addressee_id bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status       text        NOT NULL DEFAULT 'pending',  -- o cerere refuzată se șterge
    created_at   timestamptz NOT NULL DEFAULT now(),
    responded_at timestamptz,

    PRIMARY KEY (requester_id, addressee_id),
    CONSTRAINT friendships_not_self_chk  CHECK (requester_id <> addressee_id),
    CONSTRAINT friendships_status_chk    CHECK (status IN ('pending', 'accepted')),
    CONSTRAINT friendships_responded_chk CHECK ((status = 'pending') = (responded_at IS NULL))
);

-- A→B și B→A sunt aceeași prietenie: unicitate pe perechea neordonată (D9).
CREATE UNIQUE INDEX friendships_pair_uq
    ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));


-- Un utilizator raportează alt profil (ex. achievement-uri obținute suspect); un moderator rezolvă raportarea.
CREATE TABLE reports (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reporter_id     bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    target_user_id  bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    reason          text        NOT NULL,
    status          text        NOT NULL DEFAULT 'open',
    resolved_by     bigint      REFERENCES users (id) ON DELETE SET NULL,  -- moderatorul; NULL dacă a fost șters
    resolution_note text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    resolved_at     timestamptz,

    CONSTRAINT reports_not_self_chk   CHECK (reporter_id <> target_user_id),
    CONSTRAINT reports_status_chk     CHECK (status IN ('open', 'resolved', 'rejected')),
    CONSTRAINT reports_reason_chk     CHECK (length(trim(reason)) BETWEEN 5 AND 1000),
    CONSTRAINT reports_resolution_chk CHECK ((status = 'open') = (resolved_at IS NULL))
);

-- P1 account settings and single-use session recovery links.
ALTER TABLE auth_session ADD COLUMN IF NOT EXISTS credential_setup_required boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS one_time_session_link (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS ix_one_time_session_link_user_active
 ON one_time_session_link(user_id,expires_at DESC)
 WHERE used_at IS NULL AND revoked_at IS NULL;

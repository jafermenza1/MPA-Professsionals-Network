-- P2 reports, explicit permissions and one-time onboarding for bulk-imported MPA members.
CREATE TABLE IF NOT EXISTS member_invitation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 created_by uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
 import_id uuid REFERENCES membership_import(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);
CREATE INDEX IF NOT EXISTS ix_member_invitation_user ON member_invitation(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_member_invitation_expiry ON member_invitation(expires_at) WHERE consumed_at IS NULL;

INSERT INTO app_permission(permission_code,area,label,description,sensitive,system_only)
VALUES
 ('reports.view','reports','View operational reports','View reports permitted for the current staff role.',false,false),
 ('reports.sensitive','reports','View sensitive reports','View restricted personal or financial report data.',true,true),
 ('members.import','membership','Import approved members','Preview and apply approved MPA member imports and export member details.',true,true)
ON CONFLICT (permission_code) DO NOTHING;

-- Gate 2: organization-owned mentorship programs are distinct from individual mentor profiles.
-- Requests are kept private to the requester and the verified organization team.
CREATE TABLE IF NOT EXISTS organization_mentorship_offer (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organization(id) ON DELETE RESTRICT,
 created_by uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
 title text NOT NULL CHECK (length(trim(title)) BETWEEN 4 AND 180),
 description text NOT NULL CHECK (length(trim(description)) BETWEEN 10 AND 5000),
 expertise jsonb NOT NULL DEFAULT '[]'::jsonb,
 languages jsonb NOT NULL DEFAULT '[]'::jsonb,
 delivery_mode text NOT NULL DEFAULT 'flexible' CHECK (delivery_mode IN ('remote','onsite','hybrid','flexible')),
 visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','members')),
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','paused','closed')),
 moderation_status text NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending','approved','needs_correction','rejected')),
 moderation_note text,
 moderated_by uuid REFERENCES app_user(id) ON DELETE RESTRICT,
 moderated_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_org_mentorship_offer_review ON organization_mentorship_offer(moderation_status,status,created_at);
CREATE INDEX IF NOT EXISTS ix_org_mentorship_offer_public ON organization_mentorship_offer(organization_id,status,moderation_status);
CREATE TABLE IF NOT EXISTS organization_mentorship_request (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 offer_id uuid NOT NULL REFERENCES organization_mentorship_offer(id) ON DELETE RESTRICT,
 requester_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
 message text NOT NULL CHECK (length(trim(message)) BETWEEN 10 AND 3000),
 status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','accepted','declined','cancelled','completed')),
 response_note text,
 responded_by uuid REFERENCES app_user(id) ON DELETE RESTRICT,
 responded_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(offer_id,requester_user_id)
);
CREATE INDEX IF NOT EXISTS ix_org_mentorship_request_user ON organization_mentorship_request(requester_user_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_org_mentorship_request_offer ON organization_mentorship_request(offer_id,status,created_at DESC);

-- P1 marketplace moderation and privacy-safe service/mentorship demand.
-- All demand starts private; only reviewed generalized topics are visible publicly.
ALTER TABLE service_listing ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'pending'
  CHECK (moderation_status IN ('pending','approved','needs_correction','rejected'));
ALTER TABLE service_listing ADD COLUMN IF NOT EXISTS moderation_note text;
ALTER TABLE service_listing ADD COLUMN IF NOT EXISTS moderated_by uuid REFERENCES app_user(id) ON DELETE RESTRICT;
ALTER TABLE service_listing ADD COLUMN IF NOT EXISTS moderated_at timestamptz;
ALTER TABLE mentor_profile ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'pending'
  CHECK (moderation_status IN ('pending','approved','needs_correction','rejected'));
ALTER TABLE mentor_profile ADD COLUMN IF NOT EXISTS moderation_note text;
ALTER TABLE mentor_profile ADD COLUMN IF NOT EXISTS moderated_by uuid REFERENCES app_user(id) ON DELETE RESTRICT;
ALTER TABLE mentor_profile ADD COLUMN IF NOT EXISTS moderated_at timestamptz;
-- Existing published/active records predate moderation. Preserve their current visibility as reviewed,
-- but do not auto-approve any newly submitted record.
UPDATE service_listing SET moderation_status='approved' WHERE status='published' AND moderation_status='pending';
UPDATE mentor_profile SET moderation_status='approved' WHERE status='active' AND moderation_status='pending';
CREATE INDEX IF NOT EXISTS ix_service_listing_moderation ON service_listing(moderation_status,updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_mentor_profile_moderation ON mentor_profile(moderation_status,updated_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_demand (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 demand_type text NOT NULL CHECK (demand_type IN ('service','mentorship')),
 requester_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
 organization_id uuid REFERENCES organization(id) ON DELETE RESTRICT,
 title text NOT NULL CHECK (length(trim(title)) BETWEEN 4 AND 180),
 description text NOT NULL CHECK (length(trim(description)) BETWEEN 10 AND 5000),
 category text NOT NULL,
 delivery_mode text NOT NULL DEFAULT 'flexible' CHECK (delivery_mode IN ('remote','onsite','hybrid','flexible')),
 location_label text,
 desired_timing text,
 audience text NOT NULL DEFAULT 'private' CHECK (audience IN ('private','organization')),
 status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','clarification_needed','matched','topic_published','converted','closed','declined')),
 internal_note text,
 outcome_code text CHECK (outcome_code IS NULL OR outcome_code IN ('provider_search','topic_published','listing_created','program_project','no_action','duplicate_merged','declined')),
 outcome_note text,
 reviewed_by uuid REFERENCES app_user(id) ON DELETE RESTRICT,
 reviewed_at timestamptz,
 resolved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((audience='organization' AND organization_id IS NOT NULL) OR audience='private')
);
CREATE INDEX IF NOT EXISTS ix_marketplace_demand_queue ON marketplace_demand(status,demand_type,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_marketplace_demand_requester ON marketplace_demand(requester_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_marketplace_demand_organization ON marketplace_demand(organization_id,created_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_demand_topic (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 demand_type text NOT NULL CHECK (demand_type IN ('service','mentorship')),
 title text NOT NULL CHECK (length(trim(title)) BETWEEN 4 AND 180),
 summary text NOT NULL CHECK (length(trim(summary)) BETWEEN 10 AND 1000),
 category text NOT NULL,
 delivery_mode text NOT NULL DEFAULT 'flexible' CHECK (delivery_mode IN ('remote','onsite','hybrid','flexible')),
 location_label text,
 interest_goal integer CHECK (interest_goal IS NULL OR interest_goal > 0),
 status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','paused','matched','converted','closed')),
 published_by uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
 source_demand_id uuid REFERENCES marketplace_demand(id) ON DELETE RESTRICT,
 published_at timestamptz NOT NULL DEFAULT now(),
 closes_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_marketplace_demand_topic_feed ON marketplace_demand_topic(status,demand_type,published_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_demand_interest (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 topic_id uuid NOT NULL REFERENCES marketplace_demand_topic(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
 interest_level text NOT NULL CHECK (interest_level IN ('exploring','interested','ready_to_engage','can_provide')),
 comment text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(topic_id,user_id),
 CHECK (comment IS NULL OR length(comment) <= 1000)
);
CREATE INDEX IF NOT EXISTS ix_marketplace_demand_interest_topic ON marketplace_demand_interest(topic_id,interest_level,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_marketplace_demand_interest_user ON marketplace_demand_interest(user_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_demand_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 demand_id uuid REFERENCES marketplace_demand(id) ON DELETE RESTRICT,
 topic_id uuid REFERENCES marketplace_demand_topic(id) ON DELETE RESTRICT,
 actor_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
 action text NOT NULL,
 from_status text,
 to_status text,
 note text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (demand_id IS NOT NULL OR topic_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_marketplace_demand_event_demand ON marketplace_demand_event(demand_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_marketplace_demand_event_topic ON marketplace_demand_event(topic_id,created_at DESC);

-- Gate 2: explicit provider-to-demand matches with provider response tracking.
CREATE TABLE IF NOT EXISTS marketplace_demand_provider_match (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 demand_id uuid NOT NULL REFERENCES marketplace_demand(id) ON DELETE RESTRICT,
 listing_type text NOT NULL CHECK (listing_type IN ('service','mentorship','organization_mentorship')),
 listing_id uuid NOT NULL,
 provider_user_id uuid REFERENCES app_user(id) ON DELETE RESTRICT,
 organization_id uuid REFERENCES organization(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','accepted','declined','withdrawn','completed')),
 matched_by uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
 match_note text,
 response_note text,
 responded_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(demand_id,listing_type,listing_id),
 CHECK ((provider_user_id IS NOT NULL AND organization_id IS NULL) OR (provider_user_id IS NULL AND organization_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ix_marketplace_demand_match_demand ON marketplace_demand_provider_match(demand_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_marketplace_demand_match_provider ON marketplace_demand_provider_match(provider_user_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_marketplace_demand_match_org ON marketplace_demand_provider_match(organization_id,status,created_at DESC);

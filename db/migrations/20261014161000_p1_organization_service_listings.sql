-- Organization-owned provider listings remain moderated like individual listings.
ALTER TABLE service_listing ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organization(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS ix_service_listing_organization ON service_listing(organization_id,status,moderation_status);

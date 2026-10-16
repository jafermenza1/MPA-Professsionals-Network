-- Auditable duplicate-demand merge references.
-- Merge retains each original private request and its history; it never copies private details into public topic content.
ALTER TABLE marketplace_demand
  ADD COLUMN IF NOT EXISTS merged_into_demand_id uuid REFERENCES marketplace_demand(id) ON DELETE RESTRICT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketplace_demand_not_merged_into_self'
      AND conrelid = 'marketplace_demand'::regclass
  ) THEN
    ALTER TABLE marketplace_demand
      ADD CONSTRAINT marketplace_demand_not_merged_into_self
      CHECK (merged_into_demand_id IS NULL OR merged_into_demand_id <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_marketplace_demand_merged_into
  ON marketplace_demand(merged_into_demand_id)
  WHERE merged_into_demand_id IS NOT NULL;

-- notification_event is the existing in-app notification ledger.
-- Email/SMS dispatch uses the existing notification_outbox/provider boundary and is not claimed by this migration.

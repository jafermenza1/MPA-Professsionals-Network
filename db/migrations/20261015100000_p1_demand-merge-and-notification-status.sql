-- Durable, auditable duplicate-demand merge references and honest in-app notification state.
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

-- Notification events are in-app records. Provider delivery is explicitly tracked separately;
-- existing events are not falsely marked as email/SMS delivered.
ALTER TABLE notification_event
  ADD COLUMN IF NOT EXISTS delivery_channel text NOT NULL DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'recorded',
  ADD COLUMN IF NOT EXISTS delivery_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_delivery_error text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notification_event_delivery_channel_valid'
      AND conrelid = 'notification_event'::regclass
  ) THEN
    ALTER TABLE notification_event
      ADD CONSTRAINT notification_event_delivery_channel_valid
      CHECK (delivery_channel IN ('in_app','email','sms'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notification_event_delivery_status_valid'
      AND conrelid = 'notification_event'::regclass
  ) THEN
    ALTER TABLE notification_event
      ADD CONSTRAINT notification_event_delivery_status_valid
      CHECK (delivery_status IN ('recorded','queued','delivered','failed','not_configured'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notification_event_delivery_attempts_nonnegative'
      AND conrelid = 'notification_event'::regclass
  ) THEN
    ALTER TABLE notification_event
      ADD CONSTRAINT notification_event_delivery_attempts_nonnegative
      CHECK (delivery_attempts >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_notification_event_delivery
  ON notification_event(delivery_channel,delivery_status,created_at DESC);

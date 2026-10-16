CREATE TABLE IF NOT EXISTS saved_discovery_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('professional','organization','service','mentor')),
  item_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_discovery_item_owner_type_target_unique UNIQUE(user_id,item_type,item_id)
);
CREATE INDEX IF NOT EXISTS saved_discovery_item_owner_created_idx
  ON saved_discovery_item(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS saved_discovery_item_target_idx
  ON saved_discovery_item(item_type,item_id);

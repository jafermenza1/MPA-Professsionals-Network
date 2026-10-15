-- Personal, role-authorized saved report configurations. Views are private to their owner.
CREATE TABLE IF NOT EXISTS report_saved_view (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  report_id text NOT NULL,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(name)) BETWEEN 1 AND 100),
  CHECK (jsonb_typeof(filters)='object')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_report_saved_view_owner_report_name
  ON report_saved_view(owner_user_id,report_id,lower(name));
CREATE INDEX IF NOT EXISTS ix_report_saved_view_owner
  ON report_saved_view(owner_user_id,updated_at DESC);

-- Additive passkey policy state. Kept separate so already-recorded migrations remain immutable.
alter table app_user add column if not exists admin_passkey_enforced_at timestamptz;

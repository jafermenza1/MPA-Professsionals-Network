-- One-time recovery codes let an administrator replace a lost passkey using a restricted recovery session.
create table if not exists admin_passkey_recovery_code (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  code_hash text not null unique,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
create index if not exists ix_admin_passkey_recovery_active on admin_passkey_recovery_code(user_id,created_at desc) where consumed_at is null;

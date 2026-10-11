-- Production hardening: sessions, login throttling, bootstrap-safe admin provisioning.
create table if not exists auth_session (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  ip_address inet,
  user_agent text
);
create index if not exists ix_auth_session_user on auth_session(user_id, revoked_at, expires_at);

create table if not exists auth_login_attempt (
  id bigserial primary key,
  identity_key text not null,
  ip_address inet,
  attempted_at timestamptz not null default now(),
  succeeded boolean not null default false
);
create index if not exists ix_auth_login_attempt_lookup on auth_login_attempt(identity_key, attempted_at desc);
create index if not exists ix_auth_login_attempt_ip on auth_login_attempt(ip_address, attempted_at desc);

create table if not exists admin_bootstrap_event (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_user(id) on delete restrict,
  created_at timestamptz not null default now(),
  source text not null,
  metadata jsonb not null default '{}'::jsonb
);

insert into app_role(role_code,name,description) values
 ('admin','Platform Administrator','Operational administration without system bootstrap ownership'),
 ('organization_admin','Organization Administrator','Organization administration'),
 ('recruiter','Recruiter','Authorized recruiting operations'),
 ('project_manager','Project Manager','Authorized project and organization opportunity operations'),
 ('read_only','Read Only','Non-mutating organizational visibility'),
 ('mentor','Mentor','Approved mentorship role')
on conflict (role_code) do nothing;

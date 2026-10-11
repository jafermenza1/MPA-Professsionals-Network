-- Phase 0 platform foundation: identity, authorization, audit, storage,
-- notification and payment provider boundaries.

create table if not exists app_user (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  email text unique,
  password_hash text,
  status text not null default 'active' check (status in ('active','suspended','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_role (
  id uuid primary key default gen_random_uuid(),
  role_code text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists app_user_role (
  user_id uuid not null references app_user(id) on delete restrict,
  role_id uuid not null references app_role(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references app_user(id) on delete restrict,
  primary key (user_id, role_id)
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references app_user(id) on delete restrict,
  action text not null,
  resource_type text not null,
  resource_id text,
  request_id text,
  ip_address inet,
  user_agent text,
  outcome text not null check (outcome in ('success','failure')),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists ix_audit_log_resource on audit_log(resource_type, resource_id, occurred_at desc);
create index if not exists ix_audit_log_actor on audit_log(actor_user_id, occurred_at desc);

create table if not exists file_object (
  id uuid primary key default gen_random_uuid(),
  storage_provider text not null,
  object_key text not null,
  original_name text not null,
  content_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  checksum_sha256 text,
  visibility text not null default 'private',
  created_by uuid references app_user(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(storage_provider, object_key)
);

create table if not exists notification_outbox (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email','sms','push','in_app')),
  recipient text not null,
  template_code text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists ix_notification_outbox_dispatch on notification_outbox(status, next_attempt_at);

create table if not exists payment_transaction (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_transaction_id text,
  idempotency_key text not null unique,
  purpose text not null,
  amount numeric(14,2) not null check (amount >= 0),
  currency char(3) not null,
  status text not null check (status in ('initiated','pending','succeeded','failed','refunded','cancelled')),
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index if not exists uq_payment_provider_transaction on payment_transaction(provider, provider_transaction_id) where provider_transaction_id is not null;

insert into app_role(role_code,name,description) values
 ('system_admin','System Administrator','Platform foundation administration'),
 ('reviewer','Reviewer','Review and approval operations'),
 ('finance_officer','Finance Officer','Payment and finance operations'),
 ('member','Member','Authenticated association member')
on conflict (role_code) do nothing;

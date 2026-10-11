-- Membership legacy migration + manual/online payment reconciliation foundation.

create table if not exists membership_record (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_user(id) on delete restrict,
  legacy_member_id text,
  membership_product_id uuid references membership_product(id) on delete restrict,
  membership_number text,
  status text not null default 'pending' check (status in ('pending','active','expired','suspended','cancelled','merged')),
  start_date date,
  end_date date,
  source text not null default 'online' check (source in ('online','legacy_import','admin')),
  source_import_id uuid,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source, legacy_member_id)
);

create index if not exists ix_membership_record_user on membership_record(user_id);
create index if not exists ix_membership_record_number on membership_record(membership_number);

create table if not exists membership_import (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  source_system text,
  status text not null default 'uploaded' check (status in ('uploaded','validated','review','approved','applied','failed','cancelled')),
  row_count integer not null default 0,
  matched_count integer not null default 0,
  new_count integer not null default 0,
  conflict_count integer not null default 0,
  applied_at timestamptz,
  created_by uuid references app_user(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table membership_record
  drop constraint if exists fk_membership_import;
alter table membership_record
  add constraint fk_membership_import foreign key (source_import_id)
  references membership_import(id) on delete restrict;

create table if not exists membership_import_row (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references membership_import(id) on delete restrict,
  row_number integer not null,
  legacy_member_id text,
  email text,
  phone text,
  membership_number text,
  full_name text,
  product_code text,
  status text,
  start_date date,
  end_date date,
  paid_amount numeric(14,2),
  paid_currency char(3),
  payment_reference text,
  raw_payload jsonb not null default '{}'::jsonb,
  match_status text not null default 'unmatched' check (match_status in ('unmatched','matched','new','conflict','ignored','applied')),
  matched_user_id uuid references app_user(id) on delete restrict,
  matched_membership_id uuid references membership_record(id) on delete restrict,
  match_reason text,
  diagnostics jsonb not null default '[]'::jsonb,
  unique(import_id,row_number)
);

create index if not exists ix_membership_import_row_match on membership_import_row(import_id,match_status);

create table if not exists membership_match_candidate (
  id uuid primary key default gen_random_uuid(),
  import_row_id uuid not null references membership_import_row(id) on delete restrict,
  user_id uuid references app_user(id) on delete restrict,
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  reasons jsonb not null default '[]'::jsonb,
  selected boolean not null default false,
  reviewed_by uuid references app_user(id) on delete restrict,
  reviewed_at timestamptz
);

create table if not exists membership_event (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references membership_record(id) on delete restrict,
  event_type text not null,
  effective_at timestamptz not null default now(),
  actor_user_id uuid references app_user(id) on delete restrict,
  source text not null,
  details jsonb not null default '{}'::jsonb
);
create index if not exists ix_membership_event_history on membership_event(membership_id,effective_at desc);

-- Payment channel is intentionally extensible: online providers and manual verification
-- are represented by the same transaction lifecycle.
alter table payment_transaction
  add column if not exists channel text not null default 'online'
    check (channel in ('online','manual','bank_transfer','cash','other')),
  add column if not exists evidence_file_id uuid references file_object(id) on delete restrict,
  add column if not exists submitted_by uuid references app_user(id) on delete restrict,
  add column if not exists verified_by uuid references app_user(id) on delete restrict,
  add column if not exists verified_at timestamptz,
  add column if not exists verification_note text,
  add column if not exists purpose_reference text;

create table if not exists payment_verification (
  id uuid primary key default gen_random_uuid(),
  payment_transaction_id uuid not null references payment_transaction(id) on delete restrict,
  verifier_user_id uuid not null references app_user(id) on delete restrict,
  decision text not null check (decision in ('approved','rejected','needs_correction')),
  evidence_checked jsonb not null default '[]'::jsonb,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists ix_payment_verification_payment on payment_verification(payment_transaction_id,created_at desc);

-- Never allow an imported historical payment to be silently treated as a current
-- gateway-confirmed payment.
alter table payment_transaction
  add column if not exists source text not null default 'system'
    check (source in ('system','legacy_import','manual_entry','provider_webhook'));

create table if not exists payment_reconciliation (
  id uuid primary key default gen_random_uuid(),
  payment_transaction_id uuid not null references payment_transaction(id) on delete restrict,
  membership_id uuid references membership_record(id) on delete restrict,
  reconciliation_status text not null default 'unreconciled'
    check (reconciliation_status in ('unreconciled','matched','disputed','written_off')),
  reconciled_by uuid references app_user(id) on delete restrict,
  reconciled_at timestamptz,
  note text
);

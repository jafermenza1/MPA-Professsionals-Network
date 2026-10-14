-- P0: auditable full reversal/refund records for membership payments.
-- A refunded payment is never eligible for membership activation.
create table if not exists membership_payment_reversal (
  id uuid primary key default gen_random_uuid(),
  payment_transaction_id uuid not null unique references payment_transaction(id) on delete restrict,
  application_id uuid not null references membership_application(id) on delete restrict,
  reversal_type text not null check (reversal_type in ('refund','reversal')),
  reason text not null check (length(trim(reason)) >= 8),
  evidence_reference text,
  reversed_by uuid not null references app_user(id) on delete restrict,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists ix_membership_payment_reversal_application
  on membership_payment_reversal(application_id, created_at desc);

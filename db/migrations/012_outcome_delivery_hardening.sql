-- Outcome delivery hardening for Phases 2-4.
-- Converts discovery/matching workflows into consent-based engagement and measurable outcomes.

create table if not exists talent_inquiry (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references app_user(id) on delete restrict,
  professional_user_id uuid not null references app_user(id) on delete restrict,
  organization_id uuid references organization(id) on delete restrict,
  subject text not null,
  message text not null,
  status text not null default 'requested'
    check (status in ('requested','accepted','declined','closed')),
  response text,
  contact_release boolean not null default false,
  responded_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_user_id <> professional_user_id)
);
create index if not exists ix_talent_inquiry_professional on talent_inquiry(professional_user_id,status,created_at desc);
create index if not exists ix_talent_inquiry_requester on talent_inquiry(requester_user_id,status,created_at desc);

alter table service_request
  add column if not exists scope text,
  add column if not exists agreed_price numeric(14,2),
  add column if not exists agreed_currency char(3),
  add column if not exists completion_due_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists provider_completed_at timestamptz,
  add column if not exists requester_accepted_at timestamptz,
  add column if not exists outcome_summary text,
  add constraint service_request_agreed_price_check check (agreed_price is null or agreed_price >= 0);

create table if not exists service_request_milestone (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references service_request(id) on delete restrict,
  title text not null,
  description text,
  due_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending','in_progress','submitted','accepted','revision_requested','completed','cancelled')),
  completed_at timestamptz,
  created_by uuid not null references app_user(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_service_request_milestone on service_request_milestone(request_id,status,due_at);

create table if not exists service_request_delivery (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references service_request(id) on delete restrict,
  milestone_id uuid references service_request_milestone(id) on delete restrict,
  submitted_by uuid not null references app_user(id) on delete restrict,
  description text not null,
  file_object_id uuid references file_object(id) on delete restrict,
  status text not null default 'submitted'
    check (status in ('submitted','accepted','revision_requested')),
  reviewer_note text,
  reviewed_by uuid references app_user(id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ix_service_request_delivery on service_request_delivery(request_id,created_at desc);

create table if not exists service_request_feedback (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references service_request(id) on delete restrict,
  reviewer_user_id uuid not null references app_user(id) on delete restrict,
  target_role text not null check (target_role in ('provider','requester','service')),
  rating smallint check (rating is null or rating between 1 and 5),
  comments text,
  created_at timestamptz not null default now(),
  unique(request_id,reviewer_user_id,target_role)
);
create index if not exists ix_service_request_feedback on service_request_feedback(request_id,created_at desc);

alter table job_application
  add column if not exists offer_amount numeric(14,2),
  add column if not exists offer_currency char(3),
  add column if not exists offer_terms text,
  add column if not exists offer_issued_at timestamptz,
  add column if not exists offer_responded_at timestamptz,
  add column if not exists hired_at timestamptz;

create table if not exists mentorship_goal (
  id uuid primary key default gen_random_uuid(),
  mentorship_id uuid not null references mentorship(id) on delete restrict,
  title text not null,
  description text,
  success_measure text,
  target_date date,
  status text not null default 'planned'
    check (status in ('planned','in_progress','achieved','not_achieved','cancelled')),
  owner_role text not null default 'shared' check (owner_role in ('mentor','mentee','shared')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_mentorship_goal on mentorship_goal(mentorship_id,status,target_date);

alter table mentorship_session
  add column if not exists outcome text,
  add column if not exists next_steps text;

comment on table talent_inquiry is 'Consent-based bridge from verified talent discovery to a direct professional opportunity without exposing contact details by default.';
comment on table service_request_milestone is 'Measurable service delivery checkpoint; a request is not considered outcome-complete merely because participants connected.';
comment on table service_request_delivery is 'Provider delivery evidence or deliverable submitted for requester acceptance.';
comment on table service_request_feedback is 'Post-delivery feedback for service quality; separate from professional verification.';
comment on table mentorship_goal is 'Outcome-oriented mentorship goal with an explicit success measure.';

create table if not exists service_payment (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references service_request(id) on delete restrict,
  payment_transaction_id uuid not null unique references payment_transaction(id) on delete restrict,
  payer_user_id uuid not null references app_user(id) on delete restrict,
  provider_user_id uuid not null references app_user(id) on delete restrict,
  amount numeric(14,2) not null check (amount >= 0),
  currency char(3) not null,
  channel text not null check (channel in ('online','manual','bank_transfer','cash','other')),
  status text not null default 'pending' check (status in ('pending','succeeded','failed','refunded','cancelled')),
  evidence_file_id uuid references file_object(id) on delete restrict,
  submitted_by uuid not null references app_user(id) on delete restrict,
  verified_by uuid references app_user(id) on delete restrict,
  verified_at timestamptz,
  verification_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_service_payment_request on service_payment(request_id,status,created_at desc);
create index if not exists ix_service_payment_provider on service_payment(provider_user_id,status,created_at desc);

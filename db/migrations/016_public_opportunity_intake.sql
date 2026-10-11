-- Public opportunity intake: low-friction intent/contact first, detailed application later.
-- This does not bypass job/mentorship eligibility. It creates an auditable inquiry that authorized actors may consider.
create table if not exists public_opportunity_inquiry (
  id uuid primary key default gen_random_uuid(),
  inquiry_type text not null check (inquiry_type in ('job','mentorship')),
  job_id uuid references job(id) on delete restrict,
  preferred_mentor_user_id uuid references app_user(id) on delete restrict,
  public_reference text not null unique,
  continuation_token_hash text not null unique,
  contact_name text not null,
  contact_email text,
  contact_phone text,
  intent text not null,
  consent boolean not null default false,
  app_user_id uuid references app_user(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'received'
    check (status in ('received','contacted','considering','invited','converted','declined','closed')),
  consider_non_member boolean not null default false,
  decision_note text,
  decided_by uuid references app_user(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (contact_email is not null or contact_phone is not null),
  check (inquiry_type='job' or job_id is null)
);
create index if not exists ix_public_inquiry_job on public_opportunity_inquiry(job_id,status,created_at desc);
create index if not exists ix_public_inquiry_mentor on public_opportunity_inquiry(preferred_mentor_user_id,status,created_at desc);
create index if not exists ix_public_inquiry_type_status on public_opportunity_inquiry(inquiry_type,status,created_at desc);
create index if not exists ix_public_inquiry_contact on public_opportunity_inquiry(lower(contact_email),contact_phone);

comment on table public_opportunity_inquiry is 'Public first-stage intent/contact intake. Detailed evidence and formal eligibility remain behind authenticated workflows.';
comment on column public_opportunity_inquiry.consider_non_member is 'Explicit human decision allowing authorized staff/organization users to continue considering an applicant who is not an active MPA member.';

-- Phase 3: organizations, organization users, jobs, eligibility and applications.
create table if not exists organization (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  display_name text not null,
  organization_type text,
  description text,
  website text,
  email text,
  phone text,
  country_code text not null default 'ET',
  geography_reference_item_id uuid references reference_item(id) on delete restrict,
  address_text text,
  verification_status text not null default 'pending'
    check (verification_status in ('draft','pending','in_review','correction_required','verified','rejected','suspended')),
  verified_at timestamptz,
  verified_by uuid references app_user(id) on delete restrict,
  public_visible boolean not null default false,
  created_by uuid not null references app_user(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_organization_status on organization(verification_status,public_visible);
create unique index if not exists uq_organization_legal_name on organization(lower(legal_name));

create table if not exists organization_membership (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id) on delete restrict,
  user_id uuid not null references app_user(id) on delete restrict,
  role_code text not null check (role_code in ('owner','administrator','recruiter','project_manager','event_manager','finance','read_only')),
  status text not null default 'active' check (status in ('invited','active','suspended','removed')),
  invited_by uuid references app_user(id) on delete restrict,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,user_id)
);
create index if not exists ix_org_membership_user on organization_membership(user_id,status);
create index if not exists ix_org_membership_org on organization_membership(organization_id,status);

create table if not exists organization_verification_case (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organization(id) on delete restrict,
  status text not null default 'submitted' check (status in ('submitted','in_review','correction_required','verified','rejected')),
  submitted_by uuid not null references app_user(id) on delete restrict,
  reviewed_by uuid references app_user(id) on delete restrict,
  decision_reason text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists organization_verification_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references organization_verification_case(id) on delete restrict,
  file_object_id uuid not null references file_object(id) on delete restrict,
  evidence_type text not null,
  note text,
  created_by uuid not null references app_user(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(case_id,file_object_id)
);

create table if not exists job (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id) on delete restrict,
  title text not null,
  description text not null,
  employment_type text,
  work_mode text check (work_mode is null or work_mode in ('onsite','hybrid','remote')),
  location_label text,
  industry_reference_item_id uuid references reference_item(id) on delete restrict,
  occupation_reference_item_id uuid references reference_item(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft','pending_review','published','paused','closed','archived')),
  visibility text not null default 'public' check (visibility in ('public','exclusive')),
  application_deadline timestamptz,
  published_at timestamptz,
  closed_at timestamptz,
  created_by uuid not null references app_user(id) on delete restrict,
  updated_by uuid references app_user(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_job_discovery on job(status,visibility,application_deadline);
create index if not exists ix_job_org on job(organization_id,status);

create table if not exists job_eligibility_rule (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references job(id) on delete restrict,
  rule_code text not null,
  operator text not null check (operator in ('equals','in','gte','lte','contains')),
  value jsonb not null,
  required boolean not null default true,
  reason_label text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ix_job_eligibility_job on job_eligibility_rule(job_id,sort_order);

create table if not exists job_application (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references job(id) on delete restrict,
  applicant_user_id uuid not null references app_user(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft','submitted','screening','shortlisted','interview','offer','accepted','rejected','withdrawn','hired')),
  cover_letter text,
  profile_snapshot jsonb not null default '{}'::jsonb,
  eligibility_snapshot jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  withdrawn_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id,applicant_user_id)
);
create index if not exists ix_job_application_job on job_application(job_id,status,created_at desc);
create index if not exists ix_job_application_user on job_application(applicant_user_id,created_at desc);

create table if not exists job_application_attachment (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references job_application(id) on delete restrict,
  file_object_id uuid not null references file_object(id) on delete restrict,
  attachment_type text not null default 'application_document',
  created_at timestamptz not null default now(),
  unique(application_id,file_object_id)
);

create table if not exists job_application_event (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references job_application(id) on delete restrict,
  actor_user_id uuid not null references app_user(id) on delete restrict,
  from_status text,
  to_status text not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists ix_job_application_event on job_application_event(application_id,created_at desc);

comment on table organization is 'Organization identity is separate from organization authorization and verification.';
comment on table organization_membership is 'Scoped organization role; membership does not imply global platform privilege.';
comment on table job_eligibility_rule is 'Centralized, configurable eligibility policy evaluated by the jobs service; never duplicated in controllers.';
comment on table job_application is 'Candidate workflow record with a safe profile/eligibility snapshot; private verification evidence is not copied here.';

create table if not exists organization_verification_requirement (
  id uuid primary key default gen_random_uuid(),
  organization_type text,
  evidence_type text not null,
  label text not null,
  required boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(organization_type,evidence_type)
);
create index if not exists ix_org_verification_requirement on organization_verification_requirement(organization_type,active,sort_order);

comment on table organization_verification_requirement is 'Admin-configurable organization evidence policy. Requirements vary by organization type and applicable law; the platform does not assume one document set fits every entity.';

-- Comprehensive job portal / ATS and stakeholder outcome visibility.
-- Keeps existing job/application contracts backward compatible while adding
-- requisitions, team collaboration, structured screening/interviews, saved jobs,
-- referrals and auditable progress/outcome metrics.

alter table job
  add column if not exists posting_scope text not null default 'public',
  add column if not exists department text,
  add column if not exists seniority_level text,
  add column if not exists positions_count integer not null default 1,
  add column if not exists salary_min numeric(14,2),
  add column if not exists salary_max numeric(14,2),
  add column if not exists salary_currency char(3),
  add column if not exists requisition_id uuid,
  add column if not exists closing_reason text,
  add constraint job_posting_scope_check check (posting_scope in ('public','mpa_members','organization_internal','partner_network')),
  add constraint job_positions_count_check check (positions_count > 0),
  add constraint job_salary_range_check check (salary_min is null or salary_max is null or salary_max >= salary_min);

create index if not exists ix_job_scope_discovery on job(status,posting_scope,application_deadline,published_at desc);
create index if not exists ix_job_department on job(department,status);

create table if not exists job_requisition (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id) on delete restrict,
  requested_by uuid not null references app_user(id) on delete restrict,
  title text not null,
  department text,
  justification text,
  headcount integer not null default 1 check (headcount > 0),
  employment_type text,
  work_mode text,
  location_label text,
  salary_min numeric(14,2),
  salary_max numeric(14,2),
  salary_currency char(3),
  target_start_date date,
  status text not null default 'draft'
    check (status in ('draft','submitted','approved','rejected','cancelled','fulfilled')),
  approved_by uuid references app_user(id) on delete restrict,
  approved_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (salary_min is null or salary_max is null or salary_max >= salary_min)
);
create index if not exists ix_job_requisition_org on job_requisition(organization_id,status,created_at desc);
alter table job add constraint fk_job_requisition foreign key (requisition_id) references job_requisition(id) on delete restrict;

create table if not exists job_team_member (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references job(id) on delete restrict,
  user_id uuid not null references app_user(id) on delete restrict,
  role_code text not null check (role_code in ('hiring_manager','recruiter','interviewer','approver','observer')),
  active boolean not null default true,
  added_by uuid not null references app_user(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(job_id,user_id,role_code)
);
create index if not exists ix_job_team_job on job_team_member(job_id,active,role_code);
create index if not exists ix_job_team_user on job_team_member(user_id,active);

create table if not exists job_screening_question (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references job(id) on delete restrict,
  question text not null,
  question_type text not null default 'text'
    check (question_type in ('text','yes_no','single_choice','multiple_choice','number')),
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  knockout boolean not null default false,
  knockout_operator text check (knockout_operator is null or knockout_operator in ('equals','not_equals','gte','lte','contains')),
  knockout_value jsonb,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists ix_job_screening_question on job_screening_question(job_id,active,sort_order);

create table if not exists job_application_answer (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references job_application(id) on delete restrict,
  question_id uuid not null references job_screening_question(id) on delete restrict,
  answer jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(application_id,question_id)
);

create table if not exists job_application_note (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references job_application(id) on delete restrict,
  author_user_id uuid not null references app_user(id) on delete restrict,
  note text not null,
  visibility text not null default 'team'
    check (visibility in ('team','private')),
  created_at timestamptz not null default now()
);
create index if not exists ix_job_application_note on job_application_note(application_id,created_at desc);

create table if not exists job_interview (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references job_application(id) on delete restrict,
  organizer_user_id uuid not null references app_user(id) on delete restrict,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  timezone text not null default 'Africa/Addis_Ababa',
  mode text not null default 'online'
    check (mode in ('online','onsite','phone')),
  location_text text,
  meeting_url text,
  status text not null default 'scheduled'
    check (status in ('scheduled','confirmed','completed','cancelled','no_show','reschedule_requested')),
  agenda text,
  candidate_note text,
  outcome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start)
);
create index if not exists ix_job_interview_application on job_interview(application_id,status,scheduled_start);
create index if not exists ix_job_interview_calendar on job_interview(scheduled_start,status);

create table if not exists job_interview_participant (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references job_interview(id) on delete restrict,
  user_id uuid not null references app_user(id) on delete restrict,
  role_code text not null check (role_code in ('candidate','interviewer','observer')),
  response_status text not null default 'pending'
    check (response_status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique(interview_id,user_id)
);

create table if not exists job_interview_scorecard (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references job(id) on delete restrict,
  title text not null,
  instructions text,
  criteria jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists job_interview_feedback (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references job_interview(id) on delete restrict,
  interviewer_user_id uuid not null references app_user(id) on delete restrict,
  scorecard_id uuid references job_interview_scorecard(id) on delete restrict,
  ratings jsonb not null default '{}'::jsonb,
  recommendation text not null default 'no_decision'
    check (recommendation in ('strong_yes','yes','mixed','no','strong_no','no_decision')),
  comments text,
  submitted_at timestamptz not null default now(),
  unique(interview_id,interviewer_user_id)
);
create index if not exists ix_job_interview_feedback on job_interview_feedback(interview_id,submitted_at desc);

create table if not exists job_saved (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete restrict,
  job_id uuid not null references job(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(user_id,job_id)
);
create index if not exists ix_job_saved_user on job_saved(user_id,created_at desc);

create table if not exists job_alert (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete restrict,
  name text not null,
  criteria jsonb not null default '{}'::jsonb,
  channel text not null default 'in_app'
    check (channel in ('in_app','sms','email','push')),
  frequency text not null default 'daily'
    check (frequency in ('instant','daily','weekly')),
  active boolean not null default true,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_job_alert_user on job_alert(user_id,active);

create table if not exists job_referral (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references job(id) on delete restrict,
  referrer_user_id uuid not null references app_user(id) on delete restrict,
  candidate_user_id uuid not null references app_user(id) on delete restrict,
  application_id uuid references job_application(id) on delete restrict,
  note text,
  status text not null default 'submitted'
    check (status in ('submitted','accepted','declined','converted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (referrer_user_id <> candidate_user_id)
);
create index if not exists ix_job_referral_job on job_referral(job_id,status,created_at desc);

create table if not exists job_outcome (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references job(id) on delete restrict,
  recorded_by uuid not null references app_user(id) on delete restrict,
  outcome_code text not null
    check (outcome_code in ('filled','partially_filled','cancelled','expired','reopened','quality_issue')),
  positions_filled integer not null default 0 check (positions_filled >= 0),
  outcome_note text,
  recorded_at timestamptz not null default now()
);
create index if not exists ix_job_outcome_job on job_outcome(job_id,recorded_at desc);

comment on table job_requisition is 'Internal vacancy/headcount request and approval boundary before recruitment.';
comment on table job_team_member is 'Scoped hiring-team collaboration; role grants are job-specific and never global.';
comment on table job_screening_question is 'Structured, configurable pre-screening questions; knockout rules are transparent and auditable.';
comment on table job_interview_feedback is 'Structured human interviewer evaluation; not an automated hiring decision.';
comment on table job_outcome is 'Explicit vacancy outcome record for stakeholder reporting and post-hire learning.';

alter table job_application
  add column if not exists offer_approval_status text not null default 'approved'
    check (offer_approval_status in ('not_required','pending','approved','rejected'));

create index if not exists ix_job_application_offer_approval on job_application(job_id,offer_approval_status,status);

comment on column job_application.offer_approval_status is 'Human approval gate for offers when the job has an assigned approver; candidate acceptance is still a separate actor action.';

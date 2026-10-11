-- Phase 1: identity, person/profile, membership application/review/correction,
-- activation/renewal history and notification preferences.
create table if not exists person (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references app_user(id) on delete restrict,
  first_name text not null,
  middle_name text,
  last_name text not null,
  display_name text,
  phone text,
  date_of_birth date,
  sex text,
  nationality text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_person_phone on person(phone) where phone is not null;

create table if not exists professional_profile (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null unique references person(id) on delete restrict,
  headline text,
  bio text,
  visibility text not null default 'members' check (visibility in ('private','members','public')),
  completion_percent integer not null default 0 check (completion_percent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table membership_record add column if not exists application_id uuid;

create table if not exists membership_application (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete restrict,
  application_type text not null default 'new' check (application_type in ('new','renewal')),
  previous_membership_id uuid references membership_record(id) on delete restrict,
  membership_product_id uuid not null references membership_product(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','submitted','in_review','correction_required','approved','payment_pending','paid','activated','rejected','withdrawn')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  approved_at timestamptz,
  activated_at timestamptz,
  data_snapshot jsonb not null default '{}'::jsonb,
  fee_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table membership_record drop constraint if exists fk_membership_application;
alter table membership_record add constraint fk_membership_application
  foreign key (application_id) references membership_application(id) on delete restrict;
create index if not exists ix_membership_application_user on membership_application(user_id,created_at desc);
create index if not exists ix_membership_application_status on membership_application(status,created_at);

create table if not exists membership_application_review (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references membership_application(id) on delete restrict,
  reviewer_user_id uuid not null references app_user(id) on delete restrict,
  decision text not null check (decision in ('approved','rejected','correction_required')),
  note text,
  checklist jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ix_membership_application_review on membership_application_review(application_id,created_at desc);

create table if not exists membership_correction (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references membership_application(id) on delete restrict,
  requested_by uuid not null references app_user(id) on delete restrict,
  responded_by uuid references app_user(id) on delete restrict,
  status text not null default 'open' check (status in ('open','responded','resolved','cancelled')),
  requested_fields jsonb not null default '[]'::jsonb,
  reviewer_note text,
  applicant_response jsonb,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  resolved_at timestamptz
);
create index if not exists ix_membership_correction_application on membership_correction(application_id,status);

create table if not exists membership_application_attachment (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references membership_application(id) on delete restrict,
  file_object_id uuid not null references file_object(id) on delete restrict,
  attachment_type text not null default 'supporting_document',
  created_by uuid not null references app_user(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(application_id,file_object_id)
);
create index if not exists ix_membership_application_attachment on membership_application_attachment(application_id,created_at);

create table if not exists membership_application_payment (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references membership_application(id) on delete restrict,
  payment_transaction_id uuid not null unique references payment_transaction(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists notification_preference (
  user_id uuid primary key references app_user(id) on delete restrict,
  email_enabled boolean not null default true,
  sms_enabled boolean not null default true,
  push_enabled boolean not null default true,
  in_app_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
create table if not exists notification_event (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete restrict,
  event_code text not null,
  resource_type text,
  resource_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ix_notification_event_user on notification_event(user_id,created_at desc);

create unique index if not exists uq_active_membership_per_user on membership_record(user_id) where status = 'active';
create unique index if not exists uq_membership_number on membership_record(membership_number) where membership_number is not null;

insert into membership_product(product_code,name,description,billing_model,price,currency,duration_days,renewal_required,active)
values
 ('BASIC','Basic','Standard annual membership','recurring',1200,'ETB',365,true,true),
 ('LIFETIME','Lifetime','Lifetime membership','lifetime',12000,'ETB',null,false,true),
 ('PREMIUM','Premium','Premium membership','one_time',50000,'ETB',null,false,true)
on conflict (product_code) do nothing;

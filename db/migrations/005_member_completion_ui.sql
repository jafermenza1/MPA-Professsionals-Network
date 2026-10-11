-- Phase 1 UI completion, staff assistance and reminder scheduling foundation.

create table if not exists profile_completion_requirement (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  section text not null,
  field_path text,
  requirement_type text not null default 'field' check (requirement_type in ('field','document')),
  required boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0,
  reminder_after_days integer,
  reminder_interval_days integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists member_completion_item (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete restrict,
  requirement_id uuid not null references profile_completion_requirement(id) on delete restrict,
  status text not null default 'missing' check (status in ('missing','in_progress','uploaded','under_review','accepted','rejected','correction_required','complete')),
  completed_at timestamptz,
  last_reminded_at timestamptz,
  reminder_count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique(user_id,requirement_id)
);

create index if not exists ix_member_completion_user on member_completion_item(user_id,status);
create index if not exists ix_completion_reminder on member_completion_item(status,last_reminded_at);

create table if not exists staff_assisted_edit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete restrict,
  staff_user_id uuid not null references app_user(id) on delete restrict,
  resource_type text not null,
  resource_id uuid,
  field_path text not null,
  before_value jsonb,
  after_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists ix_staff_assisted_edit_member on staff_assisted_edit(user_id,created_at desc);

create table if not exists notification_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete restrict,
  event_code text not null,
  channel text not null check (channel in ('in_app','sms','email','push')),
  resource_type text,
  resource_id uuid,
  scheduled_for timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','sent','skipped','cancelled','failed')),
  dedupe_key text not null unique,
  attempts integer not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ix_notification_schedule_due on notification_schedule(status,scheduled_for);

insert into profile_completion_requirement(code,label,section,field_path,requirement_type,required,sort_order)
values
 ('profile.headline','Professional headline','Professional profile','professional_profile.headline','field',true,10),
 ('profile.bio','Professional biography','Professional profile','professional_profile.bio','field',true,20)
on conflict(code) do nothing;

-- Phase 4: member services and mentorship.
-- Service offerings and mentorship are member-owned workflows; private evidence from Phase 2 is never copied here.

create table if not exists service_listing (
  id uuid primary key default gen_random_uuid(),
  provider_user_id uuid not null references app_user(id) on delete restrict,
  title text not null,
  description text not null,
  service_category text not null,
  delivery_mode text not null default 'remote' check (delivery_mode in ('remote','onsite','hybrid')),
  location_label text,
  pricing_model text not null default 'quote' check (pricing_model in ('free','fixed','hourly','quote')),
  price_amount numeric(14,2) check (price_amount is null or price_amount >= 0),
  currency char(3),
  visibility text not null default 'members' check (visibility in ('public','members')),
  status text not null default 'draft' check (status in ('draft','published','paused','closed')),
  max_active_requests integer check (max_active_requests is null or max_active_requests > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((pricing_model='free' and coalesce(price_amount,0)=0) or pricing_model<>'free'),
  check (pricing_model in ('free','quote') or (price_amount is not null and currency is not null))
);
create index if not exists ix_service_listing_discovery on service_listing(status,visibility,service_category,created_at desc);
create index if not exists ix_service_listing_provider on service_listing(provider_user_id,status);

create table if not exists service_request (
  id uuid primary key default gen_random_uuid(),
  service_listing_id uuid not null references service_listing(id) on delete restrict,
  requester_user_id uuid not null references app_user(id) on delete restrict,
  provider_user_id uuid not null references app_user(id) on delete restrict,
  status text not null default 'requested'
    check (status in ('draft','requested','accepted','declined','in_progress','completed','cancelled','disputed')),
  message text,
  requested_start_at timestamptz,
  requested_end_at timestamptz,
  provider_note text,
  requester_note text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_user_id <> provider_user_id)
);
create index if not exists ix_service_request_provider on service_request(provider_user_id,status,created_at desc);
create index if not exists ix_service_request_requester on service_request(requester_user_id,status,created_at desc);

create table if not exists service_request_event (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references service_request(id) on delete restrict,
  actor_user_id uuid not null references app_user(id) on delete restrict,
  from_status text,
  to_status text not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists ix_service_request_event on service_request_event(request_id,created_at desc);

create table if not exists mentor_profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references app_user(id) on delete restrict,
  headline text not null,
  bio text,
  expertise jsonb not null default '[]'::jsonb,
  languages jsonb not null default '[]'::jsonb,
  mentoring_modes jsonb not null default '["remote"]'::jsonb,
  max_active_mentees integer not null default 3 check (max_active_mentees > 0),
  status text not null default 'draft' check (status in ('draft','active','paused','closed')),
  visibility text not null default 'members' check (visibility in ('members','public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_mentor_profile_discovery on mentor_profile(status,visibility);

create table if not exists mentor_availability (
  id uuid primary key default gen_random_uuid(),
  mentor_profile_id uuid not null references mentor_profile(id) on delete restrict,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  timezone text not null default 'Africa/Addis_Ababa',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists ix_mentor_availability on mentor_availability(mentor_profile_id,day_of_week,active);

create table if not exists mentor_time_off (
  id uuid primary key default gen_random_uuid(),
  mentor_profile_id uuid not null references mentor_profile(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists ix_mentor_time_off on mentor_time_off(mentor_profile_id,starts_at,ends_at);

create table if not exists mentorship_request (
  id uuid primary key default gen_random_uuid(),
  mentee_user_id uuid not null references app_user(id) on delete restrict,
  preferred_mentor_user_id uuid references app_user(id) on delete restrict,
  goals text not null,
  topics jsonb not null default '[]'::jsonb,
  preferred_modes jsonb not null default '["remote"]'::jsonb,
  preferred_languages jsonb not null default '[]'::jsonb,
  preferred_days jsonb not null default '[]'::jsonb,
  status text not null default 'requested'
    check (status in ('draft','requested','matching','matched','declined','cancelled','completed')),
  matched_mentor_user_id uuid references app_user(id) on delete restrict,
  matched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (preferred_mentor_user_id is null or preferred_mentor_user_id <> mentee_user_id)
);
create index if not exists ix_mentorship_request_mentee on mentorship_request(mentee_user_id,status,created_at desc);
create index if not exists ix_mentorship_request_mentor on mentorship_request(matched_mentor_user_id,status,created_at desc);

create table if not exists mentorship_match (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references mentorship_request(id) on delete restrict,
  mentor_user_id uuid not null references app_user(id) on delete restrict,
  mentee_user_id uuid not null references app_user(id) on delete restrict,
  score numeric(7,3) not null default 0,
  match_reasons jsonb not null default '[]'::jsonb,
  status text not null default 'proposed' check (status in ('proposed','accepted','declined','expired','cancelled')),
  proposed_at timestamptz not null default now(),
  responded_at timestamptz,
  check (mentor_user_id <> mentee_user_id)
);
create index if not exists ix_mentorship_match_mentor on mentorship_match(mentor_user_id,status);
create index if not exists ix_mentorship_match_mentee on mentorship_match(mentee_user_id,status);

create table if not exists mentorship (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references mentorship_request(id) on delete restrict,
  mentor_user_id uuid not null references app_user(id) on delete restrict,
  mentee_user_id uuid not null references app_user(id) on delete restrict,
  status text not null default 'active'
    check (status in ('active','paused','completed','cancelled')),
  goals text not null,
  started_at timestamptz not null default now(),
  paused_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (mentor_user_id <> mentee_user_id)
);
create index if not exists ix_mentorship_mentor on mentorship(mentor_user_id,status);
create index if not exists ix_mentorship_mentee on mentorship(mentee_user_id,status);

create table if not exists mentorship_event (
  id uuid primary key default gen_random_uuid(),
  mentorship_id uuid not null references mentorship(id) on delete restrict,
  actor_user_id uuid not null references app_user(id) on delete restrict,
  from_status text,
  to_status text not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists ix_mentorship_event on mentorship_event(mentorship_id,created_at desc);

create table if not exists mentorship_session (
  id uuid primary key default gen_random_uuid(),
  mentorship_id uuid not null references mentorship(id) on delete restrict,
  scheduled_start_at timestamptz not null,
  scheduled_end_at timestamptz not null,
  mode text not null default 'remote' check (mode in ('remote','onsite','hybrid')),
  location_label text,
  meeting_reference text,
  agenda text,
  status text not null default 'scheduled'
    check (status in ('scheduled','completed','cancelled','no_show')),
  notes text,
  completed_at timestamptz,
  created_by uuid not null references app_user(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end_at > scheduled_start_at)
);
create index if not exists ix_mentorship_session on mentorship_session(mentorship_id,scheduled_start_at);

create table if not exists mentorship_feedback (
  id uuid primary key default gen_random_uuid(),
  mentorship_id uuid not null references mentorship(id) on delete restrict,
  session_id uuid references mentorship_session(id) on delete restrict,
  reviewer_user_id uuid not null references app_user(id) on delete restrict,
  target_role text not null check (target_role in ('mentor','mentee','program')),
  rating smallint check (rating is null or rating between 1 and 5),
  comments text,
  created_at timestamptz not null default now(),
  unique(session_id,reviewer_user_id,target_role)
);
create index if not exists ix_mentorship_feedback on mentorship_feedback(mentorship_id,created_at desc);

comment on table service_listing is 'Member-owned service offer. Publishing does not imply endorsement of every service claim.';
comment on table service_request is 'Service request between members with controlled lifecycle and audit history.';
comment on table mentor_profile is 'Member mentoring profile; matching uses explicit professional/availability signals, not private religious profiling.';
comment on table mentorship is 'Bounded mentor-mentee relationship with auditable lifecycle.';
comment on table mentorship_feedback is 'Post-session/program feedback; feedback is not itself a verification decision.';

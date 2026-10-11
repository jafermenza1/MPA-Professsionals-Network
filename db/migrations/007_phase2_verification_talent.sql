-- Phase 2: verification workflow and privacy-safe talent registry.
alter table professional_profile
  add column if not exists professional_title text,
  add column if not exists years_experience integer check (years_experience is null or years_experience >= 0),
  add column if not exists availability_status text not null default 'not_specified'
    check (availability_status in ('not_specified','available','limited','unavailable')),
  add column if not exists location_label text,
  add column if not exists directory_summary text;

create table if not exists professional_profile_reference (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references professional_profile(id) on delete restrict,
  reference_item_id uuid not null references reference_item(id) on delete restrict,
  relation_type text not null check (relation_type in ('occupation','industry','education_level','qualification_type','field_of_study','skill','language','specialization')),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique(profile_id,reference_item_id,relation_type)
);
create index if not exists ix_profile_reference_lookup on professional_profile_reference(relation_type,reference_item_id);
create unique index if not exists uq_profile_primary_reference
  on professional_profile_reference(profile_id,relation_type) where is_primary=true;

create table if not exists professional_experience (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references professional_profile(id) on delete restrict,
  employer_name text,
  role_title text not null,
  start_date date,
  end_date date,
  is_current boolean not null default false,
  description text,
  visibility text not null default 'members' check (visibility in ('private','members','public')),
  verified_claim_id uuid references verification_claim(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index if not exists ix_professional_experience_profile on professional_experience(profile_id,start_date desc nulls last);

create table if not exists verification_visibility (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references app_user(id) on delete restrict,
  directory_visible boolean not null default false,
  show_identity_badge boolean not null default true,
  show_professional_badge boolean not null default true,
  show_experience_badge boolean not null default true,
  show_location boolean not null default false,
  show_experience boolean not null default true,
  show_contact boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists talent_saved_search (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete restrict,
  name text not null,
  criteria jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_talent_saved_search_user on talent_saved_search(user_id,active);

create index if not exists ix_profile_visibility on professional_profile(visibility);
create index if not exists ix_profile_title_search on professional_profile using gin(to_tsvector('simple',coalesce(professional_title,'') || ' ' || coalesce(headline,'') || ' ' || coalesce(directory_summary,'')));

insert into verification_visibility(user_id)
select u.id from app_user u
on conflict (user_id) do nothing;

comment on table verification_visibility is 'Member-controlled public talent-registry visibility. Private verification evidence is never projected into the directory.';
comment on table professional_profile_reference is 'Links profile claims to versioned reference portfolio items; dataset semantics remain governed by published reference versions.';
comment on table professional_experience is 'Directory-safe professional experience projection; private evidence remains in verification case storage.';

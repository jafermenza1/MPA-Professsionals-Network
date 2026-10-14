-- P0: explicit, revocable employer-sharing consent for job-seeker demand.
-- Private intake remains Support Desk-only unless the applicant opts in to named-employer sharing.
alter table public_opportunity_inquiry
  add column if not exists employer_sharing_consent boolean not null default false,
  add column if not exists employer_sharing_scope text not null default 'support_desk_only',
  add column if not exists employer_sharing_fields jsonb not null default '[]'::jsonb,
  add column if not exists employer_sharing_consented_at timestamptz,
  add column if not exists employer_sharing_revoked_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'public_opportunity_inquiry_sharing_scope_check'
      and conrelid = 'public_opportunity_inquiry'::regclass
  ) then
    alter table public_opportunity_inquiry
      add constraint public_opportunity_inquiry_sharing_scope_check
      check (employer_sharing_scope in ('support_desk_only','named_employer'));
  end if;
end $$;

create table if not exists job_seeker_demand_share (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public_opportunity_inquiry(id) on delete restrict,
  organization_id uuid not null references organization(id) on delete restrict,
  shared_by uuid not null references app_user(id) on delete restrict,
  shared_fields jsonb not null default '[]'::jsonb,
  shared_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inquiry_id, organization_id)
);
create index if not exists job_seeker_demand_share_org_active_idx
  on job_seeker_demand_share(organization_id, shared_at desc)
  where revoked_at is null;


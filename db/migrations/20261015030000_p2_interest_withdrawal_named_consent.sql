-- P2/P3: preserve marketplace interest withdrawal history and bind job-seeker consent to a named organization.
alter table marketplace_demand_interest
  add column if not exists status text not null default 'active',
  add column if not exists withdrawn_at timestamptz,
  add column if not exists withdrawal_reason text;

update marketplace_demand_interest set status='active' where status is null;

alter table marketplace_demand_interest
  drop constraint if exists marketplace_demand_interest_status_check,
  add constraint marketplace_demand_interest_status_check
    check (status in ('active','withdrawn')),
  drop constraint if exists marketplace_demand_interest_withdrawn_at_check,
  add constraint marketplace_demand_interest_withdrawn_at_check
    check ((status='active' and withdrawn_at is null) or (status='withdrawn' and withdrawn_at is not null));

create index if not exists marketplace_demand_interest_active_topic_idx
  on marketplace_demand_interest(topic_id,status,interest_level);

alter table public_opportunity_inquiry
  add column if not exists employer_sharing_organization_id uuid references organization(id);

create index if not exists public_opportunity_inquiry_sharing_audience_idx
  on public_opportunity_inquiry(employer_sharing_organization_id,employer_sharing_consent,employer_sharing_revoked_at);

-- Persist the relationship-level outcome separately from individual session notes.
alter table mentorship add column if not exists outcome_summary text;

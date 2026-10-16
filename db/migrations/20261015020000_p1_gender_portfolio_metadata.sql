-- P1: normalize the user-facing Gender field without silently discarding legacy values.
alter table person add column if not exists gender_legacy_value text;
update person
set gender_legacy_value = sex
where sex is not null and lower(trim(sex)) not in ('male','female') and gender_legacy_value is null;
update person set sex=lower(trim(sex)) where lower(trim(sex)) in ('male','female') and sex is distinct from lower(trim(sex));
update person set sex=null where sex is not null and lower(trim(sex)) not in ('male','female');
alter table person drop constraint if exists person_sex_gender_check;
alter table person add constraint person_sex_gender_check check (sex is null or sex in ('male','female'));

-- Portfolio relationship metadata remains attached to the existing portfolio item model.
alter table professional_portfolio_item
  add column if not exists started_on date,
  add column if not exists completed_on date,
  add column if not exists review_status text not null default 'user_supplied';
alter table professional_portfolio_item
  drop constraint if exists professional_portfolio_item_review_status_check,
  add constraint professional_portfolio_item_review_status_check
    check (review_status in ('user_supplied','under_review','reviewed','needs_correction'));

create table if not exists professional_portfolio_reference (
  portfolio_item_id uuid not null references professional_portfolio_item(id) on delete cascade,
  reference_item_id uuid not null references reference_item(id) on delete restrict,
  relation_type text not null check (relation_type in ('skill','occupation')),
  created_at timestamptz not null default now(),
  primary key (portfolio_item_id, reference_item_id, relation_type)
);
create index if not exists idx_portfolio_reference_lookup
  on professional_portfolio_reference(reference_item_id,relation_type,portfolio_item_id);

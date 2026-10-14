-- P1: enrich the authoritative professional education records without creating a second profile model.
alter table professional_education
  add column if not exists start_year integer,
  add column if not exists completion_year integer,
  add column if not exists currently_studying boolean not null default false,
  add column if not exists explanation text,
  add column if not exists visibility text not null default 'private';

update professional_education
set completion_year = coalesce(completion_year, graduation_year)
where completion_year is null and graduation_year is not null;

alter table professional_education
  drop constraint if exists professional_education_start_year_check,
  add constraint professional_education_start_year_check
    check (start_year is null or start_year between 1900 and 2200),
  drop constraint if exists professional_education_completion_year_check,
  add constraint professional_education_completion_year_check
    check (completion_year is null or completion_year between 1900 and 2200),
  drop constraint if exists professional_education_year_order_check,
  add constraint professional_education_year_order_check
    check (start_year is null or completion_year is null or completion_year >= start_year),
  drop constraint if exists professional_education_visibility_check,
  add constraint professional_education_visibility_check
    check (visibility in ('private','members','public'));

alter table professional_education
  drop constraint if exists professional_education_current_year_check,
  add constraint professional_education_current_year_check
    check (not currently_studying or completion_year is null);

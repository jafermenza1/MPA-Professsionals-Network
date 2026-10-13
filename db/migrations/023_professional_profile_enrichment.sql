-- Professional profile enrichment fields used by the self-service profile editor.
alter table professional_profile add column if not exists education_summary text;
alter table professional_profile add column if not exists qualifications text;
alter table professional_profile add column if not exists skills jsonb not null default '[]'::jsonb;
alter table professional_profile add column if not exists languages jsonb not null default '[]'::jsonb;
alter table professional_profile add column if not exists certifications jsonb not null default '[]'::jsonb;
alter table professional_profile add column if not exists portfolio_url text;

alter table professional_profile add constraint professional_profile_skills_array
  check (jsonb_typeof(skills) = 'array') not valid;
alter table professional_profile add constraint professional_profile_languages_array
  check (jsonb_typeof(languages) = 'array') not valid;
alter table professional_profile add constraint professional_profile_certifications_array
  check (jsonb_typeof(certifications) = 'array') not valid;

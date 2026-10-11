-- Phase 2 hardening: explicit consent and directory eligibility boundary.
alter table verification_case
  add column if not exists consent_at timestamptz,
  add column if not exists consent_by uuid references app_user(id) on delete restrict,
  add column if not exists consent_version text;

create index if not exists ix_verification_case_consent on verification_case(subject_user_id,consent_at);
comment on column verification_case.consent_at is 'Explicit subject consent timestamp when the verification program requires consent.';
comment on column verification_case.consent_version is 'Policy/notice version presented when consent was recorded.';

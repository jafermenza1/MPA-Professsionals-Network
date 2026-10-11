-- Phase 3 hardening: explicit organization verification draft state.
-- Existing submitted/in-review/correction states remain compatible.
alter table organization_verification_case drop constraint if exists organization_verification_case_status_check;
alter table organization_verification_case add constraint organization_verification_case_status_check
  check (status in ('draft','submitted','in_review','correction_required','verified','rejected'));

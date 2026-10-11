-- Draft organization verification cases have not been submitted yet.
-- submitted_at is populated when the owner submits the case.
alter table organization_verification_case alter column submitted_at drop not null;

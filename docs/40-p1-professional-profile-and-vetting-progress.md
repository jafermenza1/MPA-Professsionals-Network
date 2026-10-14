# P1 professional profile and vetting implementation progress

**Status:** Code changes committed on `reconciliation/holistic-gates`; **not validated or accepted**. This increment builds on the existing professional profile, reference portfolio, membership, talent and verification services. It does not introduce a second profile API or a second reference-data service.

## Implemented in code

### GAP-006 — Education records
- Extended the existing `professional_education` record with start year, completion year, currently-studying state, optional explanation and visibility.
- Kept the existing education API and reference links. Existing graduation years are copied into completion year without deleting historical records.
- Added repeatable education forms with searchable reference choices, explicit “Other” inputs, date-order/year validation, currently-studying behavior and visibility choices.
- Public/member talent responses now filter education by its visibility setting; owner and authorized vetting workflows retain access to required details.

### GAP-007 and GAP-011 — Governed reference selectors, skills and languages
- Added searchable selectors that match labels, stable codes and administrator-managed aliases; language and skill selections use removable chips/checkboxes rather than Ctrl/Command multi-select or comma-separated editing.
- Added a governed `professional_skills` reference dataset to the existing reference portfolio and a starter vocabulary that administrators can extend.
- Skills and languages are stored as structured profile references. The existing `skills` and `languages` JSON fields are maintained as compatibility projections from the structured references rather than a second source of truth.
- Normalized and deduplicated profile skill/language values and aliases; custom values remain available only when “Other” is selected.

### GAP-008 — Reference-data lifecycle
- Added a CSV preview step with suggested/explicit column mapping, sample rows, duplicate-code checks and parent-code/cycle validation.
- CSV import continues to stage changes in a transaction in the existing working-copy/version model. Imports support only CSV, matching the current product contract; XLSX/JSON support was not added.
- Stable codes cannot be renamed when editing an existing item. Alias values can be edited manually or imported and are normalized for search.
- Publication checks reject duplicate codes, parent links outside the same dataset version and cyclic hierarchies. Existing publication and audit records remain in use.

### GAP-009 — Gender
- Kept the existing storage/API compatibility field while validating user input to Male/Female (or blank), normalizing casing and exposing a `gender` response alias.
- Added a database constraint for the normalized values. Unexpected historical values are preserved in `gender_legacy_value` before the normalized field is cleared, rather than being silently discarded.
- Added a regression test for gender validation; it has **not** been run.

### GAP-010 — Portfolio relationships and evidence provenance
- Extended existing portfolio items with start/completion dates and a review status, plus structured links to governed skills and occupations.
- Portfolio views show owner context, created/updated timestamps, visibility and whether evidence is user-supplied, under review, reviewed or needs correction.
- Editing a portfolio item resets its evidence status to user-supplied so a material change cannot inherit an earlier review result.
- Private evidence remains private. Authorized vetting reviewers can open portfolio and case-attached evidence through the audited private-file path; public talent responses do not include private file identifiers.

### Vetting stakeholder workflow and payment gate
- Reviewer case details now include the professional profile, structured education, work experience, references, portfolio relationships and private evidence metadata. The dossier is visible only to authorized review participants; evidence file reads remain separately authorized and audited.
- Added reviewer evidence download actions, case-stage/next-action guidance, decision history, checklist outcomes and appeal status.
- Replaced raw JSON claim entry with a guided form for claim type, name, issuer, reference number, dates and optional context.
- Claim review outcomes propagate to portfolio items linked to the evidence file, and editing an item resets that reviewed status.
- The existing profile membership gate remains in place: profile editing is read-only until the fee is verified and membership is activated. Existing membership declaration, finance reconciliation and plan-version flows are reused; no parallel payment system was introduced.

## Final acceptance gate — intentionally deferred

Do not treat this increment as production-accepted until all of the following have been run and reviewed:

1. Apply all three P1 migrations on a disposable PostgreSQL database; verify forward migration, existing-row preservation, uniqueness, foreign keys, constraints and rollback/recovery strategy.
2. Exercise education create/edit/remove with standard and “Other” references; test current-study, year boundaries, invalid date order, visibility, empty records and concurrent updates.
3. Verify profile writes and direct APIs fail before active membership, while public browsing, public service requests and permitted organization workspaces continue to work.
4. Verify skill/language alias search, deduplication, stale references, Other values, legacy profile reads, profile search filters and every consumer of the authoritative references.
5. Test CSV preview with quoted headers, BOM, nonstandard columns, mapping corrections, malformed quotes, duplicate codes, missing parents, cross-version parents, cycles, atomic failure, alias normalization, audit records and publication/history behavior.
6. Test gender across registration/profile/admin APIs, validation errors, historical values, database constraint and any export surfaces that include the field.
7. Test portfolio dates and skill/occupation relationships, ownership checks, user edits resetting review status, evidence access by owner/assigned reviewer/authorized reviewer, and denial to unrelated users.
8. Run complete member → consent → claim/evidence → reviewer assignment → checklist → decision → member response → independent appeal journeys, including conflict-of-interest and evidence readiness failures.
9. Confirm reviewer dossiers include all required profile/evidence fields without exposing private data to public/member consumers; verify downloads are audited and unauthorized access is denied.
10. Confirm payment-before-profile behavior, payment declaration correction/retry, finance reconciliation, reversals and expired-membership restrictions across UI and direct APIs.
11. Run API integration tests, TypeScript/lint, build, migrations, browser journeys, accessibility checks and CI. **None of these validations has been run for this increment.** Do not merge or deploy before the final gate passes.

## Current known limits
- CSV is the only supported import format in this product contract.
- The starter skills vocabulary is intentionally small and is expected to be managed through the existing reference-data administration workflow.
- The new gender regression test is added, but broader integration/browser coverage remains in the deferred gate.
- No acceptance or production-readiness claim is made.

# Reference Portfolio Implementation Contract

This is the first executable foundation for the configurable reference portfolio described in
`docs/19-configurable-reference-portfolio.md`.

## Repository layout

- `db/migrations/001_reference_portfolio.sql` — PostgreSQL schema.
- `db/seeds/reference-portfolio.baseline.json` — safe baseline seed package. It intentionally contains no real people, payments or geography rows.
- Future application code must treat these tables as the source of configurable classifications rather than hard-coded enums.

## Import contract

Every import is processed as:

1. Upload file and calculate checksum.
2. Detect format and map source columns.
3. Validate codes, required fields, parents, cycles, duplicates and effective dates.
4. Generate row-level diff classifications.
5. Create a draft dataset version.
6. Require authorized review.
7. Publish atomically.
8. Record the publication action and audit event.

Accepted formats: CSV, XLSX and JSON.

Minimum common fields:

`code,name,type,parent_code,status`

Domain-specific optional fields may be carried in `metadata`.

## Version rules

- A published dataset version is never silently edited.
- A new source release creates a new version.
- Referenced historical records retain their dataset-version identifier.
- Codes are never reused for a different meaning.
- Referenced items are deprecated/replaced, not hard deleted.
- Parent changes are represented in the new version and crosswalked where appropriate.
- Effective dates must not overlap for mutually exclusive versions.
- Import publication is all-or-nothing.

## Membership pricing rules

The baseline package contains:

- BASIC: 1,200 ETB, recurring annually.
- LIFETIME: 12,000 ETB, one-time lifetime.
- PREMIUM: 50,000 ETB, one-time.

These are configuration, not application constants.

A membership obligation must retain the fee-rule version used to calculate it. Changing the current price must never change an existing obligation, receipt or historical payment.

## Verification rules

Verification claim types and checklist versions are configurable. Checklist items support evidence requirements, reviewer guidance and explicit pass conditions.

The verification engine must resolve the checklist version at case creation. Later checklist edits therefore do not rewrite historical verification decisions.

## Required next application modules

When the runtime application is introduced, implement in this order:

1. Reference repository/service with transactional version lifecycle.
2. Import parser and validator with row-level diagnostics.
3. Diff/preview service.
4. Admin Reference Portfolio workspace.
5. Membership product/fee administration.
6. Verification checklist administration.
7. Audit integration.
8. Tests for publication, immutability, historical pricing and checklist version resolution.

Do not build a public profile/job form that embeds a static copy of these classifications. Forms must resolve current published reference data through the reference service.

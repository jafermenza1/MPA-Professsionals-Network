# Gap 016, P0 identity/membership, and reference-format implementation note

**Branch:** `reconciliation/holistic-gates`  
**Implementation status:** code changes committed; final-gate validation intentionally pending  
**Authoritative reference-data contract:** `docs/19-configurable-reference-portfolio.md`  
**Gap register:** `docs/37-specific-product-gap-audit.md`

## GAP-016 — Named-employer consent

- The public verified-organization catalogue is loaded from `GET /api/v1/public/opportunity-sharing-organizations`.
- The applicant must select one organization before named-employer consent can be saved.
- Both initial consent and retry requests send `organizationId` alongside the explicit field allow-list and `scope: "named_employer"`.
- Recovered requests restore the saved organization ID.
- Consent UI validates that the selected ID is present in the currently loaded verified/public organization list. Lookup failures have a retry action.
- Submitting a job-interest request privately remains possible when consent setup is incomplete; no consent is claimed as saved.
- Server-side verification, Support Desk authorization, field allow-list, organization matching, revocation, share history and employer access filters remain enforced in `src/platform/public-opportunity.js`; the UI does not replace those controls.
- The P0 integration fixture now requires a verified named organization and retains the consent, field-scope, sharing, revocation and history assertions.

## P0 identity and membership

The current implementation already has shared professional-identity and current-membership policy checks, current database-role authorization, fee snapshots, approval-before-payment verification, payment amount/currency matching, activation only after approval and confirmed payment, annual validity policy, idempotent payment references, and refund/reversal records that suspend the affected membership. This increment adds a direct service-level regression journey for unapproved activation, unverified-payment activation, verified activation, reversal suspension, and retry idempotency. Existing assertions were retained; the new test has not been executed yet.

## GAP-007/008 — Reference-data contract and formats

The implementation contract explicitly requires CSV, XLSX and JSON import/export. This increment does **not** reduce that requirement to CSV:

- CSV import/export now carries hierarchy, aliases, short labels, metadata and effective dates; metadata/date fields are validated before staging.
- JSON import/export routes and admin UI support were added.
- XLSX import/export support was added without introducing an unpinned package dependency. The importer reads the first worksheet, supports shared-string and inline-string cells, and applies the same code/label, hierarchy, duplicate, metadata and effective-date validation before staging. The exporter creates a standard OOXML workbook.
- All imports remain staged in the working version; they do not publish automatically. Existing version/publication and audit controls remain in place.
- A dependency-free XLSX round-trip regression test was added, but has not been executed.

The contract is broader than file-format support. GAP-007 consumer-by-consumer reference-selector coverage, custom “Other” handling, all consumer forms, scheduled publication, crosswalks, import-diff resolution and historical-reference behavior remain subject to the full gap register and acceptance matrix. Do not mark GAP-007/008 accepted solely because the formats exist.

## Final-gate validation required (not run in this increment)

1. Run the existing P0 identity and membership tests without removing or relaxing any assertions.
2. Run the new payment-ordering/reversal journey, including refund/reversal retry, expiry access checks, and immutable fee snapshots after a future plan version is introduced.
3. Run the full reference-portfolio test suite, including CSV/JSON/XLSX round trips, invalid file rejection, duplicate code, unknown parent, hierarchy cycle, metadata/date validation, and no partial writes.
4. Run typecheck, server tests, web build, API authorization checks and browser workflows on the exact resulting head.
5. Record the exact passing SHA and any remaining failures before closing the gap register.

No test suite or build was run while implementing this increment, in accordance with the instruction to defer validation until the final gate.

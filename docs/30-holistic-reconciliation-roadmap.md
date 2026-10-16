# Holistic Application Reconciliation Plan

**Status:** Active — G0 PASS; G1 PASS on its verified implementation head; G2 PASS on its verified implementation head; G3 PASS on disposable PostgreSQL only (production baseline remains unverified); G4 scoped workflows expanded; current-head automated CI removed by maintainer decision; manual acceptance remains required; G5/G6 not passed  
**Working branch:** `reconciliation/holistic-gates`  
**Base branch:** `main`  
**Scope:** One auditable branch for build reliability, authorization, database safety, connected workflows, end-to-end verification, and release readiness.

## 1. Non-negotiable contract

This plan supplements, and does not silently replace, the existing product and engineering contracts. Where an implementation change alters product behavior, update the corresponding source contract in the same change set.

Authoritative references:
- `docs/01-product-requirements.md` — product scope and requirements.
- `docs/03-domain-model.md` — entities and domain invariants.
- `docs/04-roles-and-permissions.md` — authentication, authorization, scope, separation of duties, and audit.
- `docs/05-workflows.md` — business state transitions and user journeys.
- `docs/06-system-architecture.md` — architectural boundaries.
- `docs/07-api-contract.md` — API behavior, errors, idempotency, and integrations.
- `docs/08-security-privacy.md` — privacy and security requirements.
- `docs/11-quality-acceptance.md` — test and release acceptance.
- `docs/12-developer-guide.md` — module boundaries and change documentation.
- `docs/32-migration-operations-runbook.md` — mandatory legacy-baseline verification, backup/restore, migration execution, and recovery checklist.
- `docs/20-reference-portfolio-implementation.md` — Reference Portfolio implementation constraints.

### Change-control rules

1. Do not delete or disable an existing feature merely to make a build or test pass.
2. Do not relax authentication, authorization, privacy, validation, or audit rules to make a workflow pass.
3. Do not perform destructive data migrations or rewrite production data without a reviewed migration and explicit recovery plan.
4. Every defect must have a reproducible test or a documented reason why automation is not feasible.
5. Keep fixes focused and backward-compatible where practical; document any necessary API or schema compatibility change.
6. A gate is **PASS** only when its acceptance evidence is recorded. A plan, code review, or historical CI configuration/run alone is not proof of current execution.
7. Never record secrets, real identity evidence, production credentials, or unnecessary personal data in tests or logs.
8. Keep all reconciliation work on this branch until the pull request is reviewed. Do not merge or deploy automatically as part of this plan.

## 2. Gate model

| Gate | Purpose | Required exit evidence |
|---|---|---|
| G0 — Contract and baseline | Map contracts, workflows, routes, modules, migrations, test/build commands, and known risks | This plan committed; baseline and open questions recorded |
| G1 — Reproducible build | Clean dependency installation, test command validity, web production build, server startup and health check | Reproducible command results; failures fixed without suppressing tests |
| G2 — Identity and authorization | Session lifecycle, current roles, protected routes, resource scope, privacy and admin actions | Positive and negative authorization tests, including role changes and revoked sessions |
| G3 — Database and migrations | Fresh database, upgrade path, migration history/idempotency, transaction safety and seed behavior | Fresh-install and upgrade evidence on disposable PostgreSQL; rerun behavior documented |
| G4 — Domain workflow integration | Connect UI/API/service/database/state transition/audit/notification/follow-up for each implemented capability | Route-to-screen matrix and service/API tests for positive, negative and retry paths |
| G5 — End-to-end acceptance | Run role-separated user journeys against a real test server and PostgreSQL | E2E results, persisted-state checks, and regression evidence |
| G6 — Release readiness | Operational diagnostics, backup/restore, rollback, security review and production-like smoke tests | Release checklist with evidence and explicitly accepted residual risks |

Gates are sequential for acceptance. A later gate may reveal work for an earlier gate; record the regression, reopen the affected gate, and do not hide the dependency.

## 3. Gate 0 — initial repository baseline

### Repository facts observed from the current `main` branch

- Root runtime is Node.js ESM with a built-in HTTP server in `server.js`.
- The web workspace is `web/`, using Next.js 14 and React 18.
- PostgreSQL access uses `pg`; SQL migrations are under `db/migrations/`.
- Root scripts currently declare `test`, `test:reference-portfolio`, `start`, `migrate`, `web:build`, and `web:dev`.
- Historical note: `.github/workflows/ci.yml` previously provisioned PostgreSQL 16 and ran install, migrations, tests, web build and API smoke. The workflow has been removed; see [manual test and deployment policy](36-manual-test-release-and-deployment-policy.md).
- The migration runner in `scripts/migrate.js` enumerates and executes every sorted SQL migration on every run. A migration ledger and safe rerun behavior have not yet been demonstrated.
- The product contracts explicitly require server-side authorization and resource scope, privacy of sensitive evidence, auditable state changes, idempotent consequential operations, realistic migration tests, and end-to-end acceptance.
- At baseline commit `dd5eb406e04e4a775711c8f01c8c33bd32ea382a`, no npm, pnpm or Yarn lockfile was present. Gate 1 generated the npm workspace lockfile on a network-enabled GitHub runner, committed it as `package-lock.json`, removed the temporary bootstrap/artifact/write-permission steps, restored CI to `contents: read`, and switched the pipeline to `npm ci --no-audit --no-fund`.
- Existing test files cover identity/password validation, platform foundation/theme, membership import and lifecycle, Reference Portfolio validation/service, verification, organizations/jobs, and services/mentorship.
- The web app contains public landing, registration/login, profile, dashboard, admin, field operations, jobs/apply, network, organizations, services, mentorship, opportunity intake, and inquiry tracking screens.
- At the time this historical inventory was written, one CI workflow existed. It was removed on 2026-10-14. Its historical runs are not evidence for later commits; manual validation is now the acceptance process.

### Initial risk register — hypotheses to verify during the gates

| ID | Area | Initial observation / risk | Required proof or action |
|---|---|---|---|
| R-01 | Build/reproducibility | Historical baseline lacked a lockfile; Gate 1 committed `package-lock.json` and prior CI used `npm ci`. | Preserve the lockfile and validate clean installation manually with `npm ci --no-audit --no-fund`; record exact commit and output. |
| R-02 | API contract | Two `GET /api/v1/me` handlers existed; the first returned only account/role data and shadowed the later profile response consumed by the dashboard. | **Fix committed on this branch:** removed the shadowing handler; a historical automated test run passed on the resulting server change. Add a focused authenticated route contract test during G5. |
| R-03 | Authorization | Tokens contain role claims while account sessions are checked against the database. A role change may leave old role claims active until expiry unless sessions are revoked or roles are reloaded. | Trace every privileged route and role mutation; test role grant/removal and session revocation. |
| R-04 | Migrations | The original runner had no history ledger and reran every SQL file on every invocation. | **Fix covered by historical automated test validation; rerun manually on the current head:** migration runner now records filename + SHA-256 checksum, refuses edits to already-applied migration files, and applies each new migration and ledger entry in one transaction. The historical automated workflow ran the migration command twice; repeat this manually for current acceptance. A fresh-DB rerun is not a substitute for validating an existing-schema upgrade. |
| R-05 | Rate limiting | Public request limits are held in an in-process map. | Assess process restarts, multiple instances and key retention; document the actual deployment assumptions and suitable bounded/shared alternative if needed. |
| R-06 | End-to-end coverage | Configured CI commands do not by themselves prove every product workflow is connected. | Build an inventory from UI screens to routes, services, tables, state changes, audit and user-visible follow-up. |
| R-07 | Branch feedback | The CI push filter initially excluded `reconciliation/**`, preventing immediate push validation on the agreed working branch. | Fixed in this branch by adding `reconciliation/**` to the push branches. Confirm the resulting workflow run. |

These are **open risks**, not claims that all affected workflows are broken. Each must be confirmed or closed with evidence.

## 4. Workflow reconciliation inventory

For every workflow that is implemented or advertised, trace the full chain:

`User/UI -> API route -> input validation -> authentication -> authorization/scope -> domain service -> transaction/persistence -> audit/event -> notification/integration -> user-visible result`

Mark a step **not applicable** only with a reason. Mark a capability **not implemented** rather than inventing a successful path.

Minimum workflow families:
- Account registration, login, logout, session expiry/revocation, profile read/update.
- Membership application, review/correction, manual payment review, activation, renewal, suspension and historical periods.
- Professional verification, evidence privacy, reviewer decisions, expiry/revocation and appeal/correction where implemented.
- Organization onboarding, organization membership/role scope, verification and ownership checks.
- Job creation, publication eligibility, public discovery, application tracking, employer/candidate visibility and close.
- Talent discovery, consent-controlled profile visibility, inquiry creation and inquiry continuation/linking.
- Professional service listings, service requests, acceptance/decline and outcomes.
- Mentorship request, matching, accept/decline, capacity, sessions, completion and feedback.
- Notifications, preferences, retry/duplicate handling and audit history.
- Admin user status/role changes, session revocation, separation of duties and recovery.
- Reference data and Reference Portfolio import/validation/publication, preserving the rule that authoritative classifications must not be fabricated.

## 5. Standard test evidence

For each change, record:
- Gate and risk/requirement IDs.
- Contract(s) affected.
- Exact command or test name.
- Environment class (unit, disposable database, browser/E2E, staging); never expose secrets.
- Result: PASS / FAIL / BLOCKED / NOT RUN.
- Failure output summarized safely, linked to the fix, and regression coverage.
- Database setup/cleanup and whether the test is repeatable.
- Any API/schema compatibility, migration, privacy, audit, or operational consequence.

A failed test must remain visible. Do not replace a failing assertion with a weaker one solely to obtain a green build.

## 6. Current status and next action

Evidence reviewed on 2026-10-10 (latest implementation commit below):

- G0: **PASS — baseline inventory recorded** on this branch in [the repository baseline inventory](33-repository-baseline-inventory.md) and [workflow reconciliation matrix](31-workflow-reconciliation-matrix.md). It records the authoritative contracts, runtime/workspace topology, screen-to-API/service families, centralized route dispatch families, 20 migration files, test/build commands, evidence boundaries and explicit open questions. This is a baseline sign-off, not a claim that every control is implemented or that production schema has been inspected; discoveries during later gates can reopen affected inventory rows.
- G1: **PASS — clean reproducible install verified.** Commit `08e1b581cf22b795b80bc9a572c6ff514ef6e4ba` passed GitHub Actions push run [38062139446](https://github.com/Jafermenza/ET-Professionals-Network/actions/runs/38062139446). The pipeline used the committed npm workspace `package-lock.json` and `npm ci --no-audit --no-fund`; fresh PostgreSQL migrations, migration rerun, isolated legacy adoption/rollback tests, `npm test`, `npm run web:build`, Playwright Chromium installation, API smoke and the browser workflow all passed. The bootstrap artifact/commit logic has been removed and CI permissions are back to `contents: read`. The pass is tied to this exact commit; later changes must keep the same checks green.
- G2: **PASS — identity and authorization acceptance evidence recorded.** The complete CI pipeline passed on the G2 implementation head `75cb9e7f34f5ef125812bf6b502b9a15e8563198`: [push run 38065309014](https://github.com/Jafermenza/ET-Professionals-Network/actions/runs/38065309014) and [PR run 38065312438](https://github.com/Jafermenza/ET-Professionals-Network/actions/runs/38065312438). Current database roles replace stale JWT role claims; role/status changes revoke sessions; self-role changes and non-system-admin privileged-role/account changes (including reviewer and finance roles) are denied; last-system-admin removal is blocked; role audit metadata records prior/current roles and status, platform scope, reason and request context; successful private-file reads are audited; reviewers cannot decide organization cases they created, submitted, or actively belong to. CI API smoke covers member denial on admin APIs, cross-organization evidence writes, private evidence access, reviewer conflict denial, privileged-role boundaries, role-change revocation and current-role enforcement. The Gate 4 browser fixture uses a separate reviewer identity. Later Gate 4 commits continue independently; their branch-wide CI remains tracked by the latest runs, and any authorization regression reopens G2.
- G3: **PASS — disposable PostgreSQL acceptance; production rollout remains blocked pending baseline verification.** CI runs [push 38050311573](https://github.com/Jafermenza/ET-Professionals-Network/actions/runs/38050311573) and [PR 38050314006](https://github.com/Jafermenza/ET-Professionals-Network/actions/runs/38050314006) passed on commit `b28574fc20b7ad0407bba2968e2f48ffae961445`. The isolated legacy-adoption test builds migrations 001–010 without a ledger, adds a sentinel row, verifies that a missing baseline fails closed, adopts the exact test baseline, applies migrations 011–018, verifies all 18 ledger rows and sentinel preservation, injects a failing migration to prove DDL and ledger writes roll back together, removes the synthetic migration, and proves a clean rerun. Fresh database migration and ordinary rerun also pass. Historical migration 012 remains untouched; forward migration 018 reconciles the constraint. **The production schema and correct production baseline have not been inspected. Do not set a production baseline by assumption; follow `docs/32-migration-operations-runbook.md` before any production migration.**
- G4: **IMPLEMENTATION EXPANDED — acceptance pending** — public job inquiry remains separate from authenticated formal draft→submit applications; profile and notification preferences use live APIs; mentorship requests are account-scoped and reload from persisted state; service request UI exposes provider/requester lifecycle actions; organization evidence UI uses the private upload authorization, binary upload, confirmation and attachment contract. New E2E cases cover profile/preferences persistence, formal job application persistence and duplicate protection, service membership/self/duplicate/participant transitions, organization duplicate/cross-org/private-file denial, and mentorship request persistence/privacy. The final head is not accepted until all tests pass on that exact SHA and their manual execution is recorded.
- G5: **NOT PASSED** — smoke tests are not role-separated browser E2E; full persisted-state and negative-path journey evidence is outstanding.
- G6: **NOT PASSED** — backup/restore, rollback rehearsal, production-like readiness and residual-risk acceptance remain outstanding. The current branch is treated as a scoped release-candidate only for the in-scope workflows named in the release audit; events, projects and learning are explicitly removed from the release scope. Provider-backed payment delivery and notification-delivery evidence remain excluded from the current release.
- No production database has been touched. No deployment or merge has been performed. No advertised feature has intentionally been removed or disabled.

### Required next sequence

1. Complete G0 route-to-screen and contract inventory, including exact API request/response shapes and authorization boundaries.
2. G1 is closed for commit `08e1b581cf22b795b80bc9a572c6ff514ef6e4ba`; preserve the committed lockfile and `npm ci` in all subsequent changes.
3. G2 is closed for the evidenced identity/session, privileged-role, organization-evidence and reviewer-conflict boundaries. Reopen it if G4/G5 uncovers an authorization regression; broader workflow-specific scope acceptance remains tracked in the matrix.
4. Keep production migration blocked until an operator verifies the actual production schema against a reviewed backup/restore copy and records the exact baseline using `docs/32-migration-operations-runbook.md`. G3's disposable-database acceptance is complete; production baseline verification is an explicit operational prerequisite, not an inferred PASS.
5. For G4, preserve the connected workflow implementations and require full browser/service regression evidence on the final branch head. Unsupported capabilities must be marked not implemented rather than implied complete.
6. Run G5 and G6 only after their acceptance criteria and evidence are available.

This roadmap is evidence-driven: green CI is tied to a specific commit and is not a claim that all product workflows are complete.


## Gate 4 scoped-workflow execution update — 2026-10-10

The authoritative workflow-by-workflow status, assertion coverage, current-head manual test evidence and remaining UI/integration gaps are maintained in [the Workflow Reconciliation Matrix](31-workflow-reconciliation-matrix.md). The matrix is the acceptance detail; this roadmap remains the gate-level authority.

Changes made on `reconciliation/holistic-gates` without merging or deploying:

- Mentorship search now separates draft criteria from submitted criteria. Search and retry cause an intentional API request rather than relying on an input-change effect while the submit button can be disabled by a loading state.
- Added a membership API/E2E lifecycle: application, correction request/response, approval, fee-checked manual payment, idempotent payment retry, reviewer verification, activation and persisted-history assertions. It also asserts duplicate application, premature activation, incorrect payment amount and member denial from the review queue.
- Added verification API/E2E assertions for case creation retry/idempotency, member-only case visibility, reviewer-only queue/transition authorization, reviewer assignment, invalid transition rejection and persisted case state.
- Corrected the verification case-detail and case-action route segment counts/identifiers (consent, assignment, transition, claims, evidence, decision, member response and appeal). The regression test exercises the owner, a different member and a reviewer rather than treating route existence as proof.
- Retained all existing assertions. The previous failing mentorship assertion remains mandatory; no test was skipped or weakened. New test-only actors are provisioned through the domain service rather than repeatedly hitting the shared public registration throttle; the public registration endpoint remains covered by API smoke.

**Acceptance rule:** The commits above are implementation/test changes, not a PASS. The most recent successful G4 automated record remains tied to its exact earlier SHA and does not automatically certify this head. Run the retained test suites manually on the final code-and-documentation SHA, record commands and complete output, and resolve any failure before G4 can be marked PASS.

**Explicit remaining workflow/UI gaps (not to be hidden by green API tests):**

1. Membership now has a dedicated /membership UI for plan selection, application submission, correction response, manual payment submission, reviewer decisions, payment verification and separate activation. Renewal selection is present; expiry/suspension and dynamic member evidence checklist guidance, expiry and suspension remain unaccepted.
2. Generic verification now has a /verification member/reviewer workspace for active program discovery, owned cases, consent, claim metadata, private file evidence, member response, appeal submission, reviewer assignment, state transition and reasoned decision. Checklist/referee/concern review and independent appeal-review UI remain open.
3. ATS now has a /recruitment organization-scoped candidate pipeline, job draft/publication, contract-valid candidate state changes and interview scheduling. Team assignment, screening-question authoring, scorecard authoring, recruiting notes and offer issuance/approval now have controls; interviewer feedback/ratings and complete candidate timeline UI remain open.
4. Organization public inquiry decisions and private evidence submission remain connected; an authorized reviewer queue, authenticated private evidence download and reasoned decision UI are now present. Missing/failed evidence and required-evidence policy variants remain open.
5. Services and mentorship core participant workflows are connected and tested; provider-backed notification delivery and payment integrations are not configured or evidenced as operational.
6. Talent consent-controlled discovery and inquiry/contact release are connected; external notification delivery is not configured. Additional dedicated consent-revocation/cross-owner browser cases remain open.
7. Notification preferences persist, but provider-backed delivery, retries and operational delivery monitoring are not proven.

G4 exit is scoped: close only journeys that pass current-head positive, negative, invalid-state, retry and persistence evidence. API-only pieces remain explicit UI/integration gaps. G5 role-separated acceptance and G6 production readiness remain separate, not implied by G4.


### Latest CI execution status — do not mark G4 PASS

Latest automatic workflow events on code SHA `7fa48319799d7d3a84437cefe1b847c67414759a`: push run [38149759804](https://github.com/Jafermenza/ET-Professionals-Network/actions/runs/38149759804) and PR run [38149763811](https://github.com/Jafermenza/ET-Professionals-Network/actions/runs/38149763811) ended before any CI step started. The job record reports `runner_id: 0` and `steps: []`; this is not a test result. The maintainer has deferred intentional CI reruns because of billing. Documentation-only commits followed this code SHA, so the final head also remains unaccepted.

The last fully executed run is [38080002701](https://github.com/Jafermenza/ET-Professionals-Network/actions/runs/38080002701) on `a87be60e140a18253366b1de19c89cbb77a5fad5`. It ran migrations, unit tests and web build successfully but failed four browser tests: two newly added fixtures hit the shared public registration rate limit, a downstream test hit the same limit, and the mentorship outage fixture attempted to submit while its button was disabled. These are recorded as failures, not silently reclassified. The test fixtures and search readiness check were corrected after that run, and verification action responses were corrected to return committed state, but the fixes still require execution on the current head.

**Current acceptance action:** run the manual validation sequence in [the manual test and deployment policy](36-manual-test-release-and-deployment-policy.md) on the exact release commit. Record actual unit, migration, build, API-smoke and browser results separately. Until current-head evidence is recorded, G4 remains unaccepted.


## Scoped G4 implementation follow-through (CI deferred by billing)

The maintainer has explicitly deferred intentional CI reruns until repository Actions billing is available. GitHub nevertheless created automatic push/PR workflow events for commits; those attempts ended before runner assignment. Work therefore continues through repository inspection and code/documentation updates, but implementation is not labelled tested or accepted merely because CI cannot run.

The current branch now adds:
- Owner-scoped membership application history and a `/membership` UI spanning plan selection, application submission, correction response, manual payment submission, reviewer decisions, finance verification and separately gated activation.
- Active verification program discovery, member-owned case list and a `/verification` workspace for consent, claims, private evidence upload/attachment, member response, appeals, reviewer assignment, state transitions and reasoned decisions.
- Organization verification reviewer queue and decision UI, including authenticated private evidence retrieval.
- Job-scoped candidate listing and a `/recruitment` workspace for authorized organization/job selection, job drafts/publication, candidate pipeline transitions and interview scheduling.
- Dashboard entry points to these workflows, contract documentation and Playwright coverage for the new membership, verification, ATS and organization-review screens/journeys. Existing assertions were retained.

### Current acceptance status

**G4 = IMPLEMENTED — EXECUTION DEFERRED, not PASS.** Automatic push/PR workflow events ended before any step ran (`runner_id: 0`, empty steps); no executable test result exists for the landing-page code or later documentation commits. Run the final suite on one exact branch SHA once billing permits it. Any actual failures must be corrected without removing or weakening assertions.

Still open beyond the scoped workflow UI: project/task linkage and sync conflict semantics for the new encrypted offline field evidence queue; live payment and notification providers; verification checklist/referee/concern review UI and dedicated appeal-lifecycle browser acceptance; ATS interviewer feedback/ratings and complete candidate timeline UI; external calendar integration; events/calendar, learning/Moodle, projects/volunteers/donations and payment-to-donation allocation. These are recorded as implementation gaps rather than being represented as operational.


## Validation policy update — 2026-10-14

The GitHub Actions workflow `.github/workflows/ci.yml` has been removed from the currently listed branches by maintainer decision. References above to CI runs, run IDs and green historical commits describe evidence that was produced at those earlier commits only; they are not a current automated gate and must not be presented as validation of the current head. Retain the committed test suites and run them manually as described in [the Manual Test, Release, and Deployment Policy](36-manual-test-release-and-deployment-policy.md). The current G4 status must be based on newly recorded execution output, not on historical Actions links.


## 10. Product UX and business-workflow remediation (added 2026-10-14)

The detailed requirements are now recorded in [37 — Specific Product Gap Audit](37-specific-product-gap-audit.md) and [38 — Required Product Rules and Functional Requirements Addendum](38-product-functional-requirements-addendum.md). These are product requirements and must be incorporated into implementation planning; they are not a claim that the work is complete.

Required sequencing:
1. **P0 — enforce role and membership invariants:** Organization accounts cannot access professional profile routes/APIs; non-members cannot edit member profiles or publish services/mentor offers; membership activation requires confirmed fee payment plus authorized approval; regular membership validity is one year; plan and fee rules are admin-configurable.
2. **P0 — job-seeker demand with consent:** members and non-members can request consideration without a listed vacancy; Support Desk review precedes any employer sharing; explicit, revocable consent controls what is shared.
3. **P1 — guided professional profile and reference portfolio:** structured education; admin-managed nationality, occupation, industry, field of study, experience ranges, languages, qualifications, education levels and institutions; CSV import/export; “Other” reveals custom input; Gender label with Male/Female options; multiple traceable portfolio items and optional private evidence.
4. **P1 — service and mentorship marketplace:** complete listing/request/delivery/outcome lifecycles; private unmet-need intake; admin publication of privacy-safe demand topics; join/interest levels and need assessment; organization provider and demand workflows.
5. **P1 — truthful notifications and low-effort forms:** carded sections, responsive two-column layout, progressive disclosure, structured selectors, retained inputs, explicit success/error/pending/correction messages and next actions.
6. **P2 — reporting and homepage:** role-scoped configurable reports with branded PDF/XLSX output; live published homepage feeds for services, jobs, professional discovery, mentorship and demand topics.

For each increment, update the screen → API → service → persistence row in [31 — Workflow Reconciliation Matrix](31-workflow-reconciliation-matrix.md), add role-positive and role-negative tests, and record actual manual validation against the exact commit. Do not mark an increment accepted merely because the documentation or a UI shell exists.

## P0 implementation update — 2026-10-14

The first P0 code increment is committed on `reconciliation/holistic-gates`, with the full progress and remaining validation record in [39 — P0 Implementation Progress and Roadmap](39-p0-implementation-progress-and-roadmap.md). Current implementation includes organization-only professional-profile redaction/denial, current-membership date guards for profile editing and provider publication/discovery, approved-application + verified-payment enforcement, and a no-vacancy job-interest workflow with versioned, field-scoped, revocable named-employer consent plus Support Desk and employer-scoped routes.

**Acceptance remains OPEN.** Unit tests, TypeScript/build, disposable migration/rerun, API privacy matrix and browser journeys have not been executed for this branch head. No CI workflow is to be created or enabled until all current gaps are implemented. Do not merge or deploy.

## 11. Current implementation checkpoint — 2026-10-14

Work continues on draft PR [#3](https://github.com/jafermenza1/MPA-Professsionals-Network/pull/3), branch `reconciliation/holistic-gates`. Keep it open until all currently registered gaps are implemented and accepted. No GitHub Actions CI workflow is enabled during this remediation period.

### P0 status
P0 code for organization/professional profile boundaries, current membership and payment/approval gates, public service requests by non-members, and consent-based job-seeker demand is committed. Manual test, migration rerun, build and privacy-matrix evidence are still outstanding; P0 is not accepted.

### P1 status
The first guided professional profile increment is committed:
- structured education rows and multiple portfolio records;
- admin-managed reference list UI and CSV import/export endpoints;
- starter choices and `Other` custom values;
- Gender label with Male/Female options;
- optional private evidence upload using the existing authorization/upload/confirm lifecycle, including mobile camera capture where supported and owner-only download;
- visibility-filtered education and portfolio in the professional directory projection;
- focused regression tests.

**Not yet validated:** migration apply/rerun, unit tests, TypeScript/build, CSV edge cases, and private evidence owner/other-user/public-API checks. Reference-list edits currently update the published version in place; the full draft/approval/publication version workflow remains outstanding.

### Next work order
1. Validate P0 and P1 manually against a disposable PostgreSQL database and correct failures without weakening existing tests.
2. Finish reference portfolio versioning and import preview/review before treating administrator reference data as production-grade.
3. Continue P1 service/mentorship lifecycle, private unmet-demand intake, publication, matching, interest levels and outcomes.
4. Continue accessible forms, retained input on errors, and truthful save/submission/retry notifications.
5. Implement P2 configurable role-scoped reporting and branded PDF/XLSX export, plus live published homepage feeds.
6. Complete P3 manual E2E, isolation/security, backup/restore rehearsal, monitoring and deployment acceptance.
7. Keep PR #3 open/draft and do not restore CI until all current gaps are implemented and accepted.


### P1 status — marketplace and demand implementation checkpoint (2026-10-14)

**Committed to the working branch; not accepted.** Added private unmet-service/mentorship demand intake, Support Desk review, separately authored public demand topics, unique per-user interest levels and aggregate counts; added service/mentor listing moderation, public discovery gates, organization-owned service listings and organization-scoped service-request actions. New entry points are `/service-demand` and `/admin/marketplace`. Progress and explicit residual gaps are recorded in [39 — P0/P1 Implementation Progress and Roadmap](39-p0-implementation-progress-and-roadmap.md) and [31 — Workflow Reconciliation Matrix](31-workflow-reconciliation-matrix.md).

**Not yet implemented or proven:** organization-owned mentorship offers; durable notifications; full route/UI E2E; privacy-negative tests; migration apply/rerun; TypeScript/build; unit/API suite. No CI workflow was added. Keep PR #3 open/draft and do not merge/deploy until all current gaps are implemented and accepted.


### P2 status — reporting, exports and bulk approved-member administration (2026-10-14)

**Code committed on `reconciliation/holistic-gates`; validation not run.** Added `/admin/reports` with a permission-filtered catalogue, date/status/search filters, on-screen results, PDF/XLSX downloads and audit events for report generation/export. Initial reports cover membership status and member directory, payment/reconciliation states, generalized service/mentorship demand interest, provider listing moderation and administrative audit activity. Sensitive member/audit reports are restricted to platform administrators; payment reconciliation is also available to finance officers.

Added `/admin/members` using the existing `membership_import` / `membership_import_row` match-and-provenance model. It includes a required-column CSV template, validation preview, existing-account matching, conflict detection, reasoned batch apply, member-detail CSV/XLSX export, and one-time password-claim invitations for newly created accounts. Imported historical payments are not created or marked as verified.

**Still open:** run the focused P2 tests and full suite; apply/rerun migrations on disposable PostgreSQL; validate report SQL against the actual schema; open generated PDF/XLSX in real clients; test permission-denied and cross-scope cases; prove the email outbox delivers the invitation template; and verify import rollback/idempotency under duplicate/race scenarios. Do not merge/deploy or restore CI as part of this increment.


## P2 live homepage feeds checkpoint — 2026-10-14 (code committed, acceptance pending)

Added `web/app/live-network-feeds.tsx` and `web/app/live-network-feeds.module.css`, integrated below the homepage journey cards in `web/app/page.tsx`. Five independent, bounded public feeds now request published services, public jobs, opt-in professional discovery, approved public mentors, and published service/mentorship demand topics. Each feed has its own loading skeleton, empty-state language, failure message, retry action and contact-support path; one API failure does not replace or block other sections. Feed copy is written for people first—what is available, who may help, where help is needed and what to do next—rather than promotional jargon. Layout adapts from two-column desktop cards to a single-column mobile experience, follows shared light/dark theme tokens, includes keyboard focus and reduced-motion behavior, and avoids invented counts or private demand details.

**Not yet validated:** no TypeScript check, production build, browser test, API-failure simulation, accessibility audit or current-head manual acceptance has been run. Confirm the actual route behavior for all five destinations, public/consent filtering in production data, partial failures, empty feeds, mobile widths and keyboard/screen-reader operation. The feed does not claim that displayed items are new, popular, verified beyond the underlying publication rules, or guaranteed to remain available after the response is loaded. Keep PR #3 draft/open and do not deploy or merge based on this code-only checkpoint.


Implementation detail: `e2e/homepage-live-feeds.spec.js` was added with three Playwright scenarios for all five feed sections, one-section API failure/retry while other feeds remain visible, and truthful empty states. This test file is committed but **has not been executed**; it is test intent, not validation evidence.


## In-app notification action center — foundation checkpoint (15 October 2026)

- Recorded the complete product decision, seven notification categories, role-aware recipient/privacy rules, interaction and delivery semantics, API surface, implementation inventory and acceptance plan in `docs/44-in-app-notification-action-center.md`.
- Added an additive notification schema migration; an authenticated inbox service with counts, filtering, read/read-all/archive and audit events; API routes; a notification inbox page; a shared-shell unread badge; and category/title/body/action metadata for membership-generated notifications. Existing email operations and the notification outbox are retained.
- Added storage/API support for per-category in-app preferences and an optional digest preference. The membership workflow notifier and shared workflow-email notifier now honor global/category in-app preferences; the inbox and unread counts apply the same preference filter. Scheduled digest delivery is not implemented. Complete producer-inventory and preference behavior tests remain required.
- **Acceptance NOT RUN.** No tests, typecheck, production build, migration execution/rerun, browser or accessibility review is claimed. Workflow wiring across every category, administrator intervention aggregation, category preference enforcement across all producers, and cross-role privacy proof remain explicit follow-up. Keep PR #3 draft/open; do not merge or deploy.



## Action-center workflow routing increment — 15 October 2026

- Centralized notification category resolution, preference enforcement, safe next-action links, transition-aware deduplication and persisted notification metadata through `src/platform/notifications.js`; `queueWorkflowEmail` now uses the shared in-app policy while retaining the existing email outbox boundary.
- Wired persisted workflow notifications and recipient resolution across membership/review/payment, verification/appeals, organization verification/access, recruitment/application/offer/interview, mentorship/matching/sessions, services/moderation/delivery/payment, and account-security transitions.
- Security-critical account notices bypass optional category/global notification preferences and remain visible in inbox/count projections. Reviewer links point to existing authorized queues; no parallel workflow queue was introduced.
- Events/learning notifications remain unwired because those modules are not deployed. No external calendar/Moodle/SMS/push delivery is claimed.
- Added `test/platform/workflow-notification-routing.test.js`, `docs/45-workflow-notification-routing.md`, and additive migration `20261015210000_notification_category_legacy_backfill.sql` for historical underscore-style event codes. **Tests, migrations, build and browser validation have not been run.** Continue acceptance against the current head and preserve PR #3 as draft/open; no merge or deployment.


## Increment 4 — Fast discovery experience (implementation checkpoint; acceptance open)

The current branch adds bounded discovery paging for professionals, opportunities, services and mentors; shared accessible pagination controls; and a new public organization directory constrained to verified, explicitly public organizations. Search criteria remain routed to existing server-side filters, and protected/private workspace routes remain separate. The install prompt is now delayed until 10 seconds after first page load and shown once per browser profile unless storage is unavailable.

Implementation and acceptance details are recorded in docs/46-first-increment-workflow-routing-corrections.md and docs/31-workflow-reconciliation-matrix.md. Static contract tests were added but have not been executed. **Increment 4 is not accepted.** Current gaps include consistent account-owned saved items for professional profiles, organizations, services and mentors; SQL-efficient scope-aware job pagination; dedicated public profile routes where the existing detail panels are insufficient; and exact-head build/API/browser/accessibility validation. Keep PR #3 draft/open; do not merge or deploy.


## Increment 4 follow-up — saved discovery items, SQL paging and detail pages (IMPLEMENTED, NOT ACCEPTED)

- Added account-owned saved-item persistence for professionals, verified public organizations, visible service listings and eligible mentors, plus `/saved` management UI and save/unsave controls. Existing saved jobs and talent saved searches remain unchanged.
- Added owner-authenticated saved-item APIs. Save writes verify target visibility; list reads are owner-scoped and re-check public/member visibility. Unavailable targets are omitted.
- Opportunity pagination now applies posting-scope visibility in SQL before count/limit/offset, using deterministic ordering; this removes the old all-results-in-memory + per-result membership-query pattern.
- Added dedicated detail routes for professionals, organizations, services and mentors, with server-side visibility checks and text-first loading.
- Migration `20261016200000_saved_discovery_items.sql` is committed to the branch but has not been applied to any database.
- Validation is open: do not claim acceptance until migration-backed API tests, cross-account authorization tests, typecheck/build, browser, responsive and throttled-network checks pass on the exact head.


## App-store packaging readiness

The repository assessment is recorded in [docs/47-app-store-packaging-readiness.md](47-app-store-packaging-readiness.md). Android distribution is feasible via a hosted PWA Trusted Web Activity or Capacitor; iOS distribution is feasible via Capacitor but needs app-specific utility beyond a thin website wrapper to reduce App Review Guideline 4.2 risk. No native project, signed package, store submission or approval has been produced. Packaging follows Increment 4 acceptance and requires explicit authorization.

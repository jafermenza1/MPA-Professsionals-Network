# Holistic Application Reconciliation Plan

**Status:** Active — G0 PASS; G1 PASS on its verified implementation head; G2 PASS on its verified implementation head; G3 PASS on disposable PostgreSQL only (production baseline remains unverified); G4 scoped workflows expanded; current-head CI blocked before runner assignment; G5/G6 not passed  
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
6. A gate is **PASS** only when its acceptance evidence is recorded. A plan, code review, or CI configuration alone is not proof of execution.
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
- CI is defined in `.github/workflows/ci.yml`; it provisions PostgreSQL 16, runs `npm install`, migrations, tests, web build and a `/healthz` smoke check.
- The migration runner in `scripts/migrate.js` enumerates and executes every sorted SQL migration on every run. A migration ledger and safe rerun behavior have not yet been demonstrated.
- The product contracts explicitly require server-side authorization and resource scope, privacy of sensitive evidence, auditable state changes, idempotent consequential operations, realistic migration tests, and end-to-end acceptance.
- At baseline commit `dd5eb406e04e4a775711c8f01c8c33bd32ea382a`, no npm, pnpm or Yarn lockfile was present. Gate 1 generated the npm workspace lockfile on a network-enabled GitHub runner, committed it as `package-lock.json`, removed the temporary bootstrap/artifact/write-permission steps, restored CI to `contents: read`, and switched the pipeline to `npm ci --no-audit --no-fund`.
- Existing test files cover identity/password validation, platform foundation/theme, membership import and lifecycle, Reference Portfolio validation/service, verification, organizations/jobs, and services/mentorship.
- The web app contains public landing, registration/login, profile, dashboard, admin, field operations, jobs/apply, network, organizations, services, mentorship, opportunity intake, and inquiry tracking screens.
- Only one CI workflow is present in the repository tree. It runs a migration/test/build/smoke sequence but does not itself demonstrate browser E2E coverage of every advertised capability.

### Initial risk register — hypotheses to verify during the gates

| ID | Area | Initial observation / risk | Required proof or action |
|---|---|---|---|
| R-01 | Build/CI | Historical baseline lacked a lockfile and used `npm install`; Gate 1 later committed `package-lock.json` and switched CI to `npm ci`. | Preserve the committed lockfile and clean-install contract; current-head execution is deferred by maintainer billing instruction. |
| R-02 | API contract | Two `GET /api/v1/me` handlers existed; the first returned only account/role data and shadowed the later profile response consumed by the dashboard. | **Fix committed on this branch:** removed the shadowing handler; CI passed on the resulting server change. Add a focused authenticated route contract test during G5. |
| R-03 | Authorization | Tokens contain role claims while account sessions are checked against the database. A role change may leave old role claims active until expiry unless sessions are revoked or roles are reloaded. | Trace every privileged route and role mutation; test role grant/removal and session revocation. |
| R-04 | Migrations | The original runner had no history ledger and reran every SQL file on every invocation. | **Fix under CI validation:** migration runner now records filename + SHA-256 checksum, refuses edits to already-applied migration files, and applies each new migration and ledger entry in one transaction. CI now runs the migration command twice. A fresh-DB rerun is not a substitute for validating an existing-schema upgrade. |
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
- G4: **IMPLEMENTATION EXPANDED — acceptance pending** — public job inquiry remains separate from authenticated formal draft→submit applications; profile and notification preferences use live APIs; mentorship requests are account-scoped and reload from persisted state; service request UI exposes provider/requester lifecycle actions; organization evidence UI uses the private upload authorization, binary upload, confirmation and attachment contract. New E2E cases cover profile/preferences persistence, formal job application persistence and duplicate protection, service membership/self/duplicate/participant transitions, organization duplicate/cross-org/private-file denial, and mentorship request persistence/privacy. The final head is not accepted until all tests and CI pass on that exact SHA.
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

The authoritative workflow-by-workflow status, assertion coverage, current-head CI record and remaining UI/integration gaps are maintained in [the Workflow Reconciliation Matrix](31-workflow-reconciliation-matrix.md). The matrix is the acceptance detail; this roadmap remains the gate-level authority.

Changes made on `reconciliation/holistic-gates` without merging or deploying:

- Mentorship search now separates draft criteria from submitted criteria. Search and retry cause an intentional API request rather than relying on an input-change effect while the submit button can be disabled by a loading state.
- Added a membership API/E2E lifecycle: application, correction request/response, approval, fee-checked manual payment, idempotent payment retry, reviewer verification, activation and persisted-history assertions. It also asserts duplicate application, premature activation, incorrect payment amount and member denial from the review queue.
- Added verification API/E2E assertions for case creation retry/idempotency, member-only case visibility, reviewer-only queue/transition authorization, reviewer assignment, invalid transition rejection and persisted case state.
- Corrected the verification case-detail and case-action route segment counts/identifiers (consent, assignment, transition, claims, evidence, decision, member response and appeal). The regression test exercises the owner, a different member and a reviewer rather than treating route existence as proof.
- Retained all existing assertions. The previous failing mentorship assertion remains mandatory; no test was skipped or weakened. New test-only actors are provisioned through the domain service rather than repeatedly hitting the shared public registration throttle; the public registration endpoint remains covered by API smoke.

**Acceptance rule:** The commits above are implementation/test changes, not a PASS. The most recent successful G4 record remains tied to its exact earlier SHA and does not automatically certify this head. Run the complete CI pipeline on the final code-and-documentation SHA, record both push and pull-request run URLs, and resolve any failure before G4 can be marked PASS.

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

**Next acceptance action:** after billing is restored, run push and PR CI on the same final head, resolve actual failures without weakening assertions, and record exact links. Until then G4 is implemented but unaccepted.


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

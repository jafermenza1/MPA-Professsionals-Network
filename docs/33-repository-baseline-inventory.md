# Repository Baseline Inventory — Holistic Gates

**Baseline commit inspected:** `dd5eb406e04e4a775711c8f01c8c33bd32ea382a`  
**Working branch:** `reconciliation/holistic-gates`  
**Inventory date:** 2026-10-10  
**Purpose:** Gate 0 baseline for the reconciliation roadmap. This is an implementation inventory, not proof that every advertised workflow is complete.

## Contract precedence and change control

The product and engineering contracts remain authoritative. Reconciliation changes must preserve existing capabilities, server-side authorization, private evidence, audit trails, transaction safety, and business-state constraints. Do not merge or deploy as part of gate work. Do not claim a gate PASS from source inspection alone; runtime evidence belongs in the acceptance record.

Authoritative contracts:
- Product scope/personas: `docs/01-product-requirements.md`
- Domain entities and invariants: `docs/03-domain-model.md`
- Actors, role scope and separation of duties: `docs/04-roles-and-permissions.md`
- Lifecycle journeys and offline conflict policy: `docs/05-workflows.md`
- Architecture and module boundaries: `docs/06-system-architecture.md`
- API semantics and upload protocol: `docs/07-api-contract.md`
- Privacy/security: `docs/08-security-privacy.md`
- Quality/release acceptance: `docs/11-quality-acceptance.md`
- Developer/change guide: `docs/12-developer-guide.md`
- Product/delivery and traceability: `docs/13-product-and-delivery-contract.md`, `docs/14-requirements-traceability.md`
- Reference data governance: `docs/15-baseline-data-specification.md` through `docs/21-reference-import-format.md`
- Deployment and migration operations: `docs/32-cpanel-shared-server-deployment.md`, `docs/32-migration-operations-runbook.md`

## Runtime and dependency topology

| Concern | Observed implementation | Contract / risk |
|---|---|---|
| Runtime | Root ESM Node.js HTTP server, `server.js`; declared Node engine `>=20` | Keep API validation/authentication at server boundary |
| Web | npm workspace `web/`, package `@mpa/web`, Next.js 14, React 18, TypeScript, Tailwind, TanStack Query, Zustand, Framer Motion, Radix Dialog, Lucide, Playwright | Web build is separate from API server; browser coverage is currently smoke-level rather than complete role-separated acceptance |
| Persistence | PostgreSQL via `pg`; shared pool/config in `src/platform/db.js` and `src/platform/config.js` | No production DB was inspected as part of this baseline |
| Migrations | `db/migrations/*.sql`, sorted by filename; runner `scripts/migrate.js`; checksum/history logic in `src/platform/migration-ledger.js` | Current migration chain contains 21 files: numbered migrations 001–020 plus `20261010190000_separate_directory_visibility.sql`. Do not infer production baseline from CI fixtures. Do not infer production baseline from CI fixtures |
| Auth/session | `src/platform/auth.js`, `src/platform/user-admin.js`; DB-current role resolution and session revocation were added in reconciliation work | Full role/resource scope matrix remains open under G2 |
| Audit/notifications/payments | `src/platform/audit.js`, `notifications.js`, `payment-workflow.js`, `payments.js` | Each consequential state transition must be checked for audit/idempotency; implementation existence alone is not acceptance |
| Private files | `src/platform/private-file-storage.js`; upload authorization/content/confirm and authorized read routes in `server.js` | Keep storage outside public web root; test owner/organization/reviewer access and denial |
| Domain modules | `src/membership/`, `src/verification/`, `src/talent/`, `src/organization-jobs/`, `src/services-mentorship/`, `src/reference-portfolio/`, plus `src/platform/` | See workflow matrix for screen/API/service/persistence mapping and unverified paths |
| Test suites | `test/identity-password-validation.test.js`; `test/membership/`; `test/platform/`; `test/verification/`; `test/organization-jobs/`; `test/services-mentorship/`; `test/reference-portfolio/`; `scripts/ci-api-smoke.js`; `e2e/gate4.spec.js` | Unit/API/migration/browser checks are different evidence classes and must not be conflated |
| CI | `.github/workflows/ci.yml`; PostgreSQL 16 service; install, migrations + rerun, isolated legacy-adoption scenario, unit tests, Next build, API smoke, Playwright Chromium/browser workflow | Historical baseline at `dd5eb406e04e4a775711c8f01c8c33bd32ea382a` lacked a lockfile and used `npm install`. Gate 1 subsequently committed `package-lock.json` and changed CI to `npm ci --no-audit --no-fund`; this inventory row is historical, not a current install claim. Current-head CI execution is deferred by the maintainer due to billing. |
| Operational files | `.env.example`, `Dockerfile`, deployment and migration runbooks | Secrets stay in environment/secret store; no production operation is authorized by this inventory |

## UI screen → API/service boundary

| Web route | Main API/domain boundary | Known state and required verification |
|---|---|---|
| `/`, `/login`, `/register` | Public landing and current route entry points; `POST /api/v1/auth/register`, `POST /api/v1/auth/login` | Landing now presents current membership, job, mentorship, organization and tracking entry points. Visual/build/browser acceptance is still pending on the current head because CI has no assigned runner; auth expiry and role-change browser cases remain open |
| `/profile` | `GET /api/v1/me`, `PATCH /api/v1/me/profile`, `PATCH /api/v1/me/talent-profile`, `GET/PATCH /api/v1/me/talent-visibility` | API contracts exist; field-level persistence and private/public visibility must be tested |
| `/dashboard`, `/track` | `GET /api/v1/me`, `/api/v1/me/application-tracking`, membership history and notification preferences | Verify loading/empty/error states and role-specific visibility |
| `/jobs`, `/apply/job` | Jobs list/detail, eligibility, draft/apply/submit, saved jobs, alerts, application progress/notes/interviews | Public inquiry must not be represented as a formal application; ID-specific application and persisted candidate visibility remain open |
| `/organizations` | Organization registration/list/detail, organization users, evidence and verification submission/review; organization/job services | Owner submission and reviewer queue/decision UI exist; required-evidence policy variants and complete owner/reviewer role-separated browser matrix remain open |
| `/services` | Service listings, requests, request status, milestones, deliveries, payments, reviews and feedback | UI connected for listing/request and participant lifecycle actions. Full delivery/revision/acceptance/payment/feedback browser lifecycle and operational payment/notification providers remain open |
| `/mentorship`, `/apply/mentorship` | Mentor discovery/profile/availability, mentorship requests/matches/goals/sessions/status/feedback | Request/match/session UI and persistence assertions exist; provider-backed notifications and external calendar integration are not configured; current-head browser acceptance is pending |
| `/network` | Talent discovery, visibility, saved searches, talent inquiries/responses | Verify consent, privacy, ownership and organization boundaries |
| `/field` | Encrypted offline private-file queue, IndexedDB persistence, retry and private upload/checksum confirmation | Partial only: evidence is not linked to project/task records; domain operation UUID/timestamp, reviewer acknowledgement and entity-specific conflict policy remain missing |
| `/admin` | User status/role/session administration, organization verification requirements, review routes, experience/demo guide management | Role-by-role allow/deny, self-approval prevention and separation of duties remain open |
| `/apply`, `/apply/opportunity` | Public opportunity intake, details/token, account linking, inquiry list/decision | Validate token boundaries, error states and cross-organization denial |
| `/error` | Next.js error boundary | Verify user-safe rendering and correlation IDs without exposing stack traces |

## API route families and service ownership

The route registry is currently centralized in `server.js`. The API families below are observed from route dispatch and imports; this list is a navigation aid, not a guarantee every branch has adequate tests.

| API family | Service / persistence owner |
|---|---|
| Health/readiness: `GET /healthz`, `GET /readyz` | server/config/DB readiness |
| Auth, `/me`, membership applications, renewal/history, profile, preferences | `src/membership/service.js`, `src/platform/auth.js`, `src/platform/user-admin.js` |
| Admin users, role/status changes, password reset, session revocation | `src/platform/user-admin.js`, auth/session tables, audit |
| Verification cases, claims, evidence, decisions, appeals, reviewer queue | `src/verification/service.js`, private file storage, audit |
| Talent profiles/visibility, directory, saved searches, inquiries | `src/talent/service.js` |
| Organizations, organization members, verification, jobs, requisitions, applications, interviews, saved jobs/alerts | `src/organization-jobs/service.js` |
| Services and mentorship profiles, requests, matches, goals, sessions, delivery, payment and feedback | `src/services-mentorship/service.js` |
| Public opportunity inquiry, details token, linking, authorized inquiry decisions | `src/platform/public-opportunity.js` |
| Outcome workspace | `src/platform/stakeholder-outcomes.js` |
| Application tracking | `src/platform/application-tracking.js` |
| Demo cases and route guides | `src/platform/experience.js` |
| Private uploads and downloads | `src/platform/private-file-storage.js` |
| Reference Portfolio validation/import/publication | `src/reference-portfolio/` |
| DB pool, config, logging, audit, notifications, payments, theme and migration ledger | `src/platform/` |

## Migration inventory and safety boundary

Migration filenames observed at the baseline:
1. `001_reference_portfolio.sql`
2. `002_platform_foundation.sql`
3. `003_membership_import_manual_payments.sql`
4. `004_phase1_identity_membership.sql`
5. `005_member_completion_ui.sql`
6. `006_vetting_and_trust_framework.sql`
7. `007_phase2_verification_talent.sql`
8. `008_phase2_consent_boundary.sql`
9. `009_phase3_organizations_jobs.sql`
10. `010_phase3_hardening.sql`
11. `011_phase4_services_mentorship.sql`
12. `012_outcome_delivery_hardening.sql`
13. `013_comprehensive_job_portal.sql`
14. `014_demo_cases_and_ui_guides.sql`
15. `015_additional_ui_guides.sql`
16. `016_public_opportunity_intake.sql`
17. `017_production_security_and_sessions.sql`
18. `018_service_request_price_constraint_reconciliation.sql`
19. `019_gate4_private_uploads.sql`
20. `020_gate4_draft_verification_timestamp.sql`
21. `20261010190000_separate_directory_visibility.sql`

The CI fixture establishes a known disposable baseline by applying migrations 001–010, then testing adoption and forward application. It does **not** establish that production has any particular prefix applied. Production baseline, backup/restore and rollback rehearsal remain operationally unverified and are explicitly outside G0/G1 sign-off.

## Commands and evidence classes

| Command / mechanism | What it establishes | What it does not establish |
|---|---|---|
| `npm test` | Node test suites under `test/**/*.test.js` | Full UI journeys, production DB correctness, all role boundaries |
| `npm run migrate` twice | Fresh schema migration + no-op rerun in CI DB | Production baseline or restore readiness |
| `bash scripts/ci-migration-upgrade.sh` | Disposable legacy-adoption, sentinel preservation, fail-closed baseline, transactional failure rollback and rerun | Real legacy/production schema compatibility |
| `npm run web:build` | Next.js production compilation/build | Runtime/API correctness in every screen |
| `node scripts/ci-api-smoke.js` | API smoke including auth/session lifecycle and mentor discovery | Complete role-separated browser E2E |
| `npx playwright test` | Browser workflow(s) included in current Playwright config, including Gate 4 organization verification workflow | All advertised journeys and all negative paths |
| `GET /healthz`, `GET /readyz` | Basic health/readiness responses | End-to-end service health or DB data integrity |

## Baseline risks and open questions

| ID | Risk/question | Evidence needed / owner gate |
|---|---|---|
| G0-01 | UI/API mapping above is at feature-family level; every control and state transition is not yet traced line-by-line | Continue with matrix and screen-specific tests under G4/G5 |
| G0-02 | Production database schema, ledger and exact migration baseline are not available in this repo inventory | Operator schema/backup/restore review under G3/G6; do not infer |
| G0-03 | No committed root/workspace lockfile was present at baseline | Gate 1: generate with npm in a network-enabled environment, commit it, then prove `npm ci` |
| G0-04 | Centralized route dispatch in `server.js` makes route order significant; duplicate route shadowing previously occurred | Preserve one canonical handler per method/path and retain route contract tests |
| G0-05 | Public rate limit uses process-local memory | Document single-process assumptions and assess shared store/retention before production scale |
| G0-06 | Some advertised modules (events, learning/Moodle, payments/donations/projects) have contract references but full UI/service integration is not evidenced by the current screen inventory | Treat as gaps to verify; do not imply completion from requirements docs |
| G0-07 | Browser tests cover selected workflows only; role-separated E2E and negative ownership/privacy matrix remain incomplete | G2/G5 |
| G0-08 | Historical baseline used a broad semver dependency graph and `npm install`; repeat builds could resolve newer compatible versions | Gate 1 addressed this with the committed npm lockfile and `npm ci`; preserve that contract |

## Gate 0 exit decision

**G0 — PASS (baseline inventory recorded), with explicit follow-on risks.** The repository topology, authoritative contracts, screen/API/service families, migration chain, test commands, evidence limits and unresolved questions are recorded here and in `docs/31-workflow-reconciliation-matrix.md`. This does not mean workflows or production database readiness have passed. Any newly discovered route/screen mismatch reopens G0 for the affected area.

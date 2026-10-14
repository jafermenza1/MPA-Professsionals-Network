# Manual Test, Release, and Deployment Policy (GitHub Actions CI Removed)

**Effective date:** 2026-10-14  
**Decision:** The repository's GitHub Actions CI workflow has been removed from all currently listed branches by maintainer request. The workflow file `.github/workflows/ci.yml` is no longer the active validation mechanism. Application tests and test scripts remain in the repository; this change removes automation, not the tests themselves.

## Current branch changes

The workflow file was deleted from:
- `main`
- `docs/cpanel-deployment-progress-2026-10-13`
- `fix/comprehensive-test-ci`

The deletion was committed separately on each branch. Historical GitHub Actions runs and links elsewhere in the documentation are retained as historical evidence of what ran at that earlier commit. They must not be described as validation of the current code or as a current automated pipeline.

## What remains in the repository

Keep the actual tests and test-support scripts, including:
- Node tests under `test/`
- Playwright browser tests under `e2e/`
- `scripts/ci-api-smoke.js` (historical filename retained; it can be run manually)
- `scripts/ci-migration-upgrade.sh` (historical filename retained; run only against an isolated disposable PostgreSQL database)
- Migration runner and migration-ledger tests
- Production web build and API health/readiness checks

Do not delete or weaken assertions merely because GitHub Actions was removed. Do not run migration-upgrade fixtures against the live production database.

## Manual validation procedure

Run commands from the repository root in a development or staging environment. Use a disposable PostgreSQL database for migration tests and never point destructive test fixtures at production.

1. Confirm the intended branch and commit SHA; review the diff and working tree.
2. Install exactly the committed dependency graph:
   ```bash
   npm ci --no-audit --no-fund
   ```
3. Configure a disposable local/test PostgreSQL database using test-only credentials, then run:
   ```bash
   npm run migrate
   npm run migrate
   ```
   The second run should be a safe no-op. Run `bash scripts/ci-migration-upgrade.sh` only with its own disposable database URL and after reading the script.
4. Run unit tests:
   ```bash
   npm test
   ```
   If the root script does not discover every test file in a particular checkout, use the repository's documented test command and verify that all intended `test/**/*.test.js` files were discovered.
5. Build the production web application:
   ```bash
   npm run web:build
   ```
6. Start the API with test-only environment variables and run API smoke checks:
   ```bash
   CI_API_BASE_URL=http://127.0.0.1:3000 node scripts/ci-api-smoke.js
   ```
   Confirm the API is already running on the stated local port. Never paste secret values into logs or documentation.
7. Run browser tests against a locally running API and web app:
   ```bash
   npx playwright test e2e
   ```
   Install the repository's supported Playwright browser beforehand. Ensure `WEB_BASE_URL` and `API_BASE_URL` target local/staging test services, not production.
8. Separately smoke-test the deployed release:
   - portal home, login, and jobs routes return expected responses;
   - API `/healthz` and `/readyz` return HTTP 200;
   - portal-proxied membership products return HTTP 200 and expected JSON;
   - manually exercise registration/login, membership/application workflows, permissions, private evidence and relevant user journeys with test accounts.
9. Record exact commit SHA, commands, environment (local/staging/production smoke only), date, pass/fail output, discovered test counts, browser test summary, and unresolved failures in the appropriate document under `docs/`.

## Acceptance and reporting rules

- A test plan, test file, successful build, HTTP 200, or historical Actions run is not by itself proof that all business workflows pass.
- Report unit tests, migration tests, API smoke, production build, browser E2E, live smoke tests, security/isolation tests, and restore rehearsal as separate evidence classes.
- Do not mark a test PASS unless it was actually executed on the documented commit and the complete output supports that conclusion.
- A failed or unexecuted test remains failed or pending; do not remove it, skip it, weaken its assertion, or relabel it as passed to make the release appear green.
- Use isolated test data and accounts. Do not perform destructive migration or legacy-adoption tests on the live database.
- The production database backup must have a verified restore rehearsal into an isolated target before recovery readiness is claimed.
- Future maintainers must not recreate an automated CI workflow without an explicit new decision and updated deployment/testing documentation.

## Current deployment evidence (2026-10-14)

The cPanel deployment record documents:
- Portal home, login, and jobs routes previously returned HTTP 200.
- Latest checks: API health HTTP 200, API readiness HTTP 200, and portal membership products HTTP 200.
- All 25 current repository migrations were recorded on the live database and critical post-migration schema objects were checked.
- The user reports the portal workflows they tested are working well.

These observations are not a substitute for a full repeatable local test run, exhaustive authorization/isolation acceptance, or a database restore rehearsal. See [cPanel deployment progress and checklist](33-cpanel-deployment-progress-and-repeatable-checklist.md), [whole-platform readiness audit](34-whole-platform-readiness-audit.md), and [workflow reconciliation matrix](31-workflow-reconciliation-matrix.md).

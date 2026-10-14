# P0 implementation progress — identity, membership and job-seeker consent

**Working branch:** `reconciliation/holistic-gates`  
**Base:** `main`  
**State:** implementation in progress; keep the pull request draft/open until all gaps are implemented and manually accepted.  
**Automation policy:** do not add or restore a GitHub Actions CI workflow during this gap-remediation period. Keep test code and execute it manually when an environment is available. A missing CI run is not a pass.

## P0 scope and exit criteria

### P0-A — Organization/professional profile boundary
- Organization-only accounts must not read or update professional-profile endpoints or use the professional profile page as an organization workspace.
- The organization workspace/profile remains a separate resource and is scoped by organization membership.
- Do not delete historical person/profile rows as a shortcut. Deny the wrong resource boundary at the server and avoid returning professional fields to organization-only accounts.
- Acceptance: organization-only GET/PATCH attempts fail closed; authorized professional access still works; organization routes remain available.

### P0-B — Non-member restrictions
- A registered account is not an active member merely because it has a `member` role.
- Profile editing and professional directory editing require a current active membership record whose dates are valid.
- Service and mentor publishing must enforce the same rule in domain services, not just hide buttons.
- Public browsing, job-interest requests, permitted service requests and permitted demand participation remain available to non-members.
- Acceptance: API-level negative tests cover expired, pending, and absent membership; positive active-member journeys remain intact.

### P0-C — Membership approval/payment/activation
- Review approval and finance payment verification remain distinct states.
- Activation requires an approved application, a verified successful payment linked to that application, and an authorized activation actor.
- Never trust the client redirect, submitted amount, or payment initiation as proof of payment.
- Membership end dates follow the configured plan duration; the basic/regular annual plan must be configured to 365 days and plan/fee edits remain admin-controlled.
- Acceptance: activation-before-approval, activation-before-payment, failed/rejected payment, wrong amount, duplicate payment retry and unauthorized activation all deny; a verified approved application activates once.

### P0-D — Consent-based job-seeker demand
- Members and non-members may request consideration without a listed vacancy.
- New job-seeker demand is private to the applicant and Support Desk by default.
- Employer sharing is opt-in, explicit, field-scoped, audience-scoped and revocable. Generic inquiry consent is not employer-sharing consent.
- Only Support Desk/platform staff may share a consented request with a specific organization; only that organization’s authorized members can view its shared summary.
- Record who shared what, with whom and when. Revocation stops future discovery and employer reads; never share contact details unless separately selected by the applicant.
- Acceptance: private-by-default, no-vacancy intake, consent denial, field allow-list, cross-organization denial, audit/share history and revocation tests.

## Current execution record

| Item | Status | Evidence |
|---|---|---|
| Restore the intended working branch | Done | Branch `reconciliation/holistic-gates` recreated from current `main` because the previously referenced branch ref and open PR were no longer present in GitHub. No old unmerged commit was available at the previously recorded SHA. Draft PR [#3](https://github.com/jafermenza1/MPA-Professsionals-Network/pull/3) is now open and must remain open until all current gaps are implemented and accepted. |
| P0 implementation | In progress | Record code commits and manual test results below as they are produced. |
| CI workflow | Intentionally absent | Do not create or re-enable until all current gaps are implemented. |
| Merge/deploy | Not authorized | Keep draft PR open; no deployment or merge as part of this work. |

## Implementation and manual validation log

Append one row per commit/validation. Distinguish code written from tests actually executed.

| Date | Commit | Change | Unit/API tests | Migration test | Browser/manual acceptance | Decision |
|---|---|---|---|---|---|---|
| 2026-10-14 | pending | P0-A through P0-D | NOT RUN | NOT RUN | NOT RUN | OPEN |

## Next roadmap (do not skip ahead)

1. **Finish P0-A/P0-B:** server-side professional-role and active-membership guards; organization-only profile boundary; service/mentor provider-creation guard; role/expired-membership regression tests.
2. **Finish P0-C:** verify application approval and verified payment are both required for activation; verify annual regular plan duration and admin-managed plan pricing/duration; test idempotency and unauthorized actor paths.
3. **Finish P0-D:** add explicit employer-sharing consent, field allow-list, named-organization share records, Support Desk share action, employer-scoped read API, revocation and audit; add a no-vacancy job-interest UI path for members and non-members.
4. **Run focused tests manually:** syntax/import checks, full unit suite, disposable PostgreSQL migration/rerun tests, API role/consent matrix, and browser journeys. Do not weaken or remove existing assertions to get a pass.
5. **Reconcile docs:** update `docs/31-workflow-reconciliation-matrix.md`, `docs/37-specific-product-gap-audit.md`, `docs/38-product-functional-requirements-addendum.md`, and `docs/30-holistic-reconciliation-roadmap.md` with actual implementation evidence.
6. **Continue remaining gap backlog:** P1 structured profile/reference data; P1 services/mentorship demand and outcomes; P1 truthful notifications and accessible guided forms; P2 reports/PDF/XLSX; P2 live homepage feeds; P3 release hardening, backup/restore and manual end-to-end acceptance.
7. **Only after every current gap is implemented and validated:** enable CI intentionally, run the complete suite on the final branch head, review the complete draft PR, and decide whether to merge/deploy.

## Safety and branch rules

- Keep this branch and its pull request open and in draft until the complete current gap inventory is implemented and accepted.
- Do not merge, deploy, baseline a production database, run destructive migrations, or change production database configuration as part of this increment.
- Never report tests as passed unless they were executed on the exact commit and the result was observed.
- Any discovered regression reopens the affected item and is recorded here.

## P0 implementation update — 2026-10-14

**State: CODE COMMITTED TO THE WORKING BRANCH; MANUAL ACCEPTANCE NOT YET RUN.** The working branch was recreated from the current `main` because GitHub no longer had the previously recorded branch ref or PR; the previously recorded SHA `433ea129f22036af00f07836a26c32c4ee548896` was not available. No old commit was force-pushed or overwritten.

Implementation now committed on `reconciliation/holistic-gates`:

- **Organization/professional boundary:** organization-only accounts receive no professional profile identifier/headline/bio/visibility through `GET /api/v1/me`; professional-profile reads/writes reject organization-only roles; the profile page points these accounts to the separate organization workspace.
- **Non-member profile editing:** personal and professional profile edits require a current active membership record with valid start/end dates. Professional directory visibility settings use the same guard, `GET /api/v1/me` exposes the current membership flag for UI decisions, and `/profile` shows a read-only membership prompt until activation.
- **Service/mentor publishing and service requests:** provider creation already required active membership; the shared membership predicate now checks date validity, mentor activation rechecks current membership, and public service/mentor discovery excludes providers whose membership dates have expired. Non-members may request public service listings; member-only/private listings remain restricted.
- **Payment/approval gate:** payment verification requires the linked application to be approved and in `payment_pending`; amount and currency must match the approved fee snapshot. Activation requires both `approved_at` and `paid` status plus a linked successful payment.
- **Job-seeker demand:** a new no-vacancy intake page is linked from `/jobs`; intake consent is distinct from employer-sharing consent. Sharing is off by default, field-scoped, named-employer only, versioned, revocable, and audit-recorded. A Support Desk page lists consented no-vacancy requests and shares selected fields only with verified organizations; employers can read only their own active shared summaries; applicants can recover requests using a private continuation token, inspect which organizations received a share and when, and revoke future sharing. Non-members may request public services, while member-only/private service listings remain restricted.
- **Schema/tests/docs:** migration `20261014120000_p0_job_seeker_consent_and_membership_guards.sql`; focused regression tests in `test/p0/business-invariants.test.js`; existing membership lifecycle test updated to prove pre-membership profile edits and pre-approval payment verification are rejected without removing prior assertions.

### Validation status (must not be mistaken for acceptance)

| Check | Result | Notes |
|---|---|---|
| Source changes committed | DONE | Review current branch diff before any deployment. |
| Existing unit suite | NOT RUN | No CI workflow by maintainer instruction; no local execution has been performed in this turn. |
| New P0 regression tests | NOT RUN | Tests are committed but not yet executed. |
| Migration on disposable PostgreSQL + rerun | NOT RUN | Do not apply to production; validate in a disposable database first. |
| Web production build / TypeScript | NOT RUN | Validate the new pages and API contracts manually. |
| Browser/API privacy matrix | NOT RUN | Must cover organization-only denial, inactive/expired membership, approval/payment ordering, consent grant/revoke, field restrictions and cross-organization access. |
| Deployment / merge | NOT AUTHORIZED | Keep the draft PR open until all current gaps are implemented and accepted. |

The next work is **not** broad UX polishing. First manually validate and correct P0-A through P0-D on one exact branch SHA. Then continue P1 structured profile/reference data, service/mentorship demand and outcomes, accessible guided forms and truthful feedback; then P2 reports/PDF/XLSX and live homepage feeds; then P3 release/restore/manual E2E acceptance. Do not enable CI until all current gaps are implemented, as requested.

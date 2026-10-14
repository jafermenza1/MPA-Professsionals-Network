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


## P1 — guided professional profile and reference portfolio (implementation in progress)

**Current implementation commit set:** migration, API/service layer, profile UI, admin reference-list UI and focused tests are committed on `reconciliation/holistic-gates`. **No P1 tests, migration, TypeScript check or build have been run yet.**

### Implemented in code (not yet validated)

- Added `20261014150000_p1_guided_professional_profile_and_portfolio.sql` and `20261014151000_p1_custom_reference_values.sql`:
  - repeatable structured education rows for education level, institution, field of study, qualification type and completion year;
  - multiple portfolio items with title, type, description, HTTPS URL, visibility and optional private file reference;
  - additional governed reference domains for nationality, language, institution and experience ranges;
  - custom-value storage for values selected as `OTHER`;
  - baseline options including Male/Female only for the Gender UI.
- Added `src/platform/reference-portfolio.js` and authenticated endpoints:
  - `GET /api/v1/professional-reference-data`
  - `GET /api/v1/admin/reference-portfolio`
  - `GET /api/v1/admin/reference-portfolio/{datasetKey}/items`
  - `POST/PATCH /api/v1/admin/reference-portfolio/{datasetKey}/items`
  - `POST /api/v1/admin/reference-portfolio/{datasetKey}/import`
  - `GET /api/v1/admin/reference-portfolio/{datasetKey}/export`
- Added guided UI at `/profile` for admin-managed nationality, occupation, industry, experience range, languages, repeatable education and multiple portfolio items.
- The admin Reference Portfolio screen supports adding/editing/deactivating selectable items and CSV import/export. CSV requires `code,label`; optional columns are `description,sort_order,active`. Imports validate required columns and duplicate codes, update matching codes, add new codes and do not delete omitted items.
- Private proof uploads use the existing one-time upload authorization, byte/type validation, upload and confirm flow. Supported types are PDF, JPEG, PNG and plain text up to 10 MiB. Mobile file input requests camera capture where supported. The user sees upload status, confirmation, private label and a private-evidence download action.
- Portfolio evidence is stored privately and is excluded from public profile projections. Public/member portfolio items and structured education are returned only according to the profile audience; evidence metadata and file identifiers are not included in that public projection.
- Added `test/p0/guided-profile.test.js` for structured education, `OTHER` validation, multiple portfolio items, HTTPS-only links and CSV import/export.

### P1 validation and acceptance still required

1. Apply both migrations to a disposable PostgreSQL database and rerun them to verify idempotency.
2. Run `npm run test:reference-portfolio`, the new guided-profile test, and the complete unit suite manually; retain all existing assertions.
3. Run the web TypeScript check and production build. Review any compile or route errors before declaring the UI usable.
4. Test the full file lifecycle with PDF, JPEG and PNG: authorize, upload, confirm, attach to portfolio, download as owner, deny another account, and confirm the file never appears in public API output.
5. Test CSV import with duplicate/invalid rows, quoted commas/newlines, inactive items, empty files, duplicate existing codes, and export round-trip.
6. Test all `OTHER` fields, legacy nationality mapping, multiple languages, role/member guard behavior, and responsive keyboard/mobile interaction.
7. Review reference-list change/versioning behavior before production. The initial admin editor updates items in the currently published version; the documented draft/approve/publish reference-version workflow is not fully implemented by this increment.
8. Only after the above, update the matrix with exact passing evidence. No deployment or merge is authorized by these commits.

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


## P1 — Service/mentorship marketplace, private demand, moderation and outcomes (2026-10-14)

**State: IMPLEMENTATION COMMITTED; MANUAL ACCEPTANCE NOT RUN.** No CI workflow was created or enabled. The draft PR remains open; do not merge or deploy.

### Code now present on the working branch

- Added migration `20261014160000_p1_marketplace_moderation_and_demand.sql` for service/mentor listing moderation metadata, private service/mentorship demand intake, generalized public demand topics, unique per-user interest joins, and demand event history.
- Added migration `20261014161000_p1_organization_service_listings.sql` to associate service listings with an organization while preserving the existing provider actor.
- Added `src/services-mentorship/demand.js` with:
  - private demand submission and requester/organization-scoped reads;
  - organization intake authorization for active owner/administrator roles;
  - public listing of only published, non-expired generalized topics;
  - unique per-user interest joins with editable levels: exploring, interested, ready to engage, and can provide;
  - Support Desk queue, review state/outcome recording, privacy-safe topic publication and aggregate interest summary;
  - service/mentorship listing moderation decisions and audit events.
- Wired API routes for public topics, authenticated private intake and interest joins, the user's demand and interests, staff review, listing moderation and aggregate topic summaries.
- Service and mentor discovery now requires moderation approval; editing a provider listing returns it to draft/pending review. Existing published/active listings are marked approved by migration to preserve pre-moderation behavior.
- Added verified organization-owned service listings. Authorized organization owners/managers can view/manage service requests and provider delivery/milestone workflows for their organization.
- Added `/service-demand` with search/filter, demand topic cards, unique-interest levels, private request form, optional organization selection, and separate personal activity panels.
- Added `/admin/marketplace` for the Support Desk to review private requests, publish a separately written privacy-safe topic, record outcomes, and approve/request corrections/reject service and mentorship listings.
- Added entry points from the public home journey and platform admin workspace.

### Commercial UI/UX decisions

- Separate private intake from public topic copy; never auto-publish a requester's original description.
- Make the state and next step visible; show loading, empty, retry, success and authorization/error messages instead of implying a request or match succeeded.
- Demand-topic interest is a unique per-user record; updating a level does not inflate the unique interest count.
- Moderation and publication are separate from provider self-management. Public discovery must not expose pending/correction/rejected listings.
- Organization submissions use the authenticated organization membership selector; provider requests and outcomes are scoped to authorized organization roles.

### Known gaps and validation requirements

1. **NOT RUN:** focused tests, full unit suite, migration apply/rerun, server/API checks, TypeScript and production web build.
2. **NOT RUN:** browser journeys for personal and organization demand, join/update/retry/duplicate interest, Support Desk publication, moderation decisions, cross-account denial and organization isolation.
3. Verify the existing organization role contract: organization service listing actions currently use owner/administrator/recruiter/project-manager; organization mentorship offers still need an organization-owned offer model rather than treating a personal mentor profile as the organization.
4. Add/review tests for SQL constraints and all route path shapes, permission-denied vs empty states, demand outcome transitions, expiry/closure, listing edit returning to review, and existing approved listing compatibility.
5. Service/mentorship notifications and a durable notification delivery/retry path are not implemented by this increment. Do not imply users are notified outside the visible response.
6. Ensure delivery review is participant-only, private internal notes remain staff-only, and public topic summaries contain no personal/organization confidential data.
7. Run a privacy/accessibility/mobile review before considering acceptance.

| Check | Result | Notes |
|---|---|---|
| Marketplace code committed | DONE | Commit set is on `reconciliation/holistic-gates`; review exact current head before testing. |
| New marketplace migrations | NOT RUN | Apply only to disposable PostgreSQL first, then rerun; no production migration. |
| Unit/API tests | NOT RUN | No workflow runs; retain existing assertions. |
| TypeScript / production build | NOT RUN | New pages and route contracts need compilation. |
| Browser / role isolation | NOT RUN | Personal, organization owner/manager, non-member requester, reviewer and unrelated-account cases remain. |
| Merge / deployment / CI | NOT AUTHORIZED | Keep draft PR #3 open; no CI workflow until all current gaps are implemented and accepted. |


## P2 implementation checkpoint — 2026-10-14 (not validated)

- Reports: committed a permission-filtered catalogue and /admin/reports UI; six initial reports; date/status/search filters; on-screen preview; PDF and XLSX generation; generation and export audit records.
- Member administration: committed /admin/members workflow; CSV template and preview/apply; approved-member confirmation; duplicate and identity-conflict detection; reuse of membership import staging tables; one-time account invitation tokens for newly created accounts; member-detail CSV/XLSX export.
- Migration: 20261014170000_p2_reporting_and_member_import.sql adds invitation storage and report/member-import permissions.
- Focused test: test/p2/report-exports.test.js; command npm run test:p2.
- Execution evidence: NOT RUN — no test command, migration, type check, build, browser journey or real PDF/XLSX client-open test has been executed. No CI workflow was added. Keep PR #3 draft/open.
- Known risks: report SQL column/enum assumptions; PDF/XLSX interoperability; invitation email outbox template delivery; import idempotency if legacy IDs or identities change between preview and apply; and proof that sensitive endpoints deny unauthorized roles.


## P2 live homepage feeds — 2026-10-14 (implementation only)

- Integrated five independently loaded public feeds into `web/app/page.tsx`: services, public jobs, consent-visible professional directory profiles, public mentor profiles, and published service/mentorship demand topics.
- Added `web/app/live-network-feeds.tsx` and `web/app/live-network-feeds.module.css` with human-centered copy, bounded cards, responsive layouts, light/dark theme tokens, loading skeletons, per-feed empty/error states, retry and reassuring recovery guidance, keyboard focus and reduced-motion handling.
- Added `e2e/homepage-live-feeds.spec.js` covering successful feed rendering, isolated failure/retry, and empty states.
- Updated `docs/31-workflow-reconciliation-matrix.md`, `docs/30-holistic-reconciliation-roadmap.md` and `docs/37-specific-product-gap-audit.md` to reflect actual code and remaining acceptance work.
- **Validation not run:** no TypeScript check, web build, Playwright run, mobile/keyboard/screen-reader audit, or production-data privacy check was executed. The added test is not evidence of a passing run. PR #3 remains draft/open; no CI workflow was added and no deploy/merge was performed.


## P1 actionable form feedback — code committed, not validated

- Added a shared feedback pattern for errors, successful saves, accessible announcements, retry buttons where safe, and relevant next-step links.
- Added human-readable labels for common workflow states in service, demand and moderation journeys.
- Added request references to friendly API error messages when the server supplies a request ID.
- Integrated shared feedback into services, mentorship, service demand, admin member import, reports, reference data, job-interest intake, invitation claim, guided profile and marketplace review.
- Added responsive, theme-token-based styling. **No TypeScript check, build, automated test or browser/accessibility test has been run.** The whole UI still needs a route-by-route feedback audit and state-specific references/next steps where available.


## Account & Security — code committed, not validated

- Added a common account settings page for members and non-members to change username and password after confirming their current password; both email and username can be used to sign in.
- Added administrator-triggered one-time sign-in email queueing, 20-minute expiry, one-time redemption, session revocation, required password setup, audit logging, and a migration storing only token hashes.
- Added Account & Security navigation and a per-user admin action requiring an audit reason.
- Email queueing is not proof of delivery. **No migration, TypeScript check, build, automated test, or browser test has run.**

## P0 identity, membership, payment and plan invariants — code committed, validation deferred

- Added src/platform/identity-policy.js as the shared capability policy for personal professional identity, current membership dates and organization-scoped roles. Profile, talent visibility, personal service publishing, personal mentor offers, organization service listings, organization mentorship offers and organization hiring now reuse the policy where applicable. Organization-owned services, hiring and mentorship remain available through authorized organization workspaces; organization verification/publication gates remain separate.
- Direct professional-profile reads and writes distinguish an organization-only identity from a personal professional identity. Profile education and portfolio operations continue to require current membership; personal mentor offer create/edit/status/availability writes now require current membership. Public service requests and organization mentorship requests are not globally blocked by the personal-membership policy.
- Membership applications serialize on the account row before checking for another open application. Payment idempotency now rejects reuse of a key for another user/application/amount/currency instead of returning an unrelated transaction. Payment verification accepts only pending payments; reversed/refunded transactions cannot be re-verified. Activation is safe to repeat, rechecks approved application + saved fee snapshot + unreversed successful linked payment, and uses the saved duration terms rather than mutable current plan fields.
- Added auditable refund/reversal records and a finance-authorized endpoint. Recording a refund/reversal marks the payment refunded, suspends any active membership linked to it, records the reason and audit event, and prevents later activation from that payment. This is an administrative accounting/reconciliation workflow; it does not issue a refund through a live payment provider.
- Added versioned, effective-dated membership plan terms using membership_fee_rule, public retrieval of the currently effective fee/plan version, administrator create/edit controls, fee breakdown, validity, renewal, grace period, benefits and eligibility fields. New applications snapshot the active fee-rule version and its terms; previously submitted applications retain their snapshot.
- Defined the validity policy explicitly: recurring plans configured for 365 days use a calendar-year anniversary inclusive of the final day (anniversary minus one day, including leap years); other finite durations use exact inclusive days; lifetime plans have no end date. Membership-protected reads and writes use inclusive start/end date checks.
- Improved membership-required feedback with a direct membership-options action and a preserved internal return path for services, mentorship and profile. Membership options show the fee version and explain annual validity; renewal is disabled when there is no current active membership.
- Added test/p0/membership-policy-invariants.test.js for identity separation, organization scope and date-boundary behavior. These assertions are committed for the final gate but have not been run.

### Remaining P0 acceptance work
- Review every direct API route and workspace navigation path for organization-only accounts, including negative tests and positive organization-owned service, hiring and mentorship workflows.
- Execute concurrent application/payment idempotency tests, duplicate activation tests, refund-before-activation and refund-after-activation tests, replacement-payment tests, payment-provider status reconciliation, and audit/history assertions.
- Validate migrations and rollback/forward behavior on a disposable PostgreSQL database; test plan effective-date boundaries, unchanged historical application snapshots, fee mismatches, lifetime terms, leap-day and year-end validity, and expiry authorization.
- Validate the membership plan admin experience with system-admin/member-management permissions and verify finance-only users cannot edit plans. Confirm that the refund record is not represented to users as a provider-side money movement.
- Validation remains deferred: no tests, TypeScript checks, build, migrations, browser journeys, accessibility review or CI were run for this increment. PR #3 remains draft/open; do not merge or deploy.

- Navigation follow-through: web/lib/identity-capabilities.ts is shared by the profile page and shell. Organization-only accounts no longer see the personal Profile navigation entry; accounts with an authorized organization workspace get an Organizations entry in desktop and mobile navigation. This is code-only and awaits the final browser/accessibility gate.

- Additional tenant-scope hardening: organization-owned service listings and requests are now listed only for active authorized organization members; a former listing creator cannot keep provider access after leaving the organization. Provider transitions and service feedback use the same organization-aware actor check. Paid renewals are not activated early in a way that suspends current access; the paid renewal must be activated on or after the existing membership end date. These paths require cross-organization and early-renewal tests in the final gate.

- Plan-version history remains honest about legacy data: the migration marks terms as complete only for the rule currently in effect, does not fabricate old benefits/validity for earlier fee versions, and new fee versions capture a complete immutable terms snapshot. Plan availability start/end dates are managed separately from fee-version effective dates.
- Renewal safety: an early-paid renewal is not activated before the current membership ends, avoiding premature suspension of existing access; the review queue shows the current membership end date. Invalid recurring-plan duration snapshots are rejected before application or activation.

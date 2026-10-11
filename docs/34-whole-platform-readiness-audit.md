# Whole-platform product, role and UX readiness audit

**Status:** Repository inspection; production acceptance is not yet proven.  
**Scope:** Business objectives, actor journeys, route inventory, role/scope enforcement, connected workflows, interaction integrity, responsive UX, privacy and release acceptance.  
**Design target:** An Instagram-like ease of use—visual clarity, strong hierarchy, responsive cards, recognizable actions, low-friction navigation and obvious progress—without copying social-media engagement mechanics or weakening professional governance.

## Executive finding

The product requirements define a coherent professional ecosystem, but the current web app must not be described as fully ready or fully connected. Several routes are convincing prototypes or static demonstrations rather than complete business transactions. A route existing is not proof that its controls persist data, that its API exists, or that a user has the correct role and scope.

A working release must pass every journey and role acceptance test in this document. Do not resolve gaps by hiding errors, making protected APIs public, fabricating activity, or presenting sample data as live data.

## Gate 6 checkpoint — 2026-10-11

Current status remains: Gate 6 is not production-ready. The repository has verified security and core-domain checks, but the release gate is still blocked by product-level proof requirements rather than a single code bug.

### Production deployment sign-off scope (explicitly limited)

This branch is approved only for the following in-scope release package and only when the release checklist below is explicitly satisfied:
- membership lifecycle and payment reconciliation for the supported manual-review flow;
- identity, session, current-role and resource-scope enforcement;
- role-aware organization verification and reviewer decision workflow;
- ATS interview and feedback workflow within the in-scope job pipeline;
- service request lifecycle and manual/manual-reconciliation payment evidence within the supported flow;
- existing unit and API regression coverage that remains green without weakening earlier assertions.

These modules are explicitly removed from the current production release scope and must not be presented as operationally available:
- events/calendar;
- projects and field project sync beyond the currently queued file evidence model;
- learning/Moodle enrollment and completion synchronization.

The current release scope explicitly excludes provider-backed payment and delivery evidence, as well as notification delivery proof. Those are not part of the current release and must not be treated as ready simply because the UI persists preferences.

### Mandatory release gates before sign-off
- A final branch SHA must execute in a real GitHub Actions run with a runner assigned; no workflow created without a runner counts as a pass.
- Production-like smoke validation against the real runtime and PostgreSQL remains outstanding and must be completed before deployment.
- Cross-role browser E2E and negative-path acceptance for G5 remain incomplete and therefore do not count as production evidence.
- Backup/restore, rollback rehearsal, and operational release-readiness checks are still open and must be completed before any production deployment decision.
- The audit requires explicit “no false readiness” acceptance for role/scope enforcement, privacy boundaries and deployment controls.

This is a scoped sign-off candidate, not a blanket production acceptance for all product modules or all user journeys.

## Business outcomes the UI must support

1. **Identity and trust:** account creation, sign-in/out, consent, profile visibility, verification cases and auditable decisions.
2. **Member value:** membership application, correction, review, payment, activation, renewal, and visible next actions.
3. **Professional opportunity:** profile/talent discovery, public and member-exclusive jobs, eligibility explanation, application lifecycle and hiring outcome.
4. **Development:** mentorship request/matching/sessions/feedback and learning discovery/enrollment/completion records.
5. **Organization value:** organization onboarding, verification, scoped staff access, job publication, talent requests, services/events/projects and collaboration.
6. **Community impact:** projects, volunteer participation, field evidence, inspection, donation/payment/receipt and public progress.
7. **Operations and governance:** assigned queues, scoped review/approval, notification delivery, audit, integration health and reporting.

## Actors and required workspace behavior

| Actor | Home priorities | Scope boundary |
|---|---|---|
| Public visitor | Clear value proposition, public directory/jobs/events/projects, register/login, public inquiry and public tracking | Public-safe published data only |
| Account user / applicant | Finish account/profile, continue drafts, application status, corrections, consent and notifications | Own records only |
| Member | Membership state/renewal, profile and verification, eligible jobs, mentorship, services, events, learning, projects | Own data plus explicitly eligible member resources |
| Mentor / mentee | Requests, availability/capacity, matches, goals, sessions and feedback | Assigned mentorship relationships only |
| Organization owner/admin | Organization verification, team membership, vacancies, inquiries, services/events/projects and outcomes | Explicitly linked organization and granted organization role |
| Recruiter | Own organization vacancies and candidate pipeline | Authorized organization and vacancy scope only |
| Field officer / project participant | Assigned projects, visit plans, evidence capture, sync queue and corrections | Assigned project/geography only |
| Reviewer / field supervisor | Assigned review queue, evidence, decision reasons, correction requests and conflicts | Assigned queue/resources only; cannot approve conflicted/self records |
| Finance officer | Payment exceptions, provider references, reconciliation, receipts and refunds | Finance scope; separation of duties for high-risk actions |
| Content/event manager | Draft/publish/reschedule, registration, attendance and change notifications | Assigned content/event scope |
| Learning administrator | Moodle enrollment/completion synchronization and failed integration events | Learning/integration scope |
| Project manager | Milestones, tasks, team, evidence, risks, budget and outcomes | Assigned project scope |
| System administrator | Account status, sessions, technical health and diagnostics | Technical privileges; not automatically business approval rights |
| Super administrator | Platform-wide governance/configuration and emergency actions | Global scope, least privilege, step-up controls and complete audit |

Role names are not sufficient by themselves. Authorization must combine **authenticated identity + active account + permission + resource scope + business eligibility**. Organization association must be explicit. Hiding a button is never a security control.

## Repository findings observed during inspection

### Critical
- The administrator bootstrap insert in `src/membership/service.js` used three bind values for a statement with two placeholders. Corrected on this branch; it still requires a successful bootstrap run and database verification.
- Login previously hard-redirected to `/track`, and in-memory auth was lost on full reload. The feature branch adds tab-scoped token retention and a dashboard route. This is a continuity fix, **not** the preferred production security design; use an HTTP-only server-managed session and verified identity/role endpoint for production.
- The initial dashboard is a common link hub, not a genuinely role-resolved dashboard. Do not claim role-specific readiness until the current-user/permissions contract is implemented and tested.
- The API client throws raw response text. User-facing forms should translate safe API error codes into actionable, non-sensitive messages while retaining a correlation/reference ID for support.
- Registration still needs the same safe return-path handling, visible success state and in-app navigation as login; do not let it bypass the dashboard/next-action model.

### High: UI controls that look actionable but are not yet real workflows
- `/organizations`: “Start registration” is a button without a connected action in the inspected page.
- `/services`: “Browse services” is a placeholder button; the inspected page describes a lifecycle but does not implement discovery/request.
- `/profile`: asks users to paste a bearer token into the UI. This is a developer affordance, not a production account/profile experience and should be removed from normal user UI.
- `/field`: camera/PDF controls only increment a queue counter; they do not capture, validate, securely store or upload evidence. It must not claim evidence is queued or synced until it actually is.
- `/mentorship`: cards use hard-coded sample mentor names, scores, availability and matching details. This must be labelled as demo data or replaced with API-backed mentors and truthful availability.
- `/jobs`: inspected cards contain hard-coded vacancies; filtering, bookmarking and alerts are not fully connected. Mark demos clearly or load real published opportunities.
- The home shell reports “Synced” from a static UI state, not confirmed synchronization. Show truthful connection/sync state.
- Public pages may link to flows, but every CTA must lead to a real page or be disabled with a clear reason—not a dead button.
- `/admin` contains powerful operations and must show clear loading/empty/error/unauthorized states. Server-side role/scope enforcement remains mandatory on every endpoint.

### Important
- Public `/track` should remain reachable without login. For authenticated users it may show only their own applications; public opportunity inquiry detail must require its secure continuation token and never expose another user's application or reviewer notes.
- Registration and login links must preserve safe same-origin `next` paths. Reject protocol-relative URLs, external URLs and loops back to login/logout.
- Logout must clear all client session material, invalidate/revoke the server session where supported, and navigate to login. Do not imply server revocation if only client state was cleared.
- Mobile navigation, keyboard focus, readable contrast, loading skeletons, empty states, error recovery and form validation need consistent treatment.
- No private evidence, contact details, reviewer notes, payment references or candidate details should leak into public profiles, search, URLs or analytics.
- Demo cases, fake metrics and seed data must be visually distinguished from live data in every environment.

## Intended end-to-end order

### New professional
Public home → create account → confirm account/security steps → complete essential profile → choose membership plan → draft application → complete evidence → submit → reviewer queue → correction loop if needed → decision → payment when due → verified payment reconciliation → active membership → welcome/notification → member home with next useful actions.

Users must be able to leave a draft and resume it. Do not ask for all profile data before explaining why it is needed. Do not mark membership active based solely on a client redirect or payment initiation.

### Existing member
Login → fetch authoritative current user, active roles and memberships → role-aware home → renewal/profile/verification/opportunity/mentorship/service/event/learning/project actions → visible state transitions and notifications → logout.

### Organization
Register account → create organization record → submit evidence → review/correction/verification → explicitly assign organization owner/admin → invite and scope staff → publish vacancies/services/events/projects → receive inquiries/applications → process pipeline → record outcomes and audit history.

An organization name in a person's profile does not grant organization privileges.

### Public job seeker
Public jobs → select published public vacancy → public inquiry or formal application as defined by the vacancy → consent and contact verification → secure continuation → explain eligibility and required details → formal application → status and next action. Exclusive vacancies must disclose the membership/verification eligibility requirements without leaking confidential evaluation rules.

### Mentor and mentee
Discover API-backed eligible mentors → state goal and preferences → request → eligibility/review/matching → both parties accept → set goals/sessions → progress and feedback → close with outcomes. Availability and match scores must be sourced or explicitly labelled illustrative.

### Operational review
Assigned queue → open scoped record → see evidence and checklist → conflict-of-interest check → approve/reject/request correction with reason → immutable decision history → notify applicant → expose only the permitted decision/status to the applicant.

### Field/project evidence
Assigned project → visit/task → capture actual photo/document/notes and metadata with consent → encrypted local draft when offline → upload with idempotency key → server confirms receipt → review/correction/approval → approved evidence appears in the allowed project record. A local click counter is not a sync queue.

### Finance and donations
Initiate transaction → provider handoff → verified server-side callback/status inquiry → reconcile provider reference and amount → issue receipt → update membership/donation/project totals → notify user. Browser redirects alone never confirm payment.

## Instagram-like usability system

- One primary action per page; secondary actions are visually quieter.
- Feed/card patterns for opportunities, people, projects and updates, with consistent spacing, image/avatar treatment, status chips and concise metadata.
- Mobile-first responsive layout with persistent bottom navigation on mobile and clear desktop navigation.
- Role-aware home shows “Continue where you left off”, actionable tasks, application status, recommendations and relevant opportunities—not a wall of admin links.
- Clear status language: Draft, Action needed, Submitted, Under review, Approved, Payment due, Active, Paused, Rejected/Closed as appropriate.
- Forms use progressive disclosure, inline validation, save/resume, clear consent, and confirmation with reference number.
- Skeleton/loading, useful empty states, retry, offline/unsaved warnings and success confirmation on all data-backed screens.
- Accessibility: keyboard and screen-reader labels, visible focus, sufficient contrast, reduced-motion support, touch targets and no color-only status.
- Localize dates/time/currency and prepare Amharic, Afaan Oromoo and Somali without hard-coded English UI strings throughout business flows.
- Never copy addictive social mechanics or expose private data to make the interface feel social. Trust and professional purpose take precedence.

## Release gate: no false readiness

A route is not “ready” until these all pass:
1. Every CTA is connected or explicitly disabled with explanation.
2. Real data is loaded from the correct API; demo data is labelled.
3. Loading, success, empty, validation, unauthorized, forbidden, server error and retry states are tested.
4. A role can only access its own/assigned organization, project, geography and records.
5. Direct URL access and API calls are tested independently of UI visibility.
6. Every state-changing action is persisted, audited, and gives a truthful confirmation.
7. Cross-route navigation preserves the correct session and safe return path.
8. Logout clears local auth and invalidates the server session where implemented.
9. Desktop, mobile, keyboard and accessibility checks pass.
10. Production build, automated tests and staging smoke tests pass.

## Prioritized remediation sequence

**P0 — Identity and safety:** fix bootstrap parameter bug; establish secure session/current-user/role contract; implement login/register/logout lifecycle; preserve public tracker without exposing private data; enforce API role/scope checks; remove bearer-token paste UI.

**P1 — Real core journeys:** membership apply/review/correction/payment/renewal; profile/verification; public and exclusive job pipeline; organization verification and scoped staff; actionable dashboards with real assigned tasks and application states.

**P2 — Complete business modules:** real API-backed mentorship, services, events, learning/Moodle, projects/donations, field capture/sync, notifications and operational reports.

**P3 — Finish quality:** polished responsive design system, localization, accessibility, error observability, analytics based on real events, performance and full end-to-end regression.

Do not mark P0 complete from a code change alone. Attach build/test evidence and verify against the deployed API before release.

### Missing route coverage confirmed in the inspected `web/app` route inventory
The inspected app route list does not contain dedicated `/events`, `/projects`, or `/learning` pages, although these are product requirements. These are route/module gaps, not just visual polish. They need real discovery/detail pages and scoped workflows, or must be explicitly moved out of the release scope in an approved product decision. Do not imply these capabilities are available through links to nonexistent pages.

The route inventory also shows only a small subset of the roles defined in the product contract has a dedicated operational workspace. A dashboard must be driven by an authoritative server response describing the user's current account status, roles, permissions and scope—not by trusting a client-side role string or guessing from the URL.

## Subsequent remediation recorded on the audit branch

- Added authenticated `GET /api/v1/me`, which first validates the session, then reads active account status and current roles from the database. The dashboard uses this endpoint rather than trusting role names from a client-side field.
- The dashboard now displays server-confirmed roles and only shows the admin entry for accounts with the system/super-admin role. Specialized reviewer, finance, event, learning and project workspaces remain incomplete and are intentionally called out rather than represented as finished.
- Registration now supports a safe same-origin `next` destination, checks for a session token, uses in-app navigation, and provides success/error feedback and a home link.
- Logout now attempts the API's session-revocation endpoint before clearing local session state and returning to login. If the API is unavailable, local credentials are still cleared; server revocation cannot be claimed in that failure case.
- The bootstrap bind-parameter fix is included in the branch. Database verification and deployed runtime verification remain required.

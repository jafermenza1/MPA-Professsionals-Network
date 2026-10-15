# In-App Notification Action Center

**Status:** Foundation committed on `reconciliation/holistic-gates`; acceptance is pending. Do not infer migration, API, UI, authorization, accessibility, or browser-test success from the presence of code. Keep PR #3 draft/open; do not merge or deploy.

## Product decision

The MPA notification system is an **action center, not merely a feed of messages**. Its main purpose is to help every member complete the next step in their professional journey, while giving administrators a reliable view of workflow items requiring intervention.

Build on the existing `notification_event`, `notification_preference`, and `notification_outbox` foundation. Do not create a disconnected second event ledger or treat queued email as proof of delivery. Keep the current email operations center and provider boundary intact.

## Notification experience

The shared application shell exposes a notification bell with an unread badge. The authenticated `/notifications` action center provides:
- persistent notification items with category, title, concise body, priority, created/read state, and optional internal next-action link;
- summary counts for unread notifications, action-required notifications, and unread action-required notifications;
- category, unread-only, and action-required filters;
- mark one read, mark all read, archive, refresh, empty, loading, error, and retry states;
- safe internal links only; notification records and actions are scoped to the authenticated user;
- responsive layouts and accessible labels/status announcements.

Action-required is a workflow signal, not a decorative badge. Reading or archiving a notification does not complete the underlying business task. A task is complete only when its authoritative workflow transition is completed and persisted.

## Seven notification categories

1. **Membership and professional verification** — application received/reviewed, evidence correction requested, verification decisions, renewal and expiry.
2. **Jobs and recruitment** — relevant opportunity, application receipt, shortlist/interview/decision, scheduling changes and feedback.
3. **Organization registration and verification** — registration received, missing evidence, review decisions, listing status and authorized inquiries.
4. **Mentorship** — matches, requests, responses, session scheduling/rescheduling/cancellation and completion.
5. **Professional services and networking** — service requests, provider responses, clarification, follow-up and organization inquiry decisions.
6. **Events, learning and community** — registration, reminders, schedule/venue changes, learning and community announcements. Moodle, calendar and SMS integrations remain future provider-boundary work until configured and verified.
7. **Account security and system notices** — security events, session/account changes, required policy updates and service interruptions.

Supported storage categories are `membership`, `verification`, `opportunities`, `recruitment`, `organizations`, `mentorship`, `services`, `events_learning`, `security`, and `system`. This category vocabulary is extensible only through a reviewed migration and contract update.

## Role-aware delivery and privacy

Recipients must be resolved from the authoritative workflow and current database permissions:
- **Professional/member:** membership, verification, applications, mentorship, services and relevant events.
- **Organization representative:** organization review, evidence corrections, inquiries and services for organizations they are currently authorized to represent.
- **Employer/recruiter:** applications, interview feedback and candidate decisions for their authorized organization/jobs.
- **Mentor:** requests, match updates, responses and sessions involving that mentor.
- **Reviewer:** assigned review tasks, decisions and deadlines within reviewer scope.
- **Administrator:** authorized operational alerts and intervention queues.

Do not disclose private applicant details, evidence, payment information, reviewer notes, contact information or another organization's records in notification text or links. Client-side navigation visibility is not authorization. Each destination must re-check authorization on the server. Use neutral notification copy for sensitive events and include only the minimum context needed to decide what to do next.

## Interaction and delivery rules

- Use stable event codes and persisted records; avoid duplicates with an explicit idempotency/dedupe key where a workflow can safely define one.
- Deep links must be relative same-origin paths; reject protocol-relative, external, or control-character URLs.
- Unread counts and item state are persisted in PostgreSQL and survive reload.
- Read/archive actions are idempotent and audited. Neither action changes the underlying workflow status.
- Retry transient channel failures through the existing outbox; keep delivery state, provider result, failure reason and retry history separate from the in-app read state.
- Respect notification preferences for optional categories/channels. Security-critical notices cannot be silently suppressed by ordinary preference toggles.
- Offer daily/weekly digests only as an optional later capability; do not send a digest until its scheduler, consent/preferences, idempotency and delivery evidence exist.
- A provider accepting an email means accepted for delivery, not proof that it reached the recipient's inbox.
- Do not claim real-time updates, SMS, push, calendar or Moodle delivery until configured and tested. Polling may refresh the unread badge; real-time transport is a separate architectural decision.

## Technical foundation in this increment

- Additive migration `20261015200000_in_app_action_center.sql` extends the existing notification ledger with category, title/body, priority, action-required, safe internal action URL, read/archive timestamps and optional dedupe key. It adds indexes and category/digest preference fields without deleting notification history.
- `src/platform/notifications.js` provides authenticated-user inbox listing, summary counts, read-all, per-item read, archive, and audit events.
- `server.js` exposes `GET /api/v1/notifications`, `POST /api/v1/notifications/read-all`, `PATCH /api/v1/notifications/{id}/read`, and `PATCH /api/v1/notifications/{id}/archive`. Existing `/api/v1/notifications/preferences` remains in place.
- `src/membership/service.js` enriches membership workflow notifications with category, human-readable title/body, priority, optional action-required status and safe internal next-action link; preference API accepts category settings.
- `web/app/notifications/page.tsx` supplies the inbox/action-center experience. `web/components/shell.tsx` exposes the unread badge.
- Existing email delivery/outbox remains separate and is not represented as confirmed delivery by the in-app UI.

## Required follow-up and acceptance evidence

This is foundation work, not a claim that every event in all seven categories is already wired. Continue gate-by-gate without weakening existing assertions:
1. Verify schema compatibility and migration fresh-install/upgrade/rerun behavior on disposable PostgreSQL; do not apply this migration to production as part of this PR.
2. Add/execute focused API and service tests for own-user scope, cross-user read/archive denial, malformed IDs, filter validation, read/archive idempotency, unread count persistence, category preferences, safe URLs, dedupe behavior, and audit rows.
3. Wire each real workflow transition to a correct category, recipient, priority, action-required flag and authorized next-step URL. Never manufacture a notification for a transition that did not persist.
4. Add role-separated tests for professional, organization representative, recruiter, mentor, reviewer and administrator; prove private/cross-organization data is not leaked.
5. Validate the shell badge, inbox filters, mobile/responsive behavior, keyboard/screen-reader announcements, reduced motion, loading/empty/error/retry states and reload persistence in browser tests.
6. Ensure the administrator intervention view reflects authoritative pending workflow tasks and due dates, not just unread messages. Existing admin review queues remain the source of truth until a connected aggregate is implemented and tested.
7. Update `docs/07-api-contract.md`, `docs/31-workflow-reconciliation-matrix.md`, and this document with exact passing command output, tested database baseline, and commit SHA only after tests actually run.

## Acceptance status

**NOT VALIDATED.** No test suite, typecheck, web build, migration run, browser/accessibility check or cross-role privacy matrix is claimed as passed for this increment. Keep PR #3 draft and open; no merge or deployment is authorized.

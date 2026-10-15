# Workflow Notification Routing — Foundation and First-Increment Corrections

**Status: code committed; validation not run.** This increment extends the existing in-app action center. It does not replace any domain workflow, reviewer queue, or email provider/outbox. Notification creation is performed through the shared `createInAppNotification` policy on the same database transaction connection as the authoritative state change, so a notification is not emitted for a transition that rolls back.

**First-increment correction record:** active-account filters were added to membership, verification, organization, service/mentorship moderation, support, and finance reviewer routing. Repeated membership, verification, organization-submission, service-listing, and mentor-offer transitions now include persisted event versions where available. Organization draft creation no longer alerts reviewers; the existing organization verification queue is alerted when the case is actually submitted. See [First Increment — Workflow and Notification Routing Corrections](46-first-increment-workflow-routing-corrections.md). These changes are code-only evidence; tests and acceptance remain pending.

## Binding decisions

- The authoritative workflow record, audit log and existing review queue remain the source of truth. Notifications are projections that point users to the next step; reading or archiving one does not complete the business task.
- Use `src/platform/notifications.js` as the shared category, preference, safe-link, presentation-metadata and deduplication policy. Workflow producers must use the helper or `queueWorkflowEmail`; direct legacy inserts are not acceptable for newly wired transitions.
- Dedupe keys include event/resource identity and the relevant persisted transition/version. Repeated requests for the same transition should not create duplicates; a distinct status, decision, or review cycle should remain notifiable.
- Resolve recipients from the persisted workflow and current database roles/organization memberships, not client-supplied recipients. Organization-scoped messages go only to the relevant active owner/administrator/team. Reviewers are linked to existing authorized queues.
- Notification copy must not contain private verification evidence, reviewer-only notes, sensitive account data, or another organization's records. Every destination continues to enforce server authorization.
- Security notifications are category `security`, high/urgent where appropriate, and critical account-security events bypass ordinary in-app/category preference toggles. Security alerts remain visible in the inbox/count projection even when optional categories are disabled.
- Email outbox delivery is separate from in-app state. Queue acceptance is not proof of email delivery.
- **Events/learning notifications are not wired in this increment** because those modules are not deployed. The category remains available for future implementation, but no event, calendar, Moodle, SMS or push delivery is claimed.

## Wired persisted transitions and recipients

| Workflow transition | Recipient | Category and next action |
|---|---|---|
| Membership application submitted | Applicant; authorized membership reviewers | `membership`; applicant tracks application, reviewers use the existing membership review queue |
| Membership review/correction | Applicant; authorized reviewers after a correction response | `membership`; follow reviewer decision or review the member's response |
| Membership payment submitted/verified/reversed | Applicant; finance reviewers for pending payments | `membership`; wait for verification, provide corrections, check activation, or resolve reversal |
| Membership activated | Applicant | `membership`; open membership card and continue member journey |
| Verification case opened/assigned/submitted/status changed | Subject member, assigned reviewer, authorized verification reviewers for submitted cases | `verification`; checklist/evidence/member response or existing review queue |
| Verification decision, member response, appeal submission/decision | Subject member, assigned reviewer or independent appeal reviewers as appropriate | `verification`; respond before deadline, review member response, or review appeal in existing queue |
| Organization registered/submitted/decided | Organization creator and active owner/administrator representatives; authorized organization reviewers | `organizations`; provide evidence/corrections or open the existing organization verification queue |
| Organization workspace access added/changed | Affected account holder | `organizations`; review workspace role/access |
| Formal job application submitted | Candidate and active authorized employer team | `recruitment`; monitor application or review candidate pipeline |
| Candidate status/offer approval/acceptance/withdrawal | Candidate; designated job approvers; authorized employer team | `recruitment`; respond to offer, review approval, or update candidate pipeline |
| Interview scheduled/responded | Candidate and interview participants | `recruitment`; review time, timezone, instructions, and confirmation or coordination needs |
| Mentorship request, offer moderation, match proposal/response, relationship status, session schedule/status | Mentee, proposed mentor, affected participant, authorized support/moderation reviewers | `mentorship`; review matching queue, accept/decline, coordinate sessions, or review goals/feedback |
| Service listing submitted for moderation | Listing owner and authorized marketplace moderators | `services`; monitor moderation or review the existing marketplace queue |
| Service request/status/delivery/completion | Requester and provider; authorized organization provider team where applicable | `services`; respond, review delivery, request revision, accept completion, or resolve dispute |
| Service payment submitted/verified | Payer, authorized provider team, authorized finance reviewers | `services`; track finance verification and resolve any correction/rejection |
| Credentials updated, administrator password reset, sessions revoked, account access changed, recovery link issued/redeemed | Affected account holder | `security`; verify the action, finish credential setup, or contact MPA Support if unexpected |

## Implementation inventory

- Additive schema/backfill: `db/migrations/20261015200000_in_app_action_center.sql`, `db/migrations/20261015210000_notification_category_legacy_backfill.sql`
- Shared policy: `src/platform/notifications.js`
- Email/in-app integration: `src/platform/email-operations.js`
- Membership and account workflow: `src/membership/service.js`
- Verification workflow: `src/verification/service.js`
- Organization and recruitment workflows: `src/organization-jobs/service.js`
- Service and mentorship workflows: `src/services-mentorship/service.js`
- Account security and administrator actions: `src/platform/account-security.js`, `src/platform/user-admin.js`
- Focused routing/preference contract tests: `test/platform/workflow-notification-routing.test.js`

## Acceptance still required

Do not treat this document or committed tests as a passing result. On the current head, run the focused unit suite, all relevant existing API and E2E suites, migration fresh-install/upgrade/rerun on disposable PostgreSQL, production web build/type checks, and role-separated privacy checks. Verify each real workflow transition and recipient in persisted PostgreSQL; test retry/dedupe across a correction/resubmission cycle; prove security alerts survive disabled category preferences; and inspect the mobile/responsive, keyboard and screen-reader experience. Confirm that unauthorized users cannot read notification data or use the destination APIs. Do not merge or deploy until the repository's normal acceptance gate is met.

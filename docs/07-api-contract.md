# API and Integration Contract

## 1. Purpose

This document defines API principles and resource contracts. Framework syntax may vary, but business semantics must remain stable.

## 2. API conventions

Base path: /api/v1

Every protected endpoint validates authentication, authorization, resource scope and business eligibility.

## 3. Resource groups

Authentication:
POST /auth/register
POST /auth/login
POST /auth/logout
POST /auth/verify
POST /auth/password/reset

Membership:
GET /memberships/me
POST /memberships/applications
GET /memberships/applications/{id}
POST /memberships/applications/{id}/submit
POST /memberships/{id}/renew

Profiles:
GET /profiles/me
PATCH /profiles/me
GET /professionals
GET /professionals/{id}

Verification:
POST /verification/cases
GET /verification/cases/{id}
POST /verification/cases/{id}/submit
POST /verification/cases/{id}/decision

Organizations:
POST /organizations
GET /organizations/{id}
POST /organizations/{id}/members
POST /organizations/{id}/verification

Jobs:
POST /jobs
GET /jobs
GET /jobs/{id}
POST /jobs/{id}/publish
POST /jobs/{id}/applications
GET /jobs/{id}/applications

Services:
POST /services
GET /services
POST /services/{id}/requests

Mentorship:
POST /mentorship/requests
GET /mentorship/requests/{id}
POST /mentorship/requests/{id}/accept
POST /mentorship/{id}/sessions

Events:
POST /events
GET /events
POST /events/{id}/register
POST /events/{id}/reschedule
GET /events/{id}/calendar.ics

Learning:
GET /courses
GET /learning/me
GET /certifications/me

Projects:
POST /projects
GET /projects
GET /projects/{id}
POST /projects/{id}/participants
POST /projects/{id}/visits
POST /projects/{id}/evidence

Donations:
POST /donations
GET /donations/{id}

Payments:
POST /payments
GET /payments/{id}
POST /payments/webhooks/{provider}

Notifications:
GET /notifications
PATCH /notifications/{id}/read
GET /notification-preferences

## 4. State-changing APIs

Prefer explicit commands such as POST /memberships/{id}/approve rather than allowing arbitrary PATCH of status. This makes authorization and auditing clear.

## 5. Errors

Use stable business error codes and field-level validation.

Example conceptual response:

{
  "error": {
    "code": "MEMBERSHIP_NOT_ELIGIBLE",
    "message": "The membership cannot be renewed in its current state.",
    "details": {"status": "SUSPENDED"},
    "requestId": "..."
  }
}

Never expose stack traces.

## 6. Pagination/filtering

List endpoints must support stable pagination. Filtering and sorting use documented, whitelisted fields.

## 7. Idempotency

Payment creation and other consequential commands accept Idempotency-Key. Repeating the same key must not create a second financial operation.

## 8. File upload contract

Recommended flow:
1. request upload authorization;
2. receive signed upload target;
3. upload object;
4. confirm upload;
5. server validates metadata/checksum;
6. file becomes available.

Never trust client MIME type alone.

### Private upload API contract (Gate 4 implementation)\n\n- `POST /api/v1/files/uploads` — authenticated upload authorization. Body: `fileName`, `contentType`, `byteSize`, optional `checksumSha256`. Returns a one-use token and relative upload URL; token expires after 10 minutes.\n- `PUT /api/v1/files/uploads/{id}/content` — authenticated binary upload using `application/octet-stream` and `X-Upload-Token`. Maximum 10 MiB; only PDF, PNG, JPEG and plain text are accepted. Server validates size, optional SHA-256 and file signature for PDF/images.\n- `POST /api/v1/files/uploads/{id}/confirm` — authenticated confirmation. Creates a private `file_object` only after upload metadata/checksum validation; operation is idempotent for a confirmed upload.\n- `GET /api/v1/files/{fileObjectId}` — authenticated private download; owner, authorized organization owner/administrator for linked verification evidence, or a verification reviewer for linked evidence only. Response is `private, no-store` with `nosniff`.\n- Storage root is `PRIVATE_FILE_STORAGE_ROOT` (defaults to `.private-files` for development). It must be a private persistent directory outside any web-served directory in deployed environments. No public URL is stored or returned.\n\n## 9. Payment contract

The domain uses a provider-neutral Payment record.

The adapter maps amount, currency, customer, purpose, callback and provider reference.

Webhook processing must authenticate the provider where supported, validate the event, find the payment, safely ignore duplicates, update state and publish a domain event.

## 10. Moodle contract

MPA is identity/business layer. Moodle is learning execution layer.

Support SSO, course discovery/catalog synchronization where needed, enrollment, completion, certificate records and synchronization errors. Store external IDs.

## 11. Calendar contract

ICS generation is the baseline. Provider-specific integrations may be added.

Rescheduling must preserve event identity and update synchronized calendars where authorized.

## 12. Messaging contract

Templates are versioned/configurable.

Delivery records include message ID, channel, recipient reference, template, provider, status, provider message ID, timestamps and failure reason.

## 13. Versioning

Breaking API changes require a documented version strategy. Existing clients must not be silently broken.


## Gate 4 connected workflow endpoints

These are the concrete current server routes used by the reconciled screens; they supplement the conceptual resource groups above and do not silently replace them.

- Account profile: `GET /api/v1/me`, `PATCH /api/v1/me/profile`.
- Notification preferences: `GET /api/v1/notifications/preferences`, `PATCH /api/v1/notifications/preferences`; updates are scoped to the authenticated user.
- Formal job application: `POST /api/v1/jobs/{id}/application-drafts`, `POST /api/v1/job-applications/{id}/submit`, `GET /api/v1/me/job-applications`. Public inquiry intake and continuation links are separate and must not be reported as formal application submission.
- Service request lifecycle: `GET /api/v1/me/service-requests`, `POST /api/v1/services/{id}/requests`, `POST /api/v1/service-requests/{id}/status`, and `POST /api/v1/service-requests/{id}/accept-completion`. The service layer authorizes each transition by participant role and current state.
- Mentorship request history: `GET /api/v1/me/mentorship-requests` returns only the authenticated mentee's requests; `POST /api/v1/mentorship/requests` creates a request only with a non-empty goal.
- Organization evidence upload uses the private upload authorization, content upload, confirmation, then evidence attachment endpoints defined in the private upload section above.

Gate acceptance still requires automated tests for positive paths, authorization denials, invalid state, duplicate/retry and persisted state. An endpoint being documented is not itself evidence that the workflow passed.


## Gate 4 current route extensions

- `GET /api/v1/me/mentor-profile` — returns the authenticated user's mentor profile and published availability, or `null` when not configured.
- `POST /api/v1/me/mentor-profile` — create a mentor profile subject to active-membership and verified-professional-claim requirements.
- `PATCH /api/v1/mentor-profiles/{id}`, `POST /api/v1/mentor-profiles/{id}/status`, `PUT /api/v1/mentor-profiles/{id}/availability` — manage only the profile owned by the authenticated mentor.
- `GET /api/v1/me/mentorship-matches` — pending proposed matches for the authenticated mentor only.
- `GET /api/v1/me/mentorships` — mentorship engagements where the authenticated account is mentor or mentee.
- `GET /api/v1/mentorship/{id}/sessions` — session history after participant authorization. Existing goals, session status, mentorship status and feedback routes remain participant-scoped.
- `GET /api/v1/me/mentorship-requests` — only the authenticated mentee's request history.

These additions are not a relaxation of authorization. Mentor profile eligibility, resource participation, availability and state transitions remain enforced by the service layer.


## Gate 4 workflow UI endpoints

- `GET /api/v1/membership/applications/me` — authenticated member's own membership applications, latest correction and latest payment projection. Ownership is enforced in the query; do not use this projection for another applicant.
- `GET /api/v1/verification/programs` — active verification program catalogue; contains policy metadata, not evidence.
- `GET /api/v1/me/verification/cases` — authenticated member's own verification case summaries. Reviewer-only fields and confidential evidence metadata are excluded from the member case detail projection.
- `GET /api/v1/review/organizations` — authorized reviewer/system-admin organization verification queue with evidence metadata and private file-object references. Reading each file still requires the authenticated private-file endpoint and server-side scope authorization.
- `GET /api/v1/review/verification/appeals` — independent appeal-review queue for `appeal_reviewer`/`system_admin`, excluding the subject and original decision maker; appeal decisions remain on `POST /api/v1/verification/appeals/{id}/decision`.
- `GET /api/v1/jobs/{id}/applications` — candidate pipeline for a job; `src/organization-jobs/service.js` must enforce organization/job-team scope before returning candidate details.
- `GET /api/v1/review/membership/applications` includes submitted/in-review/correction-required applications plus payment-pending/paid items and their latest payment projection for the reviewer/finance workspace. Payment confirmation and membership activation remain separate commands.

These endpoints support the added `/membership`, `/verification`, and `/recruitment` screens. They do not replace the existing workflow command contracts or permit client-side role checks to substitute for server authorization.


## Account and recovery endpoints

- `PATCH /api/v1/me/account` updates the signed-in user's username and/or password after current-password confirmation. A one-time recovery session must set a new password.
- `POST /api/v1/admin/users/:id/one-time-session-link` queues a single-use sign-in link email for an active account, requiring user-management permission and an audit reason.
- `POST /api/v1/auth/one-time-session/redeem` exchanges a valid, unused 20-minute link for a restricted session. Redemption revokes previous sessions; the user must set a new password.
- Email delivery remains dependent on an operational notification-outbox sender; an accepted queue insert is not proof the email was delivered.


Sign-in accepts either the account's email address or username. Username changes must not collide with another account's username or email address.


## Membership card and profile photograph contract (Gate 5 implementation; acceptance pending)

- `PATCH /api/v1/me/profile-picture` — authenticated active professional member attaches a confirmed private JPEG/PNG `fileObjectId` created by their own account. The server validates ownership, MIME type and private storage before associating it with the existing `professional_profile` row.
- `DELETE /api/v1/me/profile-picture` — authenticated active professional member removes the profile picture reference. Existing uploaded private files are not silently deleted; retention remains governed by the file lifecycle.
- `GET /api/v1/membership/card` — authenticated member receives their latest membership record, membership product name/type, canonical membership ID, validity/status, profile-picture file ID, card branding settings and verification URL path.
- `GET /api/v1/admin/membership-card?membershipNumber=...` — restricted to current membership-view/manage roles or permissions; looks up an existing membership record without changing its identifier. Newly activated members receive `MPA-YYYY-XXXXXXXX`; pre-existing imported membership IDs remain intact and are not silently renumbered. The ID is not editable through card branding settings.
- `GET/PATCH /api/v1/admin/membership-card-settings` — authorized membership administrators read/update card heading, title, footer, background style/colors, accent/text colors and membership-type visibility. Input is validated server-side and changes are audited.
- `GET /api/v1/public/membership-verification?record={recordId}&token={opaqueToken}` — rate-limited public verification; returns minimal member name, membership ID/type, dates, current status and verification time. It must not return contact details, birth date, address, email, private evidence or account identifiers.
- `POST /api/v1/admin/membership-records/{recordId}/rotate-verification` — privileged administrators invalidate a previously printed QR token without changing the membership ID.
- The card is designed for landscape ATM-card dimensions (85.6 × 53.98 mm). Photograph/placeholder occupies one side and the QR code occupies the opposite side. Printing/saving as PDF uses the browser print dialog; online verification remains authoritative for status.
- The tracking-reference utility and its `MPA-MEM-YY-NNNNNN` format remain separate and unchanged. Membership activation continues to generate canonical member IDs as `MPA-YYYY-XXXXXXXX`; existing imported IDs are preserved until a separately approved migration policy is defined.
- **Acceptance pending:** run the migration and focused tests against a disposable PostgreSQL database, verify photo ownership and role-negative cases, scan generated QR codes, exercise token rotation and every status, confirm print/PDF dimensions, and run the web production build. No acceptance is claimed until those checks are recorded at the exact head.


## 13. Public support assistant and knowledge base

- POST /api/v1/public/support-bot/message accepts a visitor question, opaque browser-session key, current page path, optional contact details, preferred contact method and explicit contact consent. The response identifies whether the answer came from a published knowledge entry, returns the conversation reference, and explains whether human follow-up is needed.
- GET /api/v1/admin/support/knowledge lists categorized entries for authorized support staff; POST /api/v1/admin/support/knowledge/categories and POST /api/v1/admin/support/knowledge/articles create/update categories and answers. Draft articles are not eligible for bot responses; only published entries in active categories are searched.
- GET /api/v1/admin/support/inquiries?status=open lists support inquiries and messages. PATCH /api/v1/admin/support/inquiries/{id} updates the inquiry status/assignment, and POST /api/v1/admin/support/inquiries/{id}/reply records an internal support follow-up note.
- Support inbox endpoints require current database roles (system_admin, admin, or supporting_staff) or the matching support.inquiries.view / support.inquiries.manage permissions. Knowledge authoring is limited to system_admin, admin, or support.knowledge.manage.
- The bot must not invent answers: no confident knowledge match means it says no verified answer is available and records the question for human review. Never include passwords or identity documents in the conversation.
- Contact details are visible to authorized MPA support staff. Contact details may be saved with an inquiry, but outbound contact is allowed only where the visitor explicitly checked the consent box. Public APIs are rate-limited. The opaque session key is hashed at rest and binds follow-up messages to the same browser session.
- Database migration: 20261015133000_public_support_bot.sql. This migration creates support_knowledge_category, support_knowledge_article, support_conversation, and support_message and seeds categorized starter topics plus one general support answer. MPA administrators must review and confirm starter content before treating it as official policy.

## 14. MPA brand assets

- Shared SVG assets live in web/public/brand/: mpa-logo-light.svg, mpa-logo-dark.svg, mpa-favicon-light.svg, and mpa-favicon-dark.svg. The logo is a P inside a mosque arch; light/dark variants use the MPA navy and green palette.
- The global shell selects the theme-appropriate logo and animates it on page load while respecting reduced-motion preferences. Metadata selects a light/dark favicon. Membership ID cards load the logo from this folder so brand changes do not require editing the card markup.
- The support assistant is mounted in the shared app shell and is available on public and authenticated pages. Admin support workspace: /admin/support.

Acceptance remains pending until the migration is applied in a test database, the server and Next.js build run, public knowledge answers and fallback behavior are exercised, role/permission denials are tested, contact consent/privacy and rate limiting are verified, and the widget is checked across public/authenticated routes and light/dark themes.


## In-app notification action center (foundation)

The canonical product and acceptance contract is [In-App Notification Action Center](44-in-app-notification-action-center.md). The notification system is an action center, not merely a feed: help each member complete their next professional step and give authorized administrators reliable visibility into workflow intervention needs.

- `GET /api/v1/notifications?category=all&unreadOnly=false&actionRequired=false&limit=30&offset=0` — authenticated user's inbox and counts. Categories: membership, verification, opportunities, recruitment, organizations, mentorship, services, events_learning, security, system. Page size is capped server-side.
- `PATCH /api/v1/notifications/{id}/read` — mark only the authenticated user's notification as read; idempotent and audited.
- `POST /api/v1/notifications/read-all` — mark current user's unarchived unread notifications as read; audited.
- `PATCH /api/v1/notifications/{id}/archive` — archive only the authenticated user's notification; idempotent and audited. Archive/read does not complete the business workflow.
- `GET/PATCH /api/v1/notifications/preferences` — retains existing channel preferences and supports `inAppCategories` (category-to-boolean object) and `digestEnabled` (boolean). Digest sending is not implemented merely by storing this preference.

Notification links must be safe internal relative paths, and destination APIs/pages must enforce authorization independently. Counts, read state and archive state are persisted in PostgreSQL. The existing email outbox/provider delivery state remains separate from in-app read state and provider acceptance is not proof of inbox delivery. The foundation is **not validated** until migrations, API/service tests, cross-user and cross-organization authorization tests, build and browser/accessibility checks pass on the current head.



## Workflow notification routing — Increment 2

The action-center event/recipient mapping and acceptance boundary are defined in [docs/45-workflow-notification-routing.md](45-workflow-notification-routing.md). Notifications must be created through the shared `createInAppNotification` policy or `queueWorkflowEmail` from within the same transaction as the persisted workflow transition. The producer chooses recipients from authoritative workflow relationships and current role/organization membership. Reviewer notifications link to the existing authorized queue; notification read/archive never changes workflow state. Security events bypass optional in-app/category preferences and remain visible in inbox/counts. Events/learning are not wired because those modules are not deployed. The new routing contract tests are committed but **not run**; migration, role-separated API, E2E, build, and accessibility acceptance remains open.

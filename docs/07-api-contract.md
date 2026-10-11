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

# Quality, Testing and Acceptance

## 1. Testing strategy

Test business rules, not only UI.

Layers:
1. unit tests;
2. domain/application tests;
3. API integration tests;
4. authorization tests;
5. database/migration tests;
6. external integration contract tests;
7. end-to-end tests;
8. performance tests.

## 2. Critical areas

Membership: submission, correction, approval, payment, activation, expiry, renewal and suspension.

Verification: evidence access, reviewer permissions, decisions, expiry and revocation.

Jobs: public applications, exclusive eligibility, organization permissions and candidate visibility.

Payments: success, failure, duplicate webhook, delayed webhook, reconciliation, incorrect amount and cancellation/refund where supported.

Events: capacity, duplicate registration, rescheduling, calendar update and cancellation.

Mentorship: matching, mentor capacity, acceptance, sessions and completion.

Projects: participant permissions, donation allocation, evidence, field synchronization and inspection.

## 3. Acceptance criteria

Use Given/When/Then.

Example:
Given a member has an active membership expiring in 30 days,
When the renewal reminder job runs,
Then one reminder is created for the configured channel,
And a duplicate reminder is not created for the same reminder period.

## 4. Security acceptance

Prove that:
- user cannot access another user's private profile;
- organization A cannot manage organization B;
- member cannot approve own verification and a reviewer cannot decide a case for an organization they created, submitted, or actively belong to;
- an unrelated organization owner/member cannot read private evidence, while an authorized reviewer can read linked evidence and the access is audited;
- a non-system administrator cannot grant/remove privileged roles or modify a privileged account;
- an administrator cannot change their own roles;
- a role change invalidates existing sessions, authorization follows current database roles rather than stale token claims, and the final system-administrator role cannot be removed;
- field officer cannot modify financial records without permission;
- client cannot forge successful payment;
- unauthorized transitions are rejected.

## 5. Integration acceptance

External providers can fail. The platform must preserve pending state, retry safely, prevent duplicates and expose operational diagnostics.

## 6. Migration

Every migration must be tested against realistic data and have backup/rollback consideration. Destructive transformations require explicit approval.

## 7. Performance

Monitor API latency, database query latency, search latency, queue delay, file upload and webhook processing.

Optimize measured bottlenecks.

## 8. Production readiness

Before release: security review, verified backups, monitoring, error reporting, payment reconciliation tests, admin recovery account, rollback process and runbooks.

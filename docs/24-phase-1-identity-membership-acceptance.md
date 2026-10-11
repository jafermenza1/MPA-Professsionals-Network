# Phase 1 — Identity and Membership Acceptance

Phase 1 is complete only when the platform provides a connected, server-enforced lifecycle:

**Register → Identity resolution → Person/Profile → Membership application → Review → Correction (when required) → Approved fee snapshot → Payment → Verification → Activation → History → Renewal → Notifications**

## Implemented business capabilities

| Requirement | Implementation |
|---|---|
| Account | app_user, password hashing, registration, login, account status |
| Identity | email/phone/exact normalized-name duplicate protection before account creation |
| Person | canonical person record linked 1:1 to account |
| Professional profile | professional_profile, editable profile, visibility and completion |
| Membership product | configurable membership_product; seeded baseline products are 1,200 ETB Basic, 12,000 ETB Lifetime, 50,000 ETB Premium |
| Application | new and renewal applications with fee/data snapshots |
| Review | reviewer/finance/system-admin decisions: approve, reject, correction required |
| Correction | correction request, applicant response, resubmission |
| Supporting documents | application attachment records linked to provider-neutral file_object |
| Payment | canonical payment_transaction, idempotency, manual/bank/cash channels |
| Manual verification | evidence-aware finance/reviewer verification with approve/reject/correction |
| Activation | activation is blocked until a verified successful payment exists |
| Membership history | membership_event, historical membership records, payment/application history |
| Renewal | linked renewal application; previous membership remains historical |
| Notifications | notification events, durable outbox, user notification preferences |
| Audit | workflow transitions write to audit_log |

## Authorization

- Public: registration and login.
- Authenticated member: own profile, applications, corrections, payment submission, history and preferences.
- Reviewer/finance/system administrator: application review, payment verification and activation.
- Server-side authorization is mandatory; client UI cannot grant workflow authority.

## Financial controls

- Application fee is captured in fee_snapshot.
- Payment amount must equal the approved application fee.
- Manual receipt/evidence does not activate membership.
- Manual/bank/cash payment starts as pending.
- Only an authorized verification decision can move it to succeeded.
- Activation requires a successful payment linked to the application.
- Payment idempotency keys prevent duplicate payment creation.

## Renewal controls

- A new application cannot be created while another active application exists.
- New membership applications are rejected when the account already has an active membership.
- Renewal requires an active membership and a product configured for renewal.
- Lifetime/non-renewing products cannot be used for renewal.
- Renewal links to previous_membership_id.
- Existing membership history is retained; it is not overwritten.

## Identity continuity

Registration checks existing email, normalized phone and normalized exact display name before creating a new identity. A possible match produces an explicit conflict instead of silently creating a duplicate account.

The legacy membership import schema and match-review contract from the preceding membership migration work remains compatible with the canonical app_user, person and membership_record model.

## Acceptance scenarios

1. Register a new account with valid identity details.
2. Sign in and retrieve the account/profile.
3. Submit a Basic membership application.
4. Reviewer requests correction.
5. Member responds and resubmits.
6. Reviewer approves.
7. Member submits a bank-transfer/manual payment with evidence.
8. Finance verifies the payment.
9. Authorized operator activates membership.
10. Member sees membership, payment, application, event and notification history.
11. Member creates a linked Basic renewal application.
12. Duplicate registration and duplicate active application attempts are rejected.

## Operational requirements

- PostgreSQL is the authoritative business store.
- Docker remains optional; direct Node.js + PostgreSQL operation is supported.
- CI runs migrations before integration tests.
- Phase completion requires green CI after the final Phase 1 commit.

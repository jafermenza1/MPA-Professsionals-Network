# Developer Guide

## 1. Engineering principle

Implement business capabilities through domain modules. Do not place important rules in page components or controllers.

## 2. Module responsibility

A module should contain domain types/models, persistence access, application services/use cases, authorization policies, validators, routes/controllers and tests.

Exact folder naming may follow the chosen framework.

## 3. Controller rule

Controllers authenticate, validate input, call application services and map results to responses.

They do not contain complex membership, payment or eligibility logic.

## 4. Application service rule

Services coordinate use cases.

Example: ActivateMembershipAfterConfirmedPayment can verify payment, validate application, create membership period, record audit and publish notification event.

## 5. Repository rule

Repositories handle persistence. Business decisions stay above the repository layer.

## 6. State transitions

Do not assign arbitrary status values throughout code. Use explicit domain transition methods or centralized state services.

## 7. Audit

Sensitive business actions use a central audit mechanism. Do not implement different audit behavior in every module.

## 8. Notifications

Domain modules publish business events. Notification module handles template, channel, preference, provider and retry.

## 9. Integrations

Provider SDKs belong in infrastructure adapters.

Do not import a Telebirr SDK into membership business logic. Do not import Moodle implementation details into profile logic.

## 10. Database

Never modify production schema manually without a migration. Migration names explain intent.

## 11. Seed data

Development seed data must be synthetic and must never contain real private member records.

## 12. Error codes

Use stable business errors such as AUTH_REQUIRED, FORBIDDEN, MEMBERSHIP_NOT_ACTIVE, MEMBERSHIP_RENEWAL_NOT_ALLOWED, VERIFICATION_NOT_READY, JOB_NOT_ELIGIBLE, PAYMENT_PENDING, PAYMENT_FAILED and RESOURCE_NOT_FOUND.

## 13. Git workflow

Use small feature branches, focused commits, pull requests, required CI and code review. Avoid direct production changes.

## 14. Pull requests

Every PR should describe problem, solution, affected modules, database changes, API changes, security implications, tests, UI evidence where useful and migration/rollback considerations.

## 15. Documentation maintenance

Update PRD for product behavior changes, domain model for business rules, API contract for API changes, workflows for state transitions and ADRs for architectural decisions.

Documentation is part of implementation.

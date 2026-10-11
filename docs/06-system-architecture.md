# System Architecture

## 1. Goal

Build a modular enterprise web platform that can grow without turning every feature into a tightly coupled dependency.

Start as a modular monolith unless actual scale or team boundaries justify separate services.

## 2. Logical architecture

Web client -> API/application layer -> domain modules -> persistence/object storage/queue -> external integrations.

Core modules:
Identity, Membership, Profiles, Verification, Organizations, Jobs, Services, Mentorship, Events, Learning, Projects, Donations, Payments, Notifications and Audit.

External integrations:
Telebirr, Moodle, calendar providers, SMS and email.

## 3. Layers

Presentation: pages, forms, tables, dashboards.

API/application: authentication, validation, orchestration, authorization and transaction boundaries.

Domain: business rules and state transitions.

Infrastructure: database, object storage, payment, SMS, email, Moodle, calendar and queue adapters.

Controllers must not contain complex business rules.

## 4. Database

PostgreSQL is recommended for transactional records because the domain contains strong relationships, workflows, financial data, constraints and audit requirements.

Use relational tables for core entities. JSON is for genuinely variable configuration/provider snapshots, not as a replacement for the domain model.

## 5. Object storage

Documents/images should live in object storage.

Database stores file ID, owner/resource, object key, MIME type, size, checksum, upload state, visibility and timestamps.

Access through authorized or signed URLs.

## 6. Asynchronous processing

Use a queue for email, SMS, webhooks, calendar sync, Moodle sync, document processing, reminders and reports.

Do not make users wait for an external provider when the operation can safely be asynchronous.

## 7. Search

Start with PostgreSQL search/indexes. Introduce a dedicated search engine only when relevance or scale justifies it.

## 8. Provider abstractions

Define provider-neutral interfaces.

PaymentProvider: create, get, verify, refund where supported.

NotificationProvider: SMS/email delivery.

CalendarProvider: create/update/delete/sync.

LearningProvider: SSO/enrollment/completion/certification.

Provider-specific SDKs must stay in infrastructure adapters.

## 9. Domain events

Examples:
membership.activated
membership.renewal_due
verification.approved
job.published
job.application.submitted
mentorship.accepted
event.rescheduled
payment.confirmed
donation.completed
project.evidence.approved

Events should drive notifications and integrations.

## 10. Idempotency

External callbacks and retried jobs must be safe. Payment webhooks, calendar updates, Moodle callbacks and notifications require provider event IDs or idempotency keys.

## 11. Transactions

Use database transactions for atomic business changes.

For example, confirmed membership payment and membership activation should not leave the system in a half-completed state.

## 12. File lifecycle

Requested -> Uploading -> Uploaded -> Validated -> Available.

Failed uploads must never appear as valid evidence.

## 13. Environments

Use local, CI/test, staging and production environments.

Secrets are environment configuration and must never be committed.

## 14. Backups

Define backup frequency, retention, object storage versioning, restore testing, recovery point objective and recovery time objective.

A backup is not considered reliable until restoration has been tested.

## 15. Observability

Provide structured logs, request IDs, error tracking, queue status, integration health, payment reconciliation alerts and security alerts.

## 16. Scaling strategy

Scale in this order:
1. query/index optimization;
2. caching;
3. background jobs;
4. object storage;
5. read replicas where justified;
6. dedicated search where justified;
7. service extraction only when load or organizational ownership requires it.

Do not build microservices merely because the platform has many modules.

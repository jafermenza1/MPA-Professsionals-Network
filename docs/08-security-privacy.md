# Security, Privacy and Data Governance

## 1. Objective

The platform contains identity, professional records, documents, payments, organization information and project evidence. Security must be built into the architecture.

## 2. Authentication

Use secure password hashing where passwords exist, secure sessions/tokens, account verification, brute-force protection, rate limiting, secure password reset and optional MFA for privileged users.

## 3. Authorization

Every sensitive operation is server-side authorized. Use least privilege and scope permissions. Authorization uses current database roles rather than stale token role claims. Role changes revoke existing sessions; self-assigned role changes and non-system-admin changes to privileged roles/accounts (including reviewer, ethics-reviewer, appeal-reviewer and finance roles) are denied. Verification review must reject conflicts where the reviewer created, submitted, or is an active member of the organization.

## 4. Sensitive documents

Identity, education, employment and organizational evidence are private by default.

Requirements:
- authorized access only, including organization ownership and reviewer scope;
- temporary/signed URLs;
- file validation and malware scanning where feasible;
- audit successful high-risk file reads without logging file bytes or sensitive contents;
- retention policy.

## 5. Data minimization

Collect fields because there is a defined business purpose. Sensitive fields must have purpose, visibility, retention and authorized readers.

## 6. Consent

Track consent where needed for communications, public profile visibility, organization sharing, optional data uses and external integrations.

## 7. Public profile

A professional controls visibility of permitted fields.

Never expose identity evidence, private contact information, internal reviewer notes, payment details or private application information through a public profile.

## 8. Financial data

Do not store payment credentials unnecessarily. Store provider references and transaction states.

Financial records must be auditable.

## 9. Audit

Audit record includes actor, action, resource, resource ID, safe before/after summary, reason, timestamp and request/correlation ID. Audit logs are append-oriented and protected from ordinary modification.

## 10. Security events

Monitor failed login patterns, privileged role changes, suspicious access, permission changes, payment anomalies, repeated authorization failures and unusual document access.

## 11. Retention

Define retention by data class. Financial and audit records may require long retention. Rejected evidence, notification records and inactive accounts require explicit policy.

Do not delete historical records simply because they are hidden from UI.

## 12. Privacy boundaries

Employers see only information required for recruitment/service workflows. Volunteers do not automatically see donor financial information. Mentors see information required for mentoring, not unrelated membership evidence.

## 13. Security testing

Before production:
- dependency scanning;
- static analysis;
- authentication tests;
- authorization tests;
- upload security tests;
- API abuse tests;
- secret scanning;
- payment webhook tests;
- OWASP-oriented review.

## 14. Incident response

Detect -> contain -> investigate -> remediate -> recover -> communicate where required -> record lessons.

## 15. Release blockers

Do not release if privileged endpoints lack authorization, sensitive documents are public, payment state can be forged, audit-critical actions are missing, secrets are committed or authentication abuse is unprotected.

# Phase 0 — Foundation acceptance

Phase 0 is complete only when all controls below are implemented and recorded test evidence proves the baseline. GitHub Actions CI was removed on 2026-10-14; use the manual validation policy.

| Exit requirement | Implementation |
|---|---|
| Repository and environments | Git repository, `.env.example`, `.gitignore`, Dockerfile and Compose development environment |
| Test and validation process | Retained Node tests, PostgreSQL migration/rerun tests, API smoke and startup smoke test executed manually in an isolated environment; GitHub Actions automation removed 2026-10-14 |
| Database | PostgreSQL 16-compatible migrations; reference portfolio plus identity, roles, audit, file, notification and payment foundation |
| Authentication | Signed bearer-token verification using an environment-provided HS256 secret |
| Authorization | Role-based protected endpoint; `member` role required |
| Logging | Structured JSON request/startup/error logging with request IDs |
| Audit foundation | Append-oriented `audit_log` schema and structured audit event abstraction |
| File storage abstraction | Provider-neutral storage interface; no filesystem/cloud provider coupled to domain code |
| Notification abstraction | Provider-neutral notification interface plus durable outbox table |
| Payment abstraction | Provider-neutral payment interface plus idempotent payment transaction table |
| Secrets | Runtime environment variables only; no credentials or provider secrets committed |

## Protected endpoint

`GET /api/v1/protected` requires:

`Authorization: Bearer <signed-token>`

The identity must contain the `member` role. Missing/invalid credentials return `401`; a valid identity without the required role returns `403`.

## Operational commands

- `npm test`
- `npm run migrate`
- `npm start`
- `docker compose up --build`

Production deployments must provide a strong `JWT_SECRET` and a managed PostgreSQL `DATABASE_URL`; development credentials in Compose are local-only defaults and are not application secrets.

## Phase 0 boundary

Provider implementations (object storage, SMS/email, and payment gateway) are deliberately adapters, not hard-coded into the platform. Provider-specific integration belongs to the subsequent feature phases while the core contracts remain stable.


Historical Actions runs do not certify later commits. Record exact SHA, commands, environment and output for each new acceptance decision. See [Manual Test, Release, and Deployment Policy](36-manual-test-release-and-deployment-policy.md).

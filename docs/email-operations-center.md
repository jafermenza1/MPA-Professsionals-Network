# Email Operations Center — Operator Guide

This is the operator-facing setup guide for the MPA platform email center. The detailed implementation and acceptance notes are maintained in [docs/39-email-operations-center.md](./39-email-operations-center.md).

## Production configuration

Set these values in the API process environment or deployment secret manager. Do not put provider credentials in browser storage, source control, or any `NEXT_PUBLIC_*` variable.

- `PUBLIC_APP_URL`: the exact public HTTPS origin, without a path, query, fragment, or credentials.
- `RESEND_API_KEY`: server-only Resend API key.
- `EMAIL_FROM`: sender address on a domain verified with Resend.
- Email verification is always enforced by the API. Configure delivery before production registration; do not disable the activation gate. Local development returns a development-only link when no provider is configured.
- `EMAIL_INBOUND_WEBHOOK_SECRET`: a long random secret for the normalized inbound-mail webhook, only when inbound email is configured.
- Optional signed delivery-webhook alternative: `EMAIL_DELIVERY_WEBHOOK_URL` and `EMAIL_DELIVERY_WEBHOOK_SECRET`. The receiver must verify the documented HMAC-SHA256 signature and bearer secret.

After configuration, restart/redeploy the API and open `/admin/email` as a `system_admin`. The connection panel reports readiness and whether configuration values are present; it does not reveal credentials. Send a test email to the signed-in administrator before relying on delivery.

## Operations

- **Compose / Drafts:** save a manual message, then explicitly queue it.
- **Outbox / queued:** inspect pending delivery and trigger bounded manual processing.
- **Sent:** means the configured provider accepted the message; it does not guarantee inbox delivery.
- **Failed:** inspect the error and retry after correcting the provider or message configuration.
- **Verification failures:** request a fresh single-use verification link; prior unconsumed links are invalidated by resend.
- **Inbox:** inbound messages appear only after a provider is configured to forward normalized messages to the inbound endpoint. This is a platform operations inbox, not a personal Gmail or Outlook mailbox.
- **Templates:** customize subject, plain text, HTML, audience, and enabled state. Use the exact workflow event code to override a workflow's default template. Email verification cannot be disabled through template settings.

Workflow notifications honor each recipient's email notification preference. Security-critical email verification is not treated as an optional workflow notification. Outbox retries are bounded; after terminal failure, a system administrator can retry from the console.

## Database and release checks

Run `npm run migrate` against a reviewed, backed-up deployment database using the repository's migration-baseline procedure where applicable. The additive email migrations are:

- `db/migrations/20261015170000_email_operations_center.sql`
- `db/migrations/20261015173000_email_audience_templates.sql`

Before production rollout, validate clean-schema and legacy-baseline migration/rerun behavior, real provider acceptance, verification expiry/replay and resend invalidation, outbox retry behavior, administrator-only API access, and inbound webhook authentication/idempotency. A provider-ready indicator alone is not delivery acceptance.

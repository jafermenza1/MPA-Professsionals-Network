# Email Operations Center

Status: implementation on `reconciliation/holistic-gates`; deployment and provider acceptance still require environment secrets, migrations and a successful final CI run.

## Administrator UI

Open `/admin/email` as a system administrator. The email operations center includes:
- Inbox: inbound messages received through the configured first-party inbound webhook; mark read/unread and archive.
- Sent: messages accepted by the configured provider, with provider message ID and sent timestamp.
- Drafts: compose and save messages before queueing.
- Outbox / queued: durable messages waiting for delivery; dispatch up to 20 per administrator action.
- Failed: messages requiring operator attention; retry failed messages and inspect the latest provider error.
- Verification failures: failed account-verification deliveries; retry creates a fresh single-use verification link and invalidates prior unconsumed links.
- Templates: create and edit subject, plain text, HTML, audience and enabled state. Templates support `{{variableName}}` substitutions.
- Connections & settings: readiness summary, environment variable checklist, send-a-test-email action and manual queue processing.

This is the platform's notification operations console, not a personal IMAP mailbox or a replacement for Gmail/Outlook. Inbound mail is available only after an inbound provider is configured to forward normalized messages to the webhook. The current inbound endpoint expects `X-Email-Webhook-Secret` and a normalized JSON object with `messageId`, `from`, `to`, `subject`, `text`, and `html`; do not point a provider at it until its signature/secret mechanism has been correctly mapped. Provider webhooks must use HTTPS.

## Outbound configuration

The simplest supported connection is Resend. Configure these values only in the API host's secret manager or server-side environment:
- `PUBLIC_APP_URL=https://network.example.org`
- `RESEND_API_KEY=...`
- `EMAIL_FROM=MPA Network <verify@network.example.org>`

Verify the sending domain and publish the DNS records required by Resend before testing delivery. Then restart/redeploy the API. The settings page only displays presence/readiness; it never stores or returns secrets. Never use a `NEXT_PUBLIC_` prefix for credentials.

Alternative: configure `EMAIL_DELIVERY_WEBHOOK_URL` and `EMAIL_DELIVERY_WEBHOOK_SECRET`. The receiver must verify `x-mpa-payload-signature` (HMAC-SHA256 of the exact serialized JSON body) and the bearer secret, validate the payload, and return 2xx only after accepting it.

## Delivery behavior

- Email messages are durably stored in `notification_outbox` and dispatched by a shared-PostgreSQL worker every 30 seconds when a provider is ready.
- Row locks with `SKIP LOCKED` prevent multiple app instances from claiming the same message at once. Stale processing claims are recoverable.
- Transient failures retry with exponential backoff. After eight failed attempts the message enters `failed`; an authorized administrator can manually retry it.
- A provider accepting a message means accepted for delivery, not proof it reached the inbox. Bounce, complaint and delivery events need provider webhook integration to update final delivery status.
- Email verification links are one-time, expire after 24 hours, and use the editable `account.email_verification` template. Verification cannot be disabled by toggling that template.
- Organization registration and review-decision notifications are queued for the linked owner account and review staff. Job application submissions notify applicants and organization recruitment roles; candidate status changes notify applicants. Service requests and mentorship matches notify the involved requester/provider/mentor. Existing membership events use the same durable outbox. Email-enabled preferences are respected for workflow messages; verification email remains mandatory. For additional event-specific content, create a template whose code exactly matches the event code emitted by that workflow.
- The inbound inbox requires a configured inbound provider and secret. The UI is present even if inbound delivery is not configured; the connection panel shows its status.

## Migration and acceptance

Apply migrations with `npm run migrate` before deploying the updated API. Check:
1. the migration runner has applied `20261015170000_email_operations_center.sql` and `20261015173000_email_audience_templates.sql`;
2. registration sends a real verification message through the configured provider and blocks unverified sign-in;
3. the admin test message arrives at the administrator address;
4. a draft can be queued and appears in Outbox then Sent;
5. provider failures appear under Failed and retry after configuration is corrected;
6. template changes are reflected in the next message;
7. non-administrator users receive 403 for all email administration APIs;
8. inbound messages require the configured secret and duplicate provider IDs are idempotent.

No production credentials are committed in this repository.

# Authentication and Security Hardening

Status: implementation on `reconciliation/holistic-gates`; deployment acceptance is not yet claimed. Apply the additive migrations through the repository migration runner before starting the updated server.

## Registration and email ownership

- The registration page checks password confirmation before sending the request. The API also rejects a mismatched confirmation when the field is supplied.
- The public account reference uses the existing typed tracking-reference format (for example, `MPA-MEM-26-000123`). It is a support reference, not a credential.
- In production, registration consumes a verified, short-lived, single-use human-challenge token and creates a pending email-verification token. It does not return a login session until email ownership is verified.
- Email links expire after 24 hours. Verification is single-use, records an audit event, and invalidates other outstanding links for the same account.
- The bootstrap administrator email is trusted configuration and is marked verified during server-side bootstrap. Public registration cannot set email verification state.
- Resend responses do not disclose whether an email address exists. Resend requests are rate-limited.

### Email delivery configuration

Production registration fails closed until `PUBLIC_APP_URL` and one delivery method are configured.

**Simplest option: Resend**
- `PUBLIC_APP_URL`: exact public HTTPS origin of the web application, e.g. `https://network.example.org`.
- `RESEND_API_KEY`: server-only Resend API key.
- `EMAIL_FROM`: sender address on a domain verified with Resend, e.g. `MPA Network <verify@network.example.org>`.

The application calls Resend's HTTPS email API directly; no extra mailer server or npm dependency is required. Verify the sending domain and its DNS records in Resend before production use. Never expose `RESEND_API_KEY` to browser code.

**Alternative: signed delivery webhook**
- `EMAIL_DELIVERY_WEBHOOK_URL`: HTTPS endpoint controlled by the deployment that delivers the message through its chosen email provider.
- `EMAIL_DELIVERY_WEBHOOK_SECRET`: long random secret shared only with that endpoint.

The application POSTs a JSON payload containing `to`, `template`, `subject`, `text`, `html`, `verificationUrl`, `registrationReference`, and `expiresInHours`. It sends the configured secret as a Bearer credential and an HMAC-SHA256 signature of the exact serialized body in `x-mpa-payload-signature`. The receiver must verify the signature using constant-time comparison, validate the recipient and template, send the message, and return a 2xx response only when it has accepted the message for delivery. Do not expose this endpoint or secret to browser code.

For local development, set `EMAIL_VERIFICATION_REQUIRED=true` to exercise the email gate. Without a delivery provider, the development-only response provides a verification URL for local testing. Production does not return verification tokens or links to the browser.

## First-party human challenge and request throttling

- The registration form requests an arithmetic challenge from the API.
- Challenge answers are stored as hashes, expire after five minutes, and are limited to five failed answers.
- Successful answers produce a random token whose hash is stored server-side. Registration atomically consumes that token; expired, invalid, and replayed tokens are rejected.
- Rate limits are stored in PostgreSQL and enforced atomically, so application instances share the same counters. IP and per-identity/IP buckets are both checked. Expired buckets and challenges are cleaned up opportunistically.
- By default, the server uses the socket peer address. Set `TRUST_PROXY=true` only when the public API is reachable exclusively through a trusted reverse proxy that overwrites `X-Forwarded-For`; otherwise clients could spoof the forwarded address.
- The challenge is a low-cost anti-automation speed bump, not proof of humanity and not DDoS protection. Continue to use host/network-level connection limits, TLS, request-size bounds, database connection limits, and provider/hosting-level traffic controls.

## Administrator passkeys

The WebAuthn implementation is intentionally constrained to privacy-preserving `none` attestation and ES256/P-256 credentials. It checks the one-time server challenge, exact configured origin, relying-party ID hash, user presence and user verification flags, signature, credential revocation, and authenticator signature counter.

Production configuration:

- `WEBAUTHN_ORIGIN`: exact HTTPS origin used by administrators, with no path (for example, `https://network.example.org`).
- `WEBAUTHN_RP_ID`: host name matching that origin (for example, `network.example.org`).

An administrator must have a current platform-admin role and a session created within the previous ten minutes to enroll or add a passkey. After the first successful enrollment, password-only login and existing password-authenticated sessions are blocked for that account. A valid passkey creates a session marked `passkey`; authorization still reads current roles from PostgreSQL. A member cannot enroll a passkey as an administrator.

Each successful enrollment displays a new set of eight one-time recovery codes. Save them offline in a secure location. Each code can create only a restricted recovery session that can register a replacement passkey; it does not authorize normal administrator operations. Register a second passkey before revoking an existing one. Revocation is audited, and the last active passkey cannot be revoked while enforcement is enabled. If both passkeys and all recovery codes are lost, use the documented operator identity-recovery procedure; do not add a password-only bypass endpoint.

The current browser implementation requires WebAuthn support and a secure context (HTTPS in production; localhost is accepted by browsers for development). Configure the exact origin before enrollment. Passkey login is intended for administrators who have already enrolled at least one credential.

## Required security acceptance matrix

Run after the implementation reaches the final gate and migrations are applied in an isolated PostgreSQL database. Do not report this matrix as passed until the CI run is green for the exact branch head.

| Scenario | Expected result |
|---|---|
| Registration without a human challenge in production | Rejected; no account created |
| Incorrect or expired challenge answer | Rejected; failed attempts persist |
| Reuse a verified challenge token | Rejected; only first registration may consume it |
| Registration with mismatched password confirmation | Rejected |
| Production registration without email delivery configuration | Fails closed before account creation |
| Login before email verification | Rejected |
| Valid email token | Marks the account verified once; replay is rejected |
| Unknown email on resend | Same generic response as known/verified email |
| Rate limit across separate app instances | Shared PostgreSQL bucket rejects over-limit traffic |
| Spoofed forwarded IP while proxy trust is disabled | Ignored; socket peer is used |
| Member attempts admin passkey enrollment/list/revocation | 403 |
| Missing, expired, wrong-origin, wrong-RP or replayed WebAuthn challenge | Rejected |
| Invalid attestation, public key or assertion signature | Rejected |
| Password login after admin passkey enforcement | Rejected with passkey-required guidance |
| Revoke a credential then attempt to authenticate with it | Rejected |
| Revoke last active credential while enforcement is enabled | Rejected |
| Reuse a recovery code | Rejected |
| Recovery-code session calls unrelated admin API | Rejected; only replacement passkey registration is allowed |
| Successful passkey registration/authentication/revocation/recovery | Audit event exists; roles and scopes remain enforced |
| Browser enrollment and login | Works in a supported browser on the configured HTTPS origin |

## Operational limits and rollout

This repository code cannot provision DNS, TLS, email-provider credentials, or upstream DDoS mitigation. Before production rollout: configure the mail webhook and WebAuthn origin/RP ID, apply migrations, confirm the bootstrap administrator can sign in, enroll two passkeys, store recovery codes, verify email delivery, and run the security acceptance matrix. Keep the existing CI checks and do not weaken them to accommodate these changes.

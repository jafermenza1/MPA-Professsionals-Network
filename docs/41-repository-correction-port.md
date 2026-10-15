# Repository correction port — 15 October 2026

## Purpose
The recent implementation work was authored against `Jafermenza/ET-Professionals-Network`, while the intended product repository is `jafermenza1/MPA-Professsionals-Network`. This record defines the exact transfer scope, safe handling rules, and evidence still required. It is not an acceptance claim.

## Exact source scope — do not widen
- Source repository / PR: `Jafermenza/ET-Professionals-Network`, PR #25
- Source branch: `reconciliation/holistic-gates`
- Excluded base: `433ea129f22036af00f07836a26c32c4ee548896`
- Included source head: `3685817b428615f24f2fdf90c497c7bc9a254d1b`
- Observed range: 126 commits and 29 net changed files.
- Destination repository / PR: `jafermenza1/MPA-Professsionals-Network`, PR #3
- Destination branch: `reconciliation/holistic-gates`
- Original destination anchor: `d919d3f94b2eb9ba593b70b7c8763ffbd027bdd4`
- Destination head before this follow-up: `0cd5edf27032b8a537d77ba9058126a7e6a957b1`

Transfer only source changes after the excluded base through the pinned included head. Do not import older source work, unrelated changes, the whole source history, or changes after the pinned head. If the source head moves, do not silently widen the scope.

## Why this is a semantic port
The repositories have distinct histories and MPA-specific membership, registration, login/session, organization workspace, and marketplace contracts. A direct commit transplant or wholesale file replacement risks overwriting MPA behavior. Apply only compatible changes in destination-native commits and preserve MPA history.

The destination had 38 port-branch commits touching 29 files relative to the recorded starting anchor. This count does not prove all 126 source commits or all source behavior have been mapped. A per-file mapping and contract review are required.

## Source areas to reconcile
- Authentication: persistent rate limits, human challenge, email verification, administrator passkeys/WebAuthn and recovery.
- Email operations: templates, durable drafts/outbox, inbound metadata, delivery status/retry and administrator controls.
- Workflow integration: registration, organization review, application tracking, job applications, service requests and mentorship notifications.
- UI/configuration: security and email administration, verification screen, registration/login updates and organization draft restoration.
- Persistence/evidence: migrations, unit/E2E tests, environment documentation and migration/CI support.

For every source path in the 29-file net diff, record a disposition: already present, compatible as-is, adapted to MPA contracts, or excluded with reason. A filename or commit is not proof of functional equivalence.

## Safety findings
1. The source `.env.example` contains a fixed JWT secret and fixed bootstrap administrator password. Do not copy fixed credentials. The destination example has been changed to unmistakable placeholders; generate unique secrets per environment and never use placeholders as live credentials.
2. MPA's `src/membership/service.js` was intentionally not replaced. Initial verification-token issuance during registration and mandatory verification enforcement in MPA's membership login/session path remain incomplete. Keep `EMAIL_VERIFICATION_REQUIRED=false` until server-side enforcement is integrated and tested; the flag alone does not enforce verification.
3. Review passkey origin/RP-ID validation, challenge expiry/single use, credential ownership, sign-counter behavior, recovery-code hashing/one-time consumption, session scope, admin authorization and audit trails against MPA's auth model.
4. Validate migrations against a disposable database: dependency order, legacy baseline adoption, rerun safety, existing-row constraints, recovery procedure and schema compatibility. Do not apply these migrations to production as part of this PR.
5. Queued email is not delivered email. Verify provider configuration, sender, retries, duplicate handling, webhook authentication, redaction and actual delivery in a controlled environment.
6. Preserve MPA capabilities and assertions. Do not remove tests, relax authorization, replace MPA-specific services wholesale, force-push, rewrite history, merge or deploy as part of this port.

## Port inventory — not yet acceptance evidence
- Additive security controls, passkey service, verification-token service and email operations service.
- Additive security/passkey/email migrations.
- Administrator email/security pages, verification page, related test files and operator documentation.
- Email operations endpoints, persistent throttling, bounded outbox dispatch and environment examples.
- MPA registration, membership, recovery, organization workspace, tracking and marketplace implementations retained and extended rather than wholesale replaced.
- Notification queue hooks for selected organization/application/service/mentorship workflows.

## Safe transfer and acceptance procedure
1. Pin and verify the exact source base/head above; enumerate all 29 paths and collect source patches.
2. Compare every source patch with the destination at its current PR #3 head. Identify overlaps, schema/API differences and already-present behavior before editing.
3. Make small, reviewable, destination-native commits only for missing compatible behavior. Do not copy unrelated source history or widen the source range.
4. Record per-file dispositions, destination commit SHAs, adaptations/exclusions and evidence in this document.
5. Run the agreed final validation on the exact destination SHA: unit/integration tests, migration baseline/rerun tests, security and cross-account denial tests, browser workflows, configured typecheck/build, and controlled email delivery checks.
6. Fix root causes without weakening assertions; rerun affected tests and record final evidence.
7. Keep PR #3 open and draft until acceptance criteria pass. This port does not authorize merge or deployment.

## Validation status
**NOT VALIDATED.** The source range and destination anchors were inspected, and fixed credentials in the destination example were replaced with placeholders. Complete per-file behavioral equivalence, tests, typecheck/lint, production build, migration application/rerun, browser journeys and provider-delivery tests have not been established here. Do not mark complete or merge/deploy until evidence is recorded against the final destination SHA.


## Safe integration follow-up — 15 October 2026, 15:07 UTC

### Source-to-destination file audit

The pinned source compare (`433ea129...` to `3685817b...`) reports 29 changed paths. All 29 paths are represented in the destination PR #3 changed-file set. This is a path-coverage result only, not proof of behavior equivalence.

Direct source-head versus destination-head content checks found the following groups:

- **Identical at the time of inspection:** the five new security/passkey/email migrations; `docs/38-authentication-security-hardening.md`; `docs/39-email-operations-center.md`; `e2e/email-operations.spec.js`; `e2e/security-auth.spec.js`; `src/platform/application-tracking.js`; `src/platform/email-operations.js`; `src/platform/email-verification.js`; `src/platform/security-controls.js`; `src/platform/webauthn.js`; `test/platform/security-auth.test.js`; `web/app/admin/email/page.tsx`; and `web/app/admin/security/page.tsx`.
- **MPA-adapted/different:** `server.js`, `src/membership/service.js`, `src/organization-jobs/service.js`, `src/services-mentorship/service.js`, `web/app/admin/page.tsx`, `web/app/login/page.tsx`, `web/app/organizations/page.tsx`, `web/app/register/page.tsx`, `web/app/track/page.tsx`, `web/lib/api.ts`, and `.env.example`. These differences must be retained and reviewed, not overwritten to force textual equality.
- `web/app/verify-email/page.tsx` was initially identical but was then adapted to recognize the MPA organization-draft storage key.

### Integration gaps found and addressed in code (validation still pending)

The source registration UI and MPA server were not aligned: the source UI used a different human-challenge path, and the MPA verification route wrapped the issued token under a `valid` property instead of returning the token object expected by the UI. The current follow-up aligns the MPA registration UI with the MPA route and response shape.

The MPA registration service now consumes the supplied one-time human-check token when required or supplied, validates password confirmation server-side, assigns a human-readable registration reference, and creates/delivers a verification token when `EMAIL_VERIFICATION_REQUIRED=true`. The login path rejects unverified accounts when that flag is enabled, and authenticated API sessions are also rejected when the flag is enabled and the account remains unverified. The public challenge issue/verify endpoints now have rate limiting. The login UI maps the verification-required error to an actionable message, and the verification page checks the same local organization-draft key used by MPA registration/workspace.

Relevant destination commits added after the initial port head:

- `1a75f5831ba4e77211e745b18c3485104be0d64c` — replace fixed example credentials with placeholders.
- `fafb44ee9eaaac531592211afb55b25ac8147d04` — pin source scope and safe-transfer evidence.
- `9a59ca6c7ac87fcadb9c9ef63354f1b9092cc51f` — consume human challenge and issue registration verification.
- `7d7e5fac35e880e3045143c04800af27941842db` — return challenge token and enforce verified sessions.
- `fe73e85347bb78e39368904e69986dfdbf7b416f` — block password login when required verification is missing.
- `41cc2d910b88bb8fc3e063b591e5476e1af2d906` — align registration UI with challenge/verification.
- `e04bcd82390e4353e54e093d56f280bb19cb59a5` — validate password confirmation server-side.
- `513a38344d52713efcdb464eddae95b8e3053c69` — align verification page with the MPA draft key.
- `a74c4a6b2f85ab389cc55026fa1b13a879d02c87` — explain required email verification errors.
- `2b85173530e7e16db472938a732cc491646ae922` — document challenge/passkey environment controls.
- `6ed91eeb4b9e16cc110a80faaaa4ae37f7e520b5` — rate-limit public human-check endpoints.

### Remaining acceptance work

- Run the complete per-file semantic review against the pinned source patches and current MPA contracts; path coverage and line-count/content comparison are not substitutes for reviewing behavior.
- Confirm `EMAIL_VERIFICATION_REQUIRED` is enabled only with tested server enforcement and working delivery configuration; do not assume the sample `.env.example` value is production-safe.
- Confirm production `HUMAN_CHALLENGE_REQUIRED` is enabled and verify the passkey enforcement policy before any deployment.
- Execute registration success/failure/retry, token expiry/reuse, login denial before verification, existing-session denial, organization draft restoration, migration baseline/rerun, security, integration and browser checks at the agreed final gate.
- Record actual results against the exact final destination SHA. No tests or builds are claimed as passed by this follow-up.


- `7e3f267aa618476cf96e1cfa2539416ce348264d` — default the human-check requirement on in production, even if the environment flag is omitted.
- Existing accounts may have `email_verified_at IS NULL` after the additive migration. Before enabling required verification for an existing installation, plan a user-safe verification rollout and delivery checks. Do not mark existing addresses verified without trusted evidence; the flag will intentionally block unverified login and API sessions.

- `97746b9437ce5ee4bb346f43060d8f892748267a` — example environment bootstrap values are now empty by default; the JWT sample is deliberately too short for production.


## Follow-up code closure — 15 October 2026

This section records targeted changes made after tracing the MPA authentication routes into their service implementations. It is implementation evidence, not test acceptance.

- Commit `0b9c1aa58ce19ae9aa8ad854452577cd4f2e3295` updates `src/membership/service.js`: password login now reads `admin_passkey_enforced_at`, resolves current database roles, and refuses password-based login for an enforced `admin` or `system_admin` account with `PASSKEY_REQUIRED`. The attempt is audit-logged. Ordinary member login is unchanged. The administrator must use passkey sign-in or the single-use recovery-code flow.
- Commit `4e4359d559c5672c4473bf57f3bd6f349b6ec6df` updates the four administrator passkey management routes in `server.js` to authorize both `admin` and `system_admin`, matching the roles already accepted by `src/platform/webauthn.js`. Ownership remains scoped to the authenticated user's identity in the service layer.

### Required evidence still outstanding

The code changes above have **not** been validated by a test run in this environment. Do not mark the port accepted until these are run on the resulting branch head:

1. Integration test: an enforced administrator cannot obtain a session through password login; the response is `403 PASSKEY_REQUIRED`, an audit event is persisted, and a non-admin/member can still log in normally.
2. Passkey lifecycle: recent-auth requirement; cross-account enrollment rejection; expired/reused challenge rejection; invalid origin/RP ID/signature rejection; revoked credential rejection; concurrent sign-counter protection; last-passkey revocation prevention; one-time recovery-code consumption; restricted recovery session cannot access ordinary routes before credential setup.
3. Authorization: `admin` and `system_admin` can manage only their own passkeys; other roles and unauthenticated callers are denied. Verify this with real HTTP requests against a disposable PostgreSQL database.
4. Registration and email: challenge missing/incorrect/expired/replayed, reference persistence, email token expiry/replay, resend invalidation, required-email login/session gate, provider failure and retry behavior.
5. Migrations: run the migration runner against both a clean disposable database and a disposable legacy schema with an explicitly chosen baseline; rerun to verify checksum enforcement and idempotent ledger behavior. Do not run these migrations against production as part of this PR.
6. Full suite: `npm test`, configured web build, browser workflows, and controlled email delivery using test credentials. Record exact SHA and results; a missing CI run is not a pass.

No tests, build, database migration, browser run, or live email delivery are claimed as passed by these commits. Keep PR #3 open and draft until the above evidence is recorded and remaining failures are fixed without relaxing assertions.


## Registration, challenge, shared rate-limit, and security-test follow-up — 15 October 2026

Additional implementation commits on this branch:

- `e0bb54c42e620413fb5a47b66f3bf0ce891cdc69`: removes the process-local limiter from human-challenge issue, registration, and login entry points where the shared PostgreSQL limiter already applies.
- `0fd7ce018eea7c7beb98fe91f29f6e3fdee63da8`: adds persistent database limits to the remaining public inquiry, sharing-audience, access/consent, and one-time-session redemption routes. Existing local throttles were retained as defense in depth; they are not the cross-instance control.
- `ad23759926a9333a53fcd350be6c00ecd4a0243b`: changes the rate-limit identity bucket to be independent of source IP, so changing IP addresses cannot reset per-account/per-email limits. Keeps identifiers hashed in storage. Also ensures subtraction challenges do not require negative answers, improving compatibility with numeric-only mobile keyboards.
- `630fb252cf60ca398dfd691089126af0d8734c26` and `ad3732d26957481a0e9f12addffc0855f9042787`: add test cases for expired challenges, missing-token registration rejection before account creation, unauthorized passkey enrollment, revoked passkey rejection, persisted human-readable registration references, email verification/replay, cross-IP persistent identity limits, and numeric-keyboard-compatible challenges. The email-verification assertion now matches the API's `EMAIL_VERIFICATION_REQUIRED` contract.
- `38ecf32435ef880fa52b62a62986a584db6b624d`: adds persistent limits to public inquiry history/details/update/link endpoints, including per-inquiry identity buckets.

### Important remaining UI integration gap

The registration page already displays the registration reference in the email-verification-required branch. Inspection found that the immediate-success branch does not retain/render `registrationReference`, even though the API returns it. An attempted edit to `web/app/register/page.tsx` was blocked by the repository editing tool's safety checks and was not committed. **Do not mark the human-readable reference requirement fully closed until the success page displays the returned reference and a UI test verifies it.** The API persistence test is not a substitute for user-visible display.

### Test and integration status

These are committed test additions, not test results. I could not clone the repository in the execution environment because GitHub DNS/network access was unavailable. No Node test suite, browser tests, web build, database migration, multi-process load test, or live email delivery test was executed here. No green CI run was found for the inspected commit. Do not infer passing status from committed tests.

Remaining acceptance work:
1. Correct the registration success UI to display the returned registration reference when email verification is disabled, then add a UI regression test.
2. Run `node --test test/platform/security-auth.test.js test/platform/security-route-contract.test.js` (if the route-contract file is present) and the complete `npm test` suite against a disposable PostgreSQL database with migrations applied.
3. Run actual HTTP integration tests for unauthenticated enrollment, cross-account enrollment, revoked passkey authentication, recovery-session route bypass attempts, challenge replay/expiry, and production registration with missing/invalid/replayed challenge tokens. Source/service tests alone do not establish route-level acceptance.
4. Validate rate limits across two separately running API instances sharing the same database, including identity-bucket enforcement when requests use different source IPs. Confirm reverse-proxy configuration overwrites forwarded headers before enabling `TRUST_PROXY=true`.
5. Exercise configured email delivery, provider failure, resend invalidation, expiry/replay, and verification-required login/session enforcement using a controlled test sender.

Keep PR #3 open and draft until those remaining checks are completed and their results are recorded against the exact branch-head SHA.

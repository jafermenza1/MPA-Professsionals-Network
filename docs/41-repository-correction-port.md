# Repository correction port — 15 October 2026

## Purpose

The recent implementation work was authored against the wrong repository, `Jafermenza/ET-Professionals-Network`. This branch ports the compatible changes into the intended repository, `jafermenza1/MPA-Professsionals-Network`, without replacing the existing MPA implementation or rewriting its history.

## Source and destination anchors

- Source branch: `reconciliation/holistic-gates`
- Source head reviewed: `3685817b428615f24f2fdf90c497c7bc9a254d1b`
- Destination branch used as the starting point: `reconciliation/holistic-gates`
- Destination starting SHA / PR #3 head: `d919d3f94b2eb9ba593b70b7c8763ffbd027bdd4`
- Port branch: `port/et-network-correction-2026-10-15`

The source compare range contains 126 commits and a 29-file net diff. Because the repositories have divergent implementations and different route/service layers, the original commits cannot be transplanted as-is without importing unrelated history or overwriting MPA-only work. This branch uses an additive/semantic port instead.

## Ported areas

- Additive security controls, administrator WebAuthn/passkey service, verification-token service and email operations service.
- Additive migrations for persistent security controls, administrator passkey state/recovery, email operations and audience templates.
- Administrator email operations and security pages, verification page, related E2E/unit test files and operator documentation.
- Email operations API endpoints with current database-role authorization, persistent rate limiting on registration/login, bounded background outbox dispatch and environment examples.
- Existing MPA registration flow preserved and extended with professional/organization choice, password confirmation, organization draft preservation for 24 hours, and no visible account UUID.
- Existing organization workspace preserved and extended to restore the organization draft and show human-readable application reference, last update and next action.
- Existing application tracking status labels clarified; existing username/password login retained and extended with passkey sign-in/recovery and email-verification resend controls.
- Organization registration/review, job application submission, service request and proposed mentorship match events enqueue audience-template notifications.

## Safety boundaries

- This is a port branch based on the existing PR #3 head. No force-push, history rewrite, merge, deployment or production migration was performed.
- Existing MPA-specific registration, membership, account-recovery, organization workspace and marketplace implementations were retained rather than replaced with divergent source files.
- Do not apply the new migrations to production as part of this port.
- Email delivery is not established by a queued message. Configure a verified sender and provider secrets, then verify delivery and inbound-webhook configuration in a controlled environment.
- The copied verification/passkey functionality and cross-service email integrations still require review against the MPA schema and API contract.

## Validation status

**NOT VALIDATED.** No test suite, TypeScript check, lint, production build, migration application/rerun, browser journey, or provider-delivery test has been run for this port. The branch must remain a draft and must not be merged or deployed until those checks pass and any schema/API mismatches are resolved.

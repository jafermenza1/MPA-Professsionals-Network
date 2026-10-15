# First Increment — Workflow and Notification Routing Corrections

**Status: implementation committed; validation intentionally not run.**  
**Branch:** `reconciliation/holistic-gates`  
**PR:** [#3](https://github.com/jafermenza1/MPA-Professsionals-Network/pull/3)

## Objective

Correct the first increment of the MPA PWA/action-center roadmap before adding installability or offline behavior. The action center must reflect persisted workflow transitions, target currently eligible recipients, and leave authorization and decision-making to the existing domain APIs and review queues.

## Changes in this increment

- Membership reviewer recipient queries now require active accounts while retaining the existing role/permission checks.
- Membership application submission and review/correction/payment notifications include persisted event identifiers or transition versions where available, so a later review cycle is not silently deduplicated as the original event.
- Verification reviewer alerts target active users with the established reviewer roles or `verification.manage` permission. Reviewer assignment eligibility also checks active account status.
- Verification status-change notifications include transition/request context for deduplication.
- Organization verification reviewer alerts target active authorized reviewers. Organization verification submission records its persisted submission timestamp as the event version.
- Organization review decisions notify only active organization owners/administrators and an active creator account, with the persisted review timestamp included so a later review cycle is not suppressed.
- Service-listing and mentor-offer moderation alerts include the persisted submission version for each review cycle.
- Draft organization registration no longer creates a reviewer-queue notification. Reviewers are notified when the organization verification case is actually submitted, preserving the existing review queue as authoritative.
- Service/mentor moderation, mentorship support, and service finance reviewer recipient queries exclude inactive accounts while retaining existing role/permission checks.
- Recruitment notifications resolve organization team recipients and offer approvers against active accounts; service provider notifications resolve active organization teams or active individual providers.
- Resubmitted service listings and mentor offers include their persisted update version to allow a later moderation cycle to generate a new actionable notification.

## Invariants preserved

1. No new workflow state machine, review queue, messaging system, or notification ledger was introduced.
2. Notifications are still created through the shared notification policy or existing `queueWorkflowEmail` boundary on the domain transaction connection.
3. Notification links remain internal and do not grant access; destination APIs continue to enforce authorization.
4. Organization-scoped notifications remain limited to the relevant organization membership.
5. Critical account-security alerts and existing notification preferences retain their current policy.
6. Events/learning modules, external chat, SMS, push delivery, payment gateways, and PWA/offline support are not claimed as implemented.
7. No test, build, migration, or browser validation was run as part of this increment. Acceptance remains open until the repository's required manual validation is explicitly authorized and executed against the exact head.

## Required acceptance evidence

- Verify recipient selection for active/inactive users, role removal, permission removal, reassignment, and organization membership removal.
- Verify membership correction/re-review and repeated payment/reconciliation cycles generate one notification per real transition, not one per retry.
- Verify organization draft creation does not alert reviewers, while actual submission does; verify correction/resubmission alerts again.
- Verify service/mentor moderation resubmission alerts again after a distinct persisted cycle.
- Verify notification action destinations lead to existing queues and each destination rejects unauthorized users.
- Verify notification writes roll back with the associated domain transition and that duplicate request retries remain idempotent.
- Run the existing tests, manual API checks, browser journeys, and regression suite only under the repository's documented validation policy; record exact command, environment, SHA, and results.

## Next increment

After this workflow-routing increment is accepted, implement the PWA shell and installability as a separate increment. Do not combine service-worker caching with unresolved workflow authorization or notification-routing defects.


## Increment 2 — Installable PWA foundation

**Status: implementation committed; validation not run; acceptance open.**

The installability foundation is layered onto the existing Next.js App Router application and existing provider service-worker registration. It does not replace the application shell or introduce a separate client runtime.

- The web manifest declares the MPA app identity, standalone display, root scope/start URL, brand theme colors, and existing MPA SVG brand assets.
- Root metadata links the manifest and provides mobile web-app metadata while retaining the current favicon behavior.
- The existing service worker uses versioned cache names, best-effort shell precaching, activation cleanup, and client claiming. It caches only the public root shell and public brand/fingerprinted static assets.
- API, authentication, account, dashboard, admin, notification and other workflow paths are excluded from service-worker caching/interception. Non-GET requests are never intercepted. Private forms and changing user data are not queued for background replay.
- Navigation is network-first. If a navigation fails, the worker serves the cached public root only for a small public path allowlist; otherwise it returns a minimal no-store offline response that explains the connection requirement. This is not a claim that arbitrary pages or workflows work offline.
- The existing responsive shell now shows network state and install guidance, handles the browser install prompt where available, detects installed display mode, and provides browser-specific manual install instructions.
- Existing desktop and mobile navigation, account session behavior, notification action center and domain workflow queues are preserved.

### Safety and acceptance boundaries

1. The PWA is not an offline-first data application. No private API responses, auth tokens, account records, notification contents, drafts, review decisions or payment data are intentionally cached.
2. No Background Sync, offline mutation queue, push notification delivery, chat, media cache, events/learning, Moodle/calendar integration or payment integration is included.
3. The worker's cached root is public shell content only. Users must reconnect before attempting protected workflows; cached UI is never authorization.
4. Browser installability depends on HTTPS, browser support, deployment headers and platform-specific requirements. SVG icon support differs by browser/platform; dedicated PNG and Apple touch icons remain a compatibility follow-up if required by device testing.
5. **No tests, build, migration, service-worker browser test or offline/installability check was run.** Increment 2 is committed code, not accepted evidence. Validate the exact branch head before marking this increment complete.


## Increment 3 — Offline organization-registration drafts (implemented, not accepted)

**Status: implementation committed; tests/build/browser validation not run.**

This increment deliberately chooses one workflow: the organization-registration draft on `web/app/register/page.tsx`. It implements local draft persistence and conflict-safe recovery, not automatic account-creation replay or broad background synchronization.

- Organization form fields autosave to the existing same-device local storage key after a short debounce. The draft has schema version 2 and a 24-hour expiry; expired or malformed drafts are discarded.
- The previous draft format is migrated into the allowlisted v2 shape when it is still within its expiry window.
- Draft restoration includes representative name/email and organization details, but always clears password and password-confirmation fields. The draft allowlist does not include passwords, challenge answers, challenge tokens, session tokens, or uploaded evidence.
- The UI exposes save/retry, clear, last-saved status, and storage-error feedback. If another tab writes a newer draft, the current tab pauses autosave and requires the user to choose the newer saved version or keep the current edits. No silent merge occurs.
- Saving or restoring a draft never calls the registration API. Creating the representative account still requires an explicit online submit and a fresh server-issued human-check token. No service-worker queue, Background Sync, or automatic replay was added.
- Added static contract tests in `test/platform/pwa-registration-draft.test.js` for the allowlist, TTL/schema, restore secret-clearing, explicit conflict choices, and separation of local persistence from account creation. These tests were not executed.

### Safety and sync boundary

The browser draft is local-only and can contain representative/organization contact details. It is not encrypted application storage; use a trusted device, clear it when finished/shared-device use is expected, and do not put secrets or private verification evidence into it. Clearing the draft removes this app's local key only. No server synchronization is claimed: account creation and subsequent organization submission remain separate online operations, governed by existing server authorization and review queues. A timeout during account creation must not trigger blind replay; users should use existing login/email-verification recovery paths before attempting registration again.

### Required acceptance evidence

1. Test draft save/restore across reload and offline/online changes, including old-schema migration, expiry, malformed local data, blocked storage and quota errors.
2. Test two tabs editing the same draft: conflict appears, autosave pauses, and each explicit choice preserves the intended version without silent merging.
3. Assert password/password-confirmation/challenge fields are absent from local storage before and after restoration.
4. Verify offline submit does not create an account; reconnecting never auto-submits; explicit submission requires a fresh challenge.
5. Simulate registration request timeout after server commit and confirm UI does not auto-replay or claim account creation failed with certainty; verify the documented login/verification recovery path.
6. Run the new Node contract tests, production build and browser journeys on the exact head, then record SHA and results. Until then, this increment remains unaccepted.

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
- Organization review decisions notify only active organization owners/administrators and an active creator account.
- Draft organization registration no longer creates a reviewer-queue notification. Reviewers are notified when the organization verification case is actually submitted, preserving the existing review queue as authoritative.
- Service/mentor moderation, mentorship support, and service finance reviewer recipient queries exclude inactive accounts while retaining existing role/permission checks.
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

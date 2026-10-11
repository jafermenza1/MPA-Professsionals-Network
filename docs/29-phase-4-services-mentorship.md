# Phase 4 — Services and Mentorship

## Objective

Create two member-to-member value networks without duplicating Phase 2 talent or verification semantics:

1. members can publish service offers and receive controlled service requests;
2. verified professionals can offer mentorship;
3. mentees can request, match, accept, schedule, complete and give feedback through one auditable mentorship lifecycle.

The Phase 4 exit is:

> A member can offer a service and receive a request; a mentee can complete the mentorship lifecycle.

## Contract continuity

Phase 4 consumes:
- Phase 1 active membership and canonical user/person records;
- Phase 2 professional verification claims and talent visibility;
- platform audit and authorization;
- existing notification/file/payment abstractions where later workflow steps require them.

It does not create a second identity, membership, professional-verification or talent registry.

## Services

### Listing lifecycle

`Draft -> Published -> Paused -> Closed`

A published listing contains:
- title and plain-language description;
- service category;
- delivery mode;
- optional location;
- pricing model: free, fixed, hourly or quote;
- optional member/public visibility;
- optional active-request capacity.

An active membership is required to publish.

Publishing a service is not itself a professional verification decision or organizational endorsement.

### Service request lifecycle

`Requested -> Accepted -> In Progress -> Completed`

Alternative outcomes:
- Declined;
- Cancelled;
- Disputed.

Rules:
- requester and provider cannot be the same member;
- only an available published listing accepts requests;
- duplicate active requests are blocked;
- provider and requester are restricted to their own request;
- state changes are controlled and audited;
- request notes and requested time are retained.

## Mentorship

### Mentor eligibility

A mentor must have:
- active MPA membership;
- at least one verified professional claim from the existing Phase 2 professional eligibility set.

The mentor profile contains only mentoring information:
- headline/bio;
- expertise topics;
- languages;
- mentoring modes;
- maximum active mentees;
- visibility and availability.

The platform never copies private verification evidence, reviewer notes or sensitive vetting material into mentor profiles.

### Availability

Mentors publish recurring weekly availability with:
- day of week;
- start/end time;
- timezone.

Mentors can also record time-off periods.

A mentorship session cannot be scheduled outside published availability or inside a recorded time-off period.

### Matching

A mentee submits:
- goals;
- topics;
- preferred mentor (optional);
- preferred modes;
- preferred languages;
- preferred days.

The matching service ranks currently eligible mentors using explicit signals:
- preferred mentor;
- topic overlap;
- language overlap;
- mentoring-mode overlap;
- availability-day overlap;
- active-mentee capacity.

This is a recommendation/matching aid, not an autonomous governance or verification decision.

Only the mentee or authorized supporting/system staff may propose a match.

### Match lifecycle

`Proposed -> Accepted`

Alternative outcomes:
- Declined;
- Expired;
- Cancelled.

An accepted match creates exactly one mentorship relationship.

## Mentorship lifecycle

`Active <-> Paused -> Completed`

Alternative terminal state:
- Cancelled.

Both mentor and mentee may perform permitted lifecycle actions. Every transition is recorded in `mentorship_event`.

A mentee can therefore complete the full lifecycle without staff intervention:
1. create request;
2. inspect matches;
3. propose a mentor;
4. mentor accepts;
5. mentorship becomes active;
6. schedule sessions;
7. complete sessions;
8. complete mentorship;
9. submit final feedback.

## Sessions

Each session records:
- scheduled start/end;
- mode;
- location or meeting reference;
- agenda;
- status;
- completion notes.

Session lifecycle:

`Scheduled -> Completed`

Alternative outcomes:
- Cancelled;
- No Show.

Session scheduling is participant-only and availability-aware.

## Feedback

Feedback may be:
- session-specific after a completed session; or
- program-level after the mentorship is completed.

A participant cannot rate themselves. Feedback is separate from verification decisions and does not automatically create a professional verification claim.

## Privacy and Satr (Privacy/Confidentiality)

- service requests expose only the participants' request data;
- mentorship data is participant-scoped;
- public mentor/service discovery never exposes private verification evidence;
- matching uses controlled profile signals rather than private religious or sensitive profiling;
- audit records capture material state changes.

## Adl (Justice) and Amanah (Trust/Responsibility)

The workflow applies the platform's existing governance principles:
- explicit eligibility rather than hidden criteria;
- proportional matching signals;
- controlled state transitions;
- participant visibility into their own lifecycle;
- auditable decisions;
- no claim that service listing or mentorship itself proves professional qualification beyond existing verified claims.

## API surface

### Services
- GET /api/v1/services
- GET /api/v1/services/:id
- POST /api/v1/services
- PATCH /api/v1/services/:id
- POST /api/v1/services/:id/status
- POST /api/v1/services/:id/requests
- GET /api/v1/me/service-requests
- POST /api/v1/service-requests/:id/status

### Mentors
- GET /api/v1/mentors
- POST /api/v1/me/mentor-profile
- PATCH /api/v1/mentor-profiles/:id
- POST /api/v1/mentor-profiles/:id/status
- PUT /api/v1/mentor-profiles/:id/availability
- POST /api/v1/mentor-profiles/:id/time-off

### Mentorship
- POST /api/v1/mentorship/requests
- GET /api/v1/mentorship/requests/:id/matches
- POST /api/v1/mentorship/requests/:id/match
- POST /api/v1/mentorship/matches/:id/response
- GET /api/v1/mentorship/:id
- POST /api/v1/mentorship/:id/status
- POST /api/v1/mentorship/:id/sessions
- POST /api/v1/mentorship/sessions/:id/status
- POST /api/v1/mentorship/:id/feedback

## Acceptance conditions

1. Active member can create a service listing.
2. Active member can publish a service listing.
3. Another active member can discover and request the published service.
4. Provider receives the request through the participant request view.
5. Service request transitions are controlled and audited.
6. Mentor activation requires active membership and an existing eligible verified professional claim.
7. Mentor can publish weekly availability and time-off.
8. Mentee can create a mentorship request with explicit goals and preferences.
9. Matching ranks eligible mentors using explicit profile/availability signals.
10. Private verification evidence is not copied into mentor/matching data.
11. Mentor can accept a proposed match and exactly one mentorship is created.
12. Mentor and mentee can schedule sessions only while the mentorship is active.
13. Session scheduling respects mentor availability and time-off.
14. Sessions have controlled completion/cancellation/no-show states.
15. Mentorship can move through active/paused/completed/cancelled lifecycle with audit history.
16. Session feedback requires a completed session; program feedback requires completed mentorship.
17. A participant cannot submit self-rating.
18. CI migration, tests and smoke test pass before Phase 4 is accepted.

## Data model

Migration:
- `db/migrations/011_phase4_services_mentorship.sql`

Service implementation:
- `src/services-mentorship/service.js`

The implementation uses PostgreSQL transactions for material lifecycle changes and the existing audit foundation.

## Non-goals

Phase 4 does not:
- invent a payment gateway;
- imply professional verification from service publication;
- expose private Phase 2 evidence;
- replace human governance with automated matching;
- create a separate professional directory;
- make religious or sensitive profiling a matching criterion.

## Outcome hardening addendum

Phase 4 now goes beyond connection to controlled delivery and outcome acceptance.

### Services

A service request can capture scope, price, currency and delivery deadline. Providers can define milestones and submit delivery evidence. Requesters can accept or request revision. The provider submits completion, but final completion requires requester acceptance. Paid services additionally require successful payment verification before final acceptance.

Service feedback is available after completion.

### Mentorship

Mentorship can contain explicit goals with success measures, target dates, owner roles and outcome states. Sessions also capture outcomes and next steps. This distinguishes a completed relationship from an achieved goal.

### Outcome principle

The platform treats:
- discovery as discovery;
- matching as matching;
- payment as settlement;
- delivery as delivery;
- acceptance as acceptance;
- feedback as feedback;
- verification as verification.

No one of these is silently substituted for another.

Additional implementation is in migration 012 and the outcome APIs documented in docs/30-phase-2-4-business-outcome-audit.md.

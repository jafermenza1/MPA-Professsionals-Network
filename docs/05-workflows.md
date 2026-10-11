# Business Workflows

## 1. Membership application

1. User creates account.
2. User starts membership application.
3. Draft application is created.
4. Required profile fields/evidence are completed.
5. Applicant submits.
6. System validates completeness.
7. Reviewer receives task.
8. Reviewer approves, rejects or requests correction.
9. If approved and fee exists, payment becomes due.
10. Payment provider processes payment.
11. Confirmation is reconciled.
12. Membership becomes Active.
13. Membership number/status is issued.
14. Notification is sent.
15. Audit event is recorded.

Correction creates explicit correction items. The applicant sees the exact field/document and reviewer comment, fixes it and resubmits. Previous decisions remain in history.

## 2. Annual renewal

1. Scheduler identifies upcoming expirations.
2. Configured reminders are sent.
3. Member opens renewal.
4. Current data is presented for confirmation.
5. Changed information is updated.
6. Fee is calculated from membership plan.
7. Payment is initiated.
8. Provider confirms.
9. Payment is reconciled.
10. New renewal period is activated.
11. Receipt and confirmation are sent.

Historical membership periods are never overwritten.

## 3. Professional verification

1. Member submits a verification claim.
2. System determines required evidence.
3. Evidence is uploaded.
4. Case enters review queue.
5. Reviewer examines evidence.
6. Reviewer records decision.
7. Approved claim becomes verified until expiry/revocation.
8. Profile reflects verified state.
9. Member receives decision notification.

## 4. Organization verification

1. Organization creates account.
2. Required organizational information/evidence is submitted.
3. Reviewer validates.
4. Organization becomes Verified, Rejected or Correction Required.
5. Authorized organization users are linked.
6. Verified organization receives approved stakeholder privileges.

## 5. Public job

Organization creates -> moderation if required -> publish -> public discovery -> application -> candidate workflow -> close.

Application states: Draft, Submitted, Screening, Shortlisted, Interview, Offer, Accepted, Rejected, Withdrawn, Hired.

## 6. Exclusive vetted job

Organization creates job -> defines eligibility -> MPA moderation -> publish -> eligibility evaluation -> eligible members apply -> employer processes candidates.

Ineligible users receive an appropriate explanation without revealing confidential internal rules.

## 7. Professional service

Member creates listing -> moderation -> publish -> stakeholder request -> provider accepts/declines -> service request progresses -> outcome recorded.

The first release does not require an escrow/payment marketplace unless separately approved.

## 8. Mentorship

Mentee defines objective -> submits request -> eligibility -> matching -> mentor receives request -> accept/decline -> both confirm -> active mentorship -> goals -> sessions -> progress -> completion/closure -> feedback.

## 9. Event registration

User opens event -> eligibility/capacity check -> registration -> optional payment -> confirmation -> calendar option -> attendance.

## 10. Event rescheduling

Authorized organizer changes date/time/venue -> system records old/new values -> event version increases -> registrations remain attached -> impacted users are notified -> calendar sync is triggered -> users can accept updated calendar data -> refunds/actions are generated if policy requires -> audit is recorded.

The change must never happen silently.

## 11. Moodle

User authenticates through MPA -> SSO to Moodle -> learning occurs in Moodle -> enrollment/completion events synchronize -> MPA stores normalized learning/certification records -> failures enter retry queue -> administrators can see integration health.

## 12. Project lifecycle

Draft -> Review -> Approved -> Fundraising/Preparation -> Active -> Monitoring -> Completed -> Closed.

Projects may also be Suspended or Cancelled.

## 13. Donation

Donor selects project/cause -> donation intent -> payment -> provider confirmation -> donation success -> allocation -> receipt -> project totals update -> donor notification.

## 14. Field evidence

Field officer opens assigned project -> creates visit -> captures findings/evidence -> uploads files/photos -> records metadata -> if offline, local queue -> online synchronization -> server validation -> review -> correction/accept/reject -> approved evidence becomes project evidence.

## 15. Offline synchronization

Every offline operation needs a client UUID, timestamp, operation type and synchronization state. Conflict policy must be entity-specific. Financial records must never use blind last-write-wins.

## 16. Notification lifecycle

Business event -> preference check -> template -> channel delivery -> provider result -> delivery record -> retry/dead-letter when appropriate.

## 17. Audit principle

Record the event that caused a state change, not only the resulting state. Include actor, previous value, new value, reason and timestamp where appropriate.

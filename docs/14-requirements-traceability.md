# Requirements Traceability and Delivery Matrix

## Purpose

Every important requirement must be traceable from product intent to implementation, test and release.

## Traceability chain

Product objective -> requirement -> domain entity/workflow -> API/UI -> permission -> test -> acceptance -> release.

## Core matrix

| Requirement | Domain | Main users | Critical tests |
| --- | --- | --- | --- |
| Account | Identity | All | registration, login, recovery |
| Membership | Membership | Members/admins | application, approval, payment, renewal |
| Profile | Profile | Members | visibility, update, search |
| Verification | Verification | Members/reviewers | case lifecycle, evidence, checklist, decision, response, appeal |
| Talent registry | Talent | Members/orgs/public | verified eligibility, search/filter, privacy projection, visibility, saved searches |
| Jobs | Jobs | Job seekers/orgs | publish, apply, eligibility |
| Services | Services | Members/orgs | listing, request |
| Mentorship | Mentorship | Mentors/mentees | match, sessions, completion |
| Events | Events | All | registration, capacity, reschedule |
| Moodle | Learning | Members/admins | SSO, enrollment, completion |
| Projects | Projects | Members/orgs/operations | lifecycle, permissions |
| Donations | Donations/Payments | Donors/admins | payment, allocation, receipt |
| Field evidence | Operations | Field/review | offline, sync, inspection |
| Notifications | Platform | All | preferences, delivery, retry |
| Audit | Platform | Admin/reviewers | sensitive transitions |

## Release traceability rule

A release cannot be declared complete when a requirement exists without:
- implementation reference;
- test coverage;
- acceptance result;
- known limitation if incomplete.

## Change traceability

When a business rule changes:
1. update requirement;
2. update workflow/domain model;
3. update API contract if affected;
4. update tests;
5. record decision;
6. include migration if data semantics changed.

## Risk classification

High risk:
- payments;
- membership activation;
- identity/verification;
- private documents;
- permissions;
- donation allocation;
- project financial data.

Medium risk:
- jobs;
- mentorship;
- events;
- learning synchronization.

Lower risk:
- public content;
- visual changes;
- non-critical reporting.

High-risk changes require explicit security and regression testing.


## Phase 3 traceability

| Requirement | Implementation |
|---|---|
| FR-007 Jobs | Migration 009, organization/jobs service, public job routes, job lifecycle and applications |
| Organization registration/verification | organization, organization_verification_case, organization_verification_evidence and reviewer workflow |
| Organization users | organization_membership with scoped roles and server-side organization authorization |
| Public jobs | published verified-organization jobs are publicly discoverable |
| Exclusive jobs | exclusive visibility plus implicit active-membership and professional-verification requirements |
| Eligibility engine | centralized evaluateEligibility() with controlled rule vocabulary |
| Applications | job_application, application events, attachments and contracted candidate state transitions |
| Privacy | safe profile/eligibility snapshots; no Phase 2 private evidence copied into applications |


## Phase 4 traceability

| Requirement | Implementation |
|---|---|
| Service listings | Migration 011, service listing lifecycle and member-owned service API |
| Service requests | service_request + service_request_event, participant authorization and controlled transitions |
| Mentor profiles | mentor_profile with active-membership and verified-professional eligibility |
| Availability | mentor_availability and mentor_time_off with session-time enforcement |
| Matching | explicit goals/preferences, topic/language/mode/day scoring and capacity checks |
| Mentorship lifecycle | mentorship_request, mentorship_match, mentorship and audited lifecycle transitions |
| Sessions | mentorship_session with controlled state and availability-aware scheduling |
| Feedback | mentorship_feedback with completed-session/program gates and self-rating prevention |
| Privacy | no private verification evidence copied into services, mentor or mentorship records |

## Phase 2-4 outcome hardening traceability

| Requirement | Implementation |
| --- | --- |
| Talent opportunity bridge | migration 012, talent_inquiry, consent-based response and optional contact release |
| Candidate offer consent | migration 012, candidate-owned application response and offer terms |
| Service delivery outcomes | migration 012, milestones, deliveries, requester acceptance and feedback |
| Service settlement | service_payment plus existing payment_transaction/payment_verification foundation |
| Mentorship outcomes | mentorship_goal plus session outcome/next-step fields |
| Outcome audit | audit events for inquiry, offer, delivery, payment and goal changes |


## Phase 3 comprehensive job portal traceability

| Capability | Implementation |
| --- | --- |
| Internal vacancy | job.posting_scope=organization_internal with discovery/application enforcement |
| Partner/network vacancy | job.posting_scope=partner_network |
| MPA-member vacancy | job.posting_scope=mpa_members |
| Requisition/headcount approval | job_requisition |
| Hiring team collaboration | job_team_member |
| Screening | job_screening_question + job_application_answer |
| Candidate notes | job_application_note |
| Interviews | job_interview + participants |
| Structured evaluation | job_interview_scorecard + job_interview_feedback |
| Offer governance | offer fields + offer_approval_status |
| Candidate consent | candidate-owned offer response |
| Saved jobs | job_saved |
| Job alerts | job_alert |
| Referrals | job_referral |
| Vacancy outcomes | job_outcome |
| Progress inspection | candidate progress, job dashboard, organization recruiting dashboard, stakeholder outcome workspace |

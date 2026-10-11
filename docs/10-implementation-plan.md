# Implementation Plan

## 1. Strategy

Build vertical slices. Each phase must produce working business value rather than isolated database tables or screens.

## Phase 0 — Foundation

Repository, environments, CI, database, authentication, authorization, logging, audit foundation, file storage abstraction, notification abstraction and payment abstraction.

Exit: deployable application, protected endpoint, migrations, tests, structured logging and no secrets committed.

## Phase 1 — Identity and Membership

Account, person, profile, membership application, review, correction, payment, activation, renewal, history and notifications.

Exit: a real user can register, apply, be reviewed, pay, become active and renew.

## Phase 2 — Verification and Talent Registry

Verification cases, configurable verification programs/checklist snapshots, evidence metadata and secure file references, reviewer workspace, claim-level decisions, response/appeal controls, professional talent profile, directory, search/filter, saved searches and visibility controls.

Exit: an organization-ready consumer can find an active eligible verified professional through the canonical talent registry without seeing private evidence, reviewer notes or confidential verification material. Phase 3 organizations consume this registry rather than create a second talent directory.

Implementation:
- Migration 006: verification case/evidence/decision/response/appeal/reference/concern model and verification roles.
- Migration 007: structured professional profile, reference-linked attributes, experience and explicit directory visibility.
- Verification service: case lifecycle, evidence, checklist results, claim verification, decisions and appeals.
- Talent service: privacy-safe profile projection, verified eligibility search, filters and saved searches.
- Server routes: member profile/visibility, talent discovery and reviewer workspace.
- Acceptance: see docs/27-phase-2-verification-talent-registry.md.

## Phase 3 — Organizations and Jobs

Organization registration/verification, scoped organization users, full job portal/ATS, internal and partner vacancies, centralized eligibility, candidate applications, screening, interviews, structured evaluation, offer approval/acceptance and outcome analytics.

Implementation:
- Migrations 009-010: organization identity/verification, scoped organization memberships, jobs, eligibility rules, applications, attachments, events and hardening.
- Migration 012: candidate offer-consent hardening.
- Migration 013: requisitions, vacancy scopes, compensation/headcount, hiring teams, screening questions, answers, notes, interviews, scorecards, saved jobs, alerts, referrals, explicit vacancy outcomes and offer approval.
- Organization/jobs service: requisition governance, job lifecycle, scope-aware discovery, eligibility, screening, candidate pipeline, collaboration, interviews, scorecards, offers and outcome reporting.
- Server routes: public/network job discovery, organization job workspace, requisitions, hiring team, screening, interviews, scorecards, saved jobs/alerts, referrals, candidate progress, recruiting dashboards and outcome workspaces.
- Acceptance: see docs/28-phase-3-organizations-jobs.md.

Exit: a verified organization or authorized partner can govern and publish the appropriate vacancy scope; an eligible stakeholder can discover/apply; hiring teams can progress candidates through structured human-led recruitment; candidates can inspect their own progress; authorized organization stakeholders can inspect pipeline and vacancy outcomes.

## Phase 4 — Services and Mentorship

Service listings, service requests, mentor profiles, availability, matching, mentorship lifecycle, sessions and feedback.

Exit: member can offer a service and receive request; mentee can complete mentorship lifecycle.

## Phase 5 — Events and Calendar

Event management, registration, attendance, ICS, provider abstraction, rescheduling and notifications.

Exit: attendee remains linked after rescheduling and receives updated information.

## Phase 6 — Moodle and Certification

Course bridge, SSO, enrollment, completion sync, certificate records and monitoring.

Exit: user can access Moodle through approved SSO and completion appears in MPA.

## Phase 7 — Projects, Volunteers and Donations

Projects, participants, volunteers, donations, payment reconciliation, progress and public updates.

Exit: project can receive donation with auditable project/financial record.

## Phase 8 — Field Evidence and Inspection

Field visits, evidence, offline queue, sync, inspection workflow, correction and publication.

Exit: intermittent connectivity does not prevent field data capture and central review.

## Phase 9 — Intelligence

Recommendations, talent matching, analytics, stakeholder insights and impact dashboards only after sufficient real data exists.

AI must not replace verification or governance decisions.

## 2. Release rules

Each phase requires requirements, UX, data model, API contract, implementation, automated tests, security review, acceptance tests, migration plan and operational documentation.

## 3. Issue labels

type:feature
type:bug
type:security
type:technical-debt
area:membership
area:verification
area:jobs
area:mentorship
area:events
area:learning
area:projects
area:payments
area:platform

## 4. Definition of Ready

Problem is clear, acceptance criteria exist, dependencies are known, permissions are identified, data impact is identified and UI/API impact is identified.

## 5. Definition of Done

Implementation complete, migrations complete, tests pass, authorization tested, errors handled, audit behavior implemented where required, documentation updated, CI passes and reviewer approves.

## 6. Sequencing rule

Do not start with the dashboard. Build domains and workflows first; dashboard screens should visualize real business states.

## Outcome hardening after Phase 4

Before advancing to later phases, Phases 2-4 receive an outcome hardening layer:
- Phase 2 opportunity inquiry and consent-based contact release;
- Phase 3 candidate-owned offer acceptance;
- Phase 4 service scope, milestones, delivery, payment settlement and acceptance;
- Phase 4 mentorship goals and measurable outcomes.

This preserves the vertical-slice rule: workflows should create observable business value, not merely database state transitions.

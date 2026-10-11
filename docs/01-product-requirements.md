# Product Requirements Document

## 1. Purpose

This PRD defines what ET Professionals Network must accomplish, who it serves, the problems it solves, functional requirements, constraints, measurable outcomes and release boundaries.

This is a product contract. Technical design must satisfy these requirements unless an approved architecture decision changes them.

## 2. Product definition

The platform combines:
1. Membership management.
2. Professional identity and profile management.
3. Verification and vetted talent discovery.
4. Mentorship management.
5. Public and member-exclusive jobs.
6. Professional service listings and stakeholder requests.
7. Events and calendar synchronization.
8. Learning access through Moodle integration and certification records.
9. Community projects, volunteering, donations and evidence.
10. SMS, email and in-app communications.
11. Payments, initially Telebirr.
12. Administration, governance, audit and reporting.

The platform must not represent a population-size vision as an actual product metric. Metrics must be based on real registered, active and verified users.

## 3. Objectives

### Objective A: make membership valuable

Active members should receive recurring practical value:
- professional identity;
- verified status where applicable;
- opportunity access;
- exclusive jobs;
- mentorship;
- events;
- learning;
- professional service visibility;
- project participation;
- volunteering;
- achievement history.

### Objective B: make MPA useful to organizations

Organizations should be able to:
- find talent;
- request professionals;
- publish jobs;
- publish events;
- request services;
- request mentors/trainers;
- propose projects;
- recruit volunteers;
- sponsor projects;
- collaborate with MPA.

### Objective C: create trust

The platform must distinguish self-declared information, submitted evidence, verified information, active membership, expired membership, organizational verification and project evidence.

### Objective D: create measurable impact

Important activities must leave useful records: membership, payments, applications, mentorship, course completion, event attendance, project participation, volunteer service, evidence and donor contributions.

## 4. Personas

Professional/member: wants a credible profile, opportunities, development and meaningful participation.

Non-member job seeker: wants public job discovery and application.

Mentor: experienced professional offering structured mentoring.

Mentee: person with goals who requests and completes mentoring.

Employer/organization: needs talent, recruitment, services, events or collaboration.

Project volunteer: contributes time or expertise.

Donor/project participant: funds or supports projects and needs reliable information.

Field/operations officer: captures project visits, evidence, findings and beneficiary observations.

Reviewer/administrator: validates applications, documents, payments, profiles, organizations and decisions.

## 5. Functional requirements

### FR-001 Identity

A user account is separate from membership status. A user may exist before becoming a member.

Support registration, login, logout, verification, security management, notification preferences, consent and account status.

### FR-002 Membership

Maintain a complete lifecycle:
Draft -> Application Submitted -> Under Review -> Correction Required -> Approved -> Payment Pending -> Active -> Renewal Due -> Grace Period -> Suspended -> Expired -> Cancelled.

Store membership number, type, status, start/end dates, fee, payment records, application history and status history.

Annual renewal must be automated through reminders and payment workflow.

### FR-003 Professional profile

Support identity, education, experience, skills, professional categories, certifications, languages, location, portfolio, services, availability, career interests, mentoring preferences and project interests.

Fields must have explicit visibility.

### FR-004 Verification

Verification is a workflow, not a boolean edited by an administrator.

A verification case contains subject, claim, evidence, reviewer, decision, reason, expiry and audit history.

### FR-005 Vetted talent

Search and filter by profession, sector, skill, experience, location, availability, verification and membership. Never expose private evidence documents.

### FR-006 Mentorship

Mentor profile, expertise, availability, capacity, active mentees, sessions and history.

Mentee goal, topic, request, match, sessions, progress and feedback.

States: Draft, Requested, Matching, Proposed, Mentor Accepted, Mentee Accepted, Active, Paused, Completed, Cancelled, Declined.

### FR-007 Jobs

Two channels: public jobs and exclusive vetted jobs.

Public jobs may accept non-members. Exclusive jobs may require active membership, verification, qualification, experience or other configured rules.

Job states: Draft, Pending Review, Published, Paused, Closed, Archived.

Application states: Draft, Submitted, Screening, Shortlisted, Interview, Offer, Accepted, Rejected, Withdrawn, Hired.

### FR-008 Professional services

Members may list services subject to moderation. Store provider, category, description, skills, service area, delivery mode, availability, portfolio, optional price/rate and visibility.

Stakeholders may submit service requests.

### FR-009 Events

Support visibility, venue/online location, organizer, time, capacity, registration, attendance, optional fees, calendar export, ICS and rescheduling.

Rescheduling must preserve registration unless policy says otherwise.

### FR-010 Learning

MPA owns course discovery and learning records. Moodle owns learning execution. Support SSO, enrollment, completion and certification records.

### FR-011 Projects

Support identity, objective, location, budget, funding, team, volunteers, partners, milestones, progress, evidence, inspections, beneficiaries and public updates.

### FR-012 Donations

A donation must be tied to a project or approved cause. Store donor, amount, currency, provider, provider reference, payment state, allocation and receipt.

Never mark a donation successful from a browser redirect alone.

### FR-013 Field evidence

Capture project visit, time, location, photos, documents, findings, beneficiary observations and follow-up actions.

### FR-014 Notifications

Central notification service supports in-app, email and SMS. Business modules publish events rather than implementing provider-specific delivery logic.

### FR-015 Payments

Payment abstraction initially supports Telebirr and must permit future providers.

States: Initiated, Pending, Confirmed, Failed, Cancelled, Refunded, Reconciled.

### FR-016 Administration

Administration covers users, organizations, membership, verification, jobs, services, mentorship, events, courses, projects, donations, payments, notifications, configuration, audit and reports.

## 6. Non-functional requirements

Security: least privilege, secure sessions, encryption in transit, protected documents, audit logging, rate limiting and secret management.

Reliability: critical workflows must be transactional and recoverable.

Performance: common workflows must remain responsive as data grows.

Accessibility: keyboard usable, readable and mobile friendly.

Localization: support Ethiopian context, ETB, phone formats, geography, timezone and future local-language support.

Observability: structured logs, metrics, errors and integration health.

## 7. MVP

Prioritize account, membership, profile, verification, payment, renewal, directory, jobs, organizations and notifications.

Mentorship, services, events, learning and projects follow after the membership foundation is stable.

## 8. Success metrics

Track membership conversion, active membership, renewal, verified profiles, job applications, successful hiring where measurable, service requests, mentorship matches/completion, event attendance, learning completion, project participation, volunteer participation, donor repeat rate and stakeholder retention.

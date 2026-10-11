# Phase 3 — Organizations and Jobs

## Objective

Provide a verified organization workspace and a controlled employment workflow that consumes the Phase 2 canonical talent registry. Organizations do not create a second talent directory.

The Phase 3 exit is:

> A verified organization can publish and manage candidates, and an eligible member can apply to an exclusive job.

## Organization lifecycle

Organization identity is separate from platform user identity and organization authorization.

1. Authenticated user registers an organization.
2. The creator becomes the scoped owner.
3. A verification case is created.
4. Organization evidence is attached through secure file references.
5. Organization submits verification.
6. Authorized reviewer records verified, correction_required or rejected.
7. Only verified organizations can publish jobs.
8. Public visibility is enabled only after verification.

Organization roles are scoped to an organization: owner, administrator, recruiter, project_manager, event_manager, finance, read_only.

A role on one organization never grants access to another organization.

## Organization verification

Organization verification is a business workflow and is not inferred from the organization's name or email domain.

Verification decisions are audited with reviewer, reason and timestamp. Verification evidence remains private. Required evidence types are admin-configurable by organization type; the platform does not hard-code one document set for every Ethiopian entity. Depending on entity type and applicable law, configuration can require items such as registration/legal-existence evidence, authorization to represent the entity, TIN, business/trade licensing or sector-specific authorization.

The existing Phase 2 reviewer authorization model is reused for organization verification; a separate organization-verification evidence store prevents private organizational material from entering the talent registry.

## Jobs

Job lifecycle:

Draft -> Published -> Paused -> Closed -> Archived

A job has organization, title and description, employment type, work mode, location, optional versioned occupation/industry references, public/exclusive visibility and application deadline.

Only verified organizations may publish jobs.

Public jobs are discoverable without exposing private organization verification evidence. Exclusive jobs remain discoverable, but application is controlled by the eligibility engine.

## Eligibility engine

Eligibility is evaluated centrally in src/organization-jobs/service.js.

Supported rules:
- active membership;
- verified professional status;
- specific verified claim;
- occupation;
- industry;
- education level;
- qualification type;
- field of study;
- minimum experience;
- availability;
- location.

For exclusive jobs, the system automatically requires active MPA membership and at least one eligible professional verification claim from the Phase 2 professional eligibility set.

Organizations may add further rules.

The engine returns a decision and safe reasons. It does not expose private verification evidence, reviewer notes or confidential rule material.

## Applications

Application lifecycle:

Draft -> Submitted -> Screening -> Shortlisted -> Interview -> Offer -> Accepted -> Hired

Alternative terminal states: Rejected, Withdrawn.

The organization may manage candidate state only for applications to its own jobs.

Each application stores a safe profile snapshot and eligibility snapshot so later profile changes do not rewrite the historical application record.

Private verification evidence is not copied into an application.

Applicants may attach application documents through file references. Organizations receive only the application documents intentionally attached to that application.

## Privacy and separation of duties

- Organization permissions are scoped by organization_membership.
- Recruiters cannot access another organization's candidates.
- Candidate management does not grant verification-review permissions.
- Organization verification reviewers cannot automatically manage the organization's jobs unless separately authorized.
- Public job discovery does not expose private verification material.
- Eligibility failures return a general safe explanation.
- Critical state changes are audited.

## API surface

### Organization
- POST /api/v1/organizations
- GET /api/v1/organizations
- GET /api/v1/organizations/:id
- POST /api/v1/organizations/:id/verification-evidence
- POST /api/v1/organizations/:id/submit-verification
- POST /api/v1/organizations/:id/users
- GET /api/v1/organizations/:id/users
- PATCH /api/v1/organizations/:id/users/:userId
- POST /api/v1/review/organizations

### Jobs
- GET /api/v1/jobs
- GET /api/v1/jobs/:id
- POST /api/v1/jobs
- PATCH /api/v1/jobs/:id
- POST /api/v1/jobs/:id/publish
- POST /api/v1/jobs/:id/status
- GET /api/v1/jobs/:id/eligibility
- POST /api/v1/jobs/:id/apply
- GET /api/v1/jobs/:id/candidates
- POST /api/v1/jobs/:id/candidates/:applicationId
- GET /api/v1/me/job-applications
- POST /api/v1/job-applications/:id/attachments

## Acceptance conditions

1. Organization registration creates an organization and scoped owner membership.
2. Verification evidence is private and reviewable only through authorized workflow.
3. Required organization evidence is checked against the configured organization-type policy before submission.
4. Unverified organizations cannot publish.
5. Verified organization users can create and publish jobs.
6. Public jobs can be discovered without authentication.
7. Exclusive jobs have explicit eligibility rules, including the default active-membership + professional-verification boundary.
8. Eligibility is evaluated by one service rather than duplicated in routes.
9. Ineligible members cannot submit an exclusive application.
10. Eligible members can submit an exclusive application.
11. Organization users can view and manage candidates only for their own organization jobs.
12. Candidate status transitions are controlled and audited.
13. Application snapshots preserve the information used at submission time.
14. Private Phase 2 verification evidence is never copied into job/application records.
15. CI migration, tests and smoke test must pass before Phase 3 is accepted.

## Contract continuity

Phase 3 consumes Phase 1 account/person/membership records, Phase 2 professional profile and canonical talent eligibility, Phase 2 verification claims, versioned reference portfolio, platform audit and secure file abstractions.

It does not duplicate membership, verification, talent-directory or reference-data semantics.

## Outcome hardening addendum

Recruitment now separates employer action from candidate consent. An organization can issue an offer with amount, currency and terms, but cannot mark the candidate as accepted. The candidate must explicitly accept the offer or withdraw.

Additional implementation:
- migration 012: offer fields and timestamps;
- organization/jobs service: candidate-owned offer response;
- route: /api/v1/job-applications/:id/respond;
- audit: offer acceptance and withdrawal.

The hired state remains an employment outcome marker, not a substitute for later contract, onboarding, payroll or HR workflows.


## Comprehensive job portal / ATS layer

Phase 3 is intentionally a **job portal plus applicant tracking system**, not only a job-posting table.

The design follows established ATS patterns: requisition/intake and approvals, structured hiring, screening questions, team-specific permissions, interview scheduling, scorecards, candidate collaboration, offer approval/acceptance, saved jobs/job alerts, referrals and pipeline/outcome analytics. Current ATS guidance from Greenhouse and Workable emphasizes these capabilities as the shared workspace connecting recruiters, hiring managers, interviewers, candidates, HR and leadership.

### Vacancy and posting scopes

A verified organization can create:
- public vacancy;
- MPA-member vacancy;
- organization-internal vacancy;
- partner-network vacancy.

An organization-internal vacancy is visible/applicable only to active members of that organization. MPA-member and partner-network scopes require authenticated eligible network participation. Direct application attempts are subject to the same scope enforcement; hiding a job in search is not treated as a security boundary.

### Requisition-to-posting

A vacancy can begin as a requisition with:
- headcount;
- justification;
- department;
- employment/work mode;
- location;
- compensation range;
- target start date.

The requisition is submitted and approved before it is used as a governed job posting.

### Full candidate lifecycle

The portal now supports:
1. requisition;
2. job drafting;
3. structured job requirements;
4. publication;
5. discovery/search/filter;
6. saved jobs;
7. job alerts;
8. direct application or draft application;
9. screening questions/knockout rules;
10. centralized candidate pipeline;
11. team collaboration and notes;
12. referral;
13. interview scheduling and participant responses;
14. structured interview scorecards;
15. human feedback;
16. shortlist/interview decisions;
17. offer creation;
18. offer approval where an approver is assigned;
19. candidate acceptance/withdrawal;
20. hired outcome;
21. explicit vacancy outcome recording;
22. reporting and funnel analytics.

AI is deliberately not a hidden hiring decision-maker. Any future AI assistance must expose reasoning, remain reversible and leave the final advancement/rejection decision with authorized humans.

### Stakeholder progress visibility

The system now exposes:
- candidate application progress;
- interview schedule and responses;
- organization job inventory;
- per-job funnel;
- upcoming interviews;
- offers and accepted offers;
- hires;
- requisition status;
- explicit vacancy outcomes;
- organization recruiting dashboard;
- cross-workflow stakeholder outcome workspace.

The candidate sees only their own application progress. Organization users see only jobs/candidates within their authorized organization scope. Job-team roles receive only the permissions required for their assigned work.

### Outcome model

The platform distinguishes:
- vacancy created;
- vacancy published;
- application received;
- candidate screened;
- interview completed;
- offer issued;
- offer approved;
- offer accepted;
- hire recorded;
- vacancy filled/partially filled/cancelled/expired/reopened.

This makes business progress observable without exposing another actor's private evidence or internal notes.

### Reference model

Occupation, industry, geography and education-related requirements continue to use the existing configurable reference portfolio. The job portal does not introduce a second hard-coded classification system.

### Ethiopia-facing job portal considerations

The public job-portal pattern also reflects local expectations: Ethiopian job seekers commonly expect keyword/category/location/career/employment-type discovery, job alerts, CV/profile-based application and application tracking. Ethiojobs currently exposes those discovery and tracking patterns and advertises ATS capabilities including screening questions, advanced applicant filtering, recruitment-process management and reporting/analytics.

### Acceptance expansion

Phase 3 is not accepted as complete unless the release verifies:
- verified organization can create and govern a vacancy/requisition;
- authorized organization users can collaborate on the job;
- internal, member and partner scopes are enforced at both discovery and application;
- applicants can save jobs and configure alerts;
- required screening questions block incomplete applications;
- candidate pipeline can be progressed by authorized staff;
- interviews can be scheduled and responded to;
- interviewers can submit structured scorecards;
- offers can require internal approval;
- candidates control acceptance/withdrawal;
- candidate and organization stakeholders can inspect progress;
- organization can inspect funnel and vacancy outcomes;
- all sensitive actions are audited;
- migration, tests and smoke CI pass.

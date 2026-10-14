# 38 — Required Product Rules and Functional Requirements Addendum

**Effective:** 2026-10-14  
**Status:** Binding product requirements for implementation planning; not evidence of implementation completion  
**Authority:** This addendum extends `docs/01-product-requirements.md`. If a pre-existing screen or implementation contradicts these requirements, record the gap and implement a reviewed, backward-compatible correction. Do not silently weaken the rule.

## 1. Role and identity boundaries

### FR-017 — Separate Organization and Professional profiles
Organization accounts use an organization profile/workspace. An account acting exclusively under the Organization role must not create, edit, or access the professional profile at `/profile`, by direct URL or API. Organization identity, verification, staff/team, listings, jobs and candidate data remain organization-scoped. Enforce in the UI, route handling, and server-side authorization.

### FR-018 — Non-member capability boundary
Non-members may browse public content, register, submit job-interest requests, request services, and join permitted published service/mentorship demand topics. Non-members may not edit the member professional profile, publish service listings, or publish mentor offers. Explain the membership gate at the point of use and enforce it on the server.

### FR-019 — Membership activation and validity
A membership becomes active only after the configured fee is confirmed as paid and the required authorized administrator/finance approval is recorded. Basic/regular membership validity defaults to one year. Authorized administrators can configure membership types, fees, currency, duration, benefits, eligibility and renewal policy. Historical applications/payments retain the plan and fee version applied at submission. Expiry and renewal must affect eligibility consistently and be audited.

## 2. Professional information and reference data

### FR-020 — Structured education and configurable fields
Education is a repeatable structured record containing education level, school/institution, field of study, qualification/degree where applicable, and year/date information. The following vocabularies must be admin-configurable and selectable in all applicable forms: nationality, occupation, industry, field of study, years-of-experience ranges, languages, qualifications, education level, institutions and qualification types.

### FR-021 — Reference-data import/export and “Other”
Authorized admins can import and export reference datasets using CSV. Imports provide preview, column mapping, validation, duplicate detection, error reporting and all-or-nothing commit behavior. Preserve stable IDs/codes, version history and audit records. A field offering “Other” reveals a validated custom text field; custom text does not overwrite a selected reference ID. Forms use active published values and historical records preserve the original reference meaning.

### FR-022 — Gender field
The UI label is “Gender” and the permitted values are exactly “Male” and “Female” for this requirement. Apply consistently across forms, validation and exports. Any data migration must be reviewed and non-destructive.

### FR-023 — Traceable portfolio
A professional can create multiple portfolio records with title, type/category, description, claimed URL, related skill or profession, optional dates, visibility and optional private evidence. The interface distinguishes a user-supplied claim/link from MPA-verified evidence. Private evidence follows the private file contract.

## 3. Services, mentorship, and unmet-demand workflows

### FR-024 — End-to-end service marketplace
Eligible members and verified/authorized organizations can create service listings. Listings follow Draft → Submitted for Review → Published → Paused/Needs Correction/Rejected/Archived as configured. Published listings support discovery, service requests, provider response, agreement, delivery, requester acceptance/dispute, completion/cancellation, feedback and audit history. Non-members cannot publish provider listings.

### FR-025 — Service demand intake and public interest assessment
Members and organizations can request a service that is not listed. The request enters a private MPA Support Desk queue. Staff may clarify, categorize, merge duplicates, identify existing providers, reject with reason, retain internally, or publish a privacy-safe generalized demand topic. Users can join a published topic and record a per-topic interest/readiness level. The platform tracks unique interest, optional comments and relevant aggregate dimensions. Staff can convert demand into provider search, listing, program/project, or a documented no-action outcome. A demand topic is not a confirmed service contract.

### FR-026 — Mentorship offers, requests, and demand assessment
Eligible members can publish mentor offers with expertise, topics, capacity, availability and delivery preferences. Members can submit a private unmet mentorship need to MPA Support Desk even when no mentor is currently listed. Staff may publish a generalized privacy-safe demand topic. Interested members can join and specify topic/goals and interest/readiness level. Offer, demand topic, individual mentee request, confirmed match, active relationship, sessions and completion remain separate states. The end-to-end relationship supports mentor response, mentee acceptance, sessions, progress, completion, feedback, cancellation and audit.

### FR-027 — Organization service and mentorship capabilities
Organizations can publish eligible service listings; request services for their own needs; submit general service needs for MPA to match; request mentorship/training; join permitted published demand topics; and track review, matching, delivery and outcomes. Organization requests are private until authorized publication. Organization data remains scoped to that organization and its authorized team.

## 4. Job-seeker demand without a matching vacancy

### FR-028 — Job-interest request and consented employer sharing
Members and non-members can submit a job-interest request even when no matching vacancy exists. The request captures target roles, skills, experience range, preferred location/work mode/employment type, availability and optional introduction; existing profile information is reused where permitted. Requests are private to the applicant and MPA Support Desk by default.

Before sharing with employers or publishing a candidate-interest summary, obtain explicit informed consent identifying the audience and fields shared. The user can revoke future sharing. Private contact details and verification evidence are excluded by default. Employers can express interest or request contact through MPA. Applicants can view sharing history. The workflow must not imply an existing vacancy, guaranteed employment, or a successful placement. Support Desk can analyze aggregate demand without exposing identities.

## 5. Reports, analytics, and exports

### FR-029 — Configurable reporting
Provide a permission-scoped report catalogue with filters, date ranges, grouping, measures, saved views and optional scheduling. Initial reports cover membership and renewal; fees/payments; claims/verification; organization verification; jobs/applications; job-seeker demand and consent; service listings/requests/demand; mentorship offers/requests/matches/completion; support desk queue; reference-data import quality; and relevant in-scope programs.

Reports include definitions, applied filters, generation time, totals and data-quality notes. Provide readable, branded PDF and Excel (.xlsx) downloads; CSV may be provided for raw analysis. Enforce row/organization/role scope on the server and audit sensitive report generation/downloads. Aggregated reports must not expose personal records or small-group identities without authorization. Totals must reconcile to source records; do not invent outcome metrics.

## 6. Homepage and interaction feedback

### FR-030 — Live professional-network homepage
The homepage displays current published data from featured services, jobs, professional discovery, mentorship offers and published service/mentorship demand topics. Every section uses the same publication, consent, visibility and eligibility rules as its marketplace. Each section handles loading, empty, partial API failure and retry independently. No private or unapproved records or invented counts may appear. Use bounded/paginated feeds and responsive accessible controls.

### FR-031 — Consistent form and notification behavior
Every save, submission, request, error and state transition produces truthful, clear feedback and an appropriate next action. Success shows what was saved/submitted and a reference/status. Validation errors identify the field and preserve other input. Recoverable failures retain input and provide Retry; repeated failure provides a support path. Pending/correction/rejection states explain the reason and next permitted action. Do not report payment, publication, match, job submission or membership activation until the server confirms it. Important transitions are available in status history and use configured notification channels without duplicate sends.

### FR-032 — Low-effort accessible forms
Forms use clear section cards, high-contrast headings, concise explanations, responsive two-column layouts for related short fields on desktop and one column on narrow screens. Long text, uploads, errors and summaries span full width. Advanced options use progressive disclosure. Managed vocabularies use searchable selectors/autocomplete; skills/languages use multi-select chips; education, experience, credentials and portfolio use repeatable structured cards. “Other” reveals a text input where allowed. Reuse existing data with authorization, avoid unnecessary repetition, label required fields, explain sensitive-data use, and preserve inputs on recoverable errors.

## 7. Cross-cutting acceptance rules

Every FR in this addendum requires:
- server-side authorization and positive/negative tests for each role;
- explicit state transitions, persistence, idempotency and audit history for consequential actions;
- privacy checks for UI, API, search, homepage, notifications and exports;
- success, empty, validation, correction, retry and failure tests;
- mobile and keyboard accessibility review;
- a manual acceptance record tied to the exact commit SHA.

A requirement is not complete because it is documented, because an endpoint exists, or because the build succeeds. Use `docs/37-specific-product-gap-audit.md` as the implementation gap register and update `docs/31-workflow-reconciliation-matrix.md` with actual screen/API/service/persistence evidence as changes land.

# 37 — Specific Product Gap Audit: Roles, Workflows, Forms, and Marketplace

**Date:** 2026-10-14  
**Status:** Actionable product gap register; implementation and acceptance remain pending  
**Applies to:** `main`  
**Related contracts:** [Product requirements](01-product-requirements.md), [roles and permissions](04-roles-and-permissions.md), [workflow contract](05-workflows.md), [API contract](07-api-contract.md), [security and privacy](08-security-privacy.md), [reference portfolio](19-configurable-reference-portfolio.md), [workflow reconciliation matrix](31-workflow-reconciliation-matrix.md), [manual release policy](36-manual-test-release-and-deployment-policy.md).

## 1. Purpose and evidence rules

This document records specific product gaps found by inspecting the current repository's screens, services, contracts, and workflow matrix. It is not a claim that every route or workflow was executed in a browser. “Observed” means the inspected code or contract exposes the stated behavior. “Gap” means the required user-facing behavior is absent, incomplete, or not demonstrated by the inspected implementation. “Acceptance pending” means the change must be proved with tests before it can be called complete.

Do not close a gap because a database column, API route, service function, or design document exists. Close it only when the user can complete the workflow, data persists, authorization is enforced server-side, errors are recoverable, and acceptance evidence is recorded for the exact commit.

## 2. Strict identity, role, profile, and membership rules

These rules are mandatory product invariants, not optional UX preferences.

### GAP-001 — Organization identity is mixed with professional identity
**Observed:** the platform has separate organization resources and a professional profile route, but the required account-role boundary is not expressed as a single explicit user-facing rule across onboarding, navigation, routes, and API authorization.

**Required behavior:**
- An account acting exclusively as an Organization must use an organization profile, not a professional profile.
- An Organization-role account must not be able to open, edit, or create a professional profile through `/profile`, direct URLs, API calls, or stale browser state.
- Organization profile information, team membership, verification evidence, jobs, and candidate data must remain organization-scoped.
- If the product later permits one human to hold both organization and professional identities, that must be an explicit supported multi-role account model with separate profile contexts; do not infer it from an Organization role.
- Unauthorized direct navigation must return a safe forbidden/redirect experience, not expose professional data or a broken blank screen.

**Acceptance:** test the Organization role against the UI, route handlers, profile API, and cross-organization resource IDs. Test both allowed organization profile actions and denied professional-profile actions.

### GAP-002 — Non-members must not edit the member professional profile or publish services/mentorship
**Required behavior:**
- Non-members may register an account, browse public content, search public jobs, submit a job-interest/request record, request a service, and join a published mentorship/service demand request where policy permits.
- Non-members must not create or edit the member professional profile, publish a professional service, or offer mentorship.
- The UI must explain the membership requirement and provide a clear “View membership options” next action; it must not simply hide the feature with no explanation.
- The server must enforce this rule for direct API calls, not just disable buttons.
- A user who becomes an active member should be guided back to the profile completion or provider-onboarding step without losing prior permitted requests.

**Acceptance:** test non-member and active-member accounts for every relevant UI and API operation, including direct URL/API attempts.

### GAP-003 — Membership is not active until fee and approval conditions both pass
**Required invariant:** a membership is active only when the configured fee for the selected plan has been paid and confirmed, and an authorized administrator or finance reviewer has approved the membership/payment according to the configured policy. A submitted receipt or a browser redirect is not proof of payment. A membership application marked “approved” but unpaid must not grant active-member privileges.

**Required behavior:**
- Persist plan, amount, currency, fee-rule version, payment reference, payment evidence reference if supplied, payment state, reviewer, decision reason, and membership validity dates.
- Do not permit active-member-only actions until all required conditions pass.
- Corrections, rejected payments, duplicate payment callbacks, repeated submissions, refunds, and reversals must have defined states and audit history.
- Display “Payment submitted—awaiting review” separately from “Payment confirmed” and “Membership active.”

**Acceptance:** verify paid/unpaid, unapproved/approved, invalid reference, repeated request, correction, refund/reversal, and expired membership paths.

### GAP-004 — Basic/regular membership lasts one year
**Required behavior:** the basic/regular membership product has a configurable one-year validity period by default. Activation sets the start date and a validity end date one year later using the configured calendar/date policy. Renewal creates a traceable renewal transaction and does not silently rewrite historical terms. Expiry removes active-member-only permissions according to policy.

**Acceptance:** test initial activation, leap-year/date boundaries, renewal, expiry, reminders, and authorization after expiry.

### GAP-005 — Membership types and fees must be editable by authorized administrators
**Observed:** the reference-portfolio contract already defines configurable membership products and fee rules, but the end-to-end administrative workflow must be verified rather than assumed from the data model.

**Required behavior:** authorized admins can create, edit, activate, deactivate, and schedule membership types, fee amounts, currency, duration, benefits, eligibility, grace period, and renewal rules. Changes require audit history and effective dates. Existing applications and payments retain the plan/fee version they were created under. Public and member forms must use the current active published options, not hard-coded fees.

**Acceptance:** change a test plan/fee in admin, confirm the form updates, and confirm historical applications retain their original fee terms.

## 3. Professional profile and configurable reference data

### GAP-006 — Education is not a structured repeatable record
**Observed:** professional profile UI includes free-text qualifications and a general skills/languages input; the requested education record is not presented as the full structured form below.

**Required behavior:** support multiple education records, each with:
- Education level (selectable/configurable);
- school/institution (searchable institution selector with an “Other” path);
- field of study (searchable, selectable, configurable reference);
- qualification/degree/title where applicable;
- start/completion year, including “currently studying” where applicable;
- optional explanation for non-standard cases;
- visibility choice consistent with the platform's privacy model.

Education must not be represented only as one unstructured summary paragraph. Existing free-text summary may be retained as an optional introduction, but it is not a replacement for structured records.

### GAP-007 — Reference values are typed manually instead of selected consistently
The following fields must be backed by admin-managed reference datasets wherever applicable: nationality, occupation, industry, field of study, years-of-experience range, language, qualifications, education level, institution type, qualification type, and other shared classifications. The UI must provide searchable selectors or multi-selects appropriate to each field. Do not require users to know internal codes.

**“Other” rule:** every configurable/selectable field that supports “Other” must reveal a clearly labeled text input when “Other” is selected. The custom value must be validated, stored without overwriting the reference ID, and handled consistently in search/reporting. Do not show an “Other” option for fields where arbitrary values would violate law or a defined business rule; document that exception explicitly.

### GAP-008 — Admin reference-data lifecycle is not proven end-to-end
The existing reference-portfolio contract describes versioned reference data and CSV/XLSX/JSON import/export. The admin UI and real form consumers must be validated.

**Required behavior:** authorized admins can create/edit/deactivate values, import and export CSV, preview and validate imports, map columns, detect duplicates and unknown parent codes, review errors before commit, preserve stable codes and version history, and audit who changed what and when. CSV import must not publish partial invalid datasets. Each consumer form must use active published values; historical records must retain the reference/version used at submission.

**Acceptance:** import a valid file, reject an invalid/duplicate file without partial writes, export the same dataset, change a label without changing historical meaning, and verify the updated value appears in every relevant form.

### GAP-009 — Gender label and allowed values must be corrected
The user-facing field label must be **Gender**, with exactly the allowed options **Male** and **Female** for this requirement. Do not display “Sex” as the field label or provide a third option in this field. Apply the same options in registration/profile/admin editing, validation, API schema, and any exports where this field is present. Preserve existing records safely; do not perform destructive data conversion without a reviewed migration and explicit recovery plan. If legal or safeguarding policy requires a separate sensitive-data policy, document it without silently changing this specified form rule.

### GAP-010 — Portfolio entries are not sufficiently traceable
**Required behavior:** users can add multiple portfolio items, each with a title, portfolio type, description, related skill/occupation, claimed portfolio URL, optional start/completion date, visibility, and optional supporting evidence attachment. Validate URL format and clearly distinguish “link supplied by user” from “evidence reviewed/verified by MPA.” Preserve created/updated timestamps and owner. Private evidence must use the private upload protocol and must never be exposed as a public file URL.

### GAP-011 — Skill and language entry relies on comma-separated text
**Observed:** the profile form explicitly asks for comma-separated skills and languages. This makes spelling, deduplication, filtering, and matching unreliable.

**Required behavior:** provide searchable suggestions and multi-select chips; permit a custom value through “Other” where appropriate; normalize aliases; prevent duplicate selections; allow users to remove items easily. Keep free text only as an optional explanatory note, not as the primary structured data representation.

## 4. Service marketplace and mentorship end-to-end workflows

### GAP-012 — Marketplace listings need full lifecycle and outcome management
The service screen and backend contain listing/request and provider/requester transitions. The product must consistently support the complete journey rather than stopping at a published listing or a request record.

**Required service listing lifecycle:** Draft → Submitted for Review → Published → Paused/Rejected/Needs Correction → Archived. Only eligible members and verified/authorized organizations may create provider listings. Admin publication is required where the listing policy says moderation is required.

**Required service request lifecycle:** Requested → Provider Review → Accepted/Declined → In Progress → Delivery Submitted → Requester Accepted or Disputed → Completed/Cancelled. Store participants, dates, agreed scope, delivery expectations, optional price/terms, messages/notes, outcomes, feedback, and audit history. Make state transitions idempotent and role-scoped.

**Marketplace discovery:** public service cards should expose category, provider identity and verification status, service area, delivery mode, availability, summary, price/rate when provided, portfolio links, and a clear request/join action. Do not expose private evidence or private request details.

**Acceptance:** provider and requester complete a test transaction end-to-end; unauthorized users cannot read or alter it; retries do not create duplicate requests; every status has a clear notification and next action.

### GAP-013 — New service demand and need assessment are missing as a complete public workflow
**Required behavior:**
1. A professional/member, organization, or other permitted stakeholder submits a request for a service that is not currently available.
2. The request is private to the requester and MPA Support Desk until reviewed.
3. Support Desk can clarify, categorize, merge duplicates, identify existing providers, and decide to reject, keep internal, or publish as a service-demand topic.
4. When published, the public demand page explains the need without exposing requester contact details or confidential information.
5. Interested users can press **“I’m interested” / “Join this demand”** and record an interest level for that specific demand (for example: exploring, interested, ready to participate, or ready to provide/support), plus optional comments and preferred delivery/location.
6. The system counts unique interested participants and aggregates interest by audience, location, category, and interest level for need assessment.
7. Participants can withdraw or update their interest; changes are audited and duplicate joins are prevented.
8. MPA Support Desk can convert validated demand into a service category/listing, provider search, project, mentorship initiative, or a documented no-action decision.
9. The requester and interested participants receive status updates and next steps.

Do not treat a demand submission as a published service, a confirmed contract, or proof that MPA can deliver the service.

### GAP-014 — Mentorship needs a provider lifecycle and a public demand/interest workflow
**Required behavior:**
- Eligible members can publish mentor offers with expertise, topics, language, delivery mode, capacity, availability, eligibility, and expected format; publication/moderation follows configured policy.
- A member can submit a private mentorship need/request to MPA Support Desk even when no matching mentor or program exists.
- Support Desk can review, clarify, categorize, merge duplicates, find existing mentors, and publish a generalized mentorship demand without exposing personal details.
- Interested members can join the published demand and record an interest level and relevant topic/goals.
- Mentorship demand must track unique interested people, topic, geography/language where relevant, delivery mode, and readiness level.
- A published mentor offer, a mentorship demand, a mentee request, a confirmed match, and an active mentoring relationship are separate concepts and must not be conflated.
- Confirmed mentoring follows the explicit request, mentor response, mentee acceptance, session, progress, completion and feedback lifecycle.
- Users can see the status and next action; sensitive personal goals and private session notes remain private to authorized participants.

### GAP-015 — Organizations need both service-provider and service-demand workflows
Organizations must be able to:
- publish their own service listings, subject to eligibility and moderation policy;
- request a specific service for their own use;
- submit a general service need to MPA Support Desk to find an appropriate provider;
- request mentorship/training for their staff or community;
- join and record interest in published service or mentorship demand topics where appropriate;
- track review, provider matching, proposals, acceptance, delivery, outcome and closure.

A generic organization request must not be silently treated as a public listing. Publishing a generalized demand requires admin review and privacy-safe wording.

## 5. Job-seeker demand and consent-based candidate visibility

### GAP-016 — Job seekers need a route when no suitable vacancy is listed
This is a priority employment-support requirement.

**Required behavior:**
1. Members and non-members can submit a job-interest request even when no matching vacancy exists.
2. The form asks for target occupation/job titles, skills, experience range, location, preferred work mode/employment type, availability, and a short optional introduction. It reuses profile data when available and avoids requiring a full professional profile from a non-member.
3. The request is private to the applicant and MPA Support Desk by default.
4. Support Desk can review, ask for corrections, categorize, group similar demand, and identify suitable organizations/employers.
5. The applicant must give explicit, informed consent before the request/profile summary is shared with employers or published to a candidate-interest marketplace. Consent must identify the intended audience and data fields to be shared; it must be revocable for future sharing.
6. The public or employer-visible version must exclude private contact details and sensitive evidence by default. The applicant chooses which contact method, if any, may be shared with a specific employer.
7. Employers/organizations can view consented candidate-interest summaries, express interest, request contact through MPA, or invite the applicant to a relevant vacancy. The workflow must not imply that an employer has a vacancy or that employment is guaranteed.
8. Applicants can see which employers or audience groups received their shared profile, when it was shared, and how to withdraw future visibility.
9. Support Desk can report aggregate job-seeker demand by occupation, skill, geography, availability, and experience without exposing individual identities.
10. Members and non-members receive status updates and a clear next action.

**Acceptance:** no employer or public user can access a private job-interest request before valid consent; revoking consent stops future discovery/sharing as defined by policy; audit history proves when and what was shared.

## 6. Reports, analytics, and downloadable outputs

### GAP-017 — Reporting is not defined as a configurable, end-to-end product capability
The platform needs basic analysis and professional reports suitable for a professional association and nonprofit organization, with optional business-oriented reporting. It is not enough to expose database counts or one-off admin tables.

**Required behavior:**
- Provide role-authorized report catalogue and configurable report definitions.
- Support filters, date ranges, grouping, dimensions, measures, sort order, saved views, and optional scheduled reports.
- Provide on-screen summary, tables, simple charts where appropriate, source/definition notes, generation time, and filters applied.
- Export decorated, readable PDF and Excel (.xlsx); CSV may be offered for raw analysis. Exports must include report title, organization/platform branding, generated date, applied filters, definitions, page numbers where appropriate, and totals.
- Use server-side authorization and row-level scope. An organization may see its own records only; members may see their own data; only explicitly authorized administrators may see cross-platform personally identifiable or financial details.
- Aggregate public-interest reports by default and suppress or limit small groups where re-identification risk exists.
- Record who generated or downloaded sensitive reports, when, and which report/filter scope was used.
- Long-running exports must show progress and recoverable failure states; do not silently return partial files.
- Support data quality checks, missing-value counts, trend comparisons, and report definitions that can be updated without duplicating business logic.
- Do not claim impact, employment placement, service success, donations or outcomes without persisted source records and explicit definitions.

**Initial report catalogue:** membership applications and active/expired membership; membership fees and payment reconciliation; professional claims and verification decisions; organization verification; job listings and application funnel; job-seeker demand and consent/sharing status; services and service-demand interest; mentorship offers/requests/matches/completion; events/learning/projects when in scope; support desk queue/response times; reference-data import quality; platform usage and audit activity. Sensitive report availability depends on role and purpose.

**Acceptance:** validate totals against source queries, verify tenant/role isolation, export PDF/XLSX with correct branding and filters, open the files in standard viewers, and prove unauthorized users cannot export other people's records.

## 7. Homepage and marketplace discovery

### GAP-018 — Homepage should be a live professional-network landing page
The homepage must not be a static promotional page or display invented counts. It should present current, published and permission-safe data from:
- featured services and service marketplace listings;
- open jobs and relevant job categories;
- public/consented professional-network discovery;
- mentorship offers and published mentorship-demand topics;
- published service-demand topics and opportunities to join;
- clear actions for job seekers, professionals, organizations, and people who need a service.

**Required behavior:**
- Each section is sourced from the same published data and eligibility rules as its corresponding marketplace page.
- Show loading, empty, partial failure and retry states independently per section; a failure in one feed must not blank the whole homepage.
- Display timestamps or meaningful “new/open” labels only when supported by stored data.
- Never show private profiles, private job-seeker requests, pending/unapproved listings, confidential organization details, or raw internal counts.
- Provide usable search and clear routes to jobs, services, mentorship, professionals, and demand requests.
- Responsive layout must work on mobile, tablet and desktop; controls need accessible labels and keyboard focus.
- Feed sections must have pagination or bounded results and sensible caching; the homepage must not load every record.

## 8. Form UX and interaction requirements

### GAP-019 — Forms expose technical concepts and unnecessary typing
**Observed examples:** profile skills and languages are comma-separated; professional verification includes claim codes and JSON claim details; organization type is free text; recruitment exposes raw user IDs and JSON scorecard configuration. These controls ask normal users to understand internal representations.

**Required rules:**
- Replace internal codes/JSON with task-specific labels and guided controls.
- Use searchable select/autocomplete for managed vocabularies, multi-select chips for multiple skills/languages, date pickers for dates, and repeatable cards for education, experience, credentials and portfolio.
- For a selected “Other” value, reveal and validate a text field.
- Use two columns for short related fields on desktop and one column on narrow screens. Long text, uploads, instructions, errors and review summaries span full width.
- Group related fields into high-contrast section cards with meaningful headings, short explanations and consistent spacing.
- Use progressive disclosure for advanced options and context-dependent fields.
- Mark required fields visibly, explain why sensitive fields are needed, show format examples, and avoid collecting data not needed for the task.
- Reuse profile/application data where authorized; ask only for missing or job-/claim-specific details.
- Preserve user-entered data when validation or a recoverable API request fails.

### GAP-020 — Submission, request, and error feedback is inconsistent or incomplete
Every consequential form action must yield a truthful, accessible, actionable response.

**Required behavior:**
- Success: say what was saved/submitted and provide a reference/status plus next action.
- Validation failure: identify the exact field, explain how to correct it, and retain other inputs.
- Recoverable network/API failure: state that the action was not confirmed, retain inputs, offer Retry, and provide a support path if repeated.
- Pending review: explain who reviews it and what the user can do while waiting.
- Correction required/rejected: show the reviewer's reason, the fields/evidence needing correction, and a resubmission action when permitted.
- Empty list: explain why no records appear and offer the next useful action.
- Unauthorized/expired state: explain how to sign in, request access, or renew membership without leaking protected information.
- Notifications must not claim payment confirmation, publication, matching, job application submission, or membership activation unless the server confirms that state.
- Use in-app status history and appropriate email/SMS notification preferences for important transitions; avoid duplicate notifications on retries.

## 9. Role-specific UX outcomes

### Non-member professional
Can register, browse public jobs/services/mentorship-demand topics, submit a job-interest request, request a service, and join permitted published demand topics. Cannot edit a member-only professional profile or publish services/mentor offers. Membership requirements and benefits are explained at the point of need.

### Member professional
Can maintain a structured profile, manage membership, submit claims/evidence, publish eligible service/mentor offers, request unmet services or mentorship, apply for jobs, manage their job-interest sharing consent, and track outcomes. Member status and verified claims are clearly distinguished.

### Organization
Uses a separate organization workspace and profile. Can manage authorized team members, verification, its service listings, service/mentorship needs, jobs, candidates and organization-scoped reports. Cannot use the professional profile route while acting solely under the Organization role.

### MPA Support Desk / platform administrator
Has a queue for membership, payments, claims, organizations, service demand, mentorship demand, job-seeker demand, and corrections. Can categorize, merge duplicates, request information, publish privacy-safe generalized demand, match providers/employers, make permitted decisions, and inspect audit history. Access is permission-scoped and all consequential actions are logged.

## 10. Definition of done

A gap is closed only when:
1. The relevant contract, API, service, schema/migration if needed, UI, and help text agree.
2. Role-positive and role-negative tests cover the rule.
3. State changes persist and audit history is correct.
4. Private data is not exposed in HTML, APIs, search, homepage feeds, exports, or logs.
5. Duplicate/retry, empty, validation, API failure, correction, and success paths are tested.
6. Keyboard and responsive form behavior are checked.
7. PDF/XLSX exports (where applicable) are opened and checked.
8. Manual acceptance evidence is recorded against the exact commit under the policy in [36-manual-test-release-and-deployment-policy.md](36-manual-test-release-and-deployment-policy.md).

## 11. Recommended delivery order

1. **P0 — Identity and business invariants:** organization/professional route separation; non-member restrictions; payment + approval gate; annual membership validity; editable membership products.
2. **P0 — Job-seeker demand and consent:** allow all eligible users to register interest without a vacancy; Support Desk triage; consented employer sharing.
3. **P1 — Structured profile and reference data:** education, configurable datasets, “Other” behavior, gender label/options, skills/languages, traceable portfolio.
4. **P1 — Service/mentorship marketplace and demand:** provider listings, requests, interest joins, moderation, outcomes, organization-specific workflows.
5. **P1 — Actionable form feedback:** notifications, retries, references, next actions and consistent status vocabulary.
6. **P2 — Reports and exports:** report catalogue, scope, PDF/XLSX generation, reconciliation and audit.
7. **P2 — Live homepage feeds:** published services, jobs, professional discovery, mentorship and demand topics with resilient loading/empty/error states.
8. **P3 — Validation and optimization:** manual role-separated E2E, accessibility/mobile checks, reporting reconciliation, restore and release evidence.

All priorities are product requirements. Priority labels do not authorize skipping security, privacy, data migration review, or acceptance testing.


### P2 implementation checkpoint — 2026-10-14

The first code increment includes a permission-filtered report catalogue, live report previews, PDF/XLSX exports, generation/export audit events, and bulk approved-member import/export using the existing membership import staging tables. The implementation state is **code committed, acceptance pending**; this does not close the gap. Tests, migration validation, role-negative access checks, reconciliation evidence, and opening the generated files in PDF/Excel-compatible clients remain required.


## P2 live homepage feeds checkpoint — 2026-10-14 (code committed, acceptance pending)

Added `web/app/live-network-feeds.tsx` and `web/app/live-network-feeds.module.css`, integrated below the homepage journey cards in `web/app/page.tsx`. Five independent, bounded public feeds now request published services, public jobs, opt-in professional discovery, approved public mentors, and published service/mentorship demand topics. Each feed has its own loading skeleton, empty-state language, failure message, retry action and contact-support path; one API failure does not replace or block other sections. Feed copy is written for people first—what is available, who may help, where help is needed and what to do next—rather than promotional jargon. Layout adapts from two-column desktop cards to a single-column mobile experience, follows shared light/dark theme tokens, includes keyboard focus and reduced-motion behavior, and avoids invented counts or private demand details.

**Not yet validated:** no TypeScript check, production build, browser test, API-failure simulation, accessibility audit or current-head manual acceptance has been run. Confirm the actual route behavior for all five destinations, public/consent filtering in production data, partial failures, empty feeds, mobile widths and keyboard/screen-reader operation. The feed does not claim that displayed items are new, popular, verified beyond the underlying publication rules, or guaranteed to remain available after the response is loaded. Keep PR #3 draft/open and do not deploy or merge based on this code-only checkpoint.

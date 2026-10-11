# Phase 2 — Verification and Talent Registry

## Objective

Deliver the complete verification and talent-discovery vertical slice:

**Professional claim -> Verification case -> Evidence -> Review -> Decision -> Verified claim -> Privacy-safe talent registry -> Search/filter -> Eligible professional discovery**

The directory is a projection of approved business facts. It is not a window into verification evidence.

## Contract exit

An organization-ready consumer can find an eligible verified professional without seeing private evidence.

The organization domain is introduced in Phase 3; Phase 2 therefore provides the reusable authenticated talent registry/search contract that Phase 3 organizations will consume.

## Verification case workflow

1. Member or authorized reviewer opens a verification case against a configurable verification program.
2. Program and published checklist versions are snapshotted into the case.
3. The exact professional claim is recorded.
4. Evidence is attached with source, authenticity, relevance and confidentiality metadata.
5. Reviewer receives the case in the review workspace.
6. Reviewer records checklist results.
7. Reviewer verifies individual claims only after evidence/review.
8. Decision readiness checks required checklist results, verified claims and unresolved concerns.
9. Approval/partial verification creates a durable decision and makes only the approved claim eligible for directory projection.
10. Adverse decisions require member response before final closure.
11. Appeals are independently reviewed.
12. Every material transition is audited.

## Supported verification programs

The Phase 2 foundation supports:

- Identity Verification
- Professional Verification
- Enhanced Professional Vetting
- Leadership and Governance Vetting

The program/checklist design remains configurable by authorized governance users rather than hard-coded into the application.

## Evidence model

Evidence records distinguish:

- evidence type;
- source type;
- source name/reference;
- optional stored file;
- integrity hash;
- collection/expiry dates;
- authenticity status;
- relevance status;
- confidentiality level;
- uploader.

A document upload never automatically becomes a verified claim.

## Reviewer workspace contract

Reviewer APIs provide:

- queue/list with status/program/reviewer filters;
- case detail;
- claim list;
- evidence metadata;
- checklist results;
- decisions;
- references;
- concerns;
- appeals;
- assignment;
- controlled state transitions;
- checklist result recording;
- claim verification;
- reasoned decisions;
- appeal decisions.

Private evidence is available only to authorized verification staff. Directory endpoints never return evidence records.

## Talent profile

Professional profiles can now contain:

- professional title;
- headline;
- biography;
- years of experience;
- availability status;
- location label;
- directory summary;
- configurable occupation reference;
- industry reference;
- education level;
- qualification type;
- field of study;
- structured professional experience.

Reference selections are accepted only from published reference datasets and are stored by reference-item identity rather than copied classification text.

## Visibility model

A member controls:

- directory visibility;
- identity badge visibility;
- professional verification badge visibility;
- experience badge visibility;
- location visibility;
- experience visibility;
- contact visibility.

Default directory visibility is **off**.

A private profile cannot enter the talent registry.

## Eligibility rule

The registry only exposes active members who:

1. explicitly enabled directory visibility;
2. have directory-compatible profile visibility of members or public;
3. have an active membership;
4. have at least one explicitly verified professional claim.

Eligible verified claim types currently include:

- professional certification;
- education;
- employment;
- professional experience;
- service capability.

Identity verification alone is not treated as professional eligibility.

## Search/filter

The registry supports:

- free-text search;
- occupation;
- industry;
- education level;
- qualification type;
- field of study;
- availability;
- location;
- specific verified claim type;
- pagination.

Search results contain only directory-safe profile information and verification outcome metadata.

## Privacy guarantee

The directory does **not** expose:

- uploaded verification documents;
- evidence files;
- reviewer notes;
- evidence sources;
- internal checklist responses;
- adverse concerns;
- private case history;
- confidential reference responses;
- private contact information unless explicitly allowed by the visibility policy.

The detail endpoint likewise returns only the permitted professional projection.

This is the key Phase 2 privacy boundary:

**Discovery tells an organization why a professional is eligible; it does not reveal the private material used to establish eligibility.**

## Islamic values / governance controls

The workflow applies:

- **Adl (Justice/Fairness):** consistent criteria and reasoned decisions;
- **Tabayyun (Verification/Due diligence):** evidence before reliance;
- **Amanah (Trust/Responsibility):** least-privilege access and audit;
- **Sidq (Truthfulness):** separate self-declared and verified facts;
- **Satr (Privacy/Confidentiality):** private evidence remains private;
- **Rahmah (Mercy/Compassion):** correction and response before unnecessary exclusion;
- **Ihsan (Excellence):** quality and relevance rather than document-counting;
- **Shura (Consultation):** governance review for Shariah-sensitive policy;
- **Maqasid al-Shariah (Higher purposes):** legitimate purpose, proportionality and harm prevention.

## API surface

### Member

- PATCH /api/v1/me/talent-profile
- GET /api/v1/me/talent-visibility
- PATCH /api/v1/me/talent-visibility
- GET /api/v1/talent
- GET /api/v1/talent/:userId
- POST /api/v1/talent/saved-searches
- GET /api/v1/talent/saved-searches

### Verification

- POST /api/v1/verification/cases
- GET /api/v1/verification/cases/:id
- POST /api/v1/verification/cases/:id/consent
- POST /api/v1/verification/cases/:id/claims
- POST /api/v1/verification/cases/:id/evidence
- POST /api/v1/verification/cases/:id/response
- POST /api/v1/verification/cases/:id/appeal

### Reviewer

- GET /api/v1/review/verification/cases
- POST /api/v1/verification/cases/:id/assign
- POST /api/v1/verification/cases/:id/transition
- POST /api/v1/verification/cases/:id/decision
- POST /api/v1/verification/cases/:id/claim-status
- POST /api/v1/verification/cases/:id/check-results
- POST /api/v1/verification/appeals/:id/decision

All server-side role checks are mandatory.

## Data migrations

### 006_vetting_and_trust_framework.sql

Provides the complete case/evidence/decision/response/appeal foundation and verification roles.

### 008_phase2_consent_boundary.sql

Adds explicit consent timestamp/version and prevents consent-required programs from entering substantive verification before consent.

### 007_phase2_verification_talent.sql

Adds:

- structured professional profile fields;
- reference-linked profile attributes;
- professional experience;
- explicit talent-registry visibility;
- saved searches;
- directory/search indexes.

## Phase 2 hardening controls

The final Phase 2 boundary also enforces the following controls in the service layer:

- only the latest published checklist version for each configured claim type is snapshotted into a new case;
- every required checklist item must have an explicit passing or not-applicable result before a positive decision can be made; missing results are treated as incomplete;
- a claim cannot become verified without supporting evidence and without being in an active review/decision state;
- review actions are restricted to the assigned reviewer or a system administrator, and the subject cannot review or decide their own case;
- appeal decisions cannot be made by the original decision maker or the subject;
- a requested verified-claim filter is rejected unless the claim type is one of the approved professional eligibility types;
- registry claim counts and returned verified-claim labels are limited to professional eligibility claims, preventing unrelated verified facts from becoming directory metadata.

These controls operationalize **Adl (Justice/Fairness)**, **Tabayyun (Verification/Due diligence)**, **Amanah (Trust/Responsibility)** and **Satr (Privacy/Confidentiality)**. They are governance-oriented software controls, not a substitute for a qualified Shariah review. The International Islamic Fiqh Academy's published standards emphasize accuracy, objectivity, impartiality and documented evidence, while its core values include discipline, transparency and justice. urlIIFA Resolution No. 1https://iifa-aifi.org/en/34158.html urlIIFA Core Valueshttps://iifa-aifi.org/en/core-values

## Case-access and state hardening

The final case boundary also enforces:

- consent-pending cases cannot receive claims or evidence until the subject has consented;
- closed/withdrawn cases cannot be modified with new claims or evidence;
- case detail is authorized inside the service layer, not only in the HTTP route;
- members receive a reduced case projection and do not receive reviewer notes, confidential concerns, referee contact/response data, or private evidence metadata;
- reviewer-facing case detail remains available only to authorized verification roles;
- appeals are rejected when the governing verification program has appeals disabled;
- every decision requires a non-empty reason.

This prevents a client or alternate route from bypassing the same **Satr (Privacy/Confidentiality)**, **Amanah (Trust/Responsibility)** and **Tabayyun (Verification/Due diligence)** boundaries.

## Audit and security

Material actions are audited, including:

- case creation;
- case assignment;
- case transitions;
- claim creation;
- evidence attachment;
- claim verification;
- checklist results;
- decisions;
- member responses;
- appeals;
- appeal decisions;
- talent profile changes;
- visibility changes.

The system uses role-based server authorization. Client-side hiding is not considered authorization.

## Acceptance tests

Phase 2 is accepted only when all of the following are true:

- a case can be opened against a configured verification program;
- consent-required programs remain in consent_pending until the subject records consent;
- the applicable checklist version is snapshotted;
- a claim can be recorded;
- evidence can be attached without automatically verifying the claim;
- reviewers can see their case queue and case evidence metadata;
- required checklist failures/pending work block positive verification;
- unresolved concerns block positive verification;
- only explicitly verified professional claims qualify a professional for the registry;
- a member can turn directory visibility off;
- private profiles never appear in the directory;
- inactive members never appear in the directory;
- directory results contain no private evidence;
- private contact details are not exposed by default;
- appeal reviewers cannot decide their own case;
- all sensitive transitions are audited;
- CI migration and tests pass.

## Known Phase 3 dependency

Phase 3 will add organizations and organization users. It will consume the Phase 2 talent registry rather than create a second talent directory. Organization eligibility filtering must therefore use the same registry and verification semantics.

## Outcome hardening addendum

The talent registry is now also a controlled opportunity bridge. A verified professional can receive a talent inquiry without publishing private contact details. The professional may accept or decline and may explicitly release contact information after acceptance. Organization context is accepted only when the requester is actually an active member of that organization.

This preserves the registry boundary: private verification evidence remains private, while a verified professional has a practical path from discovery to an opportunity.

Additional implementation:
- migration 012: talent inquiry;
- talent service: create/list/respond/close inquiry;
- routes: /api/v1/talent/inquiries;
- audit: inquiry creation, response and closure.

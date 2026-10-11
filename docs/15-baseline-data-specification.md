# Baseline Data Specification

**Status:** Baseline / implementation contract
**Version:** 1.0
**Scope:** Ethiopia-focused professional association platform
**Decision:** Freeze reference data before transactional feature implementation.

## 1. Purpose

This document defines the minimum canonical data required to operate the platform coherently. It is a data contract, not a list of every future field.

The baseline separates stable reference data, transactional data, evidence/documents, and security/privacy/audit data.

Do not replace controlled values with free text where the value drives eligibility, reporting, search, verification, billing or workflow.

## 2. Ethiopia-specific baseline decisions

### 2.1 Identity

The platform must not recreate the national identity system. Fayda is Ethiopia's foundational digital ID and is designed around minimal identity data. The platform should store a Fayda identifier only when the user supplies/authorizes it or a lawful integration is implemented; it must not store biometric data.

Recommended identity fields:
- person_id (internal UUID)
- account_id (nullable until account linkage)
- given_name
- middle_name (nullable)
- family_name (nullable)
- display_name
- date_of_birth (nullable where not needed)
- gender_code (controlled value, nullable)
- citizenship/nationality (controlled reference, only where operationally justified)
- phone
- email
- preferred_language
- identity_status
- fayda_identifier (nullable, protected)
- created_at / updated_at

Do not collect religion, ethnicity, birthplace, occupation or biometrics as identity fields merely because another system does. The Fayda program explicitly applies data minimisation and excludes occupation, religion and ethnicity from foundational identity collection.

### 2.2 Geography

Use a versioned Ethiopian administrative hierarchy:
Country -> Region/City Administration -> Zone/Special Woreda -> Woreda/District -> Kebele -> Enumeration Area (optional).

Current ESS survey documentation describes 12 regions and 2 city administrations, with zones, woredas and kebeles beneath them, and notes that enumeration areas are census counting units. The exact reference dataset must therefore be versioned and refreshable rather than hard-coded into application logic.

Every geography record needs:
- geography_id
- geography_type
- parent_id
- official_name
- local_name (nullable)
- code (nullable until authoritative code is available)
- status
- valid_from / valid_to
- source_reference
- source_version

### 2.3 Occupation and industry

Use a two-level distinction:
- occupation/profession: what a person does;
- industry/sector: what the employing/business organization primarily does.

ESS statistical work has used National Occupational and Industrial Classifications (NOIC), informed by international ISCO and ISIC classifications and adapted to Ethiopian conditions. The implementation should preserve national codes where an authoritative current release is available, with international crosswalks as metadata rather than replacing Ethiopian classifications.

### 2.4 Education and qualifications

Education must distinguish:
- institution;
- qualification/award;
- field of study;
- level;
- completion status;
- award date;
- verification status.

Do not make "degree" one free-text field. A professional may have multiple qualifications and multiple fields of study.

### 2.5 Privacy

Personal-data processing must follow Ethiopia's Personal Data Protection Proclamation No. 1321/2024. Every field in the baseline must have a declared classification:
- public;
- member-visible;
- organization-visible;
- private;
- restricted/sensitive.

Collection must have a purpose and lawful basis. Documents containing identity/qualification evidence are private/restricted by default.

## 3. Canonical entities

### 3.1 Person

| Field | Type | Required | Visibility | Notes |
|---|---|---:|---|---|
| person_id | UUID | yes | private | internal key |
| account_id | UUID | no | private | identity/account separation |
| given_name | string | yes | configurable | legal name component |
| middle_name | string | no | configurable | Ethiopian naming conventions must not be forced into Western first/last assumptions |
| family_name | string | no | configurable | nullable |
| display_name | string | yes | public/member | profile presentation |
| date_of_birth | date | conditional | private | only where needed |
| gender_code | ref | conditional | configurable | controlled dictionary |
| nationality_code | ref | conditional | configurable | controlled |
| phone | string | conditional | private | normalized E.164 where possible |
| email | string | conditional | private | normalized |
| preferred_language | ref | yes | private | UX/notifications |
| fayda_identifier | protected string | no | restricted | never public; store only when justified |
| status | enum | yes | private | active/blocked/deleted/merged |
| created_at | timestamp | yes | private | UTC |
| updated_at | timestamp | yes | private | UTC |

### 3.2 Account

Fields:
- account_id
- person_id
- login identifier
- authentication provider
- credential state
- MFA state
- account status
- last authentication timestamp
- recovery/contact state
- created/updated timestamps.

Authentication secrets are never part of exports or ordinary profile APIs.

### 3.3 Address / Geography Assignment

A person may have multiple addresses over time. Store:
- address_id
- person_id
- geography_id(s)
- address_type
- address_text
- is_primary
- valid_from / valid_to
- visibility.

Use structured geography for reporting and search; retain optional free-text directions only when necessary.

### 3.4 Membership

Membership is a lifecycle record, not a boolean.

Core:
- membership_id
- person_id
- membership_type_id
- application_id
- membership_number
- status
- start_date
- end_date
- renewal_due_date
- grace_end_date
- approval metadata
- cancellation/suspension reason
- payment obligation reference
- created/updated.

Membership history is immutable in substance; corrections create audited revisions.

### 3.5 Professional Profile

Core:
- profile_id
- person_id
- headline
- biography/about
- primary_occupation_id
- secondary occupations
- sectors
- skills
- specializations
- years_experience (derived where possible)
- work_preference
- availability
- service_area
- profile_visibility
- discoverability
- profile_status.

The profile is a projection of structured records plus optional narrative, not the source of truth for qualifications or employment.

### 3.6 Education / Qualification

EducationRecord:
- education_id
- person_id
- institution_id
- qualification_type_id
- field_of_study_id
- level_id
- attendance_start/end
- completion_status
- award_date
- country/geography
- document_id
- verification_status.

Certification is separate because professional certifications/licenses often have expiry and issuing-body semantics.

### 3.7 Employment / Experience

ExperienceRecord:
- experience_id
- person_id
- organization_id (nullable)
- job_title
- occupation_id
- industry_id
- employment_type
- start_date
- end_date
- current_flag
- location
- description
- verification_status
- evidence_document_id.

### 3.8 Verification

Never use is_verified as the only record.

VerificationClaim:
- claim_id
- subject_type
- subject_id
- claim_type
- claimed_value/reference_id
- status
- submitted_at
- decided_at
- expires_at
- reviewer_id
- decision_reason.

EvidenceDocument:
- document_id
- claim_id
- document_type
- object_storage_key
- checksum
- mime_type
- size
- uploaded_by
- uploaded_at
- retention_class
- access_class.

A verified claim can expire or be revoked without deleting its history.

### 3.9 Organization

Core:
- organization_id
- legal_name
- display_name
- organization_type_id
- sector/industry IDs
- registration identifiers where applicable
- country/geography
- website/contact
- verification_status
- visibility
- status.

OrganizationUser links people/accounts to an organization with scoped roles.

### 3.10 Opportunity

Jobs and service requests share discovery concepts but remain separate transactional entities.

Job:
- job_id
- organization_id
- title
- description
- occupation_id(s)
- industry_id
- employment_type
- location/geography
- work_mode
- minimum/maximum experience
- education requirements
- skill requirements
- member_only flag
- verified_professional_only flag
- application window
- status.

ServiceListing:
- service_listing_id
- person/organization owner
- service_category_id
- title
- description
- geography/service area
- pricing disclosure mode
- availability
- verification references
- visibility/status.

Eligibility rules must be structured, auditable and reusable.

### 3.11 Mentorship

MentorProfile:
- person_id
- mentor_status
- expertise
- capacity
- preferred topics
- preferred mentee stage
- availability
- verification requirements.

Mentorship:
- mentorship_id
- mentor_id
- mentee_id
- goals
- start/end
- status
- matching basis
- consent/terms
- completion outcome.

MentorshipSession:
- session_id
- mentorship_id
- scheduled time
- duration
- topic
- attendance
- notes visibility
- outcome.

### 3.12 Events

Event:
- event_id
- organizer
- event_type
- title
- description
- start/end
- timezone
- location or online link
- capacity
- eligibility
- status
- version.

Rescheduling must create an auditable event-version change, preserve registration identity, notify affected participants and invalidate/reissue calendar representations.

### 3.13 Learning

Store the MPA-side learning identity and records, not a duplicate Moodle engine:
- course_id
- external_course_id
- title
- provider
- status
- learning_record_id
- person_id
- enrollment/completion timestamps
- score where legitimately required
- certificate reference
- synchronization status.

### 3.14 Projects, participation and volunteering

Project:
- project_id
- title
- owner
- project_type
- geography
- objectives
- budget summary where appropriate
- funding status
- lifecycle status
- start/end
- approval data.

ProjectParticipation:
- project_id
- person/organization
- participation_type
- role
- start/end
- status.

VolunteerAssignment:
- assignment_id
- project_id
- person_id
- task
- location
- schedule
- attendance
- completion/evidence.

### 3.15 Donations and payments

Do not model a payment as the business outcome.

PaymentIntent:
- payment_id
- payer
- purpose_type
- purpose_id
- amount
- currency
- provider
- provider_reference
- idempotency_key
- status
- initiated_at
- confirmed_at
- failure_reason.

Donation:
- donation_id
- donor
- project/campaign
- amount
- currency
- allocation
- receipt_reference
- status.

Telebirr is the initial payment adapter; the domain must not depend directly on Telebirr-specific fields.

### 3.16 Shared control data

Required:
- Document
- Notification
- NotificationPreference
- AuditLog
- Outbox/DomainEvent
- IdempotencyRecord
- IntegrationSyncRecord
- ConsentRecord
- DataAccessLog where required.

## 4. Reference-data catalogue

| Dictionary | Purpose | Governance |
|---|---|---|
| geography | Ethiopian hierarchy | versioned external reference |
| gender | demographic classification | controlled, minimal |
| nationality/citizenship | identity/legal context | controlled |
| language | UI/communication | controlled |
| occupation | professional search/reporting | Ethiopian source + crosswalk |
| industry/sector | organization/employment classification | Ethiopian source + crosswalk |
| skill | talent discovery | controlled taxonomy, extensible |
| education_level | education hierarchy | controlled |
| qualification_type | awards/certificates | controlled |
| field_of_study | academic/professional specialization | controlled |
| organization_type | stakeholder classification | controlled |
| membership_type | membership products | governed by MPA |
| membership_status | lifecycle | system dictionary |
| verification_claim_type | what can be verified | system + policy |
| document_type | evidence/documents | system dictionary |
| job_type | opportunity classification | controlled |
| employment_type | full/part/contract/etc. | controlled |
| work_mode | onsite/hybrid/remote | controlled |
| service_category | service marketplace | governed taxonomy |
| mentorship_topic | matching | controlled/extensible |
| event_type | events | controlled |
| project_type | project reporting | controlled |
| participation_type | involvement | controlled |
| payment_purpose | financial classification | controlled |
| payment_status | financial lifecycle | system dictionary |
| notification_type | delivery semantics | system dictionary |
| visibility | access model | system dictionary |

## 5. Baseline required/conditional rule

A field is required only when the platform cannot complete the relevant transaction without it.

Examples:
- phone/email: required for account recovery/notifications according to selected authentication route;
- date of birth: not automatically required for a public professional profile;
- qualification evidence: required only when the person claims a qualification as verified;
- organization registration number: required only where the organization's verification policy needs it;
- payment reference: required after provider confirmation, not before payment initiation.

## 6. Data quality rules

1. Every reference record has a stable ID and human-readable code.
2. Codes are never reused for a different meaning.
3. Names can change without changing IDs.
4. Historical transactions retain the reference version used at the time.
5. Free text cannot substitute for controlled values in eligibility/reporting fields.
6. Dates are ISO-compatible and timestamps are persisted in UTC.
7. Event records preserve the event timezone.
8. Monetary values use integer minor units or a defined decimal strategy; never binary floating point.
9. Phone numbers are normalized.
10. Uploaded files receive MIME/type validation, checksum and access class.
11. Deleted/merged people are not silently recreated as duplicates.
12. Every state-changing command records actor, timestamp and reason where applicable.

## 7. Privacy and visibility matrix

| Data | Public | Member | Organization | Private/Restricted |
|---|---:|---:|---:|---:|
| Display name | configurable | yes | yes | - |
| Professional headline | configurable | yes | yes | - |
| Skills | configurable | yes | yes | - |
| Employment history | configurable | yes | yes | - |
| Exact DOB | no | no | no | yes |
| Phone/email | no by default | controlled | controlled | yes |
| Fayda identifier | no | no | no | restricted |
| Identity documents | no | no | no | restricted |
| Qualification evidence | no | no | controlled if policy allows | restricted |
| Payment records | no | own records | own records | finance restricted |
| Audit logs | no | no | no | restricted |

## 8. Source-of-truth rules

- Person identity: MPA identity record, optionally linked to Fayda; Fayda remains authoritative for the national identifier.
- Geography: imported/versioned authoritative reference dataset.
- Occupation/industry: approved national classification version plus explicit crosswalks.
- Membership: MPA membership service.
- Qualifications: person-submitted claims plus verification evidence; external issuer remains authoritative for the credential.
- Payment execution: payment provider; MPA ledger is authoritative for application/business status after verified provider confirmation.
- Moodle learning activity: Moodle for learning execution; MPA for membership-facing learning record.
- Calendar event delivery: external calendar provider; MPA event record remains canonical.
- Audit: MPA audit subsystem.

## 9. Seed data gates

Before feature coding depends on a dictionary, the repository must contain:
- machine-readable seed file;
- unique code;
- display label;
- description;
- source;
- source version/date;
- parent relationship where hierarchical;
- active/inactive flag;
- import/update strategy;
- crosswalk where applicable.

No production table should depend on a hard-coded array inside a controller.

## 10. Baseline acceptance

The baseline is accepted when:
- all canonical entities have defined keys and relationships;
- required/conditional fields are explicit;
- controlled dictionaries are identified;
- Ethiopia geography is versioned;
- occupation/industry use a documented Ethiopian-source strategy;
- identity does not collect biometrics;
- verification is evidence-based;
- financial records are provider-neutral;
- visibility/privacy is explicit;
- source of truth is explicit;
- migrations/seed strategy can be implemented without redesigning the domain.

## 11. Research basis

This baseline was checked against current Ethiopian official sources:
- Fayda National ID: minimal identity data, national identifier and accepted identity evidence.
- Ethiopian Statistics Service: current administrative hierarchy and statistical occupation/industry classification practice.
- Ministry of Justice: Personal Data Protection Proclamation No. 1321/2024.

These sources establish constraints and reference direction; they do not constitute permission to copy another institution's entire database.

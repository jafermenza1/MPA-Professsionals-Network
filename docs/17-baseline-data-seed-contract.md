# Baseline Data Seed Contract

This contract defines what must exist before transactional modules depend on reference data.

## Required seed packages

### geography
Minimum hierarchy:
- country
- region_or_city_administration
- zone_or_special_woreda
- woreda_or_district
- kebele
- optional enumeration_area

Required columns:
id, code, name, local_name, type, parent_id, status, valid_from, valid_to, source, source_version

### occupation
Required:
id, code, title, description, parent_id, source, source_version, status

Include explicit crosswalk metadata to ISCO only when supported.

### industry
Required:
id, code, title, description, parent_id, source, source_version, status

Include explicit crosswalk metadata to ISIC only when supported.

### education
Required dictionaries:
- education_level
- qualification_type
- field_of_study

### organization
Required:
- organization_type
- legal/registration identifier type
- organization_status

### membership
Required:
- membership_type
- membership_status
- fee rule reference
- eligibility rule reference

### verification
Required:
- claim type
- evidence/document type
- decision status
- expiry/review policy reference

### opportunity
Required:
- job type
- employment type
- work mode
- service category
- opportunity status

### events/projects
Required:
- event type/status
- project type/status
- participation type
- volunteer assignment status

### system
Required:
- visibility
- notification type/status
- payment purpose/status
- audit action type

## Seed record metadata

Every row must include:
- stable id
- code
- label
- description
- active flag
- source
- source version
- created_at
- updated_at.

## Prohibited

Do not seed:
- real member personal information;
- real identity numbers;
- real payment references;
- real uploaded identity/qualification documents.

Use synthetic examples only.

## Import and migration rule

Reference-data migrations are separate from transactional migrations where practical. A migration may introduce a table; the seed/import job populates it. Application startup must not silently mutate reference data in production.

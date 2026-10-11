# Reference Data Governance

## Purpose

Reference data controls the values used by search, eligibility, reporting, verification and forms. It must be governed as data, not scattered through application code.

## Classification tiers

### Tier A — External authoritative
Examples: Ethiopian administrative geography, national identifiers and legally defined classifications.

Policy: import/version; preserve source and version; do not silently alter meanings.

### Tier B — MPA governed
Examples: membership types, verification claim types, service categories, mentorship topics, project types.

Policy: change through an approved data-change process and audit.

### Tier C — Operational dictionaries
Examples: notification types, payment statuses, workflow states.

Policy: application-controlled; backward compatible.

## Versioning

Every dictionary release must record:
- dataset_version
- source_name
- source_url/reference
- source_publication_date where known
- imported_at
- effective_from
- effective_to
- importer/reviewer
- checksum when an external file is used.

Never overwrite history when a classification changes. Retire old records and map them to successors.

## Crosswalks

Crosswalk table:
- crosswalk_id
- source_dictionary
- source_code
- target_dictionary
- target_code
- relationship_type
- confidence/quality note
- effective period
- source/reference.

Crosswalks are not equivalence claims unless the source explicitly establishes equivalence.

## Change control

A change that alters:
- eligibility;
- reporting categories;
- membership pricing;
- verification requirements;
- legal/privacy meaning;
- payment classification

requires product-owner review and regression tests.

## Import safety

Imports must:
1. validate schema;
2. validate unique codes;
3. validate parent relationships;
4. detect deleted/renamed codes;
5. generate a diff;
6. require approval for semantic changes;
7. preserve previous versions;
8. be idempotent.

## No hidden taxonomy

Developers must not create ad-hoc values such as IT, Information Technology, ICT, Software in unrelated tables. If a new category is needed, add it to the governed dictionary and document its meaning.

## Initial authoritative references

- Ethiopia National ID Program (Fayda): identity and accepted proof references.
- Ethiopian Statistics Service: administrative/statistical reference material.
- Ethiopian Ministry of Justice: Personal Data Protection Proclamation 1321/2024.

The exact machine-readable source files and their checksums must be recorded when imported into the repository.

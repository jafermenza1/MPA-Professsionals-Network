# 19 — Configurable Reference Portfolio

**Status:** Implementation contract
**Version:** 1.0
**Decision:** All six baseline reference domains are configurable from administration and importable without changing application code.

## 1. Objective

The platform must treat classifications, membership products, fees and verification rules as managed data.

An authorized administrator must be able to create, edit, deactivate and restore reference records; import CSV/XLSX/JSON datasets; preview and validate imports; map columns; resolve duplicate codes; preserve historical versions; schedule effective dates; compare versions; export active datasets; maintain aliases and crosswalks; control active versions; and audit every administrative change.

**Critical rule:** changing reference data must not require a software deployment.

## 2. Portfolio architecture

Use one generic configurable reference-data engine:

ReferenceDataset -> DatasetVersion -> ReferenceItem -> ReferenceRelation -> Crosswalk -> Publication

Every dataset has:
- dataset_id
- dataset_key
- name
- description
- domain
- status
- source_type
- source_name
- source_version
- effective_from
- effective_to
- schema_version
- import_method
- created_by
- approved_by
- created_at
- updated_at.

Every item has:
- item_id
- dataset_version_id
- code
- parent_item_id
- label
- short_label
- description
- aliases
- metadata JSON
- sort_order
- active
- effective_from
- effective_to
- created_by
- updated_by.

Relations support parent/child, equivalent, broader_than, narrower_than, related_to, replaces, deprecated_to and crosswalk.

## 3. Dataset 1 — Administrative Geography

Support:
- country
- region/city administration
- zone/special woreda
- woreda/district
- kebele
- optional enumeration area
- future administrative levels without schema redesign.

Admin can manually add geography, edit labels, change parent, add codes, deactivate/restore, merge deprecated records into successors, import complete or partial hierarchies, preview changes and publish new versions.

Import accepts CSV, XLSX and JSON.

Minimum import columns:
code, name, type, parent_code, status

Optional:
local_name, description, valid_from, valid_to, source, source_version

Validation:
- unique code within dataset/version;
- no orphan parent;
- no circular hierarchy;
- valid geography type;
- no accidental code reuse;
- changed codes require explicit migration mapping.

Transactions store geography_id, not the displayed name. Historical records retain their original reference even after a later rename.

## 4. Dataset 2 — Occupation Portfolio

Use the Standard Occupational Classification structure as the initial occupation portfolio.

Support:
- major group;
- minor group;
- broad occupation;
- detailed occupation;
- code;
- title;
- definition;
- aliases/job titles;
- active status.

The official SOC system provides hierarchical occupational structure and downloadable structure/definition files. The application imports the selected release rather than hard-coding occupations. citeturn0search3turn0search4

Administrators may add local display titles, alternate titles, association categories, skill tags, mentorship topics, service categories and eligibility tags.

Imported source-code meanings remain unchanged. MPA-specific additions are mappings/extensions.

## 5. Dataset 3 — Industry Portfolio

Use NAICS as the initial industry portfolio.

Support:
- sector;
- subsector;
- industry group;
- industry;
- detailed industry;
- code;
- title;
- definition;
- aliases;
- active status.

The official Census NAICS site provides the 2022 structure and reference files and documents an update process. The application therefore treats NAICS as versioned reference data, not permanent constants. citeturn0search5turn0search11

Administrators may attach local labels, stakeholder categories, service categories, project sectors, opportunity tags and skill relationships without altering imported classification meaning.

## 6. Dataset 4 — Education and Field of Study

Use a separate education model.

### Education level
Configurable categories such as secondary, certificate, diploma, undergraduate, postgraduate diploma, master's, doctorate, professional qualification, vocational/technical and continuing/professional education.

### Qualification type
Configurable categories such as certificate, diploma, degree, professional license, professional certification and short-course certificate.

### Field of study
Use the Classification of Instructional Programs structure as the initial field-of-study portfolio.

CIP 2020 provides hierarchical 2-, 4- and 6-digit field-of-study coding and is designed for tracking fields of study and program completions. citeturn0search7turn0search8

### Institution
Institutions are separate entities. A qualification references institution_id, qualification_type_id, education_level_id and field_of_study_id.

Admins can import new CIP versions, create association-specific fields, add aliases, deactivate obsolete fields, create crosswalks and configure education requirements for verification claims.

## 7. Dataset 5 — Membership Portfolio and Fee Rules

Membership products are configuration, not code.

### Initial products

| Product | Initial fee | Billing model | Renewal |
|---|---:|---|---|
| Basic | 1,200 ETB | annual | annual |
| Lifetime | 12,000 ETB | one-time lifetime | none |
| Premium | 50,000 ETB | one-time | none |

The supplied Lifetime wording says "12,000 ETB/year", while the product name says Lifetime. The baseline therefore initializes Lifetime as 12,000 ETB one-time lifetime. Billing remains editable by authorized administrators.

### MembershipProduct

Fields:
- membership_product_id
- code
- name
- description
- membership_scope
- billing_model
- price_amount
- currency
- duration_months
- renewal_policy
- grace_period_days
- eligibility_rule_id
- benefits_policy_id
- active
- effective_from
- effective_to.

### FeeRule

Support:
- base_amount;
- currency;
- billing_period;
- tax/fee components where applicable;
- discount rule;
- waiver rule;
- eligibility condition;
- effective date;
- expiry date;
- payment channels;
- refund policy reference.

Admins can change prices, billing model, renewal period, grace period, eligibility, benefits and discount/waiver rules, including future effective dates.

Existing paid memberships retain the fee-rule/version that created their obligation. Historical payments are never recalculated using today's price.

## 8. Dataset 6 — Verification Claims and Evidence Checklists

Verification is a configurable policy engine.

### VerificationClaimType

Fields:
- claim_type_id
- code
- name
- description
- subject_type
- risk_level
- required_for_profile_badge
- validity_period
- renewal_policy
- active.

Examples include identity, education, professional certification, employment, professional experience, organization, membership and service capability.

### VerificationChecklist

A claim type has one or more checklist versions.

Checklist:
- checklist_id
- claim_type_id
- version
- title
- instructions
- decision_policy
- minimum_score or required-item policy
- effective_from
- effective_to
- active.

ChecklistItem:
- checklist_item_id
- checklist_id
- code
- label
- description
- response_type
- required
- evidence_required
- reviewer_guidance
- pass_condition
- order
- active.

Each submitted claim stores the checklist version, item responses, evidence references, reviewer, decision, reason and timestamps.

Changing a checklist never rewrites historical verification decisions.

### Response types

Support:
- yes/no;
- pass/fail;
- verified/not verified;
- select;
- multi-select;
- numeric;
- text;
- date;
- document present/missing;
- document valid/invalid;
- reviewer note.

### Evidence rules

For each checklist item configure:
- evidence required/not required;
- allowed document types;
- minimum evidence count;
- document expiry required;
- issuing organization required;
- manual verification required;
- external verification required;
- reviewer note required.

### Decision policy

Support:
- all mandatory items pass;
- mandatory items plus minimum score;
- selected critical items pass;
- two-reviewer approval for high-risk claims.

The policy itself is versioned.

## 9. Generic Admin Reference Portfolio UI

Admin section:

Administration -> Reference Portfolio

Landing page:
- dataset name;
- active version;
- draft version;
- source;
- item count;
- last imported;
- last published;
- status.

Actions:
- View
- Search
- Add
- Edit
- Import
- Export
- Compare versions
- Create draft
- Validate
- Publish
- Schedule publication
- Revert
- Archive

### Dataset editor

Schema-aware editor.

Hierarchical datasets:
- tree view;
- table view;
- parent selector;
- safe reorder;
- code editor;
- bulk edit.

Checklists:
- visual checklist builder;
- add/remove/reorder item;
- required flag;
- evidence requirement;
- response type;
- pass condition;
- reviewer guidance.

Membership:
- product editor;
- price editor;
- billing model;
- duration;
- eligibility;
- benefits;
- effective date.

## 10. Import workflow

Every import follows:

Upload -> Detect -> Map -> Validate -> Preview Diff -> Resolve Conflicts -> Draft -> Review -> Publish

Never import directly into active production reference data.

Conflict classes:
- new item;
- unchanged item;
- renamed item;
- changed parent;
- changed code;
- duplicate code;
- deleted/deprecated item;
- invalid parent;
- conflicting effective period.

Destructive/semantic conflicts require explicit resolution.

## 11. Publication workflow

Draft -> Validation -> Review -> Approved -> Scheduled/Published -> Archived

High-impact datasets require approval:
- membership pricing;
- verification policy;
- eligibility rules;
- financial classifications;
- privacy/access classifications.

Where separation of duties is required, the editor cannot be the sole publisher.

## 12. Versioning rules

Every transactional record stores relevant reference/version identifiers when reference meaning can affect historical interpretation.

Examples:
- job requirement -> occupation version;
- qualification -> field-of-study version;
- membership payment -> fee-rule version;
- verification case -> checklist version;
- geography assignment -> geography version.

Changing the active version affects new transactions unless an explicit migration is approved.

## 13. API contract

Generic administrative endpoints:

- GET /api/v1/admin/reference-datasets
- GET /api/v1/admin/reference-datasets/{datasetKey}
- POST /api/v1/admin/reference-datasets/{datasetKey}/drafts
- POST /api/v1/admin/reference-datasets/{datasetKey}/items
- PATCH /api/v1/admin/reference-datasets/{datasetKey}/items/{itemId}
- POST /api/v1/admin/reference-datasets/{datasetKey}/imports
- POST /api/v1/admin/reference-datasets/{datasetKey}/validate
- GET /api/v1/admin/reference-datasets/{datasetKey}/diff
- POST /api/v1/admin/reference-datasets/{datasetKey}/publish
- POST /api/v1/admin/reference-datasets/{datasetKey}/schedule
- POST /api/v1/admin/reference-datasets/{datasetKey}/archive

Domain-specific commands may be added for membership pricing and verification policy when business rules require them.

## 14. Database design

Recommended core tables:
- reference_dataset
- reference_dataset_version
- reference_item
- reference_relation
- reference_crosswalk
- reference_import
- reference_import_row
- reference_publication
- reference_change_request
- membership_product
- membership_fee_rule
- membership_benefit_rule
- verification_claim_type
- verification_checklist
- verification_checklist_item
- verification_policy_version
- verification_case_response

Do not store all reference data as an untyped JSON blob. JSON may hold extension metadata, but canonical fields must remain queryable and constrained.

## 15. Permissions

- reference:read
- reference:create
- reference:update
- reference:import
- reference:validate
- reference:publish
- reference:archive
- membership_pricing:update
- verification_policy:update
- verification_policy:publish

Publication permissions are stricter than edit permissions.

## 16. Audit

Audit every change with:
- actor;
- dataset;
- version;
- item;
- old value;
- new value;
- reason;
- source/import;
- approval;
- publication;
- timestamp.

For imports, preserve import metadata and validation report.

## 17. Safety rules

1. Do not delete reference records when transactions depend on them; deactivate/deprecate instead.
2. Never reuse a retired code for another meaning.
3. Never mutate historical verification decisions.
4. Never retroactively change historical membership payment obligations.
5. Never change an imported classification's source meaning through an admin edit; create an MPA extension/mapping.
6. Never publish an unvalidated import.
7. Never expose restricted verification evidence through public reference APIs.
8. Every high-impact configuration change is auditable.

## 18. Acceptance criteria

An authorized administrator must be able, without developer intervention, to:
1. manually create/edit/deactivate geography;
2. import geography and publish a validated version;
3. add/map occupations;
4. add/map industries;
5. manage education levels, qualifications and fields of study;
6. change membership products and future fees;
7. configure verification claims;
8. build/version verification checklists;
9. configure evidence requirements;
10. preview differences before publication;
11. schedule future configuration;
12. preserve historical transaction meaning;
13. see a complete audit trail.

## 19. Initial baseline

- Geography: configurable hierarchical dataset, initially import-driven.
- Occupation: SOC hierarchy.
- Industry: NAICS hierarchy.
- Field of study: CIP hierarchy.
- Membership:
  - Basic — 1,200 ETB/year.
  - Lifetime — 12,000 ETB one-time.
  - Premium — 50,000 ETB one-time.
- Verification: configurable claim types + versioned checklists + configurable evidence requirements.

The defaults are deliberately editable through administration without changing application source code.

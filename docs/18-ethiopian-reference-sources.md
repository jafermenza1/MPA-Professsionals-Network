# Ethiopian Reference Sources and Baseline Decisions

**Reviewed:** 2026-10-08

This file records what was verified externally and what remains an MPA design decision.

## 1. National identity

The National ID Program describes Fayda as Ethiopia's foundational digital ID and a 12-digit identifier. Its published dataset lists demographic fields such as full name, gender, date of birth, citizenship and current address, with phone/email used for interaction; biometric data is collected by the National ID Program but must not be copied into the MPA application database.

The National ID Program also states a minimal-data principle and explicitly says occupation, religion, ethnicity and birthplace are not collected for foundational identity.

**Decision:** MPA stores its own internal person ID. Fayda number is an optional protected external identifier. No MPA biometric storage.

Sources:
- https://www.id.gov.et/
- https://www.id.gov.et/dataset
- https://www.id.gov.et/principles
- https://www.id.gov.et/proof

## 2. Administrative geography

ESS documentation for the 2024–25 EDHS states that Ethiopia is divided administratively into 12 regions and 2 city administrations, with zones, woredas and kebeles beneath them. It also describes enumeration areas as census counting units.

**Decision:** geography is a versioned hierarchy, not a static enum in application code. The repository should later import an approved machine-readable administrative dataset and retain source/version metadata.

Source:
- https://ess.gov.et/wp-content/uploads/2026/01/edhs-2024-25-kir-01172026.pdf

## 3. Occupation and industry

ESS statistical documentation describes use of National Occupational and Industrial Classifications (NOIC), with codes informed by ISCO and ISIC and adapted to Ethiopian socio-economic conditions.

**Decision:** occupation and industry are separate reference dictionaries. The implementation must not invent a new flat occupation list. Before production use, the exact national classification release and machine-readable/codebook source must be approved and versioned.

Source:
- https://ess.gov.et/wp-content/uploads/2024/09/Urban-Employment-Unemployment-Survey-Statistical-Report-2012.pdf

## 4. Education

The Ministry of Education's Education Statistics Annual Abstract shows an Ethiopian education structure including primary and secondary education, TVET levels 1–5, undergraduate degree programmes and postgraduate programmes. The same source distinguishes TVET qualification levels from academic degrees.

**Decision:** education records therefore need at least:
- education level;
- qualification/award type;
- field of study;
- institution;
- completion/award date;
- verification status.

Do not collapse TVET certificates, diplomas, bachelor's degrees, master's degrees and doctorates into a single free-text "degree" field.

Sources:
- https://www.moe.gov.et/storage/Books/ESSA%202008%20E.C.pdf
- https://moe.gov.et/storage/Books/ESAA%202014%20EC%20%282021-22%20G.C%29%20Final.pdf

## 5. Personal data protection

Ethiopia's Ministry of Justice publishes Personal Data Protection Proclamation No. 1321/2024 and identifies it as in force.

**Decision:** baseline fields require purpose, visibility/access class and appropriate retention/processing rules. Identity and qualification evidence are restricted by default. Public professional profiles must not expose private identity or payment data.

Source:
- https://justice.gov.et/en/law/personal-data-protection-proclamation/

## 6. What is not yet frozen

The following must not be fabricated merely to make seed data look complete:

1. Exact current national NOIC release/codebook.
2. Exact current Ethiopian administrative code dataset to be used as the production source.
3. A national occupation-to-skill taxonomy specific to the MPA.
4. A single national field-of-study taxonomy that covers every professional use case.
5. MPA membership categories and fees before governance approval.
6. MPA verification policies and acceptable evidence by claim type.

Until these are approved, the schema should support versioned imports and MPA-governed extensions.

## 7. Baseline principle

The platform should be able to say exactly where a value came from:

**source -> source version -> reference record -> transactional record -> audit trail**

That is more important than having a large number of classifications on day one.

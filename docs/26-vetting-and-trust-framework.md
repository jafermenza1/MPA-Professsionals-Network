# MPA Vetting, Verification and Trust Framework

## Purpose

This framework translates Islamic ethical values into evidence-led professional verification controls. Islamic terms are always paired with plain-English equivalents so the platform is understandable to members, staff, reviewers and auditors.

The framework is values-informed, proportionate and evidence-based. It verifies defined professional or membership claims; it does not attempt to measure a person's private religious observance.

| Islamic term | Plain-English equivalent | System principle |
|---|---|---|
| Adl | Justice / Fairness | Equal treatment, impartiality, no favoritism, reasoned decisions |
| Tabayyun | Verification / Due diligence | Verify material claims before relying on them |
| Amanah | Trust / Responsibility | Protect entrusted information and authority |
| Sidq | Truthfulness | Accurate declarations and records |
| Ihsan | Excellence / Good conduct | Professional quality and responsible conduct |
| Rahmah | Mercy / Compassion | Proportionality, dignity and correction |
| Satr | Privacy / Confidentiality | Need-to-know access and limited disclosure |
| Shura | Consultation | Qualified collective review for policy questions |
| Maqasid al-Shariah | Higher purposes of Islamic law | Legitimate purpose, benefit, harm prevention and rights protection |
| Wasatiyyah | Moderation / Balance | Avoid arbitrary extremes |

## Scholarly and institutional source basis

This is an MPA governance proposal, not a new fatwa. Shariah-sensitive policy should be approved through qualified scholarly review together with relevant professional, privacy and legal expertise.

1. International Islamic Fiqh Academy — Core Values: justice, equity, transparency, integrity, moderation, discipline, cooperation and excellence.
   https://iifa-aifi.org/en/core-values

2. IIFA Resolution No. 1: accuracy, objectivity, impartiality, documented evidence and respect for legitimate disagreement.
   https://iifa-aifi.org/en/34158.html

3. IIFA Statute: contemporary solutions grounded in Qur'an, Sunnah, Islamic heritage, Shariah objectives and collective jurisprudential work.
   https://iifa-aifi.org/en/statute

4. IIFA Resolution No. 258 (2025), AI ethics: lawful purpose, benefit/harm controls, information and rights protection, honesty, documentation and transparency.
   https://iifa-aifi.org/en/56035.html

5. IIFA Resolution No. 247, Maqasid guidance: consideration of Shariah purposes, justice, transparency, protection and real-world circumstances.
   https://iifa-aifi.org/en/49708.html

## Vetting levels

### 1. Identity Verification
Confirm that the account holder is the person represented by the application. Use relevant identity and account-continuity evidence.

### 2. Education and Qualification Verification
Confirm claimed qualifications using appropriate certificates, issuing-institution confirmation, qualification type, field of study, award date and professional registration where applicable.

### 3. Professional Standing
Confirm relevant professional registration, licensing, employer/institution relationship, business registration, portfolio evidence or professional association status where appropriate.

### 4. Professional Conduct
Where relevant to the role, verify documented professional conduct matters such as falsified qualifications, proven professional misconduct, relevant disciplinary findings or material conflicts of interest.

### 5. References
Use structured, role-relevant references addressing the relationship, period known, professional responsibility, relevant conduct and recommendation.

### 6. Enhanced Due Diligence
Use only for a documented legitimate reason, such as senior governance, financial authority, sensitive-data access, regulated professions or unresolved material verification conflicts. Record the purpose and scope.

### 7. Leadership and Governance Vetting
For senior governance, finance, ethics, review and sensitive-data roles, use stronger qualification, standing, reference, conflict-of-interest and independence controls.

## Core procedure

**Claim or concern -> evidence -> relevance/authenticity review -> member clarification where needed -> decision -> notification -> appeal**

A concern is not automatically a finding. Evidence, relevance and a documented decision reason are required.

## Controls by Islamic value

**Adl (Justice/Fairness):** consistent criteria, authorized reviewers, conflict-of-interest checks, reasoned decisions and appeal.

**Tabayyun (Verification):** material claims are checked before receiving a verification badge or eligibility benefit.

**Amanah (Trust/Responsibility):** least-privilege access, confidential evidence and audited reviewer actions.

**Sidq (Truthfulness):** separate self-declared claims from independently verified claims.

**Satr (Privacy/Confidentiality):** evidence and reviewer notes remain private unless a specific publication rule permits a safe public result.

**Rahmah (Mercy/Compassion):** correction and resubmission are available where an issue is reasonably correctable.

**Ihsan (Excellence):** verification evaluates relevant professional quality, not merely document presence.

**Shura (Consultation):** Shariah-sensitive policy questions use qualified collective review rather than individual discretion.

**Maqasid al-Shariah (Higher purposes):** every check must have a legitimate purpose, be proportionate, protect rights and dignity, and avoid unnecessary harm.

## Prohibited system behavior

MPA vetting must not become an unrestricted investigation of a person's private life. The platform must not use sectarian, ethnic or unrelated political criteria as hidden screening rules, maintain secret unreviewable adverse lists, publish allegations as facts, or allow automated systems to make final adverse decisions without accountable human review.

## Public verification badges

The public directory should expose outcomes rather than confidential case material:

- MPA Member — active membership relationship.
- Identity Verified — identity claim verified.
- Professional Verified — relevant professional claim verified.
- Experience Verified — relevant experience evidence verified.
- MPA Certified — completed an explicitly defined enhanced program.
- Leadership Vetted — completed the defined governance program.

A badge must state what MPA verified and must not imply a general guarantee about every aspect of a person's conduct or professional activity.

## Adverse decision and appeal

1. Identify the exact claim or issue.
2. Record source and evidence.
3. Assess relevance to the stated purpose.
4. Request clarification or additional evidence when appropriate.
5. Give the member a meaningful response opportunity before final adverse action.
6. Record the evidence basis and reason.
7. Notify the member.
8. Allow appeal/reconsideration.
9. Where practical, use an independent reviewer for the appeal.
10. Preserve the historical decision and appeal record.

## Foundation implemented

Migration 006_vetting_and_trust_framework.sql adds:

- verification_program — configurable purpose, risk, confidentiality and response/appeal policy;
- verification_program_checklist — links programs to versioned checklists;
- verification_case — durable case with policy/checklist snapshots;
- verification_claim — exact claim being verified;
- verification_evidence — source, authenticity, relevance and confidentiality;
- verification_check_result — checklist response/outcome;
- verification_decision — reasoned decision and response controls;
- verification_member_response — member response/evidence;
- verification_appeal — independent reconsideration path;
- verification_reference_request — structured references;
- verification_concern — separates an issue raised from a confirmed finding.

New operational roles are supporting_staff, verification_reviewer, ethics_reviewer and appeal_reviewer. Existing roles remain valid.

## Compatibility with existing foundation

The new model builds on the existing verification_claim_type, verification_checklist, verification_checklist_item, file_object, audit_log, authorization, notification and configurable reference-data foundations. Membership remains separate from professional verification.

The earlier gap was that the database could define claim types and checklist versions but could not store the complete case lifecycle. Migration 006 closes that database-model gap.

## Remaining implementation work

1. Server-side permissions for new roles.
2. Case transition service.
3. Evidence access policy and signed URLs.
4. Checklist-version resolution at case creation.
5. Member response and appeal APIs.
6. Notification templates and reminders.
7. Reviewer workspace.
8. Public badge projection.
9. Tests for authorization, adverse decisions, appeal independence and historical immutability.

A document upload alone must never create a verified claim.

## AI boundary

AI may assist with duplicate detection, document metadata extraction, missing-evidence detection, checklist preparation, conflict flagging and reviewer summaries.

AI must not independently determine religious suitability, use opaque scores for adverse decisions, infer protected/private characteristics, create a final adverse finding, or expose confidential evidence. This follows IIFA Resolution No. 258's requirements for lawful purpose, benefit/harm controls, information and rights protection, honesty, documentation and transparency.

## Acceptance standard

A reviewer must be able to answer: What was claimed? Why was verification necessary? Which policy/checklist version applied? What evidence was considered? Who reviewed it? What did the evidence establish? Was a response opportunity provided? Why was the decision made? Can it be appealed? Can the auditor reconstruct the history?

The intended standard is Amanah (Trust), Tabayyun (Verification), Adl (Justice), Sidq (Truthfulness), Satr (Confidentiality), Rahmah (Compassion), Ihsan (Excellence) and Shura (Consultation).

# Phase 2-4 Business Workflow Outcome Audit and Hardening

## Executive finding

The original Phase 2-4 implementation was strong at discovery, eligibility, matching and controlled lifecycle state, but it was not yet strong enough at conversion, delivery, acceptance and measurable outcome.

Connection is not the same as accomplishment.

A professional directory can help an organization find a person. A job workflow can receive an application. A service marketplace can create a request. A mentorship workflow can create a match and schedule sessions. None of those facts alone proves that the intended value was delivered.

This hardening release closes the most important outcome gaps without creating duplicate identity, verification, membership or talent semantics.

## Actor-by-actor audit

| Actor | Before | Gap | After hardening |
| --- | --- | --- | --- |
| Verified professional | Discoverable in talent registry | No controlled bridge from discovery to a real opportunity | Consent-based talent inquiry; contact is released only after acceptance |
| Organization | Could find verified talent and publish jobs | Recruitment stopped at candidate status management; offer acceptance could be recorded by employer | Candidate-owned offer acceptance/withdrawal and explicit offer terms |
| Job seeker | Could apply and be progressed | No explicit candidate-owned offer acceptance | Applicant can accept an issued offer |
| Service provider | Could list a service and receive a request | No scope/deliverable/milestone/acceptance/payment outcome | Scope, price, deadline, milestones, delivery evidence, requester acceptance, feedback and payment verification |
| Service requester | Could request a provider | No formal delivery acceptance | Can review deliveries, request revision, accept final outcome and rate the service |
| Mentor | Could be matched and hold sessions | Goals were not measurable | Mentorship goals with success measures and target dates |
| Mentee | Could complete mentorship lifecycle | Completion could mean relationship ended rather than goal achieved | Goal tracking plus session outcomes/next steps |
| Finance/reviewer | Membership payment verification existed | Service payments were not tied to service outcomes | Auditable service payment submission and verification |
| Platform staff | Could see lifecycle states | Outcome evidence was thin | Material outcome actions are auditable |

## Phase 2 — Verification and Talent Registry

### What was already correct

- Professional eligibility is based on explicit verified professional claims.
- Identity or membership alone does not create a professional qualification badge.
- Private verification evidence is not exposed to directory consumers.
- Directory visibility is explicit.
- Verification has consent, evidence, review, adverse-response and appeal controls.

These controls support Tabayyun (Verification/Due diligence) and Satr (Privacy/Confidentiality).

### Gap closed

The directory previously ended at discovery. A consumer could find a professional but had no platform-native, privacy-safe way to express a serious opportunity without receiving private contact information automatically.

### Implemented bridge

talent_inquiry provides:

1. active-member requester;
2. verified professional target;
3. subject and message;
4. optional organization context, scoped to an organization the requester actually belongs to;
5. professional accept/decline;
6. optional explicit contact release;
7. close;
8. audit trail.

Contact information remains hidden unless the professional accepts and explicitly releases it.

This is a lead/opportunity bridge, not a replacement for Phase 3 recruitment or Phase 4 service requests.

## Phase 3 — Organizations and Jobs

### What was already correct

- Organization verification precedes job publication.
- Organization roles are scoped.
- Exclusive jobs have controlled eligibility.
- Applications preserve the profile/eligibility snapshot used at submission.
- Private Phase 2 evidence is not copied into candidate records.
- Candidate transitions are controlled.

### Gap closed

The candidate workflow previously allowed an organization actor to move an application directly to accepted. That confuses an employer decision with the candidate's consent.

### Implemented correction

The organization can issue an offer and record amount, currency, terms and offer timestamp.

The candidate must explicitly accept the offer through the candidate-owned response endpoint.

The candidate may also withdraw from active recruitment stages.

The organization can then move an accepted candidate to hired.

This separation supports Adl (Justice/Fairness) and Amanah (Trust/Responsibility) because the system does not manufacture a person's acceptance.

Interview calendars, contracts, onboarding and payroll remain separate workflow domains and should be integrated when the later project/event/operations phases are built.

## Phase 4 — Services

### Critical gap identified

The original Phase 4 satisfied the literal connection exit:

listing -> request -> accepted -> in progress -> completed

but completed could be reached without a structured deliverable, requester acceptance, payment settlement or measurable delivery checkpoint.

That was insufficient for a professional who expects a service to create actual economic or practical value.

### Implemented service-delivery model

A service engagement can now carry:

- scope;
- agreed/proposed price;
- currency;
- completion deadline;
- milestones;
- delivery submissions;
- private delivery files;
- requester review;
- revision requests;
- provider completion submission;
- requester acceptance;
- outcome summary;
- service feedback.

For paid services:

payment submitted -> finance/reviewer verification -> delivery acceptance.

A paid service cannot be finally accepted until a successful service payment exists.

Payment verification proves settlement; requester acceptance proves that the delivered outcome was accepted. The two are deliberately separate.

## Phase 4 — Mentorship

### Critical gap identified

The original workflow proved that a mentor and mentee could connect, meet and eventually mark the mentorship completed. It did not require an outcome definition.

### Implemented outcome model

A mentorship can now have goals containing:

- title;
- description;
- success measure;
- target date;
- owner role;
- status: planned, in progress, achieved, not achieved or cancelled.

Sessions also support outcome and next-step information.

This makes mentorship completion distinguishable from goal achievement.

## Governance rationale

The hardening is consistent with the platform's existing Islamic governance vocabulary:

- Adl = Justice/Fairness: actor authority is separated so one participant cannot create another participant's consent.
- Amanah = Trust/Responsibility: service and recruitment commitments are represented as auditable records.
- Tabayyun = Verification/Due diligence: verified professional status remains based on controlled evidence, not service publication, popularity or feedback.
- Satr = Privacy/Confidentiality: discovery does not expose private evidence or contact information automatically.
- Ihsan = Excellence: workflows capture deliverables, acceptance and measurable goals rather than stopping at connection.
- Shura = Consultation: mentorship and service outcomes preserve participant interaction rather than replacing human agreement with an opaque score.

The International Islamic Fiqh Academy identifies transparency, justice, equity, cooperation, excellence and accomplishment among its core values. Its Resolution No. 1 also emphasizes accuracy, objectivity, impartiality and documentation when evaluating evidence. These are governance references, not claims that the software itself is a religious ruling.

## Ethiopian data-protection consideration

The platform should continue minimizing unnecessary disclosure. Ethiopia's Ministry of Justice lists Personal Data Protection Proclamation No. 1321/2024 as in force. The inquiry/contact-release model therefore uses explicit participant consent rather than publishing personal contact information merely because someone appears in a professional directory.

## Outcome chains after hardening

### Professional opportunity

verified claim -> visible talent profile -> inquiry -> professional accepts -> optional contact release -> opportunity

### Employment

verified professional -> eligible job -> application -> screening -> interview -> offer -> candidate accepts -> hired

### Service

service listing -> request -> scope/price -> acceptance -> milestones -> delivery -> requester acceptance -> payment settlement -> feedback

### Mentorship

eligible mentor -> mentee request -> ranked matches -> mentor accepts -> active relationship -> goals -> sessions -> goal outcomes -> program completion -> feedback

## What this deliberately does not claim

- A directory view is not a job.
- A job application is not employment.
- A service listing is not income.
- A payment is not proof of service quality.
- A mentorship match is not mentorship success.
- A verified professional claim is not a guarantee of future performance.
- A feedback rating is not a verification decision.

The system now captures the missing transitions needed to move from connection toward real outcomes while preserving these boundaries.

## Acceptance tests

The hardening release adds automated coverage for:

- service completion requires provider submission and, for paid work, settled payment;
- job offer acceptance is candidate-owned;
- candidate withdrawal is candidate-owned;
- talent inquiry lifecycle is controlled and consent-based;
- terminal inquiry states cannot be reopened;
- previous Phase 2-4 lifecycle controls remain intact.

## Recommended next product layer

The next major improvement should be the actual member/organization UI around these workflows:

- opportunity inbox;
- service engagement workspace;
- milestone/delivery workspace;
- payment evidence/verification status;
- mentorship goal dashboard;
- candidate offer/acceptance view;
- notification/SMS delivery.

The API/domain layer should remain the source of truth. The UI should visualize these real states rather than inventing a second workflow.

## Release gate

Do not call outcome hardening complete until:
1. migration passes from a clean database;
2. unit tests pass;
3. application smoke test passes;
4. route-level authorization is verified;
5. the final branch CI run is successful;
6. the pull request is merged and main CI is successful.

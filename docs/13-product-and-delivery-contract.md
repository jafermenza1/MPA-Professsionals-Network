# Product and Delivery Contract

## 1. Purpose

This document is the working agreement between product ownership and engineering for ET Professionals Network.

It defines what is being built, what counts as complete, how changes are approved and what must not be silently assumed by developers.

## 2. Product contract

The platform must provide a coherent professional ecosystem rather than unrelated feature pages.

The minimum connected chain is:

Account -> Professional identity -> Membership -> Verification -> Opportunity -> Participation -> History -> Renewal.

For organizations:

Organization account -> Verification -> Talent/opportunity request -> Collaboration -> Outcome -> Continued partnership.

## 3. Required ownership boundaries

MPA platform owns:
- user identity;
- membership;
- professional profile;
- verification workflow;
- organization relationship;
- jobs;
- service listings;
- mentorship;
- events;
- project records;
- donation records;
- notification preferences;
- audit and governance records.

External systems own:
- payment execution at payment provider;
- learning execution in Moodle;
- external calendar execution at calendar providers;
- message delivery at SMS/email providers.

The MPA platform stores the normalized business records required to coordinate these systems.

## 4. Acceptance contract

A feature is accepted only when:
1. requirements are implemented;
2. business states are explicit;
3. authorization is enforced server-side;
4. errors are handled;
5. audit behavior exists where required;
6. automated tests cover important rules;
7. integration failures are handled;
8. documentation is updated;
9. CI passes;
10. product owner acceptance criteria pass.

A visually complete page with missing backend rules is not complete.

## 5. Data contract

Developers must not create duplicate representations of the same business concept.

Examples:
- one canonical membership lifecycle;
- one canonical payment state model;
- one canonical organization authorization model;
- one canonical notification mechanism;
- one canonical verification workflow.

If another representation is required for an external provider, it must be an adapter or projection with explicit ownership.

## 6. Integration contract

Every external integration must have:
- provider adapter;
- configuration;
- credential management;
- request/response mapping;
- timeout handling;
- retry policy;
- idempotency strategy;
- error mapping;
- monitoring;
- operational recovery path.

An external provider outage must not corrupt core business state.

## 7. UX contract

Users must be able to understand:
- what they are doing;
- why they are eligible/ineligible;
- what is pending;
- what action is required;
- whether payment succeeded;
- whether a verification claim is trusted;
- what changed after rescheduling.

The UI must not expose internal implementation terminology unless useful to an operational user.

## 8. Security contract

No feature is allowed to bypass:
- authentication;
- authorization;
- resource scope;
- privacy visibility;
- audit requirements.

Client-side restrictions are never sufficient.

## 9. Financial contract

No client-side value can be treated as authoritative for:
- payment amount;
- payment success;
- donation success;
- membership activation;
- refund state.

Financial state must be confirmed through trusted server/provider evidence.

## 10. Workflow contract

Every important state transition must answer:
- who performed it;
- when;
- from which state;
- to which state;
- why, where required;
- what downstream event was produced.

## 11. Change control

Changes are classified as:

Minor: copy, styling or non-behavioral change.

Functional: changes behavior within an existing capability.

Business-rule: changes eligibility, workflow, financial or governance rules.

Architectural: changes data ownership, integrations, deployment or major technical structure.

Business-rule and architectural changes require documentation updates and explicit approval before implementation.

## 12. Non-goals

The first releases do not attempt to:
- recreate LinkedIn social networking;
- recreate Moodle;
- become a full banking platform;
- create an uncontrolled public marketplace;
- guarantee employment or income;
- replace human verification with AI;
- implement microservices solely for appearance;
- build every mobile-native capability before validating the web platform.

## 13. Definition of success

The platform is successful when:
- members use it for practical professional value;
- organizations use it to find and engage capability;
- MPA can measure membership, opportunity, development and community impact;
- critical workflows are trustworthy and auditable;
- the platform can evolve without rewriting its core domain.

## 14. Product owner authority

Product ownership decides:
- business policy;
- membership benefits;
- eligibility;
- pricing;
- public visibility policy;
- governance rules;
- release priority.

Engineering decides:
- implementation technique;
- internal architecture within approved boundaries;
- testing strategy;
- performance/security implementation;
- operational tooling.

Cross-boundary decisions are recorded as ADRs or explicit product decisions.

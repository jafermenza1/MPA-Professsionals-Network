# Architecture Decision Records

Record decisions with meaningful long-term consequences.

Each ADR should contain:
- title;
- status;
- date;
- context;
- decision;
- alternatives;
- consequences.

## ADR-001 — Modular monolith first

Status: Accepted.

Decision: begin with a modular monolith with strict domain boundaries.

Reason: the platform has many domains, but initial distributed-service complexity is not justified. Clean boundaries preserve future extraction options.

## ADR-002 — PostgreSQL for transactional core

Status: Accepted.

Decision: use PostgreSQL or equivalent relational transactional storage for core records.

Reason: membership, workflows, payments, organizations, applications and audit records require relationships and consistency.

## ADR-003 — Moodle remains external learning engine

Status: Accepted.

Decision: MPA stores learning integration records while Moodle executes learning activities.

Reason: avoid rebuilding a mature LMS and preserve clear ownership.

## ADR-004 — Provider abstraction for payments

Status: Accepted.

Decision: Telebirr is the initial provider, but the domain uses a provider-neutral payment abstraction.

Reason: adding or replacing a provider should not require rewriting membership or donation logic.

## ADR-005 — Central notification service

Status: Accepted.

Decision: SMS, email and in-app delivery are centralized.

Reason: prevent every module from duplicating provider, template, preference and retry logic.

## ADR-006 — Explicit workflow states

Status: Accepted.

Decision: business workflows use explicit state transitions and audit records.

Reason: membership, verification, payment, project and event decisions have governance consequences and cannot rely on free-form status changes.

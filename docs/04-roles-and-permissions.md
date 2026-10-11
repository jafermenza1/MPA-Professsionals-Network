# Roles, Organizations and Authorization

## 1. Principle

Authentication answers who the user is.

Authorization answers what the user can do.

Membership answers what relationship the person has with MPA.

Verification answers which claims have been reviewed.

These must remain separate.

## 2. Actors

Public: unauthenticated visitor.

Account User: authenticated user who may not be a member.

Member: user associated with active/eligible membership.

Mentor: approved professional with mentoring capability.

Mentee: user eligible to request mentoring.

Employer/Organization User: user acting for an organization.

Project Participant: person assigned to a project.

Field Officer: authorized operational user.

Reviewer: authorized workflow reviewer.

Finance Officer: authorized payment/reconciliation user.

Content/Event Manager: manages events/resources within scope.

Learning Administrator: manages Moodle integration records.

Project Manager: manages project execution.

System Administrator: technical administration.

Super Administrator: highest platform administration, restricted and audited.

## 3. Organization authorization

An organization name in a profile does not grant organization privileges.

Access requires OrganizationMembership with an explicit role and scope.

Suggested organization roles:
- owner;
- administrator;
- recruiter;
- project manager;
- event manager;
- finance;
- read-only representative.

## 4. Permission model

Use resource/action permissions, for example:
membership.read_own, membership.review, membership.approve, membership.suspend
profile.read_public, profile.read_member, profile.update_own, profile.moderate
verification.submit, verification.review, verification.approve, verification.reject
job.create_own, job.publish, job.apply, job.review
mentorship.request, mentorship.match, mentorship.manage
event.create, event.publish, event.reschedule
project.create, project.manage, project.inspect, project.publish_evidence
payment.initiate, payment.view, payment.reconcile
audit.read

## 5. Scope

Permissions may be scoped to:
- self;
- organization;
- assigned project;
- assigned geography;
- global.

A reviewer assigned to Project A does not automatically receive Project B access.

## 6. Separation of duties

Where practical, one person should not both initiate and finally approve high-risk financial or governance operations.

Examples include payment reconciliation, membership exceptions, project financial approvals and conflicted verification decisions.

Enforced identity-administration rules for the current implementation:
- An administrator cannot grant, remove, or otherwise change their own roles.
- Only a current `system_admin` may grant/remove privileged roles (`system_admin`, `super_admin`, `admin`, `reviewer`, `verification_reviewer`, `ethics_reviewer`, `appeal_reviewer`, `finance_officer`) or modify a privileged account.
- Privileged-role decisions use the actor's current database roles; signed token role claims are not authoritative.
- Role and account-status changes revoke existing sessions. A user must authenticate again after the change.
- The last `system_admin` cannot be removed; concurrent last-admin removals are serialized.
- Organization verification reviewers cannot decide a case for an organization they created, submitted, or actively belong to. Conflicts fail closed; a separate reviewer must decide.

## 7. Backend enforcement

Hiding a button is not authorization.

Every protected API must validate:
1. authentication;
2. account status;
3. role/permission;
4. resource scope;
5. business eligibility.

## 8. Conflict of interest

Reviewers must not approve their own records or records where an explicit conflict exists. The system should support reassignment.

## 9. Audit

Role/permission changes record actor, affected user, old role, new role, scope, reason and timestamp. The current user-administration audit event records prior/current role sets, prior/current account status, platform scope, requested change, optional reason, actor, affected user, request ID and timestamp. Successful private evidence reads record the reader, file resource, request ID, content type and byte size; file contents and secrets are not copied into the audit record.

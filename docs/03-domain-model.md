# Domain Model and Business Rules

## 1. Modeling principle

Identity, membership, profile, verification and participation are separate concepts.

A user is not automatically a member. A member is not automatically verified. A verified claim is not the same as a verified person.

## 2. Core entities

User: authentication/account identity.

Person: human subject behind the account.

Membership: contractual relationship with MPA. Fields include membership number, type, status, start/end dates, fee and application reference.

ProfessionalProfile: professional information belonging to a person.

Organization: employer, institution, NGO, company, public body, association or other stakeholder.

OrganizationMembership: authorization for users to act for an organization.

VerificationCase: review process for a claim.

VerificationClaim: exact claim being verified, such as profession or qualification.

EvidenceDocument: uploaded or generated evidence with secure object reference and metadata.

Job: employment opportunity.

JobEligibilityRule: conditions for exclusive opportunities.

JobApplication: person's application.

ServiceListing: professional service offered by a member.

ServiceRequest: stakeholder request for a service.

MentorProfile: mentor capability.

MentorshipRequest: request from a mentee.

Mentorship: accepted mentoring relationship/program.

MentorshipSession: individual session.

Event: organized event.

EventRegistration: attendance intent.

CalendarSyncRecord: external calendar synchronization state.

Course: MPA-visible learning offering.

LearningRecord: enrollment/completion information from Moodle.

Certification: credential/completion record.

Project: community or institutional project.

ProjectParticipation: person/organization participation.

VolunteerAssignment: volunteer role.

Donation: financial contribution.

Payment: payment attempt/transaction.

FieldVisit: operational project visit.

EvidenceRecord: project/field evidence.

Inspection: formal review/inspection.

Notification: message intended for a user.

AuditLog: immutable business/security event record.

## 3. Key relationships

User -> Person -> ProfessionalProfile.

Person -> historical/current Membership records.

Person -> VerificationClaims.

Organization -> OrganizationMembership -> User.

Organization -> Jobs.

Job -> JobApplications -> Person.

Person -> ServiceListings -> ServiceRequests.

Person -> MentorProfile -> MentorshipRequests -> Mentorship -> Sessions.

Event -> Registrations.

Project -> Participation, VolunteerAssignment, Donations, FieldVisits and Evidence.

Payment -> membership, donation, event or another billable purpose.

## 4. Workflow rule

Every workflow entity must define:
- states;
- permitted transitions;
- actor allowed to transition;
- timestamp;
- optional reason;
- audit record.

Do not implement workflows as arbitrary status strings.

## 5. Membership rules

1. Only an approved membership application can become Active.
2. If the membership plan has a fee, payment confirmation is required before activation.
3. Failed payment cannot activate membership.
4. Renewal preserves historical membership periods.
5. Expiry does not delete historical data.
6. Grace period behavior is configurable.
7. Suspension records reason and actor.
8. Membership status does not automatically imply professional verification.

## 6. Eligibility rules

Exclusive jobs, mentorship, courses and other opportunities should use configurable rules.

Example: active membership AND profession verified.

Eligibility checks belong in a central policy/eligibility layer, not duplicated in controllers.

## 7. Visibility

Every public-facing professional field has an explicit visibility policy:
- public;
- members only;
- organizations only;
- private.

Evidence documents remain private unless an explicit publication workflow makes a safe derivative available.

## 8. Payment rules

A payment is not the same thing as the business transaction it pays for.

Membership renewal contains amount due, payment attempts, provider references, reconciliation and final financial state.

This separation permits duplicate, failed and delayed payment handling.

## 9. Audit rules

Audit critical actions including authentication/security events, membership decisions, verification decisions, payment state changes, job moderation, organization verification, mentorship decisions, project approvals, donation allocation, evidence review and permission changes.

## 10. Deletion

Financial, legal, audit and historical records must not be casually hard-deleted. Prefer archival/deactivation and retention policies.

## 11. Time

Store backend timestamps in UTC. Preserve timezone information for events and calendar synchronization. Render Ethiopian local time where appropriate.

## 12. Geography

Use structured country, region, city and applicable administrative levels. Optional coordinates may be stored for field/project purposes. Do not make important geography free-text only.

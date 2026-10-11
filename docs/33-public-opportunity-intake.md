# Public Job & Mentorship Intake

## Purpose
The public side now supports low-friction first contact for employment and mentorship without forcing a visitor to complete the full authenticated workflow before their intent is understood.

The design follows **Adl (Justice)** and **Satr (Confidentiality)**:

1. Public visitor selects a public job or mentorship path.
2. First submission collects only intent and contact information plus consent.
3. The system returns a reference and one continuation secret.
4. The continuation page explains the formal application path and accepts useful detailed information.
5. Formal job eligibility, professional verification, membership rules and mentorship matching remain governed by the existing authenticated workflows.
6. Non-member consideration is never automatic. An authorized administrator or organization user must explicitly record the decision.

## Job path
- Public vacancies are discoverable through `/jobs`.
- `/apply/job` accepts a specific public vacancy or general job interest.
- The first step records name, email/phone and intent.
- The detailed continuation can capture summary, experience, education, skills, availability, motivation and document notes.
- Organization users authorized for the vacancy can see the inquiry.
- Organization decision roles are owner, administrator, recruiter and project manager.
- A decision can move the inquiry to considering/invited/declined/closed and explicitly enable non-member consideration.

## Mentorship path
- Public mentor discovery remains available through `/mentorship`.
- `/apply/mentorship` accepts a goal and contact information first.
- A visitor may select a public mentor or request matching assistance.
- Detailed information can be supplied through the secure continuation.
- System administrators/supporting staff or the selected public mentor can review the inquiry.
- Non-member consideration is explicit and auditable.

## Privacy boundary
The public inquiry stores contact information and applicant-provided intent/details. It does not expose Phase 2 private evidence, reviewer notes, verification evidence, or internal organization notes.

The continuation token is stored only as a SHA-256 hash. The raw token is returned to the applicant at submission time and is required for unauthenticated continuation/tracking.

## API
- `POST /api/v1/public/opportunity-inquiries`
- `GET /api/v1/public/opportunity-inquiries/:reference/details?token=...`
- `PATCH /api/v1/public/opportunity-inquiries/:reference/details`
- `POST /api/v1/public/opportunity-inquiries/:reference/link`
- `GET /api/v1/opportunity-inquiries` — authorized inbox
- `PATCH /api/v1/opportunity-inquiries/:id` — authorized human decision

## UI entry points
- Landing page: public Jobs and Mentorship application cards.
- Global navigation: Apply.
- `/jobs` → public job inquiry.
- `/mentorship` → public mentorship inquiry.
- `/track?ref=...&token=...` → secure inquiry tracking.
- `/apply/opportunity?ref=...&token=...` → detailed continuation.

This is an intake layer, not a replacement for the governed ATS or mentorship lifecycle.

# Privacy, consent and policy UX implementation

Date: 2026-10-16  
Repository: `jafermenza1/MPA-Professsionals-Network`  
Branch: `reconciliation/holistic-gates`  
PR: #3 — keep open and draft until validation and legal review are complete.

## Implemented in source

- Added shared policy rendering in `web/components/legal-document.tsx` and dedicated public routes:
  - `/privacy` — Privacy Notice.
  - `/terms` — Terms of Use.
  - `/cookies` — Cookie Policy.
  - `/community-guidelines` — professional conduct and reporting.
  - `/accessibility` — accessibility approach and limitations.
  - `/contact/privacy` — privacy request guidance.
- Added compact `web/components/privacy-consent.tsx` and mounted it in the existing shared shell. It adds a small persistent Privacy control and a compact first-visit prompt; no global footer was created.
- The preference interface distinguishes necessary storage from optional analytics and personalization, offers Accept all / Reject optional / Customize, supports Escape and backdrop dismissal, and provides links to policy routes.
- Preferences are stored locally under `mpa-privacy-preferences-v1` with a policy version, selected categories and timestamp. The interface explicitly says this is browser-local, does not synchronize across devices, and does not itself load analytics or advertising tools.
- Added explicit Terms of Use agreement and Privacy Notice acknowledgement to registration for professional and organization account types. This is separate from optional cookie preferences; refusing optional technologies does not block registration.
- Added policy links to the sign-in journey and cross-links among policy pages.
- Policy text covers MPA's professional-network use cases: profiles and public visibility, organization representatives, membership and verification, job/recruitment applications, candidate information release, mentorship, services, evidence uploads, support, retention, security, user rights, acceptable use, user content, suspension, disclaimers and complaints.
- The policy page clearly marks content as foundational and pending MPA approval rather than representing it as legally approved.

## Important boundaries — do not misrepresent as complete

- Source search did not establish an active analytics or advertising provider. The consent UI is a preference-recording foundation; it does not activate or gate a third-party tracker by itself. Any future optional integration must read the saved choice before loading and must be reviewed against applicable consent requirements.
- The current preference record is local to one browser. It is not a server-side, account-level, cross-device or audit-grade consent ledger.
- The privacy-contact page provides guidance only; it does not submit a request, send email, or invent an unverified contact address. The Association should confirm and publish an official privacy contact and operational response process.
- The notice does not assert that all data is hosted in Ethiopia or claim retention schedules that have not been confirmed. The Association must confirm its legal entity, controllers/processors, providers, actual data flows, retention periods, transfers, incident process and legal contact details.
- The Terms checkbox records agreement through the registration UI, but durable server-side evidence of the accepted terms version and timestamp has not been established by this source-only change. Before release, bind agreement to a versioned server-side record and ensure the API contract rejects registration without the required acceptance where appropriate.
- Existing accounts have not been retroactively required to accept the new terms. If legal review identifies a material update requiring renewed acceptance, implement a versioned re-acceptance workflow without locking users out of essential account/privacy controls.

## Acceptance criteria still open

1. Review policy wording with MPA's authorized representative and qualified counsel familiar with applicable Ethiopian data-protection and other relevant laws.
2. Confirm actual entity/controller identity, official contact details, providers, cross-border transfers, purposes, retention schedules, user-rights handling and complaint/incident process.
3. Wire every optional analytics/personalization/advertising integration to the preference gate before that integration is enabled; ensure withdrawal disables it.
4. Persist terms acceptance version, timestamp and subject identity server-side and document the API contract; preserve separate optional marketing consent if marketing is offered.
5. Confirm all relevant registration paths (including API-level or alternate flows) enforce the agreement policy consistently without misusing cookie consent as a condition of service.
6. Source review of all policy routes and the consent component remains implementation review only. Build, typecheck, lint, automated tests, browser behavior, accessibility, localization and production checks have intentionally not been run.
7. Keep PR #3 open and draft until these implementation gaps, validation and legal approval are resolved.

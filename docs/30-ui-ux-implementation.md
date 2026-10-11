# MPA Enterprise UI/UX Implementation

The repository now contains a real Next.js 14 presentation layer under web/. It follows the requested Ethical Elegance & Frictionless Utility strategy rather than adding static design-only mockups.

## Implemented
- Light default / dark option with semantic design tokens.
- Ihsan palette: Navy #123B6D / deep navy #0E2F57, Lemon #D9E85B, Obsidian #0f172a. Brand colors are defined as shared semantic tokens and applied across light/dark modes, Tailwind utilities, navigation, actions, badges, guides, and forms.
- Inter + Noto Sans Ethiopic.
- Tailwind utilities and bespoke responsive CSS.
- Framer Motion for purposeful card transitions.
- Zustand for theme/language/offline queue state.
- TanStack Query for server-state caching.
- Radix Dialog dependency included for the next accessible drawer/modal increment.
- Desktop sticky navigation, global search affordance, notification/theme/language controls.
- Mobile five-tab bottom navigation.
- Persona-oriented feed, vetted talent registry view, ATS/job portal view, mentorship matching view and rugged field workspace.
- PWA manifest and service-worker fallback shell.
- Live API boundary for GET /api/v1/me/outcomes when a bearer token is supplied; no fake production data is claimed.

## Governance language
UI uses paired terms: Adl (Justice), Amanah (Trust/Responsibility), Tabayyun (Verification/Due diligence), Satr (Privacy/Confidentiality), Ihsan (Excellence). Verification evidence and reviewer notes are never rendered in public talent cards.

## Deliberate boundary
The field queue is currently a UI-level queue because the contract places the real offline evidence/sync engine in Phase 8. It does not falsely report central upload success. Likewise the job and mentor cards are interaction-ready presentation projections until their live discovery endpoints are exposed.

## Next UI increment
Connect authentication/session screens, real Phase 2 talent discovery, Phase 3 job discovery/application progress, Radix drawer/modal for talent quick view and payment, and automated browser accessibility/PWA tests.
# ET Professionals Network

Digital platform for the Ethiopian Muslim Professionals Association (MPA).

The product is a trusted professional ecosystem connecting professionals, members, organizations, employers, mentors, learners, volunteers, donors, project teams and institutional partners.

## Product promise

For professionals: build a trusted professional identity, maintain membership, prove capability, discover opportunities, access mentorship and learning, offer services, participate in projects and build a record of contribution.

For organizations: find relevant professionals, recruit talent, request services or expertise, publish jobs/events, collaborate on projects, sponsor community work and access structured professional capability.

For MPA: turn membership into measurable professional, economic and community value while maintaining governance, verification, accountability and reliable records.

## Documentation

- docs/01-product-requirements.md
- docs/02-product-value-proposition.md
- docs/03-domain-model.md
- docs/04-roles-and-permissions.md
- docs/05-workflows.md
- docs/06-system-architecture.md
- docs/07-api-contract.md
- docs/08-security-privacy.md
- docs/09-ux-information-architecture.md
- docs/10-implementation-plan.md
- docs/11-quality-acceptance.md
- docs/12-developer-guide.md
- docs/adr/README.md
- docs/20-reference-portfolio-implementation.md

## Initial implementation

The executable database foundation is under `db/`: PostgreSQL migration and a safe, configuration-first baseline seed package for the Reference Portfolio. The seed intentionally leaves external classification rows empty so imported releases can be validated and published rather than silently inventing authoritative data.

## Core principle

The platform is not a single giant dashboard. It is a set of connected business capabilities built around common identity, membership, professional profile, verification, opportunity and collaboration workflows.

Member journey: Join -> build profile -> verify -> discover opportunity -> participate -> build professional history -> renew.

Stakeholder journey: Register organization -> verify -> discover talent -> create opportunity/request -> collaborate -> measure result -> continue partnership.

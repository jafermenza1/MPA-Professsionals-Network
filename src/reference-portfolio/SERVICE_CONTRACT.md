# Reference Portfolio Service Contract

The application service sits between admin UI/import adapters and the PostgreSQL reference portfolio.

## Required operations

- `listDatasets()`
- `getPublishedVersion(datasetKey)`
- `createDraftVersion(datasetKey)`
- `validateImport(request)`
- `previewDiff(baseVersion, importedRows)`
- `submitForReview(versionId)`
- `approve(versionId)`
- `publish(versionId)`
- `schedule(versionId, effectiveAt)`
- `archive(versionId)`

## Invariants

1. Only validated versions can be approved.
2. Only approved versions can be published.
3. Published versions are immutable.
4. Publishing is transactional.
5. A failed import never changes the published version.
6. Every publication records actor, timestamp, version and reason.
7. Historical business records retain the reference version used at creation.
8. Referenced reference items cannot be hard deleted.
9. Hierarchy cycles and orphan parents are publication blockers.
10. Membership fee changes create a new fee-rule version; they never rewrite prior obligations.

## Adapter boundary

Parsing CSV/XLSX/JSON belongs to import adapters. Validation is format-neutral and consumes normalized rows. Persistence belongs to a repository implementation. The domain layer must not depend on a specific HTTP framework, spreadsheet library or database client.

## First tests

The service test suite must cover duplicate codes, missing parents, cycles, invalid status, atomic publication, immutable published versions, historical fee rules and checklist version resolution.

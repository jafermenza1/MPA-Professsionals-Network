# Database Migration Operations Runbook

**Applies to:** `scripts/migrate.js`, `db/migrations/*.sql`, and the `app_schema_migration` ledger.  
**Contract anchors:** `docs/03-domain-model.md`, `docs/06-system-architecture.md`, `docs/07-api-contract.md`, `docs/08-security-privacy.md`, `docs/11-quality-acceptance.md`, and the holistic reconciliation roadmap.

## Non-negotiable safety rules

1. Never point the disposable legacy-adoption test at staging or production. It intentionally creates and drops a synthetic migration file and database objects.
2. Never guess `MIGRATION_BASELINE`. It must be the exact filename of the last migration independently verified as applied to the target schema.
3. Do not replay the historical migration chain on an existing database without a ledger. The runner must fail closed unless an explicit baseline is supplied.
4. Do not edit an applied historical SQL migration. Add a new forward migration and retain the checksum guard.
5. A transaction protects one migration and its ledger entry; it does not automatically reverse earlier migrations that already committed.
6. No production migration is approved by this runbook alone. Require a verified backup, successful restore rehearsal, reviewed baseline, maintenance plan, and explicit operator approval.

## 1. Preflight and target identification

- Confirm repository, branch, commit SHA, PostgreSQL host, database name, and environment with a second reviewer.
- Confirm the target is the intended database and that credentials are supplied through the deployment environment/secret manager, never pasted into logs or this document.
- Check whether `public.app_schema_migration` exists and inspect its rows if present:
  ```sql
  SELECT filename, checksum, applied_at
  FROM public.app_schema_migration
  ORDER BY filename;
  ```
- If the ledger exists, compare each recorded checksum to the current repository migration and stop if an applied checksum differs.
- If the ledger is absent, inventory the actual schema, constraints, indexes, extensions, and representative row counts. Do not choose the highest-looking migration number based only on a table or one constraint. A baseline means the whole migration prefix has been verified.

## 2. Backup and restore rehearsal

- Schedule a maintenance window and coordinate write-quiescence where required by the application.
- Take a database-native backup using the approved operations procedure. Store it outside the application database, restrict access, and record its timestamp and integrity result.
- Restore that backup to a separate, isolated PostgreSQL database. Verify that the restored database is usable and compare key table counts and business-critical records with the source.
- Perform baseline discovery and the migration rehearsal against the restored copy, not against production.
- If restore verification fails, stop. A backup file that has not been restored successfully is not sufficient evidence for a production migration.

## 3. Verify and record a legacy baseline

For an existing schema with no migration ledger:

1. Compare the restored schema against the effects of the repository migrations in order. Inspect tables, columns, constraints, indexes, and data-dependent changes; investigate differences rather than treating them as already applied.
2. Identify the last contiguous migration whose effects are verified. A gap or uncertain migration means the baseline is not established.
3. Record the exact filename and supporting review evidence in the change record.
4. On the restored database only, run the migration runner with that exact filename, for example:
   ```sh
   MIGRATION_BASELINE=010_phase3_hardening.sql npm run migrate
   ```
   This example is a test fixture, **not** a recommended production value.
5. Inspect the ledger checksums and confirm that only migrations after the baseline were executed. Validate representative schema objects, constraints, application health, and business-critical data.
6. Repeat the migration command without `MIGRATION_BASELINE`; it should be a no-op once the ledger is populated.

If any of these checks are uncertain or fail, stop and revise the migration plan. Do not work around the guard by inserting guessed ledger rows or dropping the ledger.

## 4. CI verification

The CI job provisions PostgreSQL 16 and runs:
- full fresh migration chain;
- ordinary migration rerun;
- isolated legacy schema setup through `010_phase3_hardening.sql`;
- fail-closed check when a baseline is omitted;
- explicit baseline adoption and forward migration through the remaining migration files;
- sentinel-row preservation;
- injected migration failure to verify DDL and ledger-row rollback;
- clean rerun after removing the synthetic failing migration;
- unit tests, web production build, and application smoke test.

The disposable test baseline is known because the test itself applies migrations 001–010. That fact does not establish the production baseline.

## 5. Production change window checklist

Proceed only after the restored-copy rehearsal passes and the baseline has been independently reviewed.

- [ ] Approved change window, owner, reviewer, and communication plan recorded.
- [ ] Backup created and restore rehearsal passed.
- [ ] Production schema inventory and exact baseline evidence reviewed.
- [ ] Candidate commit and CI push/PR runs are green.
- [ ] Database target and credentials independently confirmed.
- [ ] Migration command and expected post-migration ledger/schema state documented.
- [ ] Application smoke checks and domain-critical read/write checks ready.
- [ ] Recovery owner and decision point documented.

After migration, inspect ledger checksums/timestamps, confirm the expected schema constraints and indexes, run health and authenticated smoke checks, and verify representative records. Record the exact commit, database environment, migration result, and any deviations without recording secrets or personal data.

## 6. Failure and recovery

- If an individual migration fails, the runner executes that migration and its ledger insert in one transaction. Confirm both schema changes and the ledger row rolled back before retrying.
- If a later migration fails after earlier migrations have committed, do not assume the whole migration sequence was rolled back.
- Use the reviewed recovery plan: restore the verified backup when necessary, or apply a reviewed forward-fix if data safety and compatibility are demonstrated.
- Never delete migration history, modify a recorded checksum, or blindly rerun historical SQL to force progress.
- Keep production unchanged if baseline confidence, backup integrity, or recovery readiness is insufficient.

## 7. Current evidence and explicit limitation

As of commit `b28574fc20b7ad0407bba2968e2f48ffae961445`, CI push run [38050311573](https://github.com/Jafermenza/ET-Professionals-Network/actions/runs/38050311573) and PR run [38050314006](https://github.com/Jafermenza/ET-Professionals-Network/actions/runs/38050314006) pass the disposable PostgreSQL migration scenarios.

**The production database has not been inspected and no production baseline is approved. No production migration or deployment has been performed.** This remains a mandatory precondition for any real database migration.

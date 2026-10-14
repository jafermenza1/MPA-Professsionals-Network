# cPanel Deployment Record and Repeatable Checklist

**Record date:** 2026-10-13 (updated with follow-up checks on 2026-10-14)  
**Repository:** `jafermenza1/MPA-Professsionals-Network`  
**Hosting:** cPanel / CloudLinux Node.js Selector on the Sapphire host  
**Purpose:** Preserve what was actually deployed, the evidence observed, and the safe sequence to use for future deployments.

> This record is an operational journal, not a blanket guarantee of production readiness. The portal build, basic HTTP smoke tests, live PostgreSQL schema checks, and repository migration application have now been observed as successful. The user also reports that the portal workflows they tested are working well. Backup restoration has not been rehearsed, and security/recovery acceptance should remain separately tracked.

## 1. Live application layout

| Component | Domain | Application root | Startup |
|---|---|---|---|
| API | `api.muslimprofession.org` | `/home/muslimjq/ET-Professionals-Network` | `server.js` |
| Portal (Next.js) | `portal.muslimprofession.org` | `/home/muslimjq/portal-web` | Preserve the existing live `server.js` |

- Node.js runtime reported by SSH: `v22.23.3`.
- API virtual environment: `/home/muslimjq/nodevenv/ET-Professionals-Network/22`.
- Portal virtual environment: `/home/muslimjq/nodevenv/portal-web/22`.
- The live portal `node_modules` is a symlink to `/home/muslimjq/nodevenv/portal-web/22/lib/node_modules`.
- Preserve the live API and portal environment settings. In particular, do not overwrite live startup files or `.env` files during a frontend build activation.
- PostgreSQL is used. Do not print, paste into chat, or commit `DATABASE_URL`, passwords, JWT secrets, or bootstrap credentials.

## 2. Deployment progress recorded

### 2.1 Portal build prepared in staging

Staging build directory:

```text
/home/muslimjq/ETPN-build/web
```

Staging build ID:

```text
2u9g5g0gF5gnIaKn-Gp2q
```

The generated Next.js build manifest contained the intended same-origin rewrite:

```text
/api/:path*  ->  https://api.muslimprofession.org/api/:path*
```

The browser uses same-origin `/api/*` paths; the server-side Next.js rewrite forwards these to the API. The production build's manifest was checked for the API destination.

### 2.2 Pre-deployment backup created and checked

Backup created:

```text
/home/muslimjq/portal-web-before-deploy-20261013-214519.tar.gz
```

Reported size: approximately 23 MB. The archive listing check passed with `tar -tzf`.

An earlier backup also exists:

```text
/home/muslimjq/portal-web-backup-20261013-212532.tar.gz
```

Keep these backups until the new release has been accepted and rollback is no longer needed. A valid archive listing is useful, but a restore rehearsal is stronger evidence than archive creation alone.

### 2.3 Portal build activated

The staging `.next` directory was first copied to a temporary directory under the live app:

```text
/home/muslimjq/portal-web/.next.new
```

The activation then moved the previous live build to `.next.previous`, moved `.next.new` to `.next`, and copied the required application source directories/files from staging. The operation reported:

```text
staging build ID: 2u9g5g0gF5gnIaKn-Gp2q
live build ID:    2u9g5g0gF5gnIaKn-Gp2q
PASS: build activated and critical live files preserved.
```

The live startup script and production dependencies were preserved. The live `.next.previous` directory is a rollback asset.

**Important follow-up:** A later attempt to repeat activation stopped because `.next.previous` already existed. This was a protective stop, not proof that the successful deployment had failed. Do not delete or overwrite `.next.previous` just to rerun the deployment. Do not repeat the copy/activation step unless a fresh backup and an explicit rollback/activation plan are in place.

### 2.4 HTTP smoke checks passed

After activation, these paths were checked and each returned HTTP 200:

- `https://portal.muslimprofession.org/`
- `https://portal.muslimprofession.org/login`
- `https://portal.muslimprofession.org/jobs`

This establishes that those routes responded successfully at the time checked. It does not by itself prove every authenticated workflow, API integration, or database operation.

### 2.5 API checks previously observed

These API checks returned HTTP 200:

- `https://api.muslimprofession.org/healthz` — response reported status `ok`.
- `https://api.muslimprofession.org/readyz` — response reported status `ready` and `databaseConfigured: true`.

Interpretation: `readyz` confirms the application reported that database configuration is present; do **not** treat that response alone as proof that every database query works or that the schema is migrated correctly.

### 2.6 Live PostgreSQL inspection, backup, and migrations completed

The running API's configured PostgreSQL database was inspected through the Node `pg` client in a read-only transaction. The connection string and credentials were not printed.

Observed before migration:
- Connected database: `muslimjq_mpaportal`.
- Public tables: 103.
- `public.app_schema_migration` did not exist.
- The user stated that no important live data had been recorded and explicitly authorized proceeding with the existing database. The existing cPanel database configuration was left unchanged.
- Read-only checks found the existing schema had a mixture of present and missing objects, including missing tracking-reference columns, permission tables, and private upload session table.

A PostgreSQL custom-format backup was created before the migration:
```text
/home/muslimjq/db-backups/mpa-2026-10-13T21-55-17-493Z.dump
```
Reported size was 363,355 bytes. `pg_restore --list` succeeded. This validates that the archive is readable/listable; it is **not** a restore rehearsal.

The migration runner was then invoked with the operator-confirmed baseline:
```bash
MIGRATION_BASELINE=017_production_security_and_sessions.sql npm run migrate
```
The runner recorded migrations 001–017 as the confirmed legacy baseline and successfully applied migrations 018, 019, 020, 021, 022, 023, 024, and `20261010190000_separate_directory_visibility.sql`. The notice that a directory-visibility constraint did not exist and was skipped was informational, not a failure.

Post-migration read-only verification reported:
- 25 migrations recorded; latest is `20261010190000_separate_directory_visibility.sql`.
- `app_permission`, `app_user_permission`, `private_upload_session`, `professional_profile.directory_visibility`, `professional_profile.skills`, and tracking-reference columns on job and membership applications were present.
- All 25 migration filenames matched the repository's current `main` migration inventory at the time checked.

Do not rerun the historical migration chain blindly. For future releases, use the ledger and checksum checks, inspect any new migration, back up first, and follow the migration runbook. The operator-confirmed baseline was used for this deployment only after the user authorized proceeding; do not copy that baseline into another database without independently verifying its schema.

## 3. Repeatable deployment procedure for the next release

### Step A — Identify the exact release

1. Confirm the repository and target branch/commit. Deploy a reviewed and merged commit, not an arbitrary working tree.
2. Review changes and relevant tests before uploading.
3. Confirm the staging build is from the intended commit and record its commit SHA and Next.js build ID.
4. Confirm the API and portal domains and roots from cPanel before running any write command.

### Step B — Back up the live portal

1. Create a new timestamped backup of the live portal before each release.
2. Validate the archive can be listed; for example:

   ```bash
   tar -tzf /home/muslimjq/portal-web-before-deploy-YYYYMMDD-HHMMSS.tar.gz >/dev/null
   echo $?
   ```

3. Record the exact backup path and keep the previous known-good build until acceptance.
4. Do not assume a backup has been proven restorable until a restore rehearsal is completed.

### Step C — Build and verify in staging

1. Build in the staging/release directory, not directly over the live portal.
2. Check that `.next/BUILD_ID` exists and record it.
3. Check that the generated rewrite manifest points `/api/:path*` to `https://api.muslimprofession.org/api/:path*`.
4. Confirm the required source files and assets exist in staging.
5. Do not copy staging `.env`, `server.js`, or `node_modules` over the live versions unless a separately reviewed deployment plan explicitly requires it.

### Step D — Activate the build once

Use the repository's deployment procedure and a fresh, unique temporary/rollback path. Before activation, check whether the intended temporary and rollback directories already exist. If they do, **stop and inspect them**—never delete them blindly.

The deployment should:
1. Copy the new `.next` build to a temporary location on the same hosting filesystem.
2. Verify the temporary build ID.
3. Preserve the previous live `.next` under a unique rollback name.
4. Move the temporary build into place.
5. Copy only the intended application files.
6. Preserve the live startup file, production environment configuration, and dependency symlink.
7. Compare staging and live build IDs.

Do not run an activation command a second time simply because the terminal disconnected or the output was pasted incorrectly. Reconnect and inspect the actual state first.

### Step E — Smoke test and observe

Run checks individually and record results:

1. Open the portal home, login, and jobs routes; confirm HTTP 200.
2. Check API `/healthz` and `/readyz`.
3. Test `/api/healthz` through the portal origin to verify the Next.js rewrite.
4. Exercise a real non-production/test account through the key supported workflows, where safe.
5. Inspect cPanel/Passenger logs if any check fails.
6. Record the build ID, timestamp, status codes, and any remaining gaps.

HTTP 200 alone is not complete production acceptance.

### Step F — Database and migrations (separate gated operation)

Follow [Database Migration Operations Runbook](32-migration-operations-runbook.md). Do not combine a portal build rollout with an unverified schema migration.

1. Identify the database used by the running API without revealing its URL/password.
2. Read-only inspect database identity, tables, and whether `public.app_schema_migration` exists.
3. If the ledger exists, compare its recorded migration filenames/checksums with repository migrations.
4. If the ledger is absent, inventory schema, constraints, indexes, extensions, and representative row counts; never guess `MIGRATION_BASELINE`.
5. Verify a database backup and successful restore rehearsal to an isolated database.
6. Rehearse the migration against the restored copy and obtain explicit approval before production changes.
7. Keep the old database until the replacement or migration is verified and accepted.

For this deployment, migrations have been applied and the post-migration schema was checked as recorded in §2.6. The cPanel database configuration was not changed. For future migrations, continue to use read-only inspection first, never expose secrets, and verify the backup/restore plan before modifying production.

## 4. Terminal operating rules

- Run only commands shown in a command block. Do not paste explanatory prose or terminal output back into the shell.
- If SSH disconnects, reconnect and inspect current state before resuming; commands before the disconnect may already have succeeded.
- Prefer short, independent commands so the result of each can be checked.
- Never share secret environment-variable values in chat or documentation.
- If a guard says a rollback/temp path already exists, stop. Inspect it before deciding the next action.
- Do not delete the previous build, backup archive, or database to make a command succeed.
- Distinguish **observed and verified**, **configured but not verified**, and **not yet done** in deployment reports.

## 5. Current status summary

| Area | Status | Evidence / next action |
|---|---|---|
| Portal build activation | Completed | Staging/live build ID matched: `2u9g5g0gF5gnIaKn-Gp2q` |
| Portal route smoke tests | Passed | Home, login, jobs each returned HTTP 200 |
| API health endpoint | Passed | Latest check: HTTP 200 |
| API readiness endpoint | Passed | Latest check: HTTP 200; this alone is not a full functional test |
| Portal-to-API membership products | Passed | Direct API and portal proxy returned HTTP 200 with product JSON |
| Manual portal workflows | User-reported working | User reports the tested flows are working well; this is not an independent exhaustive test report |
| Live database identity/schema | Checked | Connected to `muslimjq_mpaportal`; 103 public tables before migration |
| Migration ledger | Passed | 25 migration rows; latest `20261010190000_separate_directory_visibility.sql` |
| Current main migration inventory | Passed | All 25 repository migration files accounted for at time of check |
| Critical schema checks | Passed | Permission tables, private upload session, skills, directory visibility, and tracking-reference columns verified |
| cPanel DB configuration | Preserved | No connection settings changed; secrets were not printed |
| Database backup archive | Created and list-validated | `/home/muslimjq/db-backups/mpa-2026-10-13T21-55-17-493Z.dump`; restore rehearsal still recommended |
| Backup restore rehearsal | Not yet verified | Restore to an isolated database and verify before relying on recovery |
| Security/isolation acceptance | Not exhaustively documented | Continue authorization, cross-account isolation, and private-evidence tests |

## 6. Related guidance

- [Shared cPanel deployment and test runbook](32-cpanel-shared-server-deployment.md)
- [Database Migration Operations Runbook](32-migration-operations-runbook.md)


## 7. Follow-up validation recorded on 2026-10-14

The user confirmed that the live portal workflows they exercised are working well. Additional external smoke checks were run after migration:

```text
API health: HTTP 200
API readiness: HTTP 200
Portal products: HTTP 200
```

The following endpoints were also checked earlier and returned HTTP 200: portal home, login, jobs, direct API membership products, and the portal-proxied membership products endpoint. The portal-proxied `/api/healthz` returned HTTP 401 because that path is not the public API health check; use the API origin's `/healthz` and `/readyz` for health checks. A 401 on the portal proxy path should not be interpreted as a health-check failure by itself.

### Current acceptance boundary

The deployment and migration steps described above have been completed and checked. The user's manual functional confirmation is recorded as user-reported evidence. Do not overstate this as a full security audit or complete disaster-recovery certification. Before onboarding substantial real records, prioritize:
1. A controlled restore rehearsal into an isolated database.
2. Negative authorization tests across user roles and accounts.
3. Verification that private uploads, reviewer notes, and session-protected routes remain inaccessible without the required authorization.
4. A documented rollback procedure for both the portal build and any future database migration.

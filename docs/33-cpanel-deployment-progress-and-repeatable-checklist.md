# cPanel Deployment Record and Repeatable Checklist

**Record date:** 2026-10-13 (updated with follow-up checks on 2026-10-14)  
**Repository:** `jafermenza1/MPA-Professsionals-Network`  
**Hosting:** cPanel / CloudLinux Node.js Selector on the Sapphire host  
**Purpose:** Preserve what was actually deployed, the evidence observed, and the safe sequence to use for future deployments.

> This record is an operational journal, not a claim that every production acceptance item is complete. The portal deployment and HTTP smoke checks passed. The live PostgreSQL schema and migration ledger have **not** yet been inspected, and no production migration is approved by this record.

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

### 2.6 Database inspection remains pending

The following SSH check was run from the API root:

```text
Node: v22.23.3
API root: /home/muslimjq/ET-Professionals-Network
Migration files: 25
DATABASE_URL in this SSH shell: not set
```

The user confirmed the database is configured in cPanel and does not want to change that configuration. The absent variable in the interactive SSH shell does not mean the cPanel application has no database configuration.

**Not yet done:** No direct read-only inventory of the live PostgreSQL database, no inspection of `public.app_schema_migration`, and no production migration. Do not run migrations until the actual target database, schema, ledger/baseline, and backup/restore readiness are verified.

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

For this current deployment, the database check is still pending. The user has confirmed cPanel configuration exists and asked that it remain unchanged. The next investigation should be read-only and must not print secrets.

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
| API health endpoint | Previously passed | `/healthz` returned status `ok` |
| API readiness endpoint | Previously passed, limited evidence | `/readyz` returned `databaseConfigured: true`; live query/schema still needs validation |
| cPanel DB configuration | Configured per user | Leave unchanged; do not reveal URL |
| SSH `DATABASE_URL` | Not present | Interactive SSH environment differs from cPanel app environment |
| Migration inventory | 25 SQL files | No production migration executed by this record |
| Live migration ledger/schema | Pending | Perform read-only inspection of actual API database |
| Backup restore rehearsal | Not established | Archive listing passed; restore rehearsal still recommended |
| Full authenticated/business workflow acceptance | Partial/pending | Continue tests after DB verification |

## 6. Related guidance

- [Shared cPanel deployment and test runbook](32-cpanel-shared-server-deployment.md)
- [Database Migration Operations Runbook](32-migration-operations-runbook.md)

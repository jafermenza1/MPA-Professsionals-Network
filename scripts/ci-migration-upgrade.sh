#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point to an isolated, disposable PostgreSQL database}"
baseline="010_phase3_hardening.sql"
migration_dir="db/migrations"

# Build a realistic legacy database by applying the historical prefix without a ledger.
# This script is only for disposable CI databases; never point it at production.
for migration in "$migration_dir"/*.sql; do
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -1 -f "$migration"
  if [[ "${migration##*/}" == "$baseline" ]]; then
    break
  fi
done

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE gate3_legacy_sentinel (
  id text PRIMARY KEY,
  value text NOT NULL
);
INSERT INTO gate3_legacy_sentinel(id, value)
VALUES ('preserve-me', 'legacy-data-survives-adoption');
SQL

# Existing schema with no history must fail closed if no verified baseline is supplied.
if npm run migrate; then
  echo "ERROR: migration runner accepted a legacy schema without MIGRATION_BASELINE" >&2
  exit 1
fi

# Explicitly adopt the known test baseline, then apply only migrations after it.
MIGRATION_BASELINE="$baseline" npm run migrate

expected="$(find "$migration_dir" -maxdepth 1 -type f -name '*.sql' | wc -l | tr -d ' ')"
applied="$(psql "$DATABASE_URL" -X -A -t -q -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM app_schema_migration')"
[[ "$applied" == "$expected" ]] || {
  echo "ERROR: expected $expected migration ledger rows, found $applied" >&2
  exit 1
}

sentinel="$(psql "$DATABASE_URL" -X -A -t -q -v ON_ERROR_STOP=1 -c "SELECT value FROM gate3_legacy_sentinel WHERE id='preserve-me'")"
[[ "$sentinel" == "legacy-data-survives-adoption" ]] || {
  echo "ERROR: legacy sentinel data was not preserved" >&2
  exit 1
}

# Force a migration failure after a schema change and prove the transaction rolls back
# both the DDL and its ledger row. The synthetic migration exists only in this disposable CI checkout.
failure_migration="$migration_dir/999_ci_forced_failure.sql"
trap 'rm -f "$failure_migration"' EXIT
cat > "$failure_migration" <<'SQL'
CREATE TABLE gate3_should_rollback (id integer PRIMARY KEY);
SELECT 1 / 0;
SQL
if npm run migrate; then
  echo "ERROR: intentionally failing migration unexpectedly succeeded" >&2
  exit 1
fi

table_after_failure="$(psql "$DATABASE_URL" -X -A -t -q -v ON_ERROR_STOP=1 -c "SELECT CASE WHEN to_regclass('public.gate3_should_rollback') IS NULL THEN 'absent' ELSE 'present' END")"
ledger_after_failure="$(psql "$DATABASE_URL" -X -A -t -q -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM app_schema_migration WHERE filename='999_ci_forced_failure.sql'")"
[[ "$table_after_failure" == "absent" && "$ledger_after_failure" == "0" ]] || {
  echo "ERROR: failed migration left schema or ledger changes behind" >&2
  exit 1
}
rm -f "$failure_migration"
trap - EXIT

# A second run without a baseline must be a no-op once the ledger is populated.
npm run migrate
applied_after_rerun="$(psql "$DATABASE_URL" -X -A -t -q -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM app_schema_migration')"
[[ "$applied_after_rerun" == "$expected" ]] || {
  echo "ERROR: migration rerun changed ledger row count ($applied_after_rerun != $expected)" >&2
  exit 1
}

echo "PASS: legacy baseline adoption, data preservation, forward migration, and rerun idempotency ($applied migrations)"

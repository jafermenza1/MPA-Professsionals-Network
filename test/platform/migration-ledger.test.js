import test from "node:test";
import assert from "node:assert/strict";
import { resolveMigrationBaseline, assertMigrationChecksum } from "../../src/platform/migration-ledger.js";

const files = [
  "001_initial.sql",
  "002_profiles.sql",
  "003_permissions.sql"
];

test("legacy baseline requires an explicit exact migration filename", () => {
  assert.throws(() => resolveMigrationBaseline(files, undefined), /Set MIGRATION_BASELINE/);
  assert.throws(() => resolveMigrationBaseline(files, "002_profiles"), /exactly match/);
  assert.deepEqual(resolveMigrationBaseline(files, "002_profiles.sql"), files.slice(0, 2));
});

test("legacy baseline only adopts migrations through the verified baseline", () => {
  assert.deepEqual(resolveMigrationBaseline(files, "001_initial.sql"), ["001_initial.sql"]);
  assert.deepEqual(resolveMigrationBaseline(files, "003_permissions.sql"), files);
});

test("migration checksum guard permits unchanged history", () => {
  assert.doesNotThrow(() => assertMigrationChecksum("001_initial.sql", "abc", "abc"));
  assert.doesNotThrow(() => assertMigrationChecksum("001_initial.sql", null, "abc"));
});

test("migration checksum guard rejects edited historical migration", () => {
  assert.throws(
    () => assertMigrationChecksum("001_initial.sql", "old-checksum", "new-checksum"),
    /Add a new migration instead of editing historical SQL/
  );
});

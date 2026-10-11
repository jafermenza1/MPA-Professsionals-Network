export function resolveMigrationBaseline(files, baseline) {
  if (!baseline) {
    throw new Error("Existing application schema found without migration history. Set MIGRATION_BASELINE to the last migration verified as applied after reviewing the database; refusing to replay historical migrations automatically.");
  }
  const index = files.indexOf(baseline);
  if (index < 0) {
    throw new Error("MIGRATION_BASELINE must exactly match a migration filename in the repository.");
  }
  return files.slice(0, index + 1);
}

export function assertMigrationChecksum(filename, recordedChecksum, currentChecksum) {
  if (recordedChecksum && recordedChecksum !== currentChecksum) {
    throw new Error(`Applied migration ${filename} has changed. Add a new migration instead of editing historical SQL.`);
  }
}

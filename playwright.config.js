import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // The current E2E fixtures share stable CI identities and mutable organization
  // state. Keep the complete suite deterministic until those fixtures are isolated
  // per test; this does not skip or relax any tests.
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  retries: 0,
  reporter: "list",
  timeout: 60000,
  expect: { timeout: 12000 },
  use: {
    baseURL: process.env.WEB_BASE_URL || "http://127.0.0.1:3001",
    headless: true,
    trace: "retain-on-failure"
  }
});

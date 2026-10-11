import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
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

import test from "node:test";
import assert from "node:assert/strict";
import { membershipEndDate, isMembershipCurrent } from "../../src/platform/membership-duration.js";
import { assertProfessionalIdentity, hasCurrentActiveMembership, assertOrganizationCapability } from "../../src/platform/identity-policy.js";

test("annual recurring membership ends the day before its calendar anniversary", () => {
  assert.equal(membershipEndDate("2023-03-01", { durationDays: 365, durationPolicy: "calendar_year_inclusive" }).toISOString().slice(0, 10), "2024-02-29");
  assert.equal(membershipEndDate("2024-02-29", { durationDays: 365, durationPolicy: "calendar_year_inclusive" }).toISOString().slice(0, 10), "2025-02-28");
});

test("fixed-day plans are inclusive and lifetime plans have no end date", () => {
  assert.equal(membershipEndDate("2026-10-14", { durationDays: 30, durationPolicy: "fixed_days_inclusive" }).toISOString().slice(0, 10), "2026-11-12");
  assert.equal(membershipEndDate("2026-10-14", { durationDays: null }), null);
});

test("membership privilege is valid on the inclusive end date only", () => {
  const record = { status: "active", startDate: "2026-10-01", endDate: "2026-10-14" };
  assert.equal(isMembershipCurrent(record, new Date("2026-10-14T12:00:00.000Z")), true);
  assert.equal(isMembershipCurrent(record, new Date("2026-10-15T00:00:00.000Z")), false);
  assert.equal(isMembershipCurrent({ ...record, status: "suspended" }, new Date("2026-10-10T00:00:00.000Z")), false);
});

test("organization-only identity cannot use personal professional capabilities", async () => {
  const db = { query: async () => ({ rows: [{ role_code: "organization_owner" }] }) };
  await assert.rejects(() => assertProfessionalIdentity(db, "user-org"), error => error.code === "PROFESSIONAL_PROFILE_FORBIDDEN" && error.statusCode === 403);
});

test("current membership check uses status and inclusive validity dates", async () => {
  let queryText = "";
  let queryArgs;
  const db = { query: async (sql, args) => { queryText = sql; queryArgs = args; return { rowCount: 1, rows: [{}] }; } };
  assert.equal(await hasCurrentActiveMembership(db, "user-1"), true);
  assert.match(queryText, /status='active'/);
  assert.match(queryText, /start_date<=current_date/);
  assert.match(queryText, /end_date>=current_date/);
  assert.deepEqual(queryArgs, ["user-1"]);
});

test("organization access is checked against the requested organization and allowed role", async () => {
  let queryArgs;
  const db = { query: async (_sql, args) => { queryArgs = args; return { rows: [{ role_code: "recruiter", verification_status: "verified" }] }; } };
  const result = await assertOrganizationCapability(db, "organization-a", "user-2", ["owner", "recruiter"]);
  assert.deepEqual(queryArgs, ["organization-a", "user-2"]);
  assert.equal(result.role_code, "recruiter");
});

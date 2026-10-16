import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("saved discovery items are account-owned and limited to the four approved entity types", async () => {
  const migration = await read("../../db/migrations/20261016200000_saved_discovery_items.sql");
  const service = await read("../../src/platform/saved-discovery-items.js");
  const server = await read("../../server.js");
  assert.match(migration, /user_id uuid NOT NULL REFERENCES app_user\(id\) ON DELETE CASCADE/);
  assert.match(migration, /UNIQUE\(user_id,item_type,item_id\)/);
  for (const type of ["professional", "organization", "service", "mentor"]) assert.match(migration, new RegExp(type));
  assert.match(service, /TYPES\.has\(itemType\)/);
  assert.match(service, /talent\.getTalent\(itemId,userId\)/);
  assert.match(service, /public_visible=true and o\.verification_status='verified'/);
  assert.match(service, /getServiceListing\(itemId,userId\)/);
  assert.match(service, /getMentorProfile|mentor_profile/);
  assert.match(service, /where s\.user_id=\$1/);
  assert.match(server, /api\/v1\/me\/saved-items/);
});

test("opportunity paging applies viewer-specific scope predicates before count and page boundaries", async () => {
  const service = await read("../../src/organization-jobs/service.js");
  const start = service.indexOf("export async function listJobs(filters={},viewerId=null){");
  const end = service.indexOf("export async function getJob(jobId,viewerId=null){", start);
  assert.ok(start >= 0 && end > start);
  const source = service.slice(start, end);
  assert.match(source, /j\.posting_scope='public'/);
  assert.match(source, /j\.posting_scope in \('mpa_members','partner_network'\)/);
  assert.match(source, /organization_membership om/);
  assert.match(source, /select count\(\*\)::int count/);
  assert.match(source, /limit \$.*offset \$/);
  assert.doesNotMatch(source, /for\(const row of rows\)/);
});

test("public detail routes exist and organization profile excludes private member/contact fields", async () => {
  const orgService = await read("../../src/organization-jobs/service.js");
  const services = await read("../../src/services-mentorship/service.js");
  const server = await read("../../server.js");
  const orgPage = await read("../../web/app/organizations/directory/[id]/page.tsx");
  const professionalPage = await read("../../web/app/network/[id]/page.tsx");
  const servicePage = await read("../../web/app/services/[id]/page.tsx");
  const mentorPage = await read("../../web/app/mentorship/mentors/[id]/page.tsx");
  const start = orgService.indexOf("export async function getPublicOrganizationProfile");
  const end = orgService.indexOf("export async function getOrganization", start);
  const orgQuery = orgService.slice(start, end);
  assert.match(orgQuery, /public_visible=true/);
  assert.match(orgQuery, /verification_status='verified'/);
  assert.doesNotMatch(orgQuery, /o\.email|o\.phone|organization_membership/);
  assert.match(services, /export async function getMentorProfile/);
  assert.match(server, /getPublicOrganizationProfile\(parts\[4\]\)/);
  assert.match(server, /getMentorProfile\(parts\[3\]/);
  assert.match(orgPage, /api\/v1\/public\/organizations/);
  assert.match(professionalPage, /api\/v1\/talent/);
  assert.match(servicePage, /api\/v1\/services/);
  assert.match(mentorPage, /api\/v1\/mentors/);
});

test("the unified saved-items page and discovery surfaces are wired to account persistence", async () => {
  const savedPage = await read("../../web/app/saved/page.tsx");
  const hook = await read("../../web/lib/use-saved-discovery-items.ts");
  const network = await read("../../web/app/network/page.tsx");
  const orgs = await read("../../web/app/organizations/directory/page.tsx");
  const services = await read("../../web/app/services/page.tsx");
  const mentors = await read("../../web/app/mentorship/page.tsx");
  assert.match(savedPage, /api<SavedItem\[]>\("\/api\/v1\/me\/saved-items"/);
  assert.match(hook, /method: "POST"/);
  assert.match(hook, /method: "DELETE"/);
  for (const page of [network, orgs, services, mentors]) assert.match(page, /useSavedDiscoveryItems/);
});

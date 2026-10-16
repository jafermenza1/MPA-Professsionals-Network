import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("first-visit install nudge is delayed and remembered without forcing installation", async () => {
  const shell = await read("../../web/components/shell.tsx");
  assert.match(shell, /mpa-install-prompt-seen-v1/);
  assert.match(shell, /setTimeout\([\s\S]*?10000\)/);
  assert.match(shell, /CheckCircle2/);
  assert.match(shell, /showInstallNudge/);
  assert.match(shell, /Not now/);
  assert.match(shell, /Install help/);
  assert.doesNotMatch(shell, /prompt\(\);\s*[^}]*setInstalled\(true\)/);
});

test("public organization directory is bounded and filters private or unverified organizations at query time", async () => {
  const service = await read("../../src/organization-jobs/service.js");
  const server = await read("../../server.js");
  const page = await read("../../web/app/organizations/directory/page.tsx");
  const start = service.indexOf("export async function listPublicOrganizations");
  const end = service.indexOf("export async function getOrganization", start);
  assert.ok(start >= 0 && end > start);
  const query = service.slice(start, end);
  assert.match(query, /o\.public_visible=true/);
  assert.match(query, /o\.verification_status='verified'/);
  assert.match(query, /limit\s*\+\s*1/);
  assert.match(query, /offset/);
  assert.match(server, /api\/v1\/public\/organizations/);
  assert.match(page, /organizationType/);
  assert.match(page, /DiscoveryPagination/);
});

test("discovery clients request bounded pages while retaining existing visibility-aware APIs", async () => {
  const network = await read("../../web/app/network/page.tsx");
  const jobs = await read("../../web/app/jobs/page.tsx");
  const services = await read("../../web/app/services/page.tsx");
  const mentorship = await read("../../web/app/mentorship/page.tsx");
  for (const source of [network, jobs, services, mentorship]) {
    assert.match(source, /DiscoveryPagination/);
    assert.match(source, /limit/);
    assert.match(source, /offset/);
  }
  assert.match(network, /\/api\/v1\/talent/);
  assert.match(jobs, /\/api\/v1\/jobs/);
  assert.match(services, /\/api\/v1\/services/);
  assert.match(mentorship, /\/api\/v1\/mentors/);
});

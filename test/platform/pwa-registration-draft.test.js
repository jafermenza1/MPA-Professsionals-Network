import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const registrationUrl = new URL("../../web/app/register/page.tsx", import.meta.url);

test("organization draft persistence is versioned, time-limited, and excludes secrets", async () => {
  const source = await readFile(registrationUrl, "utf8");
  const draftType = source.match(/type OrganizationDraftForm=[\s\S]*?;\n/);
  assert.ok(draftType, "the draft must have an explicit allowlisted field type");
  assert.doesNotMatch(draftType[0], /password|challenge|token|session/i);
  assert.match(source, /const DRAFT_TTL_MS=24\*60\*60\*1000/);
  assert.match(source, /type OrganizationDraft=\{version:2;form:OrganizationDraftForm;savedAt:number;expiresAt:number\}/);
  assert.match(source, /keys\.every\(key=>typeof value\.form\[key\]==="string"\)/);
  assert.match(source, /setForm\(current=>\(\{\.\.\.current,\.\.\.draft\.form,password:"",passwordConfirm:""\}\)\)/);
});

test("draft persistence retries explicitly and surfaces cross-tab conflicts without auto-merging", async () => {
  const source = await readFile(registrationUrl, "utf8");
  assert.match(source, /function retrySaveDraft\(\)\{writeOrganizationDraft\(\);\}/);
  assert.match(source, /A newer organization draft was saved in another tab/);
  assert.match(source, /Use newer saved version/);
  assert.match(source, /Keep my current edits/);
  assert.match(source, /Nothing will be merged or submitted automatically/);
  assert.match(source, /function clearOrganizationDraft\(\)/);
});

test("account creation is never queued or auto-replayed as offline synchronization", async () => {
  const source = await readFile(registrationUrl, "utf8");
  const draftWriter = source.match(/function writeOrganizationDraft\([\s\S]*?\n \}\n\n function applyOrganizationDraft/);
  assert.ok(draftWriter, "draft persistence function should be separable from submission");
  assert.doesNotMatch(draftWriter[0], /api<|fetch\(|navigator\.serviceWorker|Background Sync/i);
  assert.match(source, /if\(!challenge\)throw new Error\("Load a new human check before registering\."\)/);
  assert.match(source, /api<any>\("\/api\/v1\/auth\/register"/);
  assert.match(source, /Saving a draft does not create an account or submit an organization application/);
});

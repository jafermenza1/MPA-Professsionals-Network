import test from "node:test";
import assert from "node:assert/strict";
import { validateReferenceRows } from "../../src/reference-portfolio/validation.js";

test("rejects duplicate codes", () => {
  const result = validateReferenceRows([
    { code: "A", name: "A", type: "root" },
    { code: "A", name: "A2", type: "root" }
  ]);
  assert.equal(result.valid, false);
  assert.equal(result.counts.invalid, 1);
});

test("rejects missing parents", () => {
  const result = validateReferenceRows([
    { code: "A.1", name: "Child", type: "leaf", parent_code: "A" }
  ]);
  assert.equal(result.valid, false);
  assert.equal(result.counts.invalid_parent, 1);
});

test("rejects hierarchy cycles", () => {
  const result = validateReferenceRows([
    { code: "A", name: "A", type: "node", parent_code: "B" },
    { code: "B", name: "B", type: "node", parent_code: "A" }
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.diagnostics.some((d) => d.errors.some((e) => e.includes("cycle"))));
});

test("rejects unknown status before publication", () => {
  const result = validateReferenceRows([
    { code: "A", name: "A", type: "root", status: "retired" }
  ]);
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0].errors.length, 1);
});

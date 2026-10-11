import test from "node:test";
import assert from "node:assert/strict";
import { formatTrackingReference } from "../../src/platform/tracking-reference.js";

test("tracking references are short, typed and readable while serials grow",()=>{
  assert.equal(formatTrackingReference("membership","26","123"),"MPA-MEM-26-000123");
  assert.equal(formatTrackingReference("organization","26","4"),"MPA-ORG-26-000004");
  assert.equal(formatTrackingReference("job","26","1234567"),"MPA-JOB-26-1234567");
});

test("tracking references reject unsupported types and malformed values",()=>{
  assert.throws(()=>formatTrackingReference("account","26","1"),/Unsupported/);
  assert.throws(()=>formatTrackingReference("membership","2026","1"),/year/);
  assert.throws(()=>formatTrackingReference("job","26","0"),/positive integer/);
});
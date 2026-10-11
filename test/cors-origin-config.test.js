import test from "node:test";
import assert from "node:assert/strict";
import { parseAllowedOrigins, resolveAllowedOrigin } from "../src/platform/config.js";

test("allowed origins support multiple browser origins for local development", () => {
  const allowed = parseAllowedOrigins("http://localhost:3001, http://127.0.0.1:3001");
  assert.deepEqual(allowed, ["http://localhost:3001", "http://127.0.0.1:3001"]);
  assert.equal(resolveAllowedOrigin("http://localhost:3001", "http://localhost:3001, http://127.0.0.1:3001"), "http://localhost:3001");
  assert.equal(resolveAllowedOrigin("https://example.com", "http://localhost:3001, http://127.0.0.1:3001"), null);
  assert.equal(resolveAllowedOrigin("https://example.com", ""), null);
});

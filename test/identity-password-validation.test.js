import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, validatePassword, verifyPassword } from "../src/membership/identity.js";

test("registration passwords must contain at least 10 characters", () => {
  assert.throws(
    () => validatePassword("123456789"),
    (error) => error.statusCode === 400 && error.code === "PASSWORD_TOO_SHORT"
  );
  assert.throws(() => hashPassword("123456789"), /at least 10 characters/i);
  assert.equal(validatePassword("1234567890"), "1234567890");
});

test("valid passwords can still be hashed and verified", () => {
  const encoded = hashPassword("valid-password-10");
  assert.equal(verifyPassword("valid-password-10", encoded), true);
  assert.equal(verifyPassword("different-password", encoded), false);
});

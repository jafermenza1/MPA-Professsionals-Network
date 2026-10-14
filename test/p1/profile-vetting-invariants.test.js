import test from "node:test";
import assert from "node:assert/strict";
import { validatePersonInput } from "../../src/membership/identity.js";

test("Gender accepts only Male or Female and normalizes legacy casing", () => {
  assert.equal(validatePersonInput({ firstName: "A", lastName: "B", gender: "Male" }).sex, "male");
  assert.equal(validatePersonInput({ firstName: "A", lastName: "B", sex: "FEMALE" }).sex, "female");
  assert.equal(validatePersonInput({ firstName: "A", lastName: "B", gender: "" }).sex, null);
  assert.throws(
    () => validatePersonInput({ firstName: "A", lastName: "B", gender: "Other" }),
    (error) => error?.statusCode === 400 && error?.code === "GENDER_INVALID",
  );
});

test("historical API sex field and user-facing gender alias resolve to one value", () => {
  assert.equal(validatePersonInput({ firstName: "A", lastName: "B", sex: "male", gender: "female" }).sex, "female");
});

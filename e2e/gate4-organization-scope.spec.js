import { test, expect, request as playwrightRequest } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { register as registerMember } from "../src/membership/service.js";

const API_BASE = process.env.API_BASE_URL || "http://127.0.0.1:3000";

async function createActor(label) {
  const suffix = randomUUID();
  const actor = await registerMember({
    email: `gate4-org-${label}-${suffix}@example.test`,
    password: "gate4-organization-password-12345",
    firstName: "Gate4",
    lastName: label + suffix.slice(0, 6)
  }, randomUUID());
  return { ...actor, headers: { authorization: "Bearer " + actor.token } };
}

test("organization registration rejects duplicate legal names and enforces cross-organization scope", async () => {
  const api = await playwrightRequest.newContext({ baseURL: API_BASE });
  try {
    const ownerA = await createActor("OwnerA");
    const ownerB = await createActor("OwnerB");
    const legalName = "Gate 4 Scoped Organization " + randomUUID();
    const createA = await api.post("/api/v1/organizations", {
      headers: ownerA.headers,
      data: { legalName, displayName: legalName, organizationType: "company" }
    });
    expect(createA.status(), "the first organization registration should succeed").toBe(201);
    const organizationA = (await createA.json()).data;

    const duplicate = await api.post("/api/v1/organizations", {
      headers: ownerA.headers,
      data: { legalName: "  " + legalName.toUpperCase() + "  ", displayName: "Duplicate legal name", organizationType: "company" }
    });
    expect(duplicate.status(), "legal-name uniqueness is case- and whitespace-insensitive").toBe(409);

    const legalNameB = "Gate 4 Other Organization " + randomUUID();
    const createB = await api.post("/api/v1/organizations", {
      headers: ownerB.headers,
      data: { legalName: legalNameB, displayName: legalNameB, organizationType: "company" }
    });
    expect(createB.status()).toBe(201);

    const ownerRead = await api.get("/api/v1/organizations/" + organizationA.id, {
      headers: ownerA.headers
    });
    expect(ownerRead.status(), "the organization owner can read their own organization").toBe(200);

    const foreignRead = await api.get("/api/v1/organizations/" + organizationA.id, {
      headers: ownerB.headers
    });
    expect(foreignRead.status(), "a different organization's owner cannot read private organization details").toBe(403);

    const foreignMemberWrite = await api.post("/api/v1/organizations/" + organizationA.id + "/users", {
      headers: ownerB.headers,
      data: { userId: ownerB.user.id, roleCode: "read_only" }
    });
    expect(foreignMemberWrite.status(), "another organization's owner cannot grant themselves membership in this organization").toBe(403);
  } finally {
    await api.dispose();
  }
});

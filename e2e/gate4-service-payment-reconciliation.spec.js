import { test, expect, request as playwrightRequest } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { getPool } from "../src/platform/db.js";
import { register as registerMember } from "../src/membership/service.js";

const API_BASE = process.env.API_BASE_URL || "http://127.0.0.1:3000";
const ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD;

async function seedActiveMember(api, label) {
  const suffix = randomUUID();
  const email = `gate4-service-${label}-${suffix}@example.test`;
  const password = "gate4-service-password-12345";
  const registered = await registerMember({
    email,
    password,
    firstName: "Gate4",
    lastName: label + suffix.slice(0, 6)
  }, randomUUID());
  const db = getPool();
  const product = (await db.query(
    "select id from membership_product where product_code='BASIC'"
  )).rows[0];
  expect(product, "CI must seed the canonical BASIC membership product").toBeTruthy();
  await db.query(
    "insert into membership_record(user_id,membership_product_id,membership_number,status,start_date,end_date,source) values($1,$2,$3,'active',current_date,current_date+365,'admin')",
    [registered.user.id, product.id, `G4-SVC-${label}-${registered.user.id.slice(0, 8)}`]
  );
  return { token: registered.token, userId: registered.user.id, email, password };
}

test("service lifecycle is participant-scoped and manual payment reconciliation is idempotent", async () => {
  const api = await playwrightRequest.newContext({ baseURL: API_BASE });
  try {
    const login = await api.post("/api/v1/auth/login", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }
    });
    expect(login.status(), "CI finance/reviewer fixture login").toBe(200);
    const adminToken = (await login.json()).data.token;
    const adminHeaders = { authorization: "Bearer " + adminToken };

    const provider = await seedActiveMember(api, "provider");
    const requester = await seedActiveMember(api, "requester");
    const outsider = await seedActiveMember(api, "outsider");
    const providerHeaders = { authorization: "Bearer " + provider.token };
    const requesterHeaders = { authorization: "Bearer " + requester.token };
    const outsiderHeaders = { authorization: "Bearer " + outsider.token };

    const listingResponse = await api.post("/api/v1/services", {
      headers: providerHeaders,
      data: {
        title: "Gate 4 manual reconciliation service",
        description: "Isolated acceptance fixture for participant and finance boundaries.",
        serviceCategory: "professional_support",
        deliveryMode: "remote",
        pricingModel: "fixed",
        priceAmount: 100,
        currency: "ETB",
        visibility: "members",
        maxActiveRequests: 2
      }
    });
    expect(listingResponse.status(), "active member can create a service listing").toBe(201);
    const listing = (await listingResponse.json()).data;

    const published = await api.post("/api/v1/services/" + listing.id + "/status", {
      headers: providerHeaders,
      data: { status: "published" }
    });
    expect(published.status(), "provider can publish their own listing").toBe(200);

    const selfRequest = await api.post("/api/v1/services/" + listing.id + "/requests", {
      headers: providerHeaders,
      data: { message: "This must be rejected." }
    });
    expect(selfRequest.status(), "providers cannot request their own service").toBe(409);

    const createdRequest = await api.post("/api/v1/services/" + listing.id + "/requests", {
      headers: requesterHeaders,
      data: { message: "Please provide the agreed professional support.", proposedPrice: 100, currency: "ETB" }
    });
    expect(createdRequest.status(), "another active member can request the published service").toBe(201);
    const serviceRequest = (await createdRequest.json()).data;

    const duplicateRequest = await api.post("/api/v1/services/" + listing.id + "/requests", {
      headers: requesterHeaders,
      data: { message: "Retry must not duplicate an active request.", proposedPrice: 100, currency: "ETB" }
    });
    expect(duplicateRequest.status(), "active duplicate service requests are rejected").toBe(409);

    const outsiderList = await api.get("/api/v1/me/service-requests", { headers: outsiderHeaders });
    expect(outsiderList.status()).toBe(200);
    expect((await outsiderList.json()).data.some(row => row.id === serviceRequest.id),
      "unrelated members cannot discover another request through their own request list").toBe(false);

    const outsiderTransition = await api.post("/api/v1/service-requests/" + serviceRequest.id + "/status", {
      headers: outsiderHeaders,
      data: { status: "accepted", note: "Must be denied." }
    });
    expect(outsiderTransition.status(), "non-participants cannot mutate a service request").toBe(403);

    const requesterAccept = await api.post("/api/v1/service-requests/" + serviceRequest.id + "/status", {
      headers: requesterHeaders,
      data: { status: "accepted" }
    });
    expect(requesterAccept.status(), "only the provider can accept the request").toBe(403);

    const accepted = await api.post("/api/v1/service-requests/" + serviceRequest.id + "/status", {
      headers: providerHeaders,
      data: { status: "accepted", note: "Scope and fee confirmed." }
    });
    expect(accepted.status()).toBe(200);
    expect((await accepted.json()).data.status).toBe("accepted");

    const requesterStart = await api.post("/api/v1/service-requests/" + serviceRequest.id + "/status", {
      headers: requesterHeaders,
      data: { status: "in_progress" }
    });
    expect(requesterStart.status(), "only the provider can start delivery").toBe(403);

    const started = await api.post("/api/v1/service-requests/" + serviceRequest.id + "/status", {
      headers: providerHeaders,
      data: { status: "in_progress", note: "Delivery started." }
    });
    expect(started.status()).toBe(200);
    expect((await started.json()).data.status).toBe("in_progress");

    const badAmount = await api.post("/api/v1/service-requests/" + serviceRequest.id + "/payment", {
      headers: requesterHeaders,
      data: { amount: 101, currency: "ETB", channel: "bank_transfer", reference: "G4-BAD-" + randomUUID(), idempotencyKey: "g4-bad-" + randomUUID() }
    });
    expect(badAmount.status(), "manual payment must match the agreed amount").toBe(400);

    const paymentInput = {
      amount: 100,
      currency: "ETB",
      channel: "bank_transfer",
      reference: "G4-MANUAL-" + randomUUID(),
      idempotencyKey: "g4-service-payment-" + randomUUID()
    };
    const paymentResponse = await api.post("/api/v1/service-requests/" + serviceRequest.id + "/payment", {
      headers: requesterHeaders,
      data: paymentInput
    });
    expect(paymentResponse.status(), "the first manual bank-transfer record is persisted").toBe(201);
    const payment = (await paymentResponse.json()).data;
    expect(payment.status).toBe("pending");

    const paymentRetry = await api.post("/api/v1/service-requests/" + serviceRequest.id + "/payment", {
      headers: requesterHeaders,
      data: paymentInput
    });
    expect(paymentRetry.status()).toBe(201);
    expect((await paymentRetry.json()).data.id,
      "retries with the same idempotency key must reuse the original payment record").toBe(payment.id);

    const memberCannotVerify = await api.post("/api/v1/service-payments/" + payment.id + "/verify", {
      headers: requesterHeaders,
      data: { decision: "approved", note: "A payer cannot verify their own payment.", evidenceChecked: ["reference", "amount"] }
    });
    expect(memberCannotVerify.status(), "payment confirmation requires finance/reviewer authority").toBe(403);

    const verified = await api.post("/api/v1/service-payments/" + payment.id + "/verify", {
      headers: adminHeaders,
      data: { decision: "approved", note: "Manual bank transfer evidence checked.", evidenceChecked: ["reference", "amount"] }
    });
    expect(verified.status()).toBe(200);
    expect((await verified.json()).data.status).toBe("succeeded");

    const providerCompletion = await api.post("/api/v1/service-requests/" + serviceRequest.id + "/status", {
      headers: providerHeaders,
      data: { status: "completed", note: "Delivery submitted for requester acceptance." }
    });
    expect(providerCompletion.status()).toBe(200);
    expect((await providerCompletion.json()).data.status,
      "provider completion submission is not requester acceptance").toBe("in_progress");

    const earlyRequesterAcceptance = await api.post("/api/v1/service-requests/" + serviceRequest.id + "/accept-completion", {
      headers: outsiderHeaders,
      data: { note: "Non-participant cannot accept." }
    });
    expect(earlyRequesterAcceptance.status()).toBe(403);

    const acceptedCompletion = await api.post("/api/v1/service-requests/" + serviceRequest.id + "/accept-completion", {
      headers: requesterHeaders,
      data: { note: "Delivery accepted after manual payment reconciliation." }
    });
    expect(acceptedCompletion.status()).toBe(200);
    expect((await acceptedCompletion.json()).data.status).toBe("completed");

    const persisted = await api.get("/api/v1/me/service-requests", { headers: requesterHeaders });
    expect(persisted.status()).toBe(200);
    expect((await persisted.json()).data.some(row =>
      row.id === serviceRequest.id &&
      row.status === "completed" &&
      row.requester_accepted_at
    ), "the accepted outcome and payment-gated completion survive a fresh API read").toBe(true);
  } finally {
    await api.dispose();
  }
});

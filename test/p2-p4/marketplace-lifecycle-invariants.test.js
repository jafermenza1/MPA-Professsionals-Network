import test from "node:test";
import assert from "node:assert/strict";
import {
  allowedServiceRequestTransition,
  canAcceptServiceCompletion,
  allowedMentorshipTransition,
  allowedSessionTransition,
} from "../../src/services-mentorship/service.js";

test("service request lifecycle requires explicit acceptance and delivery before closure", () => {
  assert.equal(allowedServiceRequestTransition("requested", "accepted"), true);
  assert.equal(allowedServiceRequestTransition("requested", "completed"), false);
  assert.equal(allowedServiceRequestTransition("accepted", "in_progress"), true);
  assert.equal(allowedServiceRequestTransition("in_progress", "disputed"), true);
  assert.equal(allowedServiceRequestTransition("disputed", "in_progress"), true);
  assert.equal(allowedServiceRequestTransition("completed", "in_progress"), false);
});

test("requester completion acceptance requires provider completion and verified settlement for paid work", () => {
  assert.equal(canAcceptServiceCompletion({ status: "requested", providerCompleted: true }), false);
  assert.equal(canAcceptServiceCompletion({ status: "in_progress", providerCompleted: false }), false);
  assert.equal(canAcceptServiceCompletion({ status: "in_progress", providerCompleted: true, paid: true, settled: false }), false);
  assert.equal(canAcceptServiceCompletion({ status: "in_progress", providerCompleted: true, paid: true, settled: true }), true);
  assert.equal(canAcceptServiceCompletion({ status: "in_progress", providerCompleted: true, paid: false }), true);
});

test("mentorship relationships can pause and resume but terminal states cannot reopen", () => {
  assert.equal(allowedMentorshipTransition("active", "paused"), true);
  assert.equal(allowedMentorshipTransition("paused", "active"), true);
  assert.equal(allowedMentorshipTransition("active", "completed"), true);
  assert.equal(allowedMentorshipTransition("completed", "active"), false);
  assert.equal(allowedMentorshipTransition("cancelled", "paused"), false);
});

test("mentorship sessions have explicit completion, cancellation and no-show outcomes", () => {
  assert.equal(allowedSessionTransition("scheduled", "completed"), true);
  assert.equal(allowedSessionTransition("scheduled", "cancelled"), true);
  assert.equal(allowedSessionTransition("scheduled", "no_show"), true);
  assert.equal(allowedSessionTransition("completed", "scheduled"), false);
  assert.equal(allowedSessionTransition("no_show", "completed"), false);
});

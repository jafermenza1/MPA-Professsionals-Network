import test from "node:test";
import assert from "node:assert/strict";
import {
  allowedServiceRequestTransition,
  allowedMentorshipTransition,
  allowedMatchTransition,
  allowedSessionTransition,
  canAcceptServiceCompletion
} from "../../src/services-mentorship/service.js";

test("service request lifecycle is controlled",()=>{
  assert.equal(allowedServiceRequestTransition("requested","accepted"),true);
  assert.equal(allowedServiceRequestTransition("requested","declined"),true);
  assert.equal(allowedServiceRequestTransition("accepted","in_progress"),true);
  assert.equal(allowedServiceRequestTransition("in_progress","completed"),true);
  assert.equal(allowedServiceRequestTransition("completed","in_progress"),false);
  assert.equal(allowedServiceRequestTransition("declined","accepted"),false);
});

test("service completion requires provider submission and requester acceptance",()=>{
  assert.equal(canAcceptServiceCompletion({status:"in_progress",providerCompleted:true,paid:false,settled:false}),true);
  assert.equal(canAcceptServiceCompletion({status:"in_progress",providerCompleted:false,paid:false,settled:false}),false);
  assert.equal(canAcceptServiceCompletion({status:"in_progress",providerCompleted:true,paid:true,settled:false}),false);
  assert.equal(canAcceptServiceCompletion({status:"in_progress",providerCompleted:true,paid:true,settled:true}),true);
});

test("mentorship lifecycle supports pause/resume and completion",()=>{
  assert.equal(allowedMentorshipTransition("active","paused"),true);
  assert.equal(allowedMentorshipTransition("paused","active"),true);
  assert.equal(allowedMentorshipTransition("active","completed"),true);
  assert.equal(allowedMentorshipTransition("completed","active"),false);
  assert.equal(allowedMentorshipTransition("cancelled","active"),false);
});

test("mentor matching requires an explicit response lifecycle",()=>{
  assert.equal(allowedMatchTransition("proposed","accepted"),true);
  assert.equal(allowedMatchTransition("proposed","declined"),true);
  assert.equal(allowedMatchTransition("proposed","expired"),true);
  assert.equal(allowedMatchTransition("accepted","declined"),false);
});

test("mentorship sessions cannot be reopened after terminal state",()=>{
  assert.equal(allowedSessionTransition("scheduled","completed"),true);
  assert.equal(allowedSessionTransition("scheduled","cancelled"),true);
  assert.equal(allowedSessionTransition("scheduled","no_show"),true);
  assert.equal(allowedSessionTransition("completed","scheduled"),false);
  assert.equal(allowedSessionTransition("cancelled","completed"),false);
});

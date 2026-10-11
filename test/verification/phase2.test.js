import test from "node:test";
import assert from "node:assert/strict";
import { allowedTransition } from "../../src/verification/service.js";
import { ELIGIBLE_VERIFICATION_CLAIMS,isEligibleVerifiedClaim,allowedTalentInquiryTransition } from "../../src/talent/service.js";

test("verification lifecycle permits controlled forward transitions only",()=>{
  assert.equal(allowedTransition("submitted","review"),true);
  assert.equal(allowedTransition("review","decision_pending"),true);
  assert.equal(allowedTransition("decision_pending","approved"),true);
  assert.equal(allowedTransition("approved","rejected"),false);
  assert.equal(allowedTransition("closed","review"),false);
});

test("talent registry eligibility is limited to explicitly verified professional claims",()=>{
  assert.deepEqual(ELIGIBLE_VERIFICATION_CLAIMS,["professional_certification","education","employment","experience","service_capability"]);
  assert.equal(isEligibleVerifiedClaim("experience"),true);
  assert.equal(isEligibleVerifiedClaim("identity"),false);
  assert.equal(isEligibleVerifiedClaim("professional_certification"),true);
});

test("private verification evidence is not a talent eligibility signal",()=>{
  assert.equal(isEligibleVerifiedClaim("membership"),false);
  assert.equal(isEligibleVerifiedClaim(""),false);
});

test("talent eligibility filters reject non-professional claim types",()=>{
  assert.equal(isEligibleVerifiedClaim("identity"),false);
  assert.equal(isEligibleVerifiedClaim("membership"),false);
  assert.equal(isEligibleVerifiedClaim("professional_certification"),true);
  assert.equal(isEligibleVerifiedClaim("service_capability"),true);
});

test("consent boundary keeps substantive work closed until consent",()=>{
  assert.equal(allowedTransition("consent_pending","submitted"),true);
  assert.equal(allowedTransition("consent_pending","review"),false);
  assert.equal(allowedTransition("consent_pending","decision_pending"),false);
});

test("talent inquiry creates a controlled consent-based bridge",()=>{
  assert.equal(allowedTalentInquiryTransition("requested","accepted"),true);
  assert.equal(allowedTalentInquiryTransition("requested","declined"),true);
  assert.equal(allowedTalentInquiryTransition("requested","closed"),true);
  assert.equal(allowedTalentInquiryTransition("accepted","closed"),true);
  assert.equal(allowedTalentInquiryTransition("declined","accepted"),false);
  assert.equal(allowedTalentInquiryTransition("closed","accepted"),false);
});

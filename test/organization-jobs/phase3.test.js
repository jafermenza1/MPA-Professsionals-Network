import test from "node:test";
import assert from "node:assert/strict";
import {
  allowedApplicationTransition,
  allowedCandidateResponse,
  ELIGIBILITY_RULES,
  isEligibleVerifiedClaimForJobs,
  JOB_POSTING_SCOPES,
  isAllowedJobPostingScope,
  canCandidateAcceptOffer
} from "../../src/organization-jobs/service.js";

test("phase 3 eligibility engine exposes controlled rule vocabulary",()=>{
  assert.equal(ELIGIBILITY_RULES.includes("membership_active"),true);
  assert.equal(ELIGIBILITY_RULES.includes("professional_verified"),true);
  assert.equal(ELIGIBILITY_RULES.includes("years_experience"),true);
  assert.equal(ELIGIBILITY_RULES.includes("unknown_rule"),false);
});

test("candidate workflow follows contracted progression",()=>{
  assert.equal(allowedApplicationTransition("submitted","screening"),true);
  assert.equal(allowedApplicationTransition("screening","shortlisted"),true);
  assert.equal(allowedApplicationTransition("shortlisted","interview"),true);
  assert.equal(allowedApplicationTransition("interview","offer"),true);
  assert.equal(allowedApplicationTransition("offer","accepted"),true);
  assert.equal(allowedApplicationTransition("accepted","hired"),true);
  assert.equal(allowedApplicationTransition("submitted","hired"),false);
  assert.equal(allowedApplicationTransition("rejected","screening"),false);
});

test("candidate owns offer acceptance and withdrawal decisions",()=>{
  assert.equal(allowedCandidateResponse("offer","accepted"),true);
  assert.equal(allowedCandidateResponse("offer","withdrawn"),true);
  assert.equal(allowedCandidateResponse("submitted","withdrawn"),true);
  assert.equal(allowedCandidateResponse("hired","withdrawn"),false);
  assert.equal(allowedCandidateResponse("offer","rejected"),false);
});

test("professional eligibility is distinct from identity or membership verification",()=>{
  assert.equal(isEligibleVerifiedClaimForJobs("professional_certification"),true);
  assert.equal(isEligibleVerifiedClaimForJobs("education"),true);
  assert.equal(isEligibleVerifiedClaimForJobs("identity"),false);
  assert.equal(isEligibleVerifiedClaimForJobs("membership"),false);
});

test("job portal supports explicit public, member, internal and partner scopes",()=>{
  assert.deepEqual(JOB_POSTING_SCOPES,["public","mpa_members","organization_internal","partner_network"]);
  for(const scope of JOB_POSTING_SCOPES) assert.equal(isAllowedJobPostingScope(scope),true);
  assert.equal(isAllowedJobPostingScope("private_secret"),false);
});

test("candidate cannot accept an unapproved offer",()=>{
  assert.equal(canCandidateAcceptOffer({status:"offer",approval:"pending"}),false);
  assert.equal(canCandidateAcceptOffer({status:"offer",approval:"rejected"}),false);
  assert.equal(canCandidateAcceptOffer({status:"offer",approval:"approved"}),true);
  assert.equal(canCandidateAcceptOffer({status:"screening",approval:"approved"}),false);
});

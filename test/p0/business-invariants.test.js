import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPool, closePool } from "../../src/platform/db.js";
import * as membership from "../../src/membership/service.js";
import * as talent from "../../src/talent/service.js";
import * as serviceMentorship from "../../src/services-mentorship/service.js";
import * as publicOpportunity from "../../src/platform/public-opportunity.js";
import * as organizationJobs from "../../src/organization-jobs/service.js";

function identity(suffix) {
  const digits = suffix.replace(/[^0-9]/g, "").slice(0, 8).padEnd(8, "7");
  return {
    email: `p0-${suffix}@example.test`,
    password: "P0BusinessInvariantPassword!2026",
    firstName: "P0",
    lastName: `Invariant${suffix.slice(0, 8)}`,
    phone: "09" + digits
  };
}
async function register(suffix) {
  return membership.register(identity(suffix), "p0-test-" + suffix);
}

test("P0: non-members cannot edit account or professional profile or publish provider offers", async () => {
  const account = await register(randomUUID());
  const userId = account.user.id;
  await assert.rejects(
    membership.updateProfile(userId, {}, "p0-profile-edit-before-membership"),
    error => error.code === "MEMBERSHIP_REQUIRED"
  );
  await assert.rejects(
    talent.updateProfessionalProfile(userId, {}, "p0-talent-edit-before-membership"),
    error => error.code === "MEMBERSHIP_REQUIRED"
  );
  await assert.rejects(
    serviceMentorship.createServiceListing(userId, { title: "P0 test", description: "Not published", serviceCategory: "test" }, "p0-service-before-membership"),
    error => error.code === "MEMBERSHIP_REQUIRED"
  );
  await assert.rejects(
    serviceMentorship.createMentorProfile(userId, { headline: "P0 test mentor" }, "p0-mentor-before-membership"),
    error => error.code === "MEMBERSHIP_REQUIRED"
  );

  const provider = await register(randomUUID());
  const db = getPool();
  const product = (await db.query("select id from membership_product where product_code='BASIC'")).rows[0];
  assert.ok(product, "BASIC membership product must exist for the provider fixture");
  await db.query("insert into membership_record(user_id,membership_product_id,membership_number,status,start_date,end_date,source) values($1,$2,$3,'active',current_date,current_date+365,'online')", [provider.user.id, product.id, "MPA-P0-" + randomUUID().slice(0,8).toUpperCase()]);
  const listing = await serviceMentorship.createServiceListing(provider.user.id, { title: "Public P0 test service", description: "A public service listing for non-member request coverage.", serviceCategory: "p0-test", visibility: "public" }, "p0-public-service-create");
  await serviceMentorship.changeServiceListingStatus(listing.id, provider.user.id, "published", "p0-public-service-publish");
  const request = await serviceMentorship.requestService(listing.id, userId, { message: "I would like to request this public service." }, "p0-non-member-service-request");
  assert.equal(request.status, "requested", "non-members may request public services without publishing provider offers");
});

test("P0: provider cannot bypass Support Desk moderation to publish a service or mentor offer", async () => {
  const provider = await register(randomUUID());
  const db = getPool();
  const product = (await db.query("select id from membership_product where product_code='BASIC'")).rows[0];
  assert.ok(product, "BASIC membership product must exist");
  await db.query("insert into membership_record(user_id,membership_product_id,membership_number,status,start_date,end_date,source) values($1,$2,$3,'active',current_date,current_date+365,'online')", [provider.user.id, product.id, "MPA-P0-MOD-" + randomUUID().slice(0,8).toUpperCase()]);
  const listing = await serviceMentorship.createServiceListing(provider.user.id, { title: "Moderation gate test", description: "A listing that must remain private until Support Desk approval.", serviceCategory: "p0-test", visibility: "public" }, "p0-moderation-create");
  await assert.rejects(
    serviceMentorship.changeServiceListingStatus(listing.id, provider.user.id, "published", "p0-moderation-bypass"),
    error => error.code === "MODERATION_REQUIRED"
  );
  const stored = (await db.query("select status,moderation_status from service_listing where id=$1", [listing.id])).rows[0];
  assert.notEqual(stored.status, "published");
  assert.notEqual(stored.moderation_status, "approved");
});

test("P0: organization-only role cannot access a professional profile", async () => {
  const account = await register(randomUUID());
  const userId = account.user.id;
  const db = getPool();
  const organizationRole = (await db.query("select id from app_role where role_code='organization_admin'")).rows[0];
  assert.ok(organizationRole, "organization_admin role must exist");
  await db.query("delete from app_user_role where user_id=$1 and role_id in (select id from app_role where role_code in ('member','professional'))", [userId]);
  await db.query("insert into app_user_role(user_id,role_id) values($1,$2) on conflict do nothing", [userId, organizationRole.id]);

  const me = await membership.getMe(userId);
  assert.ok(me.roles.includes("organization_admin"));
  assert.equal(me.profile_id, null, "organization-only account must not receive a professional profile id");
  assert.equal(me.headline, null, "organization-only account must not receive professional-profile fields");
  await assert.rejects(
    talent.getProfessionalProfile(userId),
    error => error.code === "PROFESSIONAL_PROFILE_FORBIDDEN"
  );
  await assert.rejects(
    membership.updateProfile(userId, {}, "p0-organization-profile-boundary"),
    error => error.code === "PROFESSIONAL_PROFILE_FORBIDDEN"
  );
});

test("P0: no-vacancy job-seeker demand remains private until explicit named-employer consent and revocation", async () => {
  const applicant = await register(randomUUID());
  const support = await register(randomUUID());
  const db = getPool();
  const supportRole = (await db.query("select id from app_role where role_code='supporting_staff'")).rows[0];
  assert.ok(supportRole, "supporting_staff role must exist");
  await db.query("insert into app_user_role(user_id,role_id) values($1,$2) on conflict do nothing", [support.user.id, supportRole.id]);

  const inquiry = await publicOpportunity.createPublicInquiry({
    inquiryType: "job",
    contactName: "P0 Applicant",
    contactEmail: applicant.user.email,
    targetRole: "Accountant",
    skills: ["bookkeeping", "Excel"],
    intent: "Please consider me for relevant work even when no vacancy is listed.",
    consent: true
  }, "p0-job-demand-create", null);
  const initial = (await db.query("select job_id,employer_sharing_consent,employer_sharing_scope from public_opportunity_inquiry where id=$1", [inquiry.id])).rows[0];
  assert.equal(initial.job_id, null, "job-interest demand must not require a vacancy");
  assert.equal(initial.employer_sharing_consent, false, "employer-sharing consent is separate from intake consent");
  assert.equal(initial.employer_sharing_scope, "support_desk_only");

  await assert.rejects(
    publicOpportunity.shareJobSeekerDemand(inquiry.id, support.user.id, { organizationId: randomUUID(), fields: ["targetRole"] }, "p0-share-without-consent"),
    error => error.code === "CONSENT_REQUIRED"
  );

  const granted = await publicOpportunity.updateSharingConsent(inquiry.public_reference, inquiry.continuationToken, {
    employerSharingConsent: true,
    scope: "named_employer",
    fields: ["targetRole", "skills"]
  }, "p0-sharing-consent-granted");
  assert.equal(granted.employer_sharing_consent, true);
  assert.deepEqual(granted.employer_sharing_fields, ["targetRole", "skills"]);
  assert.equal(granted.employer_sharing_consent_version, "job-seeker-sharing-v1");
  const recovered = await publicOpportunity.getPublicInquiry(inquiry.public_reference, inquiry.continuationToken);
  assert.equal(recovered.employerSharingConsent, true);
  assert.deepEqual(recovered.employerSharingFields, ["targetRole", "skills"]);

  const organization = await organizationJobs.registerOrganization(support.user.id, {
    legalName: "P0 Consent Test Organization " + randomUUID(),
    displayName: "P0 Consent Test Organization"
  }, "p0-consent-test-organization");
  await db.query("update organization set verification_status='verified',public_visible=true,verified_at=now() where id=$1", [organization.id]);

  await assert.rejects(
    publicOpportunity.shareJobSeekerDemand(inquiry.id, support.user.id, { organizationId: organization.id, fields: ["contactEmail"] }, "p0-share-outside-consent"),
    error => error.code === "CONSENT_FIELD_MISMATCH",
    "the Support Desk cannot share contact information outside the applicant's field-level consent"
  );
  await assert.rejects(
    publicOpportunity.shareJobSeekerDemand(inquiry.id, support.user.id, { organizationId: randomUUID(), fields: ["targetRole"] }, "p0-share-to-unknown-organization"),
    error => error.code === "ORGANIZATION_NOT_ELIGIBLE"
  );
  const shared = await publicOpportunity.shareJobSeekerDemand(inquiry.id, support.user.id, { organizationId: organization.id, fields: ["targetRole", "skills"] }, "p0-share-with-consent");
  assert.equal(shared.status, "shared");
  const employerView = await publicOpportunity.listSharedJobSeekerDemands(organization.id, support.user.id);
  assert.equal(employerView.length, 1);
  assert.equal(employerView[0].targetRole, "Accountant");
  assert.deepEqual(employerView[0].skills, ["bookkeeping", "Excel"]);
  assert.equal("contactEmail" in employerView[0], false, "contact details must not be shared unless separately consented");

  const revoked = await publicOpportunity.updateSharingConsent(inquiry.public_reference, inquiry.continuationToken, {
    employerSharingConsent: false
  }, "p0-sharing-consent-revoked");
  assert.equal(revoked.employer_sharing_consent, false);
  assert.ok(revoked.employer_sharing_revoked_at);
  const persisted = (await db.query("select employer_sharing_consent,employer_sharing_scope,employer_sharing_fields,employer_sharing_revoked_at from public_opportunity_inquiry where id=$1", [inquiry.id])).rows[0];
  assert.equal(persisted.employer_sharing_consent, false);
  assert.equal(persisted.employer_sharing_scope, "support_desk_only");
  assert.deepEqual(persisted.employer_sharing_fields, []);
  assert.ok(persisted.employer_sharing_revoked_at);
  assert.deepEqual(await publicOpportunity.listSharedJobSeekerDemands(organization.id, support.user.id), [], "revocation must remove employer access");
  const history = await publicOpportunity.getSharingHistory(inquiry.public_reference, inquiry.continuationToken);
  assert.equal(history.length, 1);
  assert.equal(history[0].organizationName, "P0 Consent Test Organization");
  assert.equal(history[0].status, "revoked");
});

test.after("close P0 test database pool", async () => { await closePool(); });

import assert from "node:assert/strict";
import { getPool } from "../src/platform/db.js";

const base=process.env.CI_API_BASE_URL||"http://127.0.0.1:3000";
const email=process.env.BOOTSTRAP_ADMIN_EMAIL;
const password=process.env.BOOTSTRAP_ADMIN_PASSWORD;
if(!email||!password) throw new Error("CI smoke credentials are not configured.");

async function request(path,{method="GET",token,body,headers:extraHeaders}={}){
  const response=await fetch(base+path,{
    method,
    headers:{
      ...(body?{"content-type":"application/json"}:{}),
      ...(token?{authorization:"Bearer "+token}:{}),...(extraHeaders||{})
    },
    ...(body?{body:JSON.stringify(body)}:{})
  });
  let payload=null;
  try{payload=await response.json()}catch{}
  return {status:response.status,payload};
}

async function rawRequest(path,{method="GET",token,body,headers:extraHeaders}={}){
  const response=await fetch(base+path,{method,headers:{...(token?{authorization:"Bearer "+token}:{}),...(extraHeaders||{})},...(body!==undefined?{body}:{})});
  const text=await response.text();let payload=null;try{payload=JSON.parse(text)}catch{}
  return {status:response.status,payload,text};
}

const publicMentors=await request("/api/v1/mentors");
assert.equal(publicMentors.status,200,"public mentor discovery should work without a session");
assert.ok(Array.isArray(publicMentors.payload?.data),"public mentor discovery should return an array");

let login;
for(let attempt=0;attempt<20;attempt++){
  login=await request("/api/v1/auth/login",{method:"POST",body:{email,password}});
  if(login.status===200) break;
  await new Promise(resolve=>setTimeout(resolve,250));
}
assert.equal(login.status,200,"bootstrap administrator should be able to log in after startup");
const token=login.payload?.data?.token;
assert.equal(typeof token,"string","login response must include a session token");

const me=await request("/api/v1/me",{token});
assert.equal(me.status,200,"authenticated profile endpoint should return success");
assert.equal(me.payload?.data?.email,email,"profile endpoint should return the authenticated account");
assert.equal(me.payload?.data?.status,"active","profile endpoint should return account status");
assert.equal(typeof me.payload?.data?.user_id,"string","profile endpoint should return its user_id contract");

const memberMentors=await request("/api/v1/mentors",{token});
assert.equal(memberMentors.status,200,"authenticated mentor discovery should return successfully");
assert.ok(Array.isArray(memberMentors.payload?.data),"authenticated mentor discovery should return an array");

const uploadBytes=Buffer.from("%PDF-1.7\\nCI private evidence fixture\\n%%EOF");
const uploadAuthorization=await request("/api/v1/files/uploads",{method:"POST",token,body:{fileName:"ci-evidence.pdf",contentType:"application/pdf",byteSize:uploadBytes.length}});
assert.equal(uploadAuthorization.status,201,"authenticated users should receive a bounded private upload authorization");
const upload=uploadAuthorization.payload?.data;
assert.equal(typeof upload?.uploadToken,"string","upload authorization should include a one-use token");
const badUpload=await rawRequest(upload.uploadUrl,{method:"PUT",token,body:uploadBytes,headers:{"content-type":"application/octet-stream","x-upload-token":"invalid-token"}});
assert.equal(badUpload.status,403,"invalid upload tokens must be rejected");
const uploadResult=await rawRequest(upload.uploadUrl,{method:"PUT",token,body:uploadBytes,headers:{"content-type":"application/octet-stream","x-upload-token":upload.uploadToken}});
assert.equal(uploadResult.status,201,"authorized upload bytes should be accepted");
assert.equal(uploadResult.payload?.data?.checksumSha256, (await import("node:crypto")).createHash("sha256").update(uploadBytes).digest("hex"),"upload checksum must be server-calculated");
const confirmed=await request("/api/v1/files/uploads/"+upload.uploadId+"/confirm",{method:"POST",token});
assert.equal(confirmed.status,201,"uploaded evidence should be confirmed into a private file object");
assert.equal(confirmed.payload?.data?.visibility,"private","confirmed evidence must remain private");
const fileContent=await rawRequest("/api/v1/files/"+confirmed.payload.data.id,{token});
assert.equal(fileContent.status,200,"file owner should be able to read their private upload");
assert.equal(fileContent.text,uploadBytes.toString(),"private file download must return the exact verified bytes");
const secondUpload=await rawRequest(upload.uploadUrl,{method:"PUT",token,body:uploadBytes,headers:{"content-type":"application/octet-stream","x-upload-token":upload.uploadToken}});
assert.equal(secondUpload.status,409,"upload authorization must not be reusable");

const db=getPool();
const membershipProduct=(await db.query("select id from membership_product where product_code='BASIC'")).rows[0];
assert.ok(membershipProduct,"CI must have a membership product fixture");
const memberEmail="ci-gate4-"+Date.now()+"@example.test";
const registration=await request("/api/v1/auth/register",{method:"POST",body:{email:memberEmail,password:"ci-gate4-password-12345",firstName:"Gate4",lastName:"Member"+Date.now()}});
assert.equal(registration.status,201,"CI should be able to register a separate workflow participant");
const memberToken=registration.payload?.data?.token;
const memberId=registration.payload?.data?.user?.id;
assert.equal(typeof memberToken,"string","registration should return a session token");
assert.equal(typeof memberId,"string","registration should return the new user id");
await db.query("insert into person(user_id,first_name,last_name,display_name) values($1,'Gate4','Administrator','Gate4 Administrator') on conflict(user_id) do nothing",[me.payload.data.user_id]);
for(const userId of [me.payload.data.user_id,memberId]){
  const active=(await db.query("select id from membership_record where user_id=$1 and status='active' limit 1",[userId])).rows[0];
  if(!active) await db.query("insert into membership_record(user_id,membership_product_id,membership_number,status,start_date,end_date,source) values($1,$2,$3,'active',current_date,current_date+365,'admin')",[userId,membershipProduct.id,"CI-"+userId.slice(0,8)+"-"+Date.now()]);
}
const adminInquiryList=await request("/api/v1/opportunity-inquiries?type=job",{token});
assert.equal(adminInquiryList.status,200,"admin inquiry filtering must bind SQL parameters without type ambiguity");

const orgName="Gate 4 CI Organization "+Date.now();
const orgCreated=await request("/api/v1/organizations",{method:"POST",token,body:{legalName:orgName,displayName:orgName,organizationType:"company"}});
assert.equal(orgCreated.status,201,"organization registration should create a scoped owner membership");
const organizationId=orgCreated.payload?.data?.id;
assert.equal(typeof organizationId,"string","organization registration should return its identifier");
const attachedEvidence=await request("/api/v1/organizations/"+organizationId+"/verification-evidence",{method:"POST",token,body:{fileObjectId:confirmed.payload.data.id,evidenceType:"registration_document",note:"CI-only private upload contract test"}});
assert.equal(attachedEvidence.status,201,"organization owner should be able to attach their own confirmed private upload");
const evidenceForbidden=await request("/api/v1/files/"+confirmed.payload.data.id,{token:memberToken});
assert.equal(evidenceForbidden.status,403,"an unrelated member must not read private organization evidence");
const crossOrgEvidenceAttach=await request("/api/v1/organizations/"+organizationId+"/verification-evidence",{method:"POST",token:memberToken,body:{fileObjectId:confirmed.payload.data.id,evidenceType:"registration_document"}});
assert.equal(crossOrgEvidenceAttach.status,403,"a non-member cannot attach evidence to another organization's verification case");
const secondOrgName="Gate 2 Other Organization "+Date.now();
const secondOrg=await request("/api/v1/organizations",{method:"POST",token:memberToken,body:{legalName:secondOrgName,displayName:secondOrgName,organizationType:"company"}});
assert.equal(secondOrg.status,201,"second account should own an isolated organization for cross-scope checks");
const secondOrgId=secondOrg.payload?.data?.id;
const adminCannotManageOtherOrg=await request("/api/v1/organizations/"+secondOrgId+"/verification-evidence",{method:"POST",token,body:{fileObjectId:confirmed.payload.data.id,evidenceType:"registration_document"}});
assert.equal(adminCannotManageOtherOrg.status,403,"platform administration does not imply organization membership or cross-organization write scope");
const creatorReviewDenied=await request("/api/v1/review/organizations",{method:"POST",token,body:{organizationId,decision:"verified",reason:"creator must not approve own organization"}});
assert.equal(creatorReviewDenied.status,403,"organization owner/creator must not review their own verification");

const reviewerEmail="ci-gate2-reviewer-"+Date.now()+"@example.test";
const reviewerRegistration=await request("/api/v1/auth/register",{method:"POST",body:{email:reviewerEmail,password:"ci-gate2-reviewer-password-12345",firstName:"Gate2",lastName:"Reviewer"}});
assert.equal(reviewerRegistration.status,201,"CI should create a separate reviewer identity");
const reviewerToken=reviewerRegistration.payload?.data?.token;
const reviewerId=reviewerRegistration.payload?.data?.user?.id;
assert.equal(typeof reviewerToken,"string","reviewer should receive a session-bound token");
await db.query("insert into app_user_role(user_id,role_id,assigned_by) select $1,id,$2 from app_role where role_code='reviewer' on conflict do nothing",[reviewerId,me.payload.data.user_id]);
const verificationSubmitted=await request("/api/v1/organizations/"+organizationId+"/submit-verification",{method:"POST",token});
assert.equal(verificationSubmitted.status,200,"organization verification should submit after evidence is attached");
const verificationReviewed=await request("/api/v1/review/organizations",{method:"POST",token:reviewerToken,body:{organizationId,decision:"verified",reason:"CI workflow acceptance"}});
assert.equal(verificationReviewed.status,200,"independent authorized reviewer should decide organization verification");
const reviewerFile=await rawRequest("/api/v1/files/"+confirmed.payload.data.id,{token:reviewerToken});
assert.equal(reviewerFile.status,200,"assigned reviewer may read linked verification evidence");
const fileReadAudit=(await db.query("select 1 from audit_log where actor_user_id=$1 and action='file.private_read' and resource_id=$2",[reviewerId,confirmed.payload.data.id])).rowCount;
assert.equal(fileReadAudit,1,"authorized private evidence access must be audited");
const reviewerOwnOrg=await request("/api/v1/organizations",{method:"POST",token:reviewerToken,body:{legalName:"Gate 2 Reviewer Own Org "+Date.now(),displayName:"Gate 2 Reviewer Own Org",organizationType:"company"}});
assert.equal(reviewerOwnOrg.status,201,"reviewer may still use organization onboarding");
const reviewerOwnOrgId=reviewerOwnOrg.payload?.data?.id;
const selfReview=await request("/api/v1/review/organizations",{method:"POST",token:reviewerToken,body:{organizationId:reviewerOwnOrgId,decision:"verified",reason:"conflict must fail"}});
assert.equal(selfReview.status,403,"reviewer cannot decide a case for an organization they own");
const jobTitle="Gate 4 persisted job "+Date.now();
const jobCreated=await request("/api/v1/jobs",{method:"POST",token,body:{organizationId,title:jobTitle,description:"CI-only public job for workflow integration",postingScope:"public",visibility:"public"}});
assert.equal(jobCreated.status,201,"verified organization owner should create a job");
const jobId=jobCreated.payload?.data?.id;
const jobPublished=await request("/api/v1/jobs/"+jobId+"/publish",{method:"POST",token});
assert.equal(jobPublished.status,200,"verified organization owner should publish the job");
const publicJobs=await request("/api/v1/jobs?q="+encodeURIComponent(jobTitle));
assert.equal(publicJobs.status,200,"public job discovery should return successfully");
assert.ok((publicJobs.payload?.data?.items||[]).some(j=>j.id===jobId),"published job must be discoverable from persisted data");
const publicInquiry=await request("/api/v1/public/opportunity-inquiries",{method:"POST",body:{inquiryType:"job",jobId,contactName:"Gate4 CI Candidate",contactEmail:"gate4-ci-"+Date.now()+"@example.test",intent:"I would like to learn more about this vacancy.",consent:true}});
assert.equal(publicInquiry.status,201,"public job inquiry should persist with explicit consent");
const publicInquiryId=publicInquiry.payload?.data?.id;
assert.equal(typeof publicInquiryId,"string","public inquiry should return a stable identifier");
const unauthorizedInquiryDecision=await request("/api/v1/opportunity-inquiries/"+publicInquiryId,{method:"PATCH",token:memberToken,body:{status:"contacted"}});
assert.equal(unauthorizedInquiryDecision.status,403,"unrelated member cannot decide an organization's inquiry");
const authorizedInquiryDecision=await request("/api/v1/opportunity-inquiries/"+publicInquiryId,{method:"PATCH",token,body:{status:"contacted",considerNonMember:true,note:"CI-only decision"}});
assert.equal(authorizedInquiryDecision.status,200,"authorized reviewer should persist the inquiry decision");
const filteredInquiries=await request("/api/v1/opportunity-inquiries?type=job&status=contacted",{token});
assert.equal(filteredInquiries.status,200,"admin inquiry list should support status filtering");
assert.ok((filteredInquiries.payload?.data||[]).some(i=>i.id===publicInquiryId&&i.consider_non_member===true),"inquiry decision and non-member consideration must persist");

const saved=await request("/api/v1/jobs/"+jobId+"/save",{method:"POST",token:memberToken});
assert.ok(saved.status===200||saved.status===201,"authenticated user should be able to save a public job");
const savedList=await request("/api/v1/me/saved-jobs",{token:memberToken});
assert.ok(savedList.status===200&&(savedList.payload?.data||[]).some(j=>j.id===jobId),"saved-job state must persist and be visible to its owner");
const unsaved=await request("/api/v1/jobs/"+jobId+"/save",{method:"DELETE",token:memberToken});
assert.equal(unsaved.status,200,"saved job should be removable");
const afterUnsave=await request("/api/v1/me/saved-jobs",{token:memberToken});
assert.ok(!(afterUnsave.payload?.data||[]).some(j=>j.id===jobId),"unsave must persist");
const alertCreated=await request("/api/v1/me/job-alerts",{method:"POST",token:memberToken,body:{name:"Gate 4 CI alert",criteria:{q:jobTitle},frequency:"daily",channel:"in_app"}});
assert.equal(alertCreated.status,201,"job alert criteria should be persisted");
const alerts=await request("/api/v1/me/job-alerts",{token:memberToken});
assert.ok((alerts.payload?.data||[]).some(a=>a.id===alertCreated.payload?.data?.id),"job alert should be visible to its creator");

const listing=await request("/api/v1/services",{method:"GET"});
assert.equal(listing.status,200,"published service discovery should be available");
const serviceCreated=await request("/api/v1/services",{method:"POST",token,body:{title:"Gate 4 CI advisory service",description:"CI-only service listing",serviceCategory:"advisory",pricingModel:"quote",visibility:"public"}});
assert.equal(serviceCreated.status,201,"active member should create a service listing");
const serviceId=serviceCreated.payload?.data?.id;
const servicePublished=await request("/api/v1/services/"+serviceId+"/status",{method:"POST",token,body:{status:"published"}});
assert.equal(servicePublished.status,200,"provider should publish the service");
const discoveredServices=await request("/api/v1/services?q="+encodeURIComponent("Gate 4 CI advisory service"));
assert.ok((discoveredServices.payload?.data?.items||[]).some(x=>x.id===serviceId),"published service should be discoverable");
const selfRequest=await request("/api/v1/services/"+serviceId+"/requests",{method:"POST",token,body:{message:"self-request must fail"}});
assert.equal(selfRequest.status,409,"provider must not request their own service");
const serviceRequest=await request("/api/v1/services/"+serviceId+"/requests",{method:"POST",token:memberToken,body:{message:"CI-only request"}});
assert.equal(serviceRequest.status,201,"another active member should be able to request a published service");
const serviceRequestId=serviceRequest.payload?.data?.id;
const duplicateRequest=await request("/api/v1/services/"+serviceId+"/requests",{method:"POST",token:memberToken,body:{message:"duplicate should fail"}});
assert.equal(duplicateRequest.status,409,"duplicate active service requests must be rejected");
const requesterAcceptDenied=await request("/api/v1/service-requests/"+serviceRequestId+"/status",{method:"POST",token:memberToken,body:{status:"accepted"}});
assert.equal(requesterAcceptDenied.status,403,"requester cannot impersonate provider acceptance");
const providerAccept=await request("/api/v1/service-requests/"+serviceRequestId+"/status",{method:"POST",token,body:{status:"accepted"}});
assert.equal(providerAccept.status,200,"provider should accept their own service request");
const providerStart=await request("/api/v1/service-requests/"+serviceRequestId+"/status",{method:"POST",token,body:{status:"in_progress"}});
assert.equal(providerStart.status,200,"provider should start an accepted service request");
const providerComplete=await request("/api/v1/service-requests/"+serviceRequestId+"/status",{method:"POST",token,body:{status:"completed",note:"Delivery submitted"}});
assert.equal(providerComplete.status,200,"provider completion should be recorded without bypassing requester acceptance");
const prematureList=await request("/api/v1/me/service-requests",{token:memberToken});
assert.ok((prematureList.payload?.data||[]).some(r=>r.id===serviceRequestId&&r.provider_completed_at),"requester should see the provider completion submission");
const requesterAccept=await request("/api/v1/service-requests/"+serviceRequestId+"/accept-completion",{method:"POST",token:memberToken,body:{note:"CI outcome accepted"}});
assert.equal(requesterAccept.status,200,"requester should explicitly accept the completed delivery");

const mentorshipRequest=await request("/api/v1/mentorship/requests",{method:"POST",token:memberToken,body:{goals:"CI-only mentorship goal",topics:["career"],preferredModes:["remote"],preferredLanguages:["English"]}});
assert.equal(mentorshipRequest.status,201,"active member should be able to persist an explicit mentorship request");
const mentorshipRequestId=mentorshipRequest.payload?.data?.id;
const requestDetails=await request("/api/v1/mentorship/requests/"+mentorshipRequestId,{token:memberToken});
assert.equal(requestDetails.status,200,"mentee should be able to read their own persisted request");
assert.equal(requestDetails.payload?.data?.goals,"CI-only mentorship goal","request detail must return persisted goals");
const otherRequestDetails=await request("/api/v1/mentorship/requests/"+mentorshipRequestId,{token});
assert.equal(otherRequestDetails.status,404,"another account must not read a private mentorship request");
const matches=await request("/api/v1/mentorship/requests/"+mentorshipRequestId+"/matches",{token:memberToken});
assert.equal(matches.status,200,"mentorship request owner should be able to inspect match results");
const persistedMentorship=(await db.query("select goals,status from mentorship_request where id=$1 and mentee_user_id=$2",[mentorshipRequestId,memberId])).rows[0];
assert.equal(persistedMentorship?.goals,"CI-only mentorship goal","mentorship request must persist its stated goal");
assert.equal(persistedMentorship?.status,"requested","request remains requested until matching and acceptance actions occur");
const unverifiedMentor=await request("/api/v1/me/mentor-profile",{method:"POST",token:memberToken,body:{headline:"Unverified CI mentor",expertise:["career"],languages:["English"],mentoringModes:["remote"]}});
assert.equal(unverifiedMentor.status,403,"mentor activation must require an eligible verified professional claim");

// Authorization boundary: account users cannot reach administration APIs.
const memberAdminDenied=await request("/api/v1/admin/users",{token:memberToken});
assert.equal(memberAdminDenied.status,403,"ordinary members cannot list administrative users");
const selfRoleChange=await request("/api/v1/admin/users/"+me.payload.data.user_id,{method:"PATCH",token,body:{roleCode:"system_admin",reason:"CI self-escalation negative case"}});
assert.equal(selfRoleChange.status,403,"an administrator cannot modify their own roles");
const restrictedAdminEmail="ci-gate2-limited-admin-"+Date.now()+"@example.test";
const restrictedAdminRegistration=await request("/api/v1/auth/register",{method:"POST",body:{email:restrictedAdminEmail,password:"ci-gate2-limited-admin-password-12345",firstName:"Gate2",lastName:"LimitedAdmin"}});
assert.equal(restrictedAdminRegistration.status,201,"CI should create a restricted administrator fixture");
const restrictedAdminId=restrictedAdminRegistration.payload?.data?.user?.id;
await db.query("insert into app_user_role(user_id,role_id,assigned_by) select $1,id,$2 from app_role where role_code='admin' on conflict do nothing",[restrictedAdminId,me.payload.data.user_id]);
const restrictedAdminLogin=await request("/api/v1/auth/login",{method:"POST",body:{email:restrictedAdminEmail,password:"ci-gate2-limited-admin-password-12345"}});
assert.equal(restrictedAdminLogin.status,200,"limited administrator should establish a session with its current database role");
const restrictedAdminToken=restrictedAdminLogin.payload?.data?.token;
const restrictedPrivilegeGrant=await request("/api/v1/admin/users/"+memberId,{method:"PATCH",token:restrictedAdminToken,body:{roleCode:"system_admin",reason:"CI privileged-role denial"}});
assert.equal(restrictedPrivilegeGrant.status,403,"an ordinary administrator cannot grant system-administrator privilege");
const restrictedReviewerGrant=await request("/api/v1/admin/users/"+memberId,{method:"PATCH",token:restrictedAdminToken,body:{roleCode:"reviewer",reason:"CI reviewer privilege denial"}});
assert.equal(restrictedReviewerGrant.status,403,"an ordinary administrator cannot grant reviewer privilege");
const restrictedAdminManageSystem=await request("/api/v1/admin/users/"+me.payload.data.user_id,{method:"PATCH",token:restrictedAdminToken,body:{status:"suspended",reason:"CI privileged-target denial"}});
assert.equal(restrictedAdminManageSystem.status,403,"an ordinary administrator cannot modify a system-administrator account");
await db.query("delete from app_user_role where user_id=$1 and role_id=(select id from app_role where role_code='admin')",[restrictedAdminId]);
const currentRoleEnforcement=await request("/api/v1/admin/users",{token:restrictedAdminToken});
assert.equal(currentRoleEnforcement.status,403,"authorization must use current database roles instead of stale token claims");
const roleGrant=await request("/api/v1/admin/users/"+memberId,{method:"PATCH",token,body:{roleCode:"mentor",reason:"CI role-change session invalidation"}});
assert.equal(roleGrant.status,200,"authorized admin may grant a non-privileged role");
const staleAfterGrant=await request("/api/v1/me",{token:memberToken});
assert.equal(staleAfterGrant.status,401,"role changes must revoke existing sessions");
const freshMemberLogin=await request("/api/v1/auth/login",{method:"POST",body:{email:memberEmail,password:"ci-gate4-password-12345"}});
assert.equal(freshMemberLogin.status,200,"account may establish a new session after role change");
const freshMemberToken=freshMemberLogin.payload?.data?.token;
const roleRemoval=await request("/api/v1/admin/users/"+memberId,{method:"PATCH",token,body:{removeRoleCode:"mentor",reason:"CI role-removal session invalidation"}});
assert.equal(roleRemoval.status,200,"authorized admin may remove a non-privileged role");
assert.equal((await request("/api/v1/me",{token:freshMemberToken})).status,401,"role removal must revoke sessions issued before removal");
const roleAudit=(await db.query("select metadata from audit_log where actor_user_id=$1 and action='admin.user.updated' and resource_id=$2 order by occurred_at desc limit 1",[me.payload.data.user_id,memberId])).rows[0];
assert.ok(roleAudit?.metadata?.previousRoles&&roleAudit?.metadata?.currentRoles,"role audit must preserve old and new role sets");
assert.ok(roleAudit?.metadata?.reason,"role audit must preserve the supplied reason");

// Last-system-administrator protection: a second privileged fixture can be removed, but the final one cannot.
await db.query("insert into app_user_role(user_id,role_id,assigned_by) select $1,id,$2 from app_role where role_code='system_admin' on conflict do nothing",[memberId,me.payload.data.user_id]);
const removeSecondSystemAdmin=await request("/api/v1/admin/users/"+memberId,{method:"PATCH",token,body:{removeRoleCode:"system_admin",reason:"CI last-system-admin invariant"}});
assert.equal(removeSecondSystemAdmin.status,200,"a system administrator may remove a redundant second system-administrator role");
const removeLastSystemAdmin=await request("/api/v1/admin/users/"+memberId,{method:"PATCH",token,body:{removeRoleCode:"system_admin",reason:"CI last-system-admin invariant"}});
assert.equal(removeLastSystemAdmin.status,400,"the platform must not remove its final system administrator");

const logout=await request("/api/v1/auth/logout",{method:"POST",token});
assert.equal(logout.status,200,"logout should revoke the current session");
const afterLogout=await request("/api/v1/me",{token});
assert.equal(afterLogout.status,401,"revoked session must not access authenticated profile data");

console.log("API smoke passed: jobs publication/search/save/alerts, organization evidence privacy, services request and acceptance lifecycle, mentorship request persistence/eligibility, private upload validation, and session lifecycle.");

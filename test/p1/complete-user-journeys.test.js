import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPool, closePool } from "../../src/platform/db.js";
import * as membership from "../../src/membership/service.js";
import * as organizationJobs from "../../src/organization-jobs/service.js";
import * as marketplace from "../../src/services-mentorship/demand.js";
import * as organizationOffers from "../../src/services-mentorship/organization-offers.js";
import * as journeys from "../../src/services-mentorship/service.js";

function identity(suffix){
 const digits=suffix.replace(/[^0-9]/g,"").slice(0,8).padEnd(8,"7");
 return {email:"journey-"+suffix+"@example.test",password:"JourneyGate2Password!2026",firstName:"Journey",lastName:"Gate"+suffix.slice(0,8),phone:"06"+digits};
}
async function account(suffix=randomUUID()){
 const created=await membership.register(identity(suffix),"gate2-journey-"+suffix);
 return created.user.id;
}
async function activeMember(userId){
 const db=getPool(),product=(await db.query("select id from membership_product where product_code='BASIC'")).rows[0];
 assert.ok(product,"BASIC membership product must exist");
 await db.query("insert into membership_record(user_id,membership_product_id,membership_number,status,start_date,end_date,source) values($1,$2,$3,'active',current_date,current_date+365,'online')",[userId,product.id,"MPA-G2-"+randomUUID().slice(0,8).toUpperCase()]);
 const role=(await db.query("select id from app_role where role_code='member'")).rows[0];
 if(role) await db.query("insert into app_user_role(user_id,role_id) values($1,$2) on conflict do nothing",[userId,role.id]);
}
async function supportStaff(){
 const db=getPool(),userId=await account();
 const role=(await db.query("select id from app_role where role_code='supporting_staff'")).rows[0];
 assert.ok(role,"supporting_staff role must exist");
 await db.query("insert into app_user_role(user_id,role_id) values($1,$2) on conflict do nothing",[userId,role.id]);
 return userId;
}
async function verifiedProfessionalClaim(userId){
 const db=getPool(),suffix=randomUUID().replaceAll("-","").slice(0,10);
 const program=(await db.query("insert into verification_program(program_code,name,purpose,subject_type) values($1,$2,$3,'person') returning id",["gate2-journey-"+suffix,"Gate 2 test verification","Test-only verified professional claim for a complete mentorship journey."])).rows[0];
 const verificationCase=(await db.query("insert into verification_case(program_id,subject_user_id,status,purpose_snapshot,opened_by) values($1,$2,'approved',$3,$2) returning id",[program.id,userId,"Gate 2 mentorship test"])).rows[0];
 const claimType=(await db.query("insert into verification_claim_type(claim_code,name,active) values('professional_certification','Professional certification',true) on conflict(claim_code) do update set active=true returning id")).rows[0];
 await db.query("insert into verification_claim(case_id,claim_type_id,claim_code_snapshot,claimed_value,status,verified_at) values($1,$2,'professional_certification',$3,'verified',now())",[verificationCase.id,claimType.id,{source:"Gate 2 integration test"}]);
}
async function approvedOrg(ownerId){
 const db=getPool();
 const org=await organizationJobs.registerOrganization(ownerId,{legalName:"Gate 2 Org "+randomUUID(),displayName:"Gate 2 Verified Organization"},"gate2-org-create");
 await db.query("update organization set verification_status='verified',verified_at=now(),verified_by=$2,public_visible=true where id=$1",[org.id,ownerId]);
 return org;
}

test("Gate 2: public service journey reaches accepted delivery, requester outcome acceptance and feedback",async()=>{
 const provider=await account(),requester=await account(),staff=await supportStaff();
 await activeMember(provider);
 const listing=await journeys.createServiceListing(provider,{title:"Gate 2 bookkeeping support",description:"Monthly bookkeeping, reconciliation and clear management reporting for small teams.",serviceCategory:"Finance",deliveryMode:"remote",pricingModel:"quote",visibility:"public"},"gate2-service-create");
 const submitted=await journeys.changeServiceListingStatus(listing.id,provider,"published","gate2-service-submit");
 assert.equal(submitted.moderation_status,"pending");
 assert.equal((await journeys.listServices(null,{q:"Gate 2 bookkeeping support"})).items.some(x=>x.id===listing.id),false);
 assert.ok((await marketplace.listAdminListings(staff)).some(x=>x.id===listing.id&&x.moderation_status==="pending"));
 const approved=await marketplace.moderateListing("service",listing.id,staff,{decision:"approved",note:"Scope and public description reviewed."},"gate2-service-approve");
 assert.equal(approved.status,"published");
 assert.ok((await journeys.listServices(null,{q:"Gate 2 bookkeeping support"})).items.some(x=>x.id===listing.id));
 const request=await journeys.requestService(listing.id,requester,{message:"Please help us reconcile the last quarter."},"gate2-service-request");
 await assert.rejects(journeys.changeServiceRequestStatus(request.id,await account(),"accepted","unrelated user","gate2-outsider"),e=>e.code==="FORBIDDEN");
 assert.equal((await journeys.changeServiceRequestStatus(request.id,provider,"accepted","Scope confirmed.","gate2-service-accept")).status,"accepted");
 assert.equal((await journeys.changeServiceRequestStatus(request.id,provider,"in_progress","Work started.","gate2-service-start")).status,"in_progress");
 const milestone=await journeys.createServiceMilestone(request.id,provider,{title:"Quarterly reconciliation","description":"Reconcile records and deliver a summary."},"gate2-service-milestone");
 const delivery=await journeys.submitServiceDelivery(request.id,provider,{milestoneId:milestone.id,description:"Reconciliation completed; summary and exceptions are documented."},"gate2-service-delivery");
 assert.equal((await journeys.reviewServiceDelivery(delivery.id,requester,{status:"accepted",note:"Reviewed and accepted."},"gate2-service-review")).status,"accepted");
 assert.equal((await journeys.listServiceMilestones(request.id,requester)).find(x=>x.id===milestone.id).status,"completed");
 await journeys.changeServiceRequestStatus(request.id,provider,"completed","Delivery submitted for requester acceptance.","gate2-service-completion");
 const completed=await journeys.acceptServiceCompletion(request.id,requester,"The agreed outcome is accepted.","gate2-service-outcome");
 assert.equal(completed.status,"completed");
 const feedback=await journeys.submitServiceFeedback(request.id,requester,{targetRole:"provider",rating:5,comments:"Clear communication and useful outcome."},"gate2-service-feedback");
 assert.equal(Number(feedback.rating),5);
});

test("Gate 2: verified organization publishes under its own identity and can fulfill a public service request",async()=>{
 const owner=await account(),requester=await account(),staff=await supportStaff(),org=await approvedOrg(owner);
 const listing=await journeys.createServiceListing(owner,{organizationId:org.id,title:"Gate 2 organization training",description:"Practical workplace training with a clear agenda, materials and measurable learning outcomes.",serviceCategory:"Training",deliveryMode:"hybrid",pricingModel:"quote",visibility:"public"},"gate2-org-service-create");
 assert.equal(listing.organization_id,org.id);
 const submitted=await journeys.changeServiceListingStatus(listing.id,owner,"published","gate2-org-service-submit");
 assert.equal(submitted.moderation_status,"pending");
 const approved=await marketplace.moderateListing("service",listing.id,staff,{decision:"approved",note:"Organization offer reviewed."},"gate2-org-service-approve");
 assert.equal(approved.status,"published");
 const publicListing=(await journeys.listServices(null,{q:"Gate 2 organization training"})).items.find(x=>x.id===listing.id);
 assert.ok(publicListing);assert.equal(publicListing.organization_id,org.id);assert.equal(publicListing.display_name,org.display_name);
 const request=await journeys.requestService(listing.id,requester,{message:"Please share a training outline and available dates."},"gate2-org-service-request");
 assert.equal((await journeys.changeServiceRequestStatus(request.id,owner,"accepted","Organization accepted the request.","gate2-org-service-accept")).status,"accepted");
});

test("Gate 2: mentorship offer is reviewed, matched, accepted, scheduled, completed and rated",async()=>{
 const mentor=await account(),mentee=await account(),staff=await supportStaff();
 await activeMember(mentor);await activeMember(mentee);await verifiedProfessionalClaim(mentor);
 const profile=await journeys.createMentorProfile(mentor,{headline:"Gate 2 product mentorship",bio:"Practical product discovery and delivery coaching.",expertise:["product","strategy"],languages:["english"],mentoringModes:["remote"],visibility:"public",maxActiveMentees:3},"gate2-mentor-create");
 const submitted=await journeys.changeMentorStatus(profile.id,mentor,"active","gate2-mentor-submit");
 assert.equal(submitted.moderation_status,"pending");
 assert.ok((await marketplace.listAdminListings(staff)).some(x=>x.id===profile.id&&x.listing_type==="mentorship"));
 const approved=await marketplace.moderateListing("mentorship",profile.id,staff,{decision:"approved",note:"Mentorship offer reviewed."},"gate2-mentor-approve");
 assert.equal(approved.status,"active");
 assert.ok((await journeys.listMentors(mentee,{q:"Gate 2 product mentorship"})).some(x=>x.id===profile.id));
 const start=new Date(Date.now()+14*24*60*60*1000);start.setUTCHours(7,0,0,0);
 const weekdayNames={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
 const weekday=weekdayNames[new Intl.DateTimeFormat("en-US",{weekday:"short",timeZone:"Africa/Addis_Ababa"}).format(start)];
 await journeys.setMentorAvailability(profile.id,mentor,{slots:[{dayOfWeek:weekday,startTime:"09:00",endTime:"12:00",timezone:"Africa/Addis_Ababa"}]},"gate2-mentor-availability");
 const request=await journeys.createMentorshipRequest(mentee,{goals:"Build a realistic product discovery and delivery plan.",topics:["product","strategy"],preferredModes:["remote"],preferredLanguages:["english"],preferredDays:[weekday]},"gate2-mentorship-request");
 const matches=await journeys.findMentorMatches(request.id,mentee);
 assert.ok(matches.some(x=>x.mentorUserId===mentor));
 const proposed=await journeys.proposeMentorMatch(request.id,mentor,mentee,"gate2-mentorship-propose");
 assert.equal(proposed.status,"proposed");
 assert.equal((await journeys.respondToMatch(proposed.id,mentor,"accepted","gate2-mentorship-accept")).status,"accepted");
 const engagement=(await journeys.listMyMentorships(mentee)).find(x=>x.mentor_user_id===mentor);
 assert.ok(engagement);assert.equal(engagement.status,"active");
 const sessionStart=start.toISOString(),sessionEnd=new Date(start.getTime()+60*60*1000).toISOString();
 const session=await journeys.createMentorshipSession(engagement.id,mentor,{scheduledStartAt:sessionStart,scheduledEndAt:sessionEnd,mode:"remote",agenda:"Review the discovery plan"},"gate2-mentorship-session");
 assert.equal(session.status,"scheduled");
 assert.equal((await journeys.changeMentorshipSession(session.id,mentee,"completed","Session completed with agreed next steps.","gate2-session-complete")).status,"completed");
 const sessionFeedback=await journeys.submitMentorshipFeedback(engagement.id,mentee,{targetRole:"mentor",rating:5,comments:"Useful and practical.",sessionId:session.id},"gate2-session-feedback");
 assert.equal(Number(sessionFeedback.rating),5);
 await journeys.changeMentorshipStatus(engagement.id,mentor,"completed","The agreed mentorship goals were reviewed.","gate2-mentorship-complete");
 const programFeedback=await journeys.submitMentorshipFeedback(engagement.id,mentee,{targetRole:"program",rating:5,comments:"The mentorship reached its agreed outcome."},"gate2-program-feedback");
 assert.equal(Number(programFeedback.rating),5);
});

test("Gate 2: verified organization mentorship offer is moderated, requested, accepted and completed",async()=>{
 const owner=await account(),requester=await account(),staff=await supportStaff(),org=await approvedOrg(owner);
 const offer=await organizationOffers.createOrganizationMentorshipOffer(owner,{organizationId:org.id,title:"Gate 2 leadership mentorship program",description:"A structured program for early-career professionals with guided goals, mentor check-ins and a clear completion outcome.",expertise:["leadership","career development"],languages:["English","Amharic"],deliveryMode:"hybrid",visibility:"public"},"gate2-org-mentorship-create");
 assert.equal(offer.organization_id,org.id);assert.equal(offer.moderation_status,"pending");
 const submitted=await organizationOffers.changeOrganizationMentorshipOfferStatus(offer.id,owner,"published","gate2-org-mentorship-submit");
 assert.equal(submitted.status,"draft");
 assert.ok((await marketplace.listAdminListings(staff)).some(x=>x.id===offer.id&&x.listing_type==="organization_mentorship"));
 const moderated=await marketplace.moderateListing("organization_mentorship",offer.id,staff,{decision:"approved",note:"Verified organization program and public copy reviewed."},"gate2-org-mentorship-approve");
 assert.equal(moderated.status,"published");
 const publicOffer=(await organizationOffers.listOrganizationMentorshipOffers(null)).find(x=>x.id===offer.id);
 assert.ok(publicOffer);assert.equal(publicOffer.organization_name,org.display_name);
 const request=await organizationOffers.requestOrganizationMentorship(offer.id,requester,{message:"I want support building a leadership plan and improving team communication."},"gate2-org-mentorship-request");
 assert.equal(request.status,"requested");
 assert.ok((await organizationOffers.listMyOrganizationMentorshipRequests(owner)).some(x=>x.id===request.id&&!x.is_requester));
 const accepted=await organizationOffers.respondOrganizationMentorshipRequest(request.id,owner,"accepted","We can support this goal. The organization will contact you to agree next steps.","gate2-org-mentorship-accept");
 assert.equal(accepted.status,"accepted");
 const completed=await organizationOffers.respondOrganizationMentorshipRequest(request.id,owner,"completed","Program completed and the agreed outcome was recorded.","gate2-org-mentorship-complete");
 assert.equal(completed.status,"completed");
 assert.equal((await organizationOffers.listMyOrganizationMentorshipRequests(requester)).find(x=>x.id===request.id).status,"completed");
});

test("Gate 2: Support Desk proposes a suitable provider and the provider responds before demand is matched",async()=>{
 const provider=await account(),requester=await account(),staff=await supportStaff();
 await activeMember(provider);
 const listing=await journeys.createServiceListing(provider,{title:"Gate 2 demand-matching service",description:"Practical business operations support with a defined scope and measurable outcomes.",serviceCategory:"Operations",deliveryMode:"remote",pricingModel:"quote",visibility:"public"},"gate2-match-listing-create");
 await journeys.changeServiceListingStatus(listing.id,provider,"published","gate2-match-listing-submit");
 await marketplace.moderateListing("service",listing.id,staff,{decision:"approved",note:"Public provider offer reviewed."},"gate2-match-listing-approve");
 const demand=await marketplace.createDemand(requester,{demandType:"service",title:"Need operations support",description:"Our small team needs help improving weekly workflows and documenting reliable operating procedures.",category:"Operations",deliveryMode:"remote"},"gate2-match-demand-create");
 await assert.rejects(marketplace.reviewDemand(demand.id,staff,{status:"matched",internalNote:"",outcomeCode:"provider_search"},"gate2-match-premature"),e=>e.code==="PROVIDER_MATCH_REQUIRED");
 const candidates=await marketplace.listDemandMatchCandidates(staff,"service");
 assert.ok(candidates.some(x=>x.id===listing.id&&x.listing_type==="service"));
 const match=await marketplace.createDemandProviderMatch(demand.id,staff,{listingType:"service",listingId:listing.id,note:"The offer's scope aligns with the requested workflow support."},"gate2-match-propose");
 assert.equal(match.status,"proposed");
 assert.ok((await marketplace.listMyDemandProviderMatches(provider)).some(x=>x.id===match.id&&!x.is_requester));
 await assert.rejects(marketplace.respondToDemandProviderMatch(match.id,requester,"accepted","Not the provider","gate2-match-outsider"),e=>e.code==="FORBIDDEN");
 const accepted=await marketplace.respondToDemandProviderMatch(match.id,provider,"accepted","We can help and will contact the requester to confirm the scope.","gate2-match-accept");
 assert.equal(accepted.status,"accepted");
 const requesterView=(await marketplace.listMyDemandProviderMatches(requester)).find(x=>x.id===match.id);
 assert.equal(requesterView.status,"accepted");
 assert.equal((await marketplace.listReviewQueue(staff,{status:"matched"})).some(x=>x.id===demand.id),true);
});

test.after(async()=>{await closePool();});

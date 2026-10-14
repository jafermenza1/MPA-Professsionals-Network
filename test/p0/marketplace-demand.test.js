import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPool, closePool } from "../../src/platform/db.js";
import * as membership from "../../src/membership/service.js";
import * as organizationJobs from "../../src/organization-jobs/service.js";
import * as marketplaceDemand from "../../src/services-mentorship/demand.js";
import * as services from "../../src/services-mentorship/service.js";

async function account(suffix){
 const digits=suffix.replace(/[^0-9]/g,"").slice(0,8).padEnd(8,"7");
 const created=await membership.register({email:"marketplace-"+suffix+"@example.test",password:"MarketplaceP1Password!2026",firstName:"Market",lastName:"Test"+suffix.slice(0,8),phone:"07"+digits},"marketplace-test-"+suffix);
 return created.user.id;
}
async function activeMember(userId){
 const db=getPool(),product=(await db.query("select id from membership_product where product_code='BASIC'")).rows[0];
 assert.ok(product,"BASIC membership product must exist");
 await db.query("insert into membership_record(user_id,membership_product_id,membership_number,status,start_date,end_date,source) values($1,$2,$3,'active',current_date,current_date+365,'online')",[userId,product.id,"MPA-MKT-"+randomUUID().slice(0,8).toUpperCase()]);
}
async function supportStaff(){
 const db=getPool(),userId=await account(randomUUID());
 const role=(await db.query("select id from app_role where role_code='supporting_staff'")).rows[0];
 assert.ok(role,"supporting_staff role must exist");
 await db.query("insert into app_user_role(user_id,role_id) values($1,$2) on conflict do nothing",[userId,role.id]);
 return userId;
}
test("P1 marketplace: private demand is reviewed before a privacy-safe public topic appears; interests are unique",async()=>{
 const requester=await account(randomUUID()),staff=await supportStaff();
 const demand=await marketplaceDemand.createDemand(requester,{demandType:"service",title:"Need bookkeeping support",description:"Our small team needs monthly bookkeeping and financial reporting support.",category:"Finance",deliveryMode:"remote"},"marketplace-demand-submit");
 assert.equal(demand.status,"submitted");
 const privateRows=await marketplaceDemand.listMyDemand(requester);
 assert.ok(privateRows.some(row=>row.id===demand.id));
 const reviewed=await marketplaceDemand.reviewDemand(demand.id,staff,{status:"topic_published",publishTopic:true,publicTitle:"Bookkeeping support for small teams",publicSummary:"Small teams are seeking qualified help with monthly bookkeeping and clear financial reporting.",publicCategory:"Finance",interestGoal:5},"marketplace-demand-review");
 assert.equal(reviewed.status,"topic_published");
 assert.ok(reviewed.topic?.id);
 const feed=await marketplaceDemand.listPublishedTopics({type:"service"});
 const topic=feed.items.find(item=>item.id===reviewed.topic.id);
 assert.ok(topic);
 assert.equal("requester_user_id" in topic,false);
 assert.equal("description" in topic,false);
 await marketplaceDemand.joinDemandTopic(topic.id,requester,{interestLevel:"exploring"},"marketplace-interest-first");
 await marketplaceDemand.joinDemandTopic(topic.id,requester,{interestLevel:"ready_to_engage"},"marketplace-interest-update");
 const refreshed=(await marketplaceDemand.listPublishedTopics({type:"service"})).items.find(item=>item.id===topic.id);
 assert.equal(refreshed.interest_count,1);
 assert.equal(refreshed.ready_count,1);
 assert.equal((await marketplaceDemand.listMyInterests(requester)).filter(row=>row.topic_id===topic.id).length,1);
});
test("P1 marketplace: organization demand is visible to its owner but not an unrelated account",async()=>{
 const owner=await account(randomUUID()),unrelated=await account(randomUUID());
 const org=await organizationJobs.registerOrganization(owner,{legalName:"Marketplace Test "+randomUUID(),displayName:"Marketplace Test Organization"},"marketplace-org-create");
 const demand=await marketplaceDemand.createDemand(owner,{demandType:"mentorship",title:"Mentorship for early-career staff",description:"Our organization seeks a structured mentoring program for early-career team members.",category:"Career development",organizationId:org.id},"marketplace-org-demand");
 assert.ok((await marketplaceDemand.listMyDemand(owner)).some(row=>row.id===demand.id));
 assert.equal((await marketplaceDemand.listMyDemand(unrelated)).some(row=>row.id===demand.id),false);
});
test("P1 marketplace: service listings stay hidden until approved by Support Desk",async()=>{
 const provider=await account(randomUUID()),staff=await supportStaff();
 await activeMember(provider);
 const listing=await services.createServiceListing(provider,{title:"Test professional service",description:"A detailed professional service for marketplace moderation testing.",serviceCategory:"Testing",deliveryMode:"remote",pricingModel:"quote",visibility:"public"},"marketplace-listing-create");
 const submitted=await services.changeServiceListingStatus(listing.id,provider,"published","marketplace-listing-submit");
 assert.equal(submitted.status,"draft");assert.equal(submitted.moderation_status,"pending");
 assert.equal((await services.listServices(null,{q:"Test professional service"})).items.some(item=>item.id===listing.id),false);
 const queue=await marketplaceDemand.listAdminListings(staff);
 assert.ok(queue.some(item=>item.id===listing.id&&item.moderation_status==="pending"));
 await marketplaceDemand.moderateListing("service",listing.id,staff,{decision:"approved",note:"Approved by automated test."},"marketplace-listing-approve");
 assert.equal((await services.listServices(null,{q:"Test professional service"})).items.some(item=>item.id===listing.id),true);
});
test.after(async()=>{await closePool();});

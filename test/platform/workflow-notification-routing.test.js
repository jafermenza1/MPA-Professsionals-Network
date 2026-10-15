import test from "node:test";
import assert from "node:assert/strict";
import { createInAppNotification, notificationCategoryFor } from "../../src/platform/notifications.js";

function fakeDb(preference={in_app_enabled:true,in_app_categories:{}}){
 const calls=[];
 return {calls,async query(sql,params=[]){
  calls.push({sql,params});
  if(sql.startsWith("select coalesce(in_app_enabled"))return {rows:[preference]};
  if(sql.includes("insert into notification_event"))return {rows:[{id:"notification-1"}]};
  throw new Error("Unexpected query in notification unit test: "+sql);
 }};
}

test("workflow event and resource codes map to their product notification categories",()=>{
 assert.equal(notificationCategoryFor("membership_application_submitted","membership_application"),"membership");
 assert.equal(notificationCategoryFor("verification_case_opened","verification_case"),"verification");
 assert.equal(notificationCategoryFor("job.application_status_changed","job_application"),"recruitment");
 assert.equal(notificationCategoryFor("organization.review_update","organization"),"organizations");
 assert.equal(notificationCategoryFor("mentorship.session_scheduled","mentorship_session"),"mentorship");
 assert.equal(notificationCategoryFor("service.delivery_submitted","service_request_delivery"),"services");
 assert.equal(notificationCategoryFor("security.credentials_changed","security_event"),"security");
 assert.equal(notificationCategoryFor("professional.workflow_update","service_request"),"services");
});

test("ordinary category preferences suppress optional in-app notifications",async()=>{
 const db=fakeDb({in_app_enabled:false,in_app_categories:{services:false}});
 const result=await createInAppNotification(db,"user-1","service.request_received","service_request","request-1",{nextAction:"Respond"});
 assert.equal(result,null);
 assert.equal(db.calls.filter(call=>call.sql.includes("insert into notification_event")).length,0);
});

test("critical security notifications bypass ordinary notification preference toggles",async()=>{
 const db=fakeDb({in_app_enabled:false,in_app_categories:{security:false}});
 const result=await createInAppNotification(db,"user-1","security.credentials_changed","security_event","user-1",{
  category:"security",critical:true,priority:"urgent",message:"Credentials changed.",nextAction:"Review account security.",actionUrl:"/profile",eventVersion:"request-1"
 });
 assert.equal(result.id,"notification-1");
 const insert=db.calls.find(call=>call.sql.includes("insert into notification_event"));
 assert.ok(insert);
 assert.equal(insert.params[5],"security");
 assert.equal(insert.params[8],"urgent");
 assert.equal(insert.params[9],true);
 assert.equal(insert.params[10],"/profile");
 assert.match(insert.params[11],/security.credentials_changed:security_event:user-1:request-1/);
});

test("deduplication distinguishes separate persisted workflow transitions",async()=>{
 const db=fakeDb();
 await createInAppNotification(db,"user-1","job.application_status_changed","job_application","app-1",{status:"shortlisted"});
 await createInAppNotification(db,"user-1","job.application_status_changed","job_application","app-1",{status:"interview"});
 const inserts=db.calls.filter(call=>call.sql.includes("insert into notification_event"));
 assert.equal(inserts.length,2);
 assert.notEqual(inserts[0].params[11],inserts[1].params[11]);
});

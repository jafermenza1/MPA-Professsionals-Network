import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPool, closePool } from "../../src/platform/db.js";
import * as membership from "../../src/membership/service.js";

const suffix=randomUUID().slice(0,8);
const email=`phase1-${suffix}@example.test`;
let userId;
let applicationId;
let paymentId;
let membershipId;

test("Phase 1 completes registration, profile and application identity flow",async()=>{
  const registered=await membership.register({
    email,password:"Phase1SecurePassword!",
    firstName:"Phase",lastName:`Member${suffix}`,phone:`09${String(Date.now()).slice(-8)}`,
    headline:"Professional",bio:"Phase 1 test profile"
  },"phase1-test-register");
  userId=registered.user.id;
  assert.equal(registered.person.first_name,"Phase");
  assert.ok(registered.token);

  const me=await membership.getMe(userId);
  assert.equal(me.email,email);
  const updated=await membership.updateProfile(userId,{firstName:"Phase",lastName:`Member${suffix}`,headline:"Updated Professional"},"phase1-test-profile");
  assert.equal(updated.headline,"Updated Professional");

  const app=await membership.createApplication(userId,{productCode:"BASIC"},"phase1-test-application");
  applicationId=app.id;
  assert.equal(app.status,"submitted");
  assert.equal(app.fee_snapshot.amount,1200);

  const duplicate=membership.createApplication(userId,{productCode:"BASIC"},"phase1-test-duplicate");
  await assert.rejects(duplicate,e=>e.code==="APPLICATION_EXISTS");
});

test("Phase 1 correction and review workflow is auditable",async()=>{
  const db=getPool();
  await db.query("insert into app_user_role(user_id,role_id) select $1,id from app_role where role_code='reviewer' on conflict do nothing",[userId]);

  const correction=await membership.reviewApplication(applicationId,userId,{
    decision:"correction_required",note:"Please confirm your professional headline.",requestedFields:["profile.headline"]
  },"phase1-test-correction");
  assert.equal(correction.decision,"correction_required");

  const submitted=await membership.respondCorrection(applicationId,userId,{response:{profile:{headline:"Confirmed Headline"}}},"phase1-test-correction-response");
  assert.equal(submitted.status,"submitted");

  const approved=await membership.reviewApplication(applicationId,userId,{
    decision:"approved",note:"Application meets current membership requirements.",checklist:[{code:"identity",passed:true}]
  },"phase1-test-approval");
  assert.equal(approved.decision,"approved");

  const appRow=(await db.query("select status from membership_application where id=$1",[applicationId])).rows[0];
  assert.equal(appRow.status,"payment_pending");
});

test("Phase 1 manual payment verification controls activation",async()=>{
  const db=getPool();
  const file=(await db.query(`insert into file_object(storage_provider,object_key,original_name,content_type,byte_size,visibility,created_by)
    values('test','phase1/${suffix}/receipt.jpg','receipt.jpg','image/jpeg',10,'private',$1) returning id`,[userId])).rows[0];
  await membership.attachApplicationFile(applicationId,userId,{fileObjectId:file.id,attachmentType:"identity_support"},"phase1-test-attachment");

  const payment=await membership.createManualPayment(applicationId,userId,{
    amount:1200,currency:"ETB",channel:"bank_transfer",reference:`BANK-${suffix}`,
    evidenceFileId:file.id,idempotencyKey:`phase1:${suffix}`
  },"phase1-test-payment");
  paymentId=payment.id;
  assert.equal(payment.status,"pending");
  assert.equal(payment.channel,"bank_transfer");

  const verified=await membership.verifyPayment(paymentId,userId,{
    decision:"approved",evidenceChecked:[{type:"receipt",valid:true}],note:"Receipt and bank reference checked."
  },"phase1-test-payment-verification");
  assert.equal(verified.status,"succeeded");

  const activated=await membership.activateApplication(applicationId,userId,"phase1-test-activation");
  membershipId=activated.id;
  assert.equal(activated.status,"active");
  assert.ok(activated.membership_number);

  const history=await membership.history(userId);
  assert.equal(history.memberships.length,1);
  assert.equal(history.payments[0].status,"succeeded");
  assert.equal(history.events[0].event_type,"activated");
  assert.ok(history.notifications.length>=4);
});

test("Phase 1 renewal creates a linked renewal application without losing history",async()=>{
  const renewal=await membership.renew(userId,"BASIC","phase1-test-renewal");
  assert.equal(renewal.application_type,"renewal");
  assert.equal(renewal.previous_membership_id,membershipId);
  const history=await membership.history(userId);
  assert.equal(history.memberships.length,1);
  assert.equal(history.applications.length,2);
});

test("Phase 1 notification preferences are persisted",async()=>{
  const saved=await membership.notificationPreferences(userId,{emailEnabled:true,smsEnabled:false,pushEnabled:true,inAppEnabled:true});
  assert.equal(saved.sms_enabled,false);
  const loaded=await membership.notificationPreferences(userId);
  assert.equal(loaded.sms_enabled,false);
});

test("Gate 5 me contract exposes the authenticated profile and current roles",async()=>{
  const me=await membership.getMe(userId);
  assert.equal(me.user_id,userId);
  assert.equal(me.email,email);
  assert.equal(me.status,"active");
  assert.ok(Array.isArray(me.roles));
  assert.ok(me.roles.includes("member"));
  assert.ok(me.person_id);
  assert.ok(me.profile_id);
  assert.ok(me.display_name);
  assert.equal(me.first_name,"Phase");
  assert.equal(me.headline,"Updated Professional");
  assert.equal(me.completion_percent >= 20,true);
});


test.after("close database pool",async()=>{ await closePool(); });

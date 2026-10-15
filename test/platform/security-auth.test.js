import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { getPool, closePool, withTransaction } from "../../src/platform/db.js";
import * as membership from "../../src/membership/service.js";
import { hashSessionToken } from "../../src/platform/auth.js";
import { issueHumanChallenge, verifyHumanChallenge, consumeHumanChallenge, enforcePersistentRateLimit, hashSecurityToken } from "../../src/platform/security-controls.js";
import { recoverAdminPasskey, beginAdminPasskeyAuthentication, finishAdminPasskeyAuthentication } from "../../src/platform/webauthn.js";
import { createEmailVerification, verifyEmailToken, assertEmailDeliveryConfigured } from "../../src/platform/email-verification.js";

const suffix=randomUUID().replace(/-/g,"").slice(0,12);
const createdUsers=[];

test("production email verification fails closed without an HTTPS delivery configuration",()=>{
  const keys=["NODE_ENV","JWT_SECRET","EMAIL_DELIVERY_WEBHOOK_URL","EMAIL_DELIVERY_WEBHOOK_SECRET","RESEND_API_KEY","EMAIL_FROM","PUBLIC_APP_URL"];
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  process.env.NODE_ENV="production";
  process.env.JWT_SECRET="security-test-production-secret-with-more-than-32-characters";
  delete process.env.EMAIL_DELIVERY_WEBHOOK_URL;
  delete process.env.EMAIL_DELIVERY_WEBHOOK_SECRET;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.PUBLIC_APP_URL;
  try{assert.throws(assertEmailDeliveryConfigured,error=>error.code==="EMAIL_DELIVERY_NOT_CONFIGURED");}
  finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});

test("first-party human challenge rejects wrong answers and verified tokens are single-use",async()=>{
  const challenge=await issueHumanChallenge();
  const match=challenge.question.match(/(\d+)\s*([+−])\s*(\d+)/);
  assert.ok(match,"challenge uses a parseable arithmetic prompt");
  const a=Number(match[1]),b=Number(match[3]),answer=match[2]==="+"?a+b:a-b;
  await assert.rejects(verifyHumanChallenge(challenge.id,String(answer+97)),error=>error.code==="CHALLENGE_INCORRECT");
  const verified=await verifyHumanChallenge(challenge.id,String(answer));
  assert.equal(typeof verified.token,"string");
  await withTransaction(db=>consumeHumanChallenge(db,verified.token));
  await assert.rejects(withTransaction(db=>consumeHumanChallenge(db,verified.token)),error=>error.code==="CHALLENGE_INVALID");
});

test("persistent rate limits are shared by independent request objects",async()=>{
  const action="security-test-"+suffix;
  const requestA={headers:{},socket:{remoteAddress:"198.51.100.23"}};
  const requestB={headers:{},socket:{remoteAddress:"198.51.100.23"}};
  await enforcePersistentRateLimit(requestA,action,2,60000);
  await enforcePersistentRateLimit(requestB,action,2,60000);
  await assert.rejects(enforcePersistentRateLimit(requestA,action,2,60000),error=>error.code==="RATE_LIMITED"&&error.statusCode===429);
});

test("WebAuthn assertion with a mismatched challenge is rejected",async()=>{
  const email="security-webauthn-"+suffix+"@example.test";
  const registered=await membership.register({email,password:"Security-webauthn-password-12345",firstName:"Security",lastName:"WebAuthn"+suffix,phone:"09"+randomUUID().replace(/\D/g,"").slice(0,8)},"security-webauthn-register");
  const userId=registered.user.id;createdUsers.push(userId);
  const db=getPool();
  await db.query("insert into app_user_role(user_id,role_id) select $1,id from app_role where role_code='system_admin' on conflict do nothing",[userId]);
  await db.query("update app_user set admin_passkey_enforced_at=now() where id=$1",[userId]);
  const credentialId=Buffer.from("credential-"+suffix).toString("base64url");
  await db.query("insert into admin_passkey_credential(user_id,credential_id,public_key_jwk) values($1,$2,$3)",[userId,credentialId,{kty:"EC",crv:"P-256",x:Buffer.alloc(32,1).toString("base64url"),y:Buffer.alloc(32,2).toString("base64url"),ext:true}]);
  await beginAdminPasskeyAuthentication(email);
  const clientData=Buffer.from(JSON.stringify({type:"webauthn.get",challenge:"deliberately-wrong-challenge",origin:"http://localhost:3001"})).toString("base64url");
  const authData=Buffer.alloc(37);createHash("sha256").update("localhost").digest().copy(authData,0);authData[32]=5;
  const response={id:credentialId,rawId:credentialId,response:{clientDataJSON:clientData,authenticatorData:authData.toString("base64url"),signature:Buffer.from([1,2,3]).toString("base64url")}};
  await assert.rejects(finishAdminPasskeyAuthentication(email,response,{},"security-webauthn-wrong-challenge"),error=>error.statusCode===401&&error.code==="UNAUTHENTICATED");
});

test("email verification is one-time and blocks unverified login",async()=>{
  const email="security-email-"+suffix+"@example.test";
  const registered=await membership.register({email,password:"Security-email-password-12345",firstName:"Security",lastName:"Email"+suffix,phone:"09"+randomUUID().replace(/\D/g,"").slice(0,8)},"security-email-register");
  const userId=registered.user.id;createdUsers.push(userId);
  const db=getPool();
  assert.match(registered.registrationReference,/^MPA-MEM-\d{2}-\d{6,}$/);
  await db.query("update app_user set email_verified_at=null where id=$1",[userId]);
  const verification=await withTransaction(tx=>createEmailVerification(tx,userId,email,registered.registrationReference));
  const previous=process.env.EMAIL_VERIFICATION_REQUIRED;
  process.env.EMAIL_VERIFICATION_REQUIRED="true";
  try {
    await assert.rejects(membership.login(email,"Security-email-password-12345","security-email-login"),error=>error.code==="EMAIL_NOT_VERIFIED");
  } finally {
    if(previous===undefined)delete process.env.EMAIL_VERIFICATION_REQUIRED;else process.env.EMAIL_VERIFICATION_REQUIRED=previous;
  }
  assert.deepEqual(await verifyEmailToken(verification.token,"security-email-verify"),{verified:true});
  await assert.rejects(verifyEmailToken(verification.token,"security-email-replay"),error=>error.code==="EMAIL_VERIFICATION_INVALID");
  const login=await membership.login(email,"Security-email-password-12345","security-email-login-after-verify");
  assert.equal(typeof login.token,"string");
});

test("administrator recovery codes are single-use and create a restricted recovery session",async()=>{
  const email="security-admin-"+suffix+"@example.test";
  const registered=await membership.register({email,password:"Security-test-password-12345",firstName:"Security",lastName:"Admin"+suffix,phone:"09"+String(Date.now()).slice(-8)},"security-auth-test-register");
  const userId=registered.user.id;createdUsers.push(userId);
  const db=getPool();
  await db.query("insert into app_user_role(user_id,role_id) select $1,id from app_role where role_code='system_admin' on conflict do nothing",[userId]);
  await db.query("update app_user set admin_passkey_enforced_at=now() where id=$1",[userId]);
  const code="RECOVERY-"+suffix.toUpperCase();
  await db.query("insert into admin_passkey_recovery_code(user_id,code_hash) values($1,$2)",[userId,hashSecurityToken(code)]);
  const recovered=await recoverAdminPasskey(email,code,{ip:"198.51.100.24",userAgent:"security-test"},"security-auth-test-recovery");
  assert.equal(typeof recovered.token,"string");
  const session=(await db.query("select auth_method from auth_session where token_hash=$1",[hashSessionToken(recovered.token)])).rows[0];
  assert.equal(session.auth_method,"recovery");
  await assert.rejects(recoverAdminPasskey(email,code,{ip:"198.51.100.24"},"security-auth-test-replay"),error=>error.code==="RECOVERY_INVALID");
});

test.after(async()=>{
  const db=getPool();
  for(const userId of createdUsers){await db.query("delete from audit_log where actor_user_id=$1",[userId]);await db.query("delete from app_user where id=$1",[userId]);}
  await closePool();
});

import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { getPool, closePool, withTransaction } from "../../src/platform/db.js";
import * as membership from "../../src/membership/service.js";
import { verifyToken } from "../../src/platform/auth.js";
import { loadConfig } from "../../src/platform/config.js";
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
  await db.query("update app_user set email_verified_at=now(),admin_passkey_enforced_at=now() where id=$1",[userId]);
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
  const persistedReference=(await db.query("select registration_reference from app_user where id=$1",[userId])).rows[0]?.registration_reference;
  assert.equal(persistedReference,registered.registrationReference,"the human-readable reference must persist on the account");
  await db.query("update app_user set email_verified_at=null where id=$1",[userId]);
  const verification=await withTransaction(tx=>createEmailVerification(tx,userId,email,registered.registrationReference));
  const previous=process.env.EMAIL_VERIFICATION_REQUIRED;
  process.env.EMAIL_VERIFICATION_REQUIRED="false";
  try {
    await assert.rejects(membership.login(email,"Security-email-password-12345","security-email-login"),error=>error.code==="EMAIL_VERIFICATION_REQUIRED");
  } finally {
    if(previous===undefined)delete process.env.EMAIL_VERIFICATION_REQUIRED;else process.env.EMAIL_VERIFICATION_REQUIRED=previous;
  }
  assert.deepEqual(await verifyEmailToken(verification.token,"security-email-verify"),{verified:true,registrationReference:registered.registrationReference});
  await assert.rejects(verifyEmailToken(verification.token,"security-email-replay"),error=>error.code==="EMAIL_VERIFICATION_INVALID");
  const previousJwtSecret=process.env.JWT_SECRET;
  process.env.JWT_SECRET=previousJwtSecret||"security-email-test-secret-with-more-than-32-characters";
  try{
    const login=await membership.login(email,"Security-email-password-12345","security-email-login-after-verify");
    assert.equal(typeof login.token,"string");
  }finally{if(previousJwtSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousJwtSecret;}
});

test("administrator recovery codes are single-use and create a restricted recovery session",async()=>{
  const email="security-admin-"+suffix+"@example.test";
  const registered=await membership.register({email,password:"Security-test-password-12345",firstName:"Security",lastName:"Admin"+suffix,phone:"09"+String(Date.now()).slice(-8)},"security-auth-test-register");
  const userId=registered.user.id;createdUsers.push(userId);
  const db=getPool();
  await db.query("insert into app_user_role(user_id,role_id) select $1,id from app_role where role_code='system_admin' on conflict do nothing",[userId]);
  await db.query("update app_user set email_verified_at=now(),admin_passkey_enforced_at=now() where id=$1",[userId]);
  const code="RECOVERY-"+suffix.toUpperCase();
  await db.query("insert into admin_passkey_recovery_code(user_id,code_hash) values($1,$2)",[userId,hashSecurityToken(code)]);
  const previousJwtSecret=process.env.JWT_SECRET;
  process.env.JWT_SECRET=previousJwtSecret||"security-recovery-test-secret-with-more-than-32-characters";
  try{
    const recovered=await recoverAdminPasskey(email,code,{ip:"198.51.100.24",userAgent:"security-test"},"security-auth-test-recovery");
    assert.equal(typeof recovered.token,"string");
    const recoveredIdentity=verifyToken(recovered.token,loadConfig().jwtSecret);
    const session=(await db.query("select auth_method from auth_session where id=$1 and user_id=$2",[recoveredIdentity.sid,userId])).rows[0];
    assert.equal(session.auth_method,"recovery");
    await assert.rejects(recoverAdminPasskey(email,code,{ip:"198.51.100.24"},"security-auth-test-replay"),error=>error.code==="RECOVERY_INVALID");
  }finally{if(previousJwtSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previousJwtSecret;}
});


test("expired human challenges cannot mint tokens",async()=>{
  const challenge=await issueHumanChallenge();
  await getPool().query("update security_human_challenge set expires_at=now()-interval '1 second' where id=$1",[challenge.id]);
  await assert.rejects(verifyHumanChallenge(challenge.id,"0"),error=>error.code==="CHALLENGE_INVALID");
});

test("production registration rejects a missing human-check token before creating an account",async()=>{
  const keys=["NODE_ENV","JWT_SECRET","HUMAN_CHALLENGE_REQUIRED"];
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  process.env.NODE_ENV="production";
  process.env.JWT_SECRET="security-test-production-secret-with-more-than-32-characters";
  process.env.HUMAN_CHALLENGE_REQUIRED="false";
  const email="security-bypass-"+suffix+"@example.test";
  try {
    await assert.rejects(membership.register({email,password:"Security-bypass-password-12345",firstName:"Security",lastName:"Bypass"+suffix,phone:"09"+randomUUID().replace(/\D/g,"").slice(0,8)},"security-no-human-token"),error=>error.code==="CHALLENGE_REQUIRED");
    assert.equal((await getPool().query("select id from app_user where lower(email)=lower($1)",[email])).rows.length,0,"registration must not persist before challenge consumption");
  } finally {
    for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
  }
});

test("non-administrators cannot enroll administrator passkeys",async()=>{
  const email="security-nonadmin-"+suffix+"@example.test";
  const registered=await membership.register({email,password:"Security-nonadmin-password-12345",firstName:"Security",lastName:"Nonadmin"+suffix,phone:"09"+randomUUID().replace(/\D/g,"").slice(0,8)},"security-nonadmin-register");
  createdUsers.push(registered.user.id);
  const {beginAdminPasskeyRegistration}=await import("../../src/platform/webauthn.js");
  await assert.rejects(beginAdminPasskeyRegistration({sub:registered.user.id,sid:"not-a-session"}),error=>error.statusCode===403&&error.code==="FORBIDDEN");
});

test("revoked administrator passkeys cannot be used for authentication",async()=>{
  const email="security-revoked-"+suffix+"@example.test";
  const registered=await membership.register({email,password:"Security-revoked-password-12345",firstName:"Security",lastName:"Revoked"+suffix,phone:"09"+randomUUID().replace(/\D/g,"").slice(0,8)},"security-revoked-register");
  const userId=registered.user.id;createdUsers.push(userId);
  const db=getPool();
  await db.query("insert into app_user_role(user_id,role_id) select $1,id from app_role where role_code='system_admin' on conflict do nothing",[userId]);
  await db.query("update app_user set admin_passkey_enforced_at=now() where id=$1",[userId]);
  await db.query("insert into admin_passkey_credential(user_id,credential_id,public_key_jwk,revoked_at) values($1,$2,$3,now())",[userId,Buffer.from("revoked-"+suffix).toString("base64url"),{kty:"EC",crv:"P-256",x:Buffer.alloc(32,3).toString("base64url"),y:Buffer.alloc(32,4).toString("base64url")}]);
  await assert.rejects(beginAdminPasskeyAuthentication(email),error=>error.code==="PASSKEY_NOT_AVAILABLE");
});


test("persistent identity limits cannot be bypassed by changing source IP",async()=>{
  const action="security-identity-test-"+suffix;
  const requestA={headers:{},socket:{remoteAddress:"198.51.100.31"}};
  const requestB={headers:{},socket:{remoteAddress:"198.51.100.32"}};
  await enforcePersistentRateLimit(requestA,action,1,60000,"target-"+suffix+"@example.test");
  await assert.rejects(enforcePersistentRateLimit(requestB,action,1,60000,"TARGET-"+suffix+"@EXAMPLE.TEST"),error=>error.code==="RATE_LIMITED"&&error.statusCode===429);
});

test("human subtraction challenges remain answerable on numeric-only keyboards",async()=>{
  for(let i=0;i<12;i++){
    const challenge=await issueHumanChallenge();
    const match=challenge.question.match(/(\d+)\s*([+−])\s*(\d+)/);
    assert.ok(match);
    if(match[2]==="−")assert.ok(Number(match[1])>=Number(match[3]),"subtraction prompts must not require a negative sign");
  }
});

test("organization registration creates an organization-only account without a professional profile",async()=>{
  const email="security-org-"+suffix+"@example.test";
  const phone="08"+randomUUID().replace(/\D/g,"").slice(0,8);
  const registered=await membership.register({accountType:"organization",email,password:"Security-org-password-12345",passwordConfirmation:"Security-org-password-12345",firstName:"Organization",middleName:"Representative",lastName:"Test"+suffix,displayName:"Organization Representative Test "+suffix,phone},"security-org-register");
  const userId=registered.user.id;createdUsers.push(userId);
  assert.equal(registered.accountType,"organization_representative");
  assert.deepEqual(registered.roles,["organization_representative"]);
  const db=getPool();
  const stored=(await db.query("select account_type from app_user where id=$1",[userId])).rows[0];
  assert.equal(stored.account_type,"organization_representative");
  const profileCount=(await db.query("select count(*)::int count from professional_profile pr join person p on p.id=pr.person_id where p.user_id=$1",[userId])).rows[0].count;
  assert.equal(profileCount,0,"organization-only registration must not create a professional profile");
  const me=await membership.getMe(userId);
  assert.equal(me.account_type,"organization_representative");
  assert.equal(me.profile_id,null,"professional fields must be redacted for organization-only accounts");
  assert.equal(me.headline,null);
  assert.ok(!me.roles.includes("member"));
  await assert.rejects(membership.updateProfile(userId,{},"security-org-profile-denied"),error=>error.code==="PROFESSIONAL_PROFILE_FORBIDDEN");
});

test.after(async()=>{
  const db=getPool();
  for(const userId of createdUsers){await db.query("delete from app_user_role where user_id=$1",[userId]);await db.query("update app_user set status='suspended',admin_passkey_enforced_at=null where id=$1",[userId]);}
  await closePool();
});

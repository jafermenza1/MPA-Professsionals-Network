import {test,expect,request as playwrightRequest} from "@playwright/test";
import {randomUUID} from "node:crypto";
import {getPool,closePool} from "../src/platform/db.js";
import * as membership from "../src/membership/service.js";
import {hashSecurityToken} from "../src/platform/security-controls.js";
import {recoverAdminPasskey} from "../src/platform/webauthn.js";

const API_BASE=process.env.API_BASE_URL||"http://127.0.0.1:3000";
const suffix=randomUUID().replace(/-/g,"").slice(0,12);
const createdUsers=[];
async function createActor(roleCode){
 const actorSuffix=randomUUID().replace(/-/g,"").slice(0,8);
 const email="security-e2e-"+roleCode+"-"+suffix+"-"+actorSuffix+"@example.test";
 const registered=await membership.register({email,password:"Security-e2e-password-12345",firstName:"Security",lastName:roleCode+actorSuffix,phone:"09"+String(Math.floor(Math.random()*100000000)).padStart(8,"0")},"security-e2e-register");
 createdUsers.push(registered.user.id);
 await getPool().query("insert into app_user_role(user_id,role_id) select $1,id from app_role where role_code=$2 on conflict do nothing",[registered.user.id,roleCode]);
 return {email,userId:registered.user.id,token:registered.token};
}

test("non-admins cannot enroll passkeys and malformed WebAuthn responses are rejected",async()=>{
 const api=await playwrightRequest.newContext({baseURL:API_BASE});
 const member=await createActor("member");
 const admin=await createActor("system_admin");
 try{
  const denied=await api.post("/api/v1/admin/passkeys/registration/options",{headers:{authorization:"Bearer "+member.token}});
  expect(denied.status()).toBe(403);
  const malformed=await api.post("/api/v1/admin/passkeys/registration/verify",{headers:{authorization:"Bearer "+admin.token},data:{id:"not-a-credential",rawId:"not-a-credential",response:{}}});
  expect(malformed.status()).toBe(400);
 }finally{await api.dispose();}
});

test("revoked credentials are excluded from passkey login",async()=>{
 const api=await playwrightRequest.newContext({baseURL:API_BASE});
 const admin=await createActor("system_admin");
 const db=getPool();
 try{
  await db.query("update app_user set admin_passkey_enforced_at=now() where id=$1",[admin.userId]);
  await db.query("insert into admin_passkey_credential(user_id,credential_id,public_key_jwk,revoked_at) values($1,$2,$3,now())",[admin.userId,"revoked-"+suffix,{kty:"EC",crv:"P-256",x:"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",y:"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}]);
  const result=await api.post("/api/v1/auth/passkeys/options",{data:{email:admin.email}});
  expect(result.status()).toBe(401);
  const payload=await result.json();
  expect(payload.error?.code||payload.data?.error?.code).toBeTruthy();
 }finally{await api.dispose();}
});

test("password sessions cannot bypass passkey enforcement; recovery sessions stay restricted and codes are one-time",async()=>{
 const api=await playwrightRequest.newContext({baseURL:API_BASE});
 const admin=await createActor("system_admin");
 const db=getPool();
 const code="RECOVERY-"+suffix.toUpperCase();
 try{
  await db.query("update app_user set admin_passkey_enforced_at=now() where id=$1",[admin.userId]);
  await db.query("insert into admin_passkey_recovery_code(user_id,code_hash) values($1,$2)",[admin.userId,hashSecurityToken(code)]);
  const passwordBypass=await api.get("/api/v1/me",{headers:{authorization:"Bearer "+admin.token}});
  expect(passwordBypass.status()).toBe(401);
  const recovery=await api.post("/api/v1/auth/passkeys/recovery",{data:{email:admin.email,code}});
  expect(recovery.status()).toBe(200);
  const recoveryToken=(await recovery.json()).data.token;
  const restricted=await api.get("/api/v1/me",{headers:{authorization:"Bearer "+recoveryToken}});
  expect(restricted.status()).toBe(401);
  const replay=await api.post("/api/v1/auth/passkeys/recovery",{data:{email:admin.email,code}});
  expect(replay.status()).toBe(401);
 }finally{await api.dispose();}
});

test("administrator passkey enrollment, authentication, revocation and recovery work end to end",async({browser})=>{
 const admin=await createActor("system_admin");
 const context=await browser.newContext({baseURL:"http://localhost:3001"});
 const page=await context.newPage();
 const cdp=await context.newCDPSession(page);
 await cdp.send("WebAuthn.enable");
 await cdp.send("WebAuthn.addVirtualAuthenticator",{options:{protocol:"ctap2",transport:"internal",hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
 try{
  await page.goto("/login");
  await page.getByLabel("Email").fill(admin.email);
  await page.getByLabel("Password").fill("Security-e2e-password-12345");
  await page.getByRole("button",{name:/Login with password/}).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/admin/security");
  await page.getByRole("button",{name:"Add passkey"}).click();
  await expect(page.getByRole("heading",{name:"Save your recovery codes now"})).toBeVisible({timeout:15000});
  await page.goto("/login");
  await page.getByLabel("Email").fill(admin.email);
  await page.getByRole("button",{name:"Sign in with administrator passkey"}).click();
  await expect(page).toHaveURL(/\/dashboard$/,{timeout:15000});
  expect(assertionPayload).toBeTruthy();
  const replayApi=await playwrightRequest.newContext({baseURL:API_BASE});
  try{const replayedAssertion=await replayApi.post("/api/v1/auth/passkeys/verify",{data:assertionPayload});expect(replayedAssertion.status()).toBe(401);}finally{await replayApi.dispose();}
  await page.goto("/admin/security");
  await page.getByRole("button",{name:"Add passkey"}).click();
  await expect(page.getByRole("heading",{name:"Save your recovery codes now"})).toBeVisible({timeout:15000});
  const recoveryCodes=await page.locator("code").allTextContents();
  const recoveryCode=recoveryCodes[0],uiRecoveryCode=recoveryCodes[1];
  expect(recoveryCode).toMatch(/^[A-F0-9]{16}$/);
  expect(uiRecoveryCode).toMatch(/^[A-F0-9]{16}$/);
  const db=getPool();
  const activeCredentials=(await db.query("select id from admin_passkey_credential where user_id=$1 and revoked_at is null order by created_at desc",[admin.userId])).rows;
  expect(activeCredentials.length).toBe(2);
  const adminSessionToken=await page.evaluate(()=>window.sessionStorage.getItem("mpa-session-token"));
  const revokeApi=await playwrightRequest.newContext({baseURL:API_BASE});
  try{
   const revoked=await revokeApi.delete("/api/v1/admin/passkeys/"+activeCredentials[0].id,{headers:{authorization:"Bearer "+adminSessionToken}});
   expect(revoked.status()).toBe(200);
   const lastPasskey=await revokeApi.delete("/api/v1/admin/passkeys/"+activeCredentials[1].id,{headers:{authorization:"Bearer "+adminSessionToken}});
   expect(lastPasskey.status()).toBe(409);
  }finally{await revokeApi.dispose();}
  await db.query("update admin_passkey_credential set revoked_at=now() where user_id=$1 and revoked_at is null",[admin.userId]);
  const recovery=await recoverAdminPasskey(admin.email,recoveryCode,{ip:"198.51.100.40",userAgent:"playwright-security"},"security-e2e-recovery");
  const api=await playwrightRequest.newContext({baseURL:API_BASE});
  try{
   const bypass=await api.get("/api/v1/me",{headers:{authorization:"Bearer "+recovery.token}});
   expect(bypass.status()).toBe(401);
  }finally{await api.dispose();}
  await page.goto("/login");
  await page.getByLabel("Email").fill(admin.email);
  await page.getByRole("button",{name:"Use a passkey recovery code"}).click();
  await page.getByLabel("One-time recovery code").fill(uiRecoveryCode);
  await page.getByRole("button",{name:"Recover passkey access"}).click();
  await expect(page).toHaveURL(/\/admin\/security\?recovery=1$/,{timeout:15000});
  await page.getByRole("button",{name:"Register replacement passkey"}).click();
  await expect(page.getByRole("heading",{name:"Save your recovery codes now"})).toBeVisible({timeout:15000});
  await page.goto("/login");
  await page.getByLabel("Email").fill(admin.email);
  await page.getByRole("button",{name:"Sign in with administrator passkey"}).click();
  await expect(page).toHaveURL(/\/dashboard$/,{timeout:15000});
  const replay=await apiRecoveryReplay(admin.email,recoveryCode);
  expect(replay).toBe(false);
 }finally{
  await cdp.send("WebAuthn.disable").catch(()=>{});
  await context.close();
 }
});
async function apiRecoveryReplay(email,code){
 const api=await playwrightRequest.newContext({baseURL:API_BASE});
 try{const response=await api.post("/api/v1/auth/passkeys/recovery",{data:{email,code}});return response.status()===200;}
 finally{await api.dispose();}
}

test.afterAll(async()=>{
 const db=getPool();
 for(const userId of createdUsers){await db.query("delete from audit_log where actor_user_id=$1",[userId]);await db.query("delete from app_user where id=$1",[userId]);}
 await closePool();
});

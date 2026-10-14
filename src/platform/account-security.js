import crypto from "node:crypto";
import {getPool,withTransaction} from "./db.js";
import {hashPassword,verifyPassword,validatePassword} from "../membership/identity.js";
import {newSessionToken,hashSessionToken,sessionTokenPayload,signToken} from "./auth.js";
import {loadConfig} from "./config.js";
function err(status,message,code="BUSINESS_RULE"){const e=new Error(message);e.statusCode=status;e.code=code;return e}
const PRIVILEGED=new Set(["system_admin","super_admin","admin","reviewer","verification_reviewer","ethics_reviewer","appeal_reviewer","finance_officer"]);
async function roles(db,id){return (await db.query("select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",[id])).rows.map(x=>x.role_code)}
function requireUserAdmin(actor){const actorRoles=Array.isArray(actor?.roles)?actor.roles:[],permissions=Array.isArray(actor?.permissions)?actor.permissions:[];if(!actorRoles.some(x=>["system_admin","admin"].includes(x))&&!permissions.includes("users.manage"))throw err(403,"You do not have permission to help manage accounts.","FORBIDDEN");return actorRoles}
export async function updateOwnCredentials(identity,input,requestId){
 const userId=identity?.sub,sessionId=identity?.sid,usernameInput=input?.username===undefined?undefined:String(input.username).trim().toLowerCase(),newPassword=input?.newPassword===undefined?"":String(input.newPassword),currentPassword=String(input?.currentPassword||"");
 if(!userId||!sessionId)throw err(401,"Please sign in again before changing your account details.","UNAUTHENTICATED");
 if(usernameInput===undefined&&!newPassword)throw err(400,"Choose a username or enter a new password to make a change.","NO_ACCOUNT_CHANGES");
 if(newPassword)validatePassword(newPassword);
 const recovery=identity.credential_setup_required===true;
 if(!recovery&&!currentPassword)throw err(400,"Enter your current password to confirm these account changes.","CURRENT_PASSWORD_REQUIRED");
 if(recovery&&!newPassword)throw err(400,"For your security, set a new password before finishing this sign-in recovery.","PASSWORD_RESET_REQUIRED");
 return withTransaction(async tx=>{
  const user=(await tx.query("select id,username,password_hash,status from app_user where id=$1 for update",[userId])).rows[0];
  if(!user||user.status!=="active")throw err(401,"This account cannot be changed right now. Please contact support if you need help.","ACCOUNT_UNAVAILABLE");
  if(usernameInput!==undefined&&usernameInput!==user.username){await tx.query("select pg_advisory_xact_lock(hashtext($1))",["account_username:"+usernameInput]);if(!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(usernameInput))throw err(400,"Choose a username with 3–40 letters, numbers, dots, underscores or hyphens. It must start with a letter or number.","USERNAME_INVALID");}
  if(!recovery&&!verifyPassword(currentPassword,user.password_hash))throw err(400,"That current password does not match. Please try again.","CURRENT_PASSWORD_INCORRECT");
  if(usernameInput!==undefined&&usernameInput!==user.username){const duplicate=await tx.query("select id from app_user where lower(username)=lower($1) and id<>$2 limit 1",[usernameInput,userId]);if(duplicate.rowCount)throw err(409,"That username is already in use. Try another one.","USERNAME_TAKEN")}
  const nextUsername=usernameInput===undefined?user.username:usernameInput;
  if(usernameInput!==undefined&&usernameInput!==user.username)await tx.query("update app_user set username=$1,updated_at=now() where id=$2",[nextUsername,userId]);
  let revokedOtherSessions=0;
  if(newPassword){await tx.query("update app_user set password_hash=$1,updated_at=now() where id=$2",[hashPassword(newPassword),userId]);const r=await tx.query("update auth_session set revoked_at=now() where user_id=$1 and id<>$2 and revoked_at is null",[userId,sessionId]);revokedOtherSessions=r.rowCount;await tx.query("update auth_session set credential_setup_required=false where id=$1 and user_id=$2",[sessionId,userId])}
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'account.credentials.updated','app_user',$2,$3,'success',$4)",[userId,userId,requestId,JSON.stringify({usernameChanged:usernameInput!==undefined&&usernameInput!==user.username,passwordChanged:Boolean(newPassword),recoverySession:recovery,otherSessionsRevoked:revokedOtherSessions})]);
  return {username:nextUsername,passwordChanged:Boolean(newPassword),otherSessionsRevoked:revokedOtherSessions,credentialSetupRequired:false};
 });
}
export async function createOneTimeSessionLink(actor,userId,requestId,reasonInput,origin){
 const actorId=actor?.sub,actorRoles=requireUserAdmin(actor),reason=String(reasonInput||"").trim().slice(0,500);
 if(!reason)throw err(400,"Add a short reason so the account recovery is recorded properly.","AUDIT_REASON_REQUIRED");
 if(!origin||!/^https?:\/\/[^/]+$/i.test(origin))throw err(400,"The secure sign-in link could not be prepared for this website. Please contact the platform administrator.","PUBLIC_ORIGIN_REQUIRED");
 if(userId===actorId)throw err(400,"For your own account, use Account & Security or ask another authorized administrator to help.","SELF_RECOVERY_LINK");
 const raw=crypto.randomBytes(32).toString("base64url"),tokenHash=crypto.createHash("sha256").update(raw).digest("hex"),url=origin+"/account/one-time-access?token="+encodeURIComponent(raw);
 return withTransaction(async tx=>{
  const target=(await tx.query("select id,email,status from app_user where id=$1 for update",[userId])).rows[0];
  if(!target)throw err(404,"That account could not be found.","NOT_FOUND");
  if(target.status!=="active")throw err(409,"This account is not active. Review its account status before sending a sign-in link.","ACCOUNT_NOT_ACTIVE");
  if(!target.email)throw err(409,"This account has no email address for a secure sign-in link. Update its contact details first.","ACCOUNT_EMAIL_MISSING");
  const targetRoles=await roles(tx,userId);if(targetRoles.some(role=>PRIVILEGED.has(role))&&!actorRoles.includes("system_admin"))throw err(403,"Only a system administrator may send a sign-in link for a privileged account.","PRIVILEGED_ACCOUNT_CHANGE");
  await tx.query("update one_time_session_link set revoked_at=now() where user_id=$1 and used_at is null and revoked_at is null",[userId]);
  await tx.query("insert into one_time_session_link(user_id,token_hash,created_by,expires_at) values($1,$2,$3,now()+interval '20 minutes')",[userId,tokenHash,actorId]);
  await tx.query("insert into notification_outbox(channel,recipient,template_code,payload) values('email',$1,'account.one_time_session_link',$2)",[target.email,JSON.stringify({url,expiresMinutes:20,actionText:"Sign in securely and set a new password",requestedBy:"MPA Support"})]);
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'admin.account.one_time_link.sent','app_user',$2,$3,'success',$4)",[actorId,userId,requestId,JSON.stringify({reason,expiresMinutes:20,deliveryQueued:true})]);
  return {queued:true,email:target.email,expiresInMinutes:20,message:"The sign-in email has been queued. The link can be used once and expires in 20 minutes; actual delivery depends on the email service."};
 });
}
export async function redeemOneTimeSessionLink(rawToken,requestId,requestMeta={}){
 const token=String(rawToken||"");if(token.length<32||token.length>256)throw err(400,"This sign-in link is missing or invalid. Ask the MPA team to send a fresh link.","ONE_TIME_LINK_INVALID");const tokenHash=crypto.createHash("sha256").update(token).digest("hex");
 return withTransaction(async tx=>{
  const link=(await tx.query("select l.id link_id,l.user_id,l.expires_at,l.used_at,l.revoked_at,u.email,u.username,u.status from one_time_session_link l join app_user u on u.id=l.user_id where l.token_hash=$1 for update of l,u",[tokenHash])).rows[0];
  if(!link||link.used_at||link.revoked_at||new Date(link.expires_at).getTime()<=Date.now())throw err(410,"This sign-in link has expired or has already been used. Ask the MPA team to send a new one.","ONE_TIME_LINK_EXPIRED");
  if(link.status!=="active")throw err(403,"This account is not active, so the link cannot sign you in. Contact MPA support for help.","ACCOUNT_NOT_ACTIVE");
  await tx.query("update one_time_session_link set used_at=now() where id=$1",[link.link_id]);await tx.query("update auth_session set revoked_at=now() where user_id=$1 and revoked_at is null",[link.user_id]);
  const roleRows=await tx.query("select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",[link.user_id]),userRoles=roleRows.rows.map(row=>row.role_code),rawSession=newSessionToken();
  const session=(await tx.query("insert into auth_session(user_id,token_hash,expires_at,ip_address,user_agent,credential_setup_required) values($1,$2,now()+make_interval(days=>$3),$4,$5,true) returning id",[link.user_id,hashSessionToken(rawSession),Number(loadConfig().authSessionDays||7),requestMeta.ip||null,requestMeta.userAgent||null])).rows[0];
  const tokenOut=signToken(sessionTokenPayload({id:link.user_id,email:link.email},userRoles,session.id),loadConfig().jwtSecret);
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'account.one_time_link.redeemed','app_user',$1,$2,'success',$3)",[link.user_id,requestId,JSON.stringify({credentialSetupRequired:true})]);return {token:tokenOut,credentialSetupRequired:true,username:link.username};
 });
}

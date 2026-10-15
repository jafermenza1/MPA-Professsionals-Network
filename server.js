import http from "node:http";
import { authorizePrivateUpload, receivePrivateUpload, confirmPrivateUpload, readAuthorizedPrivateFile, MAX_PRIVATE_UPLOAD_BYTES } from "./src/platform/private-file-storage.js";
import { randomUUID } from "node:crypto";
import { loadConfig } from "./src/platform/config.js";
import { createLogger } from "./src/platform/logger.js";
import { verifyToken, requireRole, hashSessionToken, withCurrentRoles } from "./src/platform/auth.js";
import { getPool } from "./src/platform/db.js";
import * as membership from "./src/membership/service.js";
import * as membershipCard from "./src/membership/card.js";
import * as membershipAdminBulk from "./src/membership/admin-bulk.js";
import * as reports from "./src/platform/reports.js";
import * as verification from "./src/verification/service.js";
import * as talent from "./src/talent/service.js";
import * as organizationJobs from "./src/organization-jobs/service.js";
import * as servicesMentorship from "./src/services-mentorship/service.js";
import * as marketplaceDemand from "./src/services-mentorship/demand.js";
import * as organizationMentorshipOffers from "./src/services-mentorship/organization-offers.js";
import * as stakeholderOutcomes from "./src/platform/stakeholder-outcomes.js";
import * as experience from "./src/platform/experience.js";
import * as applicationTracking from "./src/platform/application-tracking.js";
import * as publicOpportunity from "./src/platform/public-opportunity.js";
import * as userAdmin from "./src/platform/user-admin.js";
import * as emailOperations from "./src/platform/email-operations.js";
import * as notifications from "./src/platform/notifications.js";
import { verifyEmailToken, resendEmailVerification } from "./src/platform/email-verification.js";
import { enforcePersistentRateLimit, issueHumanChallenge, verifyHumanChallenge } from "./src/platform/security-controls.js";
import { beginAdminPasskeyRegistration, finishAdminPasskeyRegistration, beginAdminPasskeyAuthentication, finishAdminPasskeyAuthentication, recoverAdminPasskey, listAdminPasskeys, revokeAdminPasskey } from "./src/platform/webauthn.js";
import * as accountSecurity from "./src/platform/account-security.js";
import * as referencePortfolio from "./src/platform/reference-portfolio.js";
import * as supportBot from "./src/platform/support-bot.js";
import { resolveAllowedOrigin } from "./src/platform/config.js";

const config=loadConfig();
const logger=createLogger({level:config.logLevel});

function json(res,status,body,requestId){
  res.writeHead(status,{"content-type":"application/json; charset=utf-8","x-request-id":requestId,"cache-control":"no-store"});
  res.end(JSON.stringify(body));
}
function pathParts(url){ return new URL(url,"http://localhost").pathname.split("/").filter(Boolean); }
function query(url){ return new URL(url,"http://localhost").searchParams; }
async function rawBody(req,limit=MAX_PRIVATE_UPLOAD_BYTES){
  const chunks=[];let size=0;
  for await (const chunk of req) { size+=chunk.length; if(size>limit) throw Object.assign(new Error("Uploaded file is too large."),{statusCode:413,code:"PAYLOAD_TOO_LARGE"}); chunks.push(chunk); }
  return Buffer.concat(chunks,size);
}
async function body(req,limit=1024*1024){
  let raw="";
  for await (const chunk of req) {
    raw+=chunk;
    if(Buffer.byteLength(raw)>limit) throw Object.assign(new Error("Request body too large."),{statusCode:413,code:"PAYLOAD_TOO_LARGE"});
  }
  if(!raw) return {};
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error("Request body must be valid JSON."),{statusCode:400,code:"INVALID_JSON"}); }
}
function clientIp(req){ return String(req.headers["x-forwarded-for"]||req.socket.remoteAddress||"").split(",")[0].trim() || null; }
async function auth(req){
  if(!config.jwtSecret) throw Object.assign(new Error("Authentication secret is not configured."),{statusCode:503,code:"AUTH_NOT_CONFIGURED"});
  const header=req.headers.authorization||"";
  if(!header.startsWith("Bearer ")) throw Object.assign(new Error("Bearer authentication required."),{statusCode:401,code:"UNAUTHENTICATED"});
  try {
    const identity=verifyToken(header.slice(7),config.jwtSecret);
    if(!identity.sid) throw Object.assign(new Error("Session-bound authentication required."),{statusCode:401});
    const db=getPool();
    const r=await db.query(`select s.user_id,u.status,u.email_verified_at,s.credential_setup_required,
      coalesce(json_agg(distinct role.role_code) filter(where role.role_code is not null),'[]'::json) as roles
      from auth_session s join app_user u on u.id=s.user_id
      left join app_user_role ur on ur.user_id=u.id left join app_role role on role.id=ur.role_id
      where s.id=$1 and s.revoked_at is null and s.expires_at>now()
      group by s.id,u.id,u.status`,[identity.sid]);
    if(!r.rows[0]||r.rows[0].status!=="active"||r.rows[0].user_id!==identity.sub) throw Object.assign(new Error("Session expired or revoked."),{statusCode:401});
    if(String(process.env.EMAIL_VERIFICATION_REQUIRED||"false").toLowerCase()==="true"&&!r.rows[0].email_verified_at) throw Object.assign(new Error("Verify your email before continuing."),{statusCode:403,code:"EMAIL_VERIFICATION_REQUIRED"});
    // Authorization must use current database roles, never stale role claims from a signed token.
    identity.roles=withCurrentRoles(identity,Array.isArray(r.rows[0].roles)?r.rows[0].roles:JSON.parse(r.rows[0].roles||"[]")).roles;
    identity.permissions=(await db.query("select permission_code from app_user_permission where user_id=$1",[identity.sub])).rows.map(row=>row.permission_code);
    identity.credential_setup_required=Boolean(r.rows[0].credential_setup_required);
    if(identity.credential_setup_required){
      const path=new URL(req.url,"http://localhost").pathname.replace(/^\/+/, "");
      const allowedRecoveryRoute=(req.method==="GET"&&path==="api/v1/me")||(req.method==="PATCH"&&path==="api/v1/me/account")||(req.method==="POST"&&path==="api/v1/auth/logout");
      if(!allowedRecoveryRoute)throw Object.assign(new Error("Please set a new password before continuing to the rest of your account."),{statusCode:403,code:"PASSWORD_RESET_REQUIRED"});
    }
    await db.query("update auth_session set last_seen_at=now() where id=$1",[identity.sid]);
    return identity;
  } catch(e){ throw Object.assign(new Error(e.message),{statusCode:e.statusCode===403?403:401,code:e.statusCode===403&&e.code?e.code:"UNAUTHENTICATED"}); }
}
function optionalIdentity(req){
  if(!req.headers.authorization?.startsWith("Bearer ")) return null;
  try { return verifyToken(req.headers.authorization.slice(7),config.jwtSecret); } catch { return null; }
}
const ROLE_PERMISSION={verification_reviewer:"verification.manage",ethics_reviewer:"verification.manage",appeal_reviewer:"verification.manage",organization_admin:"organizations.manage",recruiter:"jobs.manage",project_manager:"jobs.manage",mentor:"mentorship.manage",supporting_staff:"reviews.view",admin:"users.manage"};
function anyRole(identity,allowed){
  const roles=Array.isArray(identity.roles)?identity.roles:[];
  const permissions=Array.isArray(identity.permissions)?identity.permissions:[];
  if(!allowed.some(role=>roles.includes(role)||(ROLE_PERMISSION[role]&&permissions.includes(ROLE_PERMISSION[role])))) throw Object.assign(new Error("Forbidden."),{statusCode:403,code:"FORBIDDEN"});
  return identity;
}
function anyRoleOrPermission(identity,allowed,permissionCodes=[]){
  const roles=Array.isArray(identity.roles)?identity.roles:[];
  const permissions=Array.isArray(identity.permissions)?identity.permissions:[];
  if(!allowed.some(role=>roles.includes(role)||(ROLE_PERMISSION[role]&&permissions.includes(ROLE_PERMISSION[role])))&&!permissions.some(permission=>permissionCodes.includes(permission))) throw Object.assign(new Error("Forbidden."),{statusCode:403,code:"FORBIDDEN"});
  return identity;
}
function ok(res,data,requestId,status=200){ return json(res,status,{data},requestId); }
const rateBuckets=new Map();
function publicRateLimit(req,key,limit=30,windowMs=60000){ const now=Date.now(), k=key+":"+clientIp(req); const b=rateBuckets.get(k)||{start:now,count:0}; if(now-b.start>=windowMs){b.start=now;b.count=0} b.count++; rateBuckets.set(k,b); if(b.count>limit) throw Object.assign(new Error("Too many requests. Please try again later."),{statusCode:429,code:"RATE_LIMITED"}); }
async function bootstrapAdmin(){ if(!config.bootstrapAdminEmail||!config.bootstrapAdminPassword) return; const m=await import("./src/membership/service.js"); return m.bootstrapAdmin({email:config.bootstrapAdminEmail,password:config.bootstrapAdminPassword,name:config.bootstrapAdminName}); }

const server=http.createServer(async (req,res)=>{
  const requestId=req.headers["x-request-id"]||randomUUID();
  const allowOrigin = resolveAllowedOrigin(req.headers.origin, config.corsOrigin);
  if(req.method==="OPTIONS"){
    const headers={"access-control-allow-methods":"GET,POST,PUT,PATCH,DELETE,OPTIONS","access-control-allow-headers":"Authorization,Content-Type,X-Request-Id,X-Upload-Token","access-control-max-age":"600"};
    if(allowOrigin) headers["access-control-allow-origin"]=allowOrigin;
    res.writeHead(204,headers);return res.end();
  }
  if(allowOrigin) res.setHeader("access-control-allow-origin",allowOrigin);
  res.setHeader("vary","Origin"); res.setHeader("x-content-type-options","nosniff"); res.setHeader("x-frame-options","DENY"); res.setHeader("referrer-policy","strict-origin-when-cross-origin"); res.setHeader("permissions-policy","camera=(),microphone=(),geolocation=()"); if(config.nodeEnv==="production") res.setHeader("strict-transport-security","max-age=31536000; includeSubDomains");
  res.on("finish",()=>logger.info("http.request",{requestId,method:req.method,path:req.url,status:res.statusCode}));
  try {
    if(req.method==="GET" && req.url==="/healthz") return ok(res,{status:"ok"},requestId);
    if(req.method==="GET" && req.url==="/readyz") return ok(res,{status:"ready",databaseConfigured:Boolean(config.databaseUrl)},requestId);
    const parts=pathParts(req.url);
    const p=parts.join("/");
    if(req.method==="GET" && p==="api/v1/public/membership-verification") { await enforcePersistentRateLimit(req,"membership-card-verify",60,60000); const q=query(req.url); return ok(res,await membershipCard.verifyMembershipCard(q.get("record"),q.get("token")),requestId); }
    if(req.method==="POST" && p==="api/v1/public/support-bot/message") { await enforcePersistentRateLimit(req,"public-support-bot",20,60000); const b=await body(req); let userId=null; if(req.headers.authorization?.startsWith("Bearer ")) { try { userId=(await auth(req)).sub; } catch {} } return ok(res,await supportBot.answerPublicQuestion(b,{visitorKey:b.visitorKey,pagePath:b.pagePath||"/",userId}),requestId,201); }
    if(req.method==="GET" && p==="api/v1/auth/human-challenge") { await enforcePersistentRateLimit(req,"human-challenge",10,60000); return ok(res,await issueHumanChallenge(),requestId); }
    if(req.method==="POST" && p==="api/v1/auth/human-challenge/verify") { const b=await body(req); await enforcePersistentRateLimit(req,"human-challenge-verify",10,60000); return ok(res,await verifyHumanChallenge(b.id,b.answer),requestId); }
    if(req.method==="POST" && p==="api/v1/auth/email-verification/resend") { const b=await body(req); await enforcePersistentRateLimit(req,"email-verification-resend",3,3600000,String(b.email||"").trim().toLowerCase()); return ok(res,await resendEmailVerification(b.email,requestId),requestId,202); }
    if(req.method==="POST" && p==="api/v1/auth/email-verification/verify") { const b=await body(req); await enforcePersistentRateLimit(req,"email-verification-verify",10,60000); return ok(res,await verifyEmailToken(b.token,requestId),requestId); }
    if(req.method==="POST" && p==="api/v1/auth/passkeys/options") { const b=await body(req); await enforcePersistentRateLimit(req,"passkey-options",10,60000,String(b.email||"").trim().toLowerCase()); return ok(res,await beginAdminPasskeyAuthentication(b.email),requestId); }
    if(req.method==="POST" && p==="api/v1/auth/passkeys/verify") { const b=await body(req); await enforcePersistentRateLimit(req,"passkey-verify",10,60000,String(b.email||"").trim().toLowerCase()); return ok(res,await finishAdminPasskeyAuthentication(b.email,b.credential||b.payload||b,{ip:clientIp(req),userAgent:req.headers["user-agent"]||null},requestId),requestId); }
    if(req.method==="POST" && p==="api/v1/auth/passkeys/recovery") { const b=await body(req); await enforcePersistentRateLimit(req,"passkey-recovery",5,3600000,String(b.email||"").trim().toLowerCase()); return ok(res,await recoverAdminPasskey(b.email,b.code,{ip:clientIp(req),userAgent:req.headers["user-agent"]||null},requestId),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/passkeys/registration/options") { const identity=await auth(req); anyRole(identity,["system_admin","admin","platform_admin"]); return ok(res,await beginAdminPasskeyRegistration(identity),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/passkeys/registration/verify") { const identity=await auth(req); anyRole(identity,["system_admin","admin","platform_admin"]); return ok(res,await finishAdminPasskeyRegistration(identity,await body(req),requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/passkeys") { const identity=await auth(req); anyRole(identity,["system_admin","admin","platform_admin"]); return ok(res,await listAdminPasskeys(identity.sub),requestId); }
    if(req.method==="DELETE" && parts.length===5 && p.startsWith("api/v1/admin/passkeys/")) { const identity=await auth(req); anyRole(identity,["system_admin","admin","platform_admin"]); return ok(res,await revokeAdminPasskey(identity.sub,parts[4],requestId),requestId); }
    if(req.method==="POST" && p==="api/v1/email/inbound-webhook") {
      return ok(res,await emailOperations.receiveInboundEmail(await body(req),String(req.headers["x-email-webhook-secret"]||"")),requestId,201);
    }
    if(req.method==="GET" && p==="api/v1/admin/email/operations") { const identity=await auth(req); anyRole(identity,["system_admin"]); return ok(res,await emailOperations.getEmailOperations(identity.sub),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/email/messages") { const identity=await auth(req); anyRole(identity,["system_admin"]); return ok(res,await emailOperations.listEmailOutbox(identity.sub,{folder:query(req.url).get("folder")||"outbox",limit:query(req.url).get("limit")||100}),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/email/templates") { const identity=await auth(req); anyRole(identity,["system_admin"]); return ok(res,await emailOperations.listEmailTemplates(identity.sub),requestId); }
    if(req.method==="PUT" && parts.length===6 && p.startsWith("api/v1/admin/email/templates/")) { const identity=await auth(req); anyRole(identity,["system_admin"]); return ok(res,await emailOperations.saveEmailTemplate(identity.sub,parts[5],await body(req),requestId),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/email/drafts") { const identity=await auth(req); anyRole(identity,["system_admin"]); return ok(res,await emailOperations.saveEmailDraft(identity.sub,await body(req)),requestId,201); }
    if(req.method==="POST" && parts.length===7 && p.startsWith("api/v1/admin/email/drafts/") && parts[6]==="queue") { const identity=await auth(req); anyRole(identity,["system_admin"]); return ok(res,await emailOperations.queueEmailDraft(identity.sub,parts[5],requestId),requestId,202); }
    if(req.method==="POST" && p==="api/v1/admin/email/test") { const identity=await auth(req); anyRole(identity,["system_admin"]); return ok(res,await emailOperations.sendTestEmail(identity.sub,requestId),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/email/dispatch") { const identity=await auth(req); anyRole(identity,["system_admin"]); const b=await body(req); return ok(res,await emailOperations.dispatchEmailOutbox(identity.sub,{limit:b.limit||20}),requestId); }
    if(req.method==="POST" && parts.length===7 && p.startsWith("api/v1/admin/email/messages/") && parts[6]==="retry") { const identity=await auth(req); anyRole(identity,["system_admin"]); return ok(res,await emailOperations.retryFailedEmail(identity.sub,parts[5]),requestId); }
    if(req.method==="POST" && parts.length===7 && p.startsWith("api/v1/admin/email/verification-failures/") && parts[6]==="retry") { const identity=await auth(req); anyRole(identity,["system_admin"]); return ok(res,await emailOperations.retryVerificationEmail(identity.sub,parts[5],requestId),requestId); }
    if(req.method==="PATCH" && parts.length===6 && p.startsWith("api/v1/admin/email/inbox/")) { const identity=await auth(req); anyRole(identity,["system_admin"]); return ok(res,await emailOperations.updateInbox(identity.sub,parts[5],(await body(req)).action),requestId); }
    if(req.method==="POST" && p==="api/v1/public/opportunity-inquiries") { await enforcePersistentRateLimit(req,"public-inquiry",10,60000); publicRateLimit(req,"public-inquiry",10,60000); return ok(res,await publicOpportunity.createPublicInquiry(await body(req),requestId,optionalIdentity(req)),requestId,201); }
    if(req.method==="GET" && p==="api/v1/public/opportunity-sharing-organizations") { await enforcePersistentRateLimit(req,"sharing-audience",30,60000); publicRateLimit(req,"sharing-audience",30,60000); return ok(res,await publicOpportunity.listPublicSharingOrganizations(),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/public/opportunity-inquiries/") && parts[5]==="access") { await enforcePersistentRateLimit(req,"job-seeker-access",10,60000); publicRateLimit(req,"job-seeker-access",10,60000); const b=await body(req); return ok(res,await publicOpportunity.getPublicInquiry(parts[4],b.token||""),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/public/opportunity-inquiries/") && parts[5]==="sharing-history") { await enforcePersistentRateLimit(req,"job-seeker-sharing-history",10,60000,parts[4]); const b=await body(req); return ok(res,await publicOpportunity.getSharingHistory(parts[4],b.token||""),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/public/opportunity-inquiries/") && parts[5]==="sharing-consent") { await enforcePersistentRateLimit(req,"job-seeker-consent",10,60000); publicRateLimit(req,"job-seeker-consent",10,60000); const b=await body(req); return ok(res,await publicOpportunity.updateSharingConsent(parts[4],b.token||"",b,requestId),requestId); }
    if(req.method==="GET" && parts.length===6 && p.startsWith("api/v1/public/opportunity-inquiries/") && parts[5]==="details") { await enforcePersistentRateLimit(req,"public-inquiry-details",10,60000,parts[4]); const q=query(req.url); return ok(res,await publicOpportunity.getPublicInquiry(parts[4],q.get("token")||""),requestId); }
    if(req.method==="PATCH" && parts.length===6 && p.startsWith("api/v1/public/opportunity-inquiries/") && parts[5]==="details") { await enforcePersistentRateLimit(req,"public-inquiry-details-update",10,60000,parts[4]); const b=await body(req); return ok(res,await publicOpportunity.updatePublicInquiryDetails(parts[4],b.token||"",b,requestId),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/public/opportunity-inquiries/") && parts[5]==="link") { await enforcePersistentRateLimit(req,"public-inquiry-link",10,60000,parts[4]); const identity=await auth(req); const b=await body(req); return ok(res,await publicOpportunity.linkInquiryToAccount(parts[4],b.token||"",identity.sub,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/jobs") { const q=query(req.url); const v=optionalIdentity(req); return ok(res,await organizationJobs.listJobs({visibility:q.get("visibility"),postingScope:q.get("postingScope"),q:q.get("q"),employmentType:q.get("employmentType"),workMode:q.get("workMode"),seniority:q.get("seniority"),department:q.get("department"),location:q.get("location"),industryReferenceItemId:q.get("industryReferenceItemId"),occupationReferenceItemId:q.get("occupationReferenceItemId"),limit:q.get("limit"),offset:q.get("offset")},v?.sub||null),requestId); }
    if(req.method==="GET" && parts.length===4 && p.startsWith("api/v1/jobs/")) { const v=optionalIdentity(req); return ok(res,await organizationJobs.getJob(parts[3],v?.sub||null),requestId); }
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="applications") { const identity=await auth(req); return ok(res,await organizationJobs.listJobApplications(parts[3],identity.sub),requestId); }

    if(req.method==="GET" && p==="api/v1/services") { const q=query(req.url); const viewer=req.headers.authorization?.startsWith("Bearer ")?await auth(req):null; return ok(res,await servicesMentorship.listServices(viewer?.sub||null,{category:q.get("category"),q:q.get("q"),limit:q.get("limit"),offset:q.get("offset")}),requestId); }
    if(req.method==="GET" && parts.length===4 && p.startsWith("api/v1/services/")) return ok(res,await servicesMentorship.getServiceListing(parts[3],null),requestId);
    if(req.method==="GET" && p==="api/v1/mentors") { const q=query(req.url); const viewer=req.headers.authorization?.startsWith("Bearer ")?await auth(req):null; return ok(res,await servicesMentorship.listMentors(viewer?.sub||null,{q:q.get("q"),topic:q.get("topic"),limit:q.get("limit"),offset:q.get("offset")}),requestId); }
    if(req.method==="POST" && p==="api/v1/files/uploads") { const identity=await auth(req); return ok(res,await authorizePrivateUpload(identity.sub,await body(req)),requestId,201); }
    if(req.method==="PUT" && parts.length===6 && p.startsWith("api/v1/files/uploads/") && parts[5]==="content") { const identity=await auth(req); if(!String(req.headers["content-type"]||"").startsWith("application/octet-stream")) throw Object.assign(new Error("Upload content must use application/octet-stream."),{statusCode:415,code:"UNSUPPORTED_MEDIA_TYPE"}); const result=await receivePrivateUpload(identity.sub,parts[4],String(req.headers["x-upload-token"]||""),await rawBody(req)); return ok(res,result,requestId,201); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/files/uploads/") && parts[5]==="confirm") { const identity=await auth(req); return ok(res,await confirmPrivateUpload(identity.sub,parts[4]),requestId,201); }
    if(req.method==="GET" && parts.length===4 && p.startsWith("api/v1/files/")) { const identity=await auth(req); const result=await readAuthorizedPrivateFile(identity.sub,parts[3],identity.roles||[],requestId,identity.permissions||[]); res.writeHead(200,{"content-type":result.file.content_type,"content-length":String(result.bytes.length),"content-disposition":"attachment; filename*=UTF-8''"+encodeURIComponent(result.file.original_name),"cache-control":"private, no-store","x-content-type-options":"nosniff","x-request-id":requestId}); return res.end(result.bytes); }
    if(req.method==="POST" && p==="api/v1/auth/member-invitation/claim") return ok(res,await membershipAdminBulk.claimMemberInvitation(await body(req)),requestId);
    if(req.method==="POST" && p==="api/v1/auth/register") { const b=await body(req); await enforcePersistentRateLimit(req,"register",5,60000,String(b.email||"").trim().toLowerCase()); return ok(res,await membership.register(b,requestId),requestId,201); }
    if(req.method==="GET" && p==="api/v1/membership/products") return ok(res,await membership.listMembershipProducts(),requestId);
    if(req.method==="GET" && p==="api/v1/admin/membership/products") {
      const identity=await auth(req);
      anyRoleOrPermission(identity,["system_admin","reviewer"],["members.view","members.manage"]);
      return ok(res,await membership.listMembershipProductsForAdmin(),requestId);
    }
    if(req.method==="POST" && p==="api/v1/admin/membership/products") {
      const identity=await auth(req);
      anyRoleOrPermission(identity,["system_admin"],["members.manage"]);
      return ok(res,await membership.saveMembershipProduct(identity.sub,null,await body(req),requestId),requestId,201);
    }
    if(req.method==="PATCH" && parts.length===6 && p.startsWith("api/v1/admin/membership/products/")) {
      const identity=await auth(req);
      anyRoleOrPermission(identity,["system_admin"],["members.manage"]);
      return ok(res,await membership.saveMembershipProduct(identity.sub,parts[5],await body(req),requestId),requestId);
    }
    if(req.method==="POST" && p==="api/v1/auth/one-time-session/redeem") { await enforcePersistentRateLimit(req,"one-time-session-redeem",12,60000); publicRateLimit(req,"one-time-session-redeem",12,60000); const b=await body(req); return ok(res,await accountSecurity.redeemOneTimeSessionLink(b.token,requestId,{ip:clientIp(req),userAgent:req.headers["user-agent"]||null}),requestId); }
    if(req.method==="POST" && p==="api/v1/auth/login") {
      const b=await body(req); await enforcePersistentRateLimit(req,"login",20,60000,String(b.email||"").trim().toLowerCase()); return ok(res,await membership.login(b.email,b.password,requestId,{ip:clientIp(req),userAgent:req.headers["user-agent"]||null}),requestId);
    }

    if(req.method==="POST" && p==="api/v1/auth/logout") { const identity=await auth(req); return ok(res,await userAdmin.logout(identity.sub,identity.sid,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/reference-portfolio") { const identity=await auth(req); return ok(res,await referencePortfolio.listReferenceDatasets(identity),requestId); }
    if(req.method==="GET" && parts.length===6 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="items") { const identity=await auth(req); return ok(res,await referencePortfolio.listReferenceItems(identity,parts[4]),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="items") { const identity=await auth(req); return ok(res,await referencePortfolio.saveReferenceItem(identity,parts[4],await body(req),null),requestId,201); }
    if(req.method==="PATCH" && parts.length===7 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="items") { const identity=await auth(req); return ok(res,await referencePortfolio.saveReferenceItem(identity,parts[4],await body(req),parts[6]),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="preview-import") { const identity=await auth(req); const b=await body(req); return ok(res,await referencePortfolio.previewReferenceCsv(identity,parts[4],b.filename||"reference.csv",b.csv||"",b.mapping||{}),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="import") { const identity=await auth(req); const b=await body(req); return ok(res,await referencePortfolio.importReferenceCsv(identity,parts[4],b.filename||"reference.csv",b.csv||"",b.mapping||{}),requestId,201); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="preview-import-json") { const identity=await auth(req); const b=await body(req); return ok(res,await referencePortfolio.previewReferenceJson(identity,parts[4],b.filename||"reference.json",b.json||"",b.mapping||{}),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="import-json") { const identity=await auth(req); const b=await body(req); return ok(res,await referencePortfolio.importReferenceJson(identity,parts[4],b.filename||"reference.json",b.json||"",b.mapping||{}),requestId,201); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="preview-import-xlsx") { const identity=await auth(req); const b=await body(req,12*1024*1024); return ok(res,await referencePortfolio.previewReferenceXlsx(identity,parts[4],b.filename||"reference.xlsx",b.xlsxBase64||"",b.mapping||{}),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="import-xlsx") { const identity=await auth(req); const b=await body(req,12*1024*1024); return ok(res,await referencePortfolio.importReferenceXlsx(identity,parts[4],b.filename||"reference.xlsx",b.xlsxBase64||"",b.mapping||{}),requestId,201); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="publish") { const identity=await auth(req); const b=await body(req); return ok(res,await referencePortfolio.publishReferenceDataset(identity,parts[4],b.reason||""),requestId); }
     if(req.method==="GET" && parts.length===6 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="export") { const identity=await auth(req); return ok(res,await referencePortfolio.exportReferenceCsv(identity,parts[4]),requestId); }
    if(req.method==="GET" && parts.length===6 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="export-json") { const identity=await auth(req); return ok(res,await referencePortfolio.exportReferenceJson(identity,parts[4]),requestId); }
    if(req.method==="GET" && parts.length===6 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="export-xlsx") { const identity=await auth(req); return ok(res,await referencePortfolio.exportReferenceXlsx(identity,parts[4]),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/members/import-template") { const identity=await auth(req); const csv=membershipAdminBulk.memberImportTemplate(identity); res.writeHead(200,{"content-type":"text/csv; charset=utf-8","content-disposition":"attachment; filename=mpa-approved-members-template.csv","cache-control":"no-store","x-request-id":requestId}); return res.end(csv); }
    if(req.method==="POST" && p==="api/v1/admin/members/import/preview") { const identity=await auth(req); return ok(res,await membershipAdminBulk.previewMemberImport(identity,await body(req,6*1024*1024),requestId),requestId,201); }
    if(req.method==="POST" && parts.length===7 && p.startsWith("api/v1/admin/members/import/") && parts[6]==="apply") { const identity=await auth(req); return ok(res,await membershipAdminBulk.applyMemberImport(identity,parts[5],await body(req),requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/members/export") { const identity=await auth(req),q=query(req.url),out=await membershipAdminBulk.exportMembers(identity,{q:q.get("q"),status:q.get("status"),format:q.get("format")||"csv"},requestId); res.writeHead(200,{"content-type":out.contentType,"content-disposition":"attachment; filename="+out.filename,"content-length":String(out.buffer.length),"cache-control":"private, no-store","x-content-type-options":"nosniff","x-request-id":requestId}); return res.end(out.buffer); }
    if(req.method==="GET" && p==="api/v1/me/report-saved-views") { const identity=await auth(req); return ok(res,await reports.listSavedViews(identity),requestId); }
    if(req.method==="POST" && p==="api/v1/me/report-saved-views") { const identity=await auth(req); return ok(res,await reports.saveSavedView(identity,await body(req),requestId),requestId,201); }
    if(req.method==="DELETE" && parts.length===5 && p.startsWith("api/v1/me/report-saved-views/")) { const identity=await auth(req); return ok(res,await reports.deleteSavedView(identity,parts[4],requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/reports") { const identity=await auth(req); return ok(res,reports.listReportCatalogue(identity),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/reports/") && parts[5]==="run") { const identity=await auth(req); return ok(res,await reports.runReport(identity,parts[4],await body(req),requestId),requestId); }
    if(req.method==="GET" && parts.length===6 && p.startsWith("api/v1/admin/reports/") && parts[5]==="export") { const identity=await auth(req),q=query(req.url),out=await reports.exportReport(identity,parts[4],{from:q.get("from"),to:q.get("to"),status:q.get("status"),q:q.get("q"),groupBy:q.get("groupBy")},q.get("format")||"pdf",requestId); res.writeHead(200,{"content-type":out.contentType,"content-disposition":"attachment; filename="+out.filename,"content-length":String(out.buffer.length),"cache-control":"private, no-store","x-content-type-options":"nosniff","x-request-id":requestId}); return res.end(out.buffer); }
    if(req.method==="GET" && p==="api/v1/admin/users") { const identity=await auth(req); return ok(res,await userAdmin.listUsers(identity,{q:query(req.url).get("q"),status:query(req.url).get("status")}),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/roles") { const identity=await auth(req); return ok(res,await userAdmin.listRoles(identity.sub),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/permissions") { const identity=await auth(req); return ok(res,await userAdmin.listPermissions(identity.sub),requestId); }
    if(req.method==="PATCH" && parts.length===6 && p.startsWith("api/v1/admin/users/") && parts[5]==="permissions") { const identity=await auth(req); return ok(res,await userAdmin.updateUserPermissions(identity.sub,parts[4],await body(req),requestId),requestId); }
    if(req.method==="PATCH" && parts.length===5 && p.startsWith("api/v1/admin/users/")) { const identity=await auth(req); return ok(res,await userAdmin.updateUser(identity,parts[4],await body(req),requestId),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/users/") && parts[5]==="revoke-sessions") { const identity=await auth(req); const b=await body(req); return ok(res,await userAdmin.revokeSessions(identity,parts[4],requestId,b.reason),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/users/") && parts[5]==="reset-password") { const identity=await auth(req); const b=await body(req); return ok(res,await userAdmin.resetPassword(identity,parts[4],b.password,requestId,b.reason),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/users/") && parts[5]==="one-time-session-link") { const identity=await auth(req); const b=await body(req); const origin=resolveAllowedOrigin(req.headers.origin,config.corsOrigin); return ok(res,await accountSecurity.createOneTimeSessionLink(identity,parts[4],requestId,b.reason,origin),requestId); }
    if(req.method==="GET" && p==="api/v1/experience/demo-cases") return ok(res,await experience.listDemoCases(),requestId);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/experience/demo-cases/")) return ok(res,await experience.getDemoCase(parts[4]),requestId);
    if(req.method==="GET" && p==="api/v1/experience/guides") { const q=query(req.url); return ok(res,await experience.listGuides(q.get("route")),requestId); }

    if(req.method==="GET" && p==="api/v1/talent"){
      const q=query(req.url);
      const viewer=req.headers.authorization?.startsWith("Bearer ")?await auth(req):null;
      return ok(res,await talent.searchTalent(viewer?.sub||null,{q:q.get("q"),occupation:q.get("occupation"),industry:q.get("industry"),educationLevel:q.get("educationLevel"),qualificationType:q.get("qualificationType"),fieldOfStudy:q.get("fieldOfStudy"),availability:q.get("availability"),location:q.get("location"),verifiedClaim:q.get("verifiedClaim"),limit:q.get("limit"),offset:q.get("offset")}),requestId);
    }
    if(req.method==="GET" && parts.length===4 && p.startsWith("api/v1/talent/") && !["inquiries","saved-searches"].includes(parts[3])){
      const viewer=req.headers.authorization?.startsWith("Bearer ")?await auth(req):null;
      return ok(res,await talent.getTalent(parts[3],viewer?.sub||null),requestId);
    }

    if(req.method==="GET" && p==="api/v1/marketplace-demand/topics") { const q=query(req.url); return ok(res,await marketplaceDemand.listPublishedTopics({type:q.get("type"),q:q.get("q"),limit:q.get("limit")}),requestId); }
     if(req.method==="GET" && p==="api/v1/organization-mentorship-offers") { const viewer=req.headers.authorization?.startsWith("Bearer ")?await auth(req):null; return ok(res,await organizationMentorshipOffers.listOrganizationMentorshipOffers(viewer?.sub||null),requestId); }
    const identity=await auth(req);
    if(req.method==="POST" && p==="api/v1/admin/experience/demo-cases") { return ok(res,await experience.createDemoCase(identity.sub,await body(req),requestId),requestId,201); }
    if(req.method==="PATCH" && parts.length===6 && p.startsWith("api/v1/admin/experience/demo-cases/")) { return ok(res,await experience.updateDemoCase(parts[5],identity.sub,await body(req),requestId),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/experience/guides") { return ok(res,await experience.createGuide(identity.sub,await body(req),requestId),requestId,201); }
    if(req.method==="PATCH" && parts.length===6 && p.startsWith("api/v1/admin/experience/guides/")) { return ok(res,await experience.updateGuide(parts[5],identity.sub,await body(req),requestId),requestId); }

    if(req.method==="POST" && p==="api/v1/organizations") return ok(res,await organizationJobs.registerOrganization(identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && p==="api/v1/organizations") return ok(res,await organizationJobs.listMyOrganizations(identity.sub),requestId);
    if(req.method==="GET" && parts.length===4 && p.startsWith("api/v1/organizations/")) return ok(res,await organizationJobs.getOrganization(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/organizations/") && parts[4]==="verification-evidence") return ok(res,await organizationJobs.addVerificationEvidence(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/organizations/") && parts[4]==="submit-verification") return ok(res,await organizationJobs.submitOrganizationVerification(parts[3],identity.sub,requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/organizations/") && parts[4]==="users") return ok(res,await organizationJobs.addOrganizationUser(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="PATCH" && parts.length===6 && p.startsWith("api/v1/organizations/") && parts[4]==="users") return ok(res,await organizationJobs.updateOrganizationUser(parts[3],identity.sub,parts[5],await body(req),requestId),requestId);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/organizations/") && parts[4]==="users") return ok(res,await organizationJobs.listOrganizationUsers(parts[3],identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/review/organizations") return ok(res,await organizationJobs.listOrganizationVerificationQueue(identity.sub),requestId);
    if(req.method==="POST" && p==="api/v1/review/organizations") { anyRoleOrPermission(identity,["reviewer","system_admin"],["organizations.review"]); const b=await body(req); return ok(res,await organizationJobs.reviewOrganization(b.organizationId,identity.sub,b,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/organization-verification-requirements") return ok(res,await organizationJobs.listOrganizationVerificationRequirements(identity.sub),requestId);
    if(req.method==="POST" && p==="api/v1/admin/organization-verification-requirements") return ok(res,await organizationJobs.createOrganizationVerificationRequirement(identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="PATCH" && parts.length===5 && p.startsWith("api/v1/admin/organization-verification-requirements/")) return ok(res,await organizationJobs.updateOrganizationVerificationRequirement(parts[4],identity.sub,await body(req),requestId),requestId);

    if(req.method==="POST" && p==="api/v1/jobs") { const b=await body(req); if(!b.organizationId) throw Object.assign(new Error("organizationId is required."),{statusCode:400,code:"VALIDATION_ERROR"}); return ok(res,await organizationJobs.createJob(b.organizationId,identity.sub,b,requestId),requestId,201); }
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/organizations/") && parts[4]==="requisitions") return ok(res,await organizationJobs.createRequisition(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/organizations/") && parts[4]==="requisitions") return ok(res,await organizationJobs.listRequisitions(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/job-requisitions/") && parts[4]==="decision") return ok(res,await organizationJobs.decideRequisition(parts[3],identity.sub,await body(req),requestId),requestId);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/organizations/") && parts[4]==="jobs") return ok(res,await organizationJobs.listOrganizationJobs(parts[3],identity.sub),requestId);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/organizations/") && parts[4]==="recruiting-dashboard") return ok(res,await organizationJobs.organizationRecruitingDashboard(parts[3],identity.sub),requestId);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/organizations/") && parts[4]==="outcomes") return ok(res,await stakeholderOutcomes.getOrganizationOutcomeWorkspace(parts[3],identity.sub),requestId);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="dashboard") return ok(res,await organizationJobs.jobDashboard(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="team") return ok(res,await organizationJobs.addJobTeamMember(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="team") return ok(res,await organizationJobs.listJobTeam(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="screening-questions") return ok(res,await organizationJobs.addScreeningQuestion(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="scorecards") return ok(res,await organizationJobs.listInterviewScorecards(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="scorecards") return ok(res,await organizationJobs.createInterviewScorecard(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="screening-questions") return ok(res,await organizationJobs.listScreeningQuestions(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="referrals") return ok(res,await organizationJobs.referCandidate(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="save") return ok(res,await organizationJobs.saveJob(parts[3],identity.sub,requestId),requestId,201);
    if(req.method==="DELETE" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="save") return ok(res,await organizationJobs.unsaveJob(parts[3],identity.sub,requestId),requestId);
    if(req.method==="GET" && p==="api/v1/me/saved-jobs") return ok(res,await organizationJobs.listSavedJobs(identity.sub),requestId);
    if(req.method==="POST" && p==="api/v1/me/job-alerts") return ok(res,await organizationJobs.createJobAlert(identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && p==="api/v1/me/job-alerts") return ok(res,await organizationJobs.listJobAlerts(identity.sub),requestId);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/job-applications/") && parts[4]==="notes") return ok(res,await organizationJobs.listApplicationNotes(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/job-applications/") && parts[4]==="notes") return ok(res,await organizationJobs.addApplicationNote(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/job-applications/") && parts[4]==="interviews") return ok(res,await organizationJobs.scheduleInterview(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/job-interviews/") && parts[4]==="response") { const b=await body(req); return ok(res,await organizationJobs.respondInterview(parts[3],identity.sub,b.status,requestId),requestId); }
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/job-interviews/") && parts[4]==="feedback") return ok(res,await organizationJobs.submitInterviewFeedback(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="outcome") return ok(res,await organizationJobs.recordJobOutcome(parts[3],identity.sub,await body(req),requestId),requestId,201);


    if(req.method==="POST" && p==="api/v1/marketplace-demand") return ok(res,await marketplaceDemand.createDemand(identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && p==="api/v1/me/marketplace-demand") return ok(res,await marketplaceDemand.listMyDemand(identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/me/marketplace-demand-interests") return ok(res,await marketplaceDemand.listMyInterests(identity.sub),requestId);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/marketplace-demand/topics/") && parts[5]==="interest") return ok(res,await marketplaceDemand.joinDemandTopic(parts[4],identity.sub,await body(req),requestId),requestId,201);
     if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/marketplace-demand/topics/") && parts[5]==="withdraw") { const b=await body(req); return ok(res,await marketplaceDemand.withdrawDemandInterest(parts[4],identity.sub,b.reason,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/marketplace-match-candidates") { const q=query(req.url); return ok(res,await marketplaceDemand.listDemandMatchCandidates(identity.sub,q.get("type")||"service"),requestId); }
     if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/marketplace-demand/") && parts[5]==="matches") return ok(res,await marketplaceDemand.createDemandProviderMatch(parts[4],identity.sub,await body(req),requestId),requestId,201);
     if(req.method==="GET" && p==="api/v1/me/marketplace-demand-matches") return ok(res,await marketplaceDemand.listMyDemandProviderMatches(identity.sub),requestId);
     if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/marketplace-demand-matches/") && parts[4]==="response") { const b=await body(req); return ok(res,await marketplaceDemand.respondToDemandProviderMatch(parts[3],identity.sub,b.status,b.note,requestId),requestId); }
     if(req.method==="GET" && p==="api/v1/admin/marketplace-demand") { const q=query(req.url); return ok(res,await marketplaceDemand.listReviewQueue(identity.sub,{status:q.get("status")||"submitted"}),requestId); }
     if(req.method==="GET" && p==="api/v1/admin/marketplace-demand-assessment") { const q=query(req.url); return ok(res,await marketplaceDemand.getDemandInterestAssessment(identity.sub,{type:q.get("type"),from:q.get("from"),to:q.get("to")}),requestId); }
     if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/marketplace-demand/") && parts[5]==="merge") { const b=await body(req); return ok(res,await marketplaceDemand.mergeDemand(parts[4],b.targetDemandId,identity.sub,requestId),requestId); }
    if(req.method==="PATCH" && parts.length===6 && p.startsWith("api/v1/admin/marketplace-demand/") && parts[5]==="review") return ok(res,await marketplaceDemand.reviewDemand(parts[4],identity.sub,await body(req),requestId),requestId);
    if(req.method==="GET" && p==="api/v1/admin/marketplace-listings") return ok(res,await marketplaceDemand.listAdminListings(identity.sub),requestId);
    if(req.method==="POST" && parts.length===7 && p.startsWith("api/v1/admin/marketplace-listings/") && parts[6]==="moderate") return ok(res,await marketplaceDemand.moderateListing(parts[4],parts[5],identity.sub,await body(req),requestId),requestId);
    if(req.method==="GET" && parts.length===6 && p.startsWith("api/v1/admin/marketplace-demand-topics/") && parts[5]==="summary") return ok(res,await marketplaceDemand.getDemandSummary(identity.sub,parts[4]),requestId);
    if(req.method==="POST" && p==="api/v1/services") return ok(res,await servicesMentorship.createServiceListing(identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="PATCH" && parts.length===4 && p.startsWith("api/v1/services/")) return ok(res,await servicesMentorship.updateServiceListing(parts[3],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/services/") && parts[4]==="status") { const b=await body(req); return ok(res,await servicesMentorship.changeServiceListingStatus(parts[3],identity.sub,b.status,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/me/service-listings") return ok(res,await servicesMentorship.listMyServiceListings(identity.sub),requestId);
     if(req.method==="GET" && p==="api/v1/me/organization-mentorship-offers") return ok(res,await organizationMentorshipOffers.listMyOrganizationMentorshipOffers(identity.sub),requestId);
     if(req.method==="POST" && p==="api/v1/organization-mentorship-offers") return ok(res,await organizationMentorshipOffers.createOrganizationMentorshipOffer(identity.sub,await body(req),requestId),requestId,201);
     if(req.method==="PATCH" && parts.length===4 && p.startsWith("api/v1/organization-mentorship-offers/")) return ok(res,await organizationMentorshipOffers.updateOrganizationMentorshipOffer(parts[3],identity.sub,await body(req),requestId),requestId);
     if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/organization-mentorship-offers/") && parts[4]==="status") { const b=await body(req); return ok(res,await organizationMentorshipOffers.changeOrganizationMentorshipOfferStatus(parts[3],identity.sub,b.status,requestId),requestId); }
     if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/organization-mentorship-offers/") && parts[4]==="requests") return ok(res,await organizationMentorshipOffers.requestOrganizationMentorship(parts[3],identity.sub,await body(req),requestId),requestId,201);
     if(req.method==="GET" && p==="api/v1/me/organization-mentorship-requests") return ok(res,await organizationMentorshipOffers.listMyOrganizationMentorshipRequests(identity.sub),requestId);
     if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/organization-mentorship-requests/") && parts[4]==="status") { const b=await body(req); return ok(res,await organizationMentorshipOffers.respondOrganizationMentorshipRequest(parts[3],identity.sub,b.status,b.note,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/me/service-requests") return ok(res,await servicesMentorship.listMyServiceRequests(identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/services/") && parts[4]==="requests") return ok(res,await servicesMentorship.requestService(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/service-requests/") && parts[4]==="status") { const b=await body(req); return ok(res,await servicesMentorship.changeServiceRequestStatus(parts[3],identity.sub,b.status,b.note,requestId),requestId); }
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/service-requests/") && parts[4]==="accept-completion") { const b=await body(req); return ok(res,await servicesMentorship.acceptServiceCompletion(parts[3],identity.sub,b.note,requestId),requestId); }
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/service-requests/") && parts[4]==="payment") return ok(res,await servicesMentorship.submitServicePayment(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/service-payments/") && parts[4]==="verify") { anyRoleOrPermission(identity,["finance_officer","reviewer","system_admin"],["finance.manage"]); return ok(res,await servicesMentorship.verifyServicePayment(parts[3],identity.sub,await body(req),requestId),requestId); }
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/service-requests/") && parts[4]==="milestones") return ok(res,await servicesMentorship.listServiceMilestones(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/service-requests/") && parts[4]==="milestones") return ok(res,await servicesMentorship.createServiceMilestone(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/service-requests/") && parts[4]==="deliveries") return ok(res,await servicesMentorship.listServiceDeliveries(parts[3],identity.sub),requestId);
     if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/service-requests/") && parts[4]==="deliveries") return ok(res,await servicesMentorship.submitServiceDelivery(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/service-deliveries/") && parts[5]==="review") return ok(res,await servicesMentorship.reviewServiceDelivery(parts[4],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/service-requests/") && parts[4]==="feedback") return ok(res,await servicesMentorship.submitServiceFeedback(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && p==="api/v1/mentors") { const q=query(req.url); return ok(res,await servicesMentorship.listMentors(identity.sub,{q:q.get("q"),topic:q.get("topic")}),requestId); }
    if(req.method==="GET" && p==="api/v1/me/mentor-profile") return ok(res,await servicesMentorship.getMyMentorProfile(identity.sub),requestId);
    if(req.method==="POST" && p==="api/v1/me/mentor-profile") return ok(res,await servicesMentorship.createMentorProfile(identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="PATCH" && parts.length===4 && p.startsWith("api/v1/mentor-profiles/")) return ok(res,await servicesMentorship.updateMentorProfile(parts[3],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/mentor-profiles/") && parts[4]==="status") { const b=await body(req); return ok(res,await servicesMentorship.changeMentorStatus(parts[3],identity.sub,b.status,requestId),requestId); }
    if(req.method==="PUT" && parts.length===5 && p.startsWith("api/v1/mentor-profiles/") && parts[4]==="availability") return ok(res,await servicesMentorship.setMentorAvailability(parts[3],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/mentor-profiles/") && parts[4]==="time-off") return ok(res,await servicesMentorship.addMentorTimeOff(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && p==="api/v1/me/mentorship-requests") return ok(res,await servicesMentorship.listMyMentorshipRequests(identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/me/mentorship-matches") return ok(res,await servicesMentorship.listMyMentorshipMatches(identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/me/mentorships") return ok(res,await servicesMentorship.listMyMentorships(identity.sub),requestId);
    if(req.method==="POST" && p==="api/v1/mentorship/requests") return ok(res,await servicesMentorship.createMentorshipRequest(identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/mentorship/requests/")) return ok(res,await servicesMentorship.getMentorshipRequest(parts[4],identity.sub),requestId);
    if(req.method==="GET" && parts.length===6 && p.startsWith("api/v1/mentorship/requests/") && parts[5]==="matches") return ok(res,await servicesMentorship.findMentorMatches(parts[4],identity.sub),requestId);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/mentorship/requests/") && parts[5]==="match") { const b=await body(req); return ok(res,await servicesMentorship.proposeMentorMatch(parts[4],b.mentorUserId,identity.sub,requestId),requestId,201); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/mentorship/matches/") && parts[5]==="response") { const b=await body(req); return ok(res,await servicesMentorship.respondToMatch(parts[4],identity.sub,b.status,requestId),requestId); }
    if(req.method==="GET" && parts.length===4 && p.startsWith("api/v1/mentorship/")) return ok(res,await servicesMentorship.getMentorship(parts[3],identity.sub),requestId);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/mentorship/") && parts[4]==="goals") return ok(res,await servicesMentorship.listMentorshipGoals(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/mentorship/") && parts[4]==="goals") return ok(res,await servicesMentorship.createMentorshipGoal(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="PATCH" && parts.length===4 && p.startsWith("api/v1/mentorship-goals/")) return ok(res,await servicesMentorship.updateMentorshipGoal(parts[3],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/mentorship/") && parts[4]==="status") { const b=await body(req); return ok(res,await servicesMentorship.changeMentorshipStatus(parts[3],identity.sub,b.status,b.note,requestId),requestId); }
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/mentorship/") && parts[4]==="sessions") return ok(res,await servicesMentorship.listMentorshipSessions(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/mentorship/") && parts[4]==="sessions") return ok(res,await servicesMentorship.createMentorshipSession(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/mentorship/sessions/") && parts[5]==="status") { const b=await body(req); return ok(res,await servicesMentorship.changeMentorshipSession(parts[4],identity.sub,b.status,b.notes,requestId),requestId); }
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/mentorship/") && parts[4]==="feedback") return ok(res,await servicesMentorship.submitMentorshipFeedback(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && p==="api/v1/me/outcomes") return ok(res,await stakeholderOutcomes.getMyOutcomeWorkspace(identity.sub),requestId);
    if(req.method==="GET" && parts.length===5 && p==="api/v1/support/job-seeker-demands/organizations") { const identity=await auth(req); return ok(res,await publicOpportunity.listShareableOrganizations(identity.sub),requestId); }
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/organizations/") && parts[4]==="job-seeker-demands") { const identity=await auth(req); return ok(res,await publicOpportunity.listSharedJobSeekerDemands(parts[3],identity.sub),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/support/job-seeker-demands/") && parts[5]==="share") { const identity=await auth(req); return ok(res,await publicOpportunity.shareJobSeekerDemand(parts[4],identity.sub,await body(req),requestId),requestId,201); }
    if(req.method==="GET" && p==="api/v1/me/opportunity-inquiries") { const identity=await auth(req); return ok(res,await publicOpportunity.listMyLinkedInquiries(identity.sub),requestId); }
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/me/opportunity-inquiries/")) { const identity=await auth(req); return ok(res,await publicOpportunity.getLinkedInquiryDetails(parts[4],identity.sub),requestId); }
    if(req.method==="PATCH" && parts.length===5 && p.startsWith("api/v1/me/opportunity-inquiries/")) { const identity=await auth(req); return ok(res,await publicOpportunity.updateLinkedInquiryDetails(parts[4],identity.sub,await body(req),requestId),requestId); }
    if(req.method==="GET" && parts.length===6 && p.startsWith("api/v1/me/opportunity-inquiries/") && parts[5]==="sharing-history") { const identity=await auth(req); return ok(res,await publicOpportunity.getLinkedSharingHistory(parts[4],identity.sub),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/me/opportunity-inquiries/") && parts[5]==="sharing-consent") { const identity=await auth(req); return ok(res,await publicOpportunity.updateLinkedSharingConsent(parts[4],identity.sub,await body(req),requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/opportunity-inquiries") { const identity=await auth(req); return ok(res,await publicOpportunity.listInquiries(identity.sub,{type:query(req.url).get("type"),status:query(req.url).get("status")}),requestId); }
    if(req.method==="PATCH" && parts.length===4 && p.startsWith("api/v1/opportunity-inquiries/")) { const identity=await auth(req); const b=await body(req); return ok(res,await publicOpportunity.decideInquiry(parts[3],identity.sub,b,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/me/application-tracking") { const q=query(req.url); return ok(res,await applicationTracking.getApplicationTracking(identity.sub,{limit:q.get("limit")||undefined,offset:q.get("offset")||undefined,reference:q.get("reference")||undefined}),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/support/knowledge") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin","admin","platform_admin","supporting_staff"],["support.knowledge.manage","support.inquiries.manage"]); return ok(res,await supportBot.adminGetKnowledge(),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/support/knowledge/categories") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin","admin","platform_admin"],["support.knowledge.manage"]); return ok(res,await supportBot.adminSaveCategory(identity.sub,await body(req),requestId),requestId,201); }
    if(req.method==="POST" && p==="api/v1/admin/support/knowledge/articles") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin","admin","platform_admin"],["support.knowledge.manage"]); return ok(res,await supportBot.adminSaveArticle(identity.sub,await body(req),requestId),requestId,201); }
    if(req.method==="GET" && p==="api/v1/admin/support/inquiries") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin","admin","platform_admin","supporting_staff"],["support.inquiries.view","support.inquiries.manage"]); const q=query(req.url); return ok(res,await supportBot.adminListConversations({status:q.get("status"),limit:q.get("limit")||"50"}),requestId); }
    if(req.method==="PATCH" && parts.length===6 && parts[0]==="api" && parts[1]==="v1" && parts[2]==="admin" && parts[3]==="support" && parts[4]==="inquiries") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin","admin","platform_admin","supporting_staff"],["support.inquiries.manage"]); return ok(res,await supportBot.adminUpdateConversation(identity.sub,parts[5],await body(req),requestId),requestId); }
    if(req.method==="POST" && parts.length===7 && parts[0]==="api" && parts[1]==="v1" && parts[2]==="admin" && parts[3]==="support" && parts[4]==="inquiries" && parts[6]==="reply") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin","admin","platform_admin","supporting_staff"],["support.inquiries.manage"]); return ok(res,await supportBot.adminReplyToConversation(identity.sub,parts[5],await body(req),requestId),requestId,201); }
    if(req.method==="GET" && p==="api/v1/membership/card") { const identity=await auth(req); return ok(res,await membershipCard.getMyMembershipCard(identity.sub),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/membership-card") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin","reviewer"],["members.view","members.manage"]); return ok(res,await membershipCard.getMembershipCardForAdmin(query(req.url).get("membershipNumber"),identity.sub,requestId),requestId); }
    if(req.method==="PATCH" && p==="api/v1/me/profile-picture") { const identity=await auth(req); return ok(res,await membershipCard.setMyProfilePicture(identity.sub,(await body(req)).fileObjectId,requestId),requestId); }
    if(req.method==="DELETE" && p==="api/v1/me/profile-picture") { const identity=await auth(req); return ok(res,await membershipCard.removeMyProfilePicture(identity.sub,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/membership-card-settings") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin","admin","platform_admin"],["members.manage"]); return ok(res,await membershipCard.getMembershipCardSettings(),requestId); }
    if(req.method==="PATCH" && p==="api/v1/admin/membership-card-settings") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin"],["members.manage"]); return ok(res,await membershipCard.updateMembershipCardSettings(identity.sub,await body(req),requestId),requestId); }
    if(req.method==="POST" && parts.length===6 && parts[0]==="api" && parts[1]==="v1" && parts[2]==="admin" && parts[3]==="membership-records" && parts[5]==="rotate-verification") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin"],["members.manage"]); return ok(res,await membershipCard.rotateMembershipCardVerification(parts[4],identity.sub,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/me") return ok(res,{...(await membership.getMe(identity.sub)),permissions:identity.permissions||[],credential_setup_required:identity.credential_setup_required===true},requestId);
    if(req.method==="PATCH" && p==="api/v1/me/account") return ok(res,await accountSecurity.updateOwnCredentials(identity,await body(req),requestId),requestId);
    if(req.method==="PATCH" && p==="api/v1/me/profile") return ok(res,await membership.updateProfile(identity.sub,await body(req),requestId),requestId);
    if(req.method==="GET" && p==="api/v1/membership/history") return ok(res,await membership.history(identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/membership/applications/me") return ok(res,await membership.listMyApplications(identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/notifications") { const q=query(req.url); return ok(res,await notifications.getNotificationInbox(identity.sub,{category:q.get("category")||"all",unreadOnly:q.get("unreadOnly")||"false",actionRequired:q.get("actionRequired")||"false",limit:q.get("limit")||30,offset:q.get("offset")||0}),requestId); }
     if(req.method==="POST" && p==="api/v1/notifications/read-all") return ok(res,await notifications.markAllNotificationsRead(identity.sub,requestId),requestId);
     if(req.method==="PATCH" && parts.length===5 && p.startsWith("api/v1/notifications/") && parts[4]==="read") return ok(res,await notifications.markNotificationRead(identity.sub,parts[3],requestId),requestId);
     if(req.method==="PATCH" && parts.length===5 && p.startsWith("api/v1/notifications/") && parts[4]==="archive") return ok(res,await notifications.archiveNotification(identity.sub,parts[3],requestId),requestId);
     if(req.method==="GET" && p==="api/v1/notifications/preferences") return ok(res,await membership.notificationPreferences(identity.sub),requestId);
    if(req.method==="PATCH" && p==="api/v1/notifications/preferences") return ok(res,await membership.notificationPreferences(identity.sub,await body(req)),requestId);
    if(req.method==="POST" && p==="api/v1/membership/applications") {
      requireRole(identity,"member"); return ok(res,await membership.createApplication(identity.sub,await body(req),requestId),requestId,201);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/membership/applications/") && parts[5]==="review") {
      anyRoleOrPermission(identity,["reviewer","finance_officer","system_admin"],["members.manage"]); return ok(res,await membership.reviewApplication(parts[4],identity.sub,await body(req),requestId),requestId);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/membership/applications/") && parts[5]==="correction") {
      requireRole(identity,"member"); return ok(res,await membership.respondCorrection(parts[4],identity.sub,await body(req),requestId),requestId);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/membership/applications/") && parts[5]==="attachments") {
      requireRole(identity,"member"); return ok(res,await membership.attachApplicationFile(parts[4],identity.sub,await body(req),requestId),requestId,201);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/membership/applications/") && parts[5]==="payment") {
      requireRole(identity,"member"); const b=await body(req); return ok(res,await membership.createManualPayment(parts[4],identity.sub,b,requestId),requestId,201);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/membership/applications/") && parts[5]==="activate") {
      anyRoleOrPermission(identity,["reviewer","finance_officer","system_admin"],["members.manage"]); return ok(res,await membership.activateApplication(parts[4],identity.sub,requestId),requestId);
    }
    if(req.method==="POST" && p==="api/v1/membership/renew") {
      requireRole(identity,"member"); const b=await body(req); return ok(res,await membership.renew(identity.sub,b.productCode,requestId),requestId,201);
    }
    if(req.method==="POST" && parts.length===5 && parts[0]==="api" && parts[1]==="v1" && parts[2]==="payments" && parts[4]==="verify") {
      anyRoleOrPermission(identity,["reviewer","finance_officer","system_admin"],["finance.manage"]); return ok(res,await membership.verifyPayment(parts[3],identity.sub,await body(req),requestId),requestId);
    }
    if(req.method==="POST" && parts.length===5 && parts[0]==="api" && parts[1]==="v1" && parts[2]==="payments" && parts[4]==="reverse") {
      anyRoleOrPermission(identity,["finance_officer","system_admin"],["finance.manage"]);
      return ok(res,await membership.reverseMembershipPayment(parts[3],identity.sub,await body(req),requestId),requestId);
    }
    if(req.method==="GET" && p==="api/v1/review/membership/applications") {
      const roles=Array.isArray(identity.roles)?identity.roles:[]; const permissions=Array.isArray(identity.permissions)?identity.permissions:[];
      if(!roles.some(role=>["reviewer","finance_officer","system_admin"].includes(role))&&!permissions.some(permission=>["members.view","members.manage","finance.view","finance.manage"].includes(permission))) throw Object.assign(new Error("Forbidden."),{statusCode:403,code:"FORBIDDEN"});
      return ok(res,await membership.listApplicationsForReview(),requestId);
    }

    if(req.method==="GET" && p==="api/v1/professional-reference-data") return ok(res,await referencePortfolio.listPublicReferenceSets(),requestId);
    if(req.method==="GET" && p==="api/v1/me/education") return ok(res,await talent.getProfessionalEducation(identity.sub),requestId);
    if(req.method==="PUT" && p==="api/v1/me/education") return ok(res,await talent.saveProfessionalEducation(identity.sub,await body(req),requestId),requestId);
    if(req.method==="GET" && p==="api/v1/me/portfolio") return ok(res,await talent.getProfessionalPortfolio(identity.sub),requestId);
    if(req.method==="POST" && p==="api/v1/me/portfolio") return ok(res,await talent.saveProfessionalPortfolioItem(identity.sub,await body(req),requestId,null),requestId,201);
    if(req.method==="PATCH" && parts.length===5 && p.startsWith("api/v1/me/portfolio/")) return ok(res,await talent.saveProfessionalPortfolioItem(identity.sub,await body(req),requestId,parts[4]),requestId);
    if(req.method==="DELETE" && parts.length===5 && p.startsWith("api/v1/me/portfolio/")) return ok(res,await talent.deleteProfessionalPortfolioItem(identity.sub,parts[4],requestId),requestId);
    if(req.method==="GET" && p==="api/v1/me/talent-profile") return ok(res,await talent.getProfessionalProfile(identity.sub),requestId);
    if(req.method==="PATCH" && p==="api/v1/me/talent-profile") return ok(res,await talent.updateProfessionalProfile(identity.sub,await body(req),requestId),requestId);
    if(req.method==="GET" && p==="api/v1/me/talent-visibility") return ok(res,await talent.getVisibility(identity.sub),requestId);
    if(req.method==="PATCH" && p==="api/v1/me/talent-visibility") return ok(res,await talent.updateVisibility(identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && p==="api/v1/talent/saved-searches") return ok(res,await talent.saveSearch(identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && p==="api/v1/talent/saved-searches") return ok(res,await talent.listSavedSearches(identity.sub),requestId);
    if(req.method==="POST" && p==="api/v1/talent/inquiries") return ok(res,await talent.createTalentInquiry(identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && p==="api/v1/talent/inquiries") return ok(res,await talent.listTalentInquiries(identity.sub),requestId);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/talent/inquiries/") && parts[5]==="response") return ok(res,await talent.respondToTalentInquiry(parts[4],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/talent/inquiries/") && parts[5]==="close") return ok(res,await talent.closeTalentInquiry(parts[4],identity.sub,requestId),requestId);

    if(req.method==="GET" && p==="api/v1/verification/programs") return ok(res,await verification.listPrograms(),requestId);
    if(req.method==="GET" && p==="api/v1/verification/claim-types") return ok(res,await verification.listClaimTypes(),requestId);
    if(req.method==="GET" && p==="api/v1/me/verification/cases") return ok(res,await verification.listCases({subjectUserId:identity.sub}),requestId);
    if(req.method==="POST" && p==="api/v1/verification/cases"){
      const b=await body(req);
      if(b.subjectUserId && b.subjectUserId!==identity.sub) anyRole(identity,["verification_reviewer","ethics_reviewer","system_admin"]);
      else requireRole(identity,"member");
      return ok(res,await verification.createCase(b.subjectUserId||identity.sub,b.programCode,identity.sub,requestId),requestId,201);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/verification/cases/") && parts[5]==="consent"){ const b=await body(req); return ok(res,await verification.giveConsent(parts[4],identity.sub,b.consentVersion,requestId),requestId); }
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/verification/cases/")){
      const c=await verification.getCase(parts[4],identity.sub);
      return ok(res,c,requestId);
    }
    if(req.method==="GET" && p==="api/v1/review/verification/appeals") return ok(res,await verification.listAppealsForReview(identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/review/verification/cases"){
      anyRole(identity,["verification_reviewer","ethics_reviewer","system_admin"]);
      const q=query(req.url);
      return ok(res,await verification.listCases({status:q.get("status"),programCode:q.get("programCode"),reviewerId:q.get("reviewerId"),limit:q.get("limit"),offset:q.get("offset")}),requestId);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/verification/cases/") && parts[5]==="assign"){
      anyRole(identity,["verification_reviewer","system_admin"]); const b=await body(req);
      return ok(res,await verification.assignCase(parts[4],b.reviewerId,identity.sub,requestId),requestId);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/verification/cases/") && parts[5]==="transition"){
      anyRole(identity,["verification_reviewer","ethics_reviewer","system_admin"]); const b=await body(req);
      return ok(res,await verification.transitionCase(parts[4],b.status,identity.sub,requestId),requestId);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/verification/cases/") && parts[5]==="claims"){
      const b=await body(req); const c=await verification.getCase(parts[4]);
      if(c.subject_user_id!==identity.sub) anyRole(identity,["verification_reviewer","ethics_reviewer","system_admin"]);
      return ok(res,await verification.addClaim(parts[4],b.claimTypeCode,b.claimedValue,identity.sub,requestId),requestId,201);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/verification/cases/") && parts[5]==="evidence"){
      const b=await body(req); const c=await verification.getCase(parts[4]);
      if(c.subject_user_id!==identity.sub) anyRole(identity,["verification_reviewer","ethics_reviewer","system_admin"]);
      return ok(res,await verification.addEvidence(parts[4],b,identity.sub,requestId),requestId,201);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/verification/cases/") && parts[5]==="decision"){
      anyRole(identity,["verification_reviewer","ethics_reviewer","system_admin"]);
      return ok(res,await verification.decide(parts[4],await body(req),identity.sub,requestId),requestId);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/verification/cases/") && parts[5]==="response") return ok(res,await verification.memberResponse(parts[4],await body(req),identity.sub,requestId),requestId);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/verification/cases/") && parts[5]==="appeal") return ok(res,await verification.submitAppeal(parts[4],await body(req),identity.sub,requestId),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/verification/appeals/") && parts[4]==="decision"){
      anyRole(identity,["appeal_reviewer","system_admin"]);
      return ok(res,await verification.decideAppeal(parts[3],await body(req),identity.sub,requestId),requestId);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/verification/cases/") && parts[5]==="claim-status"){
      anyRole(identity,["verification_reviewer","ethics_reviewer","system_admin"]); const b=await body(req);
      return ok(res,await verification.setClaimStatus(parts[4],b.status,identity.sub,requestId),requestId);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/verification/cases/") && parts[5]==="check-results"){
      anyRole(identity,["verification_reviewer","ethics_reviewer","system_admin"]); const b=await body(req);
      return ok(res,await verification.recordCheckResult(parts[4],b.checklistItemId,b,identity.sub,requestId),requestId);
    }

    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="eligibility") return ok(res,await organizationJobs.evaluateEligibility(parts[3],identity.sub),requestId);
    if(req.method==="PATCH" && parts.length===4 && p.startsWith("api/v1/jobs/")) return ok(res,await organizationJobs.updateJob(parts[3],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="publish") return ok(res,await organizationJobs.publishJob(parts[3],identity.sub,requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="status") { const b=await body(req); return ok(res,await organizationJobs.changeJobStatus(parts[3],identity.sub,b.status,requestId),requestId); }
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="candidates") return ok(res,await organizationJobs.listCandidates(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="application-drafts") return ok(res,await organizationJobs.saveApplicationDraft(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="apply") return ok(res,await organizationJobs.applyToJob(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="PATCH" && parts.length===4 && p.startsWith("api/v1/job-applications/")) return ok(res,await organizationJobs.updateApplicationDraft(parts[3],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/job-applications/") && parts[4]==="submit") return ok(res,await organizationJobs.submitApplication(parts[3],identity.sub,await body(req),requestId),requestId);
    if(req.method==="GET" && p==="api/v1/me/job-applications") return ok(res,await organizationJobs.listMyApplications(identity.sub),requestId);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/job-applications/") && parts[4]==="progress") return ok(res,await organizationJobs.getMyApplicationProgress(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/jobs/") && parts[4]==="candidates") { return ok(res,await organizationJobs.updateCandidate(parts[3],parts[5],identity.sub,await body(req),requestId),requestId); }
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/job-applications/") && parts[4]==="offer-approval") return ok(res,await organizationJobs.approveJobOffer(parts[3],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/job-applications/") && parts[4]==="respond") return ok(res,await organizationJobs.respondToJobApplication(parts[3],identity.sub,await body(req),requestId),requestId);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/job-applications/") && parts[4]==="attachments") return ok(res,await organizationJobs.listApplicationAttachments(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/job-applications/") && parts[4]==="attachments") return ok(res,await organizationJobs.addApplicationAttachment(parts[3],identity.sub,await body(req),requestId),requestId,201);
    return json(res,404,{error:{code:"NOT_FOUND",message:"Route not found."}},requestId);
  } catch(error) {
    const status=error.statusCode||500;
    logger.error("http.error",{requestId,error:error.message,code:error.code,status});
    return json(res,status,{error:{code:error.code||"INTERNAL_ERROR",message:status>=500?"Internal server error.":error.message}},requestId);
  }
});
// Bounded, unref'd dispatcher. Row-level locking in the outbox service coordinates multiple instances.
let emailWorkerRunning=false;
const emailWorkerTimer=setInterval(async()=>{
  if(emailWorkerRunning)return;
  emailWorkerRunning=true;
  try { const result=await emailOperations.dispatchPendingSystemEmail(); if(result.processed)logger.info("email.outbox.dispatched",{processed:result.processed}); }
  catch(error){ logger.warn("email.outbox.dispatch_failed",{error:error.message,code:error.code||"EMAIL_DISPATCH_FAILED"}); }
  finally { emailWorkerRunning=false; }
},30000);
emailWorkerTimer.unref();
server.listen(config.port,config.host,async()=>{ try { await bootstrapAdmin(); logger.info("server.started",{host:config.host,port:config.port,environment:config.nodeEnv,bootstrapAdmin:Boolean(config.bootstrapAdminEmail)}); } catch(error){ logger.error("bootstrap.admin.failed",{error:error.message}); if(config.nodeEnv==="production") process.exitCode=1; } });
export { server };

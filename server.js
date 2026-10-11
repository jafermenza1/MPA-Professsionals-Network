import http from "node:http";
import { authorizePrivateUpload, receivePrivateUpload, confirmPrivateUpload, readAuthorizedPrivateFile, MAX_PRIVATE_UPLOAD_BYTES } from "./src/platform/private-file-storage.js";
import { randomUUID } from "node:crypto";
import { loadConfig } from "./src/platform/config.js";
import { createLogger } from "./src/platform/logger.js";
import { verifyToken, requireRole, hashSessionToken, withCurrentRoles } from "./src/platform/auth.js";
import { getPool } from "./src/platform/db.js";
import * as membership from "./src/membership/service.js";
import * as verification from "./src/verification/service.js";
import * as talent from "./src/talent/service.js";
import * as organizationJobs from "./src/organization-jobs/service.js";
import * as servicesMentorship from "./src/services-mentorship/service.js";
import * as stakeholderOutcomes from "./src/platform/stakeholder-outcomes.js";
import * as experience from "./src/platform/experience.js";
import * as applicationTracking from "./src/platform/application-tracking.js";
import * as publicOpportunity from "./src/platform/public-opportunity.js";
import * as userAdmin from "./src/platform/user-admin.js";
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
async function body(req){
  let raw="";
  for await (const chunk of req) {
    raw+=chunk;
    if(Buffer.byteLength(raw)>1024*1024) throw Object.assign(new Error("Request body too large."),{statusCode:413,code:"PAYLOAD_TOO_LARGE"});
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
    const r=await db.query(`select s.user_id,u.status,
      coalesce(json_agg(distinct role.role_code) filter(where role.role_code is not null),'[]'::json) as roles
      from auth_session s join app_user u on u.id=s.user_id
      left join app_user_role ur on ur.user_id=u.id left join app_role role on role.id=ur.role_id
      where s.id=$1 and s.revoked_at is null and s.expires_at>now()
      group by s.id,u.id,u.status`,[identity.sid]);
    if(!r.rows[0]||r.rows[0].status!=="active"||r.rows[0].user_id!==identity.sub) throw Object.assign(new Error("Session expired or revoked."),{statusCode:401});
    // Authorization must use current database roles, never stale role claims from a signed token.
    identity.roles=withCurrentRoles(identity,Array.isArray(r.rows[0].roles)?r.rows[0].roles:JSON.parse(r.rows[0].roles||"[]")).roles;
    await db.query("update auth_session set last_seen_at=now() where id=$1",[identity.sid]);
    return identity;
  } catch(e){ throw Object.assign(new Error(e.message),{statusCode:e.statusCode===403?403:401,code:"UNAUTHENTICATED"}); }
}
function optionalIdentity(req){
  if(!req.headers.authorization?.startsWith("Bearer ")) return null;
  try { return verifyToken(req.headers.authorization.slice(7),config.jwtSecret); } catch { return null; }
}
function anyRole(identity,allowed){
  if(!allowed.some(role=>Array.isArray(identity.roles)&&identity.roles.includes(role))) throw Object.assign(new Error("Forbidden."),{statusCode:403,code:"FORBIDDEN"});
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
    if(req.method==="POST" && p==="api/v1/public/opportunity-inquiries") { publicRateLimit(req,"public-inquiry",10,60000); return ok(res,await publicOpportunity.createPublicInquiry(await body(req),requestId,optionalIdentity(req)),requestId,201); }
    if(req.method==="GET" && parts.length===6 && p.startsWith("api/v1/public/opportunity-inquiries/") && parts[5]==="details") { const q=query(req.url); return ok(res,await publicOpportunity.getPublicInquiry(parts[4],q.get("token")||""),requestId); }
    if(req.method==="PATCH" && parts.length===6 && p.startsWith("api/v1/public/opportunity-inquiries/") && parts[5]==="details") { const b=await body(req); return ok(res,await publicOpportunity.updatePublicInquiryDetails(parts[4],b.token||"",b,requestId),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/public/opportunity-inquiries/") && parts[5]==="link") { const identity=await auth(req); const b=await body(req); return ok(res,await publicOpportunity.linkInquiryToAccount(parts[4],b.token||"",identity.sub,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/jobs") { const q=query(req.url); const v=optionalIdentity(req); return ok(res,await organizationJobs.listJobs({visibility:q.get("visibility"),postingScope:q.get("postingScope"),q:q.get("q"),employmentType:q.get("employmentType"),workMode:q.get("workMode"),seniority:q.get("seniority"),department:q.get("department"),location:q.get("location"),industryReferenceItemId:q.get("industryReferenceItemId"),occupationReferenceItemId:q.get("occupationReferenceItemId")},v?.sub||null),requestId); }
    if(req.method==="GET" && parts.length===4 && p.startsWith("api/v1/jobs/")) { const v=optionalIdentity(req); return ok(res,await organizationJobs.getJob(parts[3],v?.sub||null),requestId); }
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="applications") return ok(res,await organizationJobs.listJobApplications(parts[3],identity.sub),requestId);

    if(req.method==="GET" && p==="api/v1/services") { const q=query(req.url); return ok(res,await servicesMentorship.listServices(null,{category:q.get("category"),q:q.get("q"),limit:q.get("limit"),offset:q.get("offset")}),requestId); }
    if(req.method==="GET" && parts.length===4 && p.startsWith("api/v1/services/")) return ok(res,await servicesMentorship.getServiceListing(parts[3],null),requestId);
    if(req.method==="GET" && p==="api/v1/mentors") { const q=query(req.url); const viewer=req.headers.authorization?.startsWith("Bearer ")?await auth(req):null; return ok(res,await servicesMentorship.listMentors(viewer?.sub||null,{q:q.get("q"),topic:q.get("topic")}),requestId); }
    if(req.method==="POST" && p==="api/v1/files/uploads") { const identity=await auth(req); return ok(res,await authorizePrivateUpload(identity.sub,await body(req)),requestId,201); }
    if(req.method==="PUT" && parts.length===6 && p.startsWith("api/v1/files/uploads/") && parts[5]==="content") { const identity=await auth(req); if(!String(req.headers["content-type"]||"").startsWith("application/octet-stream")) throw Object.assign(new Error("Upload content must use application/octet-stream."),{statusCode:415,code:"UNSUPPORTED_MEDIA_TYPE"}); const result=await receivePrivateUpload(identity.sub,parts[4],String(req.headers["x-upload-token"]||""),await rawBody(req)); return ok(res,result,requestId,201); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/files/uploads/") && parts[5]==="confirm") { const identity=await auth(req); return ok(res,await confirmPrivateUpload(identity.sub,parts[4]),requestId,201); }
    if(req.method==="GET" && parts.length===4 && p.startsWith("api/v1/files/")) { const identity=await auth(req); const result=await readAuthorizedPrivateFile(identity.sub,parts[3],identity.roles||[],requestId); res.writeHead(200,{"content-type":result.file.content_type,"content-length":String(result.bytes.length),"content-disposition":"attachment; filename*=UTF-8''"+encodeURIComponent(result.file.original_name),"cache-control":"private, no-store","x-content-type-options":"nosniff","x-request-id":requestId}); return res.end(result.bytes); }
    if(req.method==="POST" && p==="api/v1/auth/register") { publicRateLimit(req,"register",5,60000); return ok(res,await membership.register(await body(req),requestId),requestId,201); }
    if(req.method==="GET" && p==="api/v1/membership/products") return ok(res,await membership.listMembershipProducts(),requestId);
    if(req.method==="POST" && p==="api/v1/auth/login") {
      const b=await body(req); publicRateLimit(req,"login:"+String(b.email||"").trim().toLowerCase(),20,60000); return ok(res,await membership.login(b.email,b.password,requestId,{ip:clientIp(req),userAgent:req.headers["user-agent"]||null}),requestId);
    }

    if(req.method==="POST" && p==="api/v1/auth/logout") { const identity=await auth(req); return ok(res,await userAdmin.logout(identity.sub,identity.sid,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/users") { const identity=await auth(req); return ok(res,await userAdmin.listUsers(identity,{q:query(req.url).get("q"),status:query(req.url).get("status")}),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/roles") { const identity=await auth(req); return ok(res,await userAdmin.listRoles(identity.sub),requestId); }
    if(req.method==="PATCH" && parts.length===5 && p.startsWith("api/v1/admin/users/")) { const identity=await auth(req); return ok(res,await userAdmin.updateUser(identity.sub,parts[4],await body(req),requestId),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/users/") && parts[5]==="revoke-sessions") { const identity=await auth(req); const b=await body(req); return ok(res,await userAdmin.revokeSessions(identity.sub,parts[4],requestId,b.reason),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/users/") && parts[5]==="reset-password") { const identity=await auth(req); const b=await body(req); return ok(res,await userAdmin.resetPassword(identity.sub,parts[4],b.password,requestId,b.reason),requestId); }
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
    if(req.method==="POST" && p==="api/v1/review/organizations") { anyRole(identity,["reviewer","system_admin"]); const b=await body(req); return ok(res,await organizationJobs.reviewOrganization(b.organizationId,identity.sub,b,requestId),requestId); }
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


    if(req.method==="POST" && p==="api/v1/services") return ok(res,await servicesMentorship.createServiceListing(identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="PATCH" && parts.length===4 && p.startsWith("api/v1/services/")) return ok(res,await servicesMentorship.updateServiceListing(parts[3],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/services/") && parts[4]==="status") { const b=await body(req); return ok(res,await servicesMentorship.changeServiceListingStatus(parts[3],identity.sub,b.status,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/me/service-requests") return ok(res,await servicesMentorship.listMyServiceRequests(identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/services/") && parts[4]==="requests") return ok(res,await servicesMentorship.requestService(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/service-requests/") && parts[4]==="status") { const b=await body(req); return ok(res,await servicesMentorship.changeServiceRequestStatus(parts[3],identity.sub,b.status,b.note,requestId),requestId); }
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/service-requests/") && parts[4]==="accept-completion") { const b=await body(req); return ok(res,await servicesMentorship.acceptServiceCompletion(parts[3],identity.sub,b.note,requestId),requestId); }
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/service-requests/") && parts[4]==="payment") return ok(res,await servicesMentorship.submitServicePayment(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/service-payments/") && parts[4]==="verify") { anyRole(identity,["finance_officer","reviewer","system_admin"]); return ok(res,await servicesMentorship.verifyServicePayment(parts[3],identity.sub,await body(req),requestId),requestId); }
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/service-requests/") && parts[4]==="milestones") return ok(res,await servicesMentorship.listServiceMilestones(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/service-requests/") && parts[4]==="milestones") return ok(res,await servicesMentorship.createServiceMilestone(parts[3],identity.sub,await body(req),requestId),requestId,201);
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
    if(req.method==="GET" && p==="api/v1/opportunity-inquiries") { const identity=await auth(req); return ok(res,await publicOpportunity.listInquiries(identity.sub,{type:query(req.url).get("type"),status:query(req.url).get("status")}),requestId); }
    if(req.method==="PATCH" && parts.length===4 && p.startsWith("api/v1/opportunity-inquiries/")) { const identity=await auth(req); const b=await body(req); return ok(res,await publicOpportunity.decideInquiry(parts[3],identity.sub,b,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/me/application-tracking") { const q=query(req.url); return ok(res,await applicationTracking.getApplicationTracking(identity.sub,{limit:q.get("limit")||undefined,offset:q.get("offset")||undefined,reference:q.get("reference")||undefined}),requestId); }
    if(req.method==="GET" && p==="api/v1/me") return ok(res,await membership.getMe(identity.sub),requestId);
    if(req.method==="PATCH" && p==="api/v1/me/profile") return ok(res,await membership.updateProfile(identity.sub,await body(req),requestId),requestId);
    if(req.method==="GET" && p==="api/v1/membership/history") return ok(res,await membership.history(identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/membership/applications/me") return ok(res,await membership.listMyApplications(identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/notifications/preferences") return ok(res,await membership.notificationPreferences(identity.sub),requestId);
    if(req.method==="PATCH" && p==="api/v1/notifications/preferences") return ok(res,await membership.notificationPreferences(identity.sub,await body(req)),requestId);
    if(req.method==="POST" && p==="api/v1/membership/applications") {
      requireRole(identity,"member"); return ok(res,await membership.createApplication(identity.sub,await body(req),requestId),requestId,201);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/membership/applications/") && parts[5]==="review") {
      anyRole(identity,["reviewer","finance_officer","system_admin"]); return ok(res,await membership.reviewApplication(parts[4],identity.sub,await body(req),requestId),requestId);
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
      anyRole(identity,["reviewer","finance_officer","system_admin"]); return ok(res,await membership.activateApplication(parts[4],identity.sub,requestId),requestId);
    }
    if(req.method==="POST" && p==="api/v1/membership/renew") {
      requireRole(identity,"member"); const b=await body(req); return ok(res,await membership.renew(identity.sub,b.productCode,requestId),requestId,201);
    }
    if(req.method==="POST" && parts.length===5 && parts[0]==="api" && parts[1]==="v1" && parts[2]==="payments" && parts[4]==="verify") {
      anyRole(identity,["reviewer","finance_officer","system_admin"]); return ok(res,await membership.verifyPayment(parts[3],identity.sub,await body(req),requestId),requestId);
    }
    if(req.method==="GET" && p==="api/v1/review/membership/applications") {
      anyRole(identity,["reviewer","finance_officer","system_admin"]); return ok(res,await membership.listApplicationsForReview(),requestId);
    }

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
server.listen(config.port,config.host,async()=>{ try { await bootstrapAdmin(); logger.info("server.started",{host:config.host,port:config.port,environment:config.nodeEnv,bootstrapAdmin:Boolean(config.bootstrapAdminEmail)}); } catch(error){ logger.error("bootstrap.admin.failed",{error:error.message}); if(config.nodeEnv==="production") process.exitCode=1; } });
export { server };

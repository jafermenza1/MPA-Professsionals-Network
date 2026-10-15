import { createHash, randomBytes } from "node:crypto";
import { getPool, withTransaction } from "./db.js";

function error(status,message,code="BUSINESS_RULE"){ const e=new Error(message); e.statusCode=status; e.code=code; return e; }
function hashToken(token){ return createHash("sha256").update(token).digest("hex"); }
function refCode(type){ return `MPA-${type==="job"?"JOB":"MEN"}-${randomBytes(5).toString("hex").toUpperCase()}`; }
function clean(v,max=4000){ return v===undefined||v===null?null:String(v).trim().slice(0,max); }
async function audit(db,actor,action,type,id,requestId,metadata={}){ await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,$3,$4,$5,'success',$6)",[actor,action,type,id,requestId,metadata]); }
async function notify(db,userId,eventCode,type,id,payload={}){if(!userId)return;await db.query("insert into notification_event(user_id,event_code,resource_type,resource_id,payload) values($1,$2,$3,$4,$5)",[userId,eventCode,type,id,payload]);}
async function hasRole(db,userId,roles){ const r=(await db.query("select 1 from app_user_role ur join app_role ar on ar.id=ur.role_id where ur.user_id=$1 and ar.role_code=any($2::text[]) limit 1",[userId,roles])).rows[0]; return Boolean(r); }
async function orgAuthorized(db,jobId,userId){
 const r=(await db.query("select 1 from job j join organization_membership om on om.organization_id=j.organization_id where j.id=$1 and om.user_id=$2 and om.status='active' and om.role_code in ('owner','administrator','recruiter','project_manager')",[jobId,userId])).rows[0];
 return Boolean(r);
}
async function mentorAuthorized(db,mentorUserId,userId){
 if(await hasRole(db,userId,["system_admin","admin","supporting_staff"])) return true;
 return mentorUserId===userId;
}

export async function createPublicInquiry(input,requestId,identity=null){
 return withTransaction(async db=>{
  const type=input.inquiryType==="mentorship"?"mentorship":"job";
  if(!input.contactName) throw error(400,"contactName is required.","VALIDATION_ERROR");
  if(!input.contactEmail&&!input.contactPhone) throw error(400,"Provide an email address or phone number.","VALIDATION_ERROR");
  if(input.consent!==true) throw error(400,"Consent is required before submitting an inquiry.","CONSENT_REQUIRED");
  let job=null;
  if(type==="job" && input.jobId){
    job=(await db.query("select id,title,status,posting_scope,organization_id from job where id=$1",[input.jobId])).rows[0];
    if(!job) throw error(404,"Job not found.","NOT_FOUND");
    if(job.status!=="published" || job.posting_scope!=="public") throw error(409,"This vacancy is not accepting public inquiries.","JOB_NOT_PUBLIC");
  }
  let mentor=null;
  if(type==="mentorship" && input.preferredMentorUserId){
    mentor=(await db.query("select mp.user_id from mentor_profile mp where mp.user_id=$1 and mp.status='active' and mp.visibility='public'",[input.preferredMentorUserId])).rows[0];
    if(!mentor) throw error(404,"The selected mentor is not available for public requests.","MENTOR_NOT_PUBLIC");
  }
  const token=randomBytes(24).toString("base64url");
  const initialDetails={
   targetRole:clean(input.targetRole,500),
   skills:Array.isArray(input.skills)?input.skills.map(x=>clean(x,120)).filter(Boolean).slice(0,30):[],
   experience:clean(input.experience,3000),
   location:clean(input.location,300),
   workMode:clean(input.workMode,100),
   availability:clean(input.availability,500),
   professionalSummary:clean(input.professionalSummary,3000)
  };
  const row=(await db.query("insert into public_opportunity_inquiry(inquiry_type,job_id,preferred_mentor_user_id,public_reference,continuation_token_hash,contact_name,contact_email,contact_phone,intent,consent,app_user_id,details) values($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,$11) returning id,public_reference,inquiry_type,status,created_at",[type,job?.id||null,mentor?.user_id||null,refCode(type),hashToken(token),clean(input.contactName,200),clean(input.contactEmail,320),clean(input.contactPhone,80),clean(input.intent,2000)||"I would like to explore this opportunity.",identity?.sub||null,JSON.stringify(initialDetails)])).rows[0];
  await audit(db,identity?.sub||null,"public_opportunity.inquiry_received","public_opportunity_inquiry",row.id,requestId,{inquiryType:type,jobId:job?.id||null});
  return {...row,continuationToken:token,nextStep:"Use the secure continuation link to provide detailed information, or create/sign in to an MPA account for the formal application workflow."};
 });
}

async function getByToken(db,reference,token){
 const r=(await db.query("select i.*,j.title job_title,j.organization_id,mp.user_id mentor_user_id from public_opportunity_inquiry i left join job j on j.id=i.job_id left join mentor_profile mp on mp.user_id=i.preferred_mentor_user_id where i.public_reference=$1 and i.continuation_token_hash=$2",[reference,hashToken(token)])).rows[0];
 if(!r) throw error(404,"Inquiry reference or continuation token is invalid.","NOT_FOUND");
 return r;
}

export async function getPublicInquiry(reference,token){
 const db=getPool(); const r=await getByToken(db,reference,token);
 return {reference:r.public_reference,inquiryType:r.inquiry_type,jobTitle:r.job_title,hasLinkedJob:Boolean(r.job_id),status:r.status,contactName:r.contact_name,contactEmail:r.contact_email,contactPhone:r.contact_phone,intent:r.intent,details:r.details,employerSharingConsent:r.employer_sharing_consent===true,employerSharingScope:r.employer_sharing_scope,employerSharingOrganizationId:r.employer_sharing_organization_id||null,employerSharingFields:Array.isArray(r.employer_sharing_fields)?r.employer_sharing_fields:JSON.parse(r.employer_sharing_fields||"[]"),employerSharingConsentVersion:r.employer_sharing_consent_version||null,employerSharingConsentedAt:r.employer_sharing_consented_at||null,employerSharingRevokedAt:r.employer_sharing_revoked_at||null,nextStep:"Complete the detailed information below. Employer sharing is optional and private by default. You can review or revoke consent at any time."};
}

async function saveInquiryDetails(db,r,input,requestId,actorId=null){
 if(["converted","declined","closed"].includes(r.status)) throw error(409,"This inquiry is no longer accepting additional details.","INQUIRY_CLOSED");
 const details={
  professionalSummary:clean(input.professionalSummary,5000),
  experience:clean(input.experience,8000),
  education:clean(input.education,5000),
  skills:Array.isArray(input.skills)?input.skills.map(x=>clean(x,120)).filter(Boolean).slice(0,30):[],
  availability:clean(input.availability,1000),
  motivation:clean(input.motivation,5000),
  preferredContact:clean(input.preferredContact,100),
  attachmentsNote:clean(input.attachmentsNote,2000)
 };
 const updated=(await db.query("update public_opportunity_inquiry set details=$1,status=case when status='received' then 'considering' else status end,updated_at=now() where id=$2 returning public_reference,status,updated_at,details",[JSON.stringify(details),r.id])).rows[0];
 await audit(db,actorId,"public_opportunity.inquiry_details_completed","public_opportunity_inquiry",r.id,requestId,{});
 return {...updated,nextStep:"Your details are saved. An authorized reviewer can assess the inquiry. You can check status and sharing history from your linked account."};
}
export async function updatePublicInquiryDetails(reference,token,input,requestId){
 return withTransaction(async db=>{const r=await getByToken(db,reference,token);return saveInquiryDetails(db,r,input,requestId,r.app_user_id||null);});
}
export async function listMyLinkedInquiries(userId){
 return (await getPool().query("select i.public_reference reference,i.inquiry_type,status,i.created_at,i.updated_at,i.employer_sharing_consent,i.employer_sharing_organization_id,i.employer_sharing_revoked_at,case when i.status in ('converted','declined','closed') then 'Review the recorded outcome.' when i.employer_sharing_consent=true and i.employer_sharing_revoked_at is null then 'Review sharing history or revoke consent.' else 'Review your saved details or choose whether to share selected fields with one named organization.' end next_action from public_opportunity_inquiry i where i.app_user_id=$1 order by i.updated_at desc limit 100",[userId])).rows;
}
export async function getLinkedInquiryDetails(reference,userId){
 const r=(await getPool().query("select i.*,j.title job_title from public_opportunity_inquiry i left join job j on j.id=i.job_id where i.public_reference=$1 and i.app_user_id=$2",[reference,userId])).rows[0];
 if(!r)throw error(404,"No inquiry linked to this account has that reference.","NOT_FOUND");
 return {reference:r.public_reference,inquiryType:r.inquiry_type,jobTitle:r.job_title,hasLinkedJob:Boolean(r.job_id),status:r.status,contactName:r.contact_name,contactEmail:r.contact_email,contactPhone:r.contact_phone,intent:r.intent,details:r.details,employerSharingConsent:r.employer_sharing_consent===true,employerSharingScope:r.employer_sharing_scope,employerSharingOrganizationId:r.employer_sharing_organization_id||null,employerSharingFields:Array.isArray(r.employer_sharing_fields)?r.employer_sharing_fields:JSON.parse(r.employer_sharing_fields||"[]"),employerSharingConsentedAt:r.employer_sharing_consented_at||null,employerSharingRevokedAt:r.employer_sharing_revoked_at||null,nextStep:"This inquiry is linked to your account. Update your details, review sharing history, or revoke consent from this secure workspace."};
}
export async function updateLinkedInquiryDetails(reference,userId,input,requestId){
 return withTransaction(async db=>{const r=(await db.query("select * from public_opportunity_inquiry where public_reference=$1 and app_user_id=$2 for update",[reference,userId])).rows[0];if(!r)throw error(404,"No inquiry linked to this account has that reference.","NOT_FOUND");return saveInquiryDetails(db,r,input,requestId,userId);});
}
export async function getLinkedSharingHistory(reference,userId){
 const inquiry=(await getPool().query("select id from public_opportunity_inquiry where public_reference=$1 and app_user_id=$2 and inquiry_type='job' and job_id is null",[reference,userId])).rows[0];
 if(!inquiry)throw error(404,"No linked job-seeker demand was found for this account.","NOT_FOUND");
 return (await getPool().query("select s.id share_id,o.display_name,o.legal_name,s.shared_fields,s.shared_at,s.revoked_at,s.revoke_reason from job_seeker_demand_share s join organization o on o.id=s.organization_id where s.inquiry_id=$1 order by s.shared_at desc",[inquiry.id])).rows.map(row=>({shareId:row.share_id,organizationName:row.display_name||row.legal_name,sharedFields:Array.isArray(row.shared_fields)?row.shared_fields:JSON.parse(row.shared_fields||"[]"),sharedAt:row.shared_at,revokedAt:row.revoked_at,revokeReason:row.revoke_reason,status:row.revoked_at?"revoked":"shared"}));
}
async function visibleInquiries(db,userId,filters={}){
 const admin=await hasRole(db,userId,["system_admin","admin","supporting_staff"]);
 if(!admin){
   const scope=(await db.query("select exists(select 1 from organization_membership om where om.user_id=$1 and om.status='active' and om.role_code in ('owner','administrator','recruiter','project_manager','read_only')) or exists(select 1 from mentor_profile mp where mp.user_id=$1)",[userId])).rows[0];
   if(!scope||!scope.exists) throw error(403,"An active organization role or mentor profile is required to inspect opportunity inquiries.","FORBIDDEN");
 }
 const params=admin?[]:[userId]; const clauses=[];
 if(admin){ clauses.push("true"); }
 else {
   clauses.push("(i.inquiry_type='job' and exists (select 1 from job j join organization_membership om on om.organization_id=j.organization_id where j.id=i.job_id and om.user_id=$1 and om.status='active' and om.role_code in ('owner','administrator','recruiter','project_manager','read_only')) or i.inquiry_type='mentorship' and (i.preferred_mentor_user_id=$1))");
 }
 if(filters.type){ params.push(filters.type); clauses.push("i.inquiry_type=$"+params.length); }
 if(filters.status){ params.push(filters.status); clauses.push("i.status=$"+params.length); }
 const sql="select i.id,i.job_id,i.public_reference,i.inquiry_type,i.status,i.consider_non_member,i.contact_name,i.contact_email,i.contact_phone,i.intent,i.details,i.employer_sharing_consent,i.employer_sharing_scope,i.employer_sharing_fields,i.employer_sharing_consented_at,i.employer_sharing_revoked_at,i.created_at,i.updated_at,j.title job_title,j.organization_id,p.display_name preferred_mentor_name from public_opportunity_inquiry i left join job j on j.id=i.job_id left join person p on p.user_id=i.preferred_mentor_user_id where "+clauses.join(" and ")+" order by i.created_at desc limit 200";
 return (await db.query(sql,params)).rows;
}

export async function listInquiries(userId,filters={}){
 const db=getPool(); return visibleInquiries(db,userId,filters);
}
export async function listShareableOrganizations(userId){
 const db=getPool(); await requireSupportDesk(db,userId);
 return (await db.query("select id,display_name,legal_name from organization where verification_status='verified' and public_visible=true order by coalesce(display_name,legal_name),id")).rows;
}
export async function listPublicSharingOrganizations(){
 return (await getPool().query("select id,display_name,legal_name from organization where verification_status='verified' and public_visible=true order by coalesce(display_name,legal_name),id limit 200")).rows;
}

export async function decideInquiry(inquiryId,userId,input,requestId){
 return withTransaction(async db=>{
  const r=(await db.query("select i.*,j.organization_id from public_opportunity_inquiry i left join job j on j.id=i.job_id where i.id=$1 for update of i",[inquiryId])).rows[0];
  if(!r) throw error(404,"Inquiry not found.","NOT_FOUND");
  const admin=await hasRole(db,userId,["system_admin","admin","supporting_staff"]);
  const allowed=r.inquiry_type==="job" ? await orgAuthorized(db,r.job_id,userId) : await mentorAuthorized(db,r.preferred_mentor_user_id,userId);
  if(!admin&&!allowed) throw error(403,"You are not authorized to review this inquiry.","FORBIDDEN");
  const status=input.status||r.status;
  const valid=["received","contacted","considering","invited","converted","declined","closed"];
  if(!valid.includes(status)) throw error(400,"Invalid inquiry status.","VALIDATION_ERROR");
  const consider=input.considerNonMember===undefined?r.consider_non_member:Boolean(input.considerNonMember);
  const note=clean(input.note,4000);
  const row=(await db.query("update public_opportunity_inquiry set status=$1,consider_non_member=$2,decision_note=$3,decided_by=$4,decided_at=now(),updated_at=now() where id=$5 returning *",[status,consider,note,userId,inquiryId])).rows[0];
  await audit(db,userId,"public_opportunity.inquiry_decision","public_opportunity_inquiry",inquiryId,requestId,{status,considerNonMember:consider});
  return row;
 });
}


const EMPLOYER_SHARE_FIELDS=new Set(["targetRole","skills","experience","location","workMode","availability","professionalSummary","education","intent","contactName","contactEmail","contactPhone"]);
async function requireSupportDesk(db,userId){
 if(!(await hasRole(db,userId,["system_admin","admin","supporting_staff"]))) throw error(403,"Only the MPA Support Desk may share job-seeker demand with an employer.","FORBIDDEN");
}
export async function getSharingHistory(reference,token){
 const db=getPool();
 const inquiry=await getByToken(db,reference,token);
 if(inquiry.inquiry_type!=="job"||inquiry.job_id) throw error(400,"Sharing history applies only to job-seeker demand without a linked vacancy.","NOT_JOB_SEEKER_DEMAND");
 return (await db.query("select s.id,o.display_name,o.legal_name,s.shared_fields,s.shared_at,s.revoked_at,s.revoke_reason from job_seeker_demand_share s join organization o on o.id=s.organization_id where s.inquiry_id=$1 order by s.shared_at desc",[inquiry.id])).rows.map(row=>({shareId:row.id,organizationName:row.display_name||row.legal_name,sharedFields:Array.isArray(row.shared_fields)?row.shared_fields:JSON.parse(row.shared_fields||"[]"),sharedAt:row.shared_at,revokedAt:row.revoked_at,revokeReason:row.revoke_reason,status:row.revoked_at?"revoked":"shared"}));
}
async function saveSharingConsentForInquiry(db,r,input,requestId,actorId=null){
 if(r.inquiry_type!=="job"||r.job_id) throw error(400,"Employer-sharing consent applies only to job-seeker demand without a linked vacancy.","NOT_JOB_SEEKER_DEMAND");
 const consent=input.employerSharingConsent===true;
 const scope=consent?String(input.scope||""):"support_desk_only";
 const fields=consent&&Array.isArray(input.fields)?[...new Set(input.fields.map(String))]:[];
 const organizationId=consent?String(input.organizationId||"").trim():null;
 if(consent&&scope!=="named_employer") throw error(400,"Consent must identify a specific employer; broad employer sharing is not supported.","INVALID_CONSENT_SCOPE");
 if(consent&&!organizationId) throw error(400,"Choose the named organization before giving employer-sharing consent.","SHARING_AUDIENCE_REQUIRED");
 if(fields.some(field=>!EMPLOYER_SHARE_FIELDS.has(field))) throw error(400,"One or more selected sharing fields are not allowed.","INVALID_SHARING_FIELD");
 if(consent&&!fields.length) throw error(400,"Select at least one field to share before giving employer-sharing consent.","SHARING_FIELDS_REQUIRED");
 if(consent){const org=(await db.query("select id from organization where id=$1 and verification_status='verified' and public_visible=true",[organizationId])).rows[0];if(!org)throw error(400,"Choose an available verified organization from the list.","SHARING_AUDIENCE_INVALID");}
 const row=(await db.query("update public_opportunity_inquiry set employer_sharing_consent=$1,employer_sharing_scope=$2,employer_sharing_organization_id=case when $1 then $3::uuid else employer_sharing_organization_id end,employer_sharing_fields=$4::jsonb,employer_sharing_consent_version=case when $1 then 'job-seeker-sharing-v2' else employer_sharing_consent_version end,employer_sharing_consented_at=case when $1 then now() else employer_sharing_consented_at end,employer_sharing_revoked_at=case when $1 then null else now() end,updated_at=now() where id=$5 returning id,public_reference,employer_sharing_consent,employer_sharing_scope,employer_sharing_organization_id,employer_sharing_fields,employer_sharing_consent_version,employer_sharing_consented_at,employer_sharing_revoked_at",[consent,scope,organizationId,JSON.stringify(fields),r.id])).rows[0];
 const oldFields=Array.isArray(r.employer_sharing_fields)?r.employer_sharing_fields:JSON.parse(r.employer_sharing_fields||"[]");
 const consentChanged=!consent||r.employer_sharing_consent!==true||String(r.employer_sharing_organization_id||"")!==String(organizationId||"")||JSON.stringify([...oldFields].sort())!==JSON.stringify([...fields].sort());
 if(consentChanged) await db.query("update job_seeker_demand_share set revoked_at=coalesce(revoked_at,now()),revoke_reason=$1,updated_at=now() where inquiry_id=$2 and revoked_at is null",[consent?"applicant_updated_consent":"applicant_revoked_consent",r.id]);
 await audit(db,actorId||r.app_user_id||null,consent?"job_seeker_demand.sharing_consent_granted":"job_seeker_demand.sharing_consent_revoked","public_opportunity_inquiry",r.id,requestId,{scope,organizationId,fields,priorOrganizationId:r.employer_sharing_organization_id||null,priorFields:oldFields});
 if(r.app_user_id)await notify(db,r.app_user_id,consent?"job_seeker.sharing_consent_granted":"job_seeker.sharing_consent_revoked","public_opportunity_inquiry",r.id,{organizationId,message:consent?"You consented to share selected information with one named organization.":"Your sharing consent was revoked; future employer access is blocked.",nextAction:consent?"Review your sharing history and revoke consent if your preference changes.":"Your request remains private. Grant new consent only if you want to share again."});
 return {...row,nextStep:consent?"Your selected fields may be shared only with the named organization after MPA Support Desk review. You can revoke this consent at any time.":"Your request is private to you and MPA Support Desk. Existing employer access has been revoked."};
}
export async function updateSharingConsent(reference,token,input,requestId){
 return withTransaction(async db=>{const r=await getByToken(db,reference,token);return saveSharingConsentForInquiry(db,r,input,requestId,r.app_user_id||null);});
}
export async function updateLinkedSharingConsent(reference,userId,input,requestId){
 return withTransaction(async db=>{const r=(await db.query("select * from public_opportunity_inquiry where public_reference=$1 and app_user_id=$2 for update",[reference,userId])).rows[0];if(!r)throw error(404,"No inquiry linked to this account has that reference.","NOT_FOUND");return saveSharingConsentForInquiry(db,r,input,requestId,userId);});
}
export async function shareJobSeekerDemand(inquiryId,actorId,input,requestId){
 return withTransaction(async db=>{
  await requireSupportDesk(db,actorId);
  const inquiry=(await db.query("select * from public_opportunity_inquiry where id=$1 for update",[inquiryId])).rows[0];
  if(!inquiry) throw error(404,"Job-seeker demand was not found.","NOT_FOUND");
  if(inquiry.inquiry_type!=="job"||inquiry.job_id) throw error(400,"Only job-seeker demand without a linked vacancy can be shared through this workflow.","NOT_JOB_SEEKER_DEMAND");
  if(inquiry.employer_sharing_consent!==true||inquiry.employer_sharing_scope!=="named_employer"||inquiry.employer_sharing_revoked_at) throw error(403,"The applicant has not granted current named-employer sharing consent.","CONSENT_REQUIRED");
  const organizationId=String(input.organizationId||"").trim();
  if(!organizationId) throw error(400,"organizationId is required.","VALIDATION_ERROR");
  if(!inquiry.employer_sharing_organization_id||organizationId!==inquiry.employer_sharing_organization_id) throw error(403,"The applicant consented to a different named organization. Ask them to update their consent before sharing elsewhere.","CONSENT_AUDIENCE_MISMATCH");
  const consented=Array.isArray(inquiry.employer_sharing_fields)?inquiry.employer_sharing_fields:JSON.parse(inquiry.employer_sharing_fields||"[]");
  const requested=Array.isArray(input.fields)?[...new Set(input.fields.map(String))]:consented;
  if(!requested.length||requested.some(field=>!EMPLOYER_SHARE_FIELDS.has(field)||!consented.includes(field))) throw error(403,"The selected share fields exceed or do not match the applicant's consent.","CONSENT_FIELD_MISMATCH");
  const organization=(await db.query("select id,verification_status,public_visible from organization where id=$1",[organizationId])).rows[0];
  if(!organization||organization.verification_status!=="verified"||organization.public_visible!==true) throw error(403,"Demand can only be shared with a verified, visible organization.","ORGANIZATION_NOT_ELIGIBLE");
  const share=(await db.query("insert into job_seeker_demand_share(inquiry_id,organization_id,shared_by,shared_fields,shared_at,revoked_at,revoke_reason,updated_at) values($1,$2,$3,$4::jsonb,now(),null,null,now()) on conflict(inquiry_id,organization_id) do update set shared_by=excluded.shared_by,shared_fields=excluded.shared_fields,shared_at=now(),revoked_at=null,revoke_reason=null,updated_at=now() returning id,inquiry_id,organization_id,shared_fields,shared_at,revoked_at",[inquiry.id,organizationId,actorId,JSON.stringify(requested)])).rows[0];
  await audit(db,actorId,"job_seeker_demand.shared_with_employer","job_seeker_demand_share",share.id,requestId,{inquiryId:inquiry.id,organizationId,fields:requested});
  if(inquiry.app_user_id)await notify(db,inquiry.app_user_id,"job_seeker.shared_with_named_employer","public_opportunity_inquiry",inquiry.id,{organizationId,fields:requested,sharedAt:share.shared_at,message:"The Support Desk shared the fields you selected with your named organization.",nextAction:"Review your sharing history. You can revoke consent at any time."});
  return {id:share.id,reference:inquiry.public_reference,organizationId,sharedFields:requested,sharedAt:share.shared_at,status:"shared",nextAction:"The organization can view only the fields you consented to share while consent remains active."};
 });
}
export async function listSharedJobSeekerDemands(organizationId,userId){
 const db=getPool();
 const membership=(await db.query("select 1 from organization_membership where organization_id=$1 and user_id=$2 and status='active' and role_code in ('owner','administrator','recruiter','project_manager') limit 1",[organizationId,userId])).rows[0];
 if(!membership) throw error(403,"An authorized active organization role is required to view shared job-seeker demand.","FORBIDDEN");
 const rows=(await db.query("select i.id,i.public_reference,i.status,i.intent,i.details,i.contact_name,i.contact_email,i.contact_phone,i.employer_sharing_fields,s.shared_fields,s.shared_at from job_seeker_demand_share s join public_opportunity_inquiry i on i.id=s.inquiry_id join organization o on o.id=s.organization_id where s.organization_id=$1 and s.organization_id=i.employer_sharing_organization_id and s.shared_fields <@ i.employer_sharing_fields and s.revoked_at is null and i.employer_sharing_consent=true and i.employer_sharing_scope='named_employer' and i.employer_sharing_revoked_at is null and o.verification_status='verified' and o.public_visible=true order by s.shared_at desc",[organizationId])).rows;
 return rows.map(row=>{
  const fields=Array.isArray(row.shared_fields)?row.shared_fields:JSON.parse(row.shared_fields||"[]");
  const details=typeof row.details==="string"?JSON.parse(row.details||"{}"):(row.details||{});
  const result={reference:row.public_reference,status:row.status,sharedAt:row.shared_at};
  for(const field of fields){
   if(field==="intent") result.intent=row.intent;
   else if(field==="contactName") result.contactName=row.contact_name;
   else if(field==="contactEmail") result.contactEmail=row.contact_email;
   else if(field==="contactPhone") result.contactPhone=row.contact_phone;
   else if(Object.hasOwn(details,field)) result[field]=details[field];
  }
  return result;
 });
}

export async function linkInquiryToAccount(reference,token,userId,requestId){
 return withTransaction(async db=>{
  const r=await getByToken(db,reference,token);
  if(r.app_user_id && r.app_user_id!==userId) throw error(409,"This inquiry is already linked to another account.","ALREADY_LINKED");
  const row=(await db.query("update public_opportunity_inquiry set app_user_id=$1,updated_at=now() where id=$2 returning *",[userId,r.id])).rows[0];
  await audit(db,userId,"public_opportunity.inquiry_linked","public_opportunity_inquiry",r.id,requestId,{});
  return row;
 });
}

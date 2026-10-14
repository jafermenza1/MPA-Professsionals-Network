import { createHash, randomBytes } from "node:crypto";
import { getPool, withTransaction } from "./db.js";

function error(status,message,code="BUSINESS_RULE"){ const e=new Error(message); e.statusCode=status; e.code=code; return e; }
function hashToken(token){ return createHash("sha256").update(token).digest("hex"); }
function refCode(type){ return `MPA-${type==="job"?"JOB":"MEN"}-${randomBytes(5).toString("hex").toUpperCase()}`; }
function clean(v,max=4000){ return v===undefined||v===null?null:String(v).trim().slice(0,max); }
async function audit(db,actor,action,type,id,requestId,metadata={}){ await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,$3,$4,$5,'success',$6)",[actor,action,type,id,requestId,metadata]); }
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
 return {reference:r.public_reference,inquiryType:r.inquiry_type,jobTitle:r.job_title,status:r.status,contactName:r.contact_name,contactEmail:r.contact_email,contactPhone:r.contact_phone,intent:r.intent,details:r.details,nextStep:"Complete the detailed information below. A formal job application or mentorship request may still require an MPA account, verification or human review."};
}

export async function updatePublicInquiryDetails(reference,token,input,requestId){
 return withTransaction(async db=>{
  const r=await getByToken(db,reference,token);
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
  const updated=(await db.query("update public_opportunity_inquiry set details=$1,status=case when status='received' then 'considering' else status end,updated_at=now() where id=$2 returning public_reference,status,updated_at",[JSON.stringify(details),r.id])).rows[0];
  await audit(db,null,"public_opportunity.inquiry_details_completed","public_opportunity_inquiry",r.id,requestId,{});
  return {...updated,nextStep:"An authorized reviewer can now assess the inquiry. If the applicant is not an active member, the reviewer must explicitly choose whether to consider the application outside the member-only pathway."};
 });
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
export async function updateSharingConsent(reference,token,input,requestId){
 return withTransaction(async db=>{
  const r=await getByToken(db,reference,token);
  if(r.inquiry_type!=="job"||r.job_id) throw error(400,"Employer-sharing consent applies only to a job-seeker demand without a linked vacancy.","NOT_JOB_SEEKER_DEMAND");
  const consent=input.employerSharingConsent===true;
  const scope=consent?String(input.scope||""):"support_desk_only";
  const fields=consent&&Array.isArray(input.fields)?[...new Set(input.fields.map(String))]:[];
  if(consent&&scope!=="named_employer") throw error(400,"Consent must identify the named-employer audience; broad employer sharing is not supported.","INVALID_CONSENT_SCOPE");
  if(fields.some(field=>!EMPLOYER_SHARE_FIELDS.has(field))) throw error(400,"One or more selected sharing fields are not allowed.","INVALID_SHARING_FIELD");
  if(consent&&!fields.length) throw error(400,"Select at least one field to share before giving employer-sharing consent.","SHARING_FIELDS_REQUIRED");
  const row=(await db.query("update public_opportunity_inquiry set employer_sharing_consent=$1,employer_sharing_scope=$2,employer_sharing_fields=$3::jsonb,employer_sharing_consented_at=case when $1 then now() else employer_sharing_consented_at end,employer_sharing_revoked_at=case when $1 then null else now() end,updated_at=now() where id=$4 returning id,public_reference,employer_sharing_consent,employer_sharing_scope,employer_sharing_fields,employer_sharing_consented_at,employer_sharing_revoked_at",[consent,scope,JSON.stringify(fields),r.id])).rows[0];
  if(!consent) await db.query("update job_seeker_demand_share set revoked_at=coalesce(revoked_at,now()),revoke_reason='applicant_revoked_consent',updated_at=now() where inquiry_id=$1 and revoked_at is null",[r.id]);
  await audit(db,r.app_user_id||null,consent?"job_seeker_demand.sharing_consent_granted":"job_seeker_demand.sharing_consent_revoked","public_opportunity_inquiry",r.id,requestId,{scope,fields});
  return {...row,nextStep:consent?"Your selected information may be shared only with a named employer after MPA Support Desk review. You can revoke this consent at any time.":"Your request is private to you and MPA Support Desk. Existing employer access has been revoked."};
 });
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
  const organization=(await db.query("select id,verification_status,public_visible from organization where id=$1",[organizationId])).rows[0];
  if(!organization||organization.verification_status!=="verified"||organization.public_visible!==true) throw error(403,"Demand can only be shared with a verified, visible organization.","ORGANIZATION_NOT_ELIGIBLE");
  const consented=Array.isArray(inquiry.employer_sharing_fields)?inquiry.employer_sharing_fields:JSON.parse(inquiry.employer_sharing_fields||"[]");
  const requested=Array.isArray(input.fields)?[...new Set(input.fields.map(String))]:consented;
  if(!requested.length||requested.some(field=>!EMPLOYER_SHARE_FIELDS.has(field)||!consented.includes(field))) throw error(403,"The selected share fields exceed or do not match the applicant's consent.","CONSENT_FIELD_MISMATCH");
  const share=(await db.query("insert into job_seeker_demand_share(inquiry_id,organization_id,shared_by,shared_fields,shared_at,revoked_at,revoke_reason,updated_at) values($1,$2,$3,$4::jsonb,now(),null,null,now()) on conflict(inquiry_id,organization_id) do update set shared_by=excluded.shared_by,shared_fields=excluded.shared_fields,shared_at=now(),revoked_at=null,revoke_reason=null,updated_at=now() returning id,inquiry_id,organization_id,shared_fields,shared_at,revoked_at",[inquiry.id,organizationId,actorId,JSON.stringify(requested)])).rows[0];
  await audit(db,actorId,"job_seeker_demand.shared_with_employer","job_seeker_demand_share",share.id,requestId,{inquiryId:inquiry.id,organizationId,fields:requested});
  return {id:share.id,reference:inquiry.public_reference,organizationId,sharedFields:requested,sharedAt:share.shared_at,status:"shared"};
 });
}
export async function listSharedJobSeekerDemands(organizationId,userId){
 const db=getPool();
 const membership=(await db.query("select 1 from organization_membership where organization_id=$1 and user_id=$2 and status='active' and role_code in ('owner','administrator','recruiter','project_manager') limit 1",[organizationId,userId])).rows[0];
 if(!membership) throw error(403,"An authorized active organization role is required to view shared job-seeker demand.","FORBIDDEN");
 const rows=(await db.query("select i.id,i.public_reference,i.status,i.intent,i.details,i.contact_name,i.contact_email,i.contact_phone,i.employer_sharing_fields,s.shared_fields,s.shared_at from job_seeker_demand_share s join public_opportunity_inquiry i on i.id=s.inquiry_id join organization o on o.id=s.organization_id where s.organization_id=$1 and s.revoked_at is null and i.employer_sharing_consent=true and i.employer_sharing_scope='named_employer' and i.employer_sharing_revoked_at is null and o.verification_status='verified' and o.public_visible=true order by s.shared_at desc",[organizationId])).rows;
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

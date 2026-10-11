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
  const row=(await db.query("insert into public_opportunity_inquiry(inquiry_type,job_id,preferred_mentor_user_id,public_reference,continuation_token_hash,contact_name,contact_email,contact_phone,intent,consent,app_user_id,details) values($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,$11) returning id,public_reference,inquiry_type,status,created_at",[type,job?.id||null,mentor?.user_id||null,refCode(type),hashToken(token),clean(input.contactName,200),clean(input.contactEmail,320),clean(input.contactPhone,80),clean(input.intent,2000)||"I would like to explore this opportunity.",identity?.sub||null,JSON.stringify({})])).rows[0];
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
 const sql="select i.id,i.public_reference,i.inquiry_type,i.status,i.consider_non_member,i.contact_name,i.contact_email,i.contact_phone,i.intent,i.details,i.created_at,i.updated_at,j.title job_title,j.organization_id,p.display_name preferred_mentor_name from public_opportunity_inquiry i left join job j on j.id=i.job_id left join person p on p.user_id=i.preferred_mentor_user_id where "+clauses.join(" and ")+" order by i.created_at desc limit 200";
 return (await db.query(sql,params)).rows;
}

export async function listInquiries(userId,filters={}){
 const db=getPool(); return visibleInquiries(db,userId,filters);
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

export async function linkInquiryToAccount(reference,token,userId,requestId){
 return withTransaction(async db=>{
  const r=await getByToken(db,reference,token);
  if(r.app_user_id && r.app_user_id!==userId) throw error(409,"This inquiry is already linked to another account.","ALREADY_LINKED");
  const row=(await db.query("update public_opportunity_inquiry set app_user_id=$1,updated_at=now() where id=$2 returning *",[userId,r.id])).rows[0];
  await audit(db,userId,"public_opportunity.inquiry_linked","public_opportunity_inquiry",r.id,requestId,{});
  return row;
 });
}

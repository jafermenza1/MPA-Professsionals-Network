import { getPool, withTransaction } from "../platform/db.js";
import { assertOrganizationCapability } from "../platform/identity-policy.js";

function fail(status,message,code="BUSINESS_RULE"){return Object.assign(new Error(message),{statusCode:status,code});}
const TEAM_ROLES=["owner","administrator","project_manager"];
const ACTIVE_MEMBER_SQL="exists(select 1 from membership_record m where m.user_id=$1 and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date))";
const clean=(value,max=5000)=>String(value??"").trim().slice(0,max);
function values(input){return Array.isArray(input)?input.map(v=>clean(v,120)).filter(Boolean).slice(0,40):String(input??"").split(",").map(v=>clean(v,120)).filter(Boolean).slice(0,40);}
async function audit(db,actor,action,type,id,requestId,metadata={}){await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,$3,$4,$5,'success',$6)",[actor,action,type,id,requestId,metadata]);}
async function notify(db,userId,eventCode,type,id,payload={}){if(!userId)return;await db.query("insert into notification_event(user_id,event_code,resource_type,resource_id,payload) values($1,$2,$3,$4,$5)",[userId,eventCode,type,id,payload]);}
async function organizationAccess(db,organizationId,userId,{requireVerified=true}={}){
 let row;
 try { row=await assertOrganizationCapability(db,organizationId,userId,TEAM_ROLES); }
 catch(cause) { throw fail(cause.statusCode||403,cause.message||"An active organization owner or administrator is required for this mentorship offer.",cause.code||"ORGANIZATION_FORBIDDEN"); }
 if(requireVerified&&row.verification_status!=="verified")throw fail(409,"Verify the organization before submitting a mentorship offer for publication.","ORGANIZATION_NOT_VERIFIED");
 return row;
}
async function offerAccess(db,offerId,userId,options){
 const row=(await db.query("select * from organization_mentorship_offer where id=$1 for update",[offerId])).rows[0];
 if(!row)throw fail(404,"Organization mentorship offer was not found.","NOT_FOUND");
 await organizationAccess(db,row.organization_id,userId,options);
 return row;
}
export async function createOrganizationMentorshipOffer(userId,input,requestId){
 return withTransaction(async db=>{
  const orgId=clean(input.organizationId,80);
  if(!orgId)throw fail(400,"Choose the organization that will provide this mentorship program.","VALIDATION_ERROR");
  await organizationAccess(db,orgId,userId);
  const title=clean(input.title,180),description=clean(input.description,5000),deliveryMode=input.deliveryMode||"flexible",visibility=input.visibility||"public";
  if(title.length<4||description.length<10)throw fail(400,"Add a clear title and at least a short explanation of the mentorship program.","VALIDATION_ERROR");
  if(!["remote","onsite","hybrid","flexible"].includes(deliveryMode)||!["public","members"].includes(visibility))throw fail(400,"Choose a supported delivery mode and visibility.","VALIDATION_ERROR");
  const row=(await db.query("insert into organization_mentorship_offer(organization_id,created_by,title,description,expertise,languages,delivery_mode,visibility) values($1,$2,$3,$4,$5,$6,$7,$8) returning *",[orgId,userId,title,description,JSON.stringify(values(input.expertise)),JSON.stringify(values(input.languages)),deliveryMode,visibility])).rows[0];
  await audit(db,userId,"organization.mentorship_offer_created","organization_mentorship_offer",row.id,requestId,{organizationId:orgId});
  return row;
 });
}
export async function updateOrganizationMentorshipOffer(offerId,userId,input,requestId){
 return withTransaction(async db=>{
  const old=await offerAccess(db,offerId,userId);
  if(old.status==="closed")throw fail(409,"Closed mentorship offers cannot be edited or reopened.","INVALID_STATE");
  const updated=(await db.query("update organization_mentorship_offer set status='draft',moderation_status='pending',moderation_note=null,moderated_by=null,moderated_at=null,title=coalesce($1,title),description=coalesce($2,description),expertise=coalesce($3,expertise),languages=coalesce($4,languages),delivery_mode=coalesce($5,delivery_mode),visibility=coalesce($6,visibility),updated_at=now() where id=$7 returning *",[input.title?clean(input.title,180):null,input.description?clean(input.description,5000):null,input.expertise!==undefined?JSON.stringify(values(input.expertise)):null,input.languages!==undefined?JSON.stringify(values(input.languages)):null,input.deliveryMode||null,input.visibility||null,offerId])).rows[0];
  await audit(db,userId,"organization.mentorship_offer_updated","organization_mentorship_offer",offerId,requestId);
  return updated;
 });
}
export async function changeOrganizationMentorshipOfferStatus(offerId,userId,status,requestId){
 if(!["published","paused","closed"].includes(status))throw fail(400,"Choose publish, pause or close for this offer.","VALIDATION_ERROR");
 return withTransaction(async db=>{
  const old=await offerAccess(db,offerId,userId);
  if(old.status==="closed"&&status!=="closed")throw fail(409,"Closed mentorship offers cannot be reopened.","INVALID_STATE");
  if(status==="published"&&old.moderation_status!=="approved"){
   if(old.moderation_status==="rejected")throw fail(409,"This offer was rejected and cannot be resubmitted. Create a new offer if the program materially changes.","LISTING_REJECTED");
   const submitted=(await db.query("update organization_mentorship_offer set status='draft',moderation_status='pending',moderation_note=null,moderated_by=null,moderated_at=null,updated_at=now() where id=$1 returning *",[offerId])).rows[0];
   await audit(db,userId,"organization.mentorship_offer_submitted","organization_mentorship_offer",offerId,requestId);
   return submitted;
  }
  const updated=(await db.query("update organization_mentorship_offer set status=$1,updated_at=now() where id=$2 returning *",[status,offerId])).rows[0];
  await audit(db,userId,"organization.mentorship_offer_status_changed","organization_mentorship_offer",offerId,requestId,{from:old.status,to:status});
  return updated;
 });
}
export async function listMyOrganizationMentorshipOffers(userId){
 return (await getPool().query("select x.*,o.display_name organization_name,o.verification_status from organization_mentorship_offer x join organization o on o.id=x.organization_id where exists(select 1 from organization_membership om where om.organization_id=x.organization_id and om.user_id=$1 and om.status='active' and om.role_code=any($2::text[])) order by x.updated_at desc",[userId,TEAM_ROLES])).rows;
}
export async function listOrganizationMentorshipOffers(viewerId=null){
 const db=getPool();
 return (await db.query("select x.id,x.organization_id,o.display_name organization_name,x.title,x.description,x.expertise,x.languages,x.delivery_mode,x.visibility,x.created_at from organization_mentorship_offer x join organization o on o.id=x.organization_id where x.status='published' and x.moderation_status='approved' and o.verification_status='verified' and (x.visibility='public' or ($1::uuid is not null and x.visibility='members' and "+ACTIVE_MEMBER_SQL.replaceAll("$1","$2")+")) order by x.created_at desc limit 100",[viewerId||null,viewerId||null])).rows;
}
export async function requestOrganizationMentorship(offerId,requesterId,input,requestId){
 return withTransaction(async db=>{
  const offer=(await db.query("select x.*,o.verification_status from organization_mentorship_offer x join organization o on o.id=x.organization_id where x.id=$1 for update of x",[offerId])).rows[0];
  if(!offer||offer.status!=="published"||offer.moderation_status!=="approved"||offer.verification_status!=="verified")throw fail(404,"This organization mentorship offer is not available.","NOT_FOUND");
  if(offer.visibility==="members"&&!(await db.query("select 1 where "+ACTIVE_MEMBER_SQL,[requesterId])).rowCount)throw fail(403,"An active membership is required to request this member-only mentorship program.","MEMBERSHIP_REQUIRED");
  if((await db.query("select 1 from organization_membership where organization_id=$1 and user_id=$2 and status='active'",[offer.organization_id,requesterId])).rowCount)throw fail(409,"Your organization team already manages this offer.","SELF_REQUEST");
  const message=clean(input.message,3000);
  if(message.length<10)throw fail(400,"Tell the organization what mentorship support you need (at least 10 characters).","VALIDATION_ERROR");
  const prior=(await db.query("select * from organization_mentorship_request where offer_id=$1 and requester_user_id=$2 for update",[offerId,requesterId])).rows[0];
  if(prior&&!["declined","cancelled"].includes(prior.status))return {...prior,idempotent:true,nextAction:prior.status==="requested"?"Wait for the organization team to respond.":prior.status==="accepted"?"Agree the program goals and first session with the organization.":"This request is already resolved; contact the organization if your need has changed."};
  const row=(await db.query("insert into organization_mentorship_request(offer_id,requester_user_id,message) values($1,$2,$3) on conflict(offer_id,requester_user_id) do update set message=excluded.message,status='requested',response_note=null,responded_by=null,responded_at=null,updated_at=now() where organization_mentorship_request.status in ('declined','cancelled') returning *",[offerId,requesterId,message])).rows[0];
  if(!row){const current=(await db.query("select * from organization_mentorship_request where offer_id=$1 and requester_user_id=$2",[offerId,requesterId])).rows[0];return {...current,idempotent:true,nextAction:current?.status==="requested"?"Wait for the organization team to respond.":current?.status==="accepted"?"Agree the program goals and first session with the organization.":"This request is already resolved; contact the organization if your need has changed."};}
  await audit(db,requesterId,"organization.mentorship_requested","organization_mentorship_request",row.id,requestId,{offerId,from:prior?.status||null,to:"requested"});
  const team=(await db.query("select user_id from organization_membership where organization_id=$1 and status='active' and role_code=any($2::text[])",[offer.organization_id,TEAM_ROLES])).rows;
  for(const member of team)await notify(db,member.user_id,"organization.mentorship_request_received","organization_mentorship_request",row.id,{message:"A new mentorship request needs your organization's response.",nextAction:"Review the request and accept or decline with a clear note."});
  return {...row,nextAction:"Your request is recorded. The organization team must respond before a program is confirmed."};
 });
}
export async function listMyOrganizationMentorshipRequests(userId){
 return (await getPool().query("select r.*,x.title offer_title,x.organization_id,o.display_name organization_name,(r.requester_user_id=$1) is_requester from organization_mentorship_request r join organization_mentorship_offer x on x.id=r.offer_id join organization o on o.id=x.organization_id where r.requester_user_id=$1 or exists(select 1 from organization_membership om where om.organization_id=x.organization_id and om.user_id=$1 and om.status='active' and om.role_code=any($2::text[])) order by r.updated_at desc",[userId,TEAM_ROLES])).rows;
}
export async function respondOrganizationMentorshipRequest(requestId,userId,status,note,requestIdHeader){
 if(!["accepted","declined","completed","cancelled"].includes(status))throw fail(400,"Choose accept, decline, complete or cancel for this request.","VALIDATION_ERROR");
 const responseNote=clean(note,2000);
 if(["declined","completed","cancelled"].includes(status)&&responseNote.length<4)throw fail(400,status==="declined"?"Explain why the request is being declined.":status==="completed"?"Record the outcome before marking the mentorship request complete.":"Add a short cancellation reason.",status==="declined"?"RESPONSE_NOTE_REQUIRED":"OUTCOME_NOTE_REQUIRED");
 return withTransaction(async db=>{
  const row=(await db.query("select r.*,x.organization_id from organization_mentorship_request r join organization_mentorship_offer x on x.id=r.offer_id where r.id=$1 for update of r",[requestId])).rows[0];
  if(!row)throw fail(404,"Organization mentorship request was not found.","NOT_FOUND");
  const requesterAction=status==="cancelled"&&row.requester_user_id===userId;
  if(status==="cancelled"&&!requesterAction)throw fail(403,"Only the requester can cancel this organization mentorship request.","FORBIDDEN");
  if(!requesterAction)await organizationAccess(db,row.organization_id,userId);
  if(status==="completed"&&row.status!=="accepted")throw fail(409,"Only an accepted mentorship request can be marked completed.","INVALID_STATE");
  if(["accepted","declined"].includes(status)&&row.status!=="requested")throw fail(409,"This request has already been answered.","INVALID_STATE");
  if(status==="cancelled"&&!["requested","accepted"].includes(row.status))throw fail(409,"Only an open or accepted request can be cancelled.","INVALID_STATE");
  if(row.status===status)return {...row,idempotent:true,nextAction:status==="accepted"?"Agree program goals and a start date.":status==="completed"?"Review the recorded outcome.":"No further action is required for this request."};
  const updated=(await db.query("update organization_mentorship_request set status=$1,response_note=$2,responded_by=$3,responded_at=now(),updated_at=now() where id=$4 returning *",[status,responseNote||null,userId,requestId])).rows[0];
  await audit(db,userId,"organization.mentorship_request_responded","organization_mentorship_request",requestId,requestIdHeader,{from:row.status,to:status});
  if(row.requester_user_id!==userId)await notify(db,row.requester_user_id,"organization.mentorship_request_status_changed","organization_mentorship_request",requestId,{from:row.status,to:status,note:responseNote,message:status==="accepted"?"The organization accepted your mentorship request.":status==="declined"?"The organization declined your request.":status==="completed"?"The organization recorded the program outcome.":"The organization mentorship request was cancelled.",nextAction:status==="accepted"?"Agree goals and a start date with the organization.":status==="declined"?"Review the explanation or consider another program.":status==="completed"?"Review the outcome and submit feedback if available.":"Submit a new request if your need remains."});
  return {...updated,nextAction:status==="accepted"?"Agree program goals and a start date.":status==="completed"?"Review the recorded outcome.":status==="declined"?"Review the explanation or consider another program.":"The request is cancelled."};
 });
}

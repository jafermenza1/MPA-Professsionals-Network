import { getPool, withTransaction } from "../platform/db.js";

function fail(status,message,code="BUSINESS_RULE"){return Object.assign(new Error(message),{statusCode:status,code});}
const STAFF_ROLES=["admin","system_admin","platform_admin","supporting_staff","reviewer"];
const ORG_ROLES=["owner","administrator","recruiter","project_manager","event_manager"];
async function staff(db,userId){
 const [r,p]=await Promise.all([db.query("select role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",[userId]),db.query("select permission_code from app_user_permission where user_id=$1",[userId])]);
 if(!r.rows.some(x=>STAFF_ROLES.includes(x.role_code))&&!p.rows.some(x=>["marketplace.moderate","services.moderate","mentorship.moderate"].includes(x.permission_code))) throw fail(403,"Marketplace Support Desk permission is required.","FORBIDDEN");
}
async function orgAccess(db,orgId,userId){
 const r=await db.query("select om.role_code,o.verification_status from organization_membership om join organization o on o.id=om.organization_id where om.organization_id=$1 and om.user_id=$2 and om.status='active'",[orgId,userId]);
 if(!r.rows[0]||!ORG_ROLES.includes(r.rows[0].role_code)) throw fail(403,"An active authorized organization team member is required to submit organization demand.","ORGANIZATION_FORBIDDEN");
 return r.rows[0];
}
async function audit(db,actor,action,type,id,requestId,metadata={}){
 await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,$3,$4,$5,'success',$6)",[actor,action,type,id,requestId,metadata]);
}
async function notify(db,userId,eventCode,type,id,payload={}){
 if(!userId)return;
 await db.query("insert into notification_event(user_id,event_code,resource_type,resource_id,payload) values($1,$2,$3,$4,$5)",[userId,eventCode,type,id,payload]);
}
function clean(value,max){return String(value??"").trim().slice(0,max);}
function required(value,label,max){const v=clean(value,max);if(!v)throw fail(400,label+" is required.","VALIDATION_ERROR");return v;}
function allowedType(type){if(!["service","mentorship"].includes(type))throw fail(400,"Demand type must be service or mentorship.","VALIDATION_ERROR");return type;}
function assertPublicCopy(...values){
 const text=values.map(v=>String(v??"")).join(" ");
 if(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)||/(?:\+?\d[\d\s().-]{7,}\d)/.test(text))throw fail(400,"Public topic text cannot contain email addresses or phone numbers. Rewrite the summary without contact details.","PUBLIC_CONTACT_DETAILS");
}
function allowedMode(mode){const v=mode||"flexible";if(!["remote","onsite","hybrid","flexible"].includes(v))throw fail(400,"Unsupported delivery mode.","VALIDATION_ERROR");return v;}

export async function createDemand(userId,input,requestId){
 const type=allowedType(input.demandType);
 const title=required(input.title,"Title",180), description=required(input.description,"Description",5000);
 if(title.length<4||description.length<10)throw fail(400,"Use a title of at least 4 characters and a description of at least 10 characters.","VALIDATION_ERROR");
 const category=required(input.category,"Category",120), mode=allowedMode(input.deliveryMode);
 const organizationId=input.organizationId||null;
 const audience=organizationId?"organization":"private";
 return withTransaction(async db=>{
  if(organizationId) await orgAccess(db,organizationId,userId);
  const row=(await db.query("insert into marketplace_demand(demand_type,requester_user_id,organization_id,title,description,category,delivery_mode,location_label,desired_timing,audience) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id,demand_type,title,category,delivery_mode,status,created_at",[type,userId,organizationId,title,description,category,mode,clean(input.locationLabel,180)||null,clean(input.desiredTiming,180)||null,audience])).rows[0];
  await db.query("insert into marketplace_demand_event(demand_id,actor_user_id,action,to_status,note,metadata) values($1,$2,'demand.submitted','submitted',$3,$4)",[row.id,userId,"Private intake submitted.",{audience,organizationId:organizationId||null}]);
  await audit(db,userId,"marketplace.demand_submitted","marketplace_demand",row.id,requestId,{demandType:type,audience});
  return row;
 });
}
export async function listMyDemand(userId){
 const db=getPool();
 return (await db.query("select d.id,d.demand_type,d.title,d.category,d.delivery_mode,d.location_label,d.desired_timing,d.status,d.outcome_code,d.outcome_note,d.created_at,d.updated_at,o.display_name organization_name from marketplace_demand d left join organization o on o.id=d.organization_id where d.requester_user_id=$1 or (d.organization_id is not null and exists(select 1 from organization_membership om where om.organization_id=d.organization_id and om.user_id=$1 and om.status='active' and om.role_code=any($2::text[]))) order by d.created_at desc",[userId,ORG_ROLES])).rows;
}
export async function listPublishedTopics(filters={}){
 const args=[],where=["t.status='published'","(t.closes_at is null or t.closes_at>now())"];
 if(filters.type){args.push(allowedType(filters.type));where.push("t.demand_type=$"+args.length);}
 if(filters.q){args.push("%"+clean(filters.q,120)+"%");where.push("(t.title ilike $"+args.length+" or t.summary ilike $"+args.length+" or t.category ilike $"+args.length+")");}
 const limit=Math.min(Math.max(Number(filters.limit)||24,1),60);
 const db=getPool();
 const rows=(await db.query("select t.id,t.demand_type,t.title,t.summary,t.category,t.delivery_mode,t.location_label,t.interest_goal,t.published_at,coalesce(i.total,0)::int interest_count,coalesce(i.ready,0)::int ready_count from marketplace_demand_topic t left join lateral (select count(*) filter(where status='active') total,count(*) filter(where status='active' and interest_level in ('interested','ready_to_engage','can_provide')) ready from marketplace_demand_interest where topic_id=t.id) i on true where "+where.join(" and ")+" order by t.published_at desc limit "+limit,args)).rows;
 return {items:rows,limit};
}
export async function joinDemandTopic(topicId,userId,input,requestId){
 const level=input.interestLevel||"interested";
 if(!["exploring","interested","ready_to_engage","can_provide"].includes(level))throw fail(400,"Choose an available interest level.","VALIDATION_ERROR");
 const comment=clean(input.comment,1000)||null;
 return withTransaction(async db=>{
  const topic=(await db.query("select id,status,closes_at from marketplace_demand_topic where id=$1 for update",[topicId])).rows[0];
  if(!topic||topic.status!=="published"||(topic.closes_at&&new Date(topic.closes_at)<=new Date()))throw fail(404,"This demand topic is no longer open for interest.","TOPIC_CLOSED");
  const prior=(await db.query("select id,topic_id,interest_level,comment,status,created_at,updated_at from marketplace_demand_interest where topic_id=$1 and user_id=$2 for update",[topicId,userId])).rows[0];
  if(prior?.status==="active"&&prior.interest_level===level&&(prior.comment||null)===comment) return {...prior,idempotent:true};
  const row=(await db.query("insert into marketplace_demand_interest(topic_id,user_id,interest_level,comment,status,withdrawn_at,withdrawal_reason) values($1,$2,$3,$4,'active',null,null) on conflict(topic_id,user_id) do update set interest_level=excluded.interest_level,comment=excluded.comment,status='active',withdrawn_at=null,withdrawal_reason=null,updated_at=now() where marketplace_demand_interest.status='withdrawn' or marketplace_demand_interest.interest_level is distinct from excluded.interest_level or marketplace_demand_interest.comment is distinct from excluded.comment returning id,topic_id,interest_level,comment,status,withdrawn_at,created_at,updated_at",[topicId,userId,level,comment])).rows[0];
  if(!row){const current=(await db.query("select id,topic_id,interest_level,comment,status,withdrawn_at,created_at,updated_at from marketplace_demand_interest where topic_id=$1 and user_id=$2",[topicId,userId])).rows[0];return {...current,idempotent:true};}
  await db.query("insert into marketplace_demand_event(topic_id,actor_user_id,action,note,metadata) values($1,$2,'demand.interest_recorded',$3,$4)",[topicId,userId,comment,{interestLevel:level,restored:prior?.status==="withdrawn"}]);
  await audit(db,userId,"marketplace.demand_interest_recorded","marketplace_demand_topic",topicId,requestId,{interestLevel:level,restored:prior?.status==="withdrawn"});
  const owner=(await db.query("select d.requester_user_id,d.source_demand_id from marketplace_demand_topic t left join marketplace_demand d on d.id=t.source_demand_id where t.id=$1",[topicId])).rows[0];
  if(owner?.requester_user_id&&owner.requester_user_id!==userId) await notify(db,owner.requester_user_id,"marketplace.demand_interest_received","marketplace_demand_topic",topicId,{message:"Someone expressed interest in your published demand topic.",nextAction:"Review your demand status or contact the Support Desk for matching."});
  return row;
 });
}
export async function listMyInterests(userId){
 return (await getPool().query("select i.id,i.topic_id,i.interest_level,i.comment,i.status,i.withdrawn_at,i.withdrawal_reason,i.created_at,i.updated_at,t.title,t.demand_type,t.status topic_status,case when i.status='withdrawn' then 'You withdrew your interest. You can rejoin while the topic remains open.' when t.status<>'published' then 'This topic is no longer accepting interest.' else 'Your interest is recorded. You can update or withdraw it while the topic is open.' end next_action from marketplace_demand_interest i join marketplace_demand_topic t on t.id=i.topic_id where i.user_id=$1 order by i.updated_at desc",[userId])).rows;
}

export async function withdrawDemandInterest(topicId,userId,reason,requestId){
 return withTransaction(async db=>{
  const topic=(await db.query("select id,status,closes_at from marketplace_demand_topic where id=$1 for update",[topicId])).rows[0];
  if(!topic)throw fail(404,"Demand topic was not found.","NOT_FOUND");
  const interest=(await db.query("select * from marketplace_demand_interest where topic_id=$1 and user_id=$2 for update",[topicId,userId])).rows[0];
  if(!interest)throw fail(404,"You have not expressed interest in this topic.","INTEREST_NOT_FOUND");
  if(interest.status==="withdrawn")return {...interest,idempotent:true,nextAction:"Your interest is already withdrawn."};
  const updated=(await db.query("update marketplace_demand_interest set status='withdrawn',withdrawn_at=now(),withdrawal_reason=$1,updated_at=now() where id=$2 returning id,topic_id,interest_level,status,withdrawn_at,withdrawal_reason,updated_at",[clean(reason,1000)||null,interest.id])).rows[0];
  await db.query("insert into marketplace_demand_event(topic_id,actor_user_id,action,note,metadata) values($1,$2,'demand.interest_withdrawn',$3,$4)",[topicId,userId,updated.withdrawal_reason,{interestId:interest.id}]);
  await audit(db,userId,"marketplace.demand_interest_withdrawn","marketplace_demand_interest",interest.id,requestId,{topicId});
  const owner=(await db.query("select d.requester_user_id from marketplace_demand_topic t left join marketplace_demand d on d.id=t.source_demand_id where t.id=$1",[topicId])).rows[0];
  if(owner?.requester_user_id&&owner.requester_user_id!==userId)await notify(db,owner.requester_user_id,"marketplace.demand_interest_withdrawn","marketplace_demand_topic",topicId,{message:"An interest was withdrawn. Your published topic's aggregate interest count has been updated.",nextAction:"Review the current interest count and any remaining provider matches."});
  return {...updated,nextAction:"Your interest is withdrawn. You can express interest again while this topic is open."};
 });
}
export async function listReviewQueue(userId,filters={}){
 const db=getPool();await staff(db,userId);
 const status=filters.status||"submitted";
 if(!["submitted","under_review","clarification_needed","matched","topic_published","converted","closed","declined","all"].includes(status))throw fail(400,"Unsupported demand queue status.","VALIDATION_ERROR");
 const where=status==="all"?"true":"d.status=$1";
 const args=status==="all"?[]:[status];
 return (await db.query("select d.*,o.display_name organization_name,p.display_name requester_name,(select count(*)::int from marketplace_demand_topic t where t.source_demand_id=d.id) topic_count from marketplace_demand d join person p on p.user_id=d.requester_user_id left join organization o on o.id=d.organization_id where "+where+" order by d.created_at asc limit 200",args)).rows;
}
export async function reviewDemand(demandId,actorId,input,requestId){
 const status=input.status;
 const allowed=["under_review","clarification_needed","matched","topic_published","converted","closed","declined"];
 if(!allowed.includes(status))throw fail(400,"Unsupported demand review status.","VALIDATION_ERROR");
 if(status==="topic_published"&&!input.publishTopic)throw fail(400,"A public topic must be created from a separate privacy-safe summary.","PUBLIC_SUMMARY_REQUIRED");
 return withTransaction(async db=>{
  await staff(db,actorId);
  const demand=(await db.query("select * from marketplace_demand where id=$1 for update",[demandId])).rows[0];
  if(!demand)throw fail(404,"Demand request not found.","NOT_FOUND");
  if(demand.status===status&&!input.publishTopic&&!input.internalNote&&!input.outcomeNote) return {...demand,idempotent:true,nextAction:status==="topic_published"?"Review incoming interest and provider matches.":status==="matched"?"Coordinate the accepted provider match.":"No further action is required unless the need changes."};
  if(status==="matched"&&!(await db.query("select 1 from marketplace_demand_provider_match where demand_id=$1 and status='accepted' limit 1",[demandId])).rowCount)throw fail(409,"A provider must accept a proposed match before this demand can be marked matched.","PROVIDER_MATCH_REQUIRED");
  if(["converted","closed","declined"].includes(demand.status))throw fail(409,"Resolved demand cannot be changed; record a new request if needs have changed.","INVALID_STATE");
  const note=clean(input.internalNote,3000)||null;
  const outcomeNote=clean(input.outcomeNote,3000)||null;
  if(["converted","closed","declined"].includes(status)&&!outcomeNote)throw fail(400,"Record an outcome explanation before resolving or declining demand.","OUTCOME_NOTE_REQUIRED");
  const outcome=input.publishTopic?"topic_published":(input.outcomeCode||null);
  if(outcome&&!["provider_search","topic_published","listing_created","program_project","no_action","duplicate_merged","declined"].includes(outcome))throw fail(400,"Unsupported outcome code.","VALIDATION_ERROR");
  let topic=null;
  if(input.interestGoal!==undefined&&input.interestGoal!==null&&input.interestGoal!==""&&(!Number.isInteger(Number(input.interestGoal))||Number(input.interestGoal)<1||Number(input.interestGoal)>1000000))throw fail(400,"Interest target must be a positive whole number.","VALIDATION_ERROR");
  if(input.publishTopic){
   if(!["service","mentorship"].includes(demand.demand_type))throw fail(400,"Unsupported demand topic type.","VALIDATION_ERROR");
   const title=required(input.publicTitle,"Public title",180),summary=required(input.publicSummary,"Public summary",1000),category=required(input.publicCategory||demand.category,"Public category",120);
   assertPublicCopy(title,summary,input.publicLocationLabel);
   if(title.length<4||summary.length<10)throw fail(400,"Public title and summary are too short.","VALIDATION_ERROR");
   topic=(await db.query("select id,title,status,published_at from marketplace_demand_topic where source_demand_id=$1 for update",[demand.id])).rows[0];
   if(topic){
    if(topic.status!=="published")throw fail(409,"A previously paused or closed demand topic cannot be republished through a retry.","INVALID_STATE");
    topic=(await db.query("update marketplace_demand_topic set title=$1,summary=$2,category=$3,delivery_mode=$4,location_label=$5,interest_goal=$6,closes_at=$7,updated_at=now() where id=$8 returning id,title,status,published_at",[title,summary,category,allowedMode(input.deliveryMode||demand.delivery_mode),clean(input.publicLocationLabel,180)||null,input.interestGoal?Math.max(1,Number(input.interestGoal)):null,input.closesAt||null,topic.id])).rows[0];
   } else {
    topic=(await db.query("insert into marketplace_demand_topic(demand_type,title,summary,category,delivery_mode,location_label,interest_goal,published_by,source_demand_id,closes_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id,title,status,published_at",[demand.demand_type,title,summary,category,allowedMode(input.deliveryMode||demand.delivery_mode),clean(input.publicLocationLabel,180)||null,input.interestGoal?Math.max(1,Number(input.interestGoal)):null,actorId,demand.id,input.closesAt||null])).rows[0];
   }
  }
  const next=topic?"topic_published":status;
  const updated=(await db.query("update marketplace_demand set status=$1,internal_note=coalesce($2,internal_note),outcome_code=coalesce($3,outcome_code),outcome_note=coalesce($4,outcome_note),reviewed_by=$5,reviewed_at=now(),resolved_at=case when $1 in ('converted','closed','declined','topic_published') then now() else resolved_at end,updated_at=now() where id=$6 returning id,status,outcome_code,outcome_note,reviewed_by,reviewed_at,resolved_at",[next,note,outcome,outcomeNote,actorId,demandId])).rows[0];
  await db.query("insert into marketplace_demand_event(demand_id,topic_id,actor_user_id,action,from_status,to_status,note,metadata) values($1,$2,$3,'demand.reviewed',$4,$5,$6,$7)",[demandId,topic?.id||null,actorId,demand.status,next,note,{outcomeCode:outcome,publishedTopic:Boolean(topic)}]);
  await audit(db,actorId,"marketplace.demand_reviewed","marketplace_demand",demandId,requestId,{from:demand.status,to:next,outcomeCode:outcome,publishedTopic:Boolean(topic)});
  await notify(db,demand.requester_user_id,"marketplace.demand_status_changed","marketplace_demand",demandId,{status:next,outcomeCode:outcome||updated.outcome_code||null,message:outcomeNote||note||"The Support Desk updated your request.",nextAction:next==="topic_published"?"Your privacy-safe topic is published. Review interest as it arrives.":next==="matched"?"A provider has accepted the proposed match. Review the next coordination steps.":["closed","declined","converted"].includes(next)?"Review the recorded outcome. Submit a new request if your need changes.":"Review the request status and provide clarification if requested."});
  return {...updated,topic,nextAction:next==="topic_published"?"Your topic is published and can receive interest.":next==="matched"?"Coordinate with the accepted provider.":"Review the updated status and outcome note."};
 });
}
export async function listAdminListings(userId){
 const db=getPool();await staff(db,userId);
 const [services,mentors,organizationOffers]=await Promise.all([
   db.query("select s.id,'service' listing_type,s.title,s.description,s.service_category category,s.status,s.moderation_status,s.moderation_note,s.provider_user_id,coalesce(o.display_name,p.display_name) owner_name,s.created_at from service_listing s left join person p on p.user_id=s.provider_user_id left join organization o on o.id=s.organization_id where s.moderation_status in ('pending','needs_correction') and s.status<>'closed' order by s.created_at asc limit 200"),
   db.query("select m.id,'mentorship' listing_type,m.headline title,coalesce(m.bio,'') description,'mentorship' category,m.status,m.moderation_status,m.moderation_note,m.user_id provider_user_id,p.display_name owner_name,m.created_at from mentor_profile m join person p on p.user_id=m.user_id where m.moderation_status in ('pending','needs_correction') and m.status<>'closed' order by m.created_at asc limit 200"),
   db.query("select x.id,'organization_mentorship' listing_type,x.title,x.description,'organization mentorship' category,x.status,x.moderation_status,x.moderation_note,x.created_by provider_user_id,o.display_name owner_name,x.created_at from organization_mentorship_offer x join organization o on o.id=x.organization_id where x.moderation_status in ('pending','needs_correction') and x.status<>'closed' order by x.created_at asc limit 200")
  ]);
  return [...services.rows,...mentors.rows,...organizationOffers.rows].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
}
export async function moderateListing(listingType,listingId,actorId,input,requestId){
 await staff(getPool(),actorId);
 const decision=input.decision,note=clean(input.note,3000)||null;
 if(!["approved","needs_correction","rejected"].includes(decision))throw fail(400,"Choose approve, needs correction or reject.","VALIDATION_ERROR");
 if(decision!=="approved"&&!note)throw fail(400,"A reviewer note is required for correction or rejection decisions.","REVIEW_NOTE_REQUIRED");
 return withTransaction(async db=>{
  const table=listingType==="service"?"service_listing":listingType==="mentorship"?"mentor_profile":listingType==="organization_mentorship"?"organization_mentorship_offer":null;
  if(!table)throw fail(400,"Unsupported listing type.","VALIDATION_ERROR");
  const idColumn=listingType==="service"?"id":"id";
  const row=(await db.query("select id,status,moderation_status from "+table+" where "+idColumn+"=$1 for update",[listingId])).rows[0];
  if(!row)throw fail(404,"Listing not found.","NOT_FOUND");
  if(row.status==="closed"||row.status==="closed")throw fail(409,"Closed listings cannot be moderated back into circulation.","INVALID_STATE");
  const publicStatus=decision==="approved"?(listingType==="mentorship"?"active":"published"):decision==="rejected"?"closed":"draft";
  const updated=(await db.query("update "+table+" set moderation_status=$1,moderation_note=$2,moderated_by=$3,moderated_at=now(),status=case when $1='approved' then $4 when $1='rejected' then 'closed' else $5 end,updated_at=now() where id=$6 returning id,status,moderation_status,moderation_note,moderated_at",[decision,note,actorId,publicStatus,"draft",listingId])).rows[0];
  await audit(db,actorId,"marketplace.listing_moderated",listingType==="service"?"service_listing":listingType==="organization_mentorship"?"organization_mentorship_offer":"mentor_profile",listingId,requestId,{decision,note});
  return updated;
 });
}
export async function listDemandMatchCandidates(userId,demandType){
 const db=getPool();await staff(db,userId);
 if(!["service","mentorship"].includes(demandType))throw fail(400,"Choose service or mentorship demand.","VALIDATION_ERROR");
 const services=demandType==="service"?(await db.query("select s.id,'service' listing_type,s.title,coalesce(o.display_name,p.display_name) provider_name,s.organization_id from service_listing s left join organization o on o.id=s.organization_id left join person p on p.user_id=s.provider_user_id where s.status='published' and s.moderation_status='approved' and s.visibility='public' and ((s.organization_id is not null and o.verification_status='verified') or (s.organization_id is null and exists(select 1 from membership_record m where m.user_id=s.provider_user_id and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)))) order by s.title limit 200")).rows:[];
 const mentors=demandType==="mentorship"?(await db.query("select m.id,'mentorship' listing_type,m.headline title,p.display_name provider_name,null::uuid organization_id from mentor_profile m join person p on p.user_id=m.user_id where m.status='active' and m.moderation_status='approved' and m.visibility='public' and exists(select 1 from membership_record mr where mr.user_id=m.user_id and mr.status='active' and mr.start_date<=current_date and (mr.end_date is null or mr.end_date>=current_date)) and exists(select 1 from verification_claim vc join verification_case c on c.id=vc.case_id where c.subject_user_id=m.user_id and vc.status='verified' and lower(vc.claim_code_snapshot) in ('professional_certification','education','employment','experience','service_capability')) order by m.headline limit 200")).rows:[];
 const organizations=demandType==="mentorship"?(await db.query("select x.id,'organization_mentorship' listing_type,x.title,o.display_name provider_name,x.organization_id from organization_mentorship_offer x join organization o on o.id=x.organization_id where x.status='published' and x.moderation_status='approved' and x.visibility='public' and o.verification_status='verified' order by x.title limit 200")).rows:[];
 return [...services,...mentors,...organizations];
}
export async function createDemandProviderMatch(demandId,actorId,input,requestId){
 const listingType=input.listingType,listingId=String(input.listingId||"");
 if(!["service","mentorship","organization_mentorship"].includes(listingType)||!listingId)throw fail(400,"Choose a published provider offer to match with this demand.","MATCH_LISTING_REQUIRED");
 return withTransaction(async db=>{
  await staff(db,actorId);
  const demand=(await db.query("select * from marketplace_demand where id=$1 for update",[demandId])).rows[0];
  if(!demand)throw fail(404,"Demand request was not found.","NOT_FOUND");
  if(["converted","closed","declined"].includes(demand.status))throw fail(409,"Resolved demand cannot receive another provider match.","INVALID_STATE");
  if((demand.demand_type==="service"&&listingType!=="service")||(demand.demand_type==="mentorship"&&listingType==="service"))throw fail(400,"The selected offer does not match this demand type.","MATCH_TYPE_MISMATCH");
  let offer=null,providerUserId=null,organizationId=null;
  if(listingType==="service"){
   offer=(await db.query("select s.id,s.provider_user_id,s.organization_id,s.status,s.moderation_status,s.visibility,o.verification_status from service_listing s left join organization o on o.id=s.organization_id where s.id=$1",[listingId])).rows[0];
   if(!offer||offer.status!=="published"||offer.moderation_status!=="approved"||offer.visibility!=="public"||(offer.organization_id?offer.verification_status!=="verified":false))throw fail(409,"Choose a currently published, approved and public service offer.","MATCH_LISTING_UNAVAILABLE");
   if(offer.organization_id)organizationId=offer.organization_id;else providerUserId=offer.provider_user_id;
   if(!organizationId&&!(await db.query("select 1 where exists(select 1 from membership_record m where m.user_id=$1 and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date))",[providerUserId])).rowCount)throw fail(409,"The individual provider's membership is not current.","MATCH_LISTING_UNAVAILABLE");
  }else if(listingType==="mentorship"){
   offer=(await db.query("select id,user_id provider_user_id,status,moderation_status,visibility from mentor_profile where id=$1",[listingId])).rows[0];
   if(!offer||offer.status!=="active"||offer.moderation_status!=="approved"||offer.visibility!=="public")throw fail(409,"Choose a currently published, approved and public mentor offer.","MATCH_LISTING_UNAVAILABLE");
   providerUserId=offer.provider_user_id;
   const eligible=(await db.query("select 1 where exists(select 1 from membership_record m where m.user_id=$1 and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)) and exists(select 1 from verification_claim vc join verification_case c on c.id=vc.case_id where c.subject_user_id=$1 and vc.status='verified' and lower(vc.claim_code_snapshot)=any($2::text[]))",[providerUserId,["professional_certification","education","employment","experience","service_capability"]])).rowCount>0;
   if(!eligible)throw fail(409,"The mentor's membership or professional verification is no longer current.","MATCH_LISTING_UNAVAILABLE");
  }else{
   offer=(await db.query("select x.id,x.organization_id,x.status,x.moderation_status,x.visibility,o.verification_status from organization_mentorship_offer x join organization o on o.id=x.organization_id where x.id=$1",[listingId])).rows[0];
   if(!offer||offer.status!=="published"||offer.moderation_status!=="approved"||offer.visibility!=="public"||offer.verification_status!=="verified")throw fail(409,"Choose a currently published offer from a verified organization.","MATCH_LISTING_UNAVAILABLE");
   organizationId=offer.organization_id;
  }
  const match=(await db.query("insert into marketplace_demand_provider_match(demand_id,listing_type,listing_id,provider_user_id,organization_id,matched_by,match_note) values($1,$2,$3,$4,$5,$6,$7) on conflict(demand_id,listing_type,listing_id) do update set status='proposed',matched_by=excluded.matched_by,match_note=excluded.match_note,response_note=null,responded_at=null,updated_at=now() where marketplace_demand_provider_match.status in ('declined','withdrawn') returning *",[demandId,listingType,listingId,providerUserId,organizationId,actorId,clean(input.note,2000)||null])).rows[0];
  if(!match)throw fail(409,"This provider offer has already been matched to the demand.","DUPLICATE_MATCH");
  await db.query("insert into marketplace_demand_event(demand_id,actor_user_id,action,from_status,to_status,note,metadata) values($1,$2,'demand.provider_match_proposed',$3,$3,$4,$5)",[demandId,actorId,demand.status,clean(input.note,2000)||null,{listingType,listingId,matchId:match.id}]);
  await audit(db,actorId,"marketplace.demand_provider_match_proposed","marketplace_demand_provider_match",match.id,requestId,{demandId,listingType,listingId});
  return match;
 });
}
export async function listMyDemandProviderMatches(userId){
 return (await getPool().query("select mm.*,d.title demand_title,d.demand_type,d.requester_user_id,coalesce(sl.title,mp.headline,oo.title) listing_title,coalesce(org.display_name,person.display_name) provider_name,(d.requester_user_id=$1) is_requester,(mm.provider_user_id=$1) is_provider from marketplace_demand_provider_match mm join marketplace_demand d on d.id=mm.demand_id left join service_listing sl on mm.listing_type='service' and sl.id=mm.listing_id left join mentor_profile mp on mm.listing_type='mentorship' and mp.id=mm.listing_id left join organization_mentorship_offer oo on mm.listing_type='organization_mentorship' and oo.id=mm.listing_id left join organization org on org.id=mm.organization_id left join person on person.user_id=mm.provider_user_id where d.requester_user_id=$1 or mm.provider_user_id=$1 or exists(select 1 from organization_membership om where om.organization_id=mm.organization_id and om.user_id=$1 and om.status='active' and om.role_code=any($2::text[])) order by mm.updated_at desc",[userId,["owner","administrator","recruiter","project_manager"]])).rows;
}
export async function respondToDemandProviderMatch(matchId,userId,status,note,requestId){
 if(!["accepted","declined"].includes(status))throw fail(400,"Choose accept or decline for this provider match.","VALIDATION_ERROR");
 const responseNote=clean(note,2000);
 if(status==="declined"&&!responseNote)throw fail(400,"Add a short reason so the Support Desk can find another provider.","RESPONSE_NOTE_REQUIRED");
 return withTransaction(async db=>{
  const match=(await db.query("select mm.*,d.status demand_status from marketplace_demand_provider_match mm join marketplace_demand d on d.id=mm.demand_id where mm.id=$1 for update of mm,d",[matchId])).rows[0];
  if(!match)throw fail(404,"Provider match was not found.","NOT_FOUND");
  const provider=match.provider_user_id===userId||Boolean(match.organization_id&&(await db.query("select 1 from organization_membership where organization_id=$1 and user_id=$2 and status='active' and role_code=any($3::text[]) limit 1",[match.organization_id,userId,["owner","administrator","recruiter","project_manager"]])).rowCount);
  if(!provider)throw fail(403,"Only the matched provider or organization team can respond.","FORBIDDEN");
  if(match.status===status)return {...match,idempotent:true,nextAction:status==="accepted"?"Coordinate the accepted match.":"The Support Desk can propose another provider."};
  if(match.status!=="proposed")throw fail(409,"This provider match has already been answered.","INVALID_STATE");
  if(["converted","closed","declined"].includes(match.demand_status))throw fail(409,"This demand has been resolved and no longer accepts provider responses.","INVALID_STATE");
  if(status==="accepted"&&(await db.query("select 1 from marketplace_demand_provider_match where demand_id=$1 and id<>$2 and status='accepted' limit 1",[match.demand_id,matchId])).rowCount)throw fail(409,"Another provider has already accepted this demand. Ask the Support Desk to review the existing match before accepting another.","MATCH_ALREADY_ACCEPTED");
  const updated=(await db.query("update marketplace_demand_provider_match set status=$1,response_note=$2,responded_at=now(),updated_at=now() where id=$3 returning *",[status,responseNote||null,matchId])).rows[0];
  if(status==="accepted")await db.query("update marketplace_demand set status='matched',outcome_code='provider_search',outcome_note=coalesce($1,outcome_note),reviewed_at=now(),resolved_at=now(),updated_at=now() where id=$2",[responseNote||"A provider accepted the match.",match.demand_id]);
  else {
   const accepted=(await db.query("select 1 from marketplace_demand_provider_match where demand_id=$1 and status='accepted' limit 1",[match.demand_id])).rowCount>0;
   if(!accepted) await db.query("update marketplace_demand set status=case when status='matched' then 'under_review' else status end,outcome_note=coalesce($1,outcome_note),updated_at=now() where id=$2",[responseNote,match.demand_id]);
  }
  const nextDemandStatus=status==="accepted"?"matched":(match.demand_status==="matched"?"under_review":match.demand_status);
  await db.query("insert into marketplace_demand_event(demand_id,actor_user_id,action,from_status,to_status,note,metadata) values($1,$2,'demand.provider_match_responded',$3,$4,$5,$6)",[match.demand_id,userId,match.demand_status,nextDemandStatus,responseNote||null,{matchId,matchStatus:updated.status}]);
  await audit(db,userId,"marketplace.demand_provider_match_responded","marketplace_demand_provider_match",matchId,requestId,{status,demandId:match.demand_id});
  const demandOwner=(await db.query("select requester_user_id from marketplace_demand where id=$1",[match.demand_id])).rows[0];
  if(demandOwner?.requester_user_id&&demandOwner.requester_user_id!==userId) await notify(db,demandOwner.requester_user_id,status==="accepted"?"marketplace.provider_match_accepted":"marketplace.provider_match_declined","marketplace_demand_provider_match",matchId,{status,message:status==="accepted"?"A provider accepted the proposed match.":"A provider cannot take this request; the Support Desk can look for another.",nextAction:status==="accepted"?"Review the provider details and coordinate the next step.":"Wait for another proposed match or contact the Support Desk."});
  return {...updated,nextAction:status==="accepted"?"The requester has been notified. Coordinate the next step.":"The Support Desk can propose another provider."};
 });
}
export async function getDemandSummary(userId,topicId){
 const db=getPool();await staff(db,userId);
 const topic=(await db.query("select id,title,demand_type,category,status,interest_goal from marketplace_demand_topic where id=$1",[topicId])).rows[0];
 if(!topic)throw fail(404,"Demand topic not found.","NOT_FOUND");
 const counts=(await db.query("select interest_level,count(*)::int count from marketplace_demand_interest where topic_id=$1 and status='active' group by interest_level",[topicId])).rows;
 const participants=(await db.query("select i.interest_level,count(*)::int count from marketplace_demand_interest i join marketplace_demand_topic t on t.id=i.topic_id where i.topic_id=$1 and i.status='active' group by i.interest_level",[topicId])).rows;
 return {topic,counts,uniqueInterests:counts.reduce((n,r)=>n+Number(r.count),0),readyCount:counts.filter(r=>["ready_to_engage","can_provide"].includes(r.interest_level)).reduce((n,r)=>n+Number(r.count),0)};
}

import { getPool } from "./db.js";
import * as talent from "../talent/service.js";
import * as servicesMentorship from "../services-mentorship/service.js";

function error(status,message,code="BUSINESS_RULE"){const e=new Error(message);e.statusCode=status;e.code=code;return e;}
const TYPES=new Set(["professional","organization","service","mentor"]);

async function assertVisibleTarget(userId,itemType,itemId){
 const db=getPool();
 if(itemType==="professional"){
   await talent.getTalent(itemId,userId);
   return;
 }
 if(itemType==="organization"){
   const row=(await db.query("select id from organization where id=$1 and public_visible=true and verification_status='verified'",[itemId])).rows[0];
   if(!row)throw error(404,"This organization is not publicly available to save.","NOT_FOUND");
   return;
 }
 if(itemType==="service"){
   await servicesMentorship.getServiceListing(itemId,userId);
   return;
 }
 if(itemType==="mentor"){
   const row=(await db.query(`select mp.user_id from mentor_profile mp
     where mp.user_id=$1 and mp.status='active' and mp.moderation_status='approved'
       and (mp.visibility='public' or (mp.visibility='members' and exists(
         select 1 from membership_record viewer_membership where viewer_membership.user_id=$2
           and viewer_membership.status='active' and viewer_membership.start_date<=current_date
           and (viewer_membership.end_date is null or viewer_membership.end_date>=current_date))))
       and exists(select 1 from membership_record mentor_membership where mentor_membership.user_id=mp.user_id
         and mentor_membership.status='active' and mentor_membership.start_date<=current_date
         and (mentor_membership.end_date is null or mentor_membership.end_date>=current_date))`,[itemId,userId])).rows[0];
   if(!row)throw error(404,"This mentor profile is not available to save.","NOT_FOUND");
   return;
 }
 throw error(400,"Choose a supported saved-item type.","VALIDATION_ERROR");
}

export async function saveDiscoveryItem(userId,input={},requestId){
 const itemType=String(input.itemType||"");
 const itemId=String(input.itemId||"");
 if(!TYPES.has(itemType))throw error(400,"itemType must be professional, organization, service or mentor.","VALIDATION_ERROR");
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(itemId))throw error(400,"itemId must be a valid identifier.","VALIDATION_ERROR");
 await assertVisibleTarget(userId,itemType,itemId);
 const db=getPool();
 const row=(await db.query("insert into saved_discovery_item(user_id,item_type,item_id) values($1,$2,$3) on conflict(user_id,item_type,item_id) do update set item_id=excluded.item_id returning item_type,item_id,created_at",[userId,itemType,itemId])).rows[0];
 await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'discovery.item_saved','saved_discovery_item',$2,$3,'success',$4)",[userId,itemId,requestId,{itemType}]);
 return {...row,saved:true};
}
export async function removeDiscoveryItem(userId,itemType,itemId,requestId){
 if(!TYPES.has(String(itemType||"")))throw error(400,"Choose a supported saved-item type.","VALIDATION_ERROR");
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(itemId||"")))throw error(400,"itemId must be a valid identifier.","VALIDATION_ERROR");
 const db=getPool();
 await db.query("delete from saved_discovery_item where user_id=$1 and item_type=$2 and item_id=$3",[userId,itemType,itemId]);
 await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'discovery.item_unsaved','saved_discovery_item',$2,$3,'success',$4)",[userId,itemId,requestId,{itemType}]);
 return {itemType,itemId,saved:false};
}
export async function listDiscoveryItems(userId){
 const db=getPool();
 return (await db.query(`
 select s.item_type,s.item_id,s.created_at,
   p.display_name title,pp.professional_title subtitle,'/network/'||s.item_id::text href
 from saved_discovery_item s
 join person p on p.user_id=s.item_id
 join professional_profile pp on pp.person_id=p.id
 where s.user_id=$1 and s.item_type='professional'
   and (pp.directory_visibility='public' or (pp.directory_visibility='members' and exists(
     select 1 from membership_record vm where vm.user_id=$1 and vm.status='active'
       and vm.start_date<=current_date and (vm.end_date is null or vm.end_date>=current_date))))
 union all
 select s.item_type,s.item_id,s.created_at,o.display_name title,o.organization_type subtitle,'/organizations/directory/'||o.id::text href
 from saved_discovery_item s join organization o on o.id=s.item_id
 where s.user_id=$1 and s.item_type='organization' and o.public_visible=true and o.verification_status='verified'
 union all
 select s.item_type,s.item_id,s.created_at,sl.title title,sl.service_category subtitle,'/services/'||sl.id::text href
 from saved_discovery_item s join service_listing sl on sl.id=s.item_id
 where s.user_id=$1 and s.item_type='service' and sl.status='published' and sl.moderation_status='approved'
   and ((sl.organization_id is not null and exists(select 1 from organization o where o.id=sl.organization_id and o.verification_status='verified')) or (sl.organization_id is null and exists(select 1 from membership_record pm where pm.user_id=sl.provider_user_id and pm.status='active' and pm.start_date<=current_date and (pm.end_date is null or pm.end_date>=current_date))))
   and ((sl.visibility='public') or (sl.visibility='members' and exists(select 1 from membership_record vm where vm.user_id=$1 and vm.status='active' and vm.start_date<=current_date and (vm.end_date is null or vm.end_date>=current_date))))
 union all
 select s.item_type,s.item_id,s.created_at,p.display_name title,mp.headline subtitle,'/mentorship/mentors/'||mp.user_id::text href
 from saved_discovery_item s join mentor_profile mp on mp.user_id=s.item_id join person p on p.user_id=mp.user_id
 where s.user_id=$1 and s.item_type='mentor' and mp.status='active' and mp.moderation_status='approved'
   and exists(select 1 from membership_record mentor_membership where mentor_membership.user_id=mp.user_id and mentor_membership.status='active' and mentor_membership.start_date<=current_date and (mentor_membership.end_date is null or mentor_membership.end_date>=current_date))
   and (mp.visibility='public' or (mp.visibility='members' and exists(select 1 from membership_record vm where vm.user_id=$1 and vm.status='active' and vm.start_date<=current_date and (vm.end_date is null or vm.end_date>=current_date))))
 order by created_at desc`,[userId])).rows;
}

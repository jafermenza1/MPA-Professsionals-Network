import { getPool, withTransaction } from "../platform/db.js";

function error(status,message,code="BUSINESS_RULE"){ const e=new Error(message); e.statusCode=status; e.code=code; return e; }
function limitValue(v){ return Math.min(Math.max(Number(v)||25,1),100); }
export const ELIGIBLE_VERIFICATION_CLAIMS=["professional_certification","education","employment","experience","service_capability"];
export function isEligibleVerifiedClaim(code){ return ELIGIBLE_VERIFICATION_CLAIMS.includes(String(code||"").toLowerCase()); }
export function allowedTalentInquiryTransition(from,to){ return ({"requested":["accepted","declined","closed"],"accepted":["closed"],"declined":[],"closed":[]}[from]||[]).includes(to); }

async function audit(db,actor,action,type,id,requestId,metadata={}){ await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,$3,$4,$5,'success',$6)",[actor,action,type,id,requestId,metadata]); }


export async function updateProfessionalProfile(userId,input,requestId){
 return withTransaction(async db=>{
  const p=(await db.query("select pp.id from professional_profile pp join person p on p.id=pp.person_id where p.user_id=$1 for update",[userId])).rows[0];
  if(!p) throw error(404,"Professional profile not found.","NOT_FOUND");
  const years=input.yearsExperience===null||input.yearsExperience===undefined?null:Number(input.yearsExperience);
  if(years!==null&&(!Number.isInteger(years)||years<0)) throw error(400,"yearsExperience must be a non-negative integer.","VALIDATION_ERROR");
  if(input.availabilityStatus!==undefined&&input.availabilityStatus!==null&&input.availabilityStatus!==""&&!["not_specified","available","limited","unavailable"].includes(input.availabilityStatus)) throw error(400,"availabilityStatus must be not_specified, available, limited or unavailable.","VALIDATION_ERROR");
  if(input.visibility!==undefined&&input.visibility!==null&&!["private","members","public"].includes(input.visibility)) throw error(400,"visibility must be private, members or public.","VALIDATION_ERROR");
  await db.query("update professional_profile set professional_title=coalesce($1,professional_title),years_experience=coalesce($2,years_experience),availability_status=coalesce($3,availability_status),location_label=coalesce($4,location_label),directory_summary=coalesce($5,directory_summary),headline=coalesce($6,headline),bio=coalesce($7,bio),directory_visibility=coalesce($8,directory_visibility),updated_at=now() where id=$9",[input.professionalTitle||null,years,input.availabilityStatus||null,input.locationLabel||null,input.directorySummary||null,input.headline||null,input.bio||null,input.visibility||null,p.id]);
  if(Array.isArray(input.references)){
   for(const ref of input.references){
    const allowed=["occupation","industry","education_level","qualification_type","field_of_study"];
    if(!allowed.includes(ref.relationType)) throw error(400,"Unsupported professional reference relation.","INVALID_REFERENCE");
    const item=(await db.query("select ri.id from reference_item ri join reference_dataset_version rv on rv.id=ri.dataset_version_id join reference_dataset rd on rd.id=rv.dataset_id where ri.id=$1 and rv.status='published' and rd.domain=$2 and ri.active=true",[ref.referenceItemId,ref.relationType])).rows[0];
    if(!item) throw error(400,"Reference item is not from a published dataset for the requested relation.","INVALID_REFERENCE");
    await db.query("delete from professional_profile_reference where profile_id=$1 and relation_type=$2",[p.id,ref.relationType]);
    await db.query("insert into professional_profile_reference(profile_id,reference_item_id,relation_type,is_primary) values($1,$2,$3,true)",[p.id,ref.referenceItemId,ref.relationType]);
   }
  }
  if(Array.isArray(input.experience)){
   await db.query("delete from professional_experience where profile_id=$1",[p.id]);
   for(const item of input.experience) await db.query("insert into professional_experience(profile_id,employer_name,role_title,start_date,end_date,is_current,description,visibility) values($1,$2,$3,$4,$5,$6,$7,$8)",[p.id,item.employerName||null,item.roleTitle,item.startDate||null,item.endDate||null,Boolean(item.currentRole),item.description||null,item.visibility||"members"]);
  }
  await audit(db,userId,"talent.profile_updated","professional_profile",p.id,requestId,{referenceCount:Array.isArray(input.references)?input.references.length:0,experienceCount:Array.isArray(input.experience)?input.experience.length:0});
  return (await db.query("select id,professional_title,headline,bio,years_experience,availability_status,location_label,directory_summary,directory_visibility as visibility,completion_percent from professional_profile where id=$1",[p.id])).rows[0];
 });
}

export async function getProfessionalProfile(userId){
 const db=getPool();
 const row=(await db.query("select pp.id,pp.professional_title,pp.years_experience,pp.availability_status,pp.location_label,pp.directory_summary,pp.headline,pp.bio,pp.directory_visibility as visibility,pp.completion_percent from professional_profile pp join person p on p.id=pp.person_id where p.user_id=$1",[userId])).rows[0];
 if(!row) throw error(404,"Professional profile not found.","NOT_FOUND");
 return row;
}

export async function updateVisibility(userId,input,requestId){
 return withTransaction(async db=>{
  const row=(await db.query("insert into verification_visibility(user_id,directory_visible,show_identity_badge,show_professional_badge,show_experience_badge,show_location,show_experience,show_contact) values($1,coalesce($2,false),coalesce($3,false),coalesce($4,false),coalesce($5,false),coalesce($6,false),coalesce($7,false),coalesce($8,false)) on conflict(user_id) do update set directory_visible=coalesce($2,verification_visibility.directory_visible),show_identity_badge=coalesce($3,verification_visibility.show_identity_badge),show_professional_badge=coalesce($4,verification_visibility.show_professional_badge),show_experience_badge=coalesce($5,verification_visibility.show_experience_badge),show_location=coalesce($6,verification_visibility.show_location),show_experience=coalesce($7,verification_visibility.show_experience),show_contact=coalesce($8,verification_visibility.show_contact),updated_at=now() returning *",[userId,input.directoryVisible,input.showIdentityBadge,input.showProfessionalBadge,input.showExperienceBadge,input.showLocation,input.showExperience,input.showContact])).rows[0];
  await audit(db,userId,"talent.visibility_updated","verification_visibility",row.id,requestId,{directoryVisible:row.directory_visible});
  return row;
 });
}

export async function getVisibility(userId){ const db=getPool(); const r=await db.query("select * from verification_visibility where user_id=$1",[userId]); return r.rows[0]||{user_id:userId,directory_visible:false}; }

function viewerVisibilityClause(viewerIsMember){ return viewerIsMember ? "(pp.directory_visibility in ('members','public'))" : "pp.directory_visibility='public'"; }

export async function searchTalent(viewerId,filters={}){
 const db=getPool();
 const viewerIsMember=viewerId?Boolean((await db.query("select 1 from membership_record where user_id=$1 and status='active' limit 1",[viewerId])).rows[0]):false;
 const args=[]; const where=["m.status='active'", "vv.directory_visible=true", viewerVisibilityClause(viewerIsMember)];
 if(filters.q){ args.push("%"+String(filters.q).trim()+"%"); where.push("(pp.professional_title ilike $"+args.length+" or pp.headline ilike $"+args.length+" or pp.directory_summary ilike $"+args.length+" or p.display_name ilike $"+args.length+")"); }
 const refFilter=(param,relation)=>{ if(filters[param]){ args.push(String(filters[param])); where.push("exists (select 1 from professional_profile_reference prf join reference_item ri on ri.id=prf.reference_item_id where prf.profile_id=pp.id and prf.relation_type='"+relation+"' and (ri.code=$"+args.length+" or ri.id::text=$"+args.length+"))"); } };
 refFilter("occupation","occupation"); refFilter("industry","industry"); refFilter("educationLevel","education_level"); refFilter("qualificationType","qualification_type"); refFilter("fieldOfStudy","field_of_study");
 if(filters.availability){ args.push(String(filters.availability)); where.push("pp.availability_status=$"+args.length); }
 if(filters.location){ args.push("%"+String(filters.location).trim()+"%"); where.push("vv.show_location=true and pp.location_label ilike $"+args.length); }
 if(filters.verifiedClaim){ const claim=String(filters.verifiedClaim).toLowerCase(); if(!isEligibleVerifiedClaim(claim)) throw error(400,"Unsupported verified professional claim filter.","INVALID_VERIFIED_CLAIM"); args.push(claim); where.push("exists (select 1 from verification_claim vc join verification_case vcase on vcase.id=vc.case_id where vcase.subject_user_id=u.id and vc.status='verified' and lower(vc.claim_code_snapshot)=$"+args.length+")"); } else { where.push("exists (select 1 from verification_claim vc join verification_case vcase on vcase.id=vc.case_id where vcase.subject_user_id=u.id and vc.status='verified' and lower(vc.claim_code_snapshot) in ('professional_certification','education','employment','experience','service_capability'))"); }
 const limit=limitValue(filters.limit),offset=Math.max(Number(filters.offset)||0,0);
 const sql="select distinct u.id user_id,p.display_name,pp.id profile_id,pp.professional_title,pp.headline,pp.directory_summary,pp.years_experience,pp.availability_status,"+
 "(case when vv.show_location then pp.location_label else null end) location_label,"+
 "vv.show_location,vv.show_identity_badge,vv.show_professional_badge,vv.show_experience_badge,vv.show_experience,"+
 "(select count(*)::int from verification_claim vc join verification_case vcase on vcase.id=vc.case_id where vcase.subject_user_id=u.id and vc.status='verified' and lower(vc.claim_code_snapshot) in ('professional_certification','education','employment','experience','service_capability')) verified_claim_count "+
 "from app_user u join person p on p.user_id=u.id join professional_profile pp on pp.person_id=p.id join membership_record m on m.user_id=u.id and m.status='active' join verification_visibility vv on vv.user_id=u.id "+
 "where "+where.join(" and ")+" order by pp.professional_title nulls last,p.display_name limit "+limit+" offset "+offset;
 const rows=(await db.query(sql,args)).rows;
 return {items:rows,limit,offset};
}

export async function getTalent(userId,viewerId){
 const db=getPool();
 const viewerMember=viewerId?Boolean((await db.query("select 1 from membership_record where user_id=$1 and status='active' limit 1",[viewerId])).rows[0]):false;
 const where=viewerMember?"pp.directory_visibility in ('members','public')":"pp.directory_visibility='public'";
 const row=(await db.query("select u.id user_id,p.display_name,pp.id profile_id,pp.professional_title,pp.headline,pp.bio,pp.directory_summary,pp.years_experience,pp.availability_status,case when vv.show_location then pp.location_label else null end location_label,case when vv.show_contact and u.id=$2 then p.phone else null end phone,vv.show_identity_badge,vv.show_professional_badge,vv.show_experience_badge,vv.show_experience from app_user u join person p on p.user_id=u.id join professional_profile pp on pp.person_id=p.id join membership_record m on m.user_id=u.id and m.status='active' join verification_visibility vv on vv.user_id=u.id where u.id=$1 and vv.directory_visible=true and "+where+" and exists (select 1 from verification_claim vc join verification_case vcase on vcase.id=vc.case_id where vcase.subject_user_id=u.id and vc.status='verified' and lower(vc.claim_code_snapshot) in ('professional_certification','education','employment','experience','service_capability'))",[userId,viewerId||null])).rows[0];
 if(!row) throw error(404,"Professional not found or not visible.","NOT_FOUND");
 const refs=(await db.query("select prf.relation_type,ri.code,ri.label,ri.dataset_version_id from professional_profile_reference prf join reference_item ri on ri.id=prf.reference_item_id where prf.profile_id=$1 order by prf.relation_type,prf.is_primary desc,ri.label",[row.profile_id])).rows;
 const claims=(await db.query("select distinct vc.claim_code_snapshot claim_code from verification_claim vc join verification_case c on c.id=vc.case_id where c.subject_user_id=$1 and vc.status='verified' and lower(vc.claim_code_snapshot) in ('professional_certification','education','employment','experience','service_capability')",[userId])).rows;
 const experience=row.show_experience?(await db.query("select id,employer_name,role_title,start_date,end_date,is_current,description from professional_experience where profile_id=$1 and visibility in ('members','public') order by start_date desc nulls last",[row.profile_id])).rows:[];
 return {...row,references:refs,verifiedClaims:claims,experience};
}

export async function saveSearch(userId,input,requestId){
 return withTransaction(async db=>{ const row=(await db.query("insert into talent_saved_search(user_id,name,criteria) values($1,$2,$3) returning *",[userId,input.name,input.criteria||{}])).rows[0]; await audit(db,userId,"talent.saved_search_created","talent_saved_search",row.id,requestId); return row; });
}
export async function listSavedSearches(userId){ return (await getPool().query("select * from talent_saved_search where user_id=$1 and active=true order by created_at desc",[userId])).rows; }


export async function createTalentInquiry(requesterId,input,requestId){
  return withTransaction(async db=>{
    if(!input.professionalUserId||!input.subject||!input.message) throw error(400,"professionalUserId, subject and message are required.","VALIDATION_ERROR");
    if(requesterId===input.professionalUserId) throw error(400,"You cannot inquire about your own professional profile.","SELF_INQUIRY");
    const member=(await db.query("select 1 from membership_record where user_id=$1 and status='active'",[requesterId])).rows[0];
    if(!member) throw error(403,"An active membership is required to contact a professional.","MEMBERSHIP_REQUIRED");
    const target=(await db.query(`
      select u.id
      from app_user u
      join membership_record m on m.user_id=u.id and m.status='active'
      join verification_visibility vv on vv.user_id=u.id and vv.directory_visible=true
      join person p on p.user_id=u.id
      join professional_profile pp on pp.person_id=p.id and pp.directory_visibility in ('members','public')
      where u.id=$1
        and exists (
          select 1 from verification_claim vc
          join verification_case c on c.id=vc.case_id
          where c.subject_user_id=u.id and vc.status='verified'
            and lower(vc.claim_code_snapshot) in ('professional_certification','education','employment','experience','service_capability')
        )
    `,[input.professionalUserId])).rows[0];
    if(!target) throw error(404,"Verified professional not found or not accepting directory contact.","NOT_FOUND");
    if(input.organizationId){
      const orgMember=(await db.query("select 1 from organization_membership where organization_id=$1 and user_id=$2 and status='active'",[input.organizationId,requesterId])).rows[0];
      if(!orgMember) throw error(403,"You must be an active member of the supplied organization to send an organization inquiry.","ORGANIZATION_SCOPE");
    }
    const duplicate=(await db.query("select id from talent_inquiry where requester_user_id=$1 and professional_user_id=$2 and status='requested'",[requesterId,input.professionalUserId])).rows[0];
    if(duplicate) throw error(409,"You already have a pending inquiry for this professional.","DUPLICATE_INQUIRY");
    const row=(await db.query("insert into talent_inquiry(requester_user_id,professional_user_id,organization_id,subject,message) values($1,$2,$3,$4,$5) returning *",[requesterId,input.professionalUserId,input.organizationId||null,input.subject,input.message])).rows[0];
    await audit(db,requesterId,"talent.inquiry_created","talent_inquiry",row.id,requestId,{professionalUserId:input.professionalUserId});
    return row;
  });
}

export async function listTalentInquiries(userId){
  const db=getPool();
  return (await db.query(`
    select ti.*,rp.display_name requester_name,pp.display_name professional_name,
      case when ti.status='accepted' and ti.contact_release and coalesce(professional_visibility.show_contact,false) then pu.email else null end professional_email,
      case when ti.status='accepted' and ti.contact_release and coalesce(professional_visibility.show_contact,false) then ppers.phone else null end professional_phone,
      case when ti.status='accepted' and ti.contact_release and coalesce(requester_visibility.show_contact,false) then ru.email else null end requester_email,
      case when ti.status='accepted' and ti.contact_release and coalesce(requester_visibility.show_contact,false) then rpers.phone else null end requester_phone
    from talent_inquiry ti
    join person rp on rp.user_id=ti.requester_user_id
    join person pp on pp.user_id=ti.professional_user_id
    join app_user pu on pu.id=ti.professional_user_id
    join app_user ru on ru.id=ti.requester_user_id
    join person ppers on ppers.user_id=ti.professional_user_id
    join person rpers on rpers.user_id=ti.requester_user_id
    left join verification_visibility professional_visibility on professional_visibility.user_id=ti.professional_user_id
    left join verification_visibility requester_visibility on requester_visibility.user_id=ti.requester_user_id
    where ti.requester_user_id=$1 or ti.professional_user_id=$1
    order by ti.created_at desc
  `,[userId])).rows;
}

export async function respondToTalentInquiry(inquiryId,userId,input,requestId){
  return withTransaction(async db=>{
    const row=(await db.query("select * from talent_inquiry where id=$1 for update",[inquiryId])).rows[0];
    if(!row) throw error(404,"Talent inquiry not found.","NOT_FOUND");
    if(row.professional_user_id!==userId) throw error(403,"Only the professional can respond to this inquiry.","FORBIDDEN");
    if(row.status!=="requested") throw error(409,"This inquiry is no longer awaiting a response.","INVALID_STATE");
    if(!["accepted","declined"].includes(input.status)) throw error(400,"Inquiry response must be accepted or declined.","VALIDATION_ERROR");
    if(input.status==="accepted"&&input.releaseContact===true){
      const consent=(await db.query("select show_contact from verification_visibility where user_id=$1",[userId])).rows[0];
      if(!consent?.show_contact) throw error(409,"Contact release is disabled in your talent directory privacy settings.","CONTACT_RELEASE_DISABLED");
    }
    const updated=(await db.query("update talent_inquiry set status=$1,response=$2,contact_release=$3,responded_at=now(),updated_at=now() where id=$4 returning *",[input.status,input.response||null,input.status==="accepted"&&input.releaseContact===true,inquiryId])).rows[0];
    await audit(db,userId,"talent.inquiry_responded","talent_inquiry",inquiryId,requestId,{status:input.status,contactReleased:updated.contact_release});
    return updated;
  });
}

export async function closeTalentInquiry(inquiryId,userId,requestId){
  return withTransaction(async db=>{
    const row=(await db.query("select * from talent_inquiry where id=$1 for update",[inquiryId])).rows[0];
    if(!row) throw error(404,"Talent inquiry not found.","NOT_FOUND");
    if(row.requester_user_id!==userId&&row.professional_user_id!==userId) throw error(403,"You are not a participant in this inquiry.","FORBIDDEN");
    if(["closed","declined"].includes(row.status)) throw error(409,"This inquiry is already closed.","INVALID_STATE");
    const updated=(await db.query("update talent_inquiry set status='closed',closed_at=now(),updated_at=now() where id=$1 returning *",[inquiryId])).rows[0];
    await audit(db,userId,"talent.inquiry_closed","talent_inquiry",inquiryId,requestId);
    return updated;
  });
}

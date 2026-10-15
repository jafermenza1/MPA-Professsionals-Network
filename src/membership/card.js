import { createHmac, timingSafeEqual } from "node:crypto";
import { getPool, withTransaction } from "../platform/db.js";
import { loadConfig } from "../platform/config.js";

const fail=(status,message,code)=>Object.assign(new Error(message),{statusCode:status,code});
const DEFAULT_SETTINGS={
  header_text:"Muslim Professionals Association",
  subtitle_text:"Membership ID",
  footer_text:"Verify membership using the QR code",
  background_style:"geometric",
  background_start:"#0A3258",
  background_end:"#174A78",
  accent_color:"#97C024",
  text_color:"#FFFFFF",
  show_membership_type:true
};
function tokenFor(recordId,version){
  const secret=process.env.MEMBERSHIP_CARD_SECRET||loadConfig().jwtSecret;
  if(!secret) throw fail(503,"Membership verification is not configured.","VERIFICATION_NOT_CONFIGURED");
  return createHmac("sha256",secret).update("mpa-membership-card:"+recordId+":"+version).digest("base64url");
}
function tokenMatches(expected,supplied){
  if(typeof supplied!=="string"||supplied.length<32||supplied.length>128) return false;
  const a=Buffer.from(expected),b=Buffer.from(supplied);
  return a.length===b.length&&timingSafeEqual(a,b);
}
export function getMembershipCardStatus(row, now=new Date()) {
  if(["revoked","cancelled","merged"].includes(row.status)) return "revoked";
  if(row.status==="suspended") return "suspended";
  const today=now.toISOString().slice(0,10);
  if(row.status!=="active"||String(row.start_date).slice(0,10)>today||(row.end_date&&String(row.end_date).slice(0,10)<today)) return "expired";
  return "active";
}
async function settings(db=getPool()){
  const row=(await db.query("select header_text,subtitle_text,footer_text,background_style,background_start,background_end,accent_color,text_color,show_membership_type from membership_card_settings where id=1")).rows[0];
  return row||DEFAULT_SETTINGS;
}
export async function getMyMembershipCard(userId){
  const db=getPool();
  const r=await db.query(`select m.id membership_record_id,m.membership_number,m.status,m.start_date,m.end_date,m.card_token_version,
      p.name membership_type,p.product_code,p.id membership_product_id,
      coalesce(nullif(person.display_name,''),concat_ws(' ',person.first_name,person.middle_name,person.last_name)) member_name,
      pr.profile_picture_file_id
    from membership_record m
    join membership_product p on p.id=m.membership_product_id
    join app_user u on u.id=m.user_id
    left join person on person.user_id=u.id
    left join professional_profile pr on pr.person_id=person.id
    where m.user_id=$1
    order by (m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date)) desc,m.start_date desc nulls last,m.created_at desc
    limit 1`,[userId]);
  const row=r.rows[0];
  if(!row) throw fail(404,"No membership record is available for this account.","MEMBERSHIP_NOT_FOUND");
  const cardSettings=await settings(db);
  const token=tokenFor(row.membership_record_id,row.card_token_version);
  return {
    membershipRecordId:row.membership_record_id,
    membershipNumber:row.membership_number,
    memberName:row.member_name||"MPA Member",
    membershipType:row.membership_type,
    productCode:row.product_code,
    status:getMembershipCardStatus(row),
    startDate:row.start_date,
    endDate:row.end_date,
    profilePictureFileId:row.profile_picture_file_id,
    verificationPath:"/membership/verify?record="+encodeURIComponent(row.membership_record_id)+"&token="+encodeURIComponent(token),
    settings:cardSettings
  };
}
export async function getMembershipCardForAdmin(membershipNumber){
  const number=String(membershipNumber||"").trim().toUpperCase();
  if(!/^MPA-[0-9]{4}-[0-9A-F]{8}$/.test(number)) throw fail(400,"Enter a canonical MPA membership ID.","INVALID_MEMBERSHIP_NUMBER");
  const db=getPool();
  const r=await db.query(`select m.id membership_record_id,m.membership_number,m.status,m.start_date,m.end_date,m.card_token_version,
      p.name membership_type,p.product_code,
      coalesce(nullif(person.display_name,''),concat_ws(' ',person.first_name,person.middle_name,person.last_name)) member_name,
      pr.profile_picture_file_id
    from membership_record m join membership_product p on p.id=m.membership_product_id
    join app_user u on u.id=m.user_id
    left join person on person.user_id=u.id
    left join professional_profile pr on pr.person_id=person.id
    where upper(m.membership_number)=$1
    order by m.start_date desc nulls last,m.created_at desc limit 1`,[number]);
  const row=r.rows[0];
  if(!row) throw fail(404,"No membership record matches that ID.","MEMBERSHIP_NOT_FOUND");
  return {
    membershipRecordId:row.membership_record_id,membershipNumber:row.membership_number,
    memberName:row.member_name||"MPA Member",membershipType:row.membership_type,productCode:row.product_code,
    status:getMembershipCardStatus(row),startDate:row.start_date,endDate:row.end_date,
    profilePictureFileId:row.profile_picture_file_id,
    verificationPath:"/membership/verify?record="+encodeURIComponent(row.membership_record_id)+"&token="+encodeURIComponent(tokenFor(row.membership_record_id,row.card_token_version)),
    settings:await settings(db)
  };
}
export async function setMyProfilePicture(userId,fileObjectId,requestId){
  if(typeof fileObjectId!=="string"||!fileObjectId.trim()) throw fail(400,"A confirmed image file is required.","INVALID_PROFILE_PICTURE");
  return withTransaction(async db=>{
    const owner=(await db.query(`select p.id person_id,pr.id profile_id
      from app_user u join person p on p.user_id=u.id
      join professional_profile pr on pr.person_id=p.id
      where u.id=$1 and u.account_type='professional'
        and exists(select 1 from membership_record m where m.user_id=u.id and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date))
      for update of pr`,[userId])).rows[0];
    if(!owner) throw fail(403,"An active professional membership is required to change the profile picture.","MEMBERSHIP_REQUIRED");
    const file=(await db.query("select f.id,f.created_by,f.content_type,f.visibility from file_object f join private_upload_session s on s.file_object_id=f.id and s.status='confirmed' where f.id=$1",[fileObjectId])).rows[0];
    if(!file||file.created_by!==userId||file.visibility!=="private"||!["image/jpeg","image/png"].includes(file.content_type))
      throw fail(403,"Choose a confirmed JPEG or PNG image uploaded by your own account.","PROFILE_PICTURE_FILE_FORBIDDEN");
    await db.query("update professional_profile set profile_picture_file_id=$1,updated_at=now() where id=$2",[file.id,owner.profile_id]);
    await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'profile.picture_updated','professional_profile',$2,$3,'success',$4)",[userId,owner.profile_id,requestId,JSON.stringify({fileObjectId:file.id})]);
    return {profilePictureFileId:file.id};
  });
}
export async function removeMyProfilePicture(userId,requestId){
  return withTransaction(async db=>{
    const r=await db.query(`update professional_profile pr set profile_picture_file_id=null,updated_at=now()
      from person p where p.id=pr.person_id and p.user_id=$1
      and exists(select 1 from membership_record m where m.user_id=$1 and m.status='active' and m.start_date<=current_date and (m.end_date is null or m.end_date>=current_date))
      returning pr.id`,[userId]);
    if(!r.rows[0]) throw fail(403,"An active professional membership is required to change the profile picture.","MEMBERSHIP_REQUIRED");
    await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'profile.picture_removed','professional_profile',$2,$3,'success','{}')",[userId,r.rows[0].id,requestId]);
    return {profilePictureFileId:null};
  });
}
export async function updateMembershipCardSettings(actorId,input,requestId){
  const textFields={header_text:"headerText",subtitle_text:"subtitleText",footer_text:"footerText"};
  const values={};
  for(const [column,key] of Object.entries(textFields)){
    if(input[key]!==undefined){
      const value=String(input[key]??"").trim();
      const max=column==="header_text"?120:column==="subtitle_text"?80:180;
      if(!value||value.length>max) throw fail(400,key+" is required and must be "+max+" characters or fewer.","INVALID_CARD_SETTINGS");
      values[column]=value;
    }
  }
  for(const [column,key] of [["background_start","backgroundStart"],["background_end","backgroundEnd"],["accent_color","accentColor"],["text_color","textColor"]]){
    if(input[key]!==undefined){
      const value=String(input[key]||"");
      if(!/^#[0-9a-fA-F]{6}$/.test(value)) throw fail(400,key+" must be a six-digit hex color.","INVALID_CARD_SETTINGS");
      values[column]=value.toUpperCase();
    }
  }
  if(input.backgroundStyle!==undefined){
    if(!["geometric","gradient","midnight"].includes(input.backgroundStyle)) throw fail(400,"Choose a supported card background style.","INVALID_CARD_SETTINGS");
    values.background_style=input.backgroundStyle;
  }
  if(input.showMembershipType!==undefined){
    if(typeof input.showMembershipType!=="boolean") throw fail(400,"showMembershipType must be true or false.","INVALID_CARD_SETTINGS");
    values.show_membership_type=input.showMembershipType;
  }
  return withTransaction(async db=>{
    const before=await settings(db);
    const merged={...before,...values};
    const row=(await db.query(`insert into membership_card_settings(id,header_text,subtitle_text,footer_text,background_style,background_start,background_end,accent_color,text_color,show_membership_type,updated_by,updated_at)
      values(1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
      on conflict(id) do update set header_text=excluded.header_text,subtitle_text=excluded.subtitle_text,footer_text=excluded.footer_text,background_style=excluded.background_style,background_start=excluded.background_start,background_end=excluded.background_end,accent_color=excluded.accent_color,text_color=excluded.text_color,show_membership_type=excluded.show_membership_type,updated_by=excluded.updated_by,updated_at=now()
      returning header_text,subtitle_text,footer_text,background_style,background_start,background_end,accent_color,text_color,show_membership_type`,
      [merged.header_text,merged.subtitle_text,merged.footer_text,merged.background_style,merged.background_start,merged.background_end,merged.accent_color,merged.text_color,merged.show_membership_type,actorId])).rows[0];
    await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'membership.card_settings_updated','membership_card_settings','1',$2,'success',$3)",[actorId,requestId,JSON.stringify({fields:Object.keys(values)})]);
    return row;
  });
}
export async function getMembershipCardSettings(){ return settings(); }
export async function rotateMembershipCardVerification(recordId,actorId,requestId){
  return withTransaction(async db=>{
    const row=(await db.query("update membership_record set card_token_version=card_token_version+1,updated_at=now() where id=$1 returning id,card_token_version",[recordId])).rows[0];
    if(!row) throw fail(404,"Membership record not found.","NOT_FOUND");
    await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'membership.card_verification_rotated','membership_record',$2,$3,'success',$4)",[actorId,row.id,requestId,JSON.stringify({tokenVersion:row.card_token_version})]);
    return {membershipRecordId:row.id,verificationRotated:true};
  });
}
export async function verifyMembershipCard(recordId,token){
  if(typeof recordId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recordId)||typeof token!=="string") return {valid:false,status:"invalid",message:"This membership ID could not be verified."};
  const db=getPool();
  const row=(await db.query(`select m.id,m.membership_number,m.status,m.start_date,m.end_date,m.card_token_version,
      p.name membership_type,coalesce(nullif(person.display_name,''),concat_ws(' ',person.first_name,person.middle_name,person.last_name)) member_name
    from membership_record m join membership_product p on p.id=m.membership_product_id
    join person on person.user_id=m.user_id
    where m.id=$1 limit 1`,[recordId])).rows[0];
  if(!row||!tokenMatches(tokenFor(row.id,row.card_token_version),token))
    return {valid:false,status:"invalid",message:"This membership ID could not be verified."};
  const status=getMembershipCardStatus(row);
  return {
    valid:status==="active",
    status,
    membershipNumber:row.membership_number,
    memberName:row.member_name||"MPA Member",
    membershipType:row.membership_type,
    startDate:row.start_date,
    endDate:row.end_date,
    verifiedAt:new Date().toISOString(),
    message:status==="active"?"This membership is currently active.":status==="expired"?"This membership is not currently active.":"This membership is "+status+"."
  };
}

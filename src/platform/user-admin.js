import {getPool,withTransaction} from "./db.js";
import {hashPassword} from "../membership/identity.js";

function err(status,message,code="BUSINESS_RULE"){const e=new Error(message);e.statusCode=status;e.code=code;return e}
async function allowed(db,userId){const r=await db.query("select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",[userId]);return r.rows.map(x=>x.role_code)}
function admin(roles){if(!roles.some(x=>["system_admin","admin"].includes(x)))throw err(403,"Administrator role required.","FORBIDDEN")}
const SYSTEM_ROLE="system_admin";
const PRIVILEGED_ROLES=new Set([SYSTEM_ROLE,"super_admin","admin","reviewer","verification_reviewer","ethics_reviewer","appeal_reviewer","finance_officer"]);
const NON_PLATFORM_ROLES={
 organization_admin:{scope:"organization",reason:"Use an organization membership role instead."},
 recruiter:{scope:"organization_or_job",reason:"Use organization membership or job-team scope instead."},
 project_manager:{scope:"organization_or_project",reason:"Use organization or project assignment scope instead."},
 read_only:{scope:"organization",reason:"Use an organization membership role instead."},
 mentor:{scope:"profile",reason:"Mentor eligibility is based on a verified professional profile, not a platform role."}
};

export async function logout(userId,sessionId,requestId){
 return withTransaction(async tx=>{
  const result=await tx.query("update auth_session set revoked_at=now() where id=$1 and user_id=$2 and revoked_at is null returning id",[sessionId,userId]);
  if(result.rowCount){
   await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'account.logout','auth_session',$2,$3,'success',$4)",[userId,sessionId,requestId,JSON.stringify({})]);
  }
  return {loggedOut:true,sessionRevoked:result.rowCount===1};
 });
}

export async function listUsers(actor,input={}){
 const db=getPool(); const actorId=typeof actor==="string"?actor:actor?.sub; admin(await allowed(db,actorId)); const q=String(input.q||"").trim(); const status=input.status;
 const sql="select u.id,u.email,u.username,u.status,u.created_at,u.updated_at,coalesce(json_agg(distinct r.role_code) filter(where r.role_code is not null),'[]') roles from app_user u left join app_user_role ur on ur.user_id=u.id left join app_role r on r.id=ur.role_id where ($1='' or lower(u.email) like lower('%'||$1||'%') or lower(u.username) like lower('%'||$1||'%')) and ($2::text is null or u.status=$2) group by u.id order by u.created_at desc limit 200";
 return (await db.query(sql,[q,status||null])).rows;
}

export async function listRoles(actor){
 const actorRoles=await allowed(getPool(),actor); admin(actorRoles);
 const rows=(await getPool().query("select role_code,name,description from app_role order by name,role_code")).rows;
 return rows.map(row=>{
  const nonPlatform=NON_PLATFORM_ROLES[row.role_code];
  const privileged=PRIVILEGED_ROLES.has(row.role_code);
  return {...row,scope:nonPlatform?.scope||"platform",assignable:!nonPlatform&&(!privileged||actorRoles.includes(SYSTEM_ROLE)),privileged,assignmentNote:nonPlatform?.reason||null};
 });
}

export async function updateUser(actor,userId,input,requestId){
 const db=getPool();
 return withTransaction(async tx=>{
  // Resolve authority from the current database state inside the same transaction as the mutation.
  const actorRoles=await allowed(tx,actor); admin(actorRoles);
  const u=(await tx.query("select id,status from app_user where id=$1 for update",[userId])).rows[0];
  if(!u)throw err(404,"User not found.","NOT_FOUND");
  const status=input.status, roleCode=input.roleCode, removeRoleCode=input.removeRoleCode;
  if(status!==undefined && !["active","suspended","disabled"].includes(status))throw err(400,"Invalid user status.","VALIDATION_ERROR");
  if(status && userId===actor && status!=="active")throw err(400,"You cannot suspend or disable your own account.","SELF_LOCKOUT");
  if((roleCode!==undefined||removeRoleCode!==undefined)&&userId===actor)throw err(403,"Administrators cannot change their own roles. Use a separately authorized administrator account.","SELF_ROLE_CHANGE");
  const reason=String(input.reason||"").trim().slice(0,500)||null;
  if((status!==undefined||roleCode!==undefined||removeRoleCode!==undefined)&&!reason)throw err(400,"An audit reason is required for account status and role changes.","AUDIT_REASON_REQUIRED");

  const currentRoles=await allowed(tx,userId);
  const requestedRoles=[roleCode,removeRoleCode].filter(v=>v!==undefined);
  for(const requested of requestedRoles){
   const rr=(await tx.query("select id from app_role where role_code=$1",[requested])).rows[0];
   if(!rr)throw err(400,"Unknown role.","INVALID_ROLE");
   if(PRIVILEGED_ROLES.has(requested)&&!actorRoles.includes(SYSTEM_ROLE))
    throw err(403,"Only a system administrator may grant or remove privileged roles.","PRIVILEGED_ROLE_CHANGE");
  }
  const targetIsPrivileged=currentRoles.some(r=>PRIVILEGED_ROLES.has(r));
  if(targetIsPrivileged&&!actorRoles.includes(SYSTEM_ROLE))
   throw err(403,"Only a system administrator may modify a privileged account.","PRIVILEGED_ACCOUNT_CHANGE");

  if(status)await tx.query("update app_user set status=$1,updated_at=now() where id=$2",[status,userId]);
  if(roleCode!==undefined){
   const rr=(await tx.query("select id from app_role where role_code=$1",[roleCode])).rows[0];
   if(roleCode===SYSTEM_ROLE){
    await tx.query("select pg_advisory_xact_lock(hashtext('system_admin_role_membership'))");
   }
   await tx.query("insert into app_user_role(user_id,role_id,assigned_by) values($1,$2,$3) on conflict do nothing",[userId,rr.id,actor]);
  }
  if(removeRoleCode!==undefined){
   const rr=(await tx.query("select id from app_role where role_code=$1",[removeRoleCode])).rows[0];
   if(removeRoleCode===SYSTEM_ROLE){
    await tx.query("select pg_advisory_xact_lock(hashtext('system_admin_role_membership'))");
    const n=(await tx.query("select count(*)::int count from app_user_role ur join app_role r on r.id=ur.role_id where r.role_code=$1",[SYSTEM_ROLE])).rows[0].count;
    if(n<=1)throw err(400,"The last system administrator role cannot be removed.","LAST_ADMIN");
   }
   await tx.query("delete from app_user_role where user_id=$1 and role_id=$2",[userId,rr.id]);
  }
  // Any identity, status, or role change invalidates existing sessions, even when the role set is unchanged.
  if(roleCode!==undefined||removeRoleCode!==undefined||status!==undefined)
   await tx.query("update auth_session set revoked_at=now() where user_id=$1 and revoked_at is null",[userId]);
  const newRoles=await allowed(tx,userId);
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'admin.user.updated','app_user',$2,$3,'success',$4)",[
   actor,userId,requestId,JSON.stringify({scope:"platform",previousStatus:u.status,currentStatus:status??u.status,status:status??null,previousRoles:currentRoles,currentRoles:newRoles,roleCode:roleCode??null,removeRoleCode:removeRoleCode??null,reason})
  ]);
  return {id:userId,status:status||u.status,roles:newRoles};
 });
}

export async function revokeSessions(actor,userId,requestId,reasonInput){
 const db=getPool(); const actorRoles=await allowed(db,actor); admin(actorRoles);
 const reason=String(reasonInput||"").trim().slice(0,500);
 if(!reason)throw err(400,"An audit reason is required to revoke sessions.","AUDIT_REASON_REQUIRED");
 return withTransaction(async tx=>{
  const target=(await tx.query("select id from app_user where id=$1 for update",[userId])).rows[0];
  if(!target)throw err(404,"User not found.","NOT_FOUND");
  const targetRoles=await allowed(tx,userId);
  if(targetRoles.some(r=>PRIVILEGED_ROLES.has(r))&&!actorRoles.includes(SYSTEM_ROLE))throw err(403,"Only a system administrator may revoke sessions for a privileged account.","PRIVILEGED_ACCOUNT_CHANGE");
  const r=await tx.query("update auth_session set revoked_at=now() where user_id=$1 and revoked_at is null",[userId]);
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'admin.sessions.revoked','app_user',$2,$3,'success',$4)",[actor,userId,requestId,JSON.stringify({count:r.rowCount,reason})]);
  return {revoked:r.rowCount};
 });
}
export async function resetPassword(actor,userId,newPassword,requestId,reasonInput){
 const db=getPool(); const actorRoles=await allowed(db,actor); admin(actorRoles);
 if(String(newPassword||"").length<12)throw err(400,"Password must be at least 12 characters.","VALIDATION_ERROR");
 const reason=String(reasonInput||"").trim().slice(0,500);
 if(!reason)throw err(400,"An audit reason is required to reset a password.","AUDIT_REASON_REQUIRED");
 return withTransaction(async tx=>{
  const target=(await tx.query("select id from app_user where id=$1 for update",[userId])).rows[0];
  if(!target)throw err(404,"User not found.","NOT_FOUND");
  const targetRoles=await allowed(tx,userId);
  if(targetRoles.some(r=>PRIVILEGED_ROLES.has(r))&&!actorRoles.includes(SYSTEM_ROLE))throw err(403,"Only a system administrator may reset a privileged account.","PRIVILEGED_ACCOUNT_CHANGE");
  await tx.query("update app_user set password_hash=$1,updated_at=now() where id=$2",[hashPassword(newPassword),userId]);
  await tx.query("update auth_session set revoked_at=now() where user_id=$1 and revoked_at is null",[userId]);
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'admin.password.reset','app_user',$2,$3,'success',$4)",[actor,userId,requestId,JSON.stringify({reason})]);
  return {id:userId,sessionsRevoked:true};
 });
}

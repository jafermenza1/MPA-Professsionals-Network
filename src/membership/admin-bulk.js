import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getPool, withTransaction } from "../platform/db.js";
import { hashPassword, normalizeEmail, normalizePhone } from "./identity.js";
import { makeXlsx } from "../platform/reports.js";

function problem(status,message,code="BUSINESS_RULE"){const e=new Error(message);e.statusCode=status;e.code=code;return e}
const IMPORT_ROLES=["system_admin","admin","membership_reviewer","finance_officer"];
function assertImportAuthority(identity){
 const roles=identity?.roles||[],permissions=identity?.permissions||[];
 if(!roles.some(r=>IMPORT_ROLES.includes(r))&&!permissions.includes("members.import"))throw problem(403,"Membership import/export requires an authorized administrator.","FORBIDDEN");
}
function csvRows(csv){
 const rows=[];let row=[],field="",quoted=false;
 const input=String(csv||"").replace(/^\uFEFF/,"");
 for(let i=0;i<input.length;i++){const ch=input[i];if(quoted){if(ch==='"'&&input[i+1]==='"'){field+='"';i++;}else if(ch==='"')quoted=false;else field+=ch;}else if(ch==='"')quoted=true;else if(ch===","){row.push(field);field="";}else if(ch==="\n"){row.push(field.replace(/\r$/,""));if(row.some(v=>v.trim()))rows.push(row);row=[];field="";}else field+=ch;}
 if(quoted)throw problem(400,"The CSV contains an unclosed quoted field.","INVALID_CSV");
 if(field.length||row.length){row.push(field.replace(/\r$/,""));if(row.some(v=>v.trim()))rows.push(row);}
 if(!rows.length)throw problem(400,"The CSV file is empty.","EMPTY_IMPORT");
 const headers=rows.shift().map(h=>h.trim().toLowerCase().replace(/[\s-]+/g,"_"));
 if(new Set(headers).size!==headers.length)throw problem(400,"The CSV has duplicate column headings.","DUPLICATE_COLUMNS");
 const required=["email","full_name","membership_number","product_code","status","start_date","end_date","approved_membership"];
 const missing=required.filter(h=>!headers.includes(h));if(missing.length)throw problem(400,"Missing required columns: "+missing.join(", "),"MISSING_COLUMNS");
 return rows.map((values,index)=>({rowNumber:index+2,raw:Object.fromEntries(headers.map((h,i)=>[h,String(values[i]??"").trim()]))}));
}
function parseDate(v){if(!v)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v+"T00:00:00Z")))return null;return v;}
function cleanRow(row){
 const x=row.raw,errors=[];
 const email=normalizeEmail(x.email),fullName=String(x.full_name||"").trim().replace(/\s+/g," "),membershipNumber=String(x.membership_number||"").trim(),productCode=String(x.product_code||"").trim().toUpperCase(),status=String(x.status||"").trim().toLowerCase();
 const startDate=parseDate(x.start_date),endDate=parseDate(x.end_date),approved=String(x.approved_membership||"").trim().toLowerCase();
 if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))errors.push("Enter a valid email address.");
 if(!fullName||fullName.split(" ").length<2)errors.push("Enter first and last name in full_name.");
 if(!membershipNumber)errors.push("Membership number is required.");
 if(!/^[A-Z0-9_-]{2,32}$/.test(productCode))errors.push("Product code must contain 2–32 letters, digits, _ or -.");
 if(!["active","expired","pending","suspended","cancelled"].includes(status))errors.push("Status must be active, expired, pending, suspended or cancelled.");
 if(!startDate)errors.push("start_date must use YYYY-MM-DD.");
 if(x.end_date&&!endDate)errors.push("end_date must use YYYY-MM-DD or be blank.");
 if(startDate&&endDate&&endDate<startDate)errors.push("end_date cannot be before start_date.");
 if(approved!=="yes"&&approved!=="no")errors.push("approved_membership must be yes or no.");
 if(approved!=="yes")errors.push("This import is only for members already approved by MPA; confirm yes or resolve the record separately.");
 if(status==="active"&&approved!=="yes")errors.push("Active membership requires explicit confirmation that MPA already approved the member.");
 if(status==="active"&&endDate&&endDate<new Date().toISOString().slice(0,10))errors.push("An expired end date cannot be imported as active.");
 return {...row,email,phone:normalizePhone(x.phone),fullName,membershipNumber,productCode,status,startDate,endDate,approved:approved==="yes",legacyMemberId:String(x.legacy_member_id||"").trim()||null,approvalReference:String(x.approval_reference||"").trim()||null,notes:String(x.notes||"").trim()||null,errors};
}
function audit(db,actor,action,type,id,requestId,metadata={}){return db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,$3,$4,$5,'success',$6)",[actor,action,type,id,requestId,JSON.stringify(metadata)]);}
export function memberImportTemplate(identity){\n assertImportAuthority(identity);
 return "legacy_member_id,email,phone,full_name,membership_number,product_code,status,start_date,end_date,approved_membership,approval_reference,notes\r\n";
}
export async function previewMemberImport(identity,{filename="mpa-members.csv",csv="",sourceSystem="MPA approved member register"}={},requestId){
 assertImportAuthority(identity);
 if(!String(csv).trim())throw problem(400,"Choose a CSV file to import.","EMPTY_IMPORT");
 if(Buffer.byteLength(csv)>5*1024*1024)throw problem(413,"Member import CSV must be 5 MiB or smaller.","IMPORT_TOO_LARGE");
 const rows=csvRows(csv).map(cleanRow),db=getPool();
 const productCodes=[...new Set(rows.map(r=>r.productCode).filter(Boolean))];
 const products=(await db.query("select product_code from membership_product where active=true and product_code=any($1::text[])",[productCodes])).rows.map(r=>r.product_code);
 const seenEmail=new Set(),seenMembership=new Set(),seenLegacyId=new Set();
 for(const row of rows){
  if(!products.includes(row.productCode))row.errors.push("Unknown or inactive membership product code.");
  const ek=row.email.toLowerCase(),mk=row.membershipNumber.toLowerCase();
  if(seenEmail.has(ek))row.errors.push("Email is repeated in this file.");seenEmail.add(ek);
  if(seenMembership.has(mk))row.errors.push("Membership number is repeated in this file.");seenMembership.add(mk);
  if(row.legacyMemberId&&seenLegacyId.has(row.legacyMemberId.toLowerCase()))row.errors.push("Legacy member ID is repeated in this file.");if(row.legacyMemberId)seenLegacyId.add(row.legacyMemberId.toLowerCase());
  const matches=await db.query(`select u.id user_id,p.display_name,p.phone from app_user u left join person p on p.user_id=u.id where lower(u.email)=lower($1) or ($2::text is not null and p.phone=$2) order by u.created_at limit 3`,[row.email,row.phone]);
  if(matches.rows.length>1)row.errors.push("Email/phone matches multiple accounts; resolve this identity before importing.");
  else if(matches.rows.length===1)row.match={userId:matches.rows[0].user_id,displayName:matches.rows[0].display_name,matchReason:"existing email or phone"};
  const existing=await db.query("select id,user_id from membership_record where lower(membership_number)=lower($1) and status<>'merged' limit 1",[row.membershipNumber]);
  if(existing.rowCount)row.errors.push("Membership number already exists in the system.");
  if(row.legacyMemberId){const legacy=await db.query("select id from membership_record where source='legacy_import' and legacy_member_id=$1 limit 1",[row.legacyMemberId]);if(legacy.rowCount)row.errors.push("Legacy member ID already exists in an earlier import.");}
 }
 const importId=await withTransaction(async tx=>{
  const imp=(await tx.query("insert into membership_import(filename,source_system,status,row_count,matched_count,new_count,conflict_count,created_by) values($1,$2,'validated',$3,$4,$5,$6,$7) returning id",[String(filename).slice(0,255),String(sourceSystem).slice(0,160),rows.length,rows.filter(r=>r.match&&!r.errors.length).length,rows.filter(r=>!r.match&&!r.errors.length).length,rows.filter(r=>r.errors.length).length,identity.sub])).rows[0];
  for(const row of rows){
   const matchStatus=row.errors.length?"conflict":row.match?"matched":"new";
   await tx.query("insert into membership_import_row(import_id,row_number,legacy_member_id,email,phone,membership_number,full_name,product_code,status,start_date,end_date,raw_payload,match_status,matched_user_id,match_reason,diagnostics) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)",
    [imp.id,row.rowNumber,row.legacyMemberId,row.email,row.phone,row.membershipNumber,row.fullName,row.productCode,row.status,row.startDate,row.endDate,row.raw,matchStatus,row.match?.userId||null,row.match?.matchReason||null,JSON.stringify(row.errors)]);
  }
  await audit(tx,identity.sub,"membership.import.previewed","membership_import",imp.id,requestId,{rowCount:rows.length,matchedCount:rows.filter(r=>r.match&&!r.errors.length).length,newCount:rows.filter(r=>!r.match&&!r.errors.length).length,conflictCount:rows.filter(r=>r.errors.length).length,filename:String(filename).slice(0,255)});
  return imp.id;
 });
 return {importId,filename:String(filename).slice(0,255),rowCount:rows.length,matchedCount:rows.filter(r=>r.match&&!r.errors.length).length,newCount:rows.filter(r=>!r.match&&!r.errors.length).length,conflictCount:rows.filter(r=>r.errors.length).length,rows:rows.map(r=>({rowNumber:r.rowNumber,email:r.email,fullName:r.fullName,membershipNumber:r.membershipNumber,productCode:r.productCode,status:r.status,match:r.match?{displayName:r.match.displayName,reason:r.match.matchReason}:null,errors:r.errors,ready:r.errors.length===0}))};
}
export async function applyMemberImport(identity,importId,{reason=""}={},requestId){
 assertImportAuthority(identity);const why=String(reason).trim().slice(0,500);if(why.length<8)throw problem(400,"Enter an audit reason (at least 8 characters) before applying this import.","AUDIT_REASON_REQUIRED");
 return withTransaction(async tx=>{
  const imp=(await tx.query("select * from membership_import where id=$1 for update",[importId])).rows[0];
  if(!imp)throw problem(404,"Import batch not found.","NOT_FOUND");
  if(imp.status==="applied")return {importId,alreadyApplied:true,appliedCount:0,conflictCount:imp.conflict_count};
  if(!["validated","review"].includes(imp.status))throw problem(409,"This import is not ready to apply.","INVALID_IMPORT_STATE");
  const rows=(await tx.query("select * from membership_import_row where import_id=$1 order by row_number for update",[importId])).rows;
  const productRows=(await tx.query("select id,product_code,duration_days from membership_product where active=true")).rows,productMap=new Map(productRows.map(p=>[p.product_code,p]));
  let appliedCount=0,conflictCount=0,createdAccounts=0;
  for(const row of rows){
   if(row.match_status==="conflict"||row.match_status==="ignored"||row.match_status==="applied"){if(row.match_status==="conflict")conflictCount++;continue;}
   const product=productMap.get(row.product_code);
   if(!product){conflictCount++;await tx.query("update membership_import_row set match_status='conflict',diagnostics=$2 where id=$1",[row.id,JSON.stringify(["Membership product is no longer active or does not exist."])]);continue;}
   let userId=row.matched_user_id;
   if(!userId){
    const existing=(await tx.query("select id from app_user where lower(email)=lower($1) for update",[row.email])).rows[0];
    if(existing){userId=existing.id;await tx.query("update membership_import_row set match_status='conflict',matched_user_id=$2,match_reason='Account appeared after preview; re-review required',diagnostics=$3 where id=$1",[row.id,userId,JSON.stringify(["An account with this email was created after preview. Re-run the preview to avoid duplicates."])]);conflictCount++;continue;}
    const names=String(row.full_name).trim().split(/\s+/),firstName=names.shift(),lastName=names.pop(),middleName=names.join(" ")||null;
    const rawPassword=randomBytes(48).toString("base64url"),user=(await tx.query("insert into app_user(username,email,password_hash,status) values($1,$2,$3,'active') returning id,email",[row.email,row.email,hashPassword(rawPassword)])).rows[0];userId=user.id;createdAccounts++;accountCreatedForRow=true;
    const person=(await tx.query("insert into person(user_id,first_name,middle_name,last_name,display_name,phone) values($1,$2,$3,$4,$5,$6) returning id",[userId,firstName,middleName,lastName,row.full_name,row.phone])).rows[0];
    await tx.query("insert into professional_profile(person_id,completion_percent) values($1,20)",[person.id]);
    await tx.query("insert into app_user_role(user_id,role_id) select $1,id from app_role where role_code='member' on conflict do nothing",[userId]);
    await tx.query("insert into notification_preference(user_id) values($1) on conflict do nothing",[userId]);
    const token=randomBytes(32).toString("base64url"),tokenHash=createHash("sha256").update(token).digest("hex");
    await tx.query("insert into member_invitation(user_id,token_hash,expires_at,created_by,import_id) values($1,$2,now()+interval '7 days',$3,$4)",[userId,tokenHash,identity.sub,importId]);
    await tx.query("insert into notification_outbox(channel,recipient,template_code,payload) values('email',$1,'mpa_member_invitation',$2)",[row.email,JSON.stringify({displayName:row.full_name,invitationToken:token,claimPath:"/member-invitation/claim?token="+token,expiresInDays:7,importBatchId:importId})]);
   }
   const dup=(await tx.query("select id from membership_record where lower(membership_number)=lower($1) and status<>'merged' for update",[row.membership_number])).rows[0];
   if(dup){conflictCount++;await tx.query("update membership_import_row set match_status='conflict',matched_user_id=$2,diagnostics=$3 where id=$1",[row.id,userId,JSON.stringify(["Membership number already exists; no membership record was changed."])]);continue;}
   const member=(await tx.query("insert into membership_record(user_id,legacy_member_id,membership_product_id,membership_number,status,start_date,end_date,source,source_import_id,legacy_payload) values($1,$2,$3,$4,$5,$6,$7,'legacy_import',$8,$9) returning id",[userId,row.legacy_member_id,product.id,row.membership_number,row.status,row.start_date,row.end_date,importId,row.raw_payload])).rows[0];
   await tx.query("insert into membership_event(membership_id,event_type,effective_at,actor_user_id,source,details) values($1,'legacy_member_imported',now(),$2,'legacy_import',$3)",[member.id,identity.sub,JSON.stringify({importId,rowNumber:row.row_number,approvalConfirmed:row.raw_payload?.approved_membership==="yes",approvalReference:row.raw_payload?.approval_reference||null,reason:why,paymentImported:false})]);
   await tx.query("update membership_import_row set match_status='applied',matched_user_id=$2,matched_membership_id=$3,match_reason=coalesce(match_reason,'account created from approved-member import'),diagnostics='[]'::jsonb where id=$1",[row.id,userId,member.id]);
   await audit(tx,identity.sub,"membership.import.row_applied","membership_record",member.id,requestId,{importId,rowNumber:row.row_number,email:row.email,membershipNumber:row.membership_number,status:row.status,accountCreated:accountCreatedForRow,reason:why});
   appliedCount++;
  }
  const remaining=(await tx.query("select count(*)::int count from membership_import_row where import_id=$1 and match_status in ('new','matched')",[importId])).rows[0].count;
  const finalStatus=remaining===0?"applied":"review";
  await tx.query("update membership_import set status=$2,applied_at=case when $2='applied' then now() else applied_at end,matched_count=$3,new_count=$4,conflict_count=$5 where id=$1",[importId,finalStatus,rows.filter(r=>r.match_status==="matched").length,rows.filter(r=>r.match_status==="new").length,conflictCount]);
  await audit(tx,identity.sub,"membership.import.applied","membership_import",importId,requestId,{appliedCount,conflictCount,createdAccounts,reason:why});
  return {importId,status:finalStatus,appliedCount,createdAccounts,conflictCount,requiresReview:finalStatus!=="applied",notice:"Imported historical payments are not created or marked as verified by this workflow."};
 });
}
export async function exportMembers(identity,{q="",status="",format="csv"}={},requestId){
 assertImportAuthority(identity);if(!["csv","xlsx"].includes(format))throw problem(400,"Choose CSV or XLSX for member detail export.","UNSUPPORTED_FORMAT");
 const rows=(await getPool().query(`select mr.legacy_member_id,mr.membership_number,membership_product.product_code,membership_product.name product_name,mr.status,mr.start_date,mr.end_date,mr.source,u.email,p.phone,p.display_name full_name,mr.created_at
 from membership_record mr left join app_user u on u.id=mr.user_id left join person p on p.user_id=mr.user_id left join membership_product on membership_product.id=mr.membership_product_id
 where ($1='' or lower(coalesce(p.display_name,'')) like lower('%'||$1||'%') or lower(coalesce(u.email,'')) like lower('%'||$1||'%') or lower(mr.membership_number) like lower('%'||$1||'%'))
 and ($2='' or mr.status=$2) order by mr.created_at desc limit 10000`,[String(q).slice(0,120),String(status).slice(0,30)])).rows;
 const headers=["legacy_member_id","email","phone","full_name","membership_number","product_code","product_name","status","start_date","end_date","source","created_at"];
 const esc=v=>{let s=v==null?"":v instanceof Date?v.toISOString().slice(0,10):String(v);return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
 const csv=[headers.join(","),...rows.map(row=>headers.map(h=>esc(row[h])).join(","))].join("\r\n")+"\r\n";
 const filename="mpa-members-"+new Date().toISOString().slice(0,10)+(format==="xlsx"?".xlsx":".csv");
 const buffer=format==="xlsx"?makeXlsx({report:{title:"MPA member directory",scope:"Restricted platform PII",definition:"Member contact and membership details. Treat this export as confidential.",columns:headers},filters:{q,status},generatedAt:new Date().toISOString(),rows:rows.map(row=>Object.fromEntries(headers.map(h=>[h,row[h] instanceof Date?row[h].toISOString():row[h]??""]))) ,totals:{rows:rows.length}}):Buffer.from(csv,"utf8");
 await getPool().query("insert into audit_log(actor_user_id,action,resource_type,request_id,outcome,metadata) values($1,'membership.exported','membership_record',$2,'success',$3)",[identity.sub,requestId,JSON.stringify({format,rowCount:rows.length,filters:{q,status}})]);
 return {buffer,rowCount:rows.length,filename,contentType:format==="xlsx"?"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":"text/csv; charset=utf-8"};
}
export async function claimMemberInvitation({token,password}){
 if(typeof token!=="string"||token.length<32)throw problem(400,"A valid member invitation token is required.","INVALID_INVITATION");
 if(typeof password!=="string"||password.length<10)throw problem(400,"Choose a password with at least 10 characters.","PASSWORD_TOO_SHORT");
 const tokenHash=createHash("sha256").update(token).digest("hex");
 return withTransaction(async tx=>{
  const inv=(await tx.query("select id,user_id,expires_at,consumed_at from member_invitation where token_hash=$1 for update",[tokenHash])).rows[0];
  if(!inv||inv.consumed_at||new Date(inv.expires_at)<=new Date())throw problem(400,"This invitation is invalid, expired or already used. Contact MPA support for a new invitation.","INVITATION_EXPIRED");
  await tx.query("update app_user set password_hash=$2,updated_at=now() where id=$1",[inv.user_id,hashPassword(password)]);
  await tx.query("update member_invitation set consumed_at=now() where id=$1",[inv.id]);
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,outcome,metadata) values($1,'membership.invitation_claimed','app_user',$1,'success',$2)",[inv.user_id,JSON.stringify({invitationId:inv.id})]);
  return {claimed:true,message:"Your account is ready. Sign in with your email and new password."};
 });
}

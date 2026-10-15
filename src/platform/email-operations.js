import { getPool, withTransaction } from "./db.js";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { resendEmailVerification } from "./email-verification.js";

function fail(status,message,code="BUSINESS_RULE"){throw Object.assign(new Error(message),{statusCode:status,code});}
async function requireAdmin(db,actorId){
 const roles=(await db.query("select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",[actorId])).rows.map(x=>x.role_code);
 if(!roles.includes("system_admin"))fail(403,"System administrator access is required for email operations.","FORBIDDEN");
}
const clean=(v,max=2000)=>String(v??"").trim().slice(0,max);
function render(template,vars){
 return String(template||"").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,(_,key)=>String(vars?.[key]??""));
}
function providerConfig(){
 const apiKey=clean(process.env.RESEND_API_KEY,500),from=clean(process.env.EMAIL_FROM,320);
 const endpoint=clean(process.env.EMAIL_DELIVERY_WEBHOOK_URL),secret=clean(process.env.EMAIL_DELIVERY_WEBHOOK_SECRET);
 const environment=process.env.NODE_ENV||"development";
 let publicUrl="",publicValid=false;
 try{
  const parsed=new URL(clean(process.env.PUBLIC_APP_URL));
  publicUrl=parsed.origin;
  publicValid=parsed.username===""&&parsed.password===""&&parsed.pathname==="/"&&!parsed.search&&!parsed.hash&&(environment!=="production"||parsed.protocol==="https:");
 }catch{}
 const resendConfigured=Boolean(apiKey&&from.includes("@"));
 const webhookConfigured=Boolean(endpoint&&secret);
 let webhookValid=false;
 try{webhookValid=new URL(endpoint).protocol==="https:";}catch{}
 const provider=resendConfigured?"resend":webhookConfigured?"signed-webhook":"not-configured";
 return {provider,ready:Boolean(publicValid&&(resendConfigured||(webhookConfigured&&webhookValid))),publicUrl,fromConfigured:Boolean(from),apiKeyConfigured:Boolean(apiKey),webhookConfigured, inboundConfigured:Boolean(clean(process.env.EMAIL_INBOUND_WEBHOOK_SECRET)),environment,sender:from?from:null};
}
export async function queueWorkflowEmail(db,userId,templateCode,variables={},resourceType="workflow",resourceId=null){
 const user=(await db.query("select u.email,coalesce(np.email_enabled,true) email_enabled,p.first_name from app_user u left join notification_preference np on np.user_id=u.id left join person p on p.user_id=u.id where u.id=$1",[userId])).rows[0];
 if(!user?.email||!user.email_enabled)return false;
 const vars={firstName:user.first_name||"",...variables};
 await db.query("insert into notification_event(user_id,event_code,resource_type,resource_id,payload) values($1,$2,$3,$4,$5)",[userId,templateCode,resourceType,resourceId,vars]);
 await db.query("insert into notification_outbox(channel,recipient,template_code,payload,status,updated_at) values('email',$1,$2,$3,'pending',now())",[user.email,templateCode,{...vars,variables:vars}]);
 return true;
}
export async function getEmailOperations(actorId){
 const db=getPool();await requireAdmin(db,actorId);
 const cfg=providerConfig();
 const counts=(await db.query("select status,count(*)::int count from notification_outbox where channel='email' group by status")).rows;
 const drafts=(await db.query("select count(*)::int count from email_outbox_draft where status='draft'")).rows[0]?.count||0;
 const unread=(await db.query("select count(*)::int count from email_inbox_message where read_at is null and archived_at is null")).rows[0]?.count||0;
 return {connection:{...cfg,environment:process.env.NODE_ENV||"development",sender:cfg.fromConfigured?clean(process.env.EMAIL_FROM,320):null},counts:Object.fromEntries(counts.map(x=>[x.status,x.count])),drafts:Number(drafts),unread:Number(unread)};
}
export async function listEmailOutbox(actorId,{folder="outbox",limit=100}={}){
 const db=getPool();await requireAdmin(db,actorId);
 const n=Math.min(Math.max(Number(limit)||100,1),200);
 if(folder==="drafts")return (await db.query("select id,recipient,subject,text_body,html_body,status,created_at,updated_at from email_outbox_draft where status='draft' order by updated_at desc limit $1",[n])).rows;
 if(folder==="inbox")return (await db.query("select id,provider_message_id,sender,recipients,subject,text_body,received_at,read_at,archived_at from email_inbox_message where archived_at is null order by received_at desc limit $1",[n])).rows;
 if(folder==="verification-failed")return (await db.query("select t.id,u.email recipient,'Email verification delivery failed' subject,coalesce(t.delivery_error_code,'Delivery failed') last_error,t.delivery_attempted_at created_at,'failed' status from email_verification_token t join app_user u on u.id=t.user_id where t.delivery_status='failed' and t.consumed_at is null order by t.delivery_attempted_at desc nulls last limit $1",[n])).rows;
 const status=folder==="sent"?"sent":folder==="failed"?"failed":folder==="queued"?"pending":null;
 return (await db.query(`select id,recipient,template_code,coalesce(subject,'') subject,coalesce(text_body,payload->>'text','') text_body,status,attempts,next_attempt_at,provider_message_id,last_error,delivery_error_code,created_at,updated_at,sent_at
 from notification_outbox where channel='email' and ($1::text is null or status=$1) order by created_at desc limit $2`,[status,n])).rows;
}
export async function listEmailTemplates(actorId){
 const db=getPool();await requireAdmin(db,actorId);
 return (await db.query("select template_code,display_name,audience,subject_template,text_template,html_template,enabled,adjustable_by_admin,updated_at from email_notification_template order by audience,display_name")).rows;
}
export async function saveEmailTemplate(actorId,code,input,requestId){
 const db=getPool();await requireAdmin(db,actorId);
 const templateCode=clean(code,100);
 if(templateCode==="account.email_verification"&&input.enabled===false)fail(400,"Email verification is security-critical and cannot be disabled.","SECURITY_TEMPLATE_REQUIRED");
 const subject=clean(input.subjectTemplate,300),textBody=String(input.textTemplate||"").slice(0,20000),html=String(input.htmlTemplate||"").slice(0,30000);
 if(!/^[a-zA-Z0-9_.-]{2,100}$/.test(templateCode)||!subject||!textBody)fail(400,"Template code, subject and text body are required.","VALIDATION_ERROR");
 const audience=["all","professional","organization_representative","reviewer","administrator","employer","mentor"].includes(input.audience)?input.audience:"all";
 return withTransaction(async tx=>{
  const row=(await tx.query(`insert into email_notification_template(template_code,display_name,audience,subject_template,text_template,html_template,enabled,updated_by,updated_at)
 values($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict(template_code) do update set display_name=excluded.display_name,audience=excluded.audience,subject_template=excluded.subject_template,text_template=excluded.text_template,html_template=excluded.html_template,enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now()
 returning template_code,display_name,audience,subject_template,text_template,html_template,enabled,adjustable_by_admin,updated_at`,[templateCode,clean(input.displayName,150)||templateCode,audience,subject,textBody,html, input.enabled!==false,actorId])).rows[0];
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'email.template.updated','email_notification_template',$2,$3,'success',$4)",[actorId,templateCode,requestId,{audience,enabled:input.enabled!==false}]);
  return row;
 });
}
export async function saveEmailDraft(actorId,input){
 const db=getPool();await requireAdmin(db,actorId);
 const recipient=clean(input.recipient,320),subject=clean(input.subject,300),textBody=String(input.textBody||"").slice(0,20000),htmlBody=String(input.htmlBody||"").slice(0,30000);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)||!subject||(!textBody&&!htmlBody))fail(400,"A valid recipient, subject and message body are required.","VALIDATION_ERROR");
 return (await db.query("insert into email_outbox_draft(created_by,recipient,subject,text_body,html_body) values($1,$2,$3,$4,$5) returning id,recipient,subject,text_body,html_body,status,created_at,updated_at",[actorId,recipient,subject,textBody,htmlBody])).rows[0];
}
async function sendMessage({recipient,subject,textBody,htmlBody,templateCode,payload,providerMessageId=null}){
 const cfg=providerConfig();
 if(!cfg.ready)fail(503,"Email provider is not configured. Set PUBLIC_APP_URL and Resend or signed-webhook credentials in the server environment.","EMAIL_DELIVERY_NOT_CONFIGURED");
 if(cfg.provider==="resend"){
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+clean(process.env.RESEND_API_KEY)},body:JSON.stringify({from:clean(process.env.EMAIL_FROM),to:[recipient],subject,text:textBody||"",html:htmlBody||undefined}),signal:AbortSignal.timeout(10000)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error("Resend rejected the message (HTTP "+response.status+")."),{code:"RESEND_HTTP_"+response.status});
  return {providerMessageId:result.id||null};
 }
 const endpoint=clean(process.env.EMAIL_DELIVERY_WEBHOOK_URL),secret=clean(process.env.EMAIL_DELIVERY_WEBHOOK_SECRET);
 const body=JSON.stringify({to:recipient,subject,text:textBody||"",html:htmlBody||"",template:templateCode||"manual",payload:payload||{}});
 const signature=createHmac("sha256",secret).update(body).digest("hex");
 const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+secret,"x-mpa-payload-signature":signature},body,signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Object.assign(new Error("Email delivery webhook rejected the message (HTTP "+response.status+")."),{code:"DELIVERY_HTTP_"+response.status});
 const result=await response.json().catch(()=>({}));
 return {providerMessageId:result.messageId||result.id||null};
}
export async function queueEmailDraft(actorId,draftId,requestId){
 const db=getPool();await requireAdmin(db,actorId);
 return withTransaction(async tx=>{
  const draft=(await tx.query("select * from email_outbox_draft where id=$1 and status='draft' for update",[draftId])).rows[0];
  if(!draft)fail(404,"Draft not found or already queued.","NOT_FOUND");
  const queued=(await tx.query("insert into notification_outbox(channel,recipient,template_code,payload,status,subject,text_body,html_body,created_by,updated_at) values('email',$1,'admin.manual',$2,'pending',$3,$4,$5,$6,now()) returning id",[draft.recipient,{source:"admin_email_center",draftId:draft.id},draft.subject,draft.text_body,draft.html_body,actorId])).rows[0];
  await tx.query("update email_outbox_draft set status='queued',queued_outbox_id=$1,updated_at=now() where id=$2",[queued.id,draft.id]);
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'email.draft.queued','notification_outbox',$2,$3,'success',$4)",[actorId,queued.id,requestId,{draftId:draft.id}]);
  return {queued:true,outboxId:queued.id};
 });
}
export async function dispatchEmailOutbox(actorId,{limit=20,onlyId=null,system=false}={}){
 const db=getPool();if(!system)await requireAdmin(db,actorId);
 if(!providerConfig().ready)fail(503,"Email provider is not configured. Set server-side email credentials first.","EMAIL_DELIVERY_NOT_CONFIGURED");
 const batch=Math.min(Math.max(Number(limit)||20,1),50);
 const claimed=await withTransaction(async tx=>{
  await tx.query("update notification_outbox set status='pending',next_attempt_at=now(),locked_at=null,updated_at=now() where channel='email' and status='processing' and locked_at<now()-interval '5 minutes'");
  const rows=(await tx.query(`select id,recipient,template_code,payload,subject,text_body,html_body,attempts
   from notification_outbox where channel='email' and (status='pending' or (status='failed' and next_attempt_at is not null and next_attempt_at<=now()))
   and ($1::uuid is null or id=$1::uuid) and coalesce(next_attempt_at,created_at)<=now()
   order by created_at for update skip locked limit $2`,[onlyId,batch])).rows;
  for(const row of rows)await tx.query("update notification_outbox set status='processing',attempts=attempts+1,locked_at=now(),updated_at=now() where id=$1",[row.id]);
  return rows;
 });
 const results=[];
 for(const row of claimed){
  try{
   let subject=row.subject||"",textBody=row.text_body||row.payload?.text||"",htmlBody=row.html_body||row.payload?.html||"";
   const template=(await db.query("select subject_template,text_template,html_template,enabled from email_notification_template where template_code=$1",[row.template_code])).rows[0];
   if(template&&!template.enabled){await db.query("update notification_outbox set status='cancelled',last_error='Notification template disabled by administrator',locked_at=null,updated_at=now() where id=$1",[row.id]);results.push({id:row.id,status:"cancelled"});continue;}
   if(template?.enabled){const vars={...(row.payload||{}),...(row.payload?.variables||{})};subject=render(template.subject_template,vars);textBody=render(template.text_template,vars);htmlBody=render(template.html_template,vars);}
   const humanEvent=String(row.template_code||"account update").replace(/[._-]+/g," ").replace(/\b\w/g,ch=>ch.toUpperCase());
   if(!subject)subject=humanEvent+" · MPA Professionals Network";
   if(!textBody)textBody="There is a new update to your MPA Professionals Network account.\n\n"+(row.payload?.status?"Status: "+row.payload.status+"\n":"")+(row.payload?.nextAction?"Next action: "+row.payload.nextAction+"\n":"")+(row.payload?.registrationReference?"Reference: "+row.payload.registrationReference+"\n":"")+"Sign in to the platform to review the latest details. If you need help, contact platform support.";
   if(!htmlBody)htmlBody="<p>There is a new update to your MPA Professionals Network account.</p>"+(row.payload?.status?"<p>Status: "+String(row.payload.status).replace(/[&<>]/g,"")+" </p>":"")+(row.payload?.nextAction?"<p>Next action: "+String(row.payload.nextAction).replace(/[&<>]/g,"")+"</p>":"")+(row.payload?.registrationReference?"<p>Reference: <strong>"+String(row.payload.registrationReference).replace(/[&<>]/g,"")+"</strong></p>":"")+"<p>Sign in to the platform to review the latest details.</p>";
   if(!subject)subject="Notification from MPA Professionals Network";
   const sent=await sendMessage({recipient:row.recipient,subject,textBody,htmlBody,templateCode:row.template_code,payload:row.payload});
   await db.query("update notification_outbox set status='sent',sent_at=now(),provider_message_id=$1,last_error=null,delivery_error_code=null,next_attempt_at=null,locked_at=null,updated_at=now() where id=$2",[sent.providerMessageId,row.id]);
   results.push({id:row.id,status:"sent"});
  }catch(e){
   const attempt=Number(row.attempts||0)+1,delay=Math.min(3600,30*Math.pow(2,Math.min(attempt,7)));
   const failed=attempt>=8;
   await db.query("update notification_outbox set status=$1,last_error=$2,delivery_error_code=$3,next_attempt_at=$4,locked_at=null,updated_at=now() where id=$5",[failed?"failed":"pending",clean(e.message,500),clean(e.code||"DELIVERY_FAILED",80),failed?null:new Date(Date.now()+delay*1000),row.id]);
   results.push({id:row.id,status:failed?"failed":"pending",error:clean(e.message,250)});
  }
 }
 return {processed:results.length,results};
}
export async function retryVerificationEmail(actorId,id,requestId){
 const db=getPool();await requireAdmin(db,actorId);
 if(!providerConfig().ready)fail(503,"Configure the email provider before retrying verification messages.","EMAIL_DELIVERY_NOT_CONFIGURED");
 const row=(await db.query("select u.email from email_verification_token t join app_user u on u.id=t.user_id where t.id=$1 and t.delivery_status='failed' and t.consumed_at is null",[id])).rows[0];
 if(!row)fail(409,"Only unconsumed verification messages with a recorded delivery failure can be retried.","INVALID_STATE");
 const result=await resendEmailVerification(row.email,requestId);
 await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'email.verification.retry_requested','email_verification_token',$2,$3,'success',$4)",[actorId,id,requestId,{attemptRequested:Boolean(result.accepted)}]);
 return {requested:Boolean(result.accepted)};
}
export async function retryFailedEmail(actorId,id){
 const db=getPool();await requireAdmin(db,actorId);
 if(!providerConfig().ready)fail(503,"Configure the email provider before retrying failed messages.","EMAIL_DELIVERY_NOT_CONFIGURED");
 const row=(await db.query("update notification_outbox set status='pending',attempts=0,next_attempt_at=now(),last_error=null,delivery_error_code=null,updated_at=now() where id=$1 and channel='email' and status='failed' returning id",[id])).rows[0];
 if(!row)fail(409,"Only failed email messages can be retried.","INVALID_STATE");
 return dispatchEmailOutbox(actorId,{limit:1,onlyId:id});
}
export async function updateInbox(actorId,id,action){
 const db=getPool();await requireAdmin(db,actorId);
 if(action==="read")return (await db.query("update email_inbox_message set read_at=coalesce(read_at,now()) where id=$1 and archived_at is null returning id,read_at",[id])).rows[0]||fail(404,"Message not found.","NOT_FOUND");
 if(action==="unread")return (await db.query("update email_inbox_message set read_at=null where id=$1 and archived_at is null returning id,read_at",[id])).rows[0]||fail(404,"Message not found.","NOT_FOUND");
 if(action==="archive")return (await db.query("update email_inbox_message set archived_at=now() where id=$1 and archived_at is null returning id,archived_at",[id])).rows[0]||fail(404,"Message not found.","NOT_FOUND");
 fail(400,"Unsupported inbox action.","VALIDATION_ERROR");
}
export async function receiveInboundEmail(input,providedSecret){
 const expected=clean(process.env.EMAIL_INBOUND_WEBHOOK_SECRET,500);
 if(!expected||!providedSecret||Buffer.byteLength(expected)!==Buffer.byteLength(providedSecret)||!timingSafeEqual(Buffer.from(expected),Buffer.from(providedSecret)))fail(401,"Inbound email webhook is not authorized.","UNAUTHENTICATED");
 const providerMessageId=clean(input.messageId||input.id,300)||randomUUID(),sender=clean(input.from||input.sender,320);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender))fail(400,"Inbound sender address is invalid.","VALIDATION_ERROR");
 return (await getPool().query("insert into email_inbox_message(provider_message_id,sender,recipients,subject,text_body,html_body,metadata) values($1,$2,$3,$4,$5,$6,$7) on conflict(provider_message_id) do nothing returning id,received_at",[providerMessageId,sender,Array.isArray(input.to)?input.to.map(v=>clean(v,320)).slice(0,20):[],clean(input.subject,500),String(input.text||"").slice(0,50000),String(input.html||"").slice(0,100000),{provider:"configured-inbound-webhook"}])).rows[0]||{duplicate:true};
}

// Server worker entry point: only queued platform messages are processed; no caller identity is accepted from HTTP.
export async function dispatchPendingSystemEmail(){
 if(!providerConfig().ready)return {processed:0,results:[],skipped:"provider_not_configured"};
 return dispatchEmailOutbox(null,{limit:20,system:true});
}

export async function sendTestEmail(actorId,requestId){
 const db=getPool();await requireAdmin(db,actorId);
 const user=(await db.query("select email from app_user where id=$1",[actorId])).rows[0];
 if(!user?.email)fail(400,"The administrator account has no email address configured.","EMAIL_ADDRESS_MISSING");
 const sent=await sendMessage({recipient:user.email,subject:"MPA Network email connection test",textBody:"This is a test message from the MPA Professionals Network email operations center. The configured provider accepted this message.",htmlBody:"<p>This is a test message from the MPA Professionals Network email operations center.</p><p>The configured provider accepted this message.</p>",templateCode:"admin.email_connection_test",payload:{}});
 await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'email.connection.test_sent','email_provider',$2,$3,'success',$4)",[actorId,sent.providerMessageId||null,requestId,{provider:providerConfig().provider}]);
 return {sent:true,recipient:user.email,provider:providerConfig().provider,providerMessageId:sent.providerMessageId};
}

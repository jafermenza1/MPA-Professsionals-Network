import {closePool,getPool,withTransaction} from "../src/platform/db.js";

const apiKey=process.env.RESEND_API_KEY;
const from=process.env.EMAIL_FROM;
if(!apiKey||!from){
 console.error("Account recovery email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM; queued messages remain pending.");
 process.exitCode=1;
}else{
 try{
  const pool=getPool();
  const rows=await withTransaction(async tx=>{
   const result=await tx.query(`with candidates as (
     select id from notification_outbox
     where channel='email' and template_code='account.one_time_session_link' and status='pending'
       and (next_attempt_at is null or next_attempt_at<=now())
     order by created_at
     for update skip locked
     limit 20
   )
   update notification_outbox n set status='processing',attempts=n.attempts+1
   from candidates c where n.id=c.id
   returning n.id,n.recipient,n.payload,n.attempts`);
   return result.rows;
  });
  let sent=0,failed=0;
  for(const row of rows){
   try{
    const payload=typeof row.payload==="string"?JSON.parse(row.payload):row.payload;
    const url=new URL(String(payload?.url||""));
    if(process.env.NODE_ENV==="production"&&url.protocol!=="https:")throw new Error("Recovery links must use HTTPS in production.");
    if(!payload?.url||url.pathname!=="/account/one-time-access")throw new Error("Recovery email payload did not contain a valid account recovery URL.");
    const link=String(payload.url).replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;");
    const textBody=[
     "You asked for help signing in to your MPA account.",
     "",
     "Use this secure link to sign in and choose a new password:",
     String(payload.url),
     "",
     "This link can be used once and expires in 20 minutes. Using it signs out other active sessions.",
     "If you did not request this, do not use or forward the link. Contact MPA through a known support channel."
    ].join("\n");
    const htmlBody=`<p>You asked for help signing in to your MPA account.</p><p><a href="${link}">Continue securely and choose a new password</a></p><p>This link can be used once and expires in 20 minutes. Using it signs out other active sessions.</p><p>If you did not request this, do not use or forward the link. Contact MPA through a known support channel.</p>`;
    const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},body:JSON.stringify({from,to:[row.recipient],subject:"Your one-time MPA sign-in link",text:textBody,html:htmlBody})});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error("Email provider returned HTTP "+response.status);
    await pool.query("update notification_outbox set status='sent',sent_at=now(),provider_message_id=$2,last_error=null,next_attempt_at=null where id=$1",[row.id,body.id||null]);
    sent++;
   }catch(error){
    const delay=Math.min(60,2**Math.min(Number(row.attempts)||1,6));
    const status=Number(row.attempts)>=5?"failed":"pending";
    await pool.query("update notification_outbox set status=$2,last_error=$3,next_attempt_at=case when $2='pending' then now()+make_interval(mins=>$4) else null end where id=$1",[row.id,status,String(error?.message||"Email delivery failed").slice(0,500),delay]);
    console.error("Could not deliver account recovery email",row.id,"attempt",row.attempts,"status",status);
    failed++;
   }
  }
  console.log(JSON.stringify({claimed:rows.length,sent,failed}));
 }catch(error){console.error("Account recovery email dispatch failed:",error?.message||error);process.exitCode=1}
 finally{await closePool()}
}

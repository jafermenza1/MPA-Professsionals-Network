import { randomUUID } from "node:crypto";
import { withTransaction, getPool } from "../platform/db.js";
import { signToken, newSessionToken, hashSessionToken, sessionTokenPayload } from "../platform/auth.js";
import { loadConfig } from "../platform/config.js";
import { nextTrackingReference } from "../platform/tracking-reference.js";
import { hashPassword, verifyPassword, normalizeEmail, normalizePhone, normalizeName, validatePersonInput } from "./identity.js";

function httpError(status,message,code="BUSINESS_RULE"){
  const e=new Error(message); e.statusCode=status; e.code=code; return e;
}
async function tokenFor(db,user,roles,requestMeta={}){
  const raw=newSessionToken(); const ttl=Number(process.env.AUTH_SESSION_DAYS||7);
  const row=(await db.query("insert into auth_session(user_id,token_hash,expires_at,ip_address,user_agent) values($1,$2,now()+make_interval(days=>$3),$4,$5) returning id",[user.id,hashSessionToken(raw),ttl,requestMeta.ip||null,requestMeta.userAgent||null])).rows[0];
  return signToken(sessionTokenPayload(user,roles,row.id),loadConfig().jwtSecret);
}
function audit(db,actor,action,type,id,requestId,metadata={}){
  return db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,$3,$4,$5,'success',$6)",[actor||null,action,type,id||null,requestId||null,metadata]);
}
async function notify(db,userId,eventCode,resourceType,resourceId,payload={}){
  await db.query("insert into notification_event(user_id,event_code,resource_type,resource_id,payload) values($1,$2,$3,$4,$5)",[userId,eventCode,resourceType||null,resourceId||null,payload]);
  const r=await db.query("select email from app_user where id=$1",[userId]);
  if(r.rows[0]?.email) await db.query("insert into notification_outbox(channel,recipient,template_code,payload) values('email',$1,$2,$3)",[r.rows[0].email,eventCode,payload]);
}
async function roles(db,userId){
  const r=await db.query("select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",[userId]);
  return r.rows.map(x=>x.role_code);
}
function amountFromProduct(product){ return Number(product.price); }

export async function bootstrapAdmin(input){
  const email=normalizeEmail(input.email); const password=String(input.password||"");
  if(!email||password.length<14) throw httpError(400,"Bootstrap admin email and a password of at least 14 characters are required.","BOOTSTRAP_INVALID");
  return withTransaction(async db=>{
    const existing=await db.query("select id,email,status from app_user where lower(email)=lower($1)",[email]);
    let user=existing.rows[0];
    if(user && user.status!=="active") await db.query("update app_user set status='active',updated_at=now() where id=$1",[user.id]);
    if(!user) user=(await db.query("insert into app_user(username,email,password_hash,status) values($1,$1,$2,'active') returning id,email,status",[email, hashPassword(password)])).rows[0];
    const role=(await db.query("select id from app_role where role_code='system_admin'")).rows[0];
    if(!role) throw httpError(500,"System administrator role is unavailable.","BOOTSTRAP_ROLE_MISSING");
    await db.query("insert into app_user_role(user_id,role_id) values($1,$2) on conflict do nothing",[user.id,role.id]);
    await db.query("insert into admin_bootstrap_event(user_id,source,metadata) values($1,'environment_bootstrap',$2)",[user.id,{email}]);
    await audit(db,user.id,"admin.bootstrap","account",user.id,null,{source:"environment"});
    return {userId:user.id,email:user.email};
  });
}

export async function register(input,requestId){
  const email=normalizeEmail(input.email);
  if(!email || !String(input.password||"")) throw httpError(400,"email and password are required.","VALIDATION_ERROR");
  const person=validatePersonInput(input);
  return withTransaction(async db=>{
    const identity=await db.query(`
      select u.id from app_user u where lower(u.email)=lower($1)
      union
      select p.user_id from person p where p.phone=$2
      union
      select p.user_id from person p where lower(regexp_replace(coalesce(p.display_name,''),'[^[:alnum:]]','','g'))=
        lower(regexp_replace($3,'[^[:alnum:]]','','g')) limit 3`,[email,person.phone,person.displayName]);
    if(identity.rows.length) throw httpError(409,"An existing account or identity matches these details. Sign in or contact membership support instead of creating a duplicate.","IDENTITY_CONFLICT");
    const user=(await db.query("insert into app_user(username,email,password_hash,status) values($1,$2,$3,'active') returning id,email,username",[email,email,hashPassword(input.password)])).rows[0];
    const p=(await db.query(`insert into person(user_id,first_name,middle_name,last_name,display_name,phone,date_of_birth,sex,nationality)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id,user_id,first_name,middle_name,last_name,display_name,phone,date_of_birth,sex,nationality`,
      [user.id,person.firstName,person.middleName,person.lastName,person.displayName,person.phone,person.dateOfBirth,person.sex,person.nationality])).rows[0];
    await db.query("insert into professional_profile(person_id,completion_percent) values($1,20)",[p.id]);
    await db.query("insert into app_user_role(user_id,role_id) select $1,id from app_role where role_code='member' on conflict do nothing",[user.id]);
    await db.query("insert into notification_preference(user_id) values($1) on conflict do nothing",[user.id]);
    await audit(db,user.id,"account.registered","account",user.id,requestId,{identityPolicy:"email_phone_exact_name"});
    await notify(db,user.id,"account_registered","account",user.id,{displayName:p.display_name});
    return {user:{id:user.id,email:user.email},person:p,token:await tokenFor(db,user,["member"])};
  });
}

export async function login(email,password,requestId,requestMeta={}){
  const db=getPool(); const identityKey=normalizeEmail(email);
  const recent=await db.query("select count(*)::int count from auth_login_attempt where identity_key=$1 and attempted_at>now()-interval '15 minutes' and succeeded=false",[identityKey]);
  if(recent.rows[0].count>=8) throw httpError(429,"Too many unsuccessful sign-in attempts. Try again later.","AUTH_RATE_LIMIT");
  const e=normalizeEmail(email);
  const r=await db.query("select id,email,username,password_hash,status from app_user where lower(email)=lower($1)",[e]);
  const user=r.rows[0];
  if(!user || user.status!=="active" || !verifyPassword(password,user.password_hash)){
    await db.query("insert into auth_login_attempt(identity_key,ip_address,succeeded) values($1,$2,false)",[identityKey,requestMeta.ip||null]);
    throw httpError(401,"Invalid credentials.","UNAUTHENTICATED");
  }
  await db.query("insert into auth_login_attempt(identity_key,ip_address,succeeded) values($1,$2,true)",[identityKey,requestMeta.ip||null]);
  const rs=await roles(db,user.id);
  await audit(db,user.id,"account.login","account",user.id,requestId);
  return {token:await tokenFor(db,user,rs,requestMeta),user:{id:user.id,email:user.email,roles:rs}};
}

export async function getMe(userId){
  const db=getPool();
  const r=await db.query(`select u.id user_id,u.email,u.status,p.id person_id,p.first_name,p.middle_name,p.last_name,p.display_name,p.phone,p.date_of_birth,p.sex,p.nationality,
    pr.id profile_id,pr.headline,pr.bio,pr.visibility,pr.completion_percent,
    coalesce((select jsonb_agg(r.role_code order by r.role_code) from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=u.id),'[]'::jsonb) roles
    from app_user u left join person p on p.user_id=u.id left join professional_profile pr on pr.person_id=p.id where u.id=$1`,[userId]);
  if(!r.rows[0]) throw httpError(404,"Account not found.","NOT_FOUND");
  return r.rows[0];
}

export async function updateProfile(userId,input,requestId){
  const person=validatePersonInput(input);
  await withTransaction(async db=>{
    const current=await db.query("select id from person where user_id=$1 for update",[userId]);
    if(!current.rows[0]) throw httpError(404,"Person profile not found.","NOT_FOUND");
    const duplicate=await db.query("select user_id from person where phone=$1 and user_id<>$2",[person.phone,userId]);
    if(person.phone && duplicate.rows.length) throw httpError(409,"Phone number is already associated with another identity.","IDENTITY_CONFLICT");
    const p=(await db.query(`update person set first_name=$1,middle_name=$2,last_name=$3,display_name=$4,phone=$5,date_of_birth=$6,sex=$7,nationality=$8,updated_at=now() where user_id=$9 returning *`,
      [person.firstName,person.middleName,person.lastName,person.displayName,person.phone,person.dateOfBirth,person.sex,person.nationality,userId])).rows[0];
    await db.query(`update professional_profile set headline=coalesce($1,headline),bio=coalesce($2,bio),visibility=coalesce($3,visibility),completion_percent=greatest(completion_percent,$4),updated_at=now() where person_id=$5`,
      [input.headline||null,input.bio||null,input.visibility||null,(input.headline||input.bio)?40:20,p.id]);
    await audit(db,userId,"profile.updated","person",p.id,requestId);
  });
  return getMe(userId);
}

export async function listMyApplications(userId){
  const db=getPool();
  return (await db.query(`select a.id,a.tracking_reference,a.application_type,a.status,a.submitted_at,a.reviewed_at,a.approved_at,a.created_at,a.updated_at,
      a.data_snapshot,a.fee_snapshot,
      (select jsonb_build_object('id',p.id,'status',p.status,'amount',p.amount,'currency',p.currency,'channel',p.channel,'created_at',p.created_at,'verified_at',p.verified_at)
       from membership_application_payment ap join payment_transaction p on p.id=ap.payment_transaction_id
       where ap.application_id=a.id order by p.created_at desc limit 1) as payment,
      (select jsonb_build_object('id',c.id,'requested_fields',c.requested_fields,'reviewer_note',c.reviewer_note,'status',c.status,'applicant_response',c.applicant_response)
       from membership_correction c where c.application_id=a.id order by c.created_at desc limit 1) as latest_correction,
      coalesce((select jsonb_agg(jsonb_build_object('id',aa.id,'fileObjectId',f.id,'fileName',f.original_name,'attachmentType',aa.attachment_type,'createdAt',aa.created_at) order by aa.created_at desc)
       from membership_application_attachment aa join file_object f on f.id=aa.file_object_id where aa.application_id=a.id),'[]'::jsonb) attachments
    from membership_application a where a.user_id=$1 order by a.created_at desc`,[userId])).rows;
}

export async function listMembershipProducts(){
  const db=getPool();
  return (await db.query(`select product_code,name,description,billing_model,price,currency,duration_days,renewal_required,benefits
    from membership_product where active=true order by price asc,name asc`)).rows;
}

async function product(db,code){
  const r=await db.query("select * from membership_product where product_code=$1 and active=true",[String(code||"").toUpperCase()]);
  if(!r.rows[0]) throw httpError(400,"Unknown or inactive membership product.","INVALID_PRODUCT");
  return r.rows[0];
}

export async function createApplication(userId,input,requestId){
  return withTransaction(async db=>{
    const prod=await product(db,input.productCode);
    const active=await db.query("select * from membership_record where user_id=$1 and status='active' order by end_date desc nulls last limit 1",[userId]);
    const type=input.applicationType||"new";
    if(type==="new" && active.rows[0]) throw httpError(409,"An active membership already exists. Use renewal.","ACTIVE_MEMBERSHIP");
    if(type==="renewal"){
      if(!active.rows[0]) throw httpError(400,"Renewal requires an existing active membership.","RENEWAL_NOT_ELIGIBLE");
      if(prod.billing_model==="lifetime" || !prod.renewal_required) throw httpError(400,"This membership product does not support renewal.","RENEWAL_NOT_SUPPORTED");
    }
    const pending=await db.query("select id from membership_application where user_id=$1 and status in ('submitted','in_review','correction_required','approved','payment_pending','paid') limit 1",[userId]);
    if(pending.rows[0]) throw httpError(409,"You already have an active membership application.","APPLICATION_EXISTS");
    const me=await getMe(userId);
    const snapshot={person:{firstName:me.first_name,middleName:me.middle_name,lastName:me.last_name,displayName:me.display_name,phone:me.phone,dateOfBirth:me.date_of_birth,sex:me.sex,nationality:me.nationality},profile:{headline:me.headline,bio:me.bio}};
    const fee={productCode:prod.product_code,productName:prod.name,amount:amountFromProduct(prod),currency:prod.currency,billingModel:prod.billing_model,durationDays:prod.duration_days};
    const trackingReference=await nextTrackingReference(db,"membership");
    const row=(await db.query(`insert into membership_application(user_id,tracking_reference,application_type,previous_membership_id,membership_product_id,status,submitted_at,data_snapshot,fee_snapshot)
      values($1,$2,$3,$4,$5,'submitted',now(),$6,$7) returning *`,[userId,trackingReference,type,active.rows[0]?.id||null,prod.id,snapshot,fee])).rows[0];
    await audit(db,userId,"membership.application_submitted","membership_application",row.id,requestId,{applicationType:type,productCode:prod.product_code});
    await notify(db,userId,"membership_application_submitted","membership_application",row.id,{productCode:prod.product_code});
    return row;
  });
}

export async function reviewApplication(applicationId,reviewerId,input,requestId){
  return withTransaction(async db=>{
    const row=(await db.query("select * from membership_application where id=$1 for update",[applicationId])).rows[0];
    if(!row) throw httpError(404,"Application not found.","NOT_FOUND");
    if(!["submitted","in_review"].includes(row.status)) throw httpError(409,`Application cannot be reviewed from status ${row.status}.`,"INVALID_STATE");
    await db.query("update membership_application set status='in_review',reviewed_at=now(),updated_at=now() where id=$1",[applicationId]);
    const decision=input.decision;
    if(!["approved","rejected","correction_required"].includes(decision)) throw httpError(400,"Invalid review decision.","VALIDATION_ERROR");
    const review=(await db.query("insert into membership_application_review(application_id,reviewer_user_id,decision,note,checklist) values($1,$2,$3,$4,$5) returning *",[applicationId,reviewerId,decision,input.note||null,JSON.stringify(input.checklist||[])])).rows[0];
    let next=decision==="approved"?"payment_pending":decision==="rejected"?"rejected":"correction_required";
    await db.query("update membership_application set status=$1,approved_at=case when $1='payment_pending' then now() else approved_at end,updated_at=now() where id=$2",[next,applicationId]);
    if(decision==="correction_required") await db.query("insert into membership_correction(application_id,requested_by,requested_fields,reviewer_note) values($1,$2,$3,$4)",[applicationId,reviewerId,JSON.stringify(input.requestedFields||[]),input.note||"Correction required."]);
    await audit(db,reviewerId,"membership.application_reviewed","membership_application",applicationId,requestId,{decision});
    await notify(db,row.user_id,`membership_application_${decision}`,"membership_application",applicationId,{note:input.note||null});
    return review;
  });
}

export async function respondCorrection(applicationId,userId,input,requestId){
  return withTransaction(async db=>{
    const row=(await db.query("select * from membership_application where id=$1 and user_id=$2 for update",[applicationId,userId])).rows[0];
    if(!row || row.status!=="correction_required") throw httpError(409,"Application is not awaiting correction.","INVALID_STATE");
    const open=(await db.query("select * from membership_correction where application_id=$1 and status='open' order by created_at desc limit 1 for update",[applicationId])).rows[0];
    if(!open) throw httpError(409,"No open correction request exists.","CORRECTION_NOT_FOUND");
    await db.query("update membership_correction set status='responded',responded_by=$1,applicant_response=$2,responded_at=now() where id=$3",[userId,input.response||{},open.id]);
    const updated=(await db.query("update membership_application set status='submitted',data_snapshot=data_snapshot || $1::jsonb,updated_at=now() where id=$2 returning *",[JSON.stringify(input.response||{}),applicationId])).rows[0];
    await audit(db,userId,"membership.correction_responded","membership_application",applicationId,requestId,{correctionId:open.id});
    await notify(db,userId,"membership_correction_submitted","membership_application",applicationId,{});
    return updated;
  });
}

export async function createManualPayment(applicationId,userId,input,requestId){
  return withTransaction(async db=>{
    const app=(await db.query("select a.*,p.product_code,p.currency from membership_application a join membership_product p on p.id=a.membership_product_id where a.id=$1 and a.user_id=$2 for update",[applicationId,userId])).rows[0];
    if(!app || app.status!=="payment_pending") throw httpError(409,"Application is not ready for payment.","INVALID_STATE");
    const fee=app.fee_snapshot;
    const amount=Number(input.amount);
    if(!Number.isFinite(amount) || amount!==Number(fee.amount)) throw httpError(400,"Payment amount must exactly match the approved application fee.","PAYMENT_AMOUNT_MISMATCH");
    const idem=String(input.idempotencyKey||"").trim();
    if(!idem) throw httpError(400,"idempotencyKey is required.","VALIDATION_ERROR");
    const existing=await db.query("select * from payment_transaction where idempotency_key=$1",[idem]);
    if(existing.rows[0]) return existing.rows[0];
    const p=(await db.query(`insert into payment_transaction(provider,provider_transaction_id,idempotency_key,purpose,amount,currency,status,request_payload,channel,submitted_by,purpose_reference,source)
      values('manual',null,$1,'membership', $2,$3,'pending',$4::jsonb,$5,$6,$7,'manual_entry') returning *`,
      [idem,amount,fee.currency,JSON.stringify({channel:input.channel||"manual",reference:input.reference||null}),input.channel||"manual",userId,input.reference||applicationId])).rows[0];
    await db.query("insert into membership_application_payment(application_id,payment_transaction_id) values($1,$2)",[applicationId,p.id]);
    if(input.evidenceFileId){
      const file=await db.query("select id from file_object where id=$1 and (created_by=$2 or created_by is null)",[input.evidenceFileId,userId]);
      if(!file.rows[0]) throw httpError(400,"Payment evidence file is not available to this account.","INVALID_EVIDENCE");
      await db.query("update payment_transaction set evidence_file_id=$1 where id=$2",[input.evidenceFileId,p.id]);
    }
    await audit(db,userId,"membership.payment_submitted","payment_transaction",p.id,requestId,{applicationId,channel:input.channel||"manual"});
    await notify(db,userId,"membership_payment_submitted","membership_application",applicationId,{paymentId:p.id});
    return p;
  });
}

export async function verifyPayment(paymentId,verifierId,input,requestId){
  return withTransaction(async db=>{
    const p=(await db.query(`select p.*,ap.application_id,a.user_id from payment_transaction p
      join membership_application_payment ap on ap.payment_transaction_id=p.id
      join membership_application a on a.id=ap.application_id where p.id=$1 for update`,[paymentId])).rows[0];
    if(!p) throw httpError(404,"Payment not found.","NOT_FOUND");
    if(!["manual","bank_transfer","cash"].includes(p.channel) || p.source==="provider_webhook") throw httpError(400,"This payment is not eligible for manual verification.","INVALID_PAYMENT_CHANNEL");
    const decision=input.decision;
    if(!["approved","rejected","needs_correction"].includes(decision)) throw httpError(400,"Invalid payment verification decision.","VALIDATION_ERROR");
    const next=decision==="approved"?"succeeded":decision==="rejected"?"failed":"pending";
    await db.query("insert into payment_verification(payment_transaction_id,verifier_user_id,decision,evidence_checked,note) values($1,$2,$3,$4,$5)",[paymentId,verifierId,decision,JSON.stringify(input.evidenceChecked||[]),input.note||null]);
    await db.query("update payment_transaction set status=$1,verified_by=$2,verified_at=now(),verification_note=$3,completed_at=case when $1 in ('succeeded','failed') then now() else completed_at end,updated_at=now() where id=$4",[next,verifierId,input.note||null,paymentId]);
    const appStatus=decision==="approved"?"paid":"payment_pending";
    await db.query("update membership_application set status=$1,updated_at=now() where id=$2",[appStatus,p.application_id]);
    if(decision==="approved") await db.query("insert into payment_reconciliation(payment_transaction_id,membership_id,reconciliation_status,reconciled_by,reconciled_at,note) values($1,null,'matched',$2,now(),$3)",[paymentId,verifierId,"Matched to membership application "+p.application_id]);
    await audit(db,verifierId,"membership.payment_verified","payment_transaction",paymentId,requestId,{decision,applicationId:p.application_id});
    await notify(db,p.user_id,`membership_payment_${decision}`,"payment_transaction",paymentId,{applicationId:p.application_id});
    return (await db.query("select * from payment_transaction where id=$1",[paymentId])).rows[0];
  });
}

export async function activateApplication(applicationId,actorId,requestId){
  return withTransaction(async db=>{
    const app=(await db.query("select a.*,p.product_code,p.name,p.billing_model,p.duration_days,p.renewal_required from membership_application a join membership_product p on p.id=a.membership_product_id where a.id=$1 for update",[applicationId])).rows[0];
    if(!app || app.status!=="paid") throw httpError(409,"Application must have a verified payment before activation.","ACTIVATION_NOT_READY");
    const pay=(await db.query("select pt.* from payment_transaction pt join membership_application_payment ap on ap.payment_transaction_id=pt.id where ap.application_id=$1 and pt.status='succeeded' order by pt.created_at desc limit 1",[applicationId])).rows[0];
    if(!pay) throw httpError(409,"No successful payment is linked to this application.","PAYMENT_NOT_CONFIRMED");
    const previous=app.previous_membership_id ? (await db.query("select * from membership_record where id=$1 for update",[app.previous_membership_id])).rows[0] : null;
    const start=new Date(); start.setUTCHours(0,0,0,0);
    if(previous?.status==="active" && previous.end_date && new Date(previous.end_date)>=start) start.setTime(new Date(previous.end_date).getTime()+86400000);
    let end=null;
    if(app.duration_days) end=new Date(start.getTime()+Number(app.duration_days)*86400000-86400000);
    const number=`MPA-${start.getUTCFullYear()}-${randomUUID().slice(0,8).toUpperCase()}`;
    if(previous?.status==="active") await db.query("update membership_record set status='expired',end_date=coalesce(end_date,$1),updated_at=now() where id=$2",[new Date(start.getTime()-86400000).toISOString().slice(0,10),previous.id]);
    const membership=(await db.query(`insert into membership_record(user_id,membership_product_id,membership_number,status,start_date,end_date,source,application_id)
      values($1,$2,$3,'active',$4,$5,'online',$6) returning *`,[app.user_id,app.membership_product_id,number,start.toISOString().slice(0,10),end?.toISOString().slice(0,10)||null,applicationId])).rows[0];
    await db.query("update membership_application set status='activated',activated_at=now(),updated_at=now() where id=$1",[applicationId]);
    await db.query("update payment_reconciliation set membership_id=$1,reconciled_at=coalesce(reconciled_at,now()) where payment_transaction_id=$2 and reconciliation_status='matched'",[membership.id,pay.id]);
    await db.query("insert into membership_event(membership_id,event_type,effective_at,actor_user_id,source,details) values($1,'activated',now(),$2,'membership_application',$3)",[membership.id,actorId,JSON.stringify({applicationId,paymentId:pay.id,productCode:app.product_code})]);
    await audit(db,actorId,"membership.activated","membership_record",membership.id,requestId,{applicationId,paymentId:pay.id});
    await notify(db,app.user_id,"membership_activated","membership_record",membership.id,{membershipNumber:number,productCode:app.product_code});
    return membership;
  });
}

export async function renew(userId,productCode,requestId){
  return createApplication(userId,{productCode,applicationType:"renewal"},requestId);
}

export async function history(userId){
  const db=getPool();
  const [memberships,applications,payments,events,notifications]=await Promise.all([
    db.query("select m.*,p.product_code,p.name from membership_record m join membership_product p on p.id=m.membership_product_id where m.user_id=$1 order by m.start_date desc nulls last,m.created_at desc",[userId]),
    db.query("select id,application_type,status,membership_product_id,submitted_at,reviewed_at,approved_at,activated_at,created_at,updated_at from membership_application where user_id=$1 order by created_at desc",[userId]),
    db.query("select p.*,ap.application_id from payment_transaction p join membership_application_payment ap on ap.payment_transaction_id=p.id join membership_application a on a.id=ap.application_id where a.user_id=$1 order by p.created_at desc",[userId]),
    db.query("select e.* from membership_event e join membership_record m on m.id=e.membership_id where m.user_id=$1 order by e.effective_at desc",[userId]),
    db.query("select * from notification_event where user_id=$1 order by created_at desc limit 100",[userId])
  ]);
  return {memberships:memberships.rows,applications:applications.rows,payments:payments.rows,events:events.rows,notifications:notifications.rows};
}

export async function listApplicationsForReview(){
  const db=getPool();
  const r=await db.query(`select a.id,a.user_id,a.application_type,a.status,a.submitted_at,a.created_at,a.updated_at,a.data_snapshot,a.fee_snapshot,p.product_code,p.name,
      (select jsonb_build_object('id',pt.id,'status',pt.status,'amount',pt.amount,'currency',pt.currency,'channel',pt.channel,'created_at',pt.created_at)
       from membership_application_payment ap join payment_transaction pt on pt.id=ap.payment_transaction_id
       where ap.application_id=a.id order by pt.created_at desc limit 1) payment
    from membership_application a join membership_product p on p.id=a.membership_product_id
    where a.status in ('submitted','in_review','correction_required','payment_pending','paid') order by a.created_at asc`);
  return r.rows;
}

export async function attachApplicationFile(applicationId,userId,input,requestId){
  return withTransaction(async db=>{
    const app=(await db.query("select id from membership_application where id=$1 and user_id=$2",[applicationId,userId])).rows[0];
    if(!app) throw httpError(404,"Application not found.","NOT_FOUND");
    const file=(await db.query("select id,original_name,content_type,byte_size,visibility from file_object where id=$1 and (created_by=$2 or created_by is null)",[input.fileObjectId,userId])).rows[0];
    if(!file) throw httpError(400,"File is not available to this account.","INVALID_FILE");
    const row=(await db.query("insert into membership_application_attachment(application_id,file_object_id,attachment_type,created_by) values($1,$2,$3,$4) on conflict(application_id,file_object_id) do update set attachment_type=excluded.attachment_type returning *",[applicationId,input.fileObjectId,input.attachmentType||"supporting_document",userId])).rows[0];
    await audit(db,userId,"membership.application_attachment_added","membership_application_attachment",row.id,requestId,{applicationId,fileObjectId:input.fileObjectId});
    return {...row,file};
  });
}

export async function notificationPreferences(userId,input=null){
  const db=getPool();
  if(input){
    return (await db.query(`insert into notification_preference(user_id,email_enabled,sms_enabled,push_enabled,in_app_enabled,updated_at)
      values($1,coalesce($2,true),coalesce($3,true),coalesce($4,true),coalesce($5,true),now())
      on conflict(user_id) do update set email_enabled=coalesce($2,notification_preference.email_enabled),
      sms_enabled=coalesce($3,notification_preference.sms_enabled),push_enabled=coalesce($4,notification_preference.push_enabled),
      in_app_enabled=coalesce($5,notification_preference.in_app_enabled),updated_at=now() returning *`,[
        userId,input.emailEnabled,input.smsEnabled,input.pushEnabled,input.inAppEnabled
      ])).rows[0];
  }
  return (await db.query("select * from notification_preference where user_id=$1",[userId])).rows[0] ||
    (await db.query("insert into notification_preference(user_id) values($1) returning *",[userId])).rows[0];
}

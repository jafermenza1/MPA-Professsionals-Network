import { randomUUID } from "node:crypto";
import { withTransaction, getPool } from "../platform/db.js";
import { signToken, newSessionToken, hashSessionToken, sessionTokenPayload } from "../platform/auth.js";
import { loadConfig } from "../platform/config.js";
import { nextTrackingReference } from "../platform/tracking-reference.js";
import { hashPassword, verifyPassword, normalizeEmail, normalizePhone, normalizeName, validatePersonInput } from "./identity.js";
import { assertProfessionalProfileCapability } from "../platform/identity-policy.js";
import { membershipEndDate } from "../platform/membership-duration.js";

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

async function assertProfessionalProfileAccess(db,userId,options={}){
  try { await assertProfessionalProfileCapability(db,userId,options); }
  catch (error) { throw httpError(error.statusCode||403,error.message,error.code||"BUSINESS_RULE"); }
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
  const r=await db.query("select id,email,username,password_hash,status from app_user where lower(email)=lower($1) or lower(username)=lower($1) order by case when lower(email)=lower($1) then 0 else 1 end limit 2",[e]);
  const user=r.rows.length===1?r.rows[0]:null;
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
  const r=await db.query(`select u.id user_id,u.username,u.email,u.status,p.id person_id,p.first_name,p.middle_name,p.last_name,p.display_name,p.phone,p.date_of_birth,p.sex,p.nationality,
    pr.id profile_id,pr.headline,pr.bio,pr.visibility,pr.completion_percent,
    coalesce((select jsonb_agg(r.role_code order by r.role_code) from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=u.id),'[]'::jsonb) roles,
    exists(select 1 from membership_record mr where mr.user_id=u.id and mr.status='active' and mr.start_date<=current_date and (mr.end_date is null or mr.end_date>=current_date)) has_active_membership
    from app_user u left join person p on p.user_id=u.id left join professional_profile pr on pr.person_id=p.id where u.id=$1`,[userId]);
  if(!r.rows[0]) throw httpError(404,"Account not found.","NOT_FOUND");
  const row=r.rows[0];
  const userRoles=Array.isArray(row.roles)?row.roles:[];
  if(!userRoles.some(role=>["member","professional"].includes(role))){
    row.profile_id=null; row.headline=null; row.bio=null; row.visibility=null; row.completion_percent=null;
  }
  return row;
}

export async function updateProfile(userId,input,requestId){
  await withTransaction(async db=>{
    await assertProfessionalProfileAccess(db,userId,{requireActiveMembership:true});
    const person=validatePersonInput(input);
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
  return (await db.query(`select p.product_code,coalesce(r.plan_name,p.name) name,
    coalesce(r.plan_description,p.description) description,
    coalesce(r.billing_model,p.billing_model) billing_model,
    (coalesce(r.base_amount,p.price)+coalesce(r.tax_amount,0)+coalesce(r.service_fee,0)) price,
    coalesce(r.currency,p.currency) currency,coalesce(r.duration_days,p.duration_days) duration_days,
    coalesce(r.renewal_required,p.renewal_required) renewal_required,
    coalesce(r.benefits,p.benefits) benefits,coalesce(r.grace_period_days,p.grace_period_days) grace_period_days,
    coalesce(r.eligibility,p.eligibility) eligibility,coalesce(r.effective_from,p.effective_from) effective_from,
    coalesce(r.effective_to,p.effective_to) effective_to,r.version fee_rule_version
    from membership_product p
    left join lateral (select fr.* from membership_fee_rule fr where fr.membership_product_id=p.id
      and fr.effective_from<=current_date and (fr.effective_to is null or fr.effective_to>=current_date)
      order by fr.version desc limit 1) r on true
    where p.active=true and (p.effective_from is null or p.effective_from<=current_date)
      and (p.effective_to is null or p.effective_to>=current_date)
    order by (coalesce(r.base_amount,p.price)+coalesce(r.tax_amount,0)+coalesce(r.service_fee,0)) asc,coalesce(r.plan_name,p.name) asc`)).rows;
}

export async function listMembershipProductsForAdmin(){
  const db=getPool();
  return (await db.query(`select p.*,coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,'version',r.version,'baseAmount',r.base_amount,'currency',r.currency,
      'taxAmount',r.tax_amount,'serviceFee',r.service_fee,'effectiveFrom',r.effective_from,
      'effectiveTo',r.effective_to,'billingModel',r.billing_model,'durationDays',r.duration_days,
      'renewalRequired',r.renewal_required,'gracePeriodDays',r.grace_period_days,
      'benefits',r.benefits,'eligibility',r.eligibility,'createdAt',r.created_at
    ) order by r.version desc) filter(where r.id is not null),'[]'::jsonb) fee_rule_history
    from membership_product p left join membership_fee_rule r on r.membership_product_id=p.id
    group by p.id order by p.created_at desc`)).rows;
}

export async function saveMembershipProduct(actorId,productCode,input,requestId){
  return withTransaction(async db=>{
    const code=String(productCode||input.productCode||"").trim().toUpperCase();
    const name=String(input.name||"").trim();
    const billingModel=String(input.billingModel||"recurring");
    const currency=String(input.currency||"ETB").trim().toUpperCase();
    const amount=Number(input.amount);
    const effectiveFrom=String(input.effectiveFrom||new Date().toISOString().slice(0,10)).slice(0,10);
    const durationDays=input.durationDays===null||input.durationDays===""||input.durationDays===undefined?null:Number(input.durationDays);
    const gracePeriodDays=input.gracePeriodDays===undefined?0:Number(input.gracePeriodDays);
    const renewalRequired=billingModel==="lifetime"?false:Boolean(input.renewalRequired);
    if(!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code)) throw httpError(400,"Plan code must use 2–40 letters, numbers, dashes or underscores.","VALIDATION_ERROR");
    if(!name||name.length>120) throw httpError(400,"Enter a plan name up to 120 characters.","VALIDATION_ERROR");
    if(!["recurring","one_time","lifetime"].includes(billingModel)) throw httpError(400,"Choose a supported billing model.","VALIDATION_ERROR");
    if(!Number.isFinite(amount)||amount<0||!/^([A-Z]{3})$/.test(currency)) throw httpError(400,"Enter a valid non-negative fee and three-letter currency.","VALIDATION_ERROR");
    if(!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)||Number.isNaN(Date.parse(effectiveFrom))) throw httpError(400,"Choose a valid effective date.","VALIDATION_ERROR");
    if(billingModel==="lifetime"&&durationDays!==null) throw httpError(400,"Lifetime plans cannot have an expiry duration.","VALIDATION_ERROR");
    if(billingModel!=="lifetime"&&(!Number.isInteger(durationDays)||durationDays<1||durationDays>3650)) throw httpError(400,"Choose a validity duration from 1 to 3,650 days for non-lifetime plans.","VALIDATION_ERROR");
    if(!Number.isInteger(gracePeriodDays)||gracePeriodDays<0||gracePeriodDays>365) throw httpError(400,"Grace period must be between 0 and 365 days.","VALIDATION_ERROR");
    const benefits=Array.isArray(input.benefits)?input.benefits.map(x=>String(x).trim()).filter(Boolean).slice(0,40):[];
    const eligibility=input.eligibility&&typeof input.eligibility==="object"&&!Array.isArray(input.eligibility)?input.eligibility:{};
    const existing=(await db.query("select * from membership_product where product_code=$1 for update",[code])).rows[0];
    if(!existing&&productCode) throw httpError(404,"Membership plan not found.","NOT_FOUND");
    if(existing&&String(input.expectedVersion||"")&&String(input.expectedVersion)!==String((await db.query("select coalesce(max(version),0) version from membership_fee_rule where membership_product_id=$1",[existing.id])).rows[0].version)) {
      throw httpError(409,"This plan changed while you were editing it. Refresh the plan history before saving again.","PLAN_VERSION_CONFLICT");
    }
    let product;
    if(existing){
      product=(await db.query(`update membership_product set name=$1,description=$2,billing_model=$3,price=$4,currency=$5,
        duration_days=$6,renewal_required=$7,grace_period_days=$8,benefits=$9::jsonb,eligibility=$10::jsonb,
        active=$11,updated_at=now() where id=$12 returning *`,[
        name,String(input.description||"").trim()||null,billingModel,amount,currency,durationDays,renewalRequired,
        gracePeriodDays,JSON.stringify(benefits),JSON.stringify(eligibility),input.active!==false,existing.id
      ])).rows[0];
    }else{
      product=(await db.query(`insert into membership_product(product_code,name,description,billing_model,price,currency,duration_days,renewal_required,grace_period_days,benefits,eligibility,active,effective_from)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13) returning *`,[
        code,name,String(input.description||"").trim()||null,billingModel,amount,currency,durationDays,renewalRequired,
        gracePeriodDays,JSON.stringify(benefits),JSON.stringify(eligibility),input.active!==false,effectiveFrom
      ])).rows[0];
    }
    const nextVersion=Number((await db.query("select coalesce(max(version),0)+1 version from membership_fee_rule where membership_product_id=$1",[product.id])).rows[0].version);
    // Close the previously open rule at the day before the new rule takes effect.
    await db.query("update membership_fee_rule set effective_to=case when effective_from=$1::date then $1::date else ($1::date-1) end where membership_product_id=$2 and effective_from<=$1::date and (effective_to is null or effective_to >= $1::date)",[effectiveFrom,product.id]);
    const rule=(await db.query(`insert into membership_fee_rule(membership_product_id,version,base_amount,currency,billing_period,tax_amount,service_fee,eligibility_rules,effective_from,created_by,plan_name,plan_description,billing_model,duration_days,renewal_required,grace_period_days,benefits,eligibility)
      values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb) returning *`,[
      product.id,nextVersion,amount,currency,billingModel,Number(input.taxAmount||0),Number(input.serviceFee||0),
      JSON.stringify(eligibility),effectiveFrom,actorId,name,String(input.description||"").trim()||null,billingModel,
      durationDays,renewalRequired,gracePeriodDays,JSON.stringify(benefits),JSON.stringify(eligibility)
    ])).rows[0];
    await audit(db,actorId,existing?"membership.plan_version_created":"membership.plan_created","membership_product",product.id,requestId,{
      productCode:code,version:nextVersion,effectiveFrom,active:product.active
    });
    return {product,feeRule:rule};
  });
}

async function product(db,code){
  const r=await db.query("select * from membership_product where product_code=$1 and active=true and (effective_from is null or effective_from<=current_date) and (effective_to is null or effective_to>=current_date)",[String(code||"").toUpperCase()]);
  if(!r.rows[0]) throw httpError(400,"Unknown or inactive membership product.","INVALID_PRODUCT");
  return r.rows[0];
}

export async function createApplication(userId,input,requestId){
  return withTransaction(async db=>{
    // Serialize applications for one account so concurrent submits cannot both
    // pass the pending-application check.
    const account=(await db.query("select id from app_user where id=$1 for update",[userId])).rows[0];
    if(!account) throw httpError(404,"Account not found.","NOT_FOUND");
    const prod=await product(db,input.productCode);
    const activeFeeRule=(await db.query(`select * from membership_fee_rule
      where membership_product_id=$1 and effective_from<=current_date and (effective_to is null or effective_to>=current_date)
      order by effective_from desc,version desc limit 1`,[prod.id])).rows[0]||null;
    const planBillingModel=activeFeeRule?.billing_model||prod.billing_model;
    const planRenewalRequired=activeFeeRule?.renewal_required??prod.renewal_required;
    const active=await db.query("select * from membership_record where user_id=$1 and status='active' and start_date<=current_date and (end_date is null or end_date>=current_date) order by end_date desc nulls last limit 1",[userId]);
    const type=input.applicationType||"new";
    if(type==="new" && active.rows[0]) throw httpError(409,"An active membership already exists. Use renewal.","ACTIVE_MEMBERSHIP");
    if(type==="renewal"){
      if(!active.rows[0]) throw httpError(400,"Renewal requires an existing active membership.","RENEWAL_NOT_ELIGIBLE");
      if(planBillingModel==="lifetime" || !planRenewalRequired) throw httpError(400,"This membership product does not support renewal.","RENEWAL_NOT_SUPPORTED");
    }
    const pending=await db.query("select id from membership_application where user_id=$1 and status in ('submitted','in_review','correction_required','approved','payment_pending','paid') limit 1",[userId]);
    if(pending.rows[0]) throw httpError(409,"You already have an active membership application.","APPLICATION_EXISTS");
    const me=await getMe(userId);
    const snapshot={person:{firstName:me.first_name,middleName:me.middle_name,lastName:me.last_name,displayName:me.display_name,phone:me.phone,dateOfBirth:me.date_of_birth,sex:me.sex,nationality:me.nationality},profile:{headline:me.headline,bio:me.bio}};
    const feeAmount=activeFeeRule
      ? Number(activeFeeRule.base_amount)+Number(activeFeeRule.tax_amount||0)+Number(activeFeeRule.service_fee||0)
      : amountFromProduct(prod);
    const fee={
      productCode:prod.product_code,productName:activeFeeRule?.plan_name||prod.name,amount:feeAmount,
      currency:activeFeeRule?.currency||prod.currency,billingModel:activeFeeRule?.billing_model||prod.billing_model,
      durationDays:activeFeeRule?.duration_days??prod.duration_days,renewalRequired:activeFeeRule?.renewal_required??prod.renewal_required,
      gracePeriodDays:activeFeeRule?.grace_period_days??prod.grace_period_days,
      benefits:activeFeeRule?.benefits||prod.benefits,eligibility:activeFeeRule?.eligibility||prod.eligibility,
      feeRuleId:activeFeeRule?.id||null,feeRuleVersion:activeFeeRule?.version??null,
      feeBreakdown:activeFeeRule?{baseAmount:Number(activeFeeRule.base_amount),taxAmount:Number(activeFeeRule.tax_amount||0),serviceFee:Number(activeFeeRule.service_fee||0)}:null,
      effectiveFrom:activeFeeRule?.effective_from||prod.effective_from||null,
      effectiveTo:activeFeeRule?.effective_to||prod.effective_to||null,
      durationPolicy:((activeFeeRule?.billing_model||prod.billing_model)==="recurring" && Number(activeFeeRule?.duration_days??prod.duration_days)===365)?"calendar_year_inclusive":"fixed_days_inclusive"
    };
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
    const existing=await db.query(`select pt.*,ap.application_id,a.user_id as application_user_id
      from payment_transaction pt
      left join membership_application_payment ap on ap.payment_transaction_id=pt.id
      left join membership_application a on a.id=ap.application_id
      where pt.idempotency_key=$1 for update of pt`,[idem]);
    if(existing.rows[0]){
      const prior=existing.rows[0];
      if(prior.purpose!=="membership"||prior.application_id!==applicationId||prior.application_user_id!==userId||
         Number(prior.amount)!==amount||String(prior.currency).trim().toUpperCase()!==String(fee.currency).trim().toUpperCase()||
         prior.submitted_by!==userId){
        throw httpError(409,"This payment reference was already used for a different submission. Refresh the application and submit again with a new reference.","IDEMPOTENCY_CONFLICT");
      }
      return prior;
    }
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
    const p=(await db.query(`select p.*,ap.application_id,a.user_id,a.status as application_status,a.fee_snapshot,a.approved_at from payment_transaction p
      join membership_application_payment ap on ap.payment_transaction_id=p.id
      join membership_application a on a.id=ap.application_id where p.id=$1 for update`,[paymentId])).rows[0];
    if(!p) throw httpError(404,"Payment not found.","NOT_FOUND");
    if(p.application_status!=="payment_pending"||!p.approved_at) throw httpError(409,"Payment can only be verified after the membership application has been approved.","APPLICATION_NOT_APPROVED");
    if(p.status!=="pending") throw httpError(409,"Only a pending payment can be verified. This payment has already been decided or reversed.","PAYMENT_NOT_PENDING");
    if((await db.query("select 1 from membership_payment_reversal where payment_transaction_id=$1",[paymentId])).rowCount) throw httpError(409,"A reversed or refunded payment cannot be verified again. Submit a new payment for this application if needed.","PAYMENT_ALREADY_REVERSED");
    const fee=typeof p.fee_snapshot==="string"?JSON.parse(p.fee_snapshot):p.fee_snapshot;
    if(!fee||Number(p.amount)!==Number(fee.amount)||String(p.currency||"").toUpperCase()!==String(fee.currency||"").toUpperCase()) throw httpError(409,"Payment amount or currency does not match the approved application fee.","PAYMENT_AMOUNT_MISMATCH");
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
    const app=(await db.query("select a.*,p.product_code,p.name,p.billing_model,p.renewal_required from membership_application a join membership_product p on p.id=a.membership_product_id where a.id=$1 for update of a",[applicationId])).rows[0];
    if(!app) throw httpError(404,"Membership application not found.","NOT_FOUND");
    if(app.status==="activated"){
      const already=(await db.query("select * from membership_record where application_id=$1 order by created_at desc limit 1",[applicationId])).rows[0];
      if(already) return already;
      throw httpError(409,"This application is marked activated but its membership record is missing. Contact membership support before retrying.","ACTIVATION_RECORD_MISSING");
    }
    if(app.status!=="paid" || !app.approved_at) throw httpError(409,"Application must be approved and have a verified payment before activation.","ACTIVATION_NOT_READY");
    const fee=typeof app.fee_snapshot==="string"?JSON.parse(app.fee_snapshot):app.fee_snapshot;
    const pay=(await db.query(`select pt.* from payment_transaction pt
      join membership_application_payment ap on ap.payment_transaction_id=pt.id
      where ap.application_id=$1 and pt.status='succeeded'
        and not exists (select 1 from membership_payment_reversal mr where mr.payment_transaction_id=pt.id)
      order by pt.created_at desc limit 1 for update of pt`,[applicationId])).rows[0];
    if(!pay) throw httpError(409,"No unreversed successful payment is linked to this application.","PAYMENT_NOT_CONFIRMED");
    if(!fee||Number(pay.amount)!==Number(fee.amount)||String(pay.currency||"").trim().toUpperCase()!==String(fee.currency||"").trim().toUpperCase()){
      throw httpError(409,"The payment no longer matches the application’s saved fee terms. Membership has not been activated.","PAYMENT_AMOUNT_MISMATCH");
    }
    const previous=app.previous_membership_id ? (await db.query("select * from membership_record where id=$1 for update",[app.previous_membership_id])).rows[0] : null;
    const start=new Date(); start.setUTCHours(0,0,0,0);
    if(previous?.status==="active" && previous.end_date && new Date(previous.end_date)>=start) start.setTime(new Date(previous.end_date).getTime()+86400000);
    // Retire stale active rows before inserting a replacement. Authorization
    // already checks dates, but the database's one-active-row constraint also
    // requires stale records to be transitioned out of the active state.
    await db.query("update membership_record set status='expired',updated_at=now() where user_id=$1 and status='active' and end_date is not null and end_date<current_date",[app.user_id]);
    const currentActive=(await db.query("select * from membership_record where user_id=$1 and status='active' and start_date<=current_date and (end_date is null or end_date>=current_date) order by end_date desc nulls last limit 1 for update",[app.user_id])).rows[0];
    if(currentActive && currentActive.id!==app.previous_membership_id && app.application_type!=="renewal"){
      throw httpError(409,"An active membership already exists. Review the current membership before activating this application.","ACTIVE_MEMBERSHIP");
    }
    let end=null;
    if(fee.durationDays!==null && fee.durationDays!==undefined) end=membershipEndDate(start,fee);
    const number=`MPA-${start.getUTCFullYear()}-${randomUUID().slice(0,8).toUpperCase()}`;
    if(previous?.status==="active") await db.query("update membership_record set status='expired',end_date=coalesce(end_date,$1),updated_at=now() where id=$2",[new Date(start.getTime()-86400000).toISOString().slice(0,10),previous.id]);
    const membership=(await db.query(`insert into membership_record(user_id,membership_product_id,membership_number,status,start_date,end_date,source,application_id)
      values($1,$2,$3,'active',$4,$5,'online',$6) returning *`,[app.user_id,app.membership_product_id,number,start.toISOString().slice(0,10),end?.toISOString().slice(0,10)||null,applicationId])).rows[0];
    await db.query("update membership_application set status='activated',activated_at=now(),updated_at=now() where id=$1",[applicationId]);
    await db.query("update payment_reconciliation set membership_id=$1,reconciled_at=coalesce(reconciled_at,now()) where payment_transaction_id=$2 and reconciliation_status='matched'",[membership.id,pay.id]);
    await db.query("insert into membership_event(membership_id,event_type,effective_at,actor_user_id,source,details) values($1,'activated',now(),$2,'membership_application',$3)",[membership.id,actorId,JSON.stringify({applicationId,paymentId:pay.id,productCode:app.product_code,durationDays:fee.durationDays,durationPolicy:fee.durationPolicy||"fixed_days_inclusive",feeRuleId:fee.feeRuleId||null,feeRuleVersion:fee.feeRuleVersion??null})]);
    await audit(db,actorId,"membership.activated","membership_record",membership.id,requestId,{applicationId,paymentId:pay.id});
    await notify(db,app.user_id,"membership_activated","membership_record",membership.id,{membershipNumber:number,productCode:app.product_code});
    return membership;
  });
}

export async function reverseMembershipPayment(paymentId,actorId,input,requestId){
  return withTransaction(async db=>{
    const reason=String(input.reason||"").trim();
    if(reason.length<8) throw httpError(400,"Provide a clear reason of at least 8 characters for the refund or reversal.","REVERSAL_REASON_REQUIRED");
    const row=(await db.query(`select pt.*,ap.application_id,a.user_id,a.status as application_status
      from payment_transaction pt
      join membership_application_payment ap on ap.payment_transaction_id=pt.id
      join membership_application a on a.id=ap.application_id
      where pt.id=$1 for update of pt,a`,[paymentId])).rows[0];
    if(!row) throw httpError(404,"Membership payment not found.","NOT_FOUND");
    const prior=(await db.query("select * from membership_payment_reversal where payment_transaction_id=$1",[paymentId])).rows[0];
    if(prior) return prior;
    if(row.status!=="succeeded") throw httpError(409,"Only a successfully verified membership payment can be refunded or reversed.","PAYMENT_NOT_REVERSIBLE");
    const reversalType=input.type==="reversal"?"reversal":"refund";
    const record=(await db.query(`insert into membership_payment_reversal(payment_transaction_id,application_id,reversal_type,reason,evidence_reference,reversed_by,metadata)
      values($1,$2,$3,$4,$5,$6,$7::jsonb) returning *`,[
      paymentId,row.application_id,reversalType,reason,String(input.evidenceReference||"").trim()||null,actorId,
      JSON.stringify({requestId:requestId||null,previousStatus:row.status,applicationStatus:row.application_status})
    ])).rows[0];
    await db.query("update payment_transaction set status='refunded',updated_at=now(),completed_at=coalesce(completed_at,now()),verification_note=$1 where id=$2",[reason,paymentId]);
    const suspended=(await db.query("update membership_record set status='suspended',updated_at=now() where application_id=$1 and status='active' returning id,user_id",[row.application_id])).rows;
    if(row.application_status==="paid"){
      await db.query("update membership_application set status='payment_pending',updated_at=now() where id=$1",[row.application_id]);
    }
    await audit(db,actorId,"membership.payment_reversed","membership_payment_reversal",record.id,requestId,{
      applicationId:row.application_id,paymentId,reversalType,suspendedMembershipIds:suspended.map(item=>item.id)
    });
    await notify(db,row.user_id,"membership_payment_reversed","membership_application",row.application_id,{
      reversalType,reason,membershipAccessChanged:suspended.length>0
    });
    return record;
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
       where ap.application_id=a.id order by pt.created_at desc limit 1) payment,
      coalesce((select jsonb_agg(jsonb_build_object('decision',rv.decision,'note',rv.note,'createdAt',rv.created_at) order by rv.created_at desc) from membership_application_review rv where rv.application_id=a.id),'[]'::jsonb) review_history
    from membership_application a join membership_product p on p.id=a.membership_product_id
    where a.status in ('submitted','in_review','correction_required','payment_pending','paid')
      or (a.status='activated' and exists(select 1 from membership_application_payment apx join payment_transaction ptx on ptx.id=apx.payment_transaction_id where apx.application_id=a.id and ptx.status='succeeded' and not exists(select 1 from membership_payment_reversal rtx where rtx.payment_transaction_id=ptx.id)))
    order by a.created_at asc`);
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

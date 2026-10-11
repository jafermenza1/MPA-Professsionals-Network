import { getPool } from "./db.js";

function statusLabel(status){
  const labels={submitted:"Submitted",in_review:"Under review",correction_required:"Correction required",payment_pending:"Payment required",paid:"Payment verified",activated:"Approved and active",rejected:"Rejected",draft:"Draft",pending:"Pending",verified:"Verified"};
  return labels[status]||String(status||"Unknown").replace(/_/g," ");
}

export async function getApplicationTracking(userId,{limit=50,offset=0,reference=null}={}){
  const db=getPool();
  const pageSize=Math.min(Math.max(Number.parseInt(limit,10)||50,1),100);
  const pageOffset=Math.max(Number.parseInt(offset,10)||0,0);
  const trackingReference=String(reference||"").trim().toUpperCase()||null;
  const result=await db.query(`
    with tracking as (
      select a.id::text id,a.tracking_reference,'membership'::text type,p.name title,
        case when a.application_type='renewal' then 'Membership renewal' else 'Membership application' end subtitle,
        a.status,a.updated_at,a.created_at,a.submitted_at,
        case when a.status='correction_required' then 'Respond to the correction request'
          when a.status='payment_pending' then 'Submit the approved membership payment'
          when a.status='paid' then 'Await activation' else 'No action required' end next_action,
        jsonb_build_object('productCode',p.product_code,'reviewedAt',a.reviewed_at,'approvedAt',a.approved_at,'activatedAt',a.activated_at) details
      from membership_application a join membership_product p on p.id=a.membership_product_id where a.user_id=$1
      union all
      select o.id::text,o.tracking_reference,'organization'::text,coalesce(o.display_name,o.legal_name),'Partner organization registration',
        coalesce(ov.status,'draft'),coalesce(o.updated_at,o.created_at),o.created_at,ov.submitted_at,
        case when coalesce(ov.status,'draft')='draft' then 'Complete and submit organization verification'
          when ov.status='correction_required' then 'Provide requested organization corrections'
          when ov.status='pending' then 'Await organization review' else 'No action required' end,
        jsonb_build_object('legalName',o.legal_name,'reviewedAt',ov.reviewed_at)
      from organization o join organization_membership om on om.organization_id=o.id and om.user_id=$1 and om.status='active'
      left join lateral (select status,submitted_at,reviewed_at from organization_verification_case where organization_id=o.id order by submitted_at desc limit 1) ov on true
      union all
      select a.id::text,a.tracking_reference,'job'::text,j.title,'Application · '||o.display_name,a.status,coalesce(a.updated_at,a.created_at),a.created_at,a.submitted_at,
        case when a.status='draft' then 'Complete and submit application'
          when a.status in ('rejected','withdrawn') then 'No action available' else 'Monitor recruitment progress' end,
        jsonb_build_object('jobId',j.id,'jobStatus',j.status,'organization',o.display_name)
      from job_application a join job j on j.id=a.job_id join organization o on o.id=j.organization_id where a.applicant_user_id=$1
    ), matching as (
      select * from tracking where $4::text is null or upper(tracking_reference)=upper($4)
    ), counts as (
      select count(*)::int total,
        count(*) filter(where status not in ('rejected','withdrawn','activated','verified'))::int active,
        count(*) filter(where next_action<>'No action required')::int next_steps,
        count(*) filter(where type='membership')::int memberships,
        count(*) filter(where type='organization')::int organizations,
        count(*) filter(where type='job')::int job_applications
      from matching
    ), page as (
      select * from matching order by updated_at desc nulls last,type,id limit $2 offset $3
    ), attention as (
      select * from matching where next_action<>'No action required' order by updated_at asc nulls first,type,id limit 5
    )
    select page.*,counts.total,counts.active,counts.next_steps,counts.memberships,counts.organizations,counts.job_applications,
      coalesce((select jsonb_agg(jsonb_build_object('id',attention.id,'trackingReference',attention.tracking_reference,'type',attention.type,'title',attention.title,'subtitle',attention.subtitle,'status',attention.status,'updatedAt',attention.updated_at,'nextAction',attention.next_action) order by attention.updated_at asc nulls first,attention.type,attention.id) from attention),'[]'::jsonb) attention_items
    from counts left join page on true order by page.updated_at desc nulls last,page.type,page.id`,[userId,pageSize,pageOffset,trackingReference]);
  const countRow=result.rows[0]||{};
  const toItem=row=>({
    id:row.id,trackingReference:row.tracking_reference,type:row.type,title:row.title,subtitle:row.subtitle,status:row.status,statusLabel:statusLabel(row.status),
    updatedAt:row.updated_at||row.created_at,submittedAt:row.submitted_at,nextAction:row.next_action,details:row.details
  });
  const items=result.rows.filter(row=>row.id).map(toItem);
  const attentionItems=(countRow.attention_items||[]).map(item=>({...item,statusLabel:statusLabel(item.status)}));
  const summary={total:Number(countRow.total||0),active:Number(countRow.active||0),nextSteps:Number(countRow.next_steps||0),memberships:Number(countRow.memberships||0),organizations:Number(countRow.organizations||0),jobApplications:Number(countRow.job_applications||0)};
  return {items,attentionItems,summary,limit:pageSize,offset:pageOffset,hasMore:pageOffset+items.length<summary.total};
}

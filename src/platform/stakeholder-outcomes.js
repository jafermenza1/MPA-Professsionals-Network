import { getPool } from "./db.js";

function fail(status,message,code="BUSINESS_RULE"){const e=new Error(message);e.statusCode=status;e.code=code;return e;}

export async function getMyOutcomeWorkspace(userId){
  const db=getPool();
  const jobs=(await db.query(`select a.id application_id,a.status,a.submitted_at,a.updated_at,j.id job_id,j.title,o.display_name organization_name,
    coalesce((select count(*)::int from job_interview ji where ji.application_id=a.id and ji.status in ('scheduled','confirmed')),0) upcoming_interviews
    from job_application a join job j on j.id=a.job_id join organization o on o.id=j.organization_id
    where a.applicant_user_id=$1 order by a.updated_at desc limit 50`,[userId])).rows;
  const services=(await db.query(`select sr.id,sr.status,sr.created_at,sr.updated_at,sr.accepted_at,sr.requester_accepted_at,sr.outcome_summary,sl.title service_title,
    case when sr.provider_user_id=$1 then 'provider' else 'requester' end participant_role
    from service_request sr join service_listing sl on sl.id=sr.service_listing_id
    where sr.provider_user_id=$1 or sr.requester_user_id=$1 order by sr.updated_at desc limit 50`,[userId])).rows;
  const mentorships=(await db.query(`select m.id,m.status,m.started_at,m.completed_at,
    case when m.mentor_user_id=$1 then 'mentor' else 'mentee' end participant_role,
    (select count(*)::int from mentorship_goal g where g.mentorship_id=m.id and g.status='achieved') achieved_goals,
    (select count(*)::int from mentorship_goal g where g.mentorship_id=m.id and g.status not in ('cancelled')) total_goals,
    (select count(*)::int from mentorship_session s where s.mentorship_id=m.id and s.status='completed') completed_sessions
    from mentorship m where m.mentor_user_id=$1 or m.mentee_user_id=$1 order by m.updated_at desc limit 50`,[userId])).rows;
  const inquiries=(await db.query(`select id,status,subject,contact_release,created_at,responded_at,
    case when requester_user_id=$1 then 'requester' else 'professional' end participant_role
    from talent_inquiry where requester_user_id=$1 or professional_user_id=$1 order by updated_at desc limit 50`,[userId])).rows;
  return {jobs,services,mentorships,inquiries};
}

export async function getOrganizationOutcomeWorkspace(orgId,userId){
  const db=getPool();
  const membership=(await db.query("select role_code from organization_membership where organization_id=$1 and user_id=$2 and status='active'",[orgId,userId])).rows[0];
  if(!membership || !["owner","administrator","recruiter","read_only","finance","project_manager","event_manager"].includes(membership.role_code)) throw fail(403,"You do not have access to this organization outcome workspace.","FORBIDDEN");
  const jobs=(await db.query(`select j.id,j.title,j.status,j.posting_scope,j.positions_count,j.published_at,j.closed_at,
    count(a.id)::int applications,
    count(a.id) filter(where a.status in ('screening','shortlisted','interview'))::int active_pipeline,
    count(a.id) filter(where a.status='offer')::int offers,
    count(a.id) filter(where a.status='accepted')::int accepted_offers,
    count(a.id) filter(where a.status='hired')::int hires,
    count(distinct ji.id) filter(where ji.status in ('scheduled','confirmed'))::int scheduled_interviews
    from job j left join job_application a on a.job_id=j.id left join job_interview ji on ji.application_id=a.id
    where j.organization_id=$1 group by j.id order by j.created_at desc`,[orgId])).rows;
  const requisitions=(await db.query(`select r.*,count(j.id)::int published_jobs from job_requisition r left join job j on j.requisition_id=r.id
    where r.organization_id=$1 group by r.id order by r.created_at desc`,[orgId])).rows;
  return {jobs,requisitions};
}

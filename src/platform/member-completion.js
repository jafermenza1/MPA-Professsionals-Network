import { getPool } from "./db.js";

export async function getCompletion(userId){
  const db=getPool();
  const rows=(await db.query(`
    select r.id,r.code,r.label,r.section,r.field_path,r.requirement_type,r.required,
           coalesce(i.status,'missing') as status,i.completed_at,i.last_reminded_at,i.reminder_count
    from profile_completion_requirement r
    left join member_completion_item i on i.requirement_id=r.id and i.user_id=$1
    where r.active=true and r.required=true
    order by r.sort_order,r.label
  `,[userId])).rows;
  const total=rows.length;
  const complete=rows.filter(x=>x.status==="complete"||x.status==="accepted").length;
  return {percent:total?Math.round(complete*100/total):100,total,complete,items:rows};
}

export async function ensureCompletionItems(userId){
  const db=getPool();
  await db.query(`insert into member_completion_item(user_id,requirement_id)
    select $1,id from profile_completion_requirement where active=true and required=true
    on conflict(user_id,requirement_id) do nothing`,[userId]);
  return getCompletion(userId);
}

export async function scheduleDueReminders({now=new Date(),limit=100}={}){
  const db=getPool();
  const rows=(await db.query(`
    select i.user_id,i.id,r.code,r.reminder_after_days,r.reminder_interval_days
    from member_completion_item i join profile_completion_requirement r on r.id=i.requirement_id
    where r.active=true and r.required=true and i.status not in ('complete','accepted')
      and (i.last_reminded_at is null or i.last_reminded_at + make_interval(days=>coalesce(r.reminder_interval_days,7)) <= $1)
    order by i.updated_at asc limit $2
  `,[now,limit])).rows;
  for(const row of rows){
    const due=new Date(now);
    const key=`completion:${row.user_id}:${row.code}:${due.toISOString().slice(0,10)}`;
    await db.query(`insert into notification_schedule(user_id,event_code,channel,scheduled_for,dedupe_key)
      values($1,'profile_completion_reminder','in_app',$2,$3)
      on conflict(dedupe_key) do nothing`,[row.user_id,now,key]);
    await db.query(`update member_completion_item set last_reminded_at=$1,reminder_count=reminder_count+1,updated_at=now() where id=$2`,[now,row.id]);
  }
  return {scheduled:rows.length};
}

import { getPool, withTransaction } from "./db.js";

export class NotificationProvider { async send(){throw new Error("No notification provider configured.");} }
export class NotificationService { constructor(provider){this.provider=provider;} async send(command){return this.provider.send(command);} }

const CATEGORIES = new Set(["membership","verification","opportunities","recruitment","organizations","mentorship","services","events_learning","security","system"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fail(status,message,code="BUSINESS_RULE"){throw Object.assign(new Error(message),{statusCode:status,code});}
export function safeInternalUrl(value){const url=String(value||"");return url.startsWith("/")&&!url.startsWith("//")&&![...url].some(ch=>ch.charCodeAt(0)<32||ch.charCodeAt(0)===127)?url:null;}
function eventTitle(code){return String(code||"Update").split(/[._-]+/).filter(Boolean).map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(" ");}
function present(row){
  const payload=row.payload&&typeof row.payload==="object"?row.payload:{};
  const title=row.title||payload.title||eventTitle(row.event_code);
  const body=row.body||payload.message||payload.summary||payload.nextAction||payload.next_action||(payload.status?("Status updated: "+String(payload.status).replace(/[_-]+/g," ").toLowerCase()):"There is an update to review in your MPA Network account.");
  return {id:row.id,category:row.category,title,body,priority:row.priority,actionRequired:row.action_required,
    actionUrl:safeInternalUrl(row.action_url),resourceType:row.resource_type,resourceId:row.resource_id,
    eventCode:row.event_code,createdAt:row.created_at,readAt:row.read_at,archivedAt:row.archived_at};
}
export function parseNotificationFilters(input={}){
  const category=String(input.category||"all");
  if(category!=="all"&&!CATEGORIES.has(category))fail(400,"Choose a supported notification category.","VALIDATION_ERROR");
  const limit=Math.min(Math.max(Number.parseInt(input.limit,10)||30,1),100);
  const offset=Math.min(Math.max(Number.parseInt(input.offset,10)||0,0),100000);
  return {category,limit,offset,unreadOnly:String(input.unreadOnly||"false")==="true",actionRequired:String(input.actionRequired||"false")==="true"};
}
export async function getNotificationInbox(userId,input={}){
  const db=getPool(),f=parseNotificationFilters(input),where=["notification_event.user_id=$1","notification_event.archived_at IS NULL","coalesce((select in_app_enabled from notification_preference where user_id=$1),true)=true","coalesce((select (in_app_categories->>notification_event.category)::boolean from notification_preference where user_id=$1),true)=true"],values=[userId];
  if(f.category!=="all"){values.push(f.category);where.push(`category=$${values.length}`);}
  if(f.unreadOnly)where.push("read_at IS NULL");
  if(f.actionRequired)where.push("action_required=true");
  const clause=where.join(" AND ");
  const [items,counts]=await Promise.all([
    db.query(`SELECT id,category,title,body,priority,action_required,action_url,resource_type,resource_id,event_code,payload,created_at,read_at,archived_at
      FROM notification_event WHERE ${clause} ORDER BY (action_required AND read_at IS NULL) DESC,
      CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      created_at DESC,id DESC LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,f.limit,f.offset]),
    db.query(`SELECT count(*) FILTER(WHERE archived_at IS NULL)::int AS total,
      count(*) FILTER(WHERE archived_at IS NULL AND read_at IS NULL)::int AS unread,
      count(*) FILTER(WHERE archived_at IS NULL AND action_required=true)::int AS action_required,
      count(*) FILTER(WHERE archived_at IS NULL AND action_required=true AND read_at IS NULL)::int AS unread_action_required
      FROM notification_event WHERE user_id=$1 AND coalesce((select in_app_enabled from notification_preference where user_id=$1),true)=true AND coalesce((select (in_app_categories->>notification_event.category)::boolean from notification_preference where user_id=$1),true)=true`,[userId])
  ]);
  return {items:items.rows.map(present),counts:counts.rows[0]||{total:0,unread:0,action_required:0,unread_action_required:0},page:{limit:f.limit,offset:f.offset,hasMore:items.rows.length===f.limit}};
}
export async function markNotificationRead(userId,id,requestId){
  if(!UUID.test(String(id||"")))fail(400,"Notification identifier is invalid.","VALIDATION_ERROR");
  return withTransaction(async db=>{
    const row=(await db.query("UPDATE notification_event SET read_at=coalesce(read_at,now()) WHERE id=$1 AND user_id=$2 AND archived_at IS NULL RETURNING id,read_at,action_required",[id,userId])).rows[0];
    if(!row)fail(404,"Notification not found.","NOT_FOUND");
    await db.query("INSERT INTO audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) VALUES($1,'notification.read','notification_event',$2,$3,'success',$4)",[userId,id,requestId||null,{actionRequired:row.action_required}]);
    return {id:row.id,readAt:row.read_at};
  });
}
export async function markAllNotificationsRead(userId,requestId){
  return withTransaction(async db=>{
    const r=await db.query("UPDATE notification_event SET read_at=now() WHERE user_id=$1 AND read_at IS NULL AND archived_at IS NULL RETURNING id",[userId]);
    await db.query("INSERT INTO audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) VALUES($1,'notification.read_all','notification_event',NULL,$2,'success',$3)",[userId,requestId||null,{count:r.rowCount}]);
    return {updated:r.rowCount};
  });
}
export async function archiveNotification(userId,id,requestId){
  if(!UUID.test(String(id||"")))fail(400,"Notification identifier is invalid.","VALIDATION_ERROR");
  return withTransaction(async db=>{
    const row=(await db.query("UPDATE notification_event SET archived_at=coalesce(archived_at,now()),read_at=coalesce(read_at,now()) WHERE id=$1 AND user_id=$2 AND archived_at IS NULL RETURNING id,archived_at",[id,userId])).rows[0];
    if(!row)fail(404,"Notification not found.","NOT_FOUND");
    await db.query("INSERT INTO audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) VALUES($1,'notification.archived','notification_event',$2,$3,'success','{}'::jsonb)",[userId,id,requestId||null]);
    return {id:row.id,archivedAt:row.archived_at};
  });
}
export async function getActionCenterSummary(userId){
  const db=getPool();
  const r=await db.query(`SELECT count(*) FILTER(WHERE archived_at IS NULL AND read_at IS NULL)::int AS unread,
    count(*) FILTER(WHERE archived_at IS NULL AND action_required=true)::int AS action_required,
    count(*) FILTER(WHERE archived_at IS NULL AND action_required=true AND read_at IS NULL)::int AS unread_action_required
    FROM notification_event WHERE user_id=$1 AND coalesce((select in_app_enabled from notification_preference where user_id=$1),true)=true AND coalesce((select (in_app_categories->>notification_event.category)::boolean from notification_preference where user_id=$1),true)=true`,[userId]);
  return r.rows[0]||{unread:0,action_required:0,unread_action_required:0};
}

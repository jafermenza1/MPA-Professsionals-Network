import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPool, closePool } from "../../src/platform/db.js";
import { listSavedViews, saveSavedView, deleteSavedView } from "../../src/platform/reports.js";

async function createUser(){
 const suffix=randomUUID();
 return (await getPool().query("insert into app_user(username,email,status) values($1,$2,'active') returning id",["report-view-"+suffix,"report-view-"+suffix+"@example.invalid"])).rows[0].id;
}
test("saved report views are private to their owner, role-authorized, and auditable",async()=>{
 const ownerId=await createUser(),outsiderId=await createUser();
 const owner={sub:ownerId,roles:["system_admin"],permissions:[]};
 const outsider={sub:outsiderId,roles:["system_admin"],permissions:[]};
 const saved=await saveSavedView(owner,{reportId:"job-application-funnel",name:"Quarterly hiring funnel",filters:{from:"2026-01-01",to:"2026-03-31",status:"published",q:"engineering",groupBy:"default"}},"report-view-create");
 assert.equal(saved.name,"Quarterly hiring funnel");
 assert.equal(saved.report_id,"job-application-funnel");
 assert.equal(saved.filters.from,"2026-01-01");
 assert.equal((await listSavedViews(owner)).some(view=>view.id===saved.id),true);
 assert.equal((await listSavedViews(outsider)).some(view=>view.id===saved.id),false,"saved views are not shared across accounts by default");
 await assert.rejects(saveSavedView(owner,{reportId:"job-application-funnel",name:"Quarterly hiring funnel",filters:{}},"report-view-duplicate"),error=>error.code==="VIEW_NAME_EXISTS");
 await assert.rejects(deleteSavedView(outsider,saved.id,"report-view-outsider-delete"),error=>error.code==="SAVED_VIEW_NOT_FOUND");
 const removed=await deleteSavedView(owner,saved.id,"report-view-delete");
 assert.equal(removed.deleted,true);
 assert.equal((await listSavedViews(owner)).some(view=>view.id===saved.id),false);
 const audit=(await getPool().query("select action from audit_log where actor_user_id=$1 and resource_type='report_saved_view' and resource_id=$2 order by occurred_at",[ownerId,saved.id])).rows.map(row=>row.action);
 assert.ok(audit.includes("report.saved_view_created"));
 assert.ok(audit.includes("report.saved_view_deleted"));
});
test.after(async()=>{await closePool();});

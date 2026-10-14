import { randomUUID } from "node:crypto";
import { getPool, withTransaction } from "./db.js";

function fail(status,message,code="BUSINESS_RULE"){return Object.assign(new Error(message),{statusCode:status,code});}
const ADMIN_ROLES=["system_admin","admin","platform_admin"];
export function assertReferenceAdmin(identity){
 const roles=Array.isArray(identity?.roles)?identity.roles:[];
 const permissions=Array.isArray(identity?.permissions)?identity.permissions:[];
 if(!ADMIN_ROLES.some(role=>roles.includes(role))&&!permissions.includes("reference:update")&&!permissions.includes("reference:import")) throw fail(403,"Reference portfolio administration permission is required.","FORBIDDEN");
}
const clean=(v,max=180)=>String(v??"").trim().slice(0,max);
function csvEscape(value){const s=String(value??"");return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
function parseCsv(source,mapping={},allowUnmapped=false){
 const rows=[];let row=[],cell="",quoted=false;
 const text=String(source||"").replace(/^\uFEFF/,"");
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}else if(c==='"')quoted=true;else if(c===","){row.push(cell);cell="";}else if(c==="\n"){row.push(cell.replace(/\r$/,""));rows.push(row);row=[];cell="";}else cell+=c;}
 if(quoted) throw fail(400,"CSV contains an unclosed quoted field.","CSV_INVALID");
 if(cell.length||row.length){row.push(cell.replace(/\r$/,""));rows.push(row);}
 if(rows.length<2) throw fail(400,"CSV must include a header row and at least one data row.","CSV_EMPTY");
 const sourceHeaders=rows.shift().map(h=>h.trim());
 const headers=sourceHeaders.map(h=>h.toLowerCase());
 const mapped=Object.keys(mapping||{}).length>0;
 const indexes={};
 if(mapped){for(const [target,source] of Object.entries(mapping))if(source&&sourceHeaders.includes(String(source)))indexes[target]=sourceHeaders.indexOf(String(source));if((indexes.code===undefined||indexes.label===undefined)&&!allowUnmapped)throw fail(400,"Map both Code and Label to columns before importing.","CSV_COLUMNS_REQUIRED");}
 else if(!allowUnmapped)for(const required of ["code","label"])if(!headers.includes(required))throw fail(400,"CSV must include code and label columns.","CSV_COLUMNS_REQUIRED");
 const canonical=["code","label","description","sort_order","active","parent_code","aliases"];
 return rows.filter(r=>r.some(v=>String(v).trim())).map((values,index)=>{const row={};if(allowUnmapped&&(!mapped||indexes.code===undefined||indexes.label===undefined)){for(let i=0;i<headers.length;i++)row[sourceHeaders[i]]=values[i]??"";}else for(const key of canonical){const ix=mapped?indexes[key]:headers.indexOf(key);if(ix!==undefined&&ix>=0)row[key]=values[ix]??"";}return {...row,__row:index+2};});
}
async function datasetContext(db,key,{edit=false,actorId=null}={}){
 const dataset=(await db.query("select * from reference_dataset where dataset_key=$1 and status='active'",[key])).rows[0];
 if(!dataset) throw fail(404,"Reference dataset was not found.","NOT_FOUND");
 const published=(await db.query("select * from reference_dataset_version where dataset_id=$1 and status='published' order by published_at desc nulls last,created_at desc limit 1",[dataset.id])).rows[0]||null;
 let draft=(await db.query("select * from reference_dataset_version where dataset_id=$1 and status in ('draft','validated','submitted','approved') order by created_at desc limit 1",[dataset.id])).rows[0]||null;
 if(edit&&!draft){
  const label="draft-"+new Date().toISOString().slice(0,10)+"-"+randomUUID().slice(0,8);
  draft=(await db.query("insert into reference_dataset_version(dataset_id,version_label,status,import_method,notes,created_by) values($1,$2,'draft','manual','Working copy. Public forms continue using the published version until this draft is published.',$3) returning *",[dataset.id,label,actorId])).rows[0];
  if(published) await db.query("with source as (select * from reference_item where dataset_version_id=$3), mapped as (select id,gen_random_uuid() new_id from source) insert into reference_item(id,dataset_version_id,code,parent_item_id,label,short_label,description,aliases,metadata,sort_order,active,effective_from,effective_to,created_by,updated_by) select child.new_id,$1,s.code,parent.new_id,s.label,s.short_label,s.description,s.aliases,s.metadata,s.sort_order,s.active,s.effective_from,s.effective_to,$2,$2 from source s join mapped child on child.id=s.id left join mapped parent on parent.id=s.parent_item_id",[draft.id,actorId,published.id]);
 }
 const version=draft||published;
 if(!version) throw fail(409,"This reference list has no working or published version. Create a working copy before editing.","REFERENCE_VERSION_MISSING");
 return {dataset,version,published,draft};
}

export async function listPublicReferenceSets(){
 const db=getPool();
 return (await db.query("select d.dataset_key,d.name,d.domain,ri.id,ri.code,ri.label,ri.description,ri.aliases,ri.sort_order from reference_dataset d join reference_dataset_version v on v.dataset_id=d.id and v.status='published' join reference_item ri on ri.dataset_version_id=v.id and ri.active=true where d.status='active' and d.dataset_key like 'professional_%' order by d.name,ri.sort_order,ri.label")).rows;
}
export async function listReferenceDatasets(identity){
 assertReferenceAdmin(identity);const db=getPool();
 return (await db.query("select d.id,d.dataset_key,d.name,d.description,d.domain,d.status,v.id version_id,v.version_label,v.status version_status,(select count(*) from reference_item ri where ri.dataset_version_id=v.id and ri.active=true) item_count,v.published_at,(select x.version_label from reference_dataset_version x where x.dataset_id=d.id and x.status='published' order by x.published_at desc nulls last limit 1) published_version_label from reference_dataset d left join lateral (select * from reference_dataset_version x where x.dataset_id=d.id and x.status in ('draft','validated','submitted','approved','published') order by case when x.status in ('draft','validated','submitted','approved') then 0 else 1 end,x.created_at desc limit 1) v on true where d.dataset_key like 'professional_%' order by d.name")).rows;
}
export async function listReferenceItems(identity,key){
 assertReferenceAdmin(identity);const db=getPool();const {dataset,version,published,draft}=await datasetContext(db,key);
 return {dataset:{dataset_key:dataset.dataset_key,name:dataset.name,domain:dataset.domain},version:{id:version.id,version_label:version.version_label,status:version.status,hasDraft:Boolean(draft),publishedVersionLabel:published?.version_label||null},items:(await db.query("select id,code,label,description,aliases,sort_order,active,metadata from reference_item where dataset_version_id=$1 order by sort_order,label",[version.id])).rows};
}
export async function saveReferenceItem(identity,key,input,itemId=null){
 assertReferenceAdmin(identity);
 const code=clean(input?.code,80).toUpperCase(),label=clean(input?.label,180),description=clean(input?.description,2000),aliases=Array.from(new Set((Array.isArray(input?.aliases)?input.aliases:String(input?.aliases||"").split(/[;,|]/)).map(value=>clean(value,180).toLocaleLowerCase()).filter(value=>value&&value!==label.toLocaleLowerCase())));
 if(!/^[A-Z0-9][A-Z0-9._-]{0,79}$/.test(code)||label.length<1) throw fail(400,"Enter a code using letters/numbers and a clear label.","REFERENCE_ITEM_INVALID");
 return withTransaction(async db=>{
  const {dataset,version,published}=await datasetContext(db,key,{edit:true,actorId:identity.sub});
  await db.query("update reference_dataset_version set status='draft',approved_by=null where id=$1 and status<>'draft'",[version.id]);
  let row;
  if(itemId){
   let targetId=itemId;
   const inWorkingCopy=(await db.query("select id from reference_item where id=$1 and dataset_version_id=$2",[itemId,version.id])).rows[0];
   if(!inWorkingCopy&&published){
    const original=(await db.query("select code from reference_item where id=$1 and dataset_version_id=$2",[itemId,published.id])).rows[0];
    if(original) targetId=(await db.query("select id from reference_item where dataset_version_id=$1 and code=$2",[version.id,original.code])).rows[0]?.id||itemId;
   }
   const existingCode=(await db.query("select code from reference_item where id=$1 and dataset_version_id=$2",[targetId,version.id])).rows[0]?.code;
   if(existingCode&&existingCode!==code)throw fail(409,"Reference codes are permanent identifiers. Create a new code and retire the old value instead of renaming its code.","REFERENCE_CODE_IMMUTABLE");
   row=(await db.query("update reference_item set label=$1,description=$2,aliases=$3,sort_order=$4,active=$5,updated_by=$6,updated_at=now() where id=$7 and dataset_version_id=$8 returning id,code,label,description,aliases,sort_order,active",[label,description||null,JSON.stringify(aliases),Number(input.sortOrder)||0,input.active!==false,identity.sub,targetId,version.id])).rows[0];
   if(!row) throw fail(404,"Reference item was not found in this dataset version.","NOT_FOUND");
  }else{
   row=(await db.query("insert into reference_item(dataset_version_id,code,label,description,aliases,sort_order,active,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$8) returning id,code,label,description,aliases,sort_order,active",[version.id,code,label,description||null,JSON.stringify(aliases),Number(input.sortOrder)||0,input.active!==false,identity.sub])).rows[0];
  }
  await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,'reference_item',$3,$4,'success',$5)",[identity.sub,itemId?"reference.item_updated":"reference.item_created",row.id,input.requestId||null,JSON.stringify({datasetKey:key,code,label,active:row.active})]);
  return row;
 });
}
export async function previewReferenceCsv(identity,key,filename,csv){
 assertReferenceAdmin(identity);
 const headerLine=String(csv||"").replace(/^\uFEFF/,"").split(/\r?\n/,1)[0]||"";
 const headers=[];let cell="",quoted=false;for(let i=0;i<headerLine.length;i++){const ch=headerLine[i];if(ch==="\""&&quoted&&headerLine[i+1]==="\""){cell+="\"";i++;}else if(ch==="\"")quoted=!quoted;else if(ch===","&&!quoted){headers.push(cell.trim());cell="";}else cell+=ch;}headers.push(cell.trim());
 const mapping={};for(const target of ["code","label","description","sort_order","active","parent_code","aliases"]){const found=headers.find(h=>h.toLowerCase()===target);if(found)mapping[target]=found;}
 const complete=Boolean(mapping.code&&mapping.label);
 const rows=parseCsv(csv,mapping,!complete);
 if(!complete)return {filename:clean(filename,180),headers,mapping,rowCount:rows.length,sample:rows.slice(0,5).map(({__row,...row})=>row),errors:[],canImport:false};
 const db=getPool();const dataset=(await db.query("select id from reference_dataset where dataset_key=$1 and status='active'",[key])).rows[0];if(!dataset)throw fail(404,"Reference dataset was not found.","NOT_FOUND");
 const version=(await db.query("select id from reference_dataset_version where dataset_id=$1 and status in ('draft','validated','submitted','approved','published') order by case when status in ('draft','validated','submitted','approved') then 0 else 1 end,created_at desc limit 1",[dataset.id])).rows[0];
 const existing=new Set(version?(await db.query("select code from reference_item where dataset_version_id=$1",[version.id])).rows.map(x=>x.code):[]);
 const seen=new Set(),errors=[],parents=new Map();
 for(const row of rows){const code=clean(row.code,80).toUpperCase(),parent=clean(row.parent_code,80).toUpperCase();if(!/^[A-Z0-9][A-Z0-9._-]{0,79}$/.test(code)||!clean(row.label,180))errors.push({row:row.__row,message:"Code and Label are required; Code must use letters, numbers, dot, underscore or hyphen."});if(seen.has(code))errors.push({row:row.__row,message:"Duplicate code in this file."});seen.add(code);if(parent){if(parent===code)errors.push({row:row.__row,message:"An item cannot be its own parent."});else if(!existing.has(parent)&&!rows.some(candidate=>clean(candidate.code,80).toUpperCase()===parent))errors.push({row:row.__row,message:"Parent code "+parent+" is not in the file or current working copy."});parents.set(code,parent);}}
 for(const [code,parent] of parents){const visited=new Set([code]);let cursor=parent;while(cursor&&parents.has(cursor)){if(visited.has(cursor)){errors.push({row:rows.find(x=>clean(x.code,80).toUpperCase()===code)?.__row||0,message:"Parent relationships contain a cycle involving "+code+"."});break;}visited.add(cursor);cursor=parents.get(cursor);}}
 return {filename:clean(filename,180),headers,mapping,rowCount:rows.length,sample:rows.slice(0,5).map(({__row,...row})=>row),errors,canImport:errors.length===0};
}
export async function importReferenceCsv(identity,key,filename,csv,mapping={}){
 assertReferenceAdmin(identity);
 const rows=parseCsv(csv,mapping);const seen=new Set();const errors=[];
 rows.forEach(row=>{const code=clean(row.code,80).toUpperCase();if(!/^[A-Z0-9][A-Z0-9._-]{0,79}$/.test(code)||!clean(row.label,180))errors.push({row:row.__row,message:"Code and label are required and Code must use letters, numbers, dot, underscore or hyphen."});if(seen.has(code))errors.push({row:row.__row,message:"Duplicate code within this CSV."});seen.add(code);});
 if(errors.length) return {status:"rejected",imported:0,errors};
 return withTransaction(async db=>{
  const {dataset,version}=await datasetContext(db,key,{edit:true,actorId:identity.sub});
   await db.query("update reference_dataset_version set status='draft',approved_by=null where id=$1 and status<>'draft'",[version.id]);
   let inserted=0,updated=0;
  for(const row of rows){
   const code=clean(row.code,80).toUpperCase(),label=clean(row.label,180),description=clean(row.description,2000)||null,active=!["false","0","inactive","no"].includes(String(row.active||"true").toLowerCase());
   const existing=(await db.query("select id,label,description,active from reference_item where dataset_version_id=$1 and code=$2 for update",[version.id,code])).rows[0];
   if(existing){await db.query("update reference_item set label=$1,description=$2,active=$3,sort_order=$4,updated_by=$5,updated_at=now() where id=$6",[label,description,active,Number(row.sort_order)||0,identity.sub,existing.id]);updated++;}
   else{await db.query("insert into reference_item(dataset_version_id,code,label,description,active,sort_order,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$7)",[version.id,code,label,description,active,Number(row.sort_order)||0,identity.sub]);inserted++;}
  }
  for(const row of rows){const code=clean(row.code,80).toUpperCase(),parent=clean(row.parent_code,80).toUpperCase();if(parent){const parentRow=(await db.query("select id from reference_item where dataset_version_id=$1 and code=$2",[version.id,parent])).rows[0];if(!parentRow)throw fail(400,"Parent code "+parent+" was not found in the working copy.","REFERENCE_PARENT_INVALID");await db.query("update reference_item set parent_item_id=$1 where dataset_version_id=$2 and code=$3",[parentRow.id,version.id,code]);}else if(row.parent_code!==undefined)await db.query("update reference_item set parent_item_id=null where dataset_version_id=$1 and code=$2",[version.id,code]);}
  await db.query("insert into reference_import(dataset_id,target_version_id,filename,format,status,uploaded_by,completed_at) values($1,$2,$3,'csv','drafted',$4,now())",[dataset.id,version.id,clean(filename,180)||"reference-import.csv",identity.sub]);
  await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,outcome,metadata) values($1,'reference.csv_imported','reference_dataset',$2,'success',$3)",[identity.sub,dataset.id,JSON.stringify({datasetKey:key,rowCount:rows.length,inserted,updated})]);
  return {status:"imported",datasetKey:key,rowCount:rows.length,inserted,updated,errors:[]};
 });
}

export async function publishReferenceDataset(identity,key,reason=""){
  assertReferenceAdmin(identity);
  return withTransaction(async db=>{
    const {dataset,version,draft}=await datasetContext(db,key,{edit:true,actorId:identity.sub});
    if(!draft||!["draft","validated","submitted","approved"].includes(version.status)) throw fail(409,"Only a working draft can be published. Refresh the list and try again.","REFERENCE_DRAFT_REQUIRED");
    const summary=(await db.query("select count(*)::int total,count(*) filter(where active=true)::int active,count(*) filter(where trim(code)='' or trim(label)='')::int invalid from reference_item where dataset_version_id=$1",[version.id])).rows[0];
    if(Number(summary.total)<1||Number(summary.active)<1||Number(summary.invalid)>0) throw fail(409,"This working copy needs at least one active item and valid codes and labels before publication.","REFERENCE_VALIDATION_FAILED");
    const duplicate=(await db.query("select code from reference_item where dataset_version_id=$1 group by code having count(*)>1 limit 1",[version.id])).rows[0];
    if(duplicate) throw fail(409,"This working copy contains duplicate codes. Correct them before publishing.","REFERENCE_DUPLICATE_CODE");
    const previous=(await db.query("select id from reference_dataset_version where dataset_id=$1 and status='published' for update",[dataset.id])).rows[0];
    if(previous) await db.query("update reference_dataset_version set status='archived',effective_to=coalesce(effective_to,current_date) where id=$1",[previous.id]);
    const published=(await db.query("update reference_dataset_version set status='published',published_at=now(),approved_by=$1,effective_from=coalesce(effective_from,current_date),notes=coalesce(notes,'')||$2 where id=$3 returning id,version_label,status,published_at",[identity.sub,reason.trim()?"\nPublication note: "+clean(reason,1000):"",version.id])).rows[0];
    await db.query("insert into reference_publication(dataset_version_id,action,performed_by,reason) values($1,'publish',$2,$3)",[version.id,identity.sub,clean(reason,1000)||null]);
    await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,outcome,metadata) values($1,'reference.dataset_published','reference_dataset',$2,'success',$3)",[identity.sub,dataset.id,{versionId:version.id,versionLabel:version.version_label,previousVersionId:previous?.id||null}]);
    return {datasetKey:key,version:published,previousVersionId:previous?.id||null,activeItemCount:Number(summary.active)};
  });
}

export async function exportReferenceCsv(identity,key){
 assertReferenceAdmin(identity);const db=getPool();const {version}=await datasetContext(db,key);
 const rows=(await db.query("select code,label,coalesce(description,'') description,sort_order,active from reference_item where dataset_version_id=$1 order by sort_order,label",[version.id])).rows;
 return {filename:key+".csv",csv:["code,label,description,sort_order,active",...rows.map(row=>[row.code,row.label,row.description,row.sort_order,row.active].map(csvEscape).join(","))].join("\r\n")};
}

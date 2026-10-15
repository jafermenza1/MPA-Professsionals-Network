import { randomUUID } from "node:crypto";
import { getPool, withTransaction } from "./db.js";
import { parseXlsxRows, createXlsx } from "./xlsx.js";

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
 const canonical=["code","label","description","sort_order","active","parent_code","aliases","short_label","metadata","effective_from","effective_to"];
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
   const duplicate=(await db.query("select id from reference_item where dataset_version_id=$1 and code=$2",[version.id,code])).rows[0];
   if(duplicate)throw fail(409,"This code already exists in the working copy. Edit that item or choose a new permanent code.","REFERENCE_CODE_EXISTS");
   row=(await db.query("insert into reference_item(dataset_version_id,code,label,description,aliases,sort_order,active,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$8) returning id,code,label,description,aliases,sort_order,active",[version.id,code,label,description||null,JSON.stringify(aliases),Number(input.sortOrder)||0,input.active!==false,identity.sub])).rows[0];
  }
  await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,'reference_item',$3,$4,'success',$5)",[identity.sub,itemId?"reference.item_updated":"reference.item_created",row.id,input.requestId||null,JSON.stringify({datasetKey:key,code,label,active:row.active})]);
  return row;
 });
}
export async function previewReferenceCsv(identity,key,filename,csv,providedMapping={}){
 assertReferenceAdmin(identity);
 const headerLine=String(csv||"").replace(/^\uFEFF/,"").split(/\r?\n/,1)[0]||"";
 const headers=[];let cell="",quoted=false;for(let i=0;i<headerLine.length;i++){const ch=headerLine[i];if(ch==="\""&&quoted&&headerLine[i+1]==="\""){cell+="\"";i++;}else if(ch==="\"")quoted=!quoted;else if(ch===","&&!quoted){headers.push(cell.trim());cell="";}else cell+=ch;}headers.push(cell.trim());
 const suggested={};for(const target of ["code","label","description","sort_order","active","parent_code","aliases","short_label","metadata","effective_from","effective_to"]){const found=headers.find(h=>h.toLowerCase()===target);if(found)suggested[target]=found;}const mapping=Object.keys(providedMapping||{}).length?providedMapping:suggested;
 const complete=Boolean(mapping.code&&mapping.label);
 const rows=parseCsv(csv,mapping,!complete);
 if(!complete)return {filename:clean(filename,180),headers,mapping,rowCount:rows.length,sample:rows.slice(0,5).map(({__row,...row})=>row),errors:[],canImport:false};
 const db=getPool();const dataset=(await db.query("select id from reference_dataset where dataset_key=$1 and status='active'",[key])).rows[0];if(!dataset)throw fail(404,"Reference dataset was not found.","NOT_FOUND");
 const version=(await db.query("select id from reference_dataset_version where dataset_id=$1 and status in ('draft','validated','submitted','approved','published') order by case when status in ('draft','validated','submitted','approved') then 0 else 1 end,created_at desc limit 1",[dataset.id])).rows[0];
 const existing=new Set(version?(await db.query("select code from reference_item where dataset_version_id=$1",[version.id])).rows.map(x=>x.code):[]);
 const seen=new Set(),errors=[],parents=new Map();
 for(const row of rows){const code=clean(row.code,80).toUpperCase(),parent=clean(row.parent_code,80).toUpperCase();if(!/^[A-Z0-9][A-Z0-9._-]{0,79}$/.test(code)||!clean(row.label,180))errors.push({row:row.__row,message:"Code and Label are required; Code must use letters, numbers, dot, underscore or hyphen."});if(seen.has(code))errors.push({row:row.__row,message:"Duplicate code in this file."});seen.add(code);if(parent){if(parent===code)errors.push({row:row.__row,message:"An item cannot be its own parent."});else if(!existing.has(parent)&&!rows.some(candidate=>clean(candidate.code,80).toUpperCase()===parent))errors.push({row:row.__row,message:"Parent code "+parent+" is not in the file or current working copy."});parents.set(code,parent);}if(row.metadata){try{const metadata=typeof row.metadata==="string"?JSON.parse(row.metadata):row.metadata;if(!metadata||typeof metadata!=="object"||Array.isArray(metadata))throw new Error();}catch{errors.push({row:row.__row,message:"Metadata must be a valid JSON object."});}}for(const field of ["effective_from","effective_to"]){const value=clean(row[field],10);if(value&&!/^\d{4}-\d{2}-\d{2}$/.test(value))errors.push({row:row.__row,message:field+" must be a valid YYYY-MM-DD date."});}if(row.effective_from&&row.effective_to&&String(row.effective_from)>String(row.effective_to))errors.push({row:row.__row,message:"Effective-from date must not be after effective-to date."});}
 for(const [code,parent] of parents){const visited=new Set([code]);let cursor=parent;while(cursor&&parents.has(cursor)){if(visited.has(cursor)){errors.push({row:rows.find(x=>clean(x.code,80).toUpperCase()===code)?.__row||0,message:"Parent relationships contain a cycle involving "+code+"."});break;}visited.add(cursor);cursor=parents.get(cursor);}}
 return {filename:clean(filename,180),headers,mapping,rowCount:rows.length,sample:rows.slice(0,5).map(({__row,...row})=>row),errors,canImport:errors.length===0};
}
export async function importReferenceCsv(identity,key,filename,csv,mapping={},format="csv"){
 assertReferenceAdmin(identity);
 const rows=parseCsv(csv,mapping);const seen=new Set();const errors=[],parents=new Map();
 rows.forEach(row=>{const code=clean(row.code,80).toUpperCase(),parent=clean(row.parent_code,80).toUpperCase();if(!/^[A-Z0-9][A-Z0-9._-]{0,79}$/.test(code)||!clean(row.label,180))errors.push({row:row.__row,message:"Code and label are required and Code must use letters, numbers, dot, underscore or hyphen."});if(seen.has(code))errors.push({row:row.__row,message:"Duplicate code within this import."});seen.add(code);if(parent){if(parent===code)errors.push({row:row.__row,message:"An item cannot be its own parent."});parents.set(code,parent);}if(row.metadata){try{const metadata=typeof row.metadata==="string"?JSON.parse(row.metadata):row.metadata;if(!metadata||typeof metadata!=="object"||Array.isArray(metadata))throw new Error();}catch{errors.push({row:row.__row,message:"Metadata must be a valid JSON object."});}}for(const field of ["effective_from","effective_to"]){const value=clean(row[field],10);if(value&&!/^\d{4}-\d{2}-\d{2}$/.test(value))errors.push({row:row.__row,message:field+" must be a valid YYYY-MM-DD date."});}if(row.effective_from&&row.effective_to&&String(row.effective_from)>String(row.effective_to))errors.push({row:row.__row,message:"Effective-from date must not be after effective-to date."});}});
 for(const [code,parent] of parents){const visited=new Set([code]);let cursor=parent;while(cursor&&parents.has(cursor)){if(visited.has(cursor)){errors.push({row:rows.find(x=>clean(x.code,80).toUpperCase()===code)?.__row||0,message:"Parent relationships contain a cycle involving "+code+"."});break;}visited.add(cursor);cursor=parents.get(cursor);}}
 if(errors.length) return {status:"rejected",imported:0,errors};
 return withTransaction(async db=>{
  const {dataset,version}=await datasetContext(db,key,{edit:true,actorId:identity.sub});
   await db.query("update reference_dataset_version set status='draft',approved_by=null where id=$1 and status<>'draft'",[version.id]);
   let inserted=0,updated=0;
  for(const row of rows){
   const code=clean(row.code,80).toUpperCase(),label=clean(row.label,180);
   const hasDescription=row.description!==undefined,hasShortLabel=row.short_label!==undefined,hasAliases=row.aliases!==undefined,hasMetadata=row.metadata!==undefined,hasActive=row.active!==undefined,hasSortOrder=row.sort_order!==undefined,hasEffectiveFrom=row.effective_from!==undefined,hasEffectiveTo=row.effective_to!==undefined;
   const description=hasDescription?(clean(row.description,2000)||null):null,shortLabel=hasShortLabel?(clean(row.short_label,80)||null):null,active=hasActive?!["false","0","inactive","no"].includes(String(row.active||"true").toLowerCase()):true,metadata=hasMetadata?(row.metadata?JSON.parse(typeof row.metadata==="string"?row.metadata:JSON.stringify(row.metadata)):{}):{},effectiveFrom=hasEffectiveFrom?(clean(row.effective_from,10)||null):null,effectiveTo=hasEffectiveTo?(clean(row.effective_to,10)||null):null,sortOrder=hasSortOrder?(Number(row.sort_order)||0):0;
   const existing=(await db.query("select id,label,description,active from reference_item where dataset_version_id=$1 and code=$2 for update",[version.id,code])).rows[0];
   const aliases=hasAliases?Array.from(new Set(String(row.aliases||"").split(/[;|]/).map(value=>clean(value,180).toLocaleLowerCase()).filter(value=>value&&value!==label.toLocaleLowerCase()))):[];
   if(existing){await db.query("update reference_item set label=$1,description=case when $12 then $2 else description end,short_label=case when $13 then $3 else short_label end,aliases=case when $14 then $4::jsonb else aliases end,metadata=case when $15 then $5::jsonb else metadata end,active=case when $16 then $6 else active end,sort_order=case when $17 then $7 else sort_order end,effective_from=case when $18 then $8 else effective_from end,effective_to=case when $19 then $9 else effective_to end,updated_by=$10,updated_at=now() where id=$11",[label,description,shortLabel,JSON.stringify(aliases),JSON.stringify(metadata),active,sortOrder,effectiveFrom,effectiveTo,identity.sub,existing.id,hasDescription,hasShortLabel,hasAliases,hasMetadata,hasActive,hasSortOrder,hasEffectiveFrom,hasEffectiveTo]);updated++;}
   else{await db.query("insert into reference_item(dataset_version_id,code,label,description,short_label,aliases,metadata,active,sort_order,effective_from,effective_to,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$12)",[version.id,code,label,description,shortLabel,JSON.stringify(aliases),JSON.stringify(metadata),active,sortOrder,effectiveFrom,effectiveTo,identity.sub]);inserted++;}
  }
  for(const row of rows){const code=clean(row.code,80).toUpperCase(),parent=clean(row.parent_code,80).toUpperCase();if(parent){const parentRow=(await db.query("select id from reference_item where dataset_version_id=$1 and code=$2",[version.id,parent])).rows[0];if(!parentRow)throw fail(400,"Parent code "+parent+" was not found in the working copy.","REFERENCE_PARENT_INVALID");await db.query("update reference_item set parent_item_id=$1 where dataset_version_id=$2 and code=$3",[parentRow.id,version.id,code]);}else if(row.parent_code!==undefined)await db.query("update reference_item set parent_item_id=null where dataset_version_id=$1 and code=$2",[version.id,code]);}
  await db.query("insert into reference_import(dataset_id,target_version_id,filename,format,status,uploaded_by,completed_at) values($1,$2,$3,$4,'drafted',$5,now())",[dataset.id,version.id,clean(filename,180)||("reference-import."+format),format,identity.sub]);
  await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,outcome,metadata) values($1,$2,'reference_dataset',$3,'success',$4)",[identity.sub,"reference."+format+"_imported",dataset.id,JSON.stringify({datasetKey:key,rowCount:rows.length,inserted,updated,format})]);
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
    const ambiguousAlias=(await db.query("with tokens as (select id,lower(regexp_replace(trim(label),'\\s+',' ','g')) token from reference_item where dataset_version_id=$1 union all select id,lower(trim(code)) token from reference_item where dataset_version_id=$1 union all select ri.id,lower(regexp_replace(trim(alias.value),'\\s+',' ','g')) token from reference_item ri cross join lateral jsonb_array_elements_text(ri.aliases) alias(value) where ri.dataset_version_id=$1) select token from tokens where token<>'' group by token having count(distinct id)>1 limit 1",[version.id])).rows[0];
    if(ambiguousAlias)throw fail(409,"Reference alias or label \""+ambiguousAlias.token+"\" is assigned to more than one item. Resolve the duplicate before publication.","REFERENCE_ALIAS_AMBIGUOUS");
    const invalidParent=(await db.query("select child.code from reference_item child join reference_item parent on parent.id=child.parent_item_id where child.dataset_version_id=$1 and parent.dataset_version_id<>$1 limit 1",[version.id])).rows[0];
    if(invalidParent)throw fail(409,"Reference item "+invalidParent.code+" points to a parent outside this dataset version. Rebuild the parent relationship before publishing.","REFERENCE_PARENT_INVALID");
    const hierarchyCycle=(await db.query("with recursive tree(start_id,node_id,parent_item_id,path,cycle) as (select id,id,parent_item_id,array[id],false from reference_item where dataset_version_id=$1 union all select t.start_id,p.id,p.parent_item_id,t.path||p.id,p.id=any(t.path) from tree t join reference_item p on p.id=t.parent_item_id where not t.cycle) select 1 from tree where cycle limit 1",[version.id])).rows[0];
    if(hierarchyCycle)throw fail(409,"Reference hierarchy contains a parent cycle. Correct it before publication.","REFERENCE_HIERARCHY_CYCLE");
    const previous=(await db.query("select id from reference_dataset_version where dataset_id=$1 and status='published' for update",[dataset.id])).rows[0];
    if(previous) await db.query("update reference_dataset_version set status='archived',effective_to=coalesce(effective_to,current_date) where id=$1",[previous.id]);
    const published=(await db.query("update reference_dataset_version set status='published',published_at=now(),approved_by=$1,effective_from=coalesce(effective_from,current_date),notes=coalesce(notes,'')||$2 where id=$3 returning id,version_label,status,published_at",[identity.sub,reason.trim()?"\nPublication note: "+clean(reason,1000):"",version.id])).rows[0];
    await db.query("insert into reference_publication(dataset_version_id,action,performed_by,reason) values($1,'publish',$2,$3)",[version.id,identity.sub,clean(reason,1000)||null]);
    await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,outcome,metadata) values($1,'reference.dataset_published','reference_dataset',$2,'success',$3)",[identity.sub,dataset.id,{versionId:version.id,versionLabel:version.version_label,previousVersionId:previous?.id||null}]);
    return {datasetKey:key,version:published,previousVersionId:previous?.id||null,activeItemCount:Number(summary.active)};
  });
}


function jsonReferenceRows(source){
 let parsed;
 try{parsed=JSON.parse(String(source||""));}catch{throw fail(400,"JSON import must be valid JSON.","JSON_INVALID");}
 const rows=Array.isArray(parsed)?parsed:parsed&&Array.isArray(parsed.items)?parsed.items:null;
 if(!rows||!rows.length||rows.some(row=>!row||typeof row!=="object"||Array.isArray(row)))throw fail(400,"JSON import must be a non-empty array of reference item objects or an object with an items array.","JSON_SHAPE_INVALID");
 const allowed=["code","label","description","sort_order","active","parent_code","aliases","short_label","metadata","effective_from","effective_to"];
 return rows.map((row,index)=>{const item={};for(const key of allowed){const camel=key.replace(/_([a-z])/g,(_,letter)=>letter.toUpperCase());if(row[key]!==undefined)item[key]=key==="metadata"&&typeof row[key]==="object"?JSON.stringify(row[key]):Array.isArray(row[key])?row[key].join(";"):row[key];else if(row[camel]!==undefined)item[key]=key==="metadata"&&typeof row[camel]==="object"?JSON.stringify(row[camel]):Array.isArray(row[camel])?row[camel].join(";"):row[camel];}item.__row=index+2;return item;});
}
function referenceRowsToCsv(rows){
 const headers=["code","label","description","sort_order","active","parent_code","aliases","short_label","metadata","effective_from","effective_to"];
 return [headers.join(","),...rows.map(row=>headers.map(key=>csvEscape(row[key]??"")).join(","))].join("\r\n");
}
export async function previewReferenceJson(identity,key,filename,jsonText,providedMapping={}){
 assertReferenceAdmin(identity);
 const rows=jsonReferenceRows(jsonText).map(({__row,...row})=>row);
 return previewReferenceCsv(identity,key,filename,referenceRowsToCsv(rows),providedMapping);
}
export async function importReferenceJson(identity,key,filename,jsonText,providedMapping={}){
 assertReferenceAdmin(identity);
 const rows=jsonReferenceRows(jsonText).map(({__row,...row})=>row);
 return importReferenceCsv(identity,key,filename,referenceRowsToCsv(rows),providedMapping,"json");
}
export async function exportReferenceJson(identity,key){
 assertReferenceAdmin(identity);const db=getPool();const {dataset,version}=await datasetContext(db,key);
 const rows=(await db.query("select id,code,label,description,sort_order,active,parent_item_id,aliases,metadata,effective_from,effective_to from reference_item where dataset_version_id=$1 order by sort_order,label",[version.id])).rows;
 const byId=new Map(rows.map(row=>[row.id,row.code]));
 return {filename:key+".json",json:JSON.stringify({datasetKey:key,version:version.version_label,items:rows.map(({parent_item_id,...row})=>({...row,parent_code:byId.get(parent_item_id)||null}))},null,2)};
}


const REFERENCE_IMPORT_COLUMNS=["code","label","description","sort_order","active","parent_code","aliases","short_label","metadata","effective_from","effective_to"];
function normalizeXlsxImport(input,mapping={}){
 const parsed=parseXlsxRows(Buffer.from(String(input||""),"base64"));
 const selected={};
 for(const target of REFERENCE_IMPORT_COLUMNS){
  if(mapping[target]&&parsed.headers.includes(String(mapping[target])))selected[target]=String(mapping[target]);
  else selected[target]=parsed.headers.find(header=>header.trim().toLowerCase()===target)||parsed.headers.find(header=>header.trim().toLowerCase()===target.replace(/_([a-z])/g,(_,letter)=>letter.toUpperCase()))||"";
 }
 const rows=parsed.rows.map(row=>Object.fromEntries(REFERENCE_IMPORT_COLUMNS.map(target=>[target,selected[target]?row[selected[target]]??"": ""])));
 return {headers:parsed.headers,mapping:selected,rows};
}
export async function previewReferenceXlsx(identity,key,filename,xlsxBase64,mapping={}){
 assertReferenceAdmin(identity);
 const parsed=normalizeXlsxImport(xlsxBase64,mapping);
 const result=await previewReferenceJson(identity,key,filename,JSON.stringify(parsed.rows),{});
 return {...result,headers:parsed.headers,mapping:parsed.mapping,filename:clean(filename,180)};
}
export async function importReferenceXlsx(identity,key,filename,xlsxBase64,mapping={}){
 assertReferenceAdmin(identity);
 const parsed=normalizeXlsxImport(xlsxBase64,mapping);
 const rows=parsed.rows.map(row=>({...row,aliases:Array.isArray(row.aliases)?row.aliases.join(";"):row.aliases,metadata:row.metadata&&typeof row.metadata==="object"?JSON.stringify(row.metadata):row.metadata}));
 return importReferenceCsv(identity,key,filename,referenceRowsToCsv(rows),{},"xlsx");
}
export async function exportReferenceXlsx(identity,key){
 assertReferenceAdmin(identity);const db=getPool();const {version}=await datasetContext(db,key);
 const rows=(await db.query("select child.code,child.label,coalesce(child.description,'') description,child.sort_order,child.active,parent.code parent_code,child.aliases,child.short_label,child.metadata,child.effective_from,child.effective_to from reference_item child left join reference_item parent on parent.id=child.parent_item_id and parent.dataset_version_id=child.dataset_version_id where child.dataset_version_id=$1 order by child.sort_order,child.label",[version.id])).rows;
 const headers=["code","label","description","sort_order","active","parent_code","aliases","metadata","effective_from","effective_to"];
 const workbookRows=rows.map(row=>({...row,aliases:Array.isArray(row.aliases)?row.aliases.join(";"):row.aliases,metadata:row.metadata&&typeof row.metadata==="object"?JSON.stringify(row.metadata):row.metadata}));
 return {filename:key+".xlsx",xlsxBase64:createXlsx(workbookRows,headers).toString("base64")};
}

export async function exportReferenceCsv(identity,key){
 assertReferenceAdmin(identity);const db=getPool();const {version}=await datasetContext(db,key);
 const rows=(await db.query("select child.code,child.label,coalesce(child.description,'') description,child.sort_order,child.active,parent.code parent_code,child.aliases,child.short_label,child.metadata,child.effective_from,child.effective_to from reference_item child left join reference_item parent on parent.id=child.parent_item_id and parent.dataset_version_id=child.dataset_version_id where child.dataset_version_id=$1 order by child.sort_order,child.label",[version.id])).rows;
 const headers=["code","label","description","sort_order","active","parent_code","aliases","short_label","metadata","effective_from","effective_to"];
 return {filename:key+".csv",csv:[headers.join(","),...rows.map(row=>headers.map(header=>{const value=row[header];return csvEscape(Array.isArray(value)?value.join(";"):value&&typeof value==="object"?JSON.stringify(value):value??"");}).join(","))].join("\r\n")};
}

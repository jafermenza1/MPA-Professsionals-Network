"use client";
import { FormFeedback } from "../../components/form-feedback";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Card, Badge } from "../../components/ui";
import { api, ApiError } from "../../lib/api";
import { useUiStore } from "../../lib/store";

type RefItem={id:string;dataset_key:string;name:string;domain:string;code:string;label:string;aliases?:string[]|null;description?:string|null;sort_order:number};
type ProfileRef={relation_type:string;reference_item_id:string;custom_value:string|null;code:string;label:string;aliases?:string[]|null};
type Profile={references?:ProfileRef[];languages?:string[];skills?:string[]};
type AccountProfile={first_name?:string;middle_name?:string|null;last_name?:string;display_name?:string;phone?:string|null;date_of_birth?:string|null;sex?:string|null;nationality?:string|null;headline?:string|null;bio?:string|null;visibility?:string|null};
type Education={id?:string;education_level_item_id:string;education_level_custom?:string|null;institution_item_id:string|null;institution_name_custom?:string|null;field_of_study_item_id:string|null;field_of_study_custom?:string|null;qualification_item_id:string|null;qualification_custom?:string|null;graduation_year:number|string|null;start_year?:number|string|null;completion_year?:number|string|null;currently_studying?:boolean;explanation?:string|null;visibility?:string;education_level_label?:string;institution_label?:string;field_of_study_label?:string;qualification_label?:string};
type EducationDraft={educationLevelItemId:string;educationLevelCustom:string;institutionItemId:string;institutionCustom:string;fieldOfStudyItemId:string;fieldOfStudyCustom:string;qualificationItemId:string;qualificationCustom:string;graduationYear:string;startYear:string;completionYear:string;currentlyStudying:boolean;explanation:string;visibility:string};
type Portfolio={id:string;title:string;item_type:string;description:string|null;external_url:string|null;evidence_file_id:string|null;evidence_label:string|null;visibility:string;started_on?:string|null;completed_on?:string|null;review_status?:string;created_at?:string;updated_at?:string;references?:{relationType:string;referenceItemId:string;code:string;label:string;aliases?:string[]|null}[];evidence_original_name?:string|null};
type PortfolioDraft={title:string;itemType:string;description:string;externalUrl:string;visibility:string;evidenceFileId:string;evidenceLabel:string;startedOn:string;completedOn:string};
type UploadAuthorization={uploadId:string;uploadToken:string;uploadUrl:string;maxBytes:number};
const blankEducation=():EducationDraft=>({educationLevelItemId:"",educationLevelCustom:"",institutionItemId:"",institutionCustom:"",fieldOfStudyItemId:"",fieldOfStudyCustom:"",qualificationItemId:"",qualificationCustom:"",graduationYear:"",startYear:"",completionYear:"",currentlyStudying:false,explanation:"",visibility:"private"});
const blankPortfolio=():PortfolioDraft=>({title:"",itemType:"project",description:"",externalUrl:"",visibility:"private",evidenceFileId:"",evidenceLabel:"",startedOn:"",completedOn:""});
const groups={nationality:"professional_nationalities",occupation:"professional_occupations",industry:"professional_industries",experience_range:"professional_experience_ranges",language:"professional_languages",skill:"professional_skills",qualification_type:"professional_qualifications",education_level:"professional_education_levels",institution:"professional_institutions",field_of_study:"professional_fields_of_study"} as const;
function selected(refs:ProfileRef[]|undefined,type:string){return refs?.find(r=>r.relation_type===type);}
function asDraft(e:Education):EducationDraft{return {educationLevelItemId:e.education_level_item_id||"",educationLevelCustom:e.education_level_custom||"",institutionItemId:e.institution_item_id||"",institutionCustom:e.institution_name_custom||"",fieldOfStudyItemId:e.field_of_study_item_id||"",fieldOfStudyCustom:e.field_of_study_custom||"",qualificationItemId:e.qualification_item_id||"",qualificationCustom:e.qualification_custom||"",graduationYear:e.graduation_year==null?"":String(e.graduation_year),startYear:e.start_year==null?"":String(e.start_year),completionYear:e.completion_year==null?"":String(e.completion_year),currentlyStudying:Boolean(e.currently_studying),explanation:e.explanation||"",visibility:e.visibility||"private"};}
export default function GuidedProfessionalProfile({onNationalitySaved}:{onNationalitySaved:(value:string)=>void}){
 const token=useUiStore(s=>s.token);
 const [refs,setRefs]=useState<RefItem[]>([]),[profile,setProfile]=useState<Profile>({}),[education,setEducation]=useState<EducationDraft[]>([]),[portfolio,setPortfolio]=useState<Portfolio[]>([]),[account,setAccount]=useState<AccountProfile>({});
 const [selectedRefs,setSelectedRefs]=useState<Record<string,string>>({}),[customRefs,setCustomRefs]=useState<Record<string,string>>({}),[languageIds,setLanguageIds]=useState<string[]>([]),[otherLanguage,setOtherLanguage]=useState(""),[skillIds,setSkillIds]=useState<string[]>([]),[otherSkills,setOtherSkills]=useState(""),[referenceSearch,setReferenceSearch]=useState<Record<string,string>>({}),[languageSearch,setLanguageSearch]=useState(""),[educationSearch,setEducationSearch]=useState<Record<string,string>>({});
 const [educationDrafts,setEducationDrafts]=useState<EducationDraft[]>([]),[portfolioDraft,setPortfolioDraft]=useState<PortfolioDraft>(blankPortfolio()),[portfolioSkillIds,setPortfolioSkillIds]=useState<string[]>([]),[portfolioOccupationIds,setPortfolioOccupationIds]=useState<string[]>([]),[portfolioSearch,setPortfolioSearch]=useState<Record<string,string>>({});
 const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[uploading,setUploading]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const options=(group:string)=>refs.filter(r=>r.dataset_key===group);
 const searchOptions=(group:string,query:string)=>{const needle=query.trim().toLocaleLowerCase();return options(group).filter(item=>!needle||[item.label,item.code,...(Array.isArray(item.aliases)?item.aliases:[])].some(value=>String(value||"").toLocaleLowerCase().includes(needle)));};
 const byId=useMemo(()=>new Map(refs.map(r=>[r.id,r])),[refs]);
 const refresh=useCallback(async()=>{
  if(!token)return;setLoading(true);setError("");
  try{
   const [r,p,e,items,accountInfo]=await Promise.all([
    api<RefItem[]>("/api/v1/professional-reference-data",{},token),
    api<Profile>("/api/v1/me/talent-profile",{},token),
    api<Education[]>("/api/v1/me/education",{},token),
    api<Portfolio[]>("/api/v1/me/portfolio",{},token),
    api<AccountProfile>("/api/v1/me",{},token)
   ]);
   setRefs(r);setEducationDrafts(e.map(asDraft));setPortfolio(items);setAccount(accountInfo);
   const next:Record<string,string>={},custom:Record<string,string>={};
   for(const type of ["nationality","occupation","industry","experience_range"]){const item=selected(p.references,type);next[type]=item?.reference_item_id||"";custom[type]=item?.custom_value||"";}
   if(!next.nationality&&accountInfo.nationality){const match=r.find(item=>item.dataset_key===groups.nationality&&item.label.toLowerCase()===String(accountInfo.nationality).toLowerCase());if(match)next.nationality=match.id;else{const other=r.find(item=>item.dataset_key===groups.nationality&&item.code==="OTHER");if(other){next.nationality=other.id;custom.nationality=accountInfo.nationality;}}}
   setSelectedRefs(next);setCustomRefs(custom);
   const langLabels=Array.isArray(p.languages)?p.languages:[];
   const selectedLanguageIds=r.filter(x=>x.dataset_key===groups.language&&langLabels.some(label=>label.toLocaleLowerCase()===x.label.toLocaleLowerCase()||(x.aliases||[]).some(alias=>String(alias).toLocaleLowerCase()===label.toLocaleLowerCase()))&&x.code!=="OTHER").map(x=>x.id);
   const other=langLabels.filter(x=>!r.some(ref=>ref.dataset_key===groups.language&&(ref.label.toLocaleLowerCase()===x.toLocaleLowerCase()||(ref.aliases||[]).some(alias=>String(alias).toLocaleLowerCase()===x.toLocaleLowerCase()))));setOtherLanguage(other.join(", "));
   const otherLanguageOption=r.find(x=>x.dataset_key===groups.language&&x.code==="OTHER");
   setLanguageIds(other.length&&otherLanguageOption?[...selectedLanguageIds,otherLanguageOption.id]:selectedLanguageIds);
   const skillLabels=Array.isArray(p.skills)?p.skills:[];
   const selectedSkillIds=r.filter(x=>x.dataset_key===groups.skill&&skillLabels.some(label=>label.toLocaleLowerCase()===x.label.toLocaleLowerCase()||(x.aliases||[]).some(alias=>String(alias).toLocaleLowerCase()===label.toLocaleLowerCase()))&&x.code!=="OTHER").map(x=>x.id);
   const customSkillValues=skillLabels.filter(x=>!r.some(ref=>ref.dataset_key===groups.skill&&(ref.label.toLocaleLowerCase()===x.toLocaleLowerCase()||(ref.aliases||[]).some(alias=>String(alias).toLocaleLowerCase()===x.toLocaleLowerCase()))));
   const otherSkillOption=r.find(x=>x.dataset_key===groups.skill&&x.code==="OTHER");
   setSkillIds(customSkillValues.length&&otherSkillOption?[...selectedSkillIds,otherSkillOption.id]:selectedSkillIds);setOtherSkills(customSkillValues.join(", "));
  }catch(e){setError(e instanceof ApiError?e.message:"Guided profile data could not be loaded. Retry without losing your entries.");}
  finally{setLoading(false);}
 },[token]);
 useEffect(()=>{void refresh();},[refresh]);
 function setRef(type:string,id:string){setSelectedRefs(s=>({...s,[type]:id}));if(byId.get(id)?.code!=="OTHER")setCustomRefs(s=>({...s,[type]:""}));}
 async function saveReferences(event:FormEvent){
  event.preventDefault();if(!token)return;setSaving(true);setError("");setNotice("");
  try{
   const references=Object.entries(selectedRefs).filter(([,id])=>id).map(([relationType,referenceItemId])=>({relationType,referenceItemId,customValue:customRefs[relationType]||""}));
   for(const [type,id] of Object.entries(selectedRefs)){if(id&&byId.get(id)?.code==="OTHER"&&!customRefs[type]?.trim())throw new Error("Please enter the custom value for every field set to Other.");}
   const languageOther=options(groups.language).find(item=>item.code==="OTHER");
   const otherLanguageValues=otherLanguage.split(",").map(v=>v.trim()).filter(Boolean);
   const standardLanguageIds=languageIds.filter(id=>byId.get(id)?.code!=="OTHER");
   references.push(...standardLanguageIds.map(referenceItemId=>({relationType:"language",referenceItemId,customValue:""})));
   const skillOther=options(groups.skill).find(item=>item.code==="OTHER");const standardSkillIds=skillIds.filter(id=>byId.get(id)?.code!=="OTHER");references.push(...standardSkillIds.map(referenceItemId=>({relationType:"skill",referenceItemId,customValue:""})));const otherSkillValues=otherSkills.split(",").map(v=>v.trim()).filter(Boolean);if(skillIds.includes(skillOther?.id||"")&&otherSkillValues.length&&skillOther)references.push({relationType:"skill",referenceItemId:skillOther.id,customValue:otherSkillValues.join(", ")});if(skillIds.includes(skillOther?.id||"")&&!otherSkillValues.length)throw new Error("You selected Other under Skills. Enter at least one custom skill.");
   if(languageIds.includes(languageOther?.id||"")&&otherLanguageValues.length&&languageOther)references.push({relationType:"language",referenceItemId:languageOther.id,customValue:otherLanguageValues.join(", ")});
   if(languageIds.includes(languageOther?.id||"")&&!otherLanguageValues.length)throw new Error("You selected Other under Languages. Enter at least one custom language.");
   const selectedLanguageLabels=standardLanguageIds.map(id=>byId.get(id)?.label).filter((label):label is string=>Boolean(label));
   const languages=[...selectedLanguageLabels,...otherLanguageValues];
   const saved=await api<Profile>("/api/v1/me/talent-profile",{method:"PATCH",body:JSON.stringify({references,languages})},token);
   setProfile(saved);
   const nationalityId=selectedRefs.nationality;
   if(nationalityId){const item=byId.get(nationalityId);const value=item?.code==="OTHER"?customRefs.nationality:item?.label;if(value){await api("/api/v1/me/profile",{method:"PATCH",body:JSON.stringify({firstName:account.first_name,middleName:account.middle_name,lastName:account.last_name,displayName:account.display_name,phone:account.phone,dateOfBirth:account.date_of_birth,sex:account.sex,nationality:value})},token);onNationalitySaved(value);}}
   setNotice("Reference choices saved. Your selected classifications are linked to the current published reference data.");
  }catch(e){setError(e instanceof ApiError?e.message:e instanceof Error?e.message:"Reference choices could not be saved.");}
  finally{setSaving(false);}
 }
 async function saveEducation(event:FormEvent){
  event.preventDefault();if(!token)return;setSaving(true);setError("");setNotice("");
  try{
   for(const e of educationDrafts){
    if(!e.educationLevelItemId||!e.institutionItemId||!e.fieldOfStudyItemId)throw new Error("Choose an education level, institution and field of study for every record.");
    if(byId.get(e.educationLevelItemId)?.code==="OTHER"&&!e.educationLevelCustom.trim())throw new Error("Enter the education level after selecting Other.");
    if(byId.get(e.institutionItemId)?.code==="OTHER"&&!e.institutionCustom.trim())throw new Error("Enter the institution name after selecting Other.");
    if(byId.get(e.fieldOfStudyItemId)?.code==="OTHER"&&!e.fieldOfStudyCustom.trim())throw new Error("Enter the field of study after selecting Other.");
    if(e.qualificationItemId&&byId.get(e.qualificationItemId)?.code==="OTHER"&&!e.qualificationCustom.trim())throw new Error("Enter the qualification after selecting Other.");
   }
   const saved=await api<Education[]>("/api/v1/me/education",{method:"PUT",body:JSON.stringify({education:educationDrafts.map(e=>({educationLevelItemId:e.educationLevelItemId,educationLevelCustom:e.educationLevelCustom,institutionItemId:e.institutionItemId,institutionCustom:e.institutionCustom,fieldOfStudyItemId:e.fieldOfStudyItemId,fieldOfStudyCustom:e.fieldOfStudyCustom,qualificationItemId:e.qualificationItemId||null,qualificationCustom:e.qualificationCustom,graduationYear:e.completionYear||e.graduationYear||null,startYear:e.startYear||null,completionYear:e.completionYear||null,currentlyStudying:e.currentlyStudying,explanation:e.explanation,visibility:e.visibility}))})},token);
   setEducation(saved.map(asDraft));setEducationDrafts(saved.map(asDraft));setNotice("Education records saved successfully.");
  }catch(e){setError(e instanceof ApiError?e.message:e instanceof Error?e.message:"Education records could not be saved. Your previous saved records remain unchanged.");}
  finally{setSaving(false);}
 }
 async function attachEvidence(file:File){
  if(!token)return;
  const allowed=["application/pdf","image/jpeg","image/png","text/plain"];
  const mime=file.type||"application/octet-stream";
  if(!allowed.includes(mime)){setError("Choose a PDF, JPG, PNG or plain-text file.");return;}
  if(file.size>10*1024*1024){setError("Evidence files must be 10 MB or smaller.");return;}
  setUploading(true);setError("");setNotice("");
  try{
   const auth=await api<UploadAuthorization>("/api/v1/files/uploads",{method:"POST",body:JSON.stringify({fileName:file.name,contentType:mime,byteSize:file.size})},token);
   const response=await fetch(auth.uploadUrl,{method:"PUT",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/octet-stream","X-Upload-Token":auth.uploadToken},body:await file.arrayBuffer(),cache:"no-store"});
   if(!response.ok)throw new Error("The file transfer was not accepted. Request a fresh upload and try again.");
   const confirmed=await api<{id:string;original_name:string}>("/api/v1/files/uploads/"+auth.uploadId+"/confirm",{method:"POST"},token);
   setPortfolioDraft(d=>({...d,evidenceFileId:confirmed.id,evidenceLabel:d.evidenceLabel||file.name}));
   setNotice("Evidence uploaded and confirmed privately. It is not public; save the portfolio item to attach it.");
  }catch(e){setError(e instanceof ApiError?e.message:e instanceof Error?e.message:"Evidence upload failed. Your portfolio item has not been saved.");}
  finally{setUploading(false);}
 }

 async function savePortfolio(event:FormEvent){
  event.preventDefault();if(!token)return;setSaving(true);setError("");setNotice("");
  try{
   await api("/api/v1/me/portfolio",{method:"POST",body:JSON.stringify({title:portfolioDraft.title,itemType:portfolioDraft.itemType,description:portfolioDraft.description,externalUrl:portfolioDraft.externalUrl||null,visibility:portfolioDraft.visibility,evidenceFileId:portfolioDraft.evidenceFileId||null,evidenceLabel:portfolioDraft.evidenceLabel||null,startedOn:portfolioDraft.startedOn||null,completedOn:portfolioDraft.completedOn||null,skillReferenceIds:portfolioSkillIds,occupationReferenceIds:portfolioOccupationIds})},token);
   setPortfolioDraft(blankPortfolio());setPortfolioSkillIds([]);setPortfolioOccupationIds([]);const items=await api<Portfolio[]>("/api/v1/me/portfolio",{},token);setPortfolio(items);setNotice("Portfolio item saved. Any attached evidence remains private and is available only to you and authorized review workflows.");
  }catch(e){setError(e instanceof ApiError?e.message:e instanceof Error?e.message:"Portfolio item could not be saved.");}
  finally{setSaving(false);}
 }
 async function downloadEvidence(item:Portfolio){
  if(!token||!item.evidence_file_id)return;setError("");setNotice("");
  try{const response=await fetch("/api/v1/files/"+encodeURIComponent(item.evidence_file_id),{headers:{Authorization:"Bearer "+token},cache:"no-store"});if(!response.ok)throw new Error("Private evidence could not be downloaded. Your session may have expired or access may have changed.");const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=item.evidence_original_name||item.evidence_label||"private-evidence";a.click();URL.revokeObjectURL(url);setNotice("Private evidence download started.");}
  catch(e){setError(e instanceof ApiError?e.message:e instanceof Error?e.message:"Private evidence download failed.");}
 }
 async function removePortfolio(id:string){
  if(!token||!confirm("Remove this portfolio item from your profile? The private evidence file remains stored but will no longer be linked to this item."))return;
  setError("");setNotice("");
  try{await api("/api/v1/me/portfolio/"+id,{method:"DELETE"},token);setPortfolio(rows=>rows.filter(row=>row.id!==id));setNotice("Portfolio item removed.");}
  catch(e){setError(e instanceof ApiError?e.message:"Portfolio item could not be removed.");}
 }
 function renderReferenceField(type:string,label:string,group:string){
  const value=selectedRefs[type]||"",other=byId.get(value)?.code==="OTHER";
  return <div className="grid" style={{gap:6}} key={type}>
   <label htmlFor={"p1-search-"+type}>{label}</label>
   <input id={"p1-search-"+type} value={referenceSearch[type]||""} onChange={e=>setReferenceSearch(v=>({...v,[type]:e.target.value}))} placeholder={"Search "+label.toLowerCase()+" or alias"}/>
   <select id={"p1-ref-"+type} value={value} onChange={e=>setRef(type,e.target.value)}>
    <option value="">Choose {label.toLowerCase()}</option>{(value&&!searchOptions(group,referenceSearch[type]||"").some(item=>item.id===value)?[byId.get(value)!,...searchOptions(group,referenceSearch[type]||"")]:searchOptions(group,referenceSearch[type]||"")).filter(Boolean).map(item=><option key={item.id} value={item.id}>{item.label}{item.aliases?.length?" · "+item.aliases.slice(0,2).join(", "):""}</option>)}
   </select>
   {other?<label>Enter your {label.toLowerCase()}<input required value={customRefs[type]||""} onChange={e=>setCustomRefs(v=>({...v,[type]:e.target.value}))} maxLength={180} placeholder={"Type your "+label.toLowerCase()}/></label>:null}
  </div>;
 }
 function renderEducationSelect(draft:EducationDraft,index:number,key:keyof EducationDraft,label:string,group:string,customKey:keyof EducationDraft,customLabel:string){
  const value=String(draft[key]||""),other=byId.get(value)?.code==="OTHER",searchKey=String(index)+":"+String(key),query=educationSearch[searchKey]||"";
  const matches=searchOptions(group,query);const visible=value&&!matches.some(item=>item.id===value)?[byId.get(value)!,...matches]:matches;
  return <div className="grid" style={{gap:6}}>
   <label>{label}<input value={query} onChange={e=>setEducationSearch(v=>({...v,[searchKey]:e.target.value}))} placeholder={"Search "+label.toLowerCase()+" or alias"}/><select required={key!=="qualificationItemId"} value={value} onChange={e=>setEducationDrafts(rows=>rows.map((row,i)=>i===index?{...row,[key]:e.target.value,...(byId.get(e.target.value)?.code==="OTHER"?{}:{[customKey]:""})}:row))}>
    <option value="">Choose {label.toLowerCase()}</option>{visible.filter(Boolean).map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
   </select></label>
   {other?<label>{customLabel}<input required value={String(draft[customKey]||"")} onChange={e=>setEducationDrafts(rows=>rows.map((row,i)=>i===index?{...row,[customKey]:e.target.value}:row))} maxLength={240}/></label>:null}
  </div>;
 }
 return <div className="grid" style={{gap:18}}>
  <Card>
   <div className="eyebrow">Guided professional profile</div><h2 className="h2">Professional classifications</h2>
   <p className="muted">Choose from administrator-managed lists. If you choose Other, a custom-value field appears. Your selections are saved as governed reference links where supported.</p>
   {loading?<p role="status">Loading reference choices…</p>:null}
   <form onSubmit={saveReferences} className="grid" style={{gap:12}}>
    <div className="grid grid-2" style={{gap:12}}>
     {renderReferenceField("nationality","Nationality",groups.nationality)}
     {renderReferenceField("occupation","Occupation",groups.occupation)}
     {renderReferenceField("industry","Industry",groups.industry)}
     {renderReferenceField("experience_range","Years of experience",groups.experience_range)}
    </div>
    <div className="grid" style={{gap:8}}><label htmlFor="p1-language-search">Languages</label>
     <input id="p1-language-search" value={languageSearch} onChange={e=>setLanguageSearch(e.target.value)} placeholder="Search languages or known aliases"/>
     <div className="grid grid-2" style={{gap:6}}>{searchOptions(groups.language,languageSearch).slice(0,80).map(item=><label key={item.id} className="row" style={{alignItems:"center",gap:8,padding:"6px 8px",border:"1px solid var(--border)",borderRadius:8}}><input type="checkbox" checked={languageIds.includes(item.id)} onChange={e=>setLanguageIds(ids=>e.target.checked?[...new Set([...ids,item.id])]:ids.filter(id=>id!==item.id))}/><span>{item.label}</span></label>)}</div>
     <p className="muted">Selected languages</p><div className="row" style={{gap:6,flexWrap:"wrap"}}>{languageIds.map(id=>{const item=byId.get(id);return item?<span key={id} className="row" style={{gap:6,alignItems:"center",border:"1px solid var(--border)",borderRadius:999,padding:"4px 10px"}}>{item.label}<button type="button" className="btn btn-ghost" onClick={()=>setLanguageIds(ids=>ids.filter(value=>value!==id))} aria-label={"Remove "+item.label}>×</button></span>:null;})}</div>
     {languageIds.some(id=>byId.get(id)?.code==="OTHER")?<label>Other language(s), separated by commas<input required value={otherLanguage} onChange={e=>setOtherLanguage(e.target.value)} maxLength={500} placeholder="For example, Somali, Tigrinya"/></label>:null}
    </div>
    <div className="grid" style={{gap:8}}><label htmlFor="p1-skill-search">Professional skills</label>
     <input id="p1-skill-search" value={referenceSearch.skill||""} onChange={e=>setReferenceSearch(v=>({...v,skill:e.target.value}))} placeholder="Search skills or aliases"/>
     <div className="grid grid-2" style={{gap:6}}>{searchOptions(groups.skill,referenceSearch.skill||"").slice(0,100).map(item=><label key={item.id} className="row" style={{alignItems:"center",gap:8,padding:"6px 8px",border:"1px solid var(--border)",borderRadius:8}}><input type="checkbox" checked={skillIds.includes(item.id)} onChange={e=>setSkillIds(ids=>e.target.checked?[...new Set([...ids,item.id])]:ids.filter(id=>id!==item.id))}/><span>{item.label}</span></label>)}</div>
     <p className="muted">Selected skills</p><div className="row" style={{gap:6,flexWrap:"wrap"}}>{skillIds.map(id=>{const item=byId.get(id);return item?<span key={id} className="row" style={{gap:6,alignItems:"center",border:"1px solid var(--border)",borderRadius:999,padding:"4px 10px"}}>{item.label}<button type="button" className="btn btn-ghost" onClick={()=>setSkillIds(ids=>ids.filter(value=>value!==id))} aria-label={"Remove "+item.label}>×</button></span>:null;})}</div>
     {skillIds.some(id=>byId.get(id)?.code==="OTHER")?<label>Other skill(s), separated by commas<input required value={otherSkills} onChange={e=>setOtherSkills(e.target.value)} maxLength={1000} placeholder="For example, a specialist skill not listed"/></label>:null}
    </div>
    <button className="btn btn-primary" disabled={saving||loading}>{saving?"Saving…":"Save classifications, skills and languages"}</button>
   </form>
  </Card>
  <Card>
   <div className="eyebrow">Education history</div><h2 className="h2">Add structured education records</h2>
   <p className="muted">Create one record per qualification or period of study. Each record captures the institution, field, qualification, study period and visibility separately. Choose Other to enter a value missing from the list. Your private records remain visible to you and authorized reviewers.</p>
   <form onSubmit={saveEducation} className="grid" style={{gap:14}}>
    {educationDrafts.length===0?<p className="muted">No education records yet. Select “Add education record” to begin.</p>:educationDrafts.map((draft,index)=><div key={index} className="grid" style={{gap:10,padding:14,border:"1px solid var(--border)",borderRadius:12}}>
     <div className="row" style={{justifyContent:"space-between",alignItems:"center"}}><h3 className="h2">Education record {index+1}</h3><button type="button" className="btn btn-ghost" onClick={()=>setEducationDrafts(rows=>rows.filter((_,i)=>i!==index))}>Remove</button></div>
     <div className="grid grid-2" style={{gap:12}}>
      {renderEducationSelect(draft,index,"educationLevelItemId","Education level",groups.education_level,"educationLevelCustom","Custom education level")}
      {renderEducationSelect(draft,index,"institutionItemId","School / institution",groups.institution,"institutionCustom","Institution name")}
      {renderEducationSelect(draft,index,"fieldOfStudyItemId","Field of study",groups.field_of_study,"fieldOfStudyCustom","Field of study")}
      {renderEducationSelect(draft,index,"qualificationItemId","Qualification type",groups.qualification_type,"qualificationCustom","Qualification")}
      <label>Start year <span className="muted">(optional)</span><input type="number" min="1900" max={new Date().getFullYear()+10} value={draft.startYear} onChange={e=>setEducationDrafts(rows=>rows.map((row,i)=>i===index?{...row,startYear:e.target.value}:row))} placeholder="e.g. 2019"/></label>
      <label>Completion year <span className="muted">(optional)</span><input type="number" min="1900" max={new Date().getFullYear()+10} value={draft.currentlyStudying?"":draft.completionYear||draft.graduationYear} disabled={draft.currentlyStudying} onChange={e=>setEducationDrafts(rows=>rows.map((row,i)=>i===index?{...row,completionYear:e.target.value,graduationYear:e.target.value}:row))} placeholder="e.g. 2022"/></label>
      <label className="row" style={{alignItems:"center",gap:8}}><input type="checkbox" checked={draft.currentlyStudying} onChange={e=>setEducationDrafts(rows=>rows.map((row,i)=>i===index?{...row,currentlyStudying:e.target.checked,completionYear:e.target.checked?"":row.completionYear,graduationYear:e.target.checked?"":row.graduationYear}:row))}/> I am currently studying here</label>
      <label>Visibility<select value={draft.visibility} onChange={e=>setEducationDrafts(rows=>rows.map((row,i)=>i===index?{...row,visibility:e.target.value}:row))}><option value="private">Private — only me and authorized reviewers</option><option value="members">Members</option><option value="public">Public</option></select></label>
      <label>Additional explanation <span className="muted">(optional)</span><textarea value={draft.explanation} maxLength={1200} rows={2} onChange={e=>setEducationDrafts(rows=>rows.map((row,i)=>i===index?{...row,explanation:e.target.value}:row))} placeholder="For example, part-time study or an equivalent qualification"/></label>
     </div>
    </div>)}
    <div className="row" style={{gap:10,flexWrap:"wrap"}}><button type="button" className="btn btn-ghost" onClick={()=>setEducationDrafts(rows=>[...rows,blankEducation()])}>Add education record</button><button className="btn btn-primary" disabled={saving}>{saving?"Saving…":"Save education records"}</button></div>
   </form>
  </Card>
  <Card>
   <div className="eyebrow">Traceable portfolio</div><h2 className="h2">Projects, publications and work samples</h2>
   <p className="muted">Add multiple portfolio items. Each item should have a clear title, context and optionally a link or private evidence. Private evidence is not published in your directory profile.</p>
   {portfolio.length?<div className="grid" style={{gap:10,marginBottom:16}}>{portfolio.map(item=><div key={item.id} className="grid" style={{gap:6,padding:12,border:"1px solid var(--border)",borderRadius:12}}>
    <div className="row" style={{justifyContent:"space-between",alignItems:"center",flexWrap:"wrap"}}><strong>{item.title}</strong><Badge>{item.visibility}</Badge></div>
    <p className="muted">{item.item_type.replaceAll("_"," ")}{item.description?" · "+item.description:""}{item.started_on?" · Started "+String(item.started_on).slice(0,10):""}{item.completed_on?" · Completed "+String(item.completed_on).slice(0,10):""}</p>{item.references?.length?<div className="row" style={{gap:6,flexWrap:"wrap"}}>{item.references.map(ref=><Badge key={ref.relationType+ref.referenceItemId}>{ref.relationType==="skill"?"Skill: ":"Occupation: "}{ref.label}</Badge>)}</div>:null}<p className="muted">Added {item.created_at?new Date(item.created_at).toLocaleDateString():"date unavailable"} · Review status: {item.review_status==="reviewed"?"Reviewed":item.review_status==="under_review"?"Under review":item.review_status==="needs_correction"?"Needs correction":"User supplied — not independently verified"}</p>
    {item.external_url?<a href={item.external_url} target="_blank" rel="noreferrer">Open portfolio link</a>:null}
    {item.evidence_file_id?<div className="row" style={{gap:8,flexWrap:"wrap"}}><p role="status"><Badge>Private evidence attached</Badge> {item.evidence_label||item.evidence_original_name||"Evidence file"}</p><button type="button" className="btn btn-ghost" onClick={()=>void downloadEvidence(item)}>Download private evidence</button></div>:<p className="muted">No evidence attached.</p>}
    <button type="button" className="btn btn-ghost" onClick={()=>void removePortfolio(item.id)}>Remove item</button>
   </div>)}</div>:<p className="muted">No portfolio items yet.</p>}
   <form onSubmit={savePortfolio} className="grid" style={{gap:12}}>
    <h3 className="h2">Add a portfolio item</h3>
    <div className="grid grid-2" style={{gap:12}}>
     <label>Title *<input required minLength={2} maxLength={180} value={portfolioDraft.title} onChange={e=>setPortfolioDraft(d=>({...d,title:e.target.value}))} placeholder="e.g. Community health dashboard"/></label>
     <label>Item type<select value={portfolioDraft.itemType} onChange={e=>setPortfolioDraft(d=>({...d,itemType:e.target.value}))}><option value="project">Project</option><option value="publication">Publication</option><option value="case_study">Case study</option><option value="certificate">Certificate</option><option value="work_sample">Work sample</option><option value="other">Other</option></select></label>
     <label>External link (optional, HTTPS)<input type="url" value={portfolioDraft.externalUrl} onChange={e=>setPortfolioDraft(d=>({...d,externalUrl:e.target.value}))} placeholder="https://…"/></label>
     <label>Start date (optional)<input type="date" value={portfolioDraft.startedOn} onChange={e=>setPortfolioDraft(d=>({...d,startedOn:e.target.value}))}/></label>
     <label>Completion date (optional)<input type="date" min={portfolioDraft.startedOn||undefined} value={portfolioDraft.completedOn} onChange={e=>setPortfolioDraft(d=>({...d,completedOn:e.target.value}))}/></label>
     <label>Visibility<select value={portfolioDraft.visibility} onChange={e=>setPortfolioDraft(d=>({...d,visibility:e.target.value}))}><option value="private">Private — only me</option><option value="members">Members</option><option value="public">Public</option></select></label>
    </div>
    <label>Description<textarea rows={3} maxLength={3000} value={portfolioDraft.description} onChange={e=>setPortfolioDraft(d=>({...d,description:e.target.value}))} placeholder="Your contribution, outcome, dates, and context"/></label>
    <div className="grid grid-2" style={{gap:12}}>
     <div className="grid" style={{gap:6}}><span className="muted">Related skills</span><input value={portfolioSearch.skill||""} onChange={e=>setPortfolioSearch(v=>({...v,skill:e.target.value}))} placeholder="Search skills"/>{searchOptions(groups.skill,portfolioSearch.skill||"").slice(0,40).map(item=><label key={item.id} className="row" style={{gap:8,alignItems:"center"}}><input type="checkbox" checked={portfolioSkillIds.includes(item.id)} onChange={e=>setPortfolioSkillIds(ids=>e.target.checked?[...new Set([...ids,item.id])]:ids.filter(id=>id!==item.id))}/>{item.label}</label>)}</div>
     <div className="grid" style={{gap:6}}><span className="muted">Related occupations</span><input value={portfolioSearch.occupation||""} onChange={e=>setPortfolioSearch(v=>({...v,occupation:e.target.value}))} placeholder="Search occupations"/>{searchOptions(groups.occupation,portfolioSearch.occupation||"").slice(0,40).map(item=><label key={item.id} className="row" style={{gap:8,alignItems:"center"}}><input type="checkbox" checked={portfolioOccupationIds.includes(item.id)} onChange={e=>setPortfolioOccupationIds(ids=>e.target.checked?[...new Set([...ids,item.id])]:ids.filter(id=>id!==item.id))}/>{item.label}</label>)}</div>
    </div>
    <div className="grid" style={{gap:8,padding:12,border:"1px solid var(--border)",borderRadius:12}}>
     <strong>Attach proof (optional)</strong>
     <p className="muted">Step 1: choose a document or use your phone camera. Step 2: wait for “uploaded and confirmed privately”. Step 3: save the portfolio item to attach the file. PDF, JPG, PNG or plain text; maximum 10 MB. Evidence stays private and is not shown on your public profile.</p>
     <label>Evidence label<input value={portfolioDraft.evidenceLabel} onChange={e=>setPortfolioDraft(d=>({...d,evidenceLabel:e.target.value}))} maxLength={180} placeholder="e.g. Certificate scan or project screenshot"/></label>
     <label>Choose file or take photo<input type="file" accept="application/pdf,image/jpeg,image/png,text/plain" capture="environment" disabled={uploading} onChange={e=>{const file=e.target.files?.[0];if(file)void attachEvidence(file);e.currentTarget.value="";}}/></label>
     {uploading?<p role="status">Uploading and checking your evidence… keep this page open.</p>:null}
     {portfolioDraft.evidenceFileId?<p role="status"><Badge>Upload confirmed</Badge> Private evidence is ready to attach: {portfolioDraft.evidenceLabel||"selected file"} <button type="button" className="btn btn-ghost" onClick={()=>setPortfolioDraft(d=>({...d,evidenceFileId:"",evidenceLabel:""}))}>Remove attachment</button></p>:<p className="muted">No evidence uploaded. You can still save the portfolio item.</p>}
    </div>
    <button className="btn btn-primary" disabled={saving||uploading}>{saving?"Saving…":"Save portfolio item"}</button>
   </form>
  </Card>
  {error?<FormFeedback kind="error" message={error} onRetry={()=>void refresh()} retryLabel="Reload saved information"/>:null}
  {notice?<FormFeedback kind="success" message={notice}/>:null}
 </div>;
}

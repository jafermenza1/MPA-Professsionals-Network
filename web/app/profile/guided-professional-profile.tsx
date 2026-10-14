"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Card, Badge } from "../../components/ui";
import { api, ApiError } from "../../lib/api";
import { useUiStore } from "../../lib/store";

type RefItem={id:string;dataset_key:string;name:string;domain:string;code:string;label:string;description?:string|null;sort_order:number};
type ProfileRef={relation_type:string;reference_item_id:string;custom_value:string|null;code:string;label:string};
type Profile={references?:ProfileRef[];languages?:string[]};
type Education={id?:string;education_level_item_id:string;education_level_custom?:string|null;institution_item_id:string|null;institution_name_custom?:string|null;field_of_study_item_id:string|null;field_of_study_custom?:string|null;qualification_item_id:string|null;qualification_custom?:string|null;graduation_year:number|string|null;education_level_label?:string;institution_label?:string;field_of_study_label?:string;qualification_label?:string};
type EducationDraft={educationLevelItemId:string;educationLevelCustom:string;institutionItemId:string;institutionCustom:string;fieldOfStudyItemId:string;fieldOfStudyCustom:string;qualificationItemId:string;qualificationCustom:string;graduationYear:string};
type Portfolio={id:string;title:string;item_type:string;description:string|null;external_url:string|null;evidence_file_id:string|null;evidence_label:string|null;visibility:string;evidence_original_name?:string|null};
type PortfolioDraft={title:string;itemType:string;description:string;externalUrl:string;visibility:string;evidenceFileId:string;evidenceLabel:string};
type UploadAuthorization={uploadId:string;uploadToken:string;uploadUrl:string;maxBytes:number};
const blankEducation=():EducationDraft=>({educationLevelItemId:"",educationLevelCustom:"",institutionItemId:"",institutionCustom:"",fieldOfStudyItemId:"",fieldOfStudyCustom:"",qualificationItemId:"",qualificationCustom:"",graduationYear:""});
const blankPortfolio=():PortfolioDraft=>({title:"",itemType:"project",description:"",externalUrl:"",visibility:"private",evidenceFileId:"",evidenceLabel:""});
const groups={nationality:"professional_nationalities",occupation:"professional_occupations",industry:"professional_industries",experience_range:"professional_experience_ranges",language:"professional_languages",qualification_type:"professional_qualifications",education_level:"professional_education_levels",institution:"professional_institutions",field_of_study:"professional_fields_of_study"} as const;
function selected(refs:ProfileRef[]|undefined,type:string){return refs?.find(r=>r.relation_type===type);}
function asDraft(e:Education):EducationDraft{return {educationLevelItemId:e.education_level_item_id||"",educationLevelCustom:e.education_level_custom||"",institutionItemId:e.institution_item_id||"",institutionCustom:e.institution_name_custom||"",fieldOfStudyItemId:e.field_of_study_item_id||"",fieldOfStudyCustom:e.field_of_study_custom||"",qualificationItemId:e.qualification_item_id||"",qualificationCustom:e.qualification_custom||"",graduationYear:e.graduation_year==null?"":String(e.graduation_year)};}
export default function GuidedProfessionalProfile(){
 const token=useUiStore(s=>s.token);
 const [refs,setRefs]=useState<RefItem[]>([]),[profile,setProfile]=useState<Profile>({}),[education,setEducation]=useState<EducationDraft[]>([]),[portfolio,setPortfolio]=useState<Portfolio[]>([]);
 const [selectedRefs,setSelectedRefs]=useState<Record<string,string>>({}),[customRefs,setCustomRefs]=useState<Record<string,string>>({}),[languageIds,setLanguageIds]=useState<string[]>([]),[otherLanguage,setOtherLanguage]=useState("");
 const [educationDrafts,setEducationDrafts]=useState<EducationDraft[]>([]),[portfolioDraft,setPortfolioDraft]=useState<PortfolioDraft>(blankPortfolio());
 const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[uploading,setUploading]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const options=(group:string)=>refs.filter(r=>r.dataset_key===group);
 const byId=useMemo(()=>new Map(refs.map(r=>[r.id,r])),[refs]);
 const refresh=useCallback(async()=>{
  if(!token)return;setLoading(true);setError("");
  try{
   const [r,p,e,items]=await Promise.all([
    api<RefItem[]>("/api/v1/professional-reference-data",{},token),
    api<Profile>("/api/v1/me/talent-profile",{},token),
    api<Education[]>("/api/v1/me/education",{},token),
    api<Portfolio[]>("/api/v1/me/portfolio",{},token)
   ]);
   setRefs(r);setProfile(p);setEducation(e);setEducationDrafts(e.map(asDraft));setPortfolio(items);
   const next:Record<string,string>={},custom:Record<string,string>={};
   for(const type of ["nationality","occupation","industry","experience_range"]){const item=selected(p.references,type);next[type]=item?.reference_item_id||"";custom[type]=item?.custom_value||"";}
   setSelectedRefs(next);setCustomRefs(custom);
   const langLabels=Array.isArray(p.languages)?p.languages:[];
   setLanguageIds(r.filter(x=>x.dataset_key===groups.language&&langLabels.includes(x.label)&&x.code!=="OTHER").map(x=>x.id));
   const other=langLabels.filter(x=>!r.some(ref=>ref.dataset_key===groups.language&&ref.label===x));setOtherLanguage(other.join(", "));
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
   const languages=[...languageIds.map(id=>byId.get(id)?.label).filter(Boolean) as string[],...otherLanguage.split(",").map(v=>v.trim()).filter(Boolean)];
   const saved=await api<Profile>("/api/v1/me/talent-profile",{method:"PATCH",body:JSON.stringify({references,languages})},token);
   setProfile(saved);
   const nationalityId=selectedRefs.nationality;
   if(nationalityId){const item=byId.get(nationalityId);const value=item?.code==="OTHER"?customRefs.nationality:item?.label;if(value)await api("/api/v1/me/profile",{method:"PATCH",body:JSON.stringify({nationality:value})},token);}
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
   const saved=await api<Education[]>("/api/v1/me/education",{method:"PUT",body:JSON.stringify({education:educationDrafts.map(e=>({educationLevelItemId:e.educationLevelItemId,educationLevelCustom:e.educationLevelCustom,institutionItemId:e.institutionItemId,institutionCustom:e.institutionCustom,fieldOfStudyItemId:e.fieldOfStudyItemId,fieldOfStudyCustom:e.fieldOfStudyCustom,qualificationItemId:e.qualificationItemId||null,qualificationCustom:e.qualificationCustom,graduationYear:e.graduationYear||null}))})},token);
   setEducation(saved);setEducationDrafts(saved.map(asDraft));setNotice("Education records saved successfully.");
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
   await api("/api/v1/files/uploads/"+auth.uploadId+"/confirm",{method:"POST"},token);
   setPortfolioDraft(d=>({...d,evidenceFileId:(awaitEvidenceId as string)}));
   setNotice("Evidence uploaded and confirmed privately. It is not public; save the portfolio item to attach it.");
  }catch(e){setError(e instanceof ApiError?e.message:e instanceof Error?e.message:"Evidence upload failed. Your portfolio item has not been saved.");}
  finally{setUploading(false);}
 }

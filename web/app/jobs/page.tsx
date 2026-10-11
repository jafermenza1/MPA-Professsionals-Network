"use client";

import {FormEvent,useCallback,useEffect,useState} from "react";
import {Bookmark,Building2,Clock3,MapPin,SlidersHorizontal,Users,RefreshCw} from "lucide-react";
import {Card,Badge} from "../../components/ui";
import {api,ApiError} from "../../lib/api";
import {useUiStore} from "../../lib/store";

type Job={
 id:string;title:string;description?:string;organization_id:string;organization_name?:string;
 location_label?:string;posting_scope?:string;employment_type?:string;work_mode?:string;
 seniority_level?:string;department?:string;application_deadline?:string;salary_min?:number|string|null;
 salary_max?:number|string|null;salary_currency?:string|null;
};
type Filters={q:string;location:string;employmentType:string;workMode:string;seniority:string;postingScope:string};
const initialFilters:Filters={q:"",location:"",employmentType:"",workMode:"",seniority:"",postingScope:""};

function queryString(filters:Filters){
 const p=new URLSearchParams();
 for(const [key,value] of Object.entries(filters)) if(value.trim()) p.set(key,value.trim());
 return p.toString();
}
function scopeLabel(scope?:string){return scope==="public"?"Public":scope==="partner_network"?"Member network":scope==="organization_internal"?"Organization only":scope||"Opportunity";}
function salary(job:Job){
 if(job.salary_min==null&&job.salary_max==null)return null;
 const money=(n:number|string)=>Number(n).toLocaleString();
 if(job.salary_min!=null&&job.salary_max!=null)return `${job.salary_currency||""} ${money(job.salary_min)}–${money(job.salary_max)}`.trim();
 return `${job.salary_currency||""} ${money((job.salary_min??job.salary_max) as number|string)}`.trim();
}

export default function Jobs(){
 const token=useUiStore(s=>s.token);
 const [filters,setFilters]=useState<Filters>(initialFilters);
 const [jobs,setJobs]=useState<Job[]>([]);
 const [saved,setSaved]=useState<string[]>([]);
 const [expanded,setExpanded]=useState<Record<string,boolean>>({});
 const [loading,setLoading]=useState(true);
 const [savingId,setSavingId]=useState("");
 const [creatingAlert,setCreatingAlert]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [coverLetters,setCoverLetters]=useState<Record<string,string>>({});
 const [draftIds,setDraftIds]=useState<Record<string,string>>({});
 const [applyingId,setApplyingId]=useState("");

 const loadJobs=useCallback(async(nextFilters:Filters)=>{
   setLoading(true);setError("");setNotice("");
   try{
     const qs=queryString(nextFilters);
     const payload=await api<{items:Job[]}|Job[]>(`/api/v1/jobs${qs?"?"+qs:""}`,{},token||undefined);
     const items=Array.isArray(payload)?payload:payload?.items;
     setJobs(Array.isArray(items)?items.filter(j=>j&&typeof j.id==="string"&&typeof j.title==="string"):[]);
     if(!Array.isArray(items))setError("The service returned an unexpected jobs response. Please refresh and try again.");
   }catch(e){
     setJobs([]);
     setError(e instanceof ApiError?e.message:"We couldn't load opportunities right now.");
   }finally{setLoading(false);}
 },[token]);

 useEffect(()=>{void loadJobs(initialFilters)},[loadJobs]);
 useEffect(()=>{
   if(!token){setSaved([]);return;}
   let active=true;
   api<Job[]>("/api/v1/me/saved-jobs",{},token).then(rows=>{if(active)setSaved(Array.isArray(rows)?rows.map(row=>row.id):[])}).catch(e=>{if(active)setError(e instanceof ApiError?e.message:"We couldn't load saved opportunities.")});
   return ()=>{active=false};
 },[token]);

 async function submitFilters(e:FormEvent){e.preventDefault();await loadJobs(filters);}
 async function createAlert(){
   if(!token){setNotice("Sign in to save a job alert for these search criteria.");return;}
   setCreatingAlert(true);setError("");setNotice("");
   try{
     const parts=[filters.q,filters.location].filter(Boolean);
     const name=parts.length?`Job alert: ${parts.join(" · ")}`:"Job alert: all matching opportunities";
     await api("/api/v1/me/job-alerts",{method:"POST",body:JSON.stringify({name,criteria:filters,channel:"in_app",frequency:"daily"})},token);
     setNotice("Your daily in-app job alert was saved with the current search criteria.");
   }catch(e){setError(e instanceof ApiError?e.message:"We couldn't save this job alert.");}
   finally{setCreatingAlert(false);}
 }
 async function toggleSave(job:Job){
   if(!token){setNotice("Sign in to save opportunities. Your search results remain available without signing in.");return;}
   setSavingId(job.id);setError("");setNotice("");
   const isSaved=saved.includes(job.id);
   try{
     await api(`/api/v1/jobs/${encodeURIComponent(job.id)}/save`,{method:isSaved?"DELETE":"POST"},token);
     setSaved(current=>isSaved?current.filter(id=>id!==job.id):[...current,job.id]);
     setNotice(isSaved?"Opportunity removed from saved jobs.":"Opportunity saved to your account.");
   }catch(e){setError(e instanceof ApiError?e.message:"We couldn't update your saved jobs.");}
   finally{setSavingId("");}
 }
 async function submitFormalApplication(job:Job){
   if(!token){setNotice("Sign in to start a formal application. Public interest intake remains available separately.");return;}
   setApplyingId(job.id);setError("");setNotice("");
   try{
     let draftId=draftIds[job.id];
     if(!draftId){
       const draft=await api<{id:string}>(`/api/v1/jobs/${encodeURIComponent(job.id)}/application-drafts`,{method:"POST",body:JSON.stringify({coverLetter:coverLetters[job.id]||""})},token);
       draftId=draft.id;setDraftIds(current=>({...current,[job.id]:draftId!}));
     }
     await api(`/api/v1/job-applications/${encodeURIComponent(draftId)}/submit`,{method:"POST",body:JSON.stringify({coverLetter:coverLetters[job.id]||""})},token);
     setNotice("Formal application submitted. Its status is available in application tracking.");
     setDraftIds(current=>{const next={...current};delete next[job.id];return next;});
   }catch(e){setError(e instanceof ApiError?e.message:"We couldn't submit the formal application. If eligibility needs review, the draft remains available in this session.");}
   finally{setApplyingId("");}
 }
 async function toggleDetails(job:Job){
   const isOpen=Boolean(expanded[job.id]);
   if(isOpen){setExpanded(current=>({...current,[job.id]:false}));return;}
   setExpanded(current=>({...current,[job.id]:true}));
   if(job.description!==undefined)return;
   try{
     const detail=await api<Job>(`/api/v1/jobs/${encodeURIComponent(job.id)}`,{},token||undefined);
     setJobs(current=>current.map(item=>item.id===job.id?{...item,...detail}:item));
   }catch(e){setError(e instanceof ApiError?e.message:"We couldn't load the opportunity details.");}
 }

 return <div>
   <div className="eyebrow">Employment & opportunity hub</div>
   <h1 className="h1">Opportunities, without the maze.</h1>
   <p className="muted">Browse current opportunities published by verified organizations. Eligibility and formal application steps are checked by the platform; sample or invented vacancies are not shown.</p>
   <div className="split" style={{marginTop:20}}>
     <Card id="job-filters" className="filter">
       <form onSubmit={submitFilters}>
         <div className="row"><b>Search opportunities</b><SlidersHorizontal size={17}/></div>
         <label style={{display:"grid",gap:6,marginTop:14,fontSize:13,fontWeight:700}}>Role, skill or sector<input value={filters.q} onChange={e=>setFilters({...filters,q:e.target.value})} placeholder="Search job title or description"/></label>
         <label style={{display:"grid",gap:6,marginTop:16,fontSize:13,fontWeight:700}}>Location<input value={filters.location} onChange={e=>setFilters({...filters,location:e.target.value})} placeholder="City or region"/></label>
         <label style={{display:"grid",gap:6,marginTop:16,fontSize:13,fontWeight:700}}>Employment type<input value={filters.employmentType} onChange={e=>setFilters({...filters,employmentType:e.target.value})} placeholder="e.g. full_time"/></label>
         <label style={{display:"grid",gap:6,marginTop:16,fontSize:13,fontWeight:700}}>Work mode<input value={filters.workMode} onChange={e=>setFilters({...filters,workMode:e.target.value})} placeholder="e.g. remote"/></label>
         <label style={{display:"grid",gap:6,marginTop:16,fontSize:13,fontWeight:700}}>Seniority<input value={filters.seniority} onChange={e=>setFilters({...filters,seniority:e.target.value})} placeholder="Seniority level"/></label>
         <label style={{display:"grid",gap:6,marginTop:16,fontSize:13,fontWeight:700}}>Scope<select value={filters.postingScope} onChange={e=>setFilters({...filters,postingScope:e.target.value})}><option value="">All opportunities visible to me</option><option value="public">Public</option><option value="partner_network">Member network</option><option value="organization_internal">Organization internal</option></select></label>
         <button className="btn btn-primary" type="submit" disabled={loading} style={{width:"100%",marginTop:18}}>{loading?"Searching…":"Apply filters"}</button>
         <button className="btn btn-ghost" type="button" onClick={()=>{setFilters(initialFilters);void loadJobs(initialFilters)}} disabled={loading} style={{width:"100%",marginTop:8}}>Clear filters</button>
         <button className="btn btn-ghost" type="button" onClick={()=>void createAlert()} disabled={creatingAlert||loading} style={{width:"100%",marginTop:8}}>{creatingAlert?"Saving alert…":"Save job alert"}</button>
       </form>
     </Card>
     <div id="job-card" className="grid">
       {error&&<div className="form-error" role="alert">{error}<button className="btn btn-ghost" onClick={()=>void loadJobs(filters)} type="button" style={{marginLeft:8}}>Retry</button></div>}
       {notice&&<p className="muted" role="status">{notice}{!token&&<a href="/login?next=/jobs"> Sign in</a>}</p>}
       {loading&&<Card><div className="row"><RefreshCw size={18}/><p className="muted">Loading current opportunities…</p></div></Card>}
       {!loading&&!error&&jobs.length===0&&<Card><h2 className="h2">No matching opportunities</h2><p className="muted">There are no published opportunities matching these filters right now. Try clearing filters or check again later.</p><button className="btn btn-ghost" onClick={()=>{setFilters(initialFilters);void loadJobs(initialFilters)}}>Clear filters</button></Card>}
       {jobs.map(job=><Card key={job.id}>
         <div className="row"><Badge>{scopeLabel(job.posting_scope)}</Badge><button className="icon-btn" type="button" aria-label={saved.includes(job.id)?"Remove saved opportunity":"Save opportunity"} title={saved.includes(job.id)?"Remove saved opportunity":"Save opportunity"} disabled={savingId===job.id} onClick={()=>void toggleSave(job)}><Bookmark size={18} fill={saved.includes(job.id)?"currentColor":"none"}/></button></div>
         <h2 style={{fontSize:20,margin:"12px 0 5px"}}>{job.title}</h2>
         <div className="muted"><Building2 size={14}/> {job.organization_name||"Verified organization"}</div>
         <div style={{display:"flex",gap:12,marginTop:12,flexWrap:"wrap"}}>
           {job.location_label&&<span className="tagline"><MapPin size={14}/> {job.location_label}</span>}
           {job.employment_type&&<span className="tagline"><Clock3 size={14}/> {job.employment_type.replaceAll("_"," ")}</span>}
           {job.seniority_level&&<span className="tagline"><Users size={14}/> {job.seniority_level}</span>}
           {job.work_mode&&<span className="tagline">{job.work_mode.replaceAll("_"," ")}</span>}
           {salary(job)&&<span className="tagline">{salary(job)}</span>}
         </div>
         {job.application_deadline&&<p className="muted">Application deadline: {new Date(job.application_deadline).toLocaleDateString()}</p>}
         {expanded[job.id]&&<div style={{marginTop:14}}><p>{job.description||"No further description has been published."}</p><p className="muted">A public inquiry is not a formal application. Formal submission is authenticated and checks eligibility, required screening answers and duplicate applications.</p>{token?<div className="grid" style={{gap:8,marginTop:10}}><label htmlFor={"cover-"+job.id}>Cover letter (optional)<textarea id={"cover-"+job.id} rows={3} value={coverLetters[job.id]||""} onChange={e=>setCoverLetters(current=>({...current,[job.id]:e.target.value}))} placeholder="Explain your interest and relevant experience."/></label><button className="btn btn-primary" type="button" disabled={applyingId===job.id} onClick={()=>void submitFormalApplication(job)}>{applyingId===job.id?"Submitting…":draftIds[job.id]?"Retry formal submission":"Submit formal application"}</button></div>:<p className="muted"><a href="/login?next=/jobs">Sign in to submit a formal application</a>; use public inquiry only if you want to ask questions first.</p>}</div>}
         <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:18}}>
           <button className="btn btn-ghost" type="button" onClick={()=>void toggleDetails(job)}>{expanded[job.id]?"Hide details":"View details"}</button>
           <a className="btn btn-primary" href={"/apply/job"}>Start public inquiry</a>
         </div>
       </Card>)}
     </div>
   </div>
 </div>;
}

"use client";
import {FormEvent,useEffect,useState} from "react";
import {ArrowRight,BriefcaseBusiness,CheckCircle2} from "lucide-react";
import {Card,Badge} from "../../../components/ui";
import {api} from "../../../lib/api";
type Job={id:string;title:string;organization_name?:string;organization_display_name?:string;location_label?:string;posting_scope?:string;status?:string};

function normalizeJobs(payload: unknown): Job[] {
  // APIs may return the list directly or wrap it in a named collection.
  // Never trust the response shape at runtime just because the request is typed.
  const value = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  const candidate = Array.isArray(payload)
    ? payload
    : value && [value.jobs, value.items, value.results, value.opportunities].find(Array.isArray);

  if (!Array.isArray(candidate)) return [];
  return candidate.filter((item): item is Job =>
    Boolean(item && typeof item === "object" &&
      typeof (item as Record<string, unknown>).id === "string" &&
      typeof (item as Record<string, unknown>).title === "string")
  );
}

export default function PublicJobApply(){
 const [jobs,setJobs]=useState<Job[]>([]); const [jobId,setJobId]=useState(""); const [jobsNotice,setJobsNotice]=useState(""); const [form,setForm]=useState({contactName:"",contactEmail:"",contactPhone:"",intent:"",consent:false}); const [result,setResult]=useState<any>(null); const [error,setError]=useState("");
 useEffect(()=>{
   let active=true;
   api<unknown>("/api/v1/jobs?postingScope=public")
     .then(payload=>{
       if(!active)return;
       const list=normalizeJobs(payload);
       setJobs(list);
       if(list.length)setJobId(list[0].id);
       else if(!Array.isArray(payload) && !(payload && typeof payload==="object" && [ "jobs","items","results","opportunities" ].some(key=>Array.isArray((payload as Record<string,unknown>)[key]))))
         setJobsNotice("Public job listings are temporarily unavailable. You can still send a general job inquiry.");
     })
     .catch(()=>{
       if(!active)return;
       setJobs([]);
       setJobsNotice("We couldn't load public job listings right now. You can still send a general job inquiry.");
     });
   return ()=>{active=false};
 },[]);
 async function submit(e:FormEvent){e.preventDefault();setError("");try{const r=await api<any>("/api/v1/public/opportunity-inquiries",{method:"POST",body:JSON.stringify({...form,inquiryType:"job",jobId:jobId||null})});setResult(r)}catch(e){setError(e instanceof Error?e.message:"Could not receive your application inquiry.")}}
 if(result)return <div className="auth-page"><Card><Badge tone="green">Inquiry received</Badge><h1 className="h1">We have your interest.</h1><p className="muted">Reference <b>{result.publicReference}</b>. We start with your intent and contact information so you do not have to complete a long form before we know what you need.</p><div className="form-success"><CheckCircle2 size={18}/> Save your secure continuation link. It lets you provide detailed information later.</div><a className="btn btn-primary" href={"/apply/opportunity?ref="+encodeURIComponent(result.publicReference)+"&token="+encodeURIComponent(result.continuationToken)} style={{marginTop:16}}>Continue with detailed information <ArrowRight size={16}/></a><p className="muted" style={{marginTop:14}}>Formal eligibility, membership and employer screening still apply. Non-members may be considered only when an authorized reviewer explicitly allows that path.</p></Card></div>;
 return <div className="auth-page"><Card><div className="eyebrow">Public job application · first step</div><h1 className="h1">Tell us what opportunity you want.</h1><p className="muted">Start with only your intent and contact details. We will then explain the formal application path and what information is needed.</p>{jobsNotice&&<p className="muted" role="status">{jobsNotice}</p>}<form className="form-stack" onSubmit={submit}><label>Opportunity<select value={jobId} onChange={e=>setJobId(e.target.value)}><option value="">General public job interest</option>{jobs.map(j=><option key={j.id} value={j.id}>{j.title}{j.organization_display_name?" · "+j.organization_display_name:""}</option>)}</select></label><label>Your name<input required value={form.contactName} onChange={e=>setForm({...form,contactName:e.target.value})}/></label><div className="form-grid"><label>Email<input type="email" value={form.contactEmail} onChange={e=>setForm({...form,contactEmail:e.target.value})}/></label><label>Phone<input value={form.contactPhone} onChange={e=>setForm({...form,contactPhone:e.target.value})}/></label></div><label>What are you looking for?<textarea required rows={4} value={form.intent} onChange={e=>setForm({...form,intent:e.target.value})} placeholder="For example: I am interested in the project finance role and would like to know how to apply."/></label><label className="check-row"><input type="checkbox" required checked={form.consent} onChange={e=>setForm({...form,consent:e.target.checked})}/> I agree that MPA may use these contact details to respond to this opportunity inquiry.</label>{error&&<div className="form-error" role="alert">{error}</div>}<button className="btn btn-primary">Send job application inquiry <BriefcaseBusiness size={16}/></button></form><div className="auth-links"><a href="/jobs">Browse public jobs</a><a href="/track">Track an existing application</a></div></Card></div>;
}

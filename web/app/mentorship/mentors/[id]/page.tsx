"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {useParams} from "next/navigation";
import {ArrowLeft,Bookmark,HeartHandshake,Languages,RefreshCw} from "lucide-react";
import {Card,Badge} from "../../../../components/ui";
import {api,ApiError} from "../../../../lib/api";
import {useSavedDiscoveryItems} from "../../../../lib/use-saved-discovery-items";
type Mentor={id:string;user_id:string;display_name:string;headline?:string|null;bio?:string|null;expertise?:string[]|string;languages?:string[]|string;mentoring_modes?:string[]|string;max_active_mentees?:number};
function values(v:unknown):string[]{if(Array.isArray(v))return v.map(String);if(typeof v==="string"){try{const x=JSON.parse(v);if(Array.isArray(x))return x.map(String)}catch{}return v?[v]:[]}return []}
export default function PublicMentorProfile(){
 const params=useParams<{id:string}>();const id=String(params.id||"");const saved=useSavedDiscoveryItems();
 const [item,setItem]=useState<Mentor|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState("");
 const load=useCallback(async()=>{if(!id)return;setLoading(true);setError("");try{setItem(await api<Mentor>("/api/v1/mentors/"+encodeURIComponent(id)));}catch(e){setItem(null);setError(e instanceof ApiError?e.message:"This mentor profile is unavailable to your account.");}finally{setLoading(false);}},[id]);
 useEffect(()=>{void load();},[load]);
 return <main className="grid" style={{gap:18}}><Link href="/mentorship" className="btn btn-ghost"><ArrowLeft size={16}/> Back to mentorship</Link>
 {loading?<Card><div className="row"><RefreshCw size={18}/><p className="muted">Loading mentor profile…</p></div></Card>
 :error?<Card><h1 className="h2">Mentor unavailable</h1><p role="alert" className="form-error">{error}</p><button className="btn btn-primary" type="button" onClick={()=>void load()}>Retry</button></Card>
 :item&&<Card><div className="row"><div className="avatar"><HeartHandshake size={23}/></div><div style={{flex:1,minWidth:0}}><div className="eyebrow">Approved mentor profile</div><h1 className="h1">{item.display_name}</h1><p className="tagline">{item.headline||"Mentor"}</p></div><button className="btn btn-ghost" type="button" disabled={!saved.signedIn||saved.isSaving("mentor",item.user_id)} aria-pressed={saved.isSaved("mentor",item.user_id)} onClick={()=>void saved.toggle("mentor",item.user_id)}><Bookmark size={16}/>{saved.isSaved("mentor",item.user_id)?"Saved":"Save mentor"}</button></div>
 {item.bio&&<p className="muted" style={{whiteSpace:"pre-wrap",marginTop:16}}>{item.bio}</p>}
 {values(item.expertise).length>0&&<div><h2 className="h2">Expertise</h2><div className="row" style={{flexWrap:"wrap"}}>{values(item.expertise).map(x=><Badge key={x}>{x}</Badge>)}</div></div>}
 {values(item.languages).length>0&&<p className="tagline"><Languages size={15}/> Languages: {values(item.languages).join(", ")}</p>}
 {values(item.mentoring_modes).length>0&&<p className="tagline">Mentoring modes: {values(item.mentoring_modes).join(", ")}</p>}
 <p className="muted">Mentorship requests still use the MPA mentorship workflow, eligibility checks and mentor acceptance process.</p><Link className="btn btn-primary" href="/mentorship">Open mentorship workspace</Link>{saved.savedError&&<p role="status" className="form-error">{saved.savedError}</p>}</Card>}
 </main>;
}

"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {useParams} from "next/navigation";
import {ArrowLeft,Bookmark,Briefcase,MapPin,RefreshCw,ShieldCheck} from "lucide-react";
import {Card,Badge} from "../../../components/ui";
import {api,ApiError} from "../../../lib/api";
import {useSavedDiscoveryItems} from "../../../lib/use-saved-discovery-items";
type Profile={user_id:string;display_name:string;professional_title?:string|null;headline?:string|null;bio?:string|null;directory_summary?:string|null;years_experience?:number|null;location_label?:string|null;availability_status?:string|null;verifiedClaims?:{claim_code:string}[];experience?:{id:string;role_title:string;employer_name?:string|null;description?:string|null;start_date?:string|null;end_date?:string|null;is_current:boolean}[]};
export default function PublicProfessionalProfile(){
 const params=useParams<{id:string}>();const id=String(params.id||"");const saved=useSavedDiscoveryItems();
 const [item,setItem]=useState<Profile|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState("");
 const load=useCallback(async()=>{if(!id)return;setLoading(true);setError("");try{setItem(await api<Profile>("/api/v1/talent/"+encodeURIComponent(id)));}catch(e){setItem(null);setError(e instanceof ApiError?e.message:"This professional profile is unavailable to your account.");}finally{setLoading(false);}},[id]);
 useEffect(()=>{void load();},[load]);
 return <main className="grid" style={{gap:18}}><Link href="/network" className="btn btn-ghost"><ArrowLeft size={16}/> Back to professionals</Link>
 {loading?<Card><div className="row"><RefreshCw size={18}/><p className="muted">Loading professional profile…</p></div></Card>
 :error?<Card><h1 className="h2">Profile unavailable</h1><p role="alert" className="form-error">{error}</p><button className="btn btn-primary" type="button" onClick={()=>void load()}>Retry</button></Card>
 :item&&<Card><div className="row"><div className="avatar"><Briefcase size={23}/></div><div style={{flex:1,minWidth:0}}><div className="eyebrow">Professional profile</div><h1 className="h1">{item.display_name}</h1><p className="tagline">{item.professional_title||item.headline||"MPA professional"}</p></div><button className="btn btn-ghost" type="button" disabled={!saved.signedIn||saved.isSaving("professional",item.user_id)} aria-pressed={saved.isSaved("professional",item.user_id)} onClick={()=>void saved.toggle("professional",item.user_id)}><Bookmark size={16}/>{saved.isSaved("professional",item.user_id)?"Saved":"Save profile"}</button></div>
 {(item.directory_summary||item.bio)&&<p className="muted" style={{whiteSpace:"pre-wrap",marginTop:16}}>{item.directory_summary||item.bio}</p>}
 {item.location_label&&<p className="tagline"><MapPin size={15}/> {item.location_label}</p>}
 {item.years_experience!==null&&item.years_experience!==undefined&&<p className="tagline">{item.years_experience} years of experience</p>}
 {item.availability_status&&<p className="tagline">Availability: {item.availability_status.replaceAll("_"," ")}</p>}
 {Array.isArray(item.verifiedClaims)&&item.verifiedClaims.length>0&&<div><h2 className="h2">Verified claims</h2><div className="row" style={{flexWrap:"wrap"}}>{item.verifiedClaims.map((claim,i)=><Badge key={claim.claim_code+"-"+i}><ShieldCheck size={13}/>{claim.claim_code.replaceAll("_"," ")}</Badge>)}</div></div>}
 {Array.isArray(item.experience)&&item.experience.length>0&&<div><h2 className="h2">Experience</h2>{item.experience.map(role=><div key={role.id} style={{padding:"12px 0",borderBottom:"1px solid var(--border, #d1d5db)"}}><strong>{role.role_title}</strong>{role.employer_name&&<p className="muted">{role.employer_name}</p>}{role.description&&<p className="muted">{role.description}</p>}</div>)}</div>}
 <p className="muted">Contact details stay protected by the inquiry and explicit contact-release workflow.</p><Link className="btn btn-primary" href="/network">Open professional directory</Link>{saved.savedError&&<p aria-live="polite" aria-atomic="true" className="form-error">{saved.savedError}</p>}</Card>}
 </main>;
}

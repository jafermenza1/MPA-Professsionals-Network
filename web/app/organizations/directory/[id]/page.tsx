"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {useParams} from "next/navigation";
import {Building2,ExternalLink,MapPin,RefreshCw,ShieldCheck,Bookmark} from "lucide-react";
import {Card,Badge} from "../../../../components/ui";
import {api,ApiError} from "../../../../lib/api";
import {useSavedDiscoveryItems} from "../../../../lib/use-saved-discovery-items";
type Organization={id:string;display_name:string;organization_type?:string|null;description?:string|null;website?:string|null;location_label?:string|null};
export default function PublicOrganizationProfile(){
 const params=useParams<{id:string}>();const id=String(params.id||"");const saved=useSavedDiscoveryItems();
 const [item,setItem]=useState<Organization|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState("");
 const load=useCallback(async()=>{if(!id)return;setLoading(true);setError("");try{setItem(await api<Organization>("/api/v1/public/organizations/"+encodeURIComponent(id)));}catch(e){setItem(null);setError(e instanceof ApiError?e.message:"This public organization profile is unavailable.");}finally{setLoading(false);}},[id]);
 useEffect(()=>{void load();},[load]);
 return <main className="grid" style={{gap:18}}><Link href="/organizations/directory" className="btn btn-ghost">← Back to organizations</Link>
 {loading?<Card><div className="row"><RefreshCw size={18}/><p className="muted">Loading verified organization profile…</p></div></Card>
 :error?<Card><h1 className="h2">Organization unavailable</h1><p role="alert" className="form-error">{error}</p><button className="btn btn-primary" type="button" onClick={()=>void load()}>Retry</button></Card>
 :item&&<Card><div className="row"><div className="avatar"><Building2 size={24}/></div><div style={{flex:1,minWidth:0}}><div className="eyebrow">Public organization profile</div><h1 className="h1">{item.display_name}</h1><p className="tagline">{item.organization_type||"MPA network organization"}</p></div><Badge><ShieldCheck size={13}/> Verified</Badge></div>
 {item.description&&<p className="muted" style={{marginTop:16,whiteSpace:"pre-wrap"}}>{item.description}</p>}
 {item.location_label&&<p className="tagline"><MapPin size={15}/> {item.location_label}</p>}
 <div className="row" style={{gap:8,flexWrap:"wrap",marginTop:16}}><button className="btn btn-ghost" type="button" disabled={!saved.signedIn||saved.isSaving("organization",item.id)} aria-pressed={saved.isSaved("organization",item.id)} onClick={()=>void saved.toggle("organization",item.id)}><Bookmark size={16}/>{saved.isSaved("organization",item.id)?"Saved":"Save organization"}</button>{item.website&&/^https:\/\//i.test(item.website)&&<a className="btn btn-primary" href={item.website} target="_blank" rel="noreferrer">Official website <ExternalLink size={15}/></a>}</div>
 {saved.savedError&&<p aria-live="polite" aria-atomic="true" className="form-error">{saved.savedError}</p>}</Card>}
 </main>;
}

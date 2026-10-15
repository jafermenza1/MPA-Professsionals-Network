"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {useParams} from "next/navigation";
import {ArrowLeft,Bookmark,MapPin,RefreshCw} from "lucide-react";
import {Card,Badge} from "../../../components/ui";
import {api,ApiError} from "../../../lib/api";
import {useSavedDiscoveryItems} from "../../../lib/use-saved-discovery-items";
type Service={id:string;title:string;description:string;service_category:string;delivery_mode?:string;location_label?:string;pricing_model:string;price_amount?:number|string|null;currency?:string|null;provider_name?:string|null;display_name?:string|null};
export default function PublicServiceProfile(){
 const params=useParams<{id:string}>();const id=String(params.id||"");const saved=useSavedDiscoveryItems();
 const [item,setItem]=useState<Service|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState("");
 const load=useCallback(async()=>{if(!id)return;setLoading(true);setError("");try{setItem(await api<Service>("/api/v1/services/"+encodeURIComponent(id)));}catch(e){setItem(null);setError(e instanceof ApiError?e.message:"This service listing is unavailable to your account.");}finally{setLoading(false);}},[id]);
 useEffect(()=>{void load();},[load]);
 return <main className="grid" style={{gap:18}}><Link href="/services" className="btn btn-ghost"><ArrowLeft size={16}/> Back to services</Link>
 {loading?<Card><div className="row"><RefreshCw size={18}/><p className="muted">Loading service details…</p></div></Card>
 :error?<Card><h1 className="h2">Service unavailable</h1><p role="alert" className="form-error">{error}</p><button className="btn btn-primary" type="button" onClick={()=>void load()}>Retry</button></Card>
 :item&&<Card><div className="row"><div style={{flex:1,minWidth:0}}><Badge>{item.service_category}</Badge><h1 className="h1" style={{marginTop:10}}>{item.title}</h1><p className="tagline">Provider: {item.display_name||item.provider_name||"Verified provider"}</p></div><button className="btn btn-ghost" type="button" disabled={!saved.signedIn||saved.isSaving("service",item.id)} aria-pressed={saved.isSaved("service",item.id)} onClick={()=>void saved.toggle("service",item.id)}><Bookmark size={16}/>{saved.isSaved("service",item.id)?"Saved":"Save service"}</button></div>
 <p className="muted" style={{whiteSpace:"pre-wrap",marginTop:16}}>{item.description}</p>
 <p className="tagline">{(item.delivery_mode||"remote").replaceAll("_"," ")}{item.location_label?" · "+item.location_label:""}</p>
 <p className="tagline">Pricing: {item.pricing_model==="quote"?"Request a quote":item.pricing_model==="free"?"Free":item.price_amount!=null?String(item.currency||"")+" "+Number(item.price_amount).toLocaleString()+" · "+item.pricing_model:item.pricing_model}</p>
 <p className="muted">To send a request, return to the services workspace and select this listing. The provider must accept the request before delivery begins.</p>
 <Link className="btn btn-primary" href="/services">Open services workspace</Link>{saved.savedError&&<p role="status" className="form-error">{saved.savedError}</p>}</Card>}
 </main>;
}

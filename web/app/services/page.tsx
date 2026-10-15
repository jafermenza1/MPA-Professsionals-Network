"use client";
import { FormFeedback } from "../../components/form-feedback";
import { humanStatus } from "../../lib/status-labels";
import {FormEvent,useCallback,useEffect,useState} from "react";
import {Handshake,MessageSquareText,RefreshCw,Star} from "lucide-react";
import {Card,Badge} from "../../components/ui";
import {api,ApiError} from "../../lib/api";
import {useUiStore} from "../../lib/store";

type Service={id:string;title:string;description:string;service_category:string;delivery_mode?:string;location_label?:string;pricing_model:string;price_amount?:number|string|null;currency?:string|null;display_name?:string;provider_name?:string};
type ServiceRequest={id:string;status:string;service_title?:string;created_at?:string;message?:string;provider_user_id?:string;requester_user_id?:string;is_provider?:boolean;provider_completed_at?:string|null;requester_accepted_at?:string|null;outcome_summary?:string|null;nextAction?:string;status_history?:{fromStatus?:string|null;toStatus?:string|null;note?:string|null;createdAt?:string}[]};
type ServiceDelivery={id:string;request_id:string;description:string;status:string;reviewer_note?:string|null;created_at?:string;submitted_by:string};
type ProviderListing={id:string;title:string;description:string;service_category:string;delivery_mode:string;location_label?:string|null;pricing_model:string;price_amount?:number|string|null;currency?:string|null;visibility:string;status:string;moderation_status:string;moderation_note?:string|null;organization_id?:string|null;provider_name?:string|null};
type Org={id:string;display_name:string;verification_status?:string;role_code?:string};
export default function Services(){
 const token=useUiStore(s=>s.token);
 const [items,setItems]=useState<Service[]>([]);
 const [requests,setRequests]=useState<ServiceRequest[]>([]);
 const [deliveries,setDeliveries]=useState<Record<string,ServiceDelivery[]>>({});
 const [deliveryDrafts,setDeliveryDrafts]=useState<Record<string,string>>({});
 const [requestNotes,setRequestNotes]=useState<Record<string,string>>({});
 const [deliveryNotes,setDeliveryNotes]=useState<Record<string,string>>({});
 const [currentUserId,setCurrentUserId]=useState("");
 const [myListings,setMyListings]=useState<ProviderListing[]>([]),[organizations,setOrganizations]=useState<Org[]>([]);
 const [editingListingId,setEditingListingId]=useState("");
 const [providerSaving,setProviderSaving]=useState(false);
 const [providerForm,setProviderForm]=useState({title:"",description:"",serviceCategory:"",deliveryMode:"remote",locationLabel:"",pricingModel:"quote",priceAmount:"",currency:"ETB",visibility:"public",organizationId:""});
 const [transitioningId,setTransitioningId]=useState("");
 const [query,setQuery]=useState("");
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [selected,setSelected]=useState<Service|null>(null);
 const [message,setMessage]=useState("");
 const [submitting,setSubmitting]=useState(false);

 const load=useCallback(async(q="")=>{
   setLoading(true);setError("");
   try{
     const params=new URLSearchParams();if(q.trim())params.set("q",q.trim());
     const result=await api<{items:Service[]}>("/api/v1/services"+(params.toString()?"?"+params.toString():""),{},token||undefined);
     setItems(Array.isArray(result?.items)?result.items:[]);
   }catch(e){setItems([]);setError(e instanceof ApiError?e.message:"We couldn't load services right now.");}
   finally{setLoading(false);}
 },[token]);
 const loadProviderWorkspace=useCallback(async()=>{
   if(!token){setMyListings([]);setOrganizations([]);return;}
   try{const [listings,orgs]=await Promise.all([api<ProviderListing[]>("/api/v1/me/service-listings",{},token),api<Org[]>("/api/v1/organizations",{},token)]);setMyListings(Array.isArray(listings)?listings:[]);setOrganizations(Array.isArray(orgs)?orgs:[]);}
   catch(e){setError(e instanceof ApiError?e.message:"Your provider workspace could not be loaded.");}
 },[token]);
 const loadRequests=useCallback(async()=>{
   if(!token){setRequests([]);return;}
   try{const [result,me]=await Promise.all([api<ServiceRequest[]>("/api/v1/me/service-requests",{},token),api<{user_id:string}>("/api/v1/me",{},token)]);const rows=Array.isArray(result)?result:[];setRequests(rows);setCurrentUserId(me.user_id);const loaded=await Promise.all(rows.map(async r=>{try{return [r.id,await api<ServiceDelivery[]>("/api/v1/service-requests/"+encodeURIComponent(r.id)+"/deliveries",{},token)] as const;}catch{return [r.id,[]] as const;}}));setDeliveries(Object.fromEntries(loaded));}
   catch(e){setError(e instanceof ApiError?e.message:"We couldn't load your service requests.");}
 },[token]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{void loadRequests();},[loadRequests]);
 useEffect(()=>{void loadProviderWorkspace();},[loadProviderWorkspace]);

 async function submitProviderListing(e:FormEvent){
   e.preventDefault();if(!token)return;setProviderSaving(true);setError("");setNotice("");
   try{
     const body={title:providerForm.title.trim(),description:providerForm.description.trim(),serviceCategory:providerForm.serviceCategory.trim(),deliveryMode:providerForm.deliveryMode,locationLabel:providerForm.locationLabel.trim()||null,pricingModel:providerForm.pricingModel,priceAmount:providerForm.pricingModel==="free"?0:providerForm.priceAmount?Number(providerForm.priceAmount):null,currency:providerForm.currency||"ETB",visibility:providerForm.visibility,organizationId:providerForm.organizationId||undefined};
     await api(editingListingId?"/api/v1/services/"+encodeURIComponent(editingListingId):"/api/v1/services",{method:editingListingId?"PATCH":"POST",body:JSON.stringify(body)},token);
     setNotice(editingListingId?"Listing saved as a draft and returned to moderation review.":"Listing created as a draft. Review the details, then submit it for moderation.");
     setEditingListingId("");setProviderForm({title:"",description:"",serviceCategory:"",deliveryMode:"remote",locationLabel:"",pricingModel:"quote",priceAmount:"",currency:"ETB",visibility:"public",organizationId:""});
     await loadProviderWorkspace();
   }catch(e){setError(e instanceof ApiError?e.message:"Your listing could not be saved. Your entered details remain in the form.");}
   finally{setProviderSaving(false);}
 }
 async function changeListingStatus(item:ProviderListing,status:"published"|"paused"|"closed"){
   if(!token)return;setTransitioningId(item.id);setError("");setNotice("");
   try{await api("/api/v1/services/"+encodeURIComponent(item.id)+"/status",{method:"POST",body:JSON.stringify({status})},token);setNotice(status==="published"?"Listing submitted for moderation. It is not public until approved.":"Listing status updated.");await loadProviderWorkspace();}
   catch(e){setError(e instanceof ApiError?e.message:"Listing status could not be updated.");}
   finally{setTransitioningId("");}
 }
 function editListing(item:ProviderListing){
  setEditingListingId(item.id);setProviderForm({title:item.title,description:item.description,serviceCategory:item.service_category,deliveryMode:item.delivery_mode||"remote",locationLabel:item.location_label||"",pricingModel:item.pricing_model,priceAmount:item.price_amount==null?"":String(item.price_amount),currency:item.currency||"ETB",visibility:item.visibility||"public",organizationId:item.organization_id||""});setNotice("");setError("");
 }
 async function updateRequest(r:ServiceRequest,action:"accepted"|"declined"|"in_progress"|"completed"|"accept_completion"|"cancelled"|"disputed"){
   if(!token)return;setTransitioningId(r.id);setError("");setNotice("");
   try{
     const note=(requestNotes[r.id]||"").trim();
     if(["declined","cancelled","disputed"].includes(action)&&note.length<4){setError("Add a short explanation so the other participant understands this decision.");return;}
     const result=action==="accept_completion"?await api<any>("/api/v1/service-requests/"+encodeURIComponent(r.id)+"/accept-completion",{method:"POST",body:JSON.stringify({note:note||"Requester accepted the delivered outcome."})},token):await api<any>("/api/v1/service-requests/"+encodeURIComponent(r.id)+"/status",{method:"POST",body:JSON.stringify({status:action,note:note||undefined})},token);
     setNotice(result?.nextAction|| (action==="accept_completion"?"Delivered outcome accepted.":`Service request updated: ${action.replaceAll("_"," ")}.`));
     await loadRequests();
   }catch(e){setError(e instanceof ApiError?e.message:"We couldn't update this service request.");}
   finally{setTransitioningId("");}
 }
 async function submitDelivery(r:ServiceRequest){if(!token)return;const description=(deliveryDrafts[r.id]||"").trim();if(description.length<8){setError("Describe the work delivered in at least 8 characters.");return;}setTransitioningId(r.id);setError("");setNotice("");try{const result=await api<any>("/api/v1/service-requests/"+encodeURIComponent(r.id)+"/deliveries",{method:"POST",body:JSON.stringify({description})},token);setNotice(result?.nextAction||"Delivery recorded. The requester can review it and accept or ask for a revision.");setDeliveryDrafts(v=>({...v,[r.id]:""}));await loadRequests();}catch(e){setError(e instanceof ApiError?e.message:"Delivery could not be submitted. Please retry.");}finally{setTransitioningId("");}}
 async function reviewDelivery(d:ServiceDelivery,status:"accepted"|"revision_requested"){if(!token)return;const note=(deliveryNotes[d.id]||"").trim();if(status==="revision_requested"&&note.length<4){setError("Explain what needs to change before requesting a revision.");return;}setTransitioningId(d.id);setError("");setNotice("");try{const result=await api<any>("/api/v1/service-deliveries/"+encodeURIComponent(d.id)+"/review",{method:"POST",body:JSON.stringify({status,note:note||undefined})},token);setNotice(result?.nextAction||(status==="accepted"?"Delivery accepted.":"Revision requested."));await loadRequests();}catch(e){setError(e instanceof ApiError?e.message:"Delivery review could not be saved. Please retry.");}finally{setTransitioningId("");}}
 async function submitRequest(e:FormEvent){
   e.preventDefault();if(!selected)return;
   if(!token){setNotice("Sign in to request this service. Member-only offers require an active membership.");return;}
   setSubmitting(true);setError("");setNotice("");
   try{
     const created=await api<ServiceRequest>("/api/v1/services/"+encodeURIComponent(selected.id)+"/requests",{method:"POST",body:JSON.stringify({message:message.trim()||undefined})},token);
     setNotice("Your service request was submitted. It is awaiting the provider's response.");
     setSelected(null);setMessage("");
     setRequests(current=>[created,...current]);
   }catch(e){setError(e instanceof ApiError?e.message:"We couldn't submit this service request.");}
   finally{setSubmitting(false);}
 }

 return <div className="grid">
   <div><div className="eyebrow">Professional services</div><h1 className="h1">Find help, then deliver it well.</h1><p className="muted">Browse published service offers. Public offers can be requested by signed-in users; member-only offers require an active membership. Providers must accept before work begins.</p></div>
   <Card id="provider-workspace"><div className="row" style={{justifyContent:"space-between",flexWrap:"wrap"}}><div><div className="eyebrow">Provider workspace</div><h2 className="h2">Offer a professional service</h2><p className="muted">Create a draft, submit it for review, and track moderation status here. Public discovery begins only after approval.</p></div><Badge>Moderated publication</Badge></div>
    {!token?<p className="muted">Sign in to create or manage a service listing. Individual provider listings require an active membership; verified organizations can publish through an authorized organization role.</p>:<form className="grid" style={{gap:12,marginTop:14}} onSubmit={submitProviderListing}>
      <div className="grid grid-2"><label>Service title<input required minLength={3} maxLength={180} value={providerForm.title} onChange={e=>setProviderForm(v=>({...v,title:e.target.value}))} placeholder="e.g. Financial reporting and bookkeeping"/></label><label>Category<input required maxLength={120} value={providerForm.serviceCategory} onChange={e=>setProviderForm(v=>({...v,serviceCategory:e.target.value}))} placeholder="e.g. Finance, design, training"/></label></div>
      <label>What you provide<textarea required minLength={10} maxLength={5000} rows={4} value={providerForm.description} onChange={e=>setProviderForm(v=>({...v,description:e.target.value}))} placeholder="Describe deliverables, intended clients, boundaries and expected outcomes."/></label>
      <div className="grid grid-2"><label>Delivery mode<select value={providerForm.deliveryMode} onChange={e=>setProviderForm(v=>({...v,deliveryMode:e.target.value}))}><option value="remote">Remote</option><option value="onsite">On-site</option><option value="hybrid">Hybrid</option></select></label><label>Visibility<select value={providerForm.visibility} onChange={e=>setProviderForm(v=>({...v,visibility:e.target.value}))}><option value="public">Public listing</option><option value="members">Signed-in members</option></select></label></div>
      <div className="grid grid-2"><label>Pricing model<select value={providerForm.pricingModel} onChange={e=>setProviderForm(v=>({...v,pricingModel:e.target.value}))}><option value="quote">Request a quote</option><option value="free">Free</option><option value="fixed">Fixed price</option><option value="hourly">Hourly rate</option></select></label>{providerForm.pricingModel!=="quote"&&providerForm.pricingModel!=="free"&&<label>Price / rate<input required type="number" min="0" step="0.01" value={providerForm.priceAmount} onChange={e=>setProviderForm(v=>({...v,priceAmount:e.target.value}))}/></label>}{providerForm.pricingModel!=="quote"&&providerForm.pricingModel!=="free"&&<label>Currency<input required minLength={3} maxLength={3} value={providerForm.currency} onChange={e=>setProviderForm(v=>({...v,currency:e.target.value.toUpperCase()}))}/></label>}</div>
      <div className="grid grid-2"><label>Location (optional)<input maxLength={180} value={providerForm.locationLabel} onChange={e=>setProviderForm(v=>({...v,locationLabel:e.target.value}))} placeholder="City or remote"/></label><label>Represent an organization (optional)<select disabled={Boolean(editingListingId)} value={providerForm.organizationId} onChange={e=>setProviderForm(v=>({...v,organizationId:e.target.value}))}><option value="">My professional profile</option>{organizations.map(o=><option key={o.id} value={o.id} disabled={o.verification_status!=="verified"}>{o.display_name}{o.verification_status!=="verified"?" · verification required":""}</option>)}</select></label></div>
      <div className="row" style={{gap:8,flexWrap:"wrap"}}><button className="btn btn-primary" type="submit" disabled={providerSaving}>{providerSaving?"Saving…":editingListingId?"Save changes for review":"Save service draft"}</button>{editingListingId&&<button className="btn btn-ghost" type="button" onClick={()=>{setEditingListingId("");setProviderForm({title:"",description:"",serviceCategory:"",deliveryMode:"remote",locationLabel:"",pricingModel:"quote",priceAmount:"",currency:"ETB",visibility:"public",organizationId:""});}}>Cancel edit</button>}</div>
    </form>}
    {token&&<div className="grid" style={{gap:10,marginTop:18}}><h3 className="h2">Your listings</h3>{myListings.length===0?<p className="muted">No listings yet. Saved drafts will appear here for review and follow-up.</p>:myListings.map(item=><div className="case-row" key={item.id}><div className="row" style={{justifyContent:"space-between",flexWrap:"wrap"}}><b>{item.title}</b><div className="row" style={{gap:6,flexWrap:"wrap"}}><Badge>{item.status.replaceAll("_"," ")}</Badge><Badge>{item.moderation_status.replaceAll("_"," ")}</Badge></div></div><p className="muted">{item.provider_name||"Professional provider"} · {item.service_category}</p>{item.moderation_note&&<p className="muted">Reviewer note: {item.moderation_note}</p>}<div className="row" style={{gap:8,flexWrap:"wrap",marginTop:8}}><button type="button" className="btn btn-ghost" onClick={()=>editListing(item)} disabled={item.status==="closed"}>Edit</button>{item.moderation_status!=="approved"&&item.status!=="closed"&&<button type="button" className="btn btn-primary" disabled={transitioningId===item.id} onClick={()=>void changeListingStatus(item,"published")}>Submit for review</button>}{item.moderation_status==="approved"&&item.status==="published"&&<button type="button" className="btn btn-ghost" disabled={transitioningId===item.id} onClick={()=>void changeListingStatus(item,"paused")}>Pause listing</button>}</div></div>)}</div>}
   </Card>
   <Card id="service-discovery">
     <form onSubmit={e=>{e.preventDefault();void load(query)}} className="row" style={{gap:10,flexWrap:"wrap"}}>
       <label style={{flex:"1 1 240px"}}>Search services<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Category, capability or keyword" style={{width:"100%"}}/></label>
       <button className="btn btn-primary" type="submit" disabled={loading}>{loading?"Searching…":"Search"}</button>
       <button className="btn btn-ghost" type="button" disabled={loading} onClick={()=>{setQuery("");void load("")}}>Clear</button>
     </form>
   </Card>
   {error&&<FormFeedback kind="error" message={error} onRetry={()=>{void load(query);void loadRequests();}} membershipReturnTo="/services"/>}
   {notice&&<FormFeedback kind="success" message={notice} actionHref={!token?"/login?next=/services":undefined} actionLabel={!token?"Sign in":undefined}/>}
   {loading?<Card><div className="row"><RefreshCw size={18}/><p className="muted">Loading published services…</p></div></Card>:items.length===0&&!error?<Card><h2 className="h2">No published services found</h2><p className="muted">Try another keyword or check again later. Only live published listings are shown.</p></Card>:<div className="grid grid-2">{items.map(service=><Card key={service.id}>
     <div className="row"><Badge>{service.service_category}</Badge><span className="tagline">{(service.delivery_mode||"remote").replaceAll("_"," ")}</span></div>
     <h2 className="h2" style={{marginTop:12}}>{service.title}</h2>
     <p className="muted">{service.description}</p>
     <div className="tagline">Provider: {service.display_name||service.provider_name||"Verified member"}</div>
     {service.location_label&&<div className="tagline" style={{marginTop:6}}>Location: {service.location_label}</div>}
     <div className="tagline" style={{marginTop:6}}>Pricing: {service.pricing_model==="quote"?"Request a quote":service.pricing_model==="free"?"Free":service.price_amount!=null?`${service.currency||""} ${Number(service.price_amount).toLocaleString()} · ${service.pricing_model}`:service.pricing_model}</div>
     <button className="btn btn-primary" type="button" style={{marginTop:16,width:"100%"}} onClick={()=>{setSelected(service);setMessage("");setNotice("");}}>Request this service</button>
   </Card>)}</div>}
   {selected&&<Card id="service-request"><div className="row"><div><div className="eyebrow">New service request</div><h2 className="h2">{selected.title}</h2></div><button className="btn btn-ghost" type="button" onClick={()=>setSelected(null)}>Close</button></div>
     {!token?<><p className="muted">Sign in to request this service. Member-only offers require an active membership. A provider must accept before work begins.</p><a className="btn btn-primary" href="/login?next=/services">Sign in to continue</a></>:<form className="form-stack" onSubmit={submitRequest}><label>Message to the provider<textarea rows={4} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Describe the help you need, intended outcome and any important context."/></label><p className="muted">Submitting creates a request in the “requested” state. No payment or service completion is implied.</p><button className="btn btn-primary" type="submit" disabled={submitting}>{submitting?"Submitting…":"Submit service request"} <Handshake size={16}/></button></form>}
   </Card>}
   <Card><div className="row"><div><div className="h2">Your service requests</div><p className="muted">Requests and outcomes are visible to their permitted participants.</p></div><MessageSquareText color="var(--primary)"/></div>
     {!token?<p className="muted">Sign in to view requests you made or services you provide.</p>:requests.length===0?<p className="muted">No service requests are recorded for this account yet.</p>:<div className="grid">{requests.map(r=><div className="case-row" key={r.id}><div className="row"><b>{r.service_title||"Service request"}</b><Badge>{humanStatus(r.status)}</Badge></div><small className="muted">{r.created_at?new Date(r.created_at).toLocaleString():"Request recorded"}</small>{r.message&&<p className="muted">{r.message}</p>}{r.status_history&&r.status_history.length>0&&<details style={{marginTop:8}}><summary>Request history ({r.status_history.length} updates)</summary><div className="grid" style={{gap:6,marginTop:8}}>{r.status_history.map((event,index)=><div className="case-row" key={index}><b>{event.fromStatus?humanStatus(event.fromStatus)+" → ":""}{humanStatus(event.toStatus||"recorded")}</b><small className="muted">{event.createdAt?new Date(event.createdAt).toLocaleString():"Update recorded"}</small>{event.note&&<p className="muted">{event.note}</p>}</div>)}</div></details>}{r.outcome_summary&&<p className="muted">Recorded outcome: {r.outcome_summary}</p>}<p className="muted">{r.status==="requested"?"Next: the provider reviews your request.":r.status==="accepted"?"Next: agree the scope and start date.":r.status==="in_progress"&&!r.provider_completed_at?"Next: track delivery; the requester reviews submitted work.":r.status==="in_progress"&&r.provider_completed_at?"Next: the requester reviews and accepts completion.":r.status==="disputed"?"Next: respond to the concern and agree a documented resolution.":r.status==="completed"?"Next: leave feedback or review the final outcome.":r.status==="declined"||r.status==="cancelled"?"This request is resolved. Create a new request if the need remains.":"Review the recorded outcome and next step."}</p>{["requested","accepted","in_progress","disputed"].includes(r.status)&&<label>Note for this action<input value={requestNotes[r.id]||""} onChange={e=>setRequestNotes(v=>({...v,[r.id]:e.target.value}))} placeholder="Required when declining, cancelling or raising a concern"/></label>}{r.status==="in_progress"&&(r.is_provider||r.provider_user_id===currentUserId)&&<div className="form-stack" style={{marginTop:8}}><label>Describe the work delivered<textarea rows={3} value={deliveryDrafts[r.id]||""} onChange={e=>setDeliveryDrafts(v=>({...v,[r.id]:e.target.value}))} placeholder="What was completed? Include the result and anything the requester should review."/></label><button className="btn btn-ghost" type="button" disabled={transitioningId===r.id} onClick={()=>void submitDelivery(r)}>{transitioningId===r.id?"Saving…":"Submit delivery for review"}</button></div>}{(deliveries[r.id]||[]).length>0&&<div className="grid" style={{gap:8,marginTop:10}}><b>Delivery history</b>{(deliveries[r.id]||[]).map(d=><div className="case-row" key={d.id}><div className="row" style={{justifyContent:"space-between",flexWrap:"wrap"}}><Badge>{humanStatus(d.status)}</Badge><small className="muted">{d.created_at?new Date(d.created_at).toLocaleString():"Delivery recorded"}</small></div><p>{d.description}</p>{d.reviewer_note&&<p className="muted">Requester note: {d.reviewer_note}</p>}{r.requester_user_id===currentUserId&&d.status==="submitted"&&<><label>Review note<input value={deliveryNotes[d.id]||""} onChange={e=>setDeliveryNotes(v=>({...v,[d.id]:e.target.value}))} placeholder="Required if asking for a revision"/></label><div className="row" style={{gap:8,flexWrap:"wrap"}}><button className="btn btn-primary" type="button" disabled={transitioningId===d.id} onClick={()=>void reviewDelivery(d,"accepted")}>Accept delivery</button><button className="btn btn-ghost" type="button" disabled={transitioningId===d.id} onClick={()=>void reviewDelivery(d,"revision_requested")}>Request revision</button></div></>}</div>)}</div>}<div className="row" style={{gap:8,flexWrap:"wrap",marginTop:10}}>{(r.is_provider||r.provider_user_id===currentUserId)&&r.status==="requested"&&<><button className="btn btn-primary" type="button" disabled={transitioningId===r.id} onClick={()=>void updateRequest(r,"accepted")}>Accept request</button><button className="btn btn-ghost" type="button" disabled={transitioningId===r.id} onClick={()=>void updateRequest(r,"declined")}>Decline request</button></>}{(r.is_provider||r.provider_user_id===currentUserId)&&r.status==="accepted"&&<button className="btn btn-primary" type="button" disabled={transitioningId===r.id} onClick={()=>void updateRequest(r,"in_progress")}>Start delivery</button>}{(r.is_provider||r.provider_user_id===currentUserId)&&r.status==="in_progress"&&!r.provider_completed_at&&<button className="btn btn-primary" type="button" disabled={transitioningId===r.id} onClick={()=>void updateRequest(r,"completed")}>Submit delivery for acceptance</button>}{r.requester_user_id===currentUserId&&r.status==="in_progress"&&r.provider_completed_at&&!r.requester_accepted_at&&<button className="btn btn-primary" type="button" disabled={transitioningId===r.id} onClick={()=>void updateRequest(r,"accept_completion")}>Accept delivered outcome</button>}{r.requester_user_id===currentUserId&&["requested","accepted"].includes(r.status)&&<button className="btn btn-ghost" type="button" disabled={transitioningId===r.id} onClick={()=>void updateRequest(r,"cancelled")}>Cancel request</button>}{r.status==="in_progress"&&<button className="btn btn-ghost" type="button" disabled={transitioningId===r.id} onClick={()=>void updateRequest(r,"disputed")}>Raise a concern</button>}{r.status==="disputed"&&<button className="btn btn-primary" type="button" disabled={transitioningId===r.id} onClick={()=>void updateRequest(r,"in_progress")}>Resume delivery</button>}</div></div>)}</div>}
   </Card>
   <Card><Star color="var(--gold)"/><div className="h2" style={{marginTop:10}}>Outcome and feedback</div><p className="muted">A request moves through explicit provider and requester actions. Completion feedback does not automatically create a professional verification claim.</p></Card>
 </div>;
}

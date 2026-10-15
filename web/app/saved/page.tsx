"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, RefreshCw, Trash2 } from "lucide-react";
import { Card, Badge } from "../../components/ui";
import { api, ApiError } from "../../lib/api";
import { useUiStore } from "../../lib/store";

type SavedItem = { item_type: "professional"|"organization"|"service"|"mentor"; item_id: string; title: string; subtitle?: string|null; href: string; created_at: string };
const labels = { professional:"Professional", organization:"Organization", service:"Service", mentor:"Mentor" };

export default function SavedItemsPage() {
  const token = useUiStore(state => state.token);
  const [items,setItems] = useState<SavedItem[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const load = useCallback(async () => {
    if(!token){setItems([]);setLoading(false);return;}
    setLoading(true);setError("");
    try { const result=await api<SavedItem[]>("/api/v1/me/saved-items",{},token);setItems(Array.isArray(result)?result:[]); }
    catch(cause){setError(cause instanceof ApiError?cause.message:"Saved items could not be loaded.");}
    finally{setLoading(false);}
  },[token]);
  useEffect(()=>{void load();},[load]);
  async function remove(item:SavedItem){
    if(!token)return;setError("");
    try{await api("/api/v1/me/saved-items/"+encodeURIComponent(item.item_type)+"/"+encodeURIComponent(item.item_id),{method:"DELETE"},token);setItems(rows=>rows.filter(row=>row.item_type!==item.item_type||row.item_id!==item.item_id));}
    catch(cause){setError(cause instanceof ApiError?cause.message:"This saved item could not be removed.");}
  }
  return <main className="grid" style={{gap:18}}>
    <header><div className="eyebrow">Your account</div><h1 className="h1">Saved items</h1><p className="muted">Keep useful professional profiles, verified organizations, service listings and mentors together in one private, account-synced list. Items disappear from this list if they are no longer visible to your account.</p></header>
    {error&&<div role="alert" className="form-error">{error}<button className="btn btn-ghost" onClick={()=>void load()} type="button">Retry</button></div>}
    {loading?<Card><div className="row"><RefreshCw size={18}/><p className="muted">Loading your saved items…</p></div></Card>
      :!token?<Card><h2 className="h2">Sign in to see saved items</h2><p className="muted">Saved items are private to your account and sync across your signed-in devices.</p><Link className="btn btn-primary" href="/login?next=/saved">Sign in</Link></Card>
      :items.length===0&&!error?<Card><Bookmark size={24}/><h2 className="h2">Nothing saved yet</h2><p className="muted">Use “Save profile”, “Save organization”, “Save service” or “Save mentor” while browsing the network.</p><Link className="btn btn-primary" href="/network">Discover professionals</Link></Card>
      :<div className="grid grid-2">{items.map(item=><Card key={item.item_type+":"+item.item_id}>
        <div className="row" style={{alignItems:"start"}}><div style={{flex:1,minWidth:0}}><Badge>{labels[item.item_type]}</Badge><h2 className="h2" style={{marginTop:8}}>{item.title||labels[item.item_type]}</h2>{item.subtitle&&<p className="muted">{item.subtitle}</p>}</div><button className="btn btn-ghost" type="button" aria-label={"Remove saved "+labels[item.item_type].toLowerCase()} onClick={()=>void remove(item)}><Trash2 size={16}/></button></div>
        <div className="row" style={{gap:8,marginTop:12,flexWrap:"wrap"}}><Link className="btn btn-primary" href={item.href}>Open details</Link><span className="tagline">Saved {new Date(item.created_at).toLocaleDateString()}</span></div>
      </Card>)}</div>}
  </main>;
}

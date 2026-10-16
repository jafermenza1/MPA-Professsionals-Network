"use client";
import { useId, useState } from "react";
import { Plus, X } from "lucide-react";

export function TagInput({label,value,onChange,placeholder="Add one item",maxItems=40,help}:{label:string;value:string[];onChange:(next:string[])=>void;placeholder?:string;maxItems?:number;help?:string}){
 const [draft,setDraft]=useState("");
 const inputId=useId();
 function add(){const next=draft.trim();if(!next)return;if(!value.some(item=>item.toLocaleLowerCase()===next.toLocaleLowerCase())&&value.length<maxItems)onChange([...value,next]);setDraft("");}
 return <div className="grid" style={{gap:8}}>
  <label htmlFor={inputId}>{label}</label>
  <div className="row" style={{gap:8,flexWrap:"wrap"}}>
   <input id={inputId} value={draft} maxLength={180} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();add();}}} placeholder={placeholder} style={{flex:"1 1 220px"}} aria-label={label}/>
   <button type="button" className="btn btn-ghost" onClick={add} disabled={!draft.trim()||value.length>=maxItems}><Plus size={15}/> Add</button>
  </div>
  <div className="row" style={{gap:6,flexWrap:"wrap"}}>{value.map(item=><span key={item} className="tagline" style={{display:"inline-flex",alignItems:"center",gap:6}}>{item}<button type="button" aria-label={"Remove "+item} onClick={()=>onChange(value.filter(valueItem=>valueItem!==item))} style={{border:0,background:"transparent",color:"inherit",cursor:"pointer",padding:0}}><X size={13}/></button></span>)}</div>
  {help&&<span className="muted">{help}</span>}
 </div>;
}

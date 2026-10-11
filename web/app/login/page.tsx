"use client";
import {FormEvent,useState} from "react";
import {useRouter} from "next/navigation";
import {LogIn,ShieldCheck} from "lucide-react";
import {Card} from "../../components/ui";
import {api} from "../../lib/api";
import {useUiStore} from "../../lib/store";
export default function Login(){
 const router=useRouter();
 const setToken=useUiStore(s=>s.setToken); const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError("");try{const r=await api<any>("/api/v1/auth/login",{method:"POST",body:JSON.stringify({email,password})});setToken(r.token);const requested=new URLSearchParams(window.location.search).get("next");const destination=requested&&requested.startsWith("/")&&!requested.startsWith("//")?requested:"/dashboard";router.replace(destination);}catch(err){setError(err instanceof Error?err.message:"We could not sign you in. Please try again.");}finally{setBusy(false);}}
 return <div className="auth-page"><Card><div className="eyebrow">Welcome back</div><h1 className="h1">Login to your MPA workspace</h1><p className="muted">Continue applications, membership, opportunities and partner work from where you stopped.</p><form onSubmit={submit} className="form-stack"><label>Email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></label><label>Password<input required type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/></label>{error&&<div className="form-error">{error}</div>}<button className="btn btn-primary" disabled={busy}>{busy?"Signing in…":"Login"} <LogIn size={16}/></button></form><div className="auth-links"><a href="/register">Create an account</a><a href="/track">Track an existing application</a></div></Card><div className="auth-note"><ShieldCheck size={20} color="var(--primary)"/><span><b>Amanah · Trust</b><br/>Your private evidence is not exposed through public profile views.</span></div></div>
}
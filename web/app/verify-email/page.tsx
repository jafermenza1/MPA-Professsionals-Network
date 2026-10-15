"use client";
import {useEffect,useState} from "react";
import {Card} from "../../components/ui";
import {api} from "../../lib/api";

const ORGANIZATION_DRAFT_KEY="mpa.organization-registration-draft";
const DRAFT_TTL_MS=24*60*60*1000;

export default function VerifyEmail(){
 const [status,setStatus]=useState("Checking your verification link…");
 const [error,setError]=useState("");
 const [token,setToken]=useState("");
 const [busy,setBusy]=useState(false);
 const [organizationDraft,setOrganizationDraft]=useState(false);
 const [registrationReference,setRegistrationReference]=useState("");
 useEffect(()=>{
  try{
   const raw=localStorage.getItem(ORGANIZATION_DRAFT_KEY);
   if(raw){
    const draft=JSON.parse(raw);
    if(Number(draft.savedAt)>0&&Number(draft.savedAt)<=Date.now()&&Date.now()-Number(draft.savedAt)<=DRAFT_TTL_MS)setOrganizationDraft(true);
    else localStorage.removeItem(ORGANIZATION_DRAFT_KEY);
   }
  }catch{localStorage.removeItem(ORGANIZATION_DRAFT_KEY);}
  const value=new URLSearchParams(window.location.search).get("token")||"";
  setToken(value);
  if(value)void verify(value);
  else setStatus("Enter the verification token from your email link.");
 },[]);
 async function verify(value:string){
  setBusy(true);setError("");
  try{
   const result=await api<{verified:boolean;registrationReference?:string|null}>("/api/v1/auth/email-verification/verify",{method:"POST",body:JSON.stringify({token:value})});
   if(!result.verified)throw new Error("The verification service did not confirm this email address.");
   setRegistrationReference(String(result.registrationReference||""));
   setStatus("Your email is verified. You can now sign in.");
  }catch(e){setStatus("We could not verify this link.");setError(e instanceof Error?e.message:"The link may have expired or already been used.");}
  finally{setBusy(false);}
 }
 const verified=status==="Your email is verified. You can now sign in.";
 return <div className="auth-page"><Card><div className="eyebrow">Account security</div><h1 className="h1">Verify your email</h1><p className="muted">{status}</p>{error&&<div className="form-error" role="alert">{error}</div>}{verified&&<div className="form-success" role="status"><b>Email verification complete</b>{registrationReference&&<p>Registration reference: <code>{registrationReference}</code></p>}<p className="muted">Keep this human-readable reference for support and tracking. Organization approval remains a separate review decision.</p></div>}{!new URLSearchParams(typeof window==="undefined"?"":window.location.search).get("token")&&<form className="form-stack" onSubmit={e=>{e.preventDefault();void verify(token);}}><label>Verification token<input value={token} onChange={e=>setToken(e.target.value)} autoComplete="one-time-code" required/></label><button className="btn btn-primary" disabled={busy||!token}>{busy?"Verifying…":"Verify email"}</button></form>}{verified&&<a className="btn btn-primary" href={organizationDraft?"/login?next=%2Forganizations%3Fregister%3D1":"/login"}>{organizationDraft?"Sign in and finish organization registration":"Go to login"}</a>}<div className="auth-links"><a href="/login">Back to login</a></div></Card></div>;
}

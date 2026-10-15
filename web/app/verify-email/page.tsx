"use client";
import {useEffect,useState} from "react";
import {Card} from "../../components/ui";
import {api} from "../../lib/api";

export default function VerifyEmail(){
 const [status,setStatus]=useState("Checking your verification link…");
 const [error,setError]=useState("");
 const [token,setToken]=useState("");
 const [busy,setBusy]=useState(false);
 const [organizationDraft,setOrganizationDraft]=useState(false);
 useEffect(()=>{
   try{setOrganizationDraft(Boolean(localStorage.getItem("mpa-organization-registration-draft")));}catch{}
   const value=new URLSearchParams(window.location.search).get("token")||"";
   setToken(value);
   if(value)void verify(value);
   else setStatus("Enter the verification token from your email link.");
 },[]);
 async function verify(value:string){
   setBusy(true);setError("");
   try{await api("/api/v1/auth/email-verification/verify",{method:"POST",body:JSON.stringify({token:value})});setStatus("Your email is verified. You can now sign in.");}
   catch(e){setStatus("We could not verify this link.");setError(e instanceof Error?e.message:"The link may have expired or already been used.");}
   finally{setBusy(false);}
 }
 return <div className="auth-page"><Card><div className="eyebrow">Account security</div><h1 className="h1">Verify your email</h1><p className="muted">{status}</p>{error&&<div className="form-error" role="alert">{error}</div>}{!token&&<form className="form-stack" onSubmit={e=>{e.preventDefault();void verify(token);}}><label>Verification token<input value={token} onChange={e=>setToken(e.target.value)} autoComplete="one-time-code" required/></label><button className="btn btn-primary" disabled={busy||!token}>{busy?"Verifying…":"Verify email"}</button></form>}{status==="Your email is verified. You can now sign in."&&<a className="btn btn-primary" href={organizationDraft?"/login?next=%2Forganizations%3Fregister%3D1":"/login"}>{organizationDraft?"Sign in and finish organization registration":"Go to login"}</a>}<div className="auth-links"><a href="/login">Back to login</a></div></Card></div>;
}

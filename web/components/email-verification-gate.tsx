"use client";

import {FormEvent,useState} from "react";
import Link from "next/link";
import {CheckCircle2,MailCheck,RefreshCw,ShieldCheck} from "lucide-react";
import {Card} from "./ui";
import {api,ApiError} from "../lib/api";

type Props={email:string;message:string;developmentVerificationUrl?:string};
type ResendResult={accepted:boolean;developmentVerificationUrl?:string};

export function EmailVerificationGate({email,message,developmentVerificationUrl}:Props){
 const [address,setAddress]=useState(email);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [localUrl,setLocalUrl]=useState(developmentVerificationUrl||"");
 async function resend(event:FormEvent){
  event.preventDefault();setBusy(true);setError("");setNotice("");
  try{
   const result=await api<ResendResult>("/api/v1/auth/email-verification/resend",{method:"POST",body:JSON.stringify({email:address.trim()})});
   setLocalUrl(result.developmentVerificationUrl||"");
   setNotice("If this address needs verification, a fresh link has been requested. Check the inbox and spam folder. Previous links may no longer work.");
  }catch(cause){setError(cause instanceof ApiError?cause.message:"We could not request a verification email. Please try again.");}
  finally{setBusy(false);}
 }
 return <div className="auth-page verification-gate"><Card>
  <div className="eyebrow">Account activation</div>
  <div className="verification-gate__icon" aria-hidden="true"><MailCheck size={26}/></div>
  <h1 className="h1">Verify your email to continue</h1>
  <p className="muted">{message}</p>
  <ol className="verification-gate__steps">
   <li><b>Open the link</b><span>Use the latest verification email sent to the address below.</span></li>
   <li><b>Return to MPA</b><span>After verification, sign in to continue. Your membership application remains a separate review process.</span></li>
  </ol>
  <form className="form-stack" onSubmit={resend}>
   <label>Email used to register<input type="email" required autoComplete="email" value={address} onChange={event=>setAddress(event.target.value)} placeholder="you@example.org"/></label>
   <button className="btn btn-primary" type="submit" disabled={busy||!address.trim()}><RefreshCw size={16}/>{busy?"Requesting link…":"Resend verification link"}</button>
  </form>
  {error?<p className="form-error" role="alert">{error}</p>:null}
  {notice?<p className="form-success" role="status" aria-live="polite">{notice}</p>:null}
  {localUrl?<p><a className="btn btn-ghost" href={localUrl}><CheckCircle2 size={16}/> Open local verification link</a></p>:null}
  <div className="verification-gate__trust"><ShieldCheck size={17}/><span>Until verified, the account cannot sign in or access private MPA services.</span></div>
  <div className="auth-links"><Link href="/verify-email">Enter a verification token</Link><Link href="/login">Back to sign in</Link></div>
 </Card></div>;
}

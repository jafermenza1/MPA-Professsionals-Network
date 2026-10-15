"use client";
import {FormEvent,useState} from "react";
import {useRouter} from "next/navigation";
import {Fingerprint,KeyRound,LogIn,ShieldCheck} from "lucide-react";
import {Card} from "../../components/ui";
import {api} from "../../lib/api";
import {useUiStore} from "../../lib/store";

function fromB64url(value:string):Uint8Array{
 const normalized=value.replace(/-/g,"+").replace(/_/g,"/");
 const binary=atob(normalized+"=".repeat((4-normalized.length%4)%4));
 return Uint8Array.from(binary,char=>char.charCodeAt(0));
}
function toB64url(value:ArrayBuffer):string{
 const bytes=new Uint8Array(value);let binary="";
 for(const byte of bytes)binary+=String.fromCharCode(byte);
 return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function serializeAssertion(credential:PublicKeyCredential){
 const response=credential.response as AuthenticatorAssertionResponse;
 return {id:credential.id,rawId:toB64url(credential.rawId),type:credential.type,response:{
  clientDataJSON:toB64url(response.clientDataJSON),authenticatorData:toB64url(response.authenticatorData),
  signature:toB64url(response.signature),userHandle:response.userHandle?toB64url(response.userHandle):null
 }};
}
type PasskeyOptions={publicKey:{challenge:string;rpId:string;timeout:number;userVerification:UserVerificationRequirement;allowCredentials:Array<{type:"public-key";id:string;transports?:AuthenticatorTransport[]}>}};
export default function Login(){
 const router=useRouter();
 const setToken=useUiStore(s=>s.setToken);
 const [email,setEmail]=useState("");
 const [password,setPassword]=useState("");
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [passkeyBusy,setPasskeyBusy]=useState(false);
 const [recoveryMode,setRecoveryMode]=useState(false);
 const [recoveryCode,setRecoveryCode]=useState("");
 async function finishLogin(token:string,passkeyEnrollmentRequired=false){
   setToken(token);
   if(passkeyEnrollmentRequired){router.replace("/admin/security?enroll=1");return;}
   const requested=new URLSearchParams(window.location.search).get("next");
   const destination=requested&&requested.startsWith("/")&&!requested.startsWith("//")?requested:"/dashboard";
   router.replace(destination);
 }
 async function submit(e:FormEvent){
   e.preventDefault();setBusy(true);setError("");
   try{const r=await api<any>("/api/v1/auth/login",{method:"POST",body:JSON.stringify({email,password})});await finishLogin(r.token,Boolean(r.passkeyEnrollmentRequired));}
   catch(err){setError(err instanceof Error?err.message:"We could not sign you in. Please try again.");}
   finally{setBusy(false);}
 }
 async function signInWithPasskey(){
   setPasskeyBusy(true);setError("");
   try{
     if(!email.includes("@"))throw new Error("Enter the administrator email address to use passkey sign-in.");
     if(!window.isSecureContext||!navigator.credentials||!("PublicKeyCredential" in window))throw new Error("Passkeys require a supported browser and HTTPS (localhost is allowed for development).");
     const options=await api<PasskeyOptions>("/api/v1/auth/passkeys/options",{method:"POST",body:JSON.stringify({email})});
     const publicKey:PublicKeyCredentialRequestOptions={...options.publicKey,challenge:fromB64url(options.publicKey.challenge),allowCredentials:options.publicKey.allowCredentials.map(item=>({...item,id:fromB64url(item.id)}))};
     const credential=await navigator.credentials.get({publicKey}) as PublicKeyCredential|null;
     if(!credential)throw new Error("Passkey sign-in was cancelled.");
     const result=await api<{token:string}>("/api/v1/auth/passkeys/verify",{method:"POST",body:JSON.stringify({email,credential:serializeAssertion(credential)})});
     await finishLogin(result.token);
   }catch(err){setError(err instanceof Error?err.message:"Passkey sign-in failed.");}
   finally{setPasskeyBusy(false);}
 }
 async function recover(e:FormEvent){
   e.preventDefault();setBusy(true);setError("");
   try{const result=await api<{token:string}>("/api/v1/auth/passkeys/recovery",{method:"POST",body:JSON.stringify({email,code:recoveryCode})});setToken(result.token);router.replace("/admin/security?recovery=1");}
   catch(err){setError(err instanceof Error?err.message:"Recovery could not be completed.");}
   finally{setBusy(false);}
 }
 async function resendVerification(){
   setBusy(true);setError("");
   try{const result=await api<{developmentVerificationUrl?:string}>("/api/v1/auth/email-verification/resend",{method:"POST",body:JSON.stringify({email})});setError(result.developmentVerificationUrl?"Development verification link: "+result.developmentVerificationUrl:"If this address needs verification, a new link has been requested. Check your inbox and spam folder.");}
   catch(err){setError(err instanceof Error?err.message:"Could not request a verification link.");}
   finally{setBusy(false);}
 }
 return <div className="auth-page"><Card><div className="eyebrow">Welcome back</div><h1 className="h1">Login to your MPA workspace</h1><p className="muted">Continue applications, membership, opportunities and partner work from where you stopped.</p><form onSubmit={recoveryMode?recover:submit} className="form-stack"><label>Email or username<input required type="text" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" placeholder="you@example.org or your username"/></label>{!recoveryMode&&<><label>Password<input required type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/></label>{error&&<div className="form-error" role="alert">{error}</div>}<button className="btn btn-primary" disabled={busy}>{busy?"Signing in…":"Login with password"} <LogIn size={16}/></button><button type="button" className="btn btn-ghost" onClick={()=>void signInWithPasskey()} disabled={passkeyBusy||busy||!email.trim()}><Fingerprint size={16}/>{passkeyBusy?"Waiting for passkey…":"Sign in with administrator passkey"}</button><button type="button" className="btn btn-ghost" onClick={()=>void resendVerification()} disabled={busy||!email.includes("@")}>Resend email verification link</button><button type="button" className="btn btn-ghost" onClick={()=>{setRecoveryMode(true);setError("");}}>Use a passkey recovery code</button></>}{recoveryMode&&<><label>One-time recovery code<input required value={recoveryCode} onChange={e=>setRecoveryCode(e.target.value)} autoComplete="one-time-code" spellCheck={false}/></label>{error&&<div className="form-error" role="alert">{error}</div>}<p className="muted">Recovery codes create a restricted session only for registering a replacement administrator passkey. They do not grant normal administrator access by themselves.</p><button className="btn btn-primary" disabled={busy}>{busy?"Recovering…":"Recover passkey access"} <KeyRound size={16}/></button><button type="button" className="btn btn-ghost" onClick={()=>{setRecoveryMode(false);setError("");}}>Back to login</button></>}</form><div className="footer-note"><ShieldCheck size={15}/> Administrator passkeys require device verification and are checked by the server.</div><div className="auth-links"><a href="/register">Create an account</a><a href="/track">Track an existing application</a></div></Card><div className="auth-note"><ShieldCheck size={20} color="var(--primary)"/><span><b>Amanah · Trust</b><br/>Your private evidence is not exposed through public profile views.</span></div></div>;
}

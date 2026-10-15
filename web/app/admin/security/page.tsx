"use client";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {Fingerprint,KeyRound,RefreshCw,ShieldCheck,Trash2} from "lucide-react";
import {Card} from "../../../components/ui";
import {api} from "../../../lib/api";
import {useUiStore} from "../../../lib/store";

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
type RegistrationOptions={publicKey:{challenge:string;rp:{id:string;name:string};user:{id:string;name:string;displayName:string};pubKeyCredParams:PublicKeyCredentialParameters[];timeout:number;attestation:AttestationConveyancePreference;authenticatorSelection:AuthenticatorSelectionCriteria;excludeCredentials:Array<{type:"public-key";id:string;transports?:AuthenticatorTransport[]}>}};
type PasskeyRow={id:string;display_name:string;created_at:string;last_used_at:string|null;transports:string[]};
type RegistrationResult={registered:boolean;recoveryCodes:string[];warning:string};
export default function AdminSecurity(){
 const router=useRouter();
 const token=useUiStore(s=>s.token),hydrated=useUiStore(s=>s.hydrated);
 const [rows,setRows]=useState<PasskeyRow[]>([]);
 const [recoveryMode,setRecoveryMode]=useState(false);
 const [enrollmentMode,setEnrollmentMode]=useState(false);
 const [recoveryCodes,setRecoveryCodes]=useState<string[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [name,setName]=useState("Administrator passkey");
 async function load(){
   if(!token)return;
   try{setRows(await api<PasskeyRow[]>("/api/v1/admin/passkeys",{},token));}
   catch(e){setError(e instanceof Error?e.message:"Could not load passkeys.");}
 }
 useEffect(()=>{
   if(typeof window!=="undefined"){const query=new URLSearchParams(window.location.search);if(query.get("recovery")==="1")setRecoveryMode(true);if(query.get("enroll")==="1")setEnrollmentMode(true);}
 },[]);
 useEffect(()=>{if(hydrated&&!token)router.replace("/login?next=/admin/security");},[hydrated,token,router]);
 useEffect(()=>{const query=typeof window!=="undefined"?new URLSearchParams(window.location.search):null;const restrictedSetup=query?.get("recovery")==="1"||query?.get("enroll")==="1";if(token&&!recoveryMode&&!enrollmentMode&&!restrictedSetup)void load();},[token,recoveryMode,enrollmentMode]);
 async function registerPasskey(){
   setBusy(true);setError("");setMessage("");setRecoveryCodes([]);
   try{
     if(!window.isSecureContext||!navigator.credentials||!("PublicKeyCredential" in window))throw new Error("Passkeys require a supported browser and HTTPS (localhost is allowed for development).");
     const options=await api<RegistrationOptions>("/api/v1/admin/passkeys/registration/options",{method:"POST"},token);
     const publicKey:PublicKeyCredentialCreationOptions={...options.publicKey,challenge:fromB64url(options.publicKey.challenge),user:{...options.publicKey.user,id:fromB64url(options.publicKey.user.id)},excludeCredentials:options.publicKey.excludeCredentials.map(item=>({...item,id:fromB64url(item.id)}))};
     const credential=await navigator.credentials.create({publicKey}) as PublicKeyCredential|null;
     if(!credential)throw new Error("Passkey registration was cancelled.");
     const response=credential.response as AuthenticatorAttestationResponse;
     const result=await api<RegistrationResult>("/api/v1/admin/passkeys/registration/verify",{method:"POST",body:JSON.stringify({id:credential.id,rawId:toB64url(credential.rawId),type:credential.type,displayName:name,response:{clientDataJSON:toB64url(response.clientDataJSON),attestationObject:toB64url(response.attestationObject),transports:typeof response.getTransports==="function"?response.getTransports():[]}})},token);
     setRecoveryCodes(result.recoveryCodes||[]);
     setMessage(result.warning||"Passkey registered. Sign in again with the passkey to continue.");
   }catch(e){setError(e instanceof Error?e.message:"Could not register passkey.");}
   finally{setBusy(false);}
 }
 async function revoke(id:string){
   if(!window.confirm("Revoke this passkey? It will no longer be accepted for administrator sign-in."))return;
   setBusy(true);setError("");setMessage("");
   try{await api("/api/v1/admin/passkeys/"+encodeURIComponent(id),{method:"DELETE"},token);await load();setMessage("Passkey revoked.");}
   catch(e){setError(e instanceof Error?e.message:"Could not revoke passkey.");}
   finally{setBusy(false);}
 }
 return <div className="grid" style={{gap:18}}><div><div className="eyebrow">Account security</div><h1 className="h1">Administrator passkeys</h1><p className="muted">Passkeys use the browser's WebAuthn API. The server verifies the challenge, origin, relying-party ID, user verification and credential signature. Enrolled administrator accounts cannot use password-only sign-in.</p></div>{error&&<div className="form-error" role="alert">{error}</div>}{message&&<Card><p>{message}</p></Card>}{recoveryCodes.length>0&&<Card><h2 className="h2">Save your recovery codes now</h2><p className="muted">Each code works once and creates a restricted session for adding a replacement passkey. These codes will not be shown again.</p><div className="grid grid-2">{recoveryCodes.map(code=><code key={code} style={{padding:10,border:"1px solid var(--border)",borderRadius:8}}>{code}</code>)}</div><button className="btn btn-ghost" onClick={()=>void navigator.clipboard.writeText(recoveryCodes.join("\n"))}>Copy recovery codes</button><p className="muted">After registration, sign out and sign in with the new passkey to regain full administrator access.</p></Card>}{recoveryMode||enrollmentMode?<Card><KeyRound size={24}/><h2 className="h2">{recoveryMode?"Recover administrator access":"Secure your administrator account"}</h2><p className="muted">{recoveryMode?"Your recovery code created a restricted session. Register a replacement passkey now. Other administrator operations remain blocked until you sign in with that passkey.":"A passkey is required before you can use platform administration. Register it now; you will then sign in with the passkey to continue."}</p><label>Passkey name<input value={name} onChange={e=>setName(e.target.value)} maxLength={80}/></label><button className="btn btn-primary" onClick={()=>void registerPasskey()} disabled={busy}><Fingerprint size={16}/>{busy?"Registering…":recoveryMode?"Register replacement passkey":"Register administrator passkey"}</button></Card>:<><Card><h2 className="h2">Register a passkey</h2><p className="muted">Use a device PIN, fingerprint, face recognition, password manager, or hardware security key. Register a second passkey before revoking an existing one.</p><label>Passkey name<input value={name} onChange={e=>setName(e.target.value)} maxLength={80}/></label><button className="btn btn-primary" onClick={()=>void registerPasskey()} disabled={busy}><Fingerprint size={16}/>{busy?"Registering…":"Add passkey"}</button></Card><Card><div className="row"><h2 className="h2">Active passkeys</h2><button className="btn btn-ghost" onClick={()=>void load()} disabled={busy}><RefreshCw size={16}/> Refresh</button></div>{rows.length===0?<p className="muted">No active passkeys are registered yet.</p>:<div className="grid">{rows.map(row=><div key={row.id} className="row" style={{borderBottom:"1px solid var(--border)",padding:"12px 0"}}><div style={{flex:1}}><b>{row.display_name}</b><p className="muted">Added {new Date(row.created_at).toLocaleString()} · Last used {row.last_used_at?new Date(row.last_used_at).toLocaleString():"Never"}</p></div><button className="btn btn-ghost" onClick={()=>void revoke(row.id)} disabled={busy}><Trash2 size={16}/> Revoke</button></div>)}</div>}</Card></>}</div>;
}

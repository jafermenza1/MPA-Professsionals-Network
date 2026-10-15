"use client";
import {FormEvent,useEffect,useState} from "react";
import {ArrowRight,Building2,RefreshCw,UserRound} from "lucide-react";
import {Card} from "../../components/ui";
import {api} from "../../lib/api";
import {useUiStore} from "../../lib/store";

const ORGANIZATION_DRAFT_KEY="mpa.organization-registration-draft";
const DRAFT_TTL_MS=24*60*60*1000;
type AccountKind="professional"|"organization";
type RegistrationForm={email:string;password:string;passwordConfirm:string;firstName:string;middleName:string;lastName:string;displayName:string;phone:string;nationality:string;orgLegalName:string;orgDisplayName:string;orgType:string;orgDescription:string;orgWebsite:string;orgEmail:string;orgPhone:string;orgAddress:string};
const initialForm:RegistrationForm={email:"",password:"",passwordConfirm:"",firstName:"",middleName:"",lastName:"",displayName:"",phone:"",nationality:"Ethiopian",orgLegalName:"",orgDisplayName:"",orgType:"",orgDescription:"",orgWebsite:"",orgEmail:"",orgPhone:"",orgAddress:""};
type RegistrationSuccess={email:string;displayName:string};

export default function Register(){
 const setToken=useUiStore(s=>s.setToken);
 const [form,setForm]=useState<RegistrationForm>(initialForm);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [registered,setRegistered]=useState<RegistrationSuccess|null>(null);
 const [kind,setKind]=useState<AccountKind>("professional");
 const [challenge,setChallenge]=useState<{id:string;question:string;expiresAt:string}|null>(null);
 const [challengeAnswer,setChallengeAnswer]=useState("");
 const [challengeBusy,setChallengeBusy]=useState(false);
 const [verificationMessage,setVerificationMessage]=useState("");
 const [verificationUrl,setVerificationUrl]=useState("");
 const set=(k:keyof RegistrationForm,v:string)=>setForm(f=>({...f,[k]:v}));

 async function loadChallenge(){
  setChallengeBusy(true);setChallengeAnswer("");setChallenge(null);
  try{setChallenge(await api<{id:string;question:string;expiresAt:string}>("/api/v1/auth/human-challenge"));}
  catch(err){setError(err instanceof Error?err.message:"Could not load the human check.");}
  finally{setChallengeBusy(false);}
 }
 useEffect(()=>{void loadChallenge();},[]);

 function saveOrganizationDraft(){
  const draft={legalName:form.orgLegalName.trim(),displayName:form.orgDisplayName.trim(),organizationType:form.orgType.trim(),description:form.orgDescription.trim(),website:form.orgWebsite.trim(),email:form.orgEmail.trim(),phone:form.orgPhone.trim(),addressText:form.orgAddress.trim(),savedAt:Date.now()};
  localStorage.setItem(ORGANIZATION_DRAFT_KEY,JSON.stringify(draft));
 }

 async function submit(e:FormEvent){
  e.preventDefault();setError("");setVerificationMessage("");setVerificationUrl("");
  if(form.password!==form.passwordConfirm){setError("Passwords do not match.");return;}
  if(!form.firstName.trim()||!form.lastName.trim()){setError("Enter the representative's first and last/family names.");return;}
  if(kind==="professional"&&(!form.displayName.trim()||!form.phone.trim())){setError("Enter your display name and phone number.");return;}
  if(kind==="organization"&&(!form.orgLegalName.trim()||!form.orgDisplayName.trim()||!form.orgType.trim()||!form.orgAddress.trim()||!form.orgEmail.trim()||!form.orgPhone.trim())){setError("Complete the required organization name, type, address, work email and contact phone fields.");return;}
  setBusy(true);
  try{
   if(!challenge)throw new Error("Load a new human check before registering.");
   const proof=await api<{token:string}>("/api/v1/auth/human-challenge/verify",{method:"POST",body:JSON.stringify({id:challenge.id,answer:challengeAnswer})});
   if(kind==="organization")saveOrganizationDraft();
   const representativeName=[form.firstName,form.middleName,form.lastName].map(x=>x.trim()).filter(Boolean).join(" ");
   const payload={email:form.email.trim(),password:form.password,passwordConfirmation:form.passwordConfirm,humanCheckToken:proof.token,firstName:form.firstName.trim(),middleName:form.middleName.trim(),lastName:form.lastName.trim(),displayName:kind==="organization"?representativeName:form.displayName.trim(),phone:kind==="professional"?form.phone.trim():form.orgPhone.trim(),nationality:form.nationality};
   const r=await api<any>("/api/v1/auth/register",{method:"POST",body:JSON.stringify(payload)});
   if(r.verificationRequired){
    setVerificationMessage(r.verificationSent?"Your representative account was created. Verify the representative's email before signing in; check your inbox and spam folder.":"Your account was created, but email delivery was not confirmed. Use the resend option on the login page, or use the development link if one is provided.");
    setVerificationUrl(String(r.developmentVerificationUrl||""));
    return;
   }
   if(!r.token)throw new Error("Registration did not return a session or verification instructions.");
   setToken(r.token);
   setRegistered({email:String(r.user?.email||form.email),displayName:String(r.person?.display_name||payload.displayName)});
  }catch(err){
   setError(err instanceof Error?err.message:"Registration failed.");
   void loadChallenge();
  }finally{setBusy(false);}
 }

 if(verificationMessage)return <div className="auth-page"><Card><div className="eyebrow">Email verification</div><h1 className="h1">Check your email</h1><p className="muted">{verificationMessage}</p><p className="muted">Your application reference will be shown after your email is verified. Organization approval is a separate review decision.</p>{verificationUrl&&<p><a className="btn btn-primary" href={verificationUrl}>Verify email (development only)</a></p>}<div className="auth-links"><a href="/login">Continue to login</a></div></Card></div>;

 if(registered)return <div className="auth-page"><Card><div className="eyebrow">Account registration</div><h1 className="h1">Your account was created successfully.</h1><div className="form-success" role="status"><b>Registration confirmed</b><p>Welcome, {registered.displayName}. Your account is ready and you are signed in.</p></div><div className="grid" style={{gap:10,marginTop:16}}><p><b>Account status</b><br/><code>Account created</code></p><p><b>Email</b><br/>{registered.email}</p><p className="muted">Membership or organization approval is a separate process from account creation and email verification.</p></div><div className="grid grid-2" style={{marginTop:18}}><a className="btn btn-primary" href="/dashboard">Open my dashboard <ArrowRight size={16}/></a><a className="btn btn-ghost" href={kind==="professional"?"/membership":"/organizations?register=1"}>{kind==="professional"?"Continue to membership":"Review organization registration"} <ArrowRight size={16}/></a></div></Card></div>;

 return <div className="auth-page"><Card><div className="eyebrow">Join the ecosystem</div><h1 className="h1">Create your account</h1><p className="muted">Choose an account type. Professional registration keeps the existing personal profile flow. Organization registration creates the representative account first, then lets the verified representative review and submit the organization profile.</p><div className="choice-grid" style={{marginBottom:18}}><button type="button" className={kind==="professional"?"choice active":"choice"} onClick={()=>setKind("professional")}><UserRound/><b>Professional</b><span>Create a personal profile and continue to membership tracking.</span></button><button type="button" className={kind==="organization"?"choice active":"choice"} onClick={()=>setKind("organization")}><Building2/><b>Organization</b><span>Create a representative account and prepare an organization application.</span></button></div>
 <form onSubmit={submit} className="form-stack">
  <div className="form-grid"><label>First name<input required autoComplete="given-name" value={form.firstName} onChange={e=>set("firstName",e.target.value)}/></label><label>Middle / father name<input required={kind==="organization"} value={form.middleName} onChange={e=>set("middleName",e.target.value)}/></label><label>Last / grandfather name<input required autoComplete="family-name" value={form.lastName} onChange={e=>set("lastName",e.target.value)}/></label></div>
  {kind==="professional"&&<><label>Display name<input required value={form.displayName} onChange={e=>set("displayName",e.target.value)}/></label><div className="form-grid"><label>Email<input required type="email" autoComplete="email" value={form.email} onChange={e=>set("email",e.target.value)}/></label><label>Phone<input required autoComplete="tel" value={form.phone} onChange={e=>set("phone",e.target.value)}/></label></div></>}
  {kind==="organization"&&<section className="form-stack" aria-label="Organization application details"><h2 className="h2">Representative and organization details</h2><label>Representative work email<input required type="email" autoComplete="email" value={form.email} onChange={e=>set("email",e.target.value)}/></label><p className="muted">The representative's email is used to verify and sign in to the account. Organization approval happens separately after profile submission and review.</p><label>Legal or registered organization name<input required value={form.orgLegalName} onChange={e=>set("orgLegalName",e.target.value)}/></label><label>Public/display name<input required value={form.orgDisplayName} onChange={e=>set("orgDisplayName",e.target.value)}/></label><div className="form-grid"><label>Organization type<input required value={form.orgType} onChange={e=>set("orgType",e.target.value)} placeholder="Company, NGO, institution…"/></label><label>Registered location / address<input required value={form.orgAddress} onChange={e=>set("orgAddress",e.target.value)}/></label><label>Organization work email<input required type="email" value={form.orgEmail} onChange={e=>set("orgEmail",e.target.value)}/></label><label>Organization phone<input required value={form.orgPhone} onChange={e=>set("orgPhone",e.target.value)}/></label></div><label>Website (optional)<input type="url" value={form.orgWebsite} onChange={e=>set("orgWebsite",e.target.value)}/></label><label>Description (optional)<textarea value={form.orgDescription} onChange={e=>set("orgDescription",e.target.value)} rows={3}/></label><p className="muted">Organization details are saved in this browser for up to 24 hours while you verify your representative email. After verification and sign-in, review and submit them from the organization workspace. Private evidence is uploaded in the separate verification workflow.</p></section>}
  <div className="form-grid"><label>Password<input required minLength={10} type="password" autoComplete="new-password" value={form.password} onChange={e=>set("password",e.target.value)}/></label><label>Confirm password<input required minLength={10} type="password" autoComplete="new-password" value={form.passwordConfirm} onChange={e=>set("passwordConfirm",e.target.value)}/></label></div><p className="muted">Use at least 10 characters. If you already have an account, sign in instead of registering again.</p>
  <div className="form-stack" style={{border:"1px solid var(--border)",borderRadius:12,padding:14}}><b>Verify you are human</b>{challenge?<label>{challenge.question}<input required inputMode="numeric" value={challengeAnswer} onChange={e=>setChallengeAnswer(e.target.value)} autoComplete="off" placeholder="Enter your answer"/></label>:<p className="muted">Loading human check…</p>}<button type="button" className="btn btn-ghost" onClick={()=>void loadChallenge()} disabled={challengeBusy}><RefreshCw size={16}/>{challengeBusy?"Loading…":"Get a new question"}</button></div>
  {error&&<div className="form-error" role="alert">{error}</div>}<button className="btn btn-primary" disabled={busy||!challenge}>{busy?"Creating account…":kind==="professional"?"Create professional account":"Create representative account and continue"} <ArrowRight size={16}/></button>
 </form><div className="auth-links"><a href="/login">Already have an account? Login</a></div></Card></div>;
}

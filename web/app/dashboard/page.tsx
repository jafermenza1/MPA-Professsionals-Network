"use client";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {ArrowRight,ArrowUpRight,BriefcaseBusiness,Building2,CheckCircle2,ClipboardList,Clock3,FileCheck2,LayoutDashboard,LogOut,RefreshCw,ShieldCheck,UserRound,UsersRound,WalletCards} from "lucide-react";
import {Badge} from "../../components/ui";
import {api,ApiError} from "../../lib/api";
import {useUiStore} from "../../lib/store";
import styles from "./dashboard.module.css";

type Profile={user_id:string;email:string;display_name?:string;first_name?:string;last_name?:string;completion_percent?:number;status?:string;roles?:string[];has_active_membership?:boolean;visibility?:string};
type MembershipApplication={id:string;tracking_reference?:string;application_type?:string;status:string;updated_at?:string;fee_snapshot?:{amount?:number|string;currency?:string;productName?:string;productCode?:string};payment?:{status?:string;amount?:number|string;currency?:string;verified_at?:string}|null;latest_correction?:{status?:string;reviewer_note?:string;requested_fields?:unknown}|null};
type VerificationSummary={id:string;status:string;program_name?:string;program_code?:string;claims?:{claim_code?:string;claim_type_name?:string;status:string}[];checklist_version_snapshot?:{items?:{itemCode?:string;label?:string;required?:boolean}[]}[];checkResults?:{item_code?:string;label?:string;required?:boolean;outcome?:string}[]};
type MemberClarity={applications:MembershipApplication[];cases:VerificationSummary[];profileVisibility:string;profileLoaded:boolean;verifiedClaims:string[];missingRequirements:string[]};
type TrackingItem={id:string;type:string;title:string;subtitle?:string;status:string;statusLabel?:string;updatedAt?:string;nextAction?:string};
type Tracking={summary?:{total?:number;active?:number;nextSteps?:number;memberships?:number;organizations?:number;jobApplications?:number};items?:TrackingItem[];attentionItems?:TrackingItem[];hasMore?:boolean;limit?:number;offset?:number};
type Outcomes={jobs?:unknown[];services?:{id:string;status:string;service_title?:string;participant_role?:string}[];mentorships?:{id:string;status:string;participant_role?:string}[];inquiries?:{id:string;status:string;subject?:string;participant_role?:string}[]};
type Organization={id:string;legal_name:string;display_name:string;verification_status?:string;role_code:string};
type OrganizationPulse={organization:Organization;applications:number;activePipeline:number;openJobs:number;hires:number};
type ReviewQueueItem={id:string;title:string;status:string;reason:string;action:string;href:string;priority:"Urgent"|"High"|"Standard";deadline?:string|null;history:string;updatedAt?:string};
type ReviewQueue={label:string;href:string;count:number;icon:"membership"|"verification"|"organization"|"appeal";items:ReviewQueueItem[]};
type DashboardData={profile:Profile;tracking:Tracking|null;outcomes:Outcomes|null;organizations:Organization[];reviewQueues:ReviewQueue[];memberClarity:MemberClarity|null;errors:string[]};

const roleLabels:Record<string,string>={member:"Professional member",mentor:"Mentor",mentee:"Mentee",reviewer:"Workflow reviewer",verification_reviewer:"Verification reviewer",ethics_reviewer:"Ethics reviewer",appeal_reviewer:"Appeal reviewer",finance_officer:"Finance officer",system_admin:"Platform administrator",super_admin:"Super administrator",admin:"Administrator",field_officer:"Field officer",project_manager:"Project manager",content_manager:"Content manager",event_manager:"Event manager",learning_admin:"Learning administrator"};
const terminalStatuses=new Set(["completed","cancelled","closed","rejected","withdrawn","hired","activated"]);

function roleName(role:string){return roleLabels[role]||role.replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase());}
function responseCount(value:unknown){return Array.isArray(value)?value.length:0;}

export default function Dashboard(){
  const router=useRouter();
  const token=useUiStore(state=>state.token),hydrated=useUiStore(state=>state.hydrated),clearToken=useUiStore(state=>state.clearToken);
  const [data,setData]=useState<DashboardData|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [selectedOrganizationId,setSelectedOrganizationId]=useState("");
  const [organizationPulse,setOrganizationPulse]=useState<OrganizationPulse|null>(null);
  const [organizationLoading,setOrganizationLoading]=useState(false);
  const [organizationError,setOrganizationError]=useState("");

  async function load(){
    if(!token)return;
    setLoading(true);setError("");
    try{
      const profile=await api<Profile>("/api/v1/me",{},token);
      const roles=profile.roles||[];
      const core=await Promise.allSettled([
        api<Tracking>("/api/v1/me/application-tracking?limit=5",{},token),
        api<Outcomes>("/api/v1/me/outcomes",{},token),
        api<Organization[]>("/api/v1/organizations",{},token)
      ]);
      const errors:string[]=[];
      const isProfessional=roles.some(role=>["member","professional"].includes(role));
      let memberClarity:MemberClarity|null=null;
      if(isProfessional){
        const memberResults=await Promise.allSettled([
          api<MembershipApplication[]>("/api/v1/membership/applications/me",{},token),
          api<{items?:VerificationSummary[]}|VerificationSummary[]>("/api/v1/me/verification/cases",{},token),
          api<{visibility?:string}>("/api/v1/me/talent-profile",{},token)
        ]);
        const applications=memberResults[0].status==="fulfilled"&&Array.isArray(memberResults[0].value)?memberResults[0].value:[];
        const rawCases=memberResults[1].status==="fulfilled"?(Array.isArray(memberResults[1].value)?memberResults[1].value:memberResults[1].value.items||[]):[];
        const caseDetails=await Promise.allSettled(rawCases.slice(0,10).map(row=>api<VerificationSummary>("/api/v1/verification/cases/"+encodeURIComponent(row.id),{},token)));
        const cases=rawCases.map((row,index)=>caseDetails[index]?.status==="fulfilled"?caseDetails[index].value:row);
        const verifiedClaims=[...new Set(cases.flatMap(row=>(row.claims||[]).filter(claim=>claim.status==="verified").map(claim=>claim.claim_type_name||claim.claim_code||"Verified professional claim")))];
        const missingRequirements=[...new Set(cases.flatMap(row=>{const passed=new Set((row.checkResults||[]).filter(check=>["pass","not_applicable"].includes(String(check.outcome))).map(check=>check.item_code));return (row.checklist_version_snapshot||[]).flatMap(checklist=>(checklist.items||[]).filter(item=>item.required&&!passed.has(item.itemCode)).map(item=>item.label||item.itemCode||"Required verification item"));}))];
        memberClarity={applications,cases,profileVisibility:memberResults[2].status==="fulfilled"?String(memberResults[2].value.visibility||"private"):"private",profileLoaded:memberResults[2].status==="fulfilled",verifiedClaims,missingRequirements};
        if(memberResults.some(result=>result.status==="rejected"))errors.push("Membership or verification details");
      }
      const tracking=core[0].status==="fulfilled"?core[0].value:null;
      const outcomes=core[1].status==="fulfilled"?core[1].value:null;
      const organizations=core[2].status==="fulfilled"?core[2].value:[];
      setSelectedOrganizationId(current=>organizations.some(org=>org.id===current)?current:organizations[0]?.id||"");
      if(core[0].status==="rejected")errors.push("Application tracking");
      if(core[1].status==="rejected")errors.push("Personal outcomes");
      if(core[2].status==="rejected")errors.push("Organization memberships");

      const queueRequests:{label:string;href:string;icon:ReviewQueue["icon"];request:Promise<unknown>;count:(value:any)=>number;kind:"membership"|"verification"|"organization"|"appeal"|"marketplace"|"demand"}[]=[];
      if(roles.some(role=>["reviewer","finance_officer","system_admin"].includes(role)))queueRequests.push({label:"Membership review",href:"/membership",icon:"membership",kind:"membership",request:api<any[]>("/api/v1/review/membership/applications",{},token),count:responseCount});
      if(roles.some(role=>["verification_reviewer","ethics_reviewer","system_admin"].includes(role)))queueRequests.push({label:"Verification cases",href:"/verification",icon:"verification",kind:"verification",request:api<{items?:any[]}>((roles.includes("system_admin")?"/api/v1/review/verification/cases":"/api/v1/review/verification/cases?reviewerId="+encodeURIComponent(profile.user_id)),{},token),count:value=>responseCount(value?.items)});
      if(roles.some(role=>["reviewer","system_admin"].includes(role)))queueRequests.push({label:"Organization verification",href:"/organizations",icon:"organization",kind:"organization",request:api<any[]>("/api/v1/review/organizations",{},token),count:responseCount});
      if(roles.some(role=>["appeal_reviewer","system_admin"].includes(role)))queueRequests.push({label:"Independent appeals",href:"/verification",icon:"appeal",kind:"appeal",request:api<any[]>("/api/v1/review/verification/appeals",{},token),count:responseCount});
      if(roles.some(role=>["supporting_staff","reviewer","system_admin","admin"].includes(role))){
        queueRequests.push({label:"Service and mentorship moderation",href:"/admin/marketplace",icon:"verification",kind:"marketplace",request:api<any[]>("/api/v1/admin/marketplace-listings",{},token),count:responseCount});
        queueRequests.push({label:"Public demand review",href:"/admin/marketplace",icon:"verification",kind:"demand",request:api<any[]>("/api/v1/admin/marketplace-demand?status=submitted",{},token),count:responseCount});
      }
      const queueResults=await Promise.allSettled(queueRequests.map(item=>item.request));
      const reviewQueues:ReviewQueue[]=[];
      for(let index=0;index<queueResults.length;index++){
        const result=queueResults[index],source=queueRequests[index];
        if(result.status!=="fulfilled"){errors.push(source.label);continue;}
        const payload:any=result.value;
        const rows:any[]=Array.isArray(payload)?payload:Array.isArray(payload?.items)?payload.items:[];
        const items:ReviewQueueItem[]=[];
        const reviewRows=rows.slice(0,30);
        const verificationDetails=source.kind==="verification"?await Promise.all(reviewRows.slice(0,15).map(row=>api<any>("/api/v1/verification/cases/"+encodeURIComponent(row.id),{},token).catch(()=>null))):[];
        for(let rowIndex=0;rowIndex<reviewRows.length;rowIndex++){
          const row=reviewRows[rowIndex];
          let title=String(row.display_name||row.name||row.subject_name||row.program_name||row.title||row.job_title||row.id||"Review item");
          let status=String(row.status||row.case_status||row.moderation_status||"pending");
          let reason="Review the current record and confirm the next safe action.";
          let action="Open and review";
          let history="No previous decision note is included in this queue response.";
          let deadline:string|null=null;
          let priority:ReviewQueueItem["priority"]="Standard";
          let href=source.href;
          if(source.kind==="membership"){
            title=String(row.name||row.fee_snapshot?.productName||"Membership application");
            status=String(row.status||"submitted");
            reason=status==="correction_required"?"The applicant must resolve a requested correction.":status==="payment_pending"?"The approved fee is awaiting payment evidence.":status==="paid"?"Payment is recorded; activation may still be required.":"The membership application needs an authorized review.";
            action=status==="payment_pending"?"Review payment evidence":status==="paid"?"Confirm activation eligibility":"Review application or request a correction";
            const priorReviews=Array.isArray(row.review_history)?row.review_history.map((entry:any)=>String(entry.decision||"Review")+(entry.note?": "+entry.note:"")+(entry.createdAt?" ("+new Date(entry.createdAt).toLocaleDateString()+")":"")).join(" · "):"";history=priorReviews||String(row.latest_correction?.reviewer_note||row.reviewed_at&&("Last reviewed "+new Date(row.reviewed_at).toLocaleDateString())||"No previous review note recorded.");
            priority=["correction_required","payment_pending","paid"].includes(status)?"High":"Standard";
          }else if(source.kind==="verification"){
            title=String(row.subject_name||row.program_name||"Verification case");
            status=String(row.status||"submitted");
            reason=status==="evidence_required"?"Required evidence is missing or needs review.":status==="member_response_required"?"The member is waiting to respond to an adverse decision.":status==="decision_pending"?"Checklist and claim results need a final authorized decision.":"Verification review is pending.";
            action="Open case, checklist and decision history";
            priority=status==="member_response_required"?"Urgent":["evidence_required","decision_pending"].includes(status)?"High":"Standard";
            const detail=verificationDetails[rowIndex];if(detail&&Array.isArray(detail.decisions)&&detail.decisions.length){history=detail.decisions.map((entry:any)=>String(entry.decision||"Decision")+(entry.reason?": "+entry.reason:"")+(entry.decided_at?" ("+new Date(entry.decided_at).toLocaleDateString()+")":"")).join(" · ");const latest=detail.decisions[0];deadline=latest.member_response_due_at||null;if(deadline&&new Date(deadline).getTime()<Date.now())priority="Urgent";}
          }else if(source.kind==="organization"){
            title=String(row.display_name||row.legal_name||"Organization verification");
            status=String(row.case_status||row.verification_status||"submitted");
            reason=status==="correction_required"?"The organization must address the latest verification findings.":"Legal identity and supporting evidence need an authorized review.";
            action="Review trust evidence and decision";
            history=String(row.decision_reason||"No previous decision reason recorded.");
            priority=status==="correction_required"?"High":"Standard";
          }else if(source.kind==="appeal"){
            title=String(row.subject_name||row.program_name||"Independent appeal");
            status=String(row.status||"pending");
            reason="An independent reviewer must assess the appeal against the original decision.";
            action="Review appeal and record a reasoned decision";
            history=String(row.original_decision||row.grounds||"Original decision history is available in the appeal record.");
            priority="High";
          }else if(source.kind==="marketplace"){
            title=String(row.title||"Service or mentorship offer");
            status=String(row.moderation_status||row.status||"pending");
            reason="A provider offer needs moderation before public discovery.";
            action="Review offer and moderation history";
            history=String(row.moderation_note||"No previous moderation note recorded.");
            priority="High";
          }else{
            title=String(row.title||"Public demand request");
            status=String(row.status||"submitted");
            reason="Support Desk must assess the need and publish only a privacy-safe public summary.";
            action="Review demand and next step";
            history=String(row.outcome_note||row.internal_note||"No previous outcome note recorded.");
            priority="High";
          }
          items.push({id:String(row.id||row.case_id||row.organization_id||row.application_id||title),title,status,reason,action,href,priority,deadline,history,updatedAt:row.updated_at||row.submitted_at||row.created_at||undefined});
        }
        reviewQueues.push({label:source.label,href:source.href,icon:source.icon,count:source.count(payload),items});
      }

      setData({profile,tracking,outcomes,organizations,reviewQueues,memberClarity,errors});
    }catch(e){setError(e instanceof ApiError?e.message:e instanceof Error?e.message:"We could not load your dashboard. Please retry.");}
    finally{setLoading(false);}
  }

  useEffect(()=>{if(hydrated&&token)void load();else if(hydrated)setData(null);},[token,hydrated]);

  useEffect(()=>{
    const organization=data?.organizations.find(item=>item.id===selectedOrganizationId);
    if(!token||!organization){setOrganizationPulse(null);setOrganizationError("");setOrganizationLoading(false);return;}
    const activeOrganization=organization;
    const controller=new AbortController();
    setOrganizationPulse(null);setOrganizationError("");setOrganizationLoading(true);
    async function loadOrganization(){
      try{
        let pulse:OrganizationPulse;
        if(["owner","administrator","recruiter","read_only"].includes(activeOrganization.role_code)){
          const summary=await api<{summary?:Record<string,number>}>("/api/v1/organizations/"+encodeURIComponent(activeOrganization.id)+"/recruiting-dashboard",{signal:controller.signal},token);
          pulse={organization:activeOrganization,applications:summary.summary?.applications||0,activePipeline:0,openJobs:summary.summary?.open_jobs||0,hires:summary.summary?.hires||0};
        }else if(["finance","project_manager","event_manager"].includes(activeOrganization.role_code)){
          const summary=await api<{jobs?:{applications:number;active_pipeline:number;hires:number;status:string}[]}>("/api/v1/organizations/"+encodeURIComponent(activeOrganization.id)+"/outcomes",{signal:controller.signal},token);
          const jobs=summary.jobs||[];
          pulse={organization:activeOrganization,applications:jobs.reduce((sum,job)=>sum+Number(job.applications||0),0),activePipeline:jobs.reduce((sum,job)=>sum+Number(job.active_pipeline||0),0),openJobs:jobs.filter(job=>job.status==="published").length,hires:jobs.reduce((sum,job)=>sum+Number(job.hires||0),0)};
        }else{
          pulse={organization:activeOrganization,applications:0,activePipeline:0,openJobs:0,hires:0};
        }
        if(!controller.signal.aborted)setOrganizationPulse(pulse);
      }catch(e){if(!controller.signal.aborted)setOrganizationError(e instanceof Error?e.message:"Organization summary could not be loaded.");}
      finally{if(!controller.signal.aborted)setOrganizationLoading(false);}
    }
    void loadOrganization();
    return ()=>controller.abort();
  },[token,selectedOrganizationId,data?.organizations]);

  async function logout(){
    try{if(token)await api("/api/v1/auth/logout",{method:"POST"},token)}catch{/* Clear the local session if the server session has expired. */}
    clearToken();router.replace("/login");
  }

  if(!hydrated)return <div className={styles.loading}>Restoring your session…</div>;
  if(!token)return <div className={styles.empty}><div className={styles.kicker}>Personal workspace</div><h1>Sign in to see your dashboard.</h1><p>Your applications, organization roles, and assigned review work appear here after sign-in.</p><a className="btn btn-primary" href="/login?next=/dashboard">Sign in <ArrowRight size={16}/></a></div>;

  const profile=data?.profile;
  const roles=profile?.roles||[];
  const name=profile?.display_name||[profile?.first_name,profile?.last_name].filter(Boolean).join(" ")||profile?.email||"your workspace";
  const trackingItems=data?.tracking?.items||[];
  const attentionItems=data?.tracking?.attentionItems||[];
  const serviceRows=data?.outcomes?.services||[];
  const mentorshipRows=data?.outcomes?.mentorships||[];
  const activeEngagements=serviceRows.filter(item=>!terminalStatuses.has(item.status)).length+mentorshipRows.filter(item=>!terminalStatuses.has(item.status)).length;
  const reviewCount=(data?.reviewQueues||[]).reduce((sum,queue)=>sum+queue.count,0);
  const assignedItems=(data?.reviewQueues||[]).flatMap(queue=>queue.items.map(item=>({...item,queueLabel:queue.label}))).sort((a,b)=>({Urgent:0,High:1,Standard:2}[a.priority]-{Urgent:0,High:1,Standard:2}[b.priority])).slice(0,12);
  const roleNames=[...new Set(roles.map(roleName))];
  const selectedOrganization=data?.organizations.find(org=>org.id===selectedOrganizationId);
  const workspaces=[
    {href:"/profile",label:"Profile",detail:"Keep your professional identity current.",icon:UserRound},
    {href:"/track",label:"Applications",detail:"Follow membership, organization, and job applications.",icon:ClipboardList},
    ...(roles.includes("member")?[{href:"/membership",label:"Membership",detail:"Manage membership, payments, and renewals.",icon:WalletCards}]:[]),
    ...(data?.organizations?.length?[{href:"/organizations",label:"Organizations",detail:"Manage organization profiles and verification.",icon:Building2}]:[]),
    ...(data?.organizations?.some(org=>["owner","administrator","recruiter","read_only"].includes(org.role_code))?[{href:"/recruitment",label:"Recruitment",detail:"Review jobs and organization hiring activity.",icon:BriefcaseBusiness}]:[]),
    ...(roles.some(role=>["reviewer","finance_officer","system_admin"].includes(role))?[{href:"/membership",label:"Membership review",detail:"Review applications and payment evidence.",icon:WalletCards}]:[]),
    ...(roles.some(role=>["verification_reviewer","ethics_reviewer","appeal_reviewer","system_admin"].includes(role))?[{href:"/verification",label:"Verification",detail:"Open assigned cases and independent appeals.",icon:FileCheck2}]:[]),
    ...(roles.some(role=>["supporting_staff","reviewer","system_admin","admin"].includes(role))?[{href:"/admin/marketplace",label:"Marketplace review",detail:"Moderate service and mentorship offers and review private demand.",icon:ShieldCheck}]:[]),
    ...(roles.some(role=>["system_admin","super_admin","admin"].includes(role))?[{href:"/admin",label:"Administration",detail:"Manage platform accounts and controls.",icon:ShieldCheck}]:[])
  ];

  return <div className={styles.page}>
    <header className={styles.hero}>
      <div className={styles.identity}>
        <div className={styles.avatar}><UserRound size={25}/></div>
        <div><div className={styles.kicker}>Personal workspace</div><h1>Good to see you, {name}.</h1><p>One view of your professional activity and the work assigned to your account.</p></div>
      </div>
      <div className={styles.heroActions}><a className="btn btn-ghost" href="/profile">Edit profile <ArrowUpRight size={15}/></a><button className="btn btn-ghost" type="button" onClick={logout}><LogOut size={15}/> Sign out</button></div>
      <div className={styles.roleRow}>{roleNames.length?roleNames.map(role=><Badge key={role} tone="slate">{role}</Badge>):<Badge tone="slate">Account user</Badge>}{data?.organizations.length?<Badge tone="slate">{data.organizations.length} organization {data.organizations.length===1?"scope":"scopes"}</Badge>:null}<Badge>{profile?.status||"Loading account"}</Badge></div>
    </header>

    {error&&<div className="form-error" role="alert">{error} <button className="btn btn-ghost" type="button" onClick={()=>void load()} disabled={loading}>Retry</button></div>}
    {data?.errors.length? <div className={styles.partial} role="status"><span>Some dashboard sections could not be refreshed: {data.errors.join(", ")}.</span><button className="btn btn-ghost" type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={14}/> Retry</button></div>:null}

    <section className={styles.metrics} aria-label="Workspace overview">
      <div><span>Applications</span><strong>{data?.tracking?.summary?.total??"—"}</strong><small>{data?.tracking?.summary?.active??0} in progress</small></div>
      <div><span>Next steps</span><strong>{(data?.tracking?.summary?.nextSteps||0)+reviewCount}</strong><small>Personal actions and assigned reviews</small></div>
      <div><span>Active engagements</span><strong>{data?.outcomes?activeEngagements:"—"}</strong><small>Services and mentorships</small></div>
      <div><span>Organization scopes</span><strong>{data?.organizations.length??"—"}</strong><small>Memberships attached to your account</small></div>
    </section>

    <div className={styles.columns}>
      <div className={styles.primaryColumn}>
        <section className={styles.section}>
          <div className={styles.sectionHeading}><div><div className={styles.kicker}>Priorities</div><h2>Needs your attention</h2></div><button className="btn btn-ghost" type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/>{loading?"Refreshing…":"Refresh"}</button></div>
          {loading&&!data?<p className={styles.muted}>Loading your scoped activity…</p>:null}
          {attentionItems.length>0&&<div className={styles.rows}>{attentionItems.slice(0,5).map(item=><a className={styles.activity} href={item.type==="organization"?"/organizations":"/track"} key={item.type+item.id}><span className={styles.activityIcon}><Clock3 size={17}/></span><span className={styles.activityBody}><b>{item.title}</b><small>{item.nextAction}</small></span><Badge tone="gold">{item.statusLabel||item.status}</Badge><ArrowUpRight size={16}/></a>)}</div>}
          {reviewCount>0&&<div className={styles.rows} aria-label="Unified review queue">{assignedItems.map(item=><div className={styles.activity} key={item.queueLabel+item.id}><span className={styles.activityIcon}><ShieldCheck size={17}/></span><span className={styles.activityBody}><b>{item.title}</b><small>{item.queueLabel} · {item.reason}</small><small><b>Next action:</b> {item.action}</small><small><b>History:</b> {item.history}</small><small><b>Deadline:</b> {item.deadline?new Date(item.deadline).toLocaleString():"No deadline recorded"}{item.updatedAt?" · Last updated "+new Date(item.updatedAt).toLocaleDateString():""}</small></span><span className={styles.activityBody}><Badge tone={item.priority==="Urgent"?"gold":item.priority==="High"?"gold":"slate"}>{item.priority} priority</Badge><Badge tone="slate">{item.status.replaceAll("_"," ")}</Badge><a className={styles.secondaryLink} href={item.href}>Open authorized workspace <ArrowUpRight size={14}/></a></span></div>)}</div>}
          {reviewCount>assignedItems.length&&<div className={styles.inlineLinks}>{(data?.reviewQueues||[]).filter(queue=>queue.count>0).map(queue=><a key={queue.label} href={queue.href}>{queue.label} ({queue.count}) <ArrowRight size={14}/></a>)}</div>}
          {data&&!(data.tracking?.summary?.nextSteps||0)&&!reviewCount&&<div className={styles.emptyInline}><CheckCircle2 size={19}/><div><b>You’re up to date</b><p>No pending personal actions or assigned review items were returned for your account.</p></div></div>}
          {(data?.tracking?.summary?.nextSteps||0)>attentionItems.length&&<a className={styles.secondaryLink} href="/track">View all {data?.tracking?.summary?.nextSteps} personal next steps <ArrowRight size={14}/></a>}
        </section>


        {roles.some(role=>["member","professional"].includes(role))&&<section className={styles.section} aria-labelledby="membership-clarity">
          <div className={styles.sectionHeading}><div><div className={styles.kicker}>Membership and trust</div><h2 id="membership-clarity">Your status, in plain language</h2></div><a className="btn btn-ghost" href="/membership">Manage membership <ArrowRight size={14}/></a></div>
          <div className={styles.rows}>
            <div className={styles.activity}><span className={styles.activityIcon}><WalletCards size={17}/></span><span className={styles.activityBody}><b>Is my membership active?</b><small>{profile?.has_active_membership?"Yes. Your membership is currently active.":"No active membership was found. Check your application or apply to join."}</small></span><Badge tone={profile?.has_active_membership?"green":"gold"}>{profile?.has_active_membership?"Active":"Not active"}</Badge></div>
            <div className={styles.activity}><span className={styles.activityIcon}><FileCheck2 size={17}/></span><span className={styles.activityBody}><b>Has my payment been received and verified?</b><small>{(data?.memberClarity?.applications||[]).some(a=>a.payment?.status==="approved"||a.payment?.status==="verified"||a.payment?.status==="succeeded")?"A payment is marked verified.":(data?.memberClarity?.applications||[]).some(a=>a.payment?.status==="pending")?"Payment evidence is recorded and waiting for an authorized finance decision.":(data?.memberClarity?.applications||[]).some(a=>a.status==="payment_pending")?"Payment is still required for an approved application.":"No payment verification is recorded for your current applications."}</small></span><a href="/membership" className={styles.secondaryLink}>View payments <ArrowRight size={14}/></a></div>
            <div className={styles.activity}><span className={styles.activityIcon}><ShieldCheck size={17}/></span><span className={styles.activityBody}><b>What documents or corrections are still needed?</b><small>{(data?.memberClarity?.applications||[]).some(a=>a.status==="correction_required"||a.latest_correction?.status==="open")?"A correction is requested. "+((data?.memberClarity?.applications||[]).find(a=>a.status==="correction_required"||a.latest_correction?.status==="open")?.latest_correction?.reviewer_note||((data?.memberClarity?.applications||[]).find(a=>a.status==="correction_required"||a.latest_correction?.status==="open")?.latest_correction?.requested_fields? "Requested fields: "+JSON.stringify((data?.memberClarity?.applications||[]).find(a=>a.status==="correction_required"||a.latest_correction?.status==="open")?.latest_correction?.requested_fields):"Open Membership to read the reviewer instructions and respond.")):""}{(data?.memberClarity?.cases||[]).some(row=>["evidence_required","member_response_required","consent_pending"].includes(row.status))?" Verification needs attention: "+(data?.memberClarity?.cases||[]).filter(row=>["evidence_required","member_response_required","consent_pending"].includes(row.status)).map(row=>(row.program_name||row.program_code||"Verification case")+" ("+row.status.replaceAll("_"," ")+")").join(", ")+". "+((data?.memberClarity?.missingRequirements||[]).length?"Still needed: "+data.memberClarity.missingRequirements.join(", ")+". ":"")+"Open the case to see its checklist and reviewer decision.":!(data?.memberClarity?.applications||[]).some(a=>a.status==="correction_required"||a.latest_correction?.status==="open")?"No outstanding membership correction was reported. Check Verification for the latest evidence checklist.":""}</small></span><a href="/verification" className={styles.secondaryLink}>Review documents <ArrowRight size={14}/></a></div>
            <div className={styles.activity}><span className={styles.activityIcon}><CheckCircle2 size={17}/></span><span className={styles.activityBody}><b>Which professional claims have been verified?</b><small>{data?.memberClarity?.verifiedClaims.length?data.memberClarity.verifiedClaims.join(", "):"No verified claims were returned yet. Submitted claims remain unverified until an authorized reviewer decides them."}</small></span><a href="/verification" className={styles.secondaryLink}>View claims <ArrowRight size={14}/></a></div>
            <div className={styles.activity}><span className={styles.activityIcon}><UsersRound size={17}/></span><span className={styles.activityBody}><b>Can organizations discover me?</b><small>{!data?.memberClarity?.profileLoaded?"Your directory settings could not be confirmed. Open your profile to check visibility.":!profile?.has_active_membership?"Your membership is not active; complete membership first.":data.memberClarity.profileVisibility==="private"?"Your professional directory profile is private. Change visibility in your profile if you want to be discoverable.":"Your profile visibility is set to "+data.memberClarity.profileVisibility+". Organization access still depends on each organization's permissions and your sharing choices."}</small></span><a href="/profile" className={styles.secondaryLink}>Review visibility <ArrowRight size={14}/></a></div>
            <div className={styles.activity}><span className={styles.activityIcon}><BriefcaseBusiness size={17}/></span><span className={styles.activityBody}><b>Which opportunities am I eligible for?</b><small>Eligibility can differ by job and its published requirements. Check the eligibility result on each opportunity before applying; your membership alone does not guarantee eligibility.</small></span><a href="/jobs" className={styles.secondaryLink}>Find opportunities <ArrowRight size={14}/></a></div>
          </div>
          {data?.memberClarity?.applications.some(a=>a.status==="correction_required")&&<div className={styles.partial} role="status"><b>Next action:</b> open Membership, read the requested correction, attach any missing evidence and submit your response.</div>}
          {data?.memberClarity?.cases.some(row=>row.status==="consent_pending")&&<div className={styles.partial} role="status"><b>Next action:</b> open Verification and give consent for the case you want reviewed.</div>}
          <p className={styles.muted}>The information above is based on records returned for your account. If a section failed to load, use its link and retry; a missing result is not proof that a claim or payment was rejected.</p>
        </section>}
        <section className={styles.section}>
          <div className={styles.sectionHeading}><div><div className={styles.kicker}>Your activity</div><h2>Recent applications</h2></div><a className="btn btn-ghost" href="/track">View all <ArrowRight size={15}/></a></div>
          {trackingItems.length? <div className={styles.rows}>{trackingItems.slice(0,5).map(item=><a className={styles.activity} href={item.type==="organization"?"/organizations":item.type==="membership"?"/membership":item.type==="job"?"/apply/job":"/track"} key={item.type+item.id}><span className={styles.activityIcon}>{item.type==="organization"?<Building2 size={17}/>:item.type==="job"?<BriefcaseBusiness size={17}/>:<ClipboardList size={17}/>}</span><span className={styles.activityBody}><b>{item.title}</b><small>{item.subtitle||roleName(item.type)}{item.updatedAt?" · Updated "+new Date(item.updatedAt).toLocaleDateString():""}</small></span><Badge tone="slate">{item.statusLabel||item.status}</Badge><ArrowUpRight size={16}/></a>)}</div>:data?.tracking?<div className={styles.emptyInline}><ClipboardList size={19}/><div><b>No applications yet</b><p>Start with a membership application or explore open opportunities.</p><div className={styles.inlineLinks}><a href="/apply">Membership <ArrowRight size={14}/></a><a href="/jobs">Browse jobs <ArrowRight size={14}/></a></div></div></div>:<p className={styles.muted}>Application activity is not available until tracking loads.</p>}
        </section>

        {data?.organizations.length? <section className={styles.section}>
          <div className={styles.sectionHeading}><div><div className={styles.kicker}>Organization scope</div><h2>Your workspace</h2></div><a className="btn btn-ghost" href="/organizations">Manage organizations <ArrowRight size={15}/></a></div>
          <label className={styles.organizationPicker}>Active organization<select value={selectedOrganizationId} onChange={event=>setSelectedOrganizationId(event.target.value)}>{data.organizations.map(org=><option key={org.id} value={org.id}>{org.display_name} · {roleName(org.role_code)}</option>)}</select></label>
          {selectedOrganization&&<div className={styles.organization}><div className={styles.organizationHead}><span className={styles.activityIcon}><Building2 size={17}/></span><div className={styles.activityBody}><b>{selectedOrganization.display_name}</b><small>{selectedOrganization.legal_name} · {roleName(selectedOrganization.role_code)}</small></div><Badge tone="slate">{(selectedOrganization.verification_status||"unverified").replaceAll("_"," ")}</Badge></div>
            {organizationLoading?<p className={styles.muted}>Loading this organization’s summary…</p>:organizationError?<p className="form-error" role="alert">{organizationError}</p>:organizationPulse&&["owner","administrator","recruiter","read_only","finance","project_manager","event_manager"].includes(selectedOrganization.role_code)?<div className={styles.orgMetrics}><span><b>{organizationPulse.applications}</b> applications</span><span><b>{organizationPulse.openJobs}</b> open jobs</span><span><b>{organizationPulse.hires}</b> hires</span></div>:null}
          </div>}
        </section>:null}
      </div>

      <aside className={styles.sideColumn}>
        <section className={styles.section}>
          <div className={styles.sectionHeading}><div><div className={styles.kicker}>Your access</div><h2>Workspaces</h2></div><LayoutDashboard size={20}/></div>
          <div className={styles.workspaceList}>{workspaces.map(({href,label,detail,icon:Icon})=><a className={styles.workspaceLink} href={href} key={label}><span className={styles.workspaceIcon}><Icon size={17}/></span><span><b>{label}</b><small>{detail}</small></span><ArrowUpRight size={15}/></a>)}</div>
          {!data?.organizations.length&&<a className={styles.secondaryLink} href="/organizations">Register an organization <ArrowRight size={14}/></a>}
        </section>
        <section className={styles.section}>
          <div className={styles.sectionHeading}><div><div className={styles.kicker}>Profile</div><h2>Professional identity</h2></div><UserRound size={20}/></div>
          <div className={styles.profileProgress}><div><b>{profile?.completion_percent??0}%</b><span>complete</span></div><div className={styles.progressTrack}><span style={{width:Math.max(0,Math.min(100,profile?.completion_percent||0))+"%"}}/></div></div>
          <p className={styles.muted}>A complete profile helps keep your membership and professional records current.</p><a className={styles.secondaryLink} href="/profile">Review your profile <ArrowRight size={14}/></a>
        </section>
        <section className={styles.section}>
          <div className={styles.sectionHeading}><div><div className={styles.kicker}>Community</div><h2>Explore</h2></div><UsersRound size={20}/></div>
          <div className={styles.exploreLinks}><a href="/jobs"><BriefcaseBusiness size={16}/> Jobs</a><a href="/network"><UsersRound size={16}/> Professional network</a><a href="/services"><WalletCards size={16}/> Services</a><a href="/mentorship"><UserRound size={16}/> Mentorship</a><a href="/service-demand"><ClipboardList size={16}/> Demand topics</a></div>
        </section>
      </aside>
    </div>
  </div>;
}
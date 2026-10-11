"use client";
import {FormEvent,useCallback,useEffect,useState} from "react";
import {Clock3,HeartHandshake,Languages,RefreshCw,Target} from "lucide-react";
import {Card,Badge} from "../../components/ui";
import {api,ApiError} from "../../lib/api";
import {useUiStore} from "../../lib/store";

type Mentor={id:string;user_id:string;display_name:string;headline?:string;bio?:string;expertise?:string[]|string;languages?:string[]|string;mentoring_modes?:string[]|string;max_active_mentees?:number};
type RequestResult={id:string;status:string;goals?:string;created_at?:string;preferred_mentor_user_id?:string|null};
type MatchOffer={id:string;request_id:string;goals:string;mentee_name:string;status:string};
type MentorshipRecord={id:string;mentor_user_id:string;mentee_user_id:string;mentor_name:string;mentee_name:string;goals:string;status:string};
type MentorCandidate={mentorUserId:string;displayName:string;score:number;reasons:string[]};
type Goal={id:string;title:string;status:string;target_date?:string|null};
type Session={id:string;status:string;scheduled_start_at:string;scheduled_end_at:string;agenda?:string|null};
type MentorProfile={id:string;headline:string;bio?:string|null;expertise?:string[];languages?:string[];mentoring_modes?:string[];visibility:string;status:string;max_active_mentees:number;availability?:{day_of_week:number;start_time:string;end_time:string;timezone:string;active:boolean}[]};
function values(value:unknown):string[]{if(Array.isArray(value))return value.map(String);if(typeof value==="string"){try{const parsed=JSON.parse(value);if(Array.isArray(parsed))return parsed.map(String)}catch{}return value?[value]:[]}return []}
export default function Mentorship(){
 const token=useUiStore(s=>s.token);
 const [mentors,setMentors]=useState<Mentor[]>([]);
 const [myRequests,setMyRequests]=useState<RequestResult[]>([]);
 const [matchOffers,setMatchOffers]=useState<MatchOffer[]>([]);
 const [engagements,setEngagements]=useState<MentorshipRecord[]>([]);
 const [currentUserId,setCurrentUserId]=useState("");
 const [matchingRequestId,setMatchingRequestId]=useState("");
 const [candidates,setCandidates]=useState<Record<string,MentorCandidate[]>>({});
 const [engagementDetails,setEngagementDetails]=useState<Record<string,{goals:Goal[];sessions:Session[]}>>({});
 const [goalDrafts,setGoalDrafts]=useState<Record<string,string>>({});
 const [sessionStarts,setSessionStarts]=useState<Record<string,string>>({});
 const [sessionEnds,setSessionEnds]=useState<Record<string,string>>({});
 const [sessionAgendas,setSessionAgendas]=useState<Record<string,string>>({});
 const [ownMentorProfile,setOwnMentorProfile]=useState<MentorProfile|null>(null);
 const [mentorForm,setMentorForm]=useState({headline:"",bio:"",expertise:"",languages:"",mentoringModes:"remote",visibility:"members",maxActiveMentees:"3"});
 const [mentorDay,setMentorDay]=useState("1");
 const [mentorStart,setMentorStart]=useState("09:00");
 const [mentorEnd,setMentorEnd]=useState("12:00");
 const [mentorSaving,setMentorSaving]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [selected,setSelected]=useState<Mentor|null>(null);
 const [showRequestForm,setShowRequestForm]=useState(false);
 const [query,setQuery]=useState("");
 const [topic,setTopic]=useState("");
 const [submittedQuery,setSubmittedQuery]=useState("");
 const [submittedTopic,setSubmittedTopic]=useState("");
 const [goals,setGoals]=useState("");
 const [topics,setTopics]=useState("");
 const [languages,setLanguages]=useState("");
 const [mode,setMode]=useState("remote");
 const [submitting,setSubmitting]=useState(false);
 const [created,setCreated]=useState<RequestResult|null>(null);

 const load=useCallback(async()=>{
   setLoading(true);setError("");
   const params=new URLSearchParams();if(submittedQuery.trim())params.set("q",submittedQuery.trim());if(submittedTopic.trim())params.set("topic",submittedTopic.trim());
   try{
     const result=await api<Mentor[]>(`/api/v1/mentors${params.toString()?"?"+params.toString():""}`,{},token||undefined);
     setMentors(Array.isArray(result)?result:[]);
   }catch(e){setMentors([]);setError(e instanceof ApiError?e.message:"We couldn't load mentor profiles right now.");}
   finally{setLoading(false);}
 },[submittedQuery,submittedTopic,token]);
 useEffect(()=>{void load()},[load]);
 const loadOwnMentorProfile=useCallback(async()=>{if(!token){setOwnMentorProfile(null);return;}try{const rawProfile=await api<any>("/api/v1/me/mentor-profile",{},token);const profile=(rawProfile&&typeof rawProfile==="object"&&"data" in rawProfile&&rawProfile.data===null)?null:rawProfile as MentorProfile|null;setOwnMentorProfile(profile);if(profile)setMentorForm({headline:profile.headline||"",bio:profile.bio||"",expertise:(profile.expertise||[]).join(", "),languages:(profile.languages||[]).join(", "),mentoringModes:(profile.mentoring_modes||["remote"]).join(", "),visibility:profile.visibility||"members",maxActiveMentees:String(profile.max_active_mentees||3)});}catch(e){setError(e instanceof ApiError?e.message:"We couldn't load your mentor profile.");}},[token]);
 useEffect(()=>{void loadOwnMentorProfile()},[loadOwnMentorProfile]);
 async function saveMentorProfile(e:FormEvent){e.preventDefault();if(!token)return;setMentorSaving(true);setError("");setNotice("");try{const body={headline:mentorForm.headline.trim(),bio:mentorForm.bio.trim(),expertise:mentorForm.expertise.split(",").map(x=>x.trim()).filter(Boolean),languages:mentorForm.languages.split(",").map(x=>x.trim()).filter(Boolean),mentoringModes:mentorForm.mentoringModes.split(",").map(x=>x.trim()).filter(Boolean),visibility:mentorForm.visibility,maxActiveMentees:Number(mentorForm.maxActiveMentees)};const saved=await api<MentorProfile>(ownMentorProfile?"/api/v1/mentor-profiles/"+encodeURIComponent(ownMentorProfile.id):"/api/v1/me/mentor-profile",{method:ownMentorProfile?"PATCH":"POST",body:JSON.stringify(body)},token);setOwnMentorProfile(saved);setNotice("Mentor profile saved. The server enforces membership and professional verification requirements.");await load();}catch(e){setError(e instanceof ApiError?e.message:"Mentor profile could not be saved. Active membership and a verified professional claim are required.");}finally{setMentorSaving(false);}}
 async function saveMentorAvailability(){if(!token||!ownMentorProfile)return;setError("");try{const slots=[{dayOfWeek:Number(mentorDay),startTime:mentorStart,endTime:mentorEnd,timezone:"Africa/Addis_Ababa"}];const saved=await api<any>(`/api/v1/mentor-profiles/${encodeURIComponent(ownMentorProfile.id)}/availability`,{method:"PUT",body:JSON.stringify({slots})},token);setOwnMentorProfile({...ownMentorProfile,availability:saved||[]});setNotice("Mentor availability saved.");}catch(e){setError(e instanceof ApiError?e.message:"Availability could not be saved. Check the day and time range.");}}
 async function changeMentorProfileStatus(status:"active"|"paused"|"closed"){if(!token||!ownMentorProfile)return;setError("");try{const updated=await api<MentorProfile>(`/api/v1/mentor-profiles/${encodeURIComponent(ownMentorProfile.id)}/status`,{method:"POST",body:JSON.stringify({status})},token);setOwnMentorProfile({...ownMentorProfile,...updated});setNotice("Mentor profile status updated.");await load();}catch(e){setError(e instanceof ApiError?e.message:"Mentor status could not be updated.");}}
  const loadMyRequests=useCallback(async()=>{if(!token){setMyRequests([]);setMatchOffers([]);setEngagements([]);setCurrentUserId("");return;}try{const [result,offers,active,me]=await Promise.all([api<RequestResult[]>("/api/v1/me/mentorship-requests",{},token),api<MatchOffer[]>("/api/v1/me/mentorship-matches",{},token),api<MentorshipRecord[]>("/api/v1/me/mentorships",{},token),api<{user_id:string}>("/api/v1/me",{},token)]);setMyRequests(Array.isArray(result)?result:[]);setMatchOffers(Array.isArray(offers)?offers:[]);setEngagements(Array.isArray(active)?active:[]);setCurrentUserId(me.user_id);}catch(e){setError(e instanceof ApiError?e.message:"We couldn't load your mentorship workspace.");}},[token]);
 useEffect(()=>{void loadMyRequests()},[loadMyRequests]);
 async function loadCandidates(requestId:string){if(!token)return;setMatchingRequestId(requestId);setError("");try{const result=await api<MentorCandidate[]>(`/api/v1/mentorship/requests/${encodeURIComponent(requestId)}/matches`,{},token);setCandidates(current=>({...current,[requestId]:Array.isArray(result)?result:[]}));}catch(e){setError(e instanceof ApiError?e.message:"We couldn't load eligible mentor matches.");}finally{setMatchingRequestId("");}}
 async function proposeMatch(requestId:string,mentorUserId:string){if(!token)return;setError("");setNotice("");try{await api(`/api/v1/mentorship/requests/${encodeURIComponent(requestId)}/match`,{method:"POST",body:JSON.stringify({mentorUserId})},token);setNotice("Match proposed. The mentor must explicitly accept before a mentorship is created.");setCandidates(current=>({...current,[requestId]:[]}));await loadMyRequests();}catch(e){setError(e instanceof ApiError?e.message:"We couldn't propose this mentor match.");}}
 async function respondToOffer(matchId:string,status:"accepted"|"declined"){if(!token)return;setError("");setNotice("");try{await api(`/api/v1/mentorship/matches/${encodeURIComponent(matchId)}/response`,{method:"POST",body:JSON.stringify({status})},token);setNotice(status==="accepted"?"Mentorship match accepted; the engagement is now available below.":"Match declined; the mentee can request another match.");await loadMyRequests();}catch(e){setError(e instanceof ApiError?e.message:"We couldn't record the match response.");}}
 async function loadEngagementDetails(id:string){if(!token)return;setError("");try{const [goals,sessions]=await Promise.all([api<Goal[]>(`/api/v1/mentorship/${encodeURIComponent(id)}/goals`,{},token),api<Session[]>(`/api/v1/mentorship/${encodeURIComponent(id)}/sessions`,{},token)]);setEngagementDetails(current=>({...current,[id]:{goals:Array.isArray(goals)?goals:[],sessions:Array.isArray(sessions)?sessions:[]}}));}catch(e){setError(e instanceof ApiError?e.message:"We couldn't load mentorship goals and sessions.");}}
 async function createGoal(m:MentorshipRecord){if(!token||!goalDrafts[m.id]?.trim())return;setError("");try{await api(`/api/v1/mentorship/${encodeURIComponent(m.id)}/goals`,{method:"POST",body:JSON.stringify({title:goalDrafts[m.id].trim(),ownerRole:"shared"})},token);setGoalDrafts(current=>({...current,[m.id]:""}));await loadEngagementDetails(m.id);setNotice("Mentorship goal saved.");}catch(e){setError(e instanceof ApiError?e.message:"We couldn't save the mentorship goal.");}}
 async function scheduleSession(m:MentorshipRecord){if(!token||!sessionStarts[m.id]||!sessionEnds[m.id]){setError("Choose both a session start and end time.");return;}setError("");try{await api(`/api/v1/mentorship/${encodeURIComponent(m.id)}/sessions`,{method:"POST",body:JSON.stringify({scheduledStartAt:new Date(sessionStarts[m.id]).toISOString(),scheduledEndAt:new Date(sessionEnds[m.id]).toISOString(),mode:"remote",agenda:sessionAgendas[m.id]||undefined})},token);setNotice("Mentorship session scheduled.");setSessionAgendas(current=>({...current,[m.id]:""}));await loadEngagementDetails(m.id);}catch(e){setError(e instanceof ApiError?e.message:"We couldn't schedule this session. Check mentor availability and time range.");}}
 async function completeSession(m:MentorshipRecord,s:Session){if(!token)return;setError("");try{await api(`/api/v1/mentorship/sessions/${encodeURIComponent(s.id)}/status`,{method:"POST",body:JSON.stringify({status:"completed",notes:"Session completed by a participant."})},token);await loadEngagementDetails(m.id);setNotice("Session marked complete.");}catch(e){setError(e instanceof ApiError?e.message:"We couldn't complete this session.");}}
 async function changeEngagementStatus(m:MentorshipRecord,status:"completed"|"paused"){if(!token)return;setError("");try{await api(`/api/v1/mentorship/${encodeURIComponent(m.id)}/status`,{method:"POST",body:JSON.stringify({status,note:"Updated by a mentorship participant."})},token);await loadMyRequests();setNotice(`Mentorship marked ${status}.`);}catch(e){setError(e instanceof ApiError?e.message:"We couldn't update this mentorship.");}}
 async function submitFeedback(m:MentorshipRecord,sessionId?:string){if(!token)return;setError("");try{const targetRole=m.mentor_user_id===currentUserId?"mentee":"mentor";await api(`/api/v1/mentorship/${encodeURIComponent(m.id)}/feedback`,{method:"POST",body:JSON.stringify({targetRole,rating:5,comments:"Submitted through the mentorship workspace.",...(sessionId?{sessionId}:{})})},token);setNotice("Feedback saved.");}catch(e){setError(e instanceof ApiError?e.message:"Feedback is available after the session or mentorship is completed.");}}

 async function submit(e:FormEvent){
   e.preventDefault();setError("");setNotice("");
   if(!token){setNotice("Sign in with an active membership to submit a formal mentorship request.");return;}
   if(!goals.trim()){setError("Describe the goal you want mentorship to help you achieve.");return;}
   setSubmitting(true);
   try{
     const result=await api<RequestResult>("/api/v1/mentorship/requests",{method:"POST",body:JSON.stringify({
       goals:goals.trim(),
       preferredMentorUserId:selected?.user_id||null,
       topics:topics.split(",").map(x=>x.trim()).filter(Boolean),
       preferredModes:[mode],
       preferredLanguages:languages.split(",").map(x=>x.trim()).filter(Boolean)
     })},token);
     setCreated(result);setNotice("Your mentorship request was recorded. Matching and mentor acceptance remain explicit next steps.");await loadMyRequests();
     setSelected(null);setShowRequestForm(false);setGoals("");setTopics("");setLanguages("");
   }catch(e){setError(e instanceof ApiError?e.message:"We couldn't submit your mentorship request.");}
   finally{setSubmitting(false);}
 }

 return <div>
   <div className="eyebrow">Mentorship match</div><h1 className="h1">One goal. One good match.</h1>
   <p className="muted">Discover current mentor profiles and submit a goal-based request. We show only details returned by the platform; availability and matching are not guessed or guaranteed.</p>
   <Card><form onSubmit={e=>{e.preventDefault();setSubmittedQuery(query);setSubmittedTopic(topic)}} className="row" style={{gap:10,flexWrap:"wrap"}}>
     <label style={{flex:"1 1 220px"}}>Search expertise<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Mentor headline or bio"/></label>
     <label style={{flex:"1 1 180px"}}>Topic<input value={topic} onChange={e=>setTopic(e.target.value)} placeholder="Expertise topic"/></label>
     <button className="btn btn-primary" type="submit" disabled={loading}>{loading?"Searching…":"Search mentors"}</button>
     <button className="btn btn-ghost" type="button" onClick={()=>{setQuery("");setTopic("");setSubmittedQuery("");setSubmittedTopic("")}}>Clear</button>
   </form></Card>
   <div style={{marginTop:14}}><button className="btn btn-ghost" type="button" onClick={()=>{setSelected(null);setShowRequestForm(true);setCreated(null);setNotice("");setError("");}}>Request mentorship without a preferred mentor</button><p className="muted">You can submit your goal now; the platform will not invent a match or confirm a mentor until one is eligible and accepts.</p></div>
   {error&&<div className="form-error" role="alert">{error}<button className="btn btn-ghost" type="button" onClick={()=>void load()}>Retry</button></div>}
   {notice&&<p className="muted" role="status">{notice}{!token&&<a href="/login?next=/mentorship"> Sign in</a>}</p>}
   {created&&<Card><Badge tone="green">Request recorded</Badge><h2 className="h2" style={{marginTop:10}}>Your request is in the system</h2><p className="muted">Request reference: {created.id}</p><p className="muted">Status: {created.status}. The platform does not create a mentorship until the matching and acceptance steps are completed.</p><button className="btn btn-ghost" type="button" onClick={()=>setCreated(null)}>Dismiss</button></Card>}
   {loading?<Card><div className="row"><RefreshCw size={18}/><p className="muted">Loading active mentor profiles…</p></div></Card>:mentors.length===0&&!error?<Card><h2 className="h2">No active mentor profiles found</h2><p className="muted">Try a different topic or return later. We do not display placeholder mentors.</p></Card>:<div className="grid grid-3" style={{marginTop:18}}>{mentors.map(mentor=><Card key={mentor.user_id}>
     <div className="row"><div className="avatar">{mentor.display_name.split(" ").map(x=>x[0]).join("").slice(0,3)}</div><Badge>Active profile</Badge></div>
     <h2 style={{fontSize:19,marginBottom:4,marginTop:14}}>{mentor.display_name}</h2><div className="tagline">{mentor.headline||"Professional mentor"}</div>
     {mentor.bio&&<p className="muted">{mentor.bio}</p>}
     {values(mentor.expertise).length>0&&<div style={{marginTop:12}}><b>Expertise</b><p className="muted">{values(mentor.expertise).join(" · ")}</p></div>}
     {values(mentor.languages).length>0&&<div className="tagline"><Languages size={14}/> {values(mentor.languages).join(" · ")}</div>}
     {values(mentor.mentoring_modes).length>0&&<div className="tagline" style={{marginTop:8}}><Clock3 size={14}/> {values(mentor.mentoring_modes).join(" · ")}</div>}
     <button className="btn btn-primary" type="button" style={{width:"100%",marginTop:17}} onClick={()=>{setSelected(mentor);setShowRequestForm(false);setCreated(null);setGoals("");setNotice("");}}>Request mentorship <HeartHandshake size={16}/></button>
   </Card>)}</div>}
   {(selected||showRequestForm)&&<Card id="mentor-goal"><div className="row"><div><div className="eyebrow">Mentorship request</div><h2 className="h2">Goal and preferences</h2>{selected?<p className="muted">Preferred mentor: {selected.display_name}</p>:<p className="muted">No preferred mentor selected. Matching remains a separate, governed step.</p>}</div><button className="btn btn-ghost" type="button" onClick={()=>{setSelected(null);setShowRequestForm(false)}}>Close</button></div>
     {!token?<><p className="muted">A formal request requires sign-in and active membership. You can still explore mentor profiles.</p><a className="btn btn-primary" href="/login?next=/mentorship">Sign in to continue</a></>:<form className="form-stack" onSubmit={submit}>
       <label>Your mentorship goal<textarea required rows={4} value={goals} onChange={e=>setGoals(e.target.value)} placeholder="What outcome do you want help achieving?"/></label>
       <label>Topics, separated by commas<input value={topics} onChange={e=>setTopics(e.target.value)} placeholder="e.g. product leadership, finance"/></label>
       <label>Preferred languages, separated by commas<input value={languages} onChange={e=>setLanguages(e.target.value)} placeholder="e.g. Amharic, English"/></label>
       <label>Preferred mode<select value={mode} onChange={e=>setMode(e.target.value)}><option value="remote">Remote</option><option value="in_person">In person</option><option value="hybrid">Hybrid</option></select></label>
       <p className="muted">Submitting records a request; it does not automatically confirm a match or schedule a session.</p>
       <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting?"Submitting…":"Submit mentorship request"} <Target size={16}/></button>
     </form>}
   </Card>}
   {token&&<>
 <Card><div className="row"><div><div className="h2">Your mentorship requests</div><p className="muted">Persisted requests are reloaded from your account, including after a refresh.</p></div><button className="btn btn-ghost" type="button" onClick={()=>void loadMyRequests()}>Refresh</button></div>{myRequests.length===0?<p className="muted">No mentorship requests are recorded for this account yet.</p>:<div className="grid">{myRequests.map(request=><div className="case-row" key={request.id}><div className="row"><b>Mentorship goal</b><Badge>{request.status.replaceAll("_"," ")}</Badge></div><p className="muted">{request.goals}</p><small className="muted">Reference: {request.id}{request.created_at?" · "+new Date(request.created_at).toLocaleString():""}</small>{!["cancelled","declined","completed","matched"].includes(request.status)&&<button className="btn btn-ghost" type="button" disabled={matchingRequestId===request.id} onClick={()=>void loadCandidates(request.id)}>{matchingRequestId===request.id?"Finding matches…":"Find eligible matches"}</button>}{(candidates[request.id]||[]).length>0&&<div className="grid">{candidates[request.id].map(candidate=><div className="case-row" key={candidate.mentorUserId}><b>{candidate.displayName}</b><p className="muted">Fit score: {candidate.score} · {candidate.reasons.join(", ")||"Eligible profile"}</p><button className="btn btn-primary" type="button" onClick={()=>void proposeMatch(request.id,candidate.mentorUserId)}>Propose match</button></div>)}</div>}</div>)}</div>}</Card>
 <Card><div className="h2">Mentorship invitations</div><p className="muted">A proposed match becomes a mentorship only after the proposed mentor explicitly accepts.</p>{matchOffers.length===0?<p className="muted">No pending mentorship invitations.</p>:<div className="grid">{matchOffers.map(offer=><div className="case-row" key={offer.id}><div className="row"><b>Invitation from a mentee</b><Badge>{offer.status}</Badge></div><p className="muted">{offer.goals}</p><small className="muted">Mentee: {offer.mentee_name} · Request {offer.request_id}</small><div className="row"><button className="btn btn-primary" type="button" onClick={()=>void respondToOffer(offer.id,"accepted")}>Accept match</button><button className="btn btn-ghost" type="button" onClick={()=>void respondToOffer(offer.id,"declined")}>Decline match</button></div></div>)}</div>}</Card>
 <Card><div className="h2">Active mentorships</div><p className="muted">Participants can manage goals, schedule sessions, record completion and submit feedback. Every action is authorized and audited by the server.</p>{engagements.length===0?<p className="muted">No mentorship engagement has been created yet.</p>:<div className="grid">{engagements.map(m=><div className="case-row" key={m.id}><div className="row"><b>{m.mentor_user_id===currentUserId?"Mentor":"Mentee"} workspace · {m.mentor_name} / {m.mentee_name}</b><Badge>{m.status}</Badge></div><p className="muted">{m.goals}</p><button className="btn btn-ghost" type="button" onClick={()=>void loadEngagementDetails(m.id)}>Load goals and sessions</button>{engagementDetails[m.id]&&<div className="grid" style={{gap:10,marginTop:10}}><div><b>Goals</b>{engagementDetails[m.id].goals.map(g=><p className="muted" key={g.id}>{g.title} · {g.status}</p>)}<form className="row" onSubmit={e=>{e.preventDefault();void createGoal(m)}}><input aria-label={"New goal for "+m.id} value={goalDrafts[m.id]||""} onChange={e=>setGoalDrafts(current=>({...current,[m.id]:e.target.value}))} placeholder="Add a shared goal"/><button className="btn btn-ghost" type="submit">Save goal</button></form></div><div><b>Sessions</b>{engagementDetails[m.id].sessions.map(s=><div key={s.id} className="case-row"><p>{new Date(s.scheduled_start_at).toLocaleString()} – {new Date(s.scheduled_end_at).toLocaleString()} · {s.status}</p>{s.agenda&&<p className="muted">{s.agenda}</p>}{s.status!=="completed"&&<button className="btn btn-ghost" type="button" onClick={()=>void completeSession(m,s)}>Mark session complete</button>}{s.status==="completed"&&<button className="btn btn-ghost" type="button" onClick={()=>void submitFeedback(m,s.id)}>Submit session feedback</button>}</div>)}{m.status==="active"&&<form className="grid" style={{gap:8}} onSubmit={e=>{e.preventDefault();void scheduleSession(m)}}><label>Session starts<input required type="datetime-local" value={sessionStarts[m.id]||""} onChange={e=>setSessionStarts(current=>({...current,[m.id]:e.target.value}))}/></label><label>Session ends<input required type="datetime-local" value={sessionEnds[m.id]||""} onChange={e=>setSessionEnds(current=>({...current,[m.id]:e.target.value}))}/></label><label>Agenda<input value={sessionAgendas[m.id]||""} onChange={e=>setSessionAgendas(current=>({...current,[m.id]:e.target.value}))}/></label><button className="btn btn-primary" type="submit">Schedule session</button></form>}</div></div>}{m.status==="active"&&<button className="btn btn-ghost" type="button" onClick={()=>void changeEngagementStatus(m,"completed")}>Complete mentorship</button>}{m.status==="completed"&&<button className="btn btn-ghost" type="button" onClick={()=>void submitFeedback(m)}>Submit program feedback</button>}</div>)}</div>}</Card>
 </>}
   {token&&<Card>
     <div className="row"><div><div className="h2">Offer mentorship</div><p className="muted">Mentor profiles require active membership and a verified professional claim. Availability is explicit; the system does not invent open slots.</p></div><Badge>{ownMentorProfile?.status||"not configured"}</Badge></div>
     <form className="form-stack" onSubmit={saveMentorProfile}>
       <label>Mentor headline<input required value={mentorForm.headline} onChange={e=>setMentorForm(f=>({...f,headline:e.target.value}))} placeholder="Professional expertise you can mentor on"/></label>
       <label>Bio<textarea rows={3} value={mentorForm.bio} onChange={e=>setMentorForm(f=>({...f,bio:e.target.value}))}/></label>
       <label>Expertise topics<input value={mentorForm.expertise} onChange={e=>setMentorForm(f=>({...f,expertise:e.target.value}))} placeholder="comma-separated"/></label>
       <label>Languages<input value={mentorForm.languages} onChange={e=>setMentorForm(f=>({...f,languages:e.target.value}))} placeholder="comma-separated"/></label>
       <label>Mentoring modes<input value={mentorForm.mentoringModes} onChange={e=>setMentorForm(f=>({...f,mentoringModes:e.target.value}))} placeholder="remote, in_person, hybrid"/></label>
       <label>Visibility<select value={mentorForm.visibility} onChange={e=>setMentorForm(f=>({...f,visibility:e.target.value}))}><option value="members">Members</option><option value="public">Public-safe profile</option></select></label>
       <label>Maximum active mentees<input type="number" min="1" max="50" value={mentorForm.maxActiveMentees} onChange={e=>setMentorForm(f=>({...f,maxActiveMentees:e.target.value}))}/></label>
       <button className="btn btn-primary" type="submit" disabled={mentorSaving}>{mentorSaving?"Saving…":ownMentorProfile?"Save mentor profile":"Create mentor profile"}</button>
     </form>
     {ownMentorProfile&&<div className="grid" style={{gap:10,marginTop:16}}>
       <b>Published availability · Africa/Addis_Ababa</b><p className="muted">Saving replaces all existing weekly slots with this single slot. Review the current slots below before replacing them.</p>
       <div className="row" style={{flexWrap:"wrap"}}>
         <label>Day<select value={mentorDay} onChange={e=>setMentorDay(e.target.value)}>{["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((day,i)=><option key={day} value={String(i)}>{day}</option>)}</select></label>
         <label>From<input type="time" value={mentorStart} onChange={e=>setMentorStart(e.target.value)}/></label>
         <label>Until<input type="time" value={mentorEnd} onChange={e=>setMentorEnd(e.target.value)}/></label>
         <button className="btn btn-ghost" type="button" onClick={()=>void saveMentorAvailability()}>Save availability</button>
       </div>
       {(ownMentorProfile.availability||[]).map((slot,i)=><p className="muted" key={i}>{["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][slot.day_of_week]} · {String(slot.start_time).slice(0,5)}–{String(slot.end_time).slice(0,5)} · {slot.timezone}</p>)}
       <div className="row">
         {["draft","paused"].includes(ownMentorProfile.status)&&<button className="btn btn-primary" type="button" onClick={()=>void changeMentorProfileStatus("active")}>Activate profile</button>}
         {ownMentorProfile.status==="active"&&<button className="btn btn-ghost" type="button" onClick={()=>void changeMentorProfileStatus("paused")}>Pause profile</button>}
         {ownMentorProfile.status!=="closed"&&<button className="btn btn-ghost" type="button" onClick={()=>void changeMentorProfileStatus("closed")}>Close profile permanently</button>}
       </div>
     </div>}
   </Card>}
   <div className="footer-note">The matching score is not invented in this interface. Human governance and explicit acceptance remain authoritative.</div>
 </div>;
}

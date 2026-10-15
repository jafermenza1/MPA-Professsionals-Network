"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api, ApiError } from "../../lib/api";
import { useUiStore } from "../../lib/store";
import styles from "./card.module.css";

type CardSettings = {
  header_text:string; subtitle_text:string; footer_text:string; background_style:"geometric"|"gradient"|"midnight";
  background_start:string; background_end:string; accent_color:string; text_color:string; show_membership_type:boolean;
};
type MembershipCard = {
  membershipRecordId:string; membershipNumber:string; memberName:string; membershipType:string; productCode:string;
  status:string; startDate:string|null; endDate:string|null; profilePictureFileId:string|null; verificationPath:string; settings:CardSettings;
};
function dateLabel(value:string|null){ if(!value) return "No expiry"; const date=new Date(value); return Number.isNaN(date.getTime())?value:date.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"2-digit",timeZone:"UTC"}); }
export default function MembershipCardPage(){
  const token=useUiStore(s=>s.token),hydrateToken=useUiStore(s=>s.hydrateToken);
  const [membershipNumber,setMembershipNumber]=useState("");
  const [queryReady,setQueryReady]=useState(false);
  useEffect(()=>{setMembershipNumber(new URLSearchParams(window.location.search).get("membershipNumber")||"");setQueryReady(true);},[]);
  const [origin,setOrigin]=useState("");
  useEffect(()=>{hydrateToken();},[hydrateToken]);
  useEffect(()=>{setOrigin(window.location.origin);},[]);
  const [card,setCard]=useState<MembershipCard|null>(null);
  const [photo,setPhoto]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    let cancelled=false;
    if(!queryReady)return;
    if(!token){setLoading(false);return;}
    setLoading(true);
    const path=membershipNumber?"/api/v1/admin/membership-card?membershipNumber="+encodeURIComponent(membershipNumber):"/api/v1/membership/card";
    void api<MembershipCard>(path,{},token).then(value=>{if(!cancelled)setCard(value);}).catch(e=>{if(!cancelled)setError(e instanceof ApiError?e.message:"We couldn't load your membership card.");}).finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[token,membershipNumber,queryReady]);
  useEffect(()=>{
    if(!token||!card?.profilePictureFileId){setPhoto("");return;}
    let url="";
    let cancelled=false;
    void fetch("/api/v1/files/"+encodeURIComponent(card.profilePictureFileId),{headers:{Authorization:"Bearer "+token},cache:"no-store"})
      .then(async response=>{if(!response.ok)throw new Error("Photo unavailable");const blob=await response.blob();if(!cancelled){url=URL.createObjectURL(blob);setPhoto(url);}})
      .catch(()=>{if(!cancelled)setPhoto("");});
    return ()=>{cancelled=true;if(url)URL.revokeObjectURL(url);};
  },[token,card?.profilePictureFileId]);
  if(!token) return <main className={styles.shell}><section className={styles.panel}><h1>Membership ID</h1><p>Sign in with your member account to view and print your card.</p><a className={styles.primary} href={"/login?next="+encodeURIComponent(membershipNumber?"/membership/card?membershipNumber="+membershipNumber:"/membership/card")}>Sign in</a></section></main>;
  if(loading) return <main className={styles.shell}><p role="status">Loading membership card…</p></main>;
  if(error||!card) return <main className={styles.shell}><section className={styles.panel}><h1>Membership card unavailable</h1><p role="alert">{error||"No membership record is available for this account."}</p><a href="/membership">Open membership</a></section></main>;
  const s=card.settings;
  const verifyUrl=origin+card.verificationPath;
  const cardStyle={background:`linear-gradient(125deg,${s.background_start},${s.background_end})`,color:s.text_color,"--card-accent":s.accent_color} as CSSProperties;
  return <main className={styles.shell}>
    <div className={styles.toolbar}><div><p className={styles.eyebrow}>OFFICIAL MEMBER CREDENTIAL</p><h1>Membership ID</h1><p>ATM-size landscape card · 85.6 × 53.98 mm · Print or save as PDF</p></div><div className={styles.actions}><a href="/profile" className={styles.secondary}>Profile & photo</a><button type="button" onClick={()=>window.print()} className={styles.primary}>Print / Save PDF</button></div></div>
    <section className={styles.preview} aria-label="Membership ID card preview">
      <article className={`${styles.card} ${s.background_style==="midnight"?styles.midnight:""} ${s.background_style==="gradient"?styles.gradient:""}`} style={cardStyle}>
        <div className={styles.orbOne}/><div className={styles.orbTwo}/><div className={styles.lines}/>
        <header className={styles.cardHeader}><span className={styles.brandMark}>MPA</span><div className={styles.brandText}><strong>{s.header_text||"Muslim Professionals Association"}</strong><span>{s.subtitle_text||"Membership ID"}</span></div><span className={styles.status} data-status={card.status}>{card.status}</span></header>
        <div className={styles.cardBody}>
          <div className={styles.photoSide}>{photo?<img src={photo} alt="Member photograph"/>:<div className={styles.photoPlaceholder}><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="22" r="12" fill="currentColor" opacity=".92"/><path d="M9 57c1-13 10-21 23-21s22 8 23 21" fill="currentColor" opacity=".92"/></svg><span>MEMBER</span></div>}</div>
          <div className={styles.details}><p className={styles.memberName}>{card.memberName}</p>{s.show_membership_type&&<p className={styles.memberType}>{card.membershipType}</p>}<p className={styles.idLabel}>MEMBERSHIP ID</p><p className={styles.idValue}>{card.membershipNumber}</p><div className={styles.dates}><span>VALID FROM <b>{dateLabel(card.startDate)}</b></span><span>VALID UNTIL <b>{dateLabel(card.endDate)}</b></span></div></div>
          <div className={styles.qrSide}><div className={styles.qrFrame}><QRCodeSVG value={verifyUrl} size={132} level="M" includeMargin={false} bgColor="#FFFFFF" fgColor="#0A3258" /></div><span>SCAN TO VERIFY</span></div>
        </div>
        <footer className={styles.cardFooter}><span>{s.footer_text}</span><span className={styles.footerSeal}>● VERIFY ONLINE</span></footer>
      </article>
    </section>
    <p className={styles.note}>Your membership ID is issued by MPA and cannot be edited from this page. The QR code checks the current record online; a printed card is not proof of active status if the membership has expired, been suspended, or been revoked.</p>
  </main>;
}

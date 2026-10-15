"use client";
import { useEffect,useState } from "react";
import { api } from "../../../lib/api";
import styles from "./verify.module.css";
type Verification={valid:boolean;status:string;message:string;membershipNumber?:string;memberName?:string;membershipType?:string;startDate?:string|null;endDate?:string|null;verifiedAt?:string};
export default function MembershipVerificationPage(){
  const [record,setRecord]=useState("");
  const [token,setToken]=useState("");
  const [paramsReady,setParamsReady]=useState(false);
  useEffect(()=>{const params=new URLSearchParams(window.location.search);setRecord(params.get("record")||"");setToken(params.get("token")||"");setParamsReady(true);},[]);
  const [result,setResult]=useState<Verification|null>(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    let cancelled=false;
    if(!paramsReady)return;
    setLoading(true);
    if(!record||!token){setResult({valid:false,status:"invalid",message:"This verification link is incomplete."});setLoading(false);return;}
    void api<Verification>("/api/v1/public/membership-verification?record="+encodeURIComponent(record)+"&token="+encodeURIComponent(token))
      .then(data=>{if(!cancelled)setResult(data);})
      .catch(()=>{if(!cancelled)setResult({valid:false,status:"invalid",message:"We could not verify this membership. Check the QR code or contact MPA."});})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[record,token,paramsReady]);
  return <main className={styles.page}><section className={styles.sheet}>
    <div className={styles.brand}><span>MPA</span><div><strong>Muslim Professionals Association</strong><small>Membership verification</small></div></div>
    {loading?<p role="status" className={styles.message}>Checking the current membership record…</p>:<><div className={styles.status} data-valid={result?.valid?"true":"false"}><span>{result?.valid?"✓":"!"}</span><div><strong>{result?.valid?"Verified membership":result?.status==="invalid"?"Unable to verify":"Membership not active"}</strong><p>{result?.message}</p></div></div>
    {result?.membershipNumber&&<dl><div><dt>Member name</dt><dd>{result.memberName}</dd></div><div><dt>Membership ID</dt><dd>{result.membershipNumber}</dd></div><div><dt>Membership type</dt><dd>{result.membershipType}</dd></div><div><dt>Valid from</dt><dd>{result.startDate?String(result.startDate).slice(0,10):"—"}</dd></div><div><dt>Valid until</dt><dd>{result.endDate?String(result.endDate).slice(0,10):"No expiry recorded"}</dd></div><div><dt>Current status</dt><dd className={styles.statusText}>{result.status}</dd></div></dl>}
    <p className={styles.disclaimer}>This result is checked against the MPA membership record at the time of verification. A printed or saved card alone does not establish current membership status.</p></>}
    <footer>Official online verification · MPA</footer>
  </section></main>;
}

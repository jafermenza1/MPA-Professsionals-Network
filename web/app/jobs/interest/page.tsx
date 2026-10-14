"use client";
import { FormEvent, useState } from "react";
import { api, ApiError } from "../../../lib/api";
import { Card, Badge } from "../../../components/ui";

type Inquiry = { id: string; public_reference: string; continuationToken: string; nextStep?: string };
type ConsentResult = { employer_sharing_consent: boolean; nextStep?: string };
type ShareHistory = { shareId: string; organizationName: string; sharedFields: string[]; sharedAt: string; revokedAt?: string | null; status: string };

function labelsForHistory(field: string) { return ({ targetRole: "Target role", skills: "Skills", experience: "Experience", location: "Location", workMode: "Work mode", availability: "Availability", professionalSummary: "Professional summary", education: "Education", intent: "Applicant introduction", contactName: "Name", contactEmail: "Email address", contactPhone: "Phone number" } as Record<string,string>)[field] || field; }

const shareable = [
  ["targetRole", "Target role"],
  ["skills", "Skills"],
  ["experience", "Experience summary"],
  ["location", "Preferred location"],
  ["availability", "Availability"],
  ["contactEmail", "Email address (optional contact sharing)"],
  ["contactPhone", "Phone number (optional contact sharing)"],
] as const;

export default function JobInterestPage() {
  const [form, setForm] = useState({ contactName: "", contactEmail: "", contactPhone: "", targetRole: "", skills: "", experience: "", location: "", workMode: "", availability: "", intent: "" });
  const [processingConsent, setProcessingConsent] = useState(false);
  const [shareFields, setShareFields] = useState<string[]>(["targetRole", "skills"]);
  const [consentToProcess, setConsentToProcess] = useState(false);
  const [shareWithEmployers, setShareWithEmployers] = useState(false);
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [consentSaved, setConsentSaved] = useState(false);
  const [sharingHistory, setSharingHistory] = useState<ShareHistory[]>([]);
  const [sharingHistoryError, setSharingHistoryError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function update(key: keyof typeof form, value: string) { setForm(current => ({ ...current, [key]: value })); }
  function toggleField(field: string, checked: boolean) {
    setShareFields(current => checked ? [...new Set([...current, field])] : current.filter(item => item !== field));
  }
  async function refreshSharingHistory(item: Inquiry) {
    setSharingHistoryError("");
    try {
      const rows = await api<ShareHistory[]>("/api/v1/public/opportunity-inquiries/" + encodeURIComponent(item.public_reference) + "/sharing-history", { method: "POST", body: JSON.stringify({ token: item.continuationToken }) });
      setSharingHistory(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setSharingHistoryError(e instanceof ApiError ? e.message : "Sharing history could not be loaded. Retry without resubmitting your request.");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const created = await api<Inquiry>("/api/v1/public/opportunity-inquiries", {
        method: "POST",
        body: JSON.stringify({
          inquiryType: "job",
          contactName: form.contactName.trim(),
          contactEmail: form.contactEmail.trim() || null,
          contactPhone: form.contactPhone.trim() || null,
          targetRole: form.targetRole.trim(),
          skills: form.skills.split(",").map(value => value.trim()).filter(Boolean),
          experience: form.experience.trim(),
          location: form.location.trim(),
          workMode: form.workMode.trim(),
          availability: form.availability.trim(),
          intent: form.intent.trim() || "I would like to be considered for relevant opportunities even when no matching vacancy is currently listed.",
          consent: consentToProcess
        })
      });
      setInquiry(created);
      void refreshSharingHistory(created);
      if (shareWithEmployers) {
        setProcessingConsent(true);
        try {
          await api<ConsentResult>("/api/v1/public/opportunity-inquiries/" + encodeURIComponent(created.public_reference) + "/sharing-consent", {
            method: "POST",
            body: JSON.stringify({ token: created.continuationToken, employerSharingConsent: true, scope: "named_employer", fields: shareFields })
          });
          setConsentSaved(true);
          await refreshSharingHistory(created);
          setNotice("Your job-interest request was submitted. MPA Support Desk will review it. You opted in to sharing only the fields selected above with a named, verified employer after review; no employer has been given access yet.");
        } catch (consentError) {
          setNotice("Your job-interest request was submitted privately. Employer-sharing consent was not saved, so no employer sharing is enabled. Keep this page open and retry the consent step below.");
          setError(consentError instanceof ApiError ? consentError.message : "Consent could not be saved.");
        } finally { setProcessingConsent(false); }
      } else {
        setNotice("Your job-interest request was submitted privately to you and MPA Support Desk. It has not been shared with employers.");
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "We couldn't confirm submission. Your entries remain on this form; please retry.");
    } finally { setBusy(false); }
  }
  async function retryConsent() {
    if (!inquiry) return;
    setProcessingConsent(true); setError(""); setNotice("");
    try {
      await api<ConsentResult>("/api/v1/public/opportunity-inquiries/" + encodeURIComponent(inquiry.public_reference) + "/sharing-consent", {
        method: "POST",
        body: JSON.stringify({ token: inquiry.continuationToken, employerSharingConsent: true, scope: "named_employer", fields: shareFields })
      });
      setConsentSaved(true);
      await refreshSharingHistory(inquiry);
      setNotice("Your sharing preference is saved. MPA Support Desk must still review the request and select a named, verified employer before anything is shared.");
    } catch (e) { setError(e instanceof ApiError ? e.message : "Consent could not be saved. No employer sharing is enabled."); }
    finally { setProcessingConsent(false); }
  }
  async function revokeConsent() {
    if (!inquiry) return;
    setProcessingConsent(true); setError(""); setNotice("");
    try {
      await api<ConsentResult>("/api/v1/public/opportunity-inquiries/" + encodeURIComponent(inquiry.public_reference) + "/sharing-consent", {
        method: "POST",
        body: JSON.stringify({ token: inquiry.continuationToken, employerSharingConsent: false })
      });
      setConsentSaved(false);
      setShareWithEmployers(false);
      await refreshSharingHistory(inquiry);
      setNotice("Employer-sharing consent was revoked. Existing employer access has been revoked; the request remains private to MPA Support Desk.");
    } catch (e) { setError(e instanceof ApiError ? e.message : "We couldn't confirm consent revocation. Please retry."); }
    finally { setProcessingConsent(false); }
  }

  return <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 18 }}>
    <div>
      <div className="eyebrow">Employment & opportunity hub</div>
      <h1 className="h1">Tell MPA what kind of work you’re seeking.</h1>
      <p className="muted">You can register interest even when no suitable vacancy is listed. Your request stays private to you and MPA Support Desk unless you separately opt in to named-employer sharing.</p>
    </div>
    {inquiry ? <Card>
      <Badge>{consentSaved ? "Request submitted · consent recorded" : "Request submitted · private by default"}</Badge>
      <h2 className="h2" style={{ marginTop: 12 }}>Your reference: {inquiry.public_reference}</h2>
      <p>{notice || inquiry.nextStep || "MPA Support Desk will review your request and determine an appropriate next step."}</p>
      {error ? <p role="alert" style={{ color: "var(--danger, #b91c1c)" }}>{error}</p> : null}
      {!consentSaved ? <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><input type="checkbox" checked={shareWithEmployers} onChange={e => setShareWithEmployers(e.target.checked)} />I explicitly opt in to named-employer sharing now. This is optional and separate from submitting my request.</label>
        {shareWithEmployers ? <div style={{ display: "grid", gap: 8 }}>{shareable.map(([field,label]) => <label key={field} style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="checkbox" checked={shareFields.includes(field)} onChange={e => toggleField(field,e.target.checked)} />{label}</label>)}<button className="btn btn-primary" type="button" disabled={processingConsent || !shareFields.length} onClick={() => void retryConsent()}>{processingConsent ? "Saving consent…" : "Save explicit sharing consent"}</button></div> : <p className="muted">Your request remains private. No employer can access it.</p>}
      </div> : <button className="btn btn-ghost" type="button" disabled={processingConsent} onClick={() => void revokeConsent()}>{processingConsent ? "Updating…" : "Revoke employer-sharing consent"}</button>}
      <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}><h3 className="h2">Employer sharing history</h3><button className="btn btn-ghost" type="button" onClick={() => void refreshSharingHistory(inquiry)}>Refresh history</button></div>
        {sharingHistoryError ? <p role="alert">{sharingHistoryError}</p> : null}
        {sharingHistory.length ? sharingHistory.map(item => <div key={item.shareId} className="case-row"><b>{item.organizationName}</b><p className="muted">Fields shared: {item.sharedFields.map(field => labelsForHistory(field)).join(", ")} · {new Date(item.sharedAt).toLocaleString()}</p><Badge>{item.status}</Badge>{item.revokedAt ? <p className="muted">Access revoked {new Date(item.revokedAt).toLocaleString()}.</p> : null}</div>) : <p className="muted">No employer has received this request. If you opted in, Support Desk review is still required before any sharing.</p>}
      </div>
      <p className="muted">Consent permits only the selected fields to be shared with a specific verified organization after Support Desk review. It does not guarantee a vacancy, interview or job offer.</p>
    </Card> : <Card>
      <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
        <h2 className="h2">Your job-interest request</h2>
        <div className="grid grid-2">
          <label>Your name<input required maxLength={200} value={form.contactName} onChange={e => update("contactName", e.target.value)} /></label>
          <label>Email (optional if phone provided)<input type="email" maxLength={320} value={form.contactEmail} onChange={e => update("contactEmail", e.target.value)} /></label>
          <label>Phone (optional if email provided)<input maxLength={80} value={form.contactPhone} onChange={e => update("contactPhone", e.target.value)} /></label>
          <label>Target role / occupation<input required maxLength={500} value={form.targetRole} onChange={e => update("targetRole", e.target.value)} placeholder="What kind of work are you seeking?" /></label>
          <label>Skills (comma separated for now)<input maxLength={2000} value={form.skills} onChange={e => update("skills", e.target.value)} /></label>
          <label>Preferred location<input maxLength={300} value={form.location} onChange={e => update("location", e.target.value)} placeholder="City or region" /></label>
          <label>Work mode<input maxLength={100} value={form.workMode} onChange={e => update("workMode", e.target.value)} placeholder="On-site, hybrid, remote" /></label>
          <label>Availability<input maxLength={500} value={form.availability} onChange={e => update("availability", e.target.value)} placeholder="When could you start?" /></label>
        </div>
        <label>Experience summary<textarea maxLength={3000} rows={3} value={form.experience} onChange={e => update("experience", e.target.value)} /></label>
        <label>Anything else MPA should know<textarea maxLength={2000} rows={3} value={form.intent} onChange={e => update("intent", e.target.value)} /></label>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><input type="checkbox" required checked={consentToProcess} onChange={e => setConsentToProcess(e.target.checked)} />I agree that MPA may receive and review this job-interest request to assess possible opportunities. This does not authorize employer sharing.</label>
        <Card>
          <h3 className="h2">Optional: consent to named-employer sharing</h3>
          <p className="muted">Off by default. If selected, MPA Support Desk may share only the fields you choose with a specific verified organization after review. Contact details are not selected by default.</p>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><input type="checkbox" checked={shareWithEmployers} onChange={e => setShareWithEmployers(e.target.checked)} />I explicitly opt in to sharing selected information with a named, verified employer after MPA Support Desk review.</label>
          {shareWithEmployers ? <div style={{ display: "grid", gap: 8, marginTop: 10 }}>{shareable.map(([field,label]) => <label key={field} style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="checkbox" checked={shareFields.includes(field)} onChange={e => toggleField(field,e.target.checked)} />{label}</label>)}</div> : null}
        </Card>
        {error ? <p role="alert" style={{ color: "var(--danger, #b91c1c)" }}>{error}</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <button className="btn btn-primary" type="submit" disabled={busy || processingConsent}>{busy ? "Submitting…" : "Submit job-interest request"}</button>
          <a className="btn btn-ghost" href="/jobs">Return to listed jobs</a>
        </div>
      </form>
    </Card>}
  </div>;
}

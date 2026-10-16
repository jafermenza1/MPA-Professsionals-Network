"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../../lib/api";
import { Card, Badge } from "../../../components/ui";
import { useUiStore } from "../../../lib/store";

type Demand = {
  id: string; job_id: string | null; public_reference: string; inquiry_type: string; status: string;
  contact_name: string; contact_email?: string | null; contact_phone?: string | null; intent?: string | null;
  details?: Record<string, unknown> | string; job_title?: string | null;
  employer_sharing_consent: boolean; employer_sharing_scope: string; employer_sharing_fields: string[] | string;
  employer_sharing_consented_at?: string | null; employer_sharing_revoked_at?: string | null;
};
type Organization = { id: string; display_name?: string | null; legal_name: string };
type Choice = { organizationId: string; fields: string[] };
const labels: Record<string,string> = { targetRole:"Target role", skills:"Skills", experience:"Experience", location:"Location", workMode:"Work mode", availability:"Availability", professionalSummary:"Professional summary", education:"Education", intent:"Applicant introduction", contactName:"Name", contactEmail:"Email address", contactPhone:"Phone number" };

export default function JobSeekerDemandSupportPage() {
  const token = useUiStore(s => s.token);
  const [items, setItems] = useState<Demand[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [choices, setChoices] = useState<Record<string,Choice>>({});
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!token) { setItems([]); setOrganizations([]); setError("Sign in with an authorized MPA Support Desk account to review job-seeker demand."); return; }
    setLoading(true); setError(""); setNotice("");
    try {
      const [rows, orgs] = await Promise.all([
        api<Demand[]>("/api/v1/opportunity-inquiries?type=job", {}, token),
        api<Organization[]>("/api/v1/support/job-seeker-demands/organizations", {}, token)
      ]);
      const demands = (Array.isArray(rows) ? rows : []).filter(item => item.inquiry_type === "job" && !item.job_id);
      setItems(demands);
      setOrganizations(Array.isArray(orgs) ? orgs : []);
      setChoices(current => {
        const next = { ...current };
        for (const item of demands) {
          const consented = Array.isArray(item.employer_sharing_fields) ? item.employer_sharing_fields : typeof item.employer_sharing_fields === "string" ? JSON.parse(item.employer_sharing_fields || "[]") : [];
          if (!next[item.id]) next[item.id] = { organizationId: "", fields: consented.filter((field: string) => labels[field]) };
          else next[item.id] = { ...next[item.id], fields: next[item.id].fields.filter(field => consented.includes(field)) };
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "We couldn't load the Support Desk queue. Retry without closing this page.");
    } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  function updateChoice(id: string, patch: Partial<Choice>) {
    const defaults: Choice = { organizationId: "", fields: [] };
    setChoices(current => ({ ...current, [id]: { ...defaults, ...current[id], ...patch } }));
  }
  async function share(item: Demand) {
    const choice = choices[item.id];
    if (!choice?.organizationId || !choice.fields.length) { setError("Select a verified organization and at least one consented field."); return; }
    setBusyId(item.id); setError(""); setNotice("");
    try {
      const result = await api<{reference:string;organizationId:string;sharedFields:string[];sharedAt:string}>("/api/v1/support/job-seeker-demands/" + encodeURIComponent(item.id) + "/share", {
        method: "POST", body: JSON.stringify({ organizationId: choice.organizationId, fields: choice.fields })
      }, token || undefined);
      setNotice("Demand " + result.reference + " was shared with the selected organization using only the consented fields.");
      await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Sharing was not confirmed. The request remains private; please retry."); }
    finally { setBusyId(""); }
  }

  return <div style={{ display: "grid", gap: 18, minWidth: 0 }}>
    <div>
      <div className="eyebrow">MPA Support Desk</div>
      <h1 className="h1">Job-seeker demand and consent</h1>
      <p className="muted">Requests without a linked vacancy stay private unless the applicant explicitly opts in. Sharing is allowed only to a verified organization, only with fields in the applicant's current consent, and every share is audited.</p>
    </div>
    <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
      <Badge>{items.length} no-vacancy requests</Badge>
      <button className="btn btn-ghost" type="button" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh queue"}</button>
    </div>
    {error ? <Card><p role="alert">{error}</p><button className="btn btn-ghost" type="button" onClick={() => void load()}>Retry</button></Card> : null}
    {notice ? <Card><p role="status">{notice}</p></Card> : null}
    {!loading && !items.length && !error ? <Card><h2 className="h2">No no-vacancy requests in the queue</h2><p className="muted">New requests will appear here after applicants submit a job-interest request.</p></Card> : null}
    {items.map(item => {
      const raw = item.employer_sharing_fields;
      const consented = Array.isArray(raw) ? raw : typeof raw === "string" ? JSON.parse(raw || "[]") : [];
      const choice = choices[item.id] || { organizationId: "", fields: [] };
      const canShare = item.employer_sharing_consent === true && item.employer_sharing_scope === "named_employer" && !item.employer_sharing_revoked_at;
      return <Card key={item.id}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <h2 className="h2">{item.public_reference}</h2>
          <Badge>{canShare ? "Named-employer consent recorded" : "Private · no current sharing consent"}</Badge>
        </div>
        <p><b>Applicant:</b> {item.contact_name} · <b>Status:</b> {item.status}</p>
        <p>{item.intent || "No introduction supplied."}</p>
        <p className="muted">Received {item.employer_sharing_consented_at ? "with sharing consent on " + new Date(item.employer_sharing_consented_at).toLocaleString() : "without employer-sharing consent"}.</p>
        {canShare ? <div style={{ display: "grid", gap: 12 }}>
          <label>Verified organization
            <select value={choice.organizationId} onChange={e => updateChoice(item.id,{organizationId:e.target.value})} required>
              <option value="">Select one organization</option>
              {organizations.map(org => <option key={org.id} value={org.id}>{org.display_name || org.legal_name}</option>)}
            </select>
          </label>
          <div><b>Fields allowed by the applicant</b><div className="grid grid-2" style={{ marginTop: 8 }}>
            {consented.filter((field:string) => labels[field]).map((field:string) => <label key={field} style={{ display:"flex", gap:8, alignItems:"center" }}>
              <input type="checkbox" checked={choice.fields.includes(field)} onChange={e => updateChoice(item.id,{fields:e.target.checked?[...new Set([...choice.fields,field])]:choice.fields.filter(x=>x!==field)})} />{labels[field]}
            </label>)}
          </div></div>
          <button className="btn btn-primary" type="button" disabled={busyId===item.id || !choice.organizationId || !choice.fields.length} onClick={() => void share(item)}>{busyId===item.id ? "Sharing…" : "Share selected fields with this organization"}</button>
        </div> : <p className="muted">Do not share this request. Ask the applicant to update consent through their secure continuation link if they wish to opt in.</p>}
      </Card>;
    })}
  </div>;
}

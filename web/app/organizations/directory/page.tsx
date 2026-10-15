"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Building2, ExternalLink, MapPin, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { Card, Badge } from "../../../components/ui";
import { DiscoveryPagination } from "../../../components/discovery-pagination";
import { api, ApiError } from "../../../lib/api";
import { Bookmark } from "lucide-react";
import { useSavedDiscoveryItems } from "../../../lib/use-saved-discovery-items";

type PublicOrganization = {
  id: string;
  display_name: string;
  organization_type?: string | null;
  description?: string | null;
  website?: string | null;
  location_label?: string | null;
};
type DirectoryResult = { items: PublicOrganization[]; hasMore?: boolean; total?: number };
const PAGE_SIZE = 20;
const EMPTY = { q: "", organizationType: "", location: "" };

export default function OrganizationDirectory() {
  const savedItems = useSavedDiscoveryItems();
  const [filters, setFilters] = useState(EMPTY);
  const [items, setItems] = useState<PublicOrganization[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (criteria: typeof EMPTY, pageIndex = 0) => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(criteria)) if (value.trim()) params.set(key, value.trim());
      params.set("limit", String(PAGE_SIZE)); params.set("offset", String(pageIndex * PAGE_SIZE));
      const result = await api<DirectoryResult>("/api/v1/public/organizations?" + params.toString());
      const rows = Array.isArray(result?.items) ? result.items : [];
      setItems(rows); setHasMore(Boolean(result?.hasMore)); setTotal(Number.isFinite(result?.total) ? Number(result.total) : null); setPage(pageIndex);
    } catch (cause) {
      setItems([]); setHasMore(false); setTotal(null);
      setError(cause instanceof ApiError ? cause.message : "We couldn't load the public organization directory.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(EMPTY, 0); }, [load]);
  function submit(event: FormEvent) { event.preventDefault(); void load(filters, 0); }
  function clear() { setFilters(EMPTY); void load(EMPTY, 0); }

  return <main className="grid" style={{ gap: 18 }}>
    <header>
      <div className="eyebrow">Verified organization directory</div>
      <h1 className="h1">Find organizations in the MPA network.</h1>
      <p className="muted">Only organizations that are verified and explicitly public are listed. Private organization workspaces and member information are not exposed by this directory.</p>
    </header>
    <Card>
      <form onSubmit={submit} className="grid grid-2" style={{ gap: 12 }}>
        <label>Organization name or expertise<input value={filters.q} onChange={event => setFilters(current => ({ ...current, q: event.target.value }))} placeholder="Search name or description" /></label>
        <label>Organization type<input value={filters.organizationType} onChange={event => setFilters(current => ({ ...current, organizationType: event.target.value }))} placeholder="e.g. education, industry" /></label>
        <label>City or location<input value={filters.location} onChange={event => setFilters(current => ({ ...current, location: event.target.value }))} placeholder="City or region" /></label>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <button className="btn btn-primary" type="submit" disabled={loading}><Search size={16} /> Search organizations</button>
          <button className="btn btn-ghost" type="button" onClick={clear} disabled={loading}>Clear filters</button>
        </div>
      </form>
    </Card>
    {error && <div className="form-error" role="alert">{error}<button className="btn btn-ghost" type="button" onClick={() => void load(filters, page)}>Retry</button></div>}{savedItems.savedError&&<div className="form-error" role="status">{savedItems.savedError}</div>}
    {!loading && !error && <p className="muted" aria-live="polite">{total === null ? items.length + " organizations loaded" : total + " verified public organizations match your search."}</p>}
    {loading ? <Card><div className="row"><RefreshCw size={18} /><p className="muted">Loading verified public organizations…</p></div></Card>
      : items.length === 0 && !error ? <Card><h2 className="h2">No matching organizations</h2><p className="muted">Try a broader name, type or location. Private or unverified organizations are intentionally excluded.</p></Card>
      : <div className="grid grid-2">{items.map(org => <Card key={org.id}>
        <div className="row"><div className="avatar"><Building2 size={22} /></div><div style={{ flex: 1, minWidth: 0 }}><h2 className="h2">{org.display_name}</h2><p className="tagline">{org.organization_type || "MPA network organization"}</p></div><Badge><ShieldCheck size={13} /> Verified</Badge></div>
        <button className="btn btn-ghost" type="button" disabled={!savedItems.signedIn||savedItems.isSaving("organization",org.id)} aria-pressed={savedItems.isSaved("organization",org.id)} onClick={()=>void savedItems.toggle("organization",org.id)}><Bookmark size={16}/>{savedItems.isSaved("organization",org.id)?"Saved":"Save organization"}</button>
        {org.description && <p className="muted" style={{ marginTop: 12 }}>{org.description}</p>}
        {org.location_label && <p className="tagline"><MapPin size={14} /> {org.location_label}</p>}
        <Link className="btn btn-primary" href={"/organizations/directory/"+encodeURIComponent(org.id)}>View organization profile</Link>
        {org.website && /^https:\/\//i.test(org.website) && <a className="btn btn-ghost" href={org.website} target="_blank" rel="noreferrer">Public website <ExternalLink size={14} /></a>}
      </Card>)}</div>}
    {!loading && !error && items.length > 0 && <DiscoveryPagination page={page} pageSize={PAGE_SIZE} itemCount={items.length} hasMore={hasMore} disabled={loading} label="organizations" onPageChange={next => void load(filters, next)} />}
  </main>;
}

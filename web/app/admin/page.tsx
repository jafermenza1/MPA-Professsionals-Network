"use client";
import {
  Edit3,
  FlaskConical,
  HelpCircle,
  Mail,
  PauseCircle,
  PlayCircle,
  Save,
  Search,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { Card, Badge } from "../../components/ui";
import { api } from "../../lib/api";
import { useUiStore } from "../../lib/store";
import { UsersTable, type ManagedRole, type ManagedUser } from "./users-table";
import { AdminPageHeader } from "./admin-page-header";

type Demo = {
  id: string;
  case_key: string;
  title: string;
  business_area: string;
  persona: string;
  description: string;
  start_path: string;
  scenario: any;
  active: boolean;
};
type Guide = {
  id: string;
  guide_key: string;
  route_pattern: string;
  title: string;
  description: string;
  steps: any[];
  active: boolean;
};
type CurrentUser = { user_id: string; roles: string[] };
type ManagedPermission = { permission_code: string; area: string; label: string; description: string; sensitive: boolean; system_only: boolean };
type Inquiry = {
  id: string;
  public_reference: string;
  inquiry_type: string;
  status: string;
  consider_non_member: boolean;
  contact_name: string;
  contact_email?: string;
  contact_phone?: string;
  intent: string;
  details: any;
  job_title?: string;
  preferred_mentor_name?: string;
};


export default function AdminPage() {
  const hydrated = useUiStore((s) => s.hydrated);
  const token = useUiStore((s) => s.token);
  const hydrateToken = useUiStore((s) => s.hydrateToken);
  const [tab, setTab] = useState<"cases" | "guides" | "inquiries" | "users">("cases");
  const [cases, setCases] = useState<Demo[]>([]);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roleCatalog, setRoleCatalog] = useState<ManagedRole[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<ManagedPermission[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [scopeResolved, setScopeResolved] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [canReviewInquiries, setCanReviewInquiries] = useState(false);
  const [error, setError] = useState("");
  const [sectionErrors, setSectionErrors] = useState<string[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [userStatus, setUserStatus] = useState("");
  const [editing, setEditing] = useState<Demo | null>(null);

  useEffect(() => { hydrateToken(); }, [hydrateToken]);

  async function load() {
    if (!token) return;
    setError("");
    const errors: string[] = [];
    const getList = async <T,>(path: string, key?: string): Promise<T[]> => {
      const payload = await api<any>(path, {}, token);
      const rows = Array.isArray(payload) ? payload : (key && Array.isArray(payload?.[key]) ? payload[key] : Array.isArray(payload?.items) ? payload.items : null);
      if (!rows) throw new Error("The service returned an unexpected list response for " + path + ".");
      return rows as T[];
    };
    const settle = async <T,>(name: string, request: Promise<T>, apply: (value: T) => void) => {
      try { apply(await request); } catch (cause) {
        errors.push(name);
        if (cause instanceof Error && !error) setError(cause.message);
      }
    };
    const tasks: Promise<void>[] = [
      settle("demo cases", getList<Demo>("/api/v1/experience/demo-cases", "cases"), setCases),
      settle("user guides", getList<Guide>("/api/v1/experience/guides", "guides"), setGuides),
      settle("opportunity inquiries", getList<Inquiry>("/api/v1/opportunity-inquiries", "inquiries"), setInquiries),
    ];
    if (userQuery.trim() || userStatus) {
      const params = new URLSearchParams();
      if (userQuery.trim()) params.set("q", userQuery.trim());
      if (userStatus) params.set("status", userStatus);
      params.set("limit", "200");
      tasks.push(settle("users", getList<ManagedUser>("/api/v1/admin/users?" + params.toString(), "users"), setUsers));
    } else {
      tasks.push(settle("users", getList<ManagedUser>("/api/v1/admin/users?limit=200", "users"), setUsers));
    }
    try {
      const catalog = await api<any>("/api/v1/admin/roles", {}, token);
      const normalizedCatalog = Array.isArray(catalog) ? catalog : (Array.isArray(catalog?.roles) ? catalog.roles : []);
      setRoleCatalog(normalizedCatalog as ManagedRole[]);
      let claims: any = {};
      try { const segment = token.split(".")[1]; if (segment) claims = JSON.parse(atob(segment.replace(/-/g, "+").replace(/_/g, "/"))); } catch { /* Display hints only; server authorization remains authoritative. */ }
      const currentRoles = Array.isArray(claims?.roles) ? claims.roles.map((role: any) => typeof role === "string" ? role : role?.role_code).filter(Boolean) : [];
      setRoles(currentRoles);
      setCurrentUserId(String(claims?.sub ?? claims?.user_id ?? ""));
      setIsPlatformAdmin(currentRoles.includes("system_admin") || currentRoles.includes("admin") || currentRoles.includes("platform_admin"));
      setCanReviewInquiries(currentRoles.includes("supporting_staff") || currentRoles.includes("system_admin") || currentRoles.includes("admin") || currentRoles.includes("platform_admin"));
      if (currentRoles.includes("system_admin")) {
        try { const permissions = await api<ManagedPermission[]>("/api/v1/admin/permissions", {}, token); setPermissionCatalog(Array.isArray(permissions) ? permissions : []); }
        catch { errors.push("permission catalog"); }
      } else setPermissionCatalog([]);
      setScopeResolved(true);
    } catch (cause) {
      setScopeResolved(true);
      if (cause instanceof Error) setError(cause.message);
    }
    await Promise.all(tasks);
    setSectionErrors(errors);
  }

  useEffect(() => {
    if (hydrated && token) void load();
  }, [hydrated, token]);

  async function patchCase(item: Demo, active: boolean) {
    try {
      await api("/api/v1/admin/experience/demo-cases/" + item.id, { method: "PATCH", body: JSON.stringify({ active }) }, token);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the demo case."); }
  }
  async function patchGuide(item: Guide, active: boolean) {
    try {
      await api("/api/v1/admin/experience/guides/" + item.id, { method: "PATCH", body: JSON.stringify({ active }) }, token);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the guide."); }
  }
  async function decideInquiry(item: Inquiry, status: string, considerNonMember: boolean) {
    try {
      await api("/api/v1/opportunity-inquiries/" + item.id, { method: "PATCH", body: JSON.stringify({ status, consider_non_member: considerNonMember }) }, token);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the inquiry."); }
  }
  function launch(item: Demo) {
    if (!item.active) return;
    if (typeof window !== "undefined") window.location.assign(item.start_path || "/");
  }

  if (!hydrated) return <div className="auth-page"><Card><p className="muted">Loading administrator workspace…</p></Card></div>;
  if (!token)

    return (
      <div className="auth-page">
        <Card>
          <div className="eyebrow">Platform administration</div>
          <h1 className="h1">Administrator sign-in required.</h1>
          <p className="muted">
            This workspace contains global platform controls. Reviewers should
            use their assigned workflow queues; organization access is managed
            in the organization workspace.
          </p>
          <a className="btn btn-primary" href="/login?next=/admin">
            Sign in to continue
          </a>
          <a
            className="btn btn-ghost"
            href="/dashboard"
            style={{ marginLeft: 8 }}
          >
            Personal dashboard
          </a>
        </Card>
      </div>
    );
  if (
    scopeResolved &&
    !error &&
    !isPlatformAdmin &&
    !roles.includes("supporting_staff")
  )
    return (
      <div className="auth-page">
        <Card>
          <div className="eyebrow">Platform administration</div>
          <h1 className="h1">This account has no platform-admin scope.</h1>
          <p className="muted">
            Use your personal dashboard, assigned review queues, or an
            organization workspace. Platform roles do not replace organization
            membership.
          </p>
          <a className="btn btn-primary" href="/dashboard">
            Open personal dashboard
          </a>
        </Card>
      </div>
    );
  return (
    <div className="grid">
      <AdminPageHeader eyebrow="Platform administration" title="Operate the platform." description="Global account controls are separate from organization roles and business review decisions. Your authority comes from the current account roles shown below." actions={<div className="grid" style={{gap:8}}><div className="row" style={{flexWrap:"wrap"}}>{roles.map((role) => <Badge key={role} tone="slate">{role}</Badge>)}</div><div className="row" style={{flexWrap:"wrap"}}>{(isPlatformAdmin || roles.includes("supporting_staff")) && <a className="btn btn-ghost" href="/support/job-seeker-demands">Review job-seeker demand and consent</a>}{isPlatformAdmin && <a className="btn btn-ghost" href="/admin/reference-portfolio">Manage professional reference lists and CSV imports</a>}{isPlatformAdmin && <a className="btn btn-ghost" href="/admin/reports">Reports and PDF/XLSX exports</a>}{isPlatformAdmin && <a className="btn btn-ghost" href="/admin/members">Bulk approved-member import/export</a>}{isPlatformAdmin && <a className="btn btn-ghost" href="/admin/email"><Mail size={16} /> Email operations</a>}{(isPlatformAdmin || roles.includes("supporting_staff")) && <a className="btn btn-primary" href="/admin/marketplace">Review marketplace listings and service/mentorship demand</a>}</div></div>}/>
      {error && (
        <div className="field-banner">
          <ShieldCheck size={18} />
          <span>{error}</span>
        </div>
      )}
      {sectionErrors.length > 0 && (
        <div className="field-banner" role="status">
          <ShieldCheck size={18} />
          <span>
            These sections could not be loaded: {sectionErrors.join(", ")}.
            Other authorized sections remain available.
          </span>
        </div>
      )}
      <div className="admin-tabs">
        {(
          [
            ...(isPlatformAdmin
              ? [
                  ["cases", "Demo cases", cases.length],
                  ["guides", "User guides", guides.length],
                  ["users", "Users & roles", users.length],
                ]
              : []),
            ...(canReviewInquiries
              ? [["inquiries", "Opportunity inquiries", inquiries.length]]
              : []),
          ] as [typeof tab, string, number][]
        ).map(([key, label, count]) => (
          <button
            key={key}
            className={
              "btn admin-tab " + (tab === key ? "btn-primary" : "btn-ghost")
            }
            onClick={() => setTab(key)}
          >
            {key === "cases" ? (
              <FlaskConical size={16} />
            ) : key === "guides" ? (
              <HelpCircle size={16} />
            ) : key === "inquiries" ? (
              <UserCog size={16} />
            ) : (
              <ShieldCheck size={16} />
            )}{" "}
            {label} ({count})
          </button>
        ))}
      </div>
      {tab === "cases" && (
        <Card>
          <div className="row">
            <div>
              <div className="h2">Business scenario catalogue</div>
              <div className="muted">
                Controlled experiences for training, UAT and stakeholder
                walkthroughs.
              </div>
            </div>
          </div>
          {cases.map((d) => (
            <div className="case-row" key={d.id}>
              <div>
                <div className="row" style={{ justifyContent: "flex-start" }}>
                  <b>{d.title}</b>
                  <Badge tone={d.active ? "green" : "slate"}>
                    {d.active ? "Active" : "Paused"}
                  </Badge>
                </div>
                <div className="muted">
                  {d.business_area} · {d.persona}
                </div>
                <p className="muted">{d.description}</p>
              </div>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button className="btn btn-ghost" onClick={() => setEditing(d)}>
                  <Edit3 size={15} /> Edit
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => launch(d)}
                  disabled={!d.active}
                >
                  <PlayCircle size={15} /> Play
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => patchCase(d, !d.active)}
                >
                  {d.active ? (
                    <PauseCircle size={15} />
                  ) : (
                    <PlayCircle size={15} />
                  )}{" "}
                  {d.active ? "Pause" : "Activate"}
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}
      {tab === "guides" && (
        <Card>
          <div className="h2">Contextual walkthroughs</div>
          <p className="muted">
            Guides spotlight real controls and explain each workspace
            step-by-step.
          </p>
          {guides.map((g) => (
            <div className="case-row" key={g.id}>
              <div>
                <div className="row" style={{ justifyContent: "flex-start" }}>
                  <b>{g.title}</b>
                  <Badge>{g.route_pattern}</Badge>
                </div>
                <div className="muted">{g.description}</div>
                <small className="muted">{g.steps.length} guided steps</small>
              </div>
              <button
                className="btn btn-ghost"
                onClick={() => patchGuide(g, !g.active)}
              >
                {g.active ? (
                  <PauseCircle size={15} />
                ) : (
                  <PlayCircle size={15} />
                )}{" "}
                {g.active ? "Disable" : "Enable"}
              </button>
            </div>
          ))}
        </Card>
      )}
      {tab === "inquiries" && canReviewInquiries && (
        <Card>
          <div className="h2">Public opportunity inquiries</div>
          <p className="muted">
            This is the supporting-staff inquiry workflow. Non-member
            consideration does not bypass membership, verification or ATS
            governance.
          </p>
          {inquiries.length === 0 ? (
            <p className="muted">No inquiries are waiting.</p>
          ) : (
            inquiries.map((i) => (
              <div className="case-row" key={i.id}>
                <div>
                  <div className="row" style={{ justifyContent: "flex-start" }}>
                    <b>{i.contact_name}</b>
                    <Badge>{i.inquiry_type}</Badge>
                    <Badge tone="slate">{i.status}</Badge>
                  </div>
                  <div className="muted">
                    {i.job_title ||
                      i.preferred_mentor_name ||
                      "General inquiry"}{" "}
                    · {i.contact_email || i.contact_phone}
                  </div>
                  <p className="muted">{i.intent}</p>
                  <small className="muted">
                    Reference {i.public_reference} · details{" "}
                    {i.details && Object.keys(i.details).length
                      ? "received"
                      : "not yet received"}
                  </small>
                </div>
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  <button
                    className="btn btn-ghost"
                    onClick={() => decideInquiry(i, "considering", true)}
                  >
                    Consider non-member
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() =>
                      decideInquiry(i, "invited", i.consider_non_member)
                    }
                  >
                    Invite / continue
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => decideInquiry(i, "declined", false)}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))
          )}
        </Card>
      )}
      {tab === "users" && isPlatformAdmin && (
        <Card>
          <div className="h2">Accounts and platform roles</div>
          <p className="muted">
            Account records are retained for audit and history. Suspend or
            disable access rather than deleting an account. Each action needs a
            reason in that account’s row. Invitations are not implemented yet.
          </p>
          <form
            className="row"
            style={{ flexWrap: "wrap", margin: "14px 0" }}
            onSubmit={(event) => {
              event.preventDefault();
              void load();
            }}
          >
            <label style={{ flex: "1 1 240px" }}>
              Search accounts
              <input
                value={userQuery}
                onChange={(event) => setUserQuery(event.target.value)}
                placeholder="Email or username"
              />
            </label>
            <label>
              Status
              <select
                value={userStatus}
                onChange={(event) => setUserStatus(event.target.value)}
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
            <button className="btn btn-primary" type="submit">
              <Search size={15} /> Search
            </button>
          </form>
          <p className="muted">
            Showing up to 200 matching accounts. “Remove role” changes a
            platform role only; organization/job roles remain in their own
            scoped workspaces.
          </p>
          <UsersTable
            users={users}
            roleCatalog={roleCatalog}
            permissionCatalog={permissionCatalog}
            currentRoles={roles}
            currentUserId={currentUserId}
            token={token}
            onChanged={load}
            onError={setError}
            usersLoadFailed={sectionErrors.includes('users')}
          />
        </Card>
      )}
      {editing && (
        <CaseEditor
          demo={editing}
          token={token}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
      <div className="footer-note">
        Amanah (Trust) · Tabayyun (Verification) · Satr (Confidentiality) ·
        Ihsan (Excellence)
      </div>
    </div>
  );
}
function CaseEditor({
  demo,
  token,
  onClose,
  onSaved,
}: {
  demo: Demo;
  token: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(demo.title),
    [description, setDescription] = useState(demo.description),
    [persona, setPersona] = useState(demo.persona),
    [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await api(
        "/api/v1/admin/experience/demo-cases/" + demo.id,
        {
          method: "PATCH",
          body: JSON.stringify({ title, description, persona }),
        },
        token,
      );
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="guide-overlay">
      <div className="guide-dim" onClick={onClose} />
      <aside className="guide-card">
        <div className="row">
          <b>Edit demo case</b>
          <button className="icon-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={field}
          />
        </label>
        <label>
          Persona
          <input
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            style={field}
          />
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            style={field}
          />
        </label>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          <Save size={15} /> {saving ? "Saving…" : "Save changes"}
        </button>
      </aside>
    </div>
  );
}
const field: CSSProperties = {
  padding: 10,
  border: "1px solid var(--border)",
  borderRadius: 10,
  background: "var(--bg)",
  color: "var(--text)",
};

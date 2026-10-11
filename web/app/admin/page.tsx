"use client";
import {
  Edit3,
  FlaskConical,
  HelpCircle,
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

            Account records are retained for audit and history. Suspend or
            disable access rather than deleting an account. Each action needs a
            reason in that account’s row. Invitations are not implemented yet.
  const hydrated = useUiStore((s) => s.hydrated);
  const [tab, setTab] = useState<"cases" | "guides" | "inquiries" | "users">(
            Showing up to 200 matching accounts. “Remove role” changes a
            platform role only; organization/job roles remain in their scoped
            workspaces.
  const [cases, setCases] = useState<Demo[]>([]),
          <UsersTable
            users={users}
            roleCatalog={roleCatalog}
            currentRoles={roles}
            currentUserId={currentUserId}
            token={token}
            onChanged={load}
            onError={setError}
          />
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
      <div>
        <div className="eyebrow">Platform administration</div>
        <h1 className="h1">Operate the platform.</h1>
        <p className="muted">
          Global account controls are separate from organization roles and
          business review decisions. Your authority comes from the current
          account roles shown below.
        </p>
        <div className="row" style={{ flexWrap: "wrap", marginTop: 10 }}>
          {roles.map((role) => (
            <Badge key={role} tone="slate">
              {role}
            </Badge>
          ))}
        </div>
      </div>
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
            currentRoles={roles}
            currentUserId={currentUserId}
            token={token}
            onChanged={load}
            onError={setError}
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

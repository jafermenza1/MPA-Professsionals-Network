"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Building2,
  FileCheck2,
  RefreshCw,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { Card, Badge } from "../../components/ui";
import { api, ApiError } from "../../lib/api";
import { useUiStore } from "../../lib/store";

type Inquiry = {
  id: string;
  public_reference: string;
  status: string;
  consider_non_member: boolean;
  contact_name: string;
  contact_email?: string;
  contact_phone?: string;
  intent: string;
  job_title?: string;
};
type Organization = {
  id: string;
  legal_name: string;
  display_name: string;
  organization_type?: string;
  verification_status?: string;
  role_code?: string;
  created_at?: string;
};
type OrgReviewCase = {
  organization_id: string;
  legal_name: string;
  display_name: string;
  organization_type?: string;
  verification_status?: string;
  case_id: string;
  case_status: string;
  submitted_by: string;
  evidence: {
    id: string;
    fileObjectId: string;
    evidenceType: string;
    note?: string;
    createdAt: string;
  }[];
};
type OrgForm = {
  legalName: string;
  displayName: string;
  organizationType: string;
  description: string;
  website: string;
  email: string;
  phone: string;
  addressText: string;
};
const blank: OrgForm = {
  legalName: "",
  displayName: "",
  organizationType: "",
  description: "",
  website: "",
  email: "",
  phone: "",
  addressText: "",
};
export default function Organizations() {
  const token = useUiStore((s) => s.token);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [reviewQueue, setReviewQueue] = useState<OrgReviewCase[]>([]);
  const [reviewDrafts, setReviewDrafts] = useState<
    Record<string, { decision: string; reason: string }>
  >({});
  const [reviewingOrg, setReviewingOrg] = useState("");
  const [form, setForm] = useState<OrgForm>(blank);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [evidenceOrg, setEvidenceOrg] = useState("");
  const [evidenceType, setEvidenceType] = useState("registration_document");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [inquiryDrafts, setInquiryDrafts] = useState<
    Record<string, { status: string; considerNonMember: boolean; note: string }>
  >({});
  const [savingInquiry, setSavingInquiry] = useState("");

  const load = useCallback(async () => {
    if (!token) {
      setOrganizations([]);
      setInquiries([]);
      setReviewQueue([]);
      return;
    }
    setLoading(true);
    setError("");
    const results = await Promise.allSettled([
      api<Organization[]>("/api/v1/organizations", {}, token),
      api<Inquiry[]>("/api/v1/opportunity-inquiries?type=job", {}, token),
      api<{ roles?: string[] }>("/api/v1/me", {}, token),
    ]);
    const organizationResult = results[0];
    if (organizationResult.status === "fulfilled")
      setOrganizations(
        Array.isArray(organizationResult.value) ? organizationResult.value : [],
      );
    else {
      const reason = organizationResult.reason;
      setError(
        reason instanceof ApiError
          ? reason.message
          : "We couldn't load your organizations.",
      );
    }
    const inquiryResult = results[1];
    if (inquiryResult.status === "fulfilled")
      setInquiries(
        Array.isArray(inquiryResult.value) ? inquiryResult.value : [],
      );
    else {
      const reason = inquiryResult.reason;
      const message =
        reason instanceof ApiError && reason.status !== 403
          ? reason.message
          : "";
      if (message) setError((current) => current || message);
    }
    const meResult = results[2];
    if (
      meResult.status === "fulfilled" &&
      (meResult.value.roles || []).some((role) =>
        ["reviewer", "system_admin"].includes(role),
      )
    ) {
      try {
        const queue = await api<OrgReviewCase[]>(
          "/api/v1/review/organizations",
          {},
          token,
        );
        setReviewQueue(Array.isArray(queue) ? queue : []);
      } catch (e) {
        setReviewQueue([]);
        const reason =
          e instanceof ApiError
            ? e.message
            : "We couldn't load the organization review queue.";
        setError((current) => current || reason);
      }
    } else setReviewQueue([]);
    setLoading(false);
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("register") === "1")
      setShowForm(true);
  }, []);

  async function register(e: FormEvent) {
    e.preventDefault();
    if (!token) {
      setNotice("Sign in before registering an organization.");
      return;
    }
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const created = await api<Organization>(
        "/api/v1/organizations",
        {
          method: "POST",
          body: JSON.stringify({
            legalName: form.legalName.trim(),
            displayName: form.displayName.trim(),
            organizationType: form.organizationType.trim() || undefined,
            description: form.description.trim() || undefined,
            website: form.website.trim() || undefined,
            email: form.email.trim() || undefined,
            phone: form.phone.trim() || undefined,
            addressText: form.addressText.trim() || undefined,
          }),
        },
        token,
      );
      setOrganizations((current) => [
        created,
        ...current.filter((x) => x.id !== created.id),
      ]);
      setForm(blank);
      setShowForm(false);
      setNotice(
        "Organization registration recorded. Reference ID: " +
          created.id +
          ". Verification is not yet approved; publishing remains subject to the verification workflow.",
      );
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "We couldn't register this organization.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  async function decideInquiry(inquiry: Inquiry) {
    if (!token) return;
    const draft = inquiryDrafts[inquiry.id] || {
      status: inquiry.status,
      considerNonMember: inquiry.consider_non_member,
      note: "",
    };
    setSavingInquiry(inquiry.id);
    setError("");
    setNotice("");
    try {
      const updated = await api<Inquiry>(
        "/api/v1/opportunity-inquiries/" + encodeURIComponent(inquiry.id),
        {
          method: "PATCH",
          body: JSON.stringify({
            status: draft.status,
            considerNonMember: draft.considerNonMember,
            note: draft.note.trim() || undefined,
          }),
        },
        token,
      );
      setInquiries((current) =>
        current.map((item) =>
          item.id === inquiry.id ? { ...item, ...updated } : item,
        ),
      );
      setInquiryDrafts((current) => ({
        ...current,
        [inquiry.id]: {
          status: updated.status,
          considerNonMember: updated.consider_non_member,
          note: "",
        },
      }));
      setNotice(
        "Inquiry decision saved. A public inquiry remains separate from a formal job application.",
      );
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "We couldn't save this inquiry decision.",
      );
    } finally {
      setSavingInquiry("");
    }
  }
  async function uploadEvidence(e: FormEvent) {
    e.preventDefault();
    if (!token) {
      setError("Sign in before uploading verification evidence.");
      return;
    }
    if (!evidenceOrg) {
      setError("Choose an organization before uploading evidence.");
      return;
    }
    if (!evidenceFile) {
      setError("Choose a document before uploading evidence.");
      return;
    }
    setUploading(true);
    setError("");
    setNotice("");
    try {
      const allowed = [
        "application/pdf",
        "image/png",
        "image/jpeg",
        "text/plain",
      ];
      if (!allowed.includes(evidenceFile.type))
        throw new Error("Choose a PDF, PNG, JPEG or plain-text file.");
      if (evidenceFile.size < 1 || evidenceFile.size > 10 * 1024 * 1024)
        throw new Error("Choose a file between 1 byte and 10 MiB.");
      const authorization = await api<{
        uploadId: string;
        uploadToken: string;
        uploadUrl: string;
      }>(
        "/api/v1/files/uploads",
        {
          method: "POST",
          body: JSON.stringify({
            fileName: evidenceFile.name,
            contentType: evidenceFile.type,
            byteSize: evidenceFile.size,
          }),
        },
        token,
      );
      const base = "";
      const uploaded = await fetch(base + authorization.uploadUrl, {
        method: "PUT",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/octet-stream",
          "X-Upload-Token": authorization.uploadToken,
        },
        body: evidenceFile,
        cache: "no-store",
      });
      if (!uploaded.ok)
        throw new Error(
          uploaded.status === 413
            ? "The file is too large."
            : uploaded.status === 403
              ? "The upload authorization was rejected."
              : "The file upload failed. Please retry.",
        );
      const confirmed = await api<{ id: string }>(
        "/api/v1/files/uploads/" +
          encodeURIComponent(authorization.uploadId) +
          "/confirm",
        { method: "POST" },
        token,
      );
      await api(
        "/api/v1/organizations/" +
          encodeURIComponent(evidenceOrg) +
          "/verification-evidence",
        {
          method: "POST",
          body: JSON.stringify({
            fileObjectId: confirmed.id,
            evidenceType,
            note: evidenceNote.trim() || undefined,
          }),
        },
        token,
      );
      setEvidenceFile(null);
      setEvidenceNote("");
      setNotice(
        "Private evidence uploaded, checksum-verified and attached to the selected organization. Submit the verification case when its required evidence is complete.",
      );
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError || e instanceof Error
          ? e.message || "Evidence upload failed. Please retry."
          : "Evidence upload failed. Please retry.",
      );
    } finally {
      setUploading(false);
    }
  }
  async function openPrivateEvidence(fileObjectId: string) {
    if (!token) return;
    setError("");
    try {
      const base = "";
      const response = await fetch(
        base + "/api/v1/files/" + encodeURIComponent(fileObjectId),
        { headers: { Authorization: "Bearer " + token }, cache: "no-store" },
      );
      if (!response.ok)
        throw new Error(
          response.status === 403
            ? "Your account is not authorized to read this private evidence."
            : "Private evidence could not be opened.",
        );
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Private evidence could not be opened.",
      );
    }
  }
  async function reviewOrganizationCase(row: OrgReviewCase) {
    const draft = reviewDrafts[row.organization_id] || {
      decision: "correction_required",
      reason: "",
    };
    if (!draft.reason.trim()) {
      setError(
        "Provide a reason for every organization verification decision.",
      );
      return;
    }
    setReviewingOrg(row.organization_id);
    setError("");
    setNotice("");
    try {
      await api(
        "/api/v1/review/organizations",
        {
          method: "POST",
          body: JSON.stringify({
            organizationId: row.organization_id,
            decision: draft.decision,
            reason: draft.reason.trim(),
          }),
        },
        token,
      );
      setNotice(
        "Organization verification decision recorded. The organization can view its updated status.",
      );
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Organization review failed. The server enforces reviewer authorization, conflict-of-interest and state rules.",
      );
    } finally {
      setReviewingOrg("");
    }
  }
  async function submitVerification(org: Organization) {
    if (!token) return;
    setError("");
    setNotice("");
    try {
      const result = await api<Organization>(
        "/api/v1/organizations/" +
          encodeURIComponent(org.id) +
          "/submit-verification",
        { method: "POST" },
        token,
      );
      setOrganizations((current) =>
        current.map((item) =>
          item.id === org.id ? { ...item, ...result } : item,
        ),
      );
      setNotice(
        "Verification submission was accepted by the server. Check the displayed status for the next step.",
      );
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Verification could not be submitted. Check required evidence and the current case state.",
      );
    }
  }

  return (
    <div className="grid">
      <div>
        <div className="eyebrow">Partner workspace</div>
        <h1 className="h1">Build a trusted organization profile.</h1>
        <p className="muted">
          Register an organization, review its current verification state and
          continue through server-governed due diligence. Verified status is
          never assumed by the interface.
        </p>
      </div>
      {!token ? (
        <Card>
          <h2 className="h2">Sign in to manage an organization</h2>
          <p className="muted">
            Organization registration and private inquiries require an
            authenticated account.
          </p>
          <a className="btn btn-primary" href="/login?next=/organizations">
            Sign in
          </a>
        </Card>
      ) : (
        <>
          <Card id="org-registration">
            <div className="row">
              <div>
                <div className="h2">Organization registration</div>
                <p className="muted">
                  Legal identity, organization type and contact information.
                </p>
              </div>
              <Building2 color="var(--primary)" />
            </div>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                setShowForm((v) => !v);
                setError("");
                setNotice("");
              }}
            >
              {showForm
                ? "Close registration form"
                : "Register an organization"}
            </button>
            {showForm && (
              <form
                className="form-stack"
                onSubmit={register}
                style={{ marginTop: 18 }}
              >
                <label>
                  Legal name
                  <input
                    required
                    value={form.legalName}
                    onChange={(e) =>
                      setForm({ ...form, legalName: e.target.value })
                    }
                  />
                </label>
                <label>
                  Display name
                  <input
                    required
                    value={form.displayName}
                    onChange={(e) =>
                      setForm({ ...form, displayName: e.target.value })
                    }
                  />
                </label>
                <label>
                  Organization type
                  <input
                    value={form.organizationType}
                    onChange={(e) =>
                      setForm({ ...form, organizationType: e.target.value })
                    }
                    placeholder="e.g. company, association, NGO"
                  />
                </label>
                <label>
                  Description
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Email
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) =>
                        setForm({ ...form, email: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Phone
                    <input
                      value={form.phone}
                      onChange={(e) =>
                        setForm({ ...form, phone: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label>
                  Website
                  <input
                    type="url"
                    value={form.website}
                    onChange={(e) =>
                      setForm({ ...form, website: e.target.value })
                    }
                    placeholder="https://"
                  />
                </label>
                <label>
                  Address
                  <input
                    value={form.addressText}
                    onChange={(e) =>
                      setForm({ ...form, addressText: e.target.value })
                    }
                  />
                </label>
                <p className="muted">
                  Registration creates a draft verification case. It does not
                  automatically verify the organization or permit job
                  publication.
                </p>
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={submitting}
                >
                  {submitting
                    ? "Registering…"
                    : "Submit organization registration"}
                </button>
              </form>
            )}
          </Card>
          <Card>
            <div className="row">
              <div>
                <div className="h2">Your organizations</div>
                <p className="muted">
                  Only organizations associated with your authenticated account
                  are shown.
                </p>
              </div>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => void load()}
                disabled={loading}
              >
                <RefreshCw size={16} />
                {loading ? "Loading…" : "Refresh"}
              </button>
            </div>
            {loading && <p className="muted">Loading your organizations…</p>}
            {!loading && organizations.length === 0 && (
              <p className="muted">
                No organization is linked to this account yet. Use registration
                above to begin.
              </p>
            )}
            <div className="grid">
              {organizations.map((org) => (
                <div className="case-row" key={org.id}>
                  <div className="row">
                    <div>
                      <b>{org.display_name}</b>
                      <div className="muted">
                        {org.legal_name}
                        {org.role_code ? " · " + org.role_code : ""}
                      </div>
                    </div>
                    <Badge>
                      {(org.verification_status || "unverified").replaceAll(
                        "_",
                        " ",
                      )}
                    </Badge>
                  </div>
                  <p className="muted">
                    Verification evidence is private and must satisfy the active
                    server-side requirements.
                  </p>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => void submitVerification(org)}
                  >
                    Submit for verification
                  </button>
                </div>
              ))}
            </div>
          </Card>
          <Card id="org-evidence">
            <div className="row">
              <div>
                <div className="h2">Verification evidence</div>
                <p className="muted">
                  Upload a private PDF, PNG, JPEG or plain-text file (maximum 10
                  MiB). The server checks the upload token, size, declared
                  content against file signature where applicable, and SHA-256
                  checksum before attaching it. Public URLs are not accepted as
                  evidence.
                </p>
              </div>
              <FileCheck2 color="var(--primary)" />
            </div>
            {organizations.length === 0 ? (
              <p className="muted">
                Register an organization before attaching evidence.
              </p>
            ) : (
              <form
                className="form-stack"
                onSubmit={uploadEvidence}
                style={{ marginTop: 14 }}
              >
                <label>
                  Organization
                  <select
                    required
                    value={evidenceOrg}
                    onChange={(e) => setEvidenceOrg(e.target.value)}
                  >
                    <option value="">Choose organization</option>
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Evidence type
                  <select
                    required
                    value={evidenceType}
                    onChange={(e) => setEvidenceType(e.target.value)}
                  >
                    <option value="registration_document">
                      Registration / legal existence
                    </option>
                    <option value="representative_authorization">
                      Representative authorization
                    </option>
                    <option value="tax_document">Tax document</option>
                    <option value="trade_license">
                      Trade or sector license
                    </option>
                    <option value="supporting_document">
                      Other supporting document
                    </option>
                  </select>
                </label>
                <label>
                  Private document
                  <input
                    required
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain"
                    onChange={(e) =>
                      setEvidenceFile(e.target.files?.[0] || null)
                    }
                  />
                </label>
                <label>
                  Note (optional)
                  <textarea
                    rows={2}
                    value={evidenceNote}
                    onChange={(e) => setEvidenceNote(e.target.value)}
                    maxLength={500}
                  />
                </label>
                <p className="muted">
                  Upload authorization expires after 10 minutes and is one-use.
                  Evidence remains private; successful upload does not verify
                  the organization.
                </p>
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={uploading || !evidenceFile || !evidenceOrg}
                >
                  {uploading
                    ? "Uploading and verifying…"
                    : "Upload and attach private evidence"}
                </button>
              </form>
            )}
            <Badge>Tabayyun · Verification / due diligence</Badge>
          </Card>
          {reviewQueue.length > 0 && (
            <Card>
              <div className="row">
                <div>
                  <div className="h2">
                    Organization verification review queue
                  </div>
                  <p className="muted">
                    Available only to reviewers and system administrators. A
                    reviewer cannot decide a case for an organization they
                    created, submitted or belong to.
                  </p>
                </div>
                <ShieldCheck color="var(--primary)" />
              </div>
              {reviewQueue.map((row) => {
                const draft = reviewDrafts[row.organization_id] || {
                  decision: "correction_required",
                  reason: "",
                };
                return (
                  <div className="case-row" key={row.case_id}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row">
                        <b>{row.display_name || row.legal_name}</b>
                        <Badge>{row.case_status.replaceAll("_", " ")}</Badge>
                      </div>
                      <p className="muted">
                        {row.legal_name} ·{" "}
                        {row.organization_type || "Organization"}
                      </p>
                      <div className="grid">
                        {row.evidence.map((ev) => (
                          <div className="row" key={ev.id}>
                            <span>
                              {ev.evidenceType}
                              {ev.note ? " · " + ev.note : ""}
                            </span>
                            <button
                              className="btn btn-ghost"
                              type="button"
                              onClick={() =>
                                void openPrivateEvidence(ev.fileObjectId)
                              }
                            >
                              Open private evidence
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="form-grid">
                        <label>
                          Decision
                          <select
                            value={draft.decision}
                            onChange={(e) =>
                              setReviewDrafts((current) => ({
                                ...current,
                                [row.organization_id]: {
                                  ...draft,
                                  decision: e.target.value,
                                },
                              }))
                            }
                          >
                            <option value="verified">Verify</option>
                            <option value="correction_required">
                              Request correction
                            </option>
                            <option value="rejected">Reject</option>
                          </select>
                        </label>
                        <label>
                          Reason
                          <textarea
                            required
                            value={draft.reason}
                            onChange={(e) =>
                              setReviewDrafts((current) => ({
                                ...current,
                                [row.organization_id]: {
                                  ...draft,
                                  reason: e.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                      </div>
                      <button
                        className="btn btn-primary"
                        disabled={
                          reviewingOrg === row.organization_id ||
                          !draft.reason.trim()
                        }
                        onClick={() => void reviewOrganizationCase(row)}
                      >
                        {reviewingOrg === row.organization_id
                          ? "Recording…"
                          : "Record organization decision"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
          <Card>
            <div className="row">
              <div>
                <div className="h2">Public job inquiries</div>
                <p className="muted">
                  First-stage public interest is not a formal eligible
                  application. Only authorized organization users can inspect
                  and decide inquiries.
                </p>
              </div>
              <UsersRound color="var(--primary)" />
            </div>
            {loading ? (
              <p className="muted">Loading inquiries…</p>
            ) : inquiries.length === 0 ? (
              <p className="muted">
                No public job inquiries are currently visible to this account.
              </p>
            ) : (
              <div className="grid">
                {inquiries.map((i) => {
                  const draft = inquiryDrafts[i.id] || {
                    status: i.status,
                    considerNonMember: i.consider_non_member,
                    note: "",
                  };
                  return (
                    <div className="case-row" key={i.id}>
                      <div>
                        <div
                          className="row"
                          style={{ justifyContent: "flex-start" }}
                        >
                          <b>{i.contact_name}</b>
                          <Badge>{i.status}</Badge>
                          {i.consider_non_member && (
                            <Badge tone="gold">Non-member considered</Badge>
                          )}
                        </div>
                        <div className="muted">
                          {i.job_title || "General public job interest"} ·{" "}
                          {i.contact_email || i.contact_phone}
                        </div>
                        <p className="muted" style={{ margin: "6px 0" }}>
                          {i.intent}
                        </p>
                        <small className="muted">
                          Reference {i.public_reference}
                        </small>
                        <div className="form-grid" style={{ marginTop: 12 }}>
                          <label>
                            Decision
                            <select
                              aria-label={"Decision for " + i.public_reference}
                              value={draft.status}
                              onChange={(e) =>
                                setInquiryDrafts((current) => ({
                                  ...current,
                                  [i.id]: { ...draft, status: e.target.value },
                                }))
                              }
                            >
                              <option value="received">Received</option>
                              <option value="contacted">Contacted</option>
                              <option value="considering">Considering</option>
                              <option value="invited">Invited</option>
                              <option value="converted">Converted</option>
                              <option value="declined">Declined</option>
                              <option value="closed">Closed</option>
                            </select>
                          </label>
                          <label className="checkbox-row">
                            <input
                              aria-label={
                                "Consider non-member for " + i.public_reference
                              }
                              type="checkbox"
                              checked={draft.considerNonMember}
                              onChange={(e) =>
                                setInquiryDrafts((current) => ({
                                  ...current,
                                  [i.id]: {
                                    ...draft,
                                    considerNonMember: e.target.checked,
                                  },
                                }))
                              }
                            />{" "}
                            Consider non-member
                          </label>
                          <label className="full-width">
                            Decision note
                            <textarea
                              aria-label={
                                "Decision note for " + i.public_reference
                              }
                              rows={2}
                              maxLength={4000}
                              value={draft.note}
                              onChange={(e) =>
                                setInquiryDrafts((current) => ({
                                  ...current,
                                  [i.id]: { ...draft, note: e.target.value },
                                }))
                              }
                            />
                          </label>
                        </div>
                        <button
                          className="btn btn-primary"
                          type="button"
                          disabled={savingInquiry === i.id}
                          onClick={() => void decideInquiry(i)}
                        >
                          {savingInquiry === i.id
                            ? "Saving…"
                            : "Save inquiry decision"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <p className="muted" role="status">
          {notice}
        </p>
      )}
      <Card>
        <div className="row">
          <div>
            <div className="h2">Decision boundary</div>
            <p className="muted">
              Verified organizations can publish opportunities and manage
              partner workflows. Public inquiries remain an intake signal until
              an authorized person moves them into the formal process.
            </p>
          </div>
          <ShieldCheck color="var(--primary)" />
        </div>
      </Card>
    </div>
  );
}

"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  CreditCard,
  Eye,
  FileCheck2,
  Globe2,
  LogIn,
  RefreshCw,
  ShieldCheck,
  Users,
  WifiOff,
} from "lucide-react";
import { Card, Badge } from "../../components/ui";
import { api, ApiError } from "../../lib/api";
import { useUiStore } from "../../lib/store";
import styles from "./profile.module.css";
type Profile = {
  user_id: string;
  email: string;
  status: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  display_name: string;
  phone: string | null;
  date_of_birth: string | null;
  sex: string | null;
  nationality: string | null;
  headline: string | null;
  bio: string | null;
  visibility: string | null;
  completion_percent: number;
};
type Preferences = {
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  in_app_enabled: boolean;
};
type TalentProfile = {
  id: string;
  professional_title: string | null;
  years_experience: number | null;
  availability_status: string | null;
  location_label: string | null;
  directory_summary: string | null;
  headline: string | null;
  bio: string | null;
  visibility: string;
  completion_percent: number;
};
type TalentVisibility = {
  user_id: string;
  directory_visible: boolean;
  show_identity_badge: boolean;
  show_professional_badge: boolean;
  show_experience_badge: boolean;
  show_location: boolean;
  show_experience: boolean;
  show_contact: boolean;
};
const emptyTalentVisibility: TalentVisibility = {
  user_id: "",
  directory_visible: false,
  show_identity_badge: false,
  show_professional_badge: false,
  show_experience_badge: false,
  show_location: false,
  show_experience: false,
  show_contact: false,
};
const blank = {
  firstName: "",
  middleName: "",
  lastName: "",
  displayName: "",
  phone: "",
  dateOfBirth: "",
  sex: "",
  nationality: "",
  headline: "",
  bio: "",
  visibility: "public",
};
export default function Profile() {
  const token = useUiStore((s) => s.token),
    setToken = useUiStore((s) => s.setToken),
    clearToken = useUiStore((s) => s.clearToken),
    language = useUiStore((s) => s.language);
  const [profile, setProfile] = useState<Profile | null>(null),
    [form, setForm] = useState(blank),
    [tokenDraft, setTokenDraft] = useState("");
  const [preferences, setPreferences] = useState<Preferences>({
    email_enabled: true,
    sms_enabled: true,
    push_enabled: true,
    in_app_enabled: true,
  });
  const [, setTalentProfile] = useState<TalentProfile | null>(null);
  const [talentForm, setTalentForm] = useState({
    professionalTitle: "",
    yearsExperience: "",
    availabilityStatus: "",
    locationLabel: "",
    directorySummary: "",
    headline: "",
    bio: "",
    visibility: "members",
  });
  const [talentVisibility, setTalentVisibility] = useState<TalentVisibility>(
    emptyTalentVisibility,
  );
  const [savingTalent, setSavingTalent] = useState(false),
    [savingVisibility, setSavingVisibility] = useState(false);
  const [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false),
    [savingPreferences, setSavingPreferences] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    if (!token) {
      setProfile(null);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const [me, prefs, tp, tv] = await Promise.all([
        api<Profile>("/api/v1/me", {}, token),
        api<Preferences>("/api/v1/notifications/preferences", {}, token),
        api<TalentProfile>("/api/v1/me/talent-profile", {}, token),
        api<TalentVisibility>("/api/v1/me/talent-visibility", {}, token),
      ]);
      setProfile(me);
      setPreferences(prefs);
      setTalentProfile(tp);
      setTalentVisibility({ ...emptyTalentVisibility, ...tv });
      setTalentForm({
        professionalTitle: tp.professional_title || "",
        yearsExperience:
          tp.years_experience === null || tp.years_experience === undefined
            ? ""
            : String(tp.years_experience),
        availabilityStatus: tp.availability_status || "",
        locationLabel: tp.location_label || "",
        directorySummary: tp.directory_summary || "",
        headline: tp.headline || "",
        bio: tp.bio || "",
        visibility: tp.visibility || "members",
      });
      setForm({
        firstName: me.first_name || "",
        middleName: me.middle_name || "",
        lastName: me.last_name || "",
        displayName: me.display_name || "",
        phone: me.phone || "",
        dateOfBirth: me.date_of_birth
          ? String(me.date_of_birth).slice(0, 10)
          : "",
        sex: me.sex || "",
        nationality: me.nationality || "",
        headline: me.headline || "",
        bio: me.bio || "",
        visibility: me.visibility || "public",
      });
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "We couldn't load your account profile. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);
  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await api<Profile>(
        "/api/v1/me/profile",
        { method: "PATCH", body: JSON.stringify(form) },
        token,
      );
      setProfile(updated);
      setForm({
        firstName: updated.first_name || "",
        middleName: updated.middle_name || "",
        lastName: updated.last_name || "",
        displayName: updated.display_name || "",
        phone: updated.phone || "",
        dateOfBirth: updated.date_of_birth
          ? String(updated.date_of_birth).slice(0, 10)
          : "",
        sex: updated.sex || "",
        nationality: updated.nationality || "",
        headline: updated.headline || "",
        bio: updated.bio || "",
        visibility: updated.visibility || "public",
      });
      setNotice("Profile changes were saved to your account.");
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "We couldn't save your profile. Your previous details are unchanged.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function saveTalentProfile(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSavingTalent(true);
    setError("");
    setNotice("");
    try {
      const saved = await api<TalentProfile>(
        "/api/v1/me/talent-profile",
        {
          method: "PATCH",
          body: JSON.stringify({
            professionalTitle: talentForm.professionalTitle.trim() || null,
            yearsExperience:
              talentForm.yearsExperience === ""
                ? null
                : Number(talentForm.yearsExperience),
            availabilityStatus: talentForm.availabilityStatus.trim() || null,
            locationLabel: talentForm.locationLabel.trim() || null,
            directorySummary: talentForm.directorySummary.trim() || null,
            headline: talentForm.headline.trim() || null,
            bio: talentForm.bio.trim() || null,
            visibility: talentForm.visibility,
          }),
        },
        token,
      );
      setTalentProfile(saved);
      setNotice("Professional directory profile saved.");
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "We couldn't save the professional directory profile.",
      );
    } finally {
      setSavingTalent(false);
    }
  }
  async function saveTalentVisibility() {
    if (!token) return;
    setSavingVisibility(true);
    setError("");
    setNotice("");
    try {
      const saved = await api<TalentVisibility>(
        "/api/v1/me/talent-visibility",
        {
          method: "PATCH",
          body: JSON.stringify({
            directoryVisible: talentVisibility.directory_visible,
            showIdentityBadge: talentVisibility.show_identity_badge,
            showProfessionalBadge: talentVisibility.show_professional_badge,
            showExperienceBadge: talentVisibility.show_experience_badge,
            showLocation: talentVisibility.show_location,
            showExperience: talentVisibility.show_experience,
            showContact: talentVisibility.show_contact,
          }),
        },
        token,
      );
      setTalentVisibility({ ...emptyTalentVisibility, ...saved });
      setNotice("Talent directory consent and disclosure settings saved.");
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "We couldn't save talent directory privacy settings.",
      );
    } finally {
      setSavingVisibility(false);
    }
  }
  async function savePreferences() {
    if (!token) return;
    setSavingPreferences(true);
    setError("");
    setNotice("");
    try {
      const saved = await api<Preferences>(
        "/api/v1/notifications/preferences",
        {
          method: "PATCH",
          body: JSON.stringify({
            emailEnabled: preferences.email_enabled,
            smsEnabled: preferences.sms_enabled,
            pushEnabled: preferences.push_enabled,
            inAppEnabled: preferences.in_app_enabled,
          }),
        },
        token,
      );
      setPreferences(saved);
      setNotice("Notification preferences were saved.");
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "We couldn't save notification preferences.",
      );
    } finally {
      setSavingPreferences(false);
    }
  }
  const update = (key: keyof typeof blank, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <div className={`grid ${styles.page}`} style={{ gap: 18 }}>
      <div>
        <div className="eyebrow">Profile & preferences</div>
        <h1 className="h1">Your controls, your trust boundary.</h1>
        <p className="muted">
          Account details and communication preferences are read from and saved
          to the service. Private verification evidence remains separate from
          your public profile.
        </p>
      </div>
      {!token ? (
        <Card>
          <div className="row">
            <LogIn color="var(--primary)" />
            <div>
              <div className="h2">Connect your account</div>
              <p className="muted">
                Sign in to load and edit your profile. A development bearer
                token may be pasted for local testing only.
              </p>
            </div>
          </div>
          <label htmlFor="profile-token">Development bearer token</label>
          <input
            id="profile-token"
            aria-label="Bearer token"
            type="password"
            placeholder="Paste token only for local testing"
            value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)}
            style={{
              width: "100%",
              padding: 11,
              border: "1px solid var(--border)",
              borderRadius: 12,
              background: "var(--bg)",
              color: "var(--text)",
            }}
          />
          <button
            className="btn btn-primary"
            type="button"
            disabled={!tokenDraft.trim()}
            onClick={() => setToken(tokenDraft.trim())}
          >
            Connect session
          </button>
          <p className="muted">
            Tokens are stored in this browser session only.
          </p>
        </Card>
      ) : (
        <>
          <Card>
            <div className="row">
              <div>
                <div className="eyebrow">Account</div>
                <div className="h2">
                  {profile?.display_name || "Your profile"}
                </div>
                <p className="muted">
                  {profile?.email} ·{" "}
                  {profile?.status || "Loading account status"}
                </p>
              </div>
              <ShieldCheck color="var(--primary)" />
            </div>
            {loading && <p role="status">Loading profile from your account…</p>}
            <form className="grid" style={{ gap: 12 }} onSubmit={saveProfile}>
              <p className={styles.formHint}>
                Fields marked <b>*</b> are required to save your identity. Other
                details are optional and can be added later.
              </p>
              <div className="grid grid-2">
                {(
                  [
                    ["firstName", "First name *"],
                    ["middleName", "Middle name (optional)"],
                    ["lastName", "Last name *"],
                    ["displayName", "Display name (optional)"],
                    ["phone", "Phone (optional)"],
                    ["dateOfBirth", "Date of birth (optional)"],
                    ["sex", "Sex (optional)"],
                    ["nationality", "Nationality (optional)"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label htmlFor={"profile-" + key}>{label}</label>
                    {key === "sex" ? (
                      <select
                        id={"profile-" + key}
                        value={form[key]}
                        onChange={(e) => update(key, e.target.value)}
                      >
                        <option value="">Prefer not to say</option>
                        <option value="female">Female</option>
                        <option value="male">Male</option>
                        <option value="other">Other</option>
                      </select>
                    ) : (
                      <input
                        id={"profile-" + key}
                        required={key === "firstName" || key === "lastName"}
                        type={key === "dateOfBirth" ? "date" : "text"}
                        autoComplete={key === "phone" ? "tel" : undefined}
                        value={form[key]}
                        onChange={(e) => update(key, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div>
                <label htmlFor="profile-headline">Professional headline</label>
                <input
                  id="profile-headline"
                  value={form.headline}
                  onChange={(e) => update("headline", e.target.value)}
                  maxLength={180}
                />
              </div>
              <div>
                <label htmlFor="profile-bio">Professional bio</label>
                <textarea
                  id="profile-bio"
                  value={form.bio}
                  onChange={(e) => update("bio", e.target.value)}
                  rows={4}
                  maxLength={4000}
                />
              </div>
              <div>
                <label htmlFor="profile-visibility">
                  Professional directory visibility
                </label>
                <select
                  id="profile-visibility"
                  value={form.visibility}
                  onChange={(e) => update("visibility", e.target.value)}
                >
                  <option value="public">Public-safe profile</option>
                  <option value="members">Members only</option>
                  <option value="private">Private / hidden</option>
                </select>
                <p className="muted">
                  This controls directory visibility, not access to private
                  evidence or account records.
                </p>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="muted">
                  Profile completion: {profile?.completion_percent ?? 0}%
                </span>
                <button
                  className="btn btn-primary"
                  disabled={saving || loading}
                  type="submit"
                >
                  {saving ? "Saving…" : "Save profile"}
                </button>
              </div>
            </form>
          </Card>
          <Card>
            <div className="row">
              <div>
                <div className="eyebrow">Professional directory</div>
                <div className="h2">Your professional projection</div>
                <p className="muted">
                  Only opted-in profiles with an eligible verified professional
                  claim appear in the directory. Private evidence and reviewer
                  notes are never shown.
                </p>
              </div>
              <Users color="var(--primary)" />
            </div>
            <form
              className="grid"
              style={{ gap: 12 }}
              onSubmit={saveTalentProfile}
            >
              <div className="grid grid-2">
                <label>
                  Professional title
                  <input
                    value={talentForm.professionalTitle}
                    onChange={(e) =>
                      setTalentForm((f) => ({
                        ...f,
                        professionalTitle: e.target.value,
                      }))
                    }
                    maxLength={180}
                  />
                </label>
                <label>
                  Years of experience
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={talentForm.yearsExperience}
                    onChange={(e) =>
                      setTalentForm((f) => ({
                        ...f,
                        yearsExperience: e.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Availability status
                  <select
                    value={talentForm.availabilityStatus || "not_specified"}
                    onChange={(e) =>
                      setTalentForm((f) => ({
                        ...f,
                        availabilityStatus: e.target.value,
                      }))
                    }
                  >
                    <option value="not_specified">Not specified</option>
                    <option value="available">Available</option>
                    <option value="limited">Limited availability</option>
                    <option value="unavailable">Unavailable</option>
                  </select>
                </label>
                <label>
                  Location label
                  <input
                    value={talentForm.locationLabel}
                    onChange={(e) =>
                      setTalentForm((f) => ({
                        ...f,
                        locationLabel: e.target.value,
                      }))
                    }
                    placeholder="City or region"
                  />
                </label>
              </div>
              <label>
                Directory summary
                <textarea
                  rows={3}
                  value={talentForm.directorySummary}
                  onChange={(e) =>
                    setTalentForm((f) => ({
                      ...f,
                      directorySummary: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Directory headline
                <input
                  value={talentForm.headline}
                  onChange={(e) =>
                    setTalentForm((f) => ({ ...f, headline: e.target.value }))
                  }
                />
              </label>
              <label>
                Directory bio
                <textarea
                  rows={3}
                  value={talentForm.bio}
                  onChange={(e) =>
                    setTalentForm((f) => ({ ...f, bio: e.target.value }))
                  }
                />
              </label>
              <label>
                Profile audience
                <select
                  value={talentForm.visibility}
                  onChange={(e) =>
                    setTalentForm((f) => ({ ...f, visibility: e.target.value }))
                  }
                >
                  <option value="public">Public-safe profile</option>
                  <option value="members">Active members only</option>
                  <option value="private">Private / hidden</option>
                </select>
              </label>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={savingTalent || loading}
              >
                {savingTalent ? "Saving…" : "Save directory profile"}
              </button>
            </form>
          </Card>
          <Card>
            <div className="row">
              <div>
                <div className="eyebrow">Consent and disclosure</div>
                <div className="h2">Choose what the directory may show</div>
              </div>
              <Eye color="var(--primary)" />
            </div>
            <div className="grid" style={{ gap: 10 }}>
              {(
                [
                  ["directory_visible", "List my profile in talent search"],
                  ["show_identity_badge", "Show identity verification badge"],
                  [
                    "show_professional_badge",
                    "Show verified professional badge",
                  ],
                  ["show_experience_badge", "Show verified experience badge"],
                  ["show_location", "Show location"],
                  ["show_experience", "Show public/member-safe experience"],
                  [
                    "show_contact",
                    "Allow contact disclosure after an accepted inquiry",
                  ],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  style={{ display: "flex", gap: 10, alignItems: "center" }}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(talentVisibility[key])}
                    onChange={(e) =>
                      setTalentVisibility((v) => ({
                        ...v,
                        [key]: e.target.checked,
                      }))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="muted">
              Contact details are not exposed by profile viewing. They are
              released only when you accept a specific inquiry and explicitly
              approve release.
            </p>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => void saveTalentVisibility()}
              disabled={savingVisibility || loading}
            >
              {savingVisibility ? "Saving…" : "Save directory privacy settings"}
            </button>
          </Card>
          <Card>
            <div className="row">
              <div>
                <div className="eyebrow">Communication</div>
                <div className="h2">Notification preferences</div>
              </div>
              <RefreshCw color="var(--primary)" />
            </div>
            <p className="muted">
              Select supported channels. Delivery still depends on channel
              configuration.
            </p>
            <div className="grid grid-2">
              {(
                [
                  ["email_enabled", "Email"],
                  ["sms_enabled", "SMS"],
                  ["push_enabled", "Push"],
                  ["in_app_enabled", "In-app"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  style={{ display: "flex", gap: 10, alignItems: "center" }}
                >
                  <input
                    type="checkbox"
                    checked={preferences[key]}
                    onChange={(e) =>
                      setPreferences((p) => ({ ...p, [key]: e.target.checked }))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <div style={{ marginTop: 14 }}>
              <button
                className="btn btn-primary"
                onClick={savePreferences}
                disabled={savingPreferences}
              >
                {savingPreferences
                  ? "Saving…"
                  : "Save notification preferences"}
              </button>
            </div>
          </Card>
          <Card>
            <div className="row">
              <Globe2 color="var(--primary)" />
              <div>
                <div className="h2">Language</div>
                <p className="muted">
                  Current interface language: {language}. Amharic, Afaan Oromoo
                  and Somali remain localization targets.
                </p>
              </div>
            </div>
            <div className="row">
              <CreditCard color="var(--gold)" />
              <div>
                <div className="h2">Membership dues</div>
                <p className="muted">
                  Membership payment and manual review follow the membership
                  workflow; provider callbacks are not represented as connected
                  unless configured.
                </p>
              </div>
            </div>
            <div className="row">
              <WifiOff color="var(--gold)" />
              <div>
                <div className="h2">Field mode</div>
                <p className="muted">
                  Offline field evidence is not reported as synchronized until
                  the server confirms it.
                </p>
                <a className="btn btn-ghost" href="/field">
                  Open field workspace
                </a>
              </div>
            </div>
            <div className="row">
              <FileCheck2 color="var(--primary)" />
              <div>
                <div className="h2">Verification evidence</div>
                <p className="muted">
                  Private by default; accessible only to authorized participants
                  and reviewers under server-side policy.
                </p>
              </div>
            </div>
          </Card>
          <button
            className="btn btn-ghost"
            onClick={async () => {
              try {
                await api("/api/v1/auth/logout", { method: "POST" }, token);
              } catch {
              } finally {
                clearToken();
                setProfile(null);
                setNotice("You have been signed out of this browser session.");
              }
            }}
          >
            Sign out
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="muted">
          {notice}
        </p>
      )}
      <div className="footer-note">
        <Badge>Adl · Amanah · Tabayyun · Satr</Badge>
      </div>
    </div>
  );
}

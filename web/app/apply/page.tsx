"use client";
import { FormEvent, useEffect, useState } from "react";
import { Building2, CheckCircle2, UserRound } from "lucide-react";
import { Card, Badge } from "../../components/ui";
import { api } from "../../lib/api";
import { useUiStore } from "../../lib/store";
type Product = {
  product_code: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  billing_model: string;
  duration_days: number | null;
  benefits: string[];
};
export default function Apply() {
  const token = useUiStore((s) => s.token);
  const [products, setProducts] = useState<Product[]>([]);
  const [productCode, setProductCode] = useState("");
  const [kind, setKind] = useState<"member" | "organization">("member");
  const [org, setOrg] = useState({
    legalName: "",
    displayName: "",
    description: "",
    email: "",
    phone: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    api<Product[]>("/api/v1/membership/products")
      .then((x) => {
        setProducts(x);
        setProductCode(x[0]?.product_code || "");
      })
      .catch(() => setError("Membership options could not be loaded."));
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      if (!token) {
        location.href = "/register?next=/apply";
        return;
      }
      if (kind === "member") {
        const r = await api<any>(
          "/api/v1/membership/applications",
          {
            method: "POST",
            body: JSON.stringify({ productCode, applicationType: "new" }),
          },
          token,
        );
        setMessage(
          "Membership application submitted. Application ID: " +
            r.id +
            ". You can now track its progress.",
        );
      } else {
        const r = await api<any>(
          "/api/v1/organizations",
          { method: "POST", body: JSON.stringify(org) },
          token,
        );
        setMessage(
          "Organization registered as " +
            r.display_name +
            ". Complete verification from the organization workspace, then track progress.",
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Application could not be submitted.",
      );
    }
  }
  return (
    <div className="auth-page">
      <Card>
        <div className="eyebrow">Apply / Register</div>
        <h1 className="h1">Choose how you want to participate</h1>
        <p className="muted">
          Members build trusted professional value. Organizations and partners
          build verified working relationships.
        </p>
        <div className="choice-grid">
          <button
            className={kind === "member" ? "choice active" : "choice"}
            onClick={() => setKind("member")}
          >
            <UserRound />
            <b>Join as a professional</b>
            <span>Membership, verification, opportunities and mentorship.</span>
          </button>
          <button
            className={kind === "organization" ? "choice active" : "choice"}
            onClick={() => setKind("organization")}
          >
            <Building2 />
            <b>Register an organization</b>
            <span>
              Partner verification, recruitment, services and outcomes.
            </span>
          </button>
        </div>
        {kind === "member" ? (
          <form onSubmit={submit} className="form-stack">
            <label>
              Membership option
              <select
                required
                value={productCode}
                onChange={(e) => setProductCode(e.target.value)}
              >
                {products.map((p) => (
                  <option key={p.product_code} value={p.product_code}>
                    {p.name} · {p.price} {p.currency}
                  </option>
                ))}
              </select>
            </label>
            {products[0] && (
              <div className="apply-benefits">
                <Badge>Value</Badge>
                <p className="muted">
                  {
                    products.find((p) => p.product_code === productCode)
                      ?.description
                  }
                </p>
              </div>
            )}
            <button className="btn btn-primary">
              Submit membership application <CheckCircle2 size={16} />
            </button>
          </form>
        ) : (
          <form onSubmit={submit} className="form-stack">
            <label>
              Legal name
              <input
                required
                value={org.legalName}
                onChange={(e) => setOrg({ ...org, legalName: e.target.value })}
              />
            </label>
            <label>
              Public/display name
              <input
                required
                value={org.displayName}
                onChange={(e) =>
                  setOrg({ ...org, displayName: e.target.value })
                }
              />
            </label>
            <div className="form-grid">
              <label>
                Email
                <input
                  type="email"
                  value={org.email}
                  onChange={(e) => setOrg({ ...org, email: e.target.value })}
                />
              </label>
              <label>
                Phone
                <input
                  value={org.phone}
                  onChange={(e) => setOrg({ ...org, phone: e.target.value })}
                />
              </label>
            </div>
            <label>
              Description
              <textarea
                rows={4}
                value={org.description}
                onChange={(e) =>
                  setOrg({ ...org, description: e.target.value })
                }
              />
            </label>
            <button className="btn btn-primary">
              Register organization <Building2 size={16} />
            </button>
          </form>
        )}
        {message && <div className="form-success">{message}</div>}
        {error && <div className="form-error">{error}</div>}
        <div className="auth-links">
          <a href="/login">Login</a>
          <a href="/track">Track an existing application</a>
        </div>
      </Card>
    </div>
  );
}

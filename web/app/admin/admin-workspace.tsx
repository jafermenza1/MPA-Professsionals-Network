"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Activity, BookOpenCheck, Building2, ClipboardList, FileBarChart, Fingerprint, Mail, MessageSquareText, ShieldCheck, Users } from "lucide-react";
import { api } from "../../lib/api";
import { useUiStore } from "../../lib/store";
import styles from "./admin-workspace.module.css";

const destinations = [
  { href: "/admin", label: "Overview", description: "Review and administration", icon: Activity, exact: true },
  { href: "/admin/members", label: "Members", description: "Imports and member records", icon: Users },
  { href: "/admin/membership-card", label: "Membership card", description: "Credential appearance", icon: ShieldCheck },
  { href: "/admin/reference-portfolio", label: "Reference data", description: "Governed profile options", icon: BookOpenCheck },
  { href: "/admin/marketplace", label: "Marketplace", description: "Demand and listing review", icon: ClipboardList },
  { href: "/admin/reports", label: "Reports", description: "Reporting and exports", icon: FileBarChart },
  { href: "/admin/email", label: "Email operations", description: "Queues, templates and delivery", icon: Mail },
  { href: "/admin/security", label: "Admin security", description: "Passkeys and recovery", icon: Fingerprint },
  { href: "/admin/support", label: "Support", description: "Inquiries and knowledge base", icon: MessageSquareText },
] as const;

export function AdminWorkspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const token = useUiStore((state) => state.token);
  const hydrated = useUiStore((state) => state.hydrated);
  const hydrateToken = useUiStore((state) => state.hydrateToken);
  const [roles, setRoles] = useState<string[] | null>(null);

  useEffect(() => { hydrateToken(); }, [hydrateToken]);
  useEffect(() => {
    let cancelled = false;
    if (!hydrated || !token) { setRoles(null); return () => { cancelled = true; }; }
    api<{ roles?: unknown }>("/api/v1/me", {}, token)
      .then((me) => { if (!cancelled) setRoles(Array.isArray(me.roles) ? me.roles.map((role) => typeof role === "string" ? role : role && typeof role === "object" && "role_code" in role && typeof role.role_code === "string" ? role.role_code : "").filter(Boolean) : []); })
      .catch(() => { if (!cancelled) setRoles([]); });
    return () => { cancelled = true; };
  }, [hydrated, token]);

  const current = useMemo(() => {
    const exact = destinations.find((item) => item.href === pathname);
    if (exact) return exact;
    return [...destinations].sort((a, b) => b.href.length - a.href.length).find((item) => pathname.startsWith(item.href + "/"));
  }, [pathname]);
  const roleSummary = roles === null ? "Resolving account access…" : roles.length ? roles.map((role) => role.replaceAll("_", " ")).join(" · ") : "No administrator role confirmed";
  const navDestinations = useMemo(() => {
    const platformAdmin = Boolean(roles?.some((role) => ["system_admin", "admin", "platform_admin"].includes(role)));
    if (platformAdmin || !roles?.includes("supporting_staff")) return destinations;
    const priority: Record<string, number> = { "/admin": 0, "/admin/marketplace": 1, "/admin/support": 2 };
    return [...destinations].sort((a, b) => (priority[a.href] ?? 10) - (priority[b.href] ?? 10));
  }, [roles]);

  return <div className={styles.workspace}>
    <aside className={styles.sidebar} aria-label="Administration navigation">
      <div className={styles.brand}><span className={styles.brandMark}><Building2 size={19} /></span><div><strong>MPA operations</strong><span>Administration workspace</span></div></div>
      <nav className={styles.nav} aria-label="Admin workspaces">
        {navDestinations.map(({ href, label, description, icon: Icon, exact = false }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
          return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={active ? styles.active : styles.link}>
            <Icon size={18} aria-hidden="true" /><span className={styles.linkText}><strong>{label}</strong><small>{description}</small></span>
          </Link>;
        })}
      </nav>
      <div className={styles.access}><span>Signed-in role information</span><p>{roleSummary}</p><small>Navigation is for discovery only. Every page and action must still be authorized by the server.</small></div>
    </aside>
    <section className={styles.content}>
      <div className={styles.breadcrumbs} aria-label="Breadcrumb">
        <Link href="/admin">Administration</Link><span aria-hidden="true">/</span><span aria-current="page">{current?.label ?? "Workspace"}</span>
      </div>
      {children}
    </section>
  </div>;
}

"use client";
import { AlertCircle, CheckCircle2, Info, RefreshCw, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
type FeedbackKind = "error" | "success" | "info";
export function FormFeedback({ kind, message, onRetry, retryLabel = "Try again", actionHref, actionLabel, children }: { kind: FeedbackKind; message: string; onRetry?: () => void; retryLabel?: string; actionHref?: string; actionLabel?: string; children?: ReactNode }) {
 const Icon = kind === "error" ? AlertCircle : kind === "success" ? CheckCircle2 : Info;
 const title = kind === "error" ? "We couldn’t complete that yet" : kind === "success" ? "Saved successfully" : "A helpful update";
 return <div className={`form-feedback form-feedback--${kind}`} role={kind === "error" ? "alert" : "status"} aria-live={kind === "error" ? "assertive" : "polite"}><Icon size={19} aria-hidden="true"/><div className="form-feedback__body"><strong>{title}</strong><p>{message}</p>{children}{(onRetry || (actionHref && actionLabel)) && <div className="form-feedback__actions">{onRetry && <button type="button" className="btn btn-ghost" onClick={onRetry}><RefreshCw size={14}/> {retryLabel}</button>}{actionHref && actionLabel && <a className="btn btn-ghost" href={actionHref}>{actionLabel} <ArrowRight size={14}/></a>}</div>}<p className="form-feedback__reassurance">If you are unsure whether a change was saved, check the current status before submitting it again.</p></div></div>;
}

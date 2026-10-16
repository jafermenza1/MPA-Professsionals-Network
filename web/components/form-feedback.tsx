"use client";
import { AlertCircle, CheckCircle2, Info, RefreshCw, ArrowRight, Clock3, ShieldAlert, RotateCcw, FilePenLine, LockKeyhole, Link2 } from "lucide-react";
import type { ReactNode } from "react";
type FeedbackKind = "error" | "success" | "info";
type FeedbackState = "success" | "validation" | "retry" | "pending_review" | "correction_required" | "unauthorized" | "expired" | "info";
const STATE_COPY:Record<FeedbackState,string>={success:"Saved successfully",validation:"Please check these details",retry:"We couldn’t complete that yet",pending_review:"Waiting for review",correction_required:"Changes are needed",unauthorized:"This action isn’t available to this account",expired:"This link or session has expired",info:"A helpful update"};
function inferredState(kind:FeedbackKind,message:string):FeedbackState{
 if(kind==="success")return "success";
 const m=message.toLowerCase();
 if(/expired|has expired|link is no longer valid|session ended/.test(m))return "expired";
 if(/unauthori[sz]ed|forbidden|permission|not allowed|access denied/.test(m))return "unauthorized";
 if(/correction|revision requested|changes requested|please correct|needs correction/.test(m))return "correction_required";
 if(/pending review|awaiting review|submitted for review|waiting for review/.test(m))return "pending_review";
 if(/required|invalid|choose |select |enter |must be|cannot be blank/.test(m))return "validation";
 if(/retry|try again|temporarily|connection|could not load|couldn’t load|unavailable/.test(m))return "retry";
 return kind==="error"?"retry":"info";
}
export function FormFeedback({ kind, message, state, nextAction, reference, onRetry, retryLabel = "Try again", actionHref, actionLabel, membershipReturnTo, children }: { kind: FeedbackKind; message: string; state?:FeedbackState; nextAction?:string; reference?:string; onRetry?: () => void; retryLabel?: string; actionHref?: string; actionLabel?: string; membershipReturnTo?: string; children?: ReactNode }) {
 const resolvedState=state||inferredState(kind,message);
 const Icon = resolvedState==="success"?CheckCircle2:resolvedState==="pending_review"?Clock3:resolvedState==="correction_required"?FilePenLine:resolvedState==="unauthorized"?ShieldAlert:resolvedState==="expired"?LockKeyhole:resolvedState==="retry"?RotateCcw:kind==="error"?AlertCircle:Info;
 const membershipAction = kind === "error" && Boolean(membershipReturnTo) && /membership/i.test(message) && /(required|active|current|validity|expired)/i.test(message);
 const resolvedActionHref = actionHref || (membershipAction ? `/membership?next=${encodeURIComponent(membershipReturnTo!)}` : undefined);
 const resolvedActionLabel = actionLabel || (membershipAction ? "View membership options" : undefined);
 return <div className={`form-feedback form-feedback--${kind}`} data-feedback-state={resolvedState} role={kind === "error" ? "alert" : "status"} aria-live={kind === "error" ? "assertive" : "polite"}><Icon size={19} aria-hidden="true"/><div className="form-feedback__body"><strong>{STATE_COPY[resolvedState]}</strong><p>{message}</p>{reference&&<p className="form-feedback__reference"><Link2 size={13}/> Reference: <code>{reference}</code></p>}{nextAction&&<p className="form-feedback__next-action"><b>Next step:</b> {nextAction}</p>}{children}{(onRetry || (resolvedActionHref && resolvedActionLabel)) && <div className="form-feedback__actions">{onRetry && <button type="button" className="btn btn-ghost" onClick={onRetry}><RefreshCw size={14}/> {retryLabel}</button>}{resolvedActionHref && resolvedActionLabel && <a className="btn btn-ghost" href={resolvedActionHref}>{resolvedActionLabel} <ArrowRight size={14}/></a>}</div>}<p className="form-feedback__reassurance">If you are unsure whether a change was saved, check the current status before submitting it again.</p></div></div>;
}

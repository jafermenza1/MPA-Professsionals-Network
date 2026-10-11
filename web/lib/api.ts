export class ApiError extends Error {
  readonly code?: string;
  readonly status: number;
  readonly requestId?: string;
  constructor(message: string, status: number, code?: string, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

const FRIENDLY_ERRORS: Record<string,string> = {
  IDENTITY_CONFLICT: "An account with these details may already exist. Please sign in with your existing account. If you cannot access it, contact membership support. We have not created a duplicate account.",
  PASSWORD_TOO_SHORT: "Choose a password with at least 10 characters.",
  UNAUTHENTICATED: "Your session has expired or you need to sign in. Please log in and try again.",
  AUTH_RATE_LIMIT: "There have been too many unsuccessful sign-in attempts. Please wait a while and try again.",
  RATE_LIMITED: "Too many requests were made in a short time. Please wait a moment and try again.",
  FORBIDDEN: "Your account does not have permission to perform this action. If you believe this is incorrect, contact support.",
  APPLICATION_EXISTS: "You already have an application in progress. Open application tracking to continue it.",
  ACTIVE_MEMBERSHIP: "You already have an active membership. Choose the renewal option instead.",
  RENEWAL_NOT_ELIGIBLE: "Renewal is not available because there is no active membership to renew.",
  RENEWAL_NOT_SUPPORTED: "This membership option does not support renewal.",
  INVALID_PRODUCT: "That membership option is no longer available. Refresh the page and choose another option.",
  INVALID_STATE: "This item has changed and can no longer be updated in its current state. Refresh the page to see the latest status.",
  PAYMENT_AMOUNT_MISMATCH: "The amount does not match the approved application fee. Check the amount and try again.",
  NOT_FOUND: "We could not find that item. It may have been removed or is no longer available.",
  INVALID_JSON: "Some submitted information could not be read. Review the form and try again.",
  PAYLOAD_TOO_LARGE: "The submitted information is too large. Reduce the size and try again.",
  AUTH_NOT_CONFIGURED: "Sign-in is temporarily unavailable. Please contact support."
};

function safeServerMessage(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  const message = value.trim();
  if (!message || message.length > 240 || /[{}<>]/.test(message) ||
      /\b(sql|query|constraint|relation|column|database|stack trace|TypeError|ReferenceError|ECONN|ENOTFOUND)\b/i.test(message)) return;
  return message;
}

function statusMessage(status: number): string {
  if (status === 400 || status === 422) return "Please review the information and correct the form before trying again.";
  if (status === 401) return FRIENDLY_ERRORS.UNAUTHENTICATED;
  if (status === 403) return FRIENDLY_ERRORS.FORBIDDEN;
  if (status === 404) return FRIENDLY_ERRORS.NOT_FOUND;
  if (status === 409) return "This action conflicts with the current account or application state. Review the information and try again.";
  if (status === 413) return FRIENDLY_ERRORS.PAYLOAD_TOO_LARGE;
  if (status === 429) return FRIENDLY_ERRORS.RATE_LIMITED;
  if (status >= 500) return "We could not complete that request because of a server problem. Please try again later. If it continues, contact support.";
  return "We could not complete that request. Please try again.";
}

export async function api<T>(path:string,init:RequestInit={},token?:string):Promise<T>{
  const headers=new Headers(init.headers);
  if(!(typeof FormData !== "undefined" && init.body instanceof FormData)) headers.set("Content-Type","application/json");
  if(token) headers.set("Authorization","Bearer "+token);
  let response: Response;
  try {
    response = await fetch(path,{...init,headers,cache:"no-store"});
  } catch {
    throw new ApiError("We could not reach the service. Check your connection and try again.",0,"NETWORK_ERROR");
  }

  const requestId = response.headers.get("x-request-id") || undefined;
  let body: any = null;
  const raw = await response.text();
  if (raw) {
    try { body = JSON.parse(raw); }
    catch { body = null; }
  }

  if(!response.ok) {
    const error = body?.error ?? body?.data?.error ?? body;
    const code = typeof error?.code === "string" ? error.code : undefined;
    const message = FRIENDLY_ERRORS[code || ""] ||
      (code === "VALIDATION_ERROR" || code === "BUSINESS_RULE" ? safeServerMessage(error?.message) : undefined) ||
      statusMessage(response.status);
    throw new ApiError(message,response.status,code,requestId);
  }

  if (body === null) {
    throw new ApiError("The service returned an unexpected response. Please try again.",response.status,"INVALID_RESPONSE",requestId);
  }
  return (body?.data??body) as T;
}

import { createHash, createHmac, randomBytes } from "node:crypto";
import { loadConfig } from "./config.js";
import { withTransaction, getPool } from "./db.js";

const sha256 = value => createHash("sha256").update(String(value)).digest("hex");
const clean = value => String(value || "").trim();
const emailUrl = (token) => {
  const config = loadConfig();
  const base = clean(process.env.PUBLIC_APP_URL) || (config.nodeEnv === "production" ? "" : "http://localhost:3001");
  if (!base) throw Object.assign(new Error("PUBLIC_APP_URL is required for production email verification."), { statusCode: 503, code: "EMAIL_DELIVERY_NOT_CONFIGURED" });
  const url = new URL("/verify-email", base);
  url.searchParams.set("token", token);
  return url.toString();
};

export function assertEmailDeliveryConfigured() {
  const config = loadConfig();
  if (config.nodeEnv !== "production") return;
  const publicAppUrl = clean(process.env.PUBLIC_APP_URL);
  const resendKey = clean(process.env.RESEND_API_KEY);
  const emailFrom = clean(process.env.EMAIL_FROM);
  const endpoint = clean(process.env.EMAIL_DELIVERY_WEBHOOK_URL);
  const secret = clean(process.env.EMAIL_DELIVERY_WEBHOOK_SECRET);
  const resendConfigured = Boolean(resendKey && emailFrom);
  const webhookConfigured = Boolean(endpoint && secret);
  if (!publicAppUrl || (!resendConfigured && !webhookConfigured)) {
    throw Object.assign(new Error("Configure PUBLIC_APP_URL and either Resend (RESEND_API_KEY + EMAIL_FROM) or the signed email-delivery webhook before enabling production registration."), { statusCode: 503, code: "EMAIL_DELIVERY_NOT_CONFIGURED" });
  }
  let publicUrl;
  try { publicUrl = new URL(publicAppUrl); } catch { throw Object.assign(new Error("PUBLIC_APP_URL must be a valid HTTPS URL."), { statusCode: 503, code: "EMAIL_DELIVERY_NOT_CONFIGURED" }); }
  if (publicUrl.protocol !== "https:" || publicUrl.username || publicUrl.password || publicUrl.pathname !== "/" || publicUrl.search || publicUrl.hash) throw Object.assign(new Error("PUBLIC_APP_URL must be an HTTPS origin without credentials, path, query, or fragment."), { statusCode: 503, code: "EMAIL_DELIVERY_NOT_CONFIGURED" });
  if (resendConfigured && (!emailFrom.includes("@") || emailFrom.length > 320)) throw Object.assign(new Error("EMAIL_FROM must be a verified sender address."), { statusCode: 503, code: "EMAIL_DELIVERY_NOT_CONFIGURED" });
  if (webhookConfigured) {
    let parsed;
    try { parsed = new URL(endpoint); } catch { throw Object.assign(new Error("Email delivery webhook URL is invalid."), { statusCode: 503, code: "EMAIL_DELIVERY_NOT_CONFIGURED" }); }
    if (parsed.protocol !== "https:") throw Object.assign(new Error("Production email delivery webhooks must use HTTPS."), { statusCode: 503, code: "EMAIL_DELIVERY_NOT_CONFIGURED" });
  }
}

export async function createEmailVerification(db, userId, email, registrationReference, firstName = "") {
  assertEmailDeliveryConfigured();
  const token = randomBytes(32).toString("base64url");
  await db.query(
    "insert into email_verification_token(user_id,token_hash,expires_at) values($1,$2,now()+interval '24 hours')",
    [userId, sha256(token)]
  );
  return { token, verificationUrl: emailUrl(token), registrationReference, email, firstName };
}

export async function deliverEmailVerification(message) {
  const config = loadConfig();
  const templateResult = await getPool().query("select subject_template,text_template,html_template from email_notification_template where template_code='account.email_verification'").catch(()=>({rows:[]}));
  const template = templateResult.rows[0];
  const vars = {firstName: message.firstName || "", verificationUrl: message.verificationUrl, registrationReference: message.registrationReference || ""};
  const render = (source, html=false) => String(source || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_,key) => { const value=String(vars[key] ?? ""); return html ? value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;") : value; });
  const emailSubject = template ? render(template.subject_template) : "Verify your MPA Professionals Network email";
  const emailText = template ? render(template.text_template) : "Verify your email to activate your MPA Professionals Network account. This link expires in 24 hours. Registration reference: " + message.registrationReference + ". Link: " + message.verificationUrl;
  const emailHtml = template ? render(template.html_template, true) : "<p>Verify your email to activate your MPA Professionals Network account.</p><p>Registration reference: <strong>" + message.registrationReference + "</strong></p><p><a href=\"" + message.verificationUrl + "\">Verify email address</a></p><p>This link expires in 24 hours.</p>";
  const resendKey = clean(process.env.RESEND_API_KEY);
  const emailFrom = clean(process.env.EMAIL_FROM);
  const endpoint = clean(process.env.EMAIL_DELIVERY_WEBHOOK_URL);
  const secret = clean(process.env.EMAIL_DELIVERY_WEBHOOK_SECRET);
  if (resendKey && emailFrom) {
    let sent = false, errorCode = null;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + resendKey },
        body: JSON.stringify({ from: emailFrom, to: [message.email], subject: emailSubject, text: emailText, html: emailHtml }),
        signal: AbortSignal.timeout(8000)
      });
      sent = response.ok;
      if (!sent) errorCode = "RESEND_HTTP_" + response.status;
    } catch { errorCode = "RESEND_UNREACHABLE"; }
    await getPool().query("update email_verification_token set delivery_attempted_at=now(),delivery_status=$1,delivery_error_code=$2 where token_hash=$3 and consumed_at is null",[sent?"sent":"failed",errorCode,sha256(message.token)]);
    return { sent };
  }
  if (!endpoint || !secret) {
    if (config.nodeEnv === "production") throw Object.assign(new Error("Email verification delivery is not configured."), { statusCode: 503, code: "EMAIL_DELIVERY_NOT_CONFIGURED" });
    return { sent: false, developmentVerificationUrl: message.verificationUrl };
  }
  const payload = {
    to: message.email,
    template: "mpa-email-verification",
    subject: emailSubject,
    registrationReference: message.registrationReference,
    verificationUrl: message.verificationUrl,
    expiresInHours: 24,
    text: emailText,
    html: emailHtml
  };
  const serialized = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(serialized).digest("hex");
  let sent = false, errorCode = null;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + secret, "x-mpa-payload-signature": signature },
      body: serialized,
      signal: AbortSignal.timeout(8000)
    });
    sent = response.ok;
    if (!sent) errorCode = "DELIVERY_HTTP_" + response.status;
  } catch { errorCode = "DELIVERY_UNREACHABLE"; }
  await getPool().query("update email_verification_token set delivery_attempted_at=now(),delivery_status=$1,delivery_error_code=$2 where token_hash=$3 and consumed_at is null",[sent?"sent":"failed",errorCode,sha256(message.token)]);
  return { sent };
}

export async function verifyEmailToken(rawToken, requestId) {
  if (typeof rawToken !== "string" || rawToken.length < 32 || rawToken.length > 256) {
    throw Object.assign(new Error("The verification link is invalid or expired. Request a new link."), { statusCode: 400, code: "EMAIL_VERIFICATION_INVALID" });
  }
  return withTransaction(async db => {
    const row = (await db.query(
      "select id,user_id from email_verification_token where token_hash=$1 and consumed_at is null and expires_at>now() for update",
      [sha256(rawToken)]
    )).rows[0];
    if (!row) throw Object.assign(new Error("The verification link is invalid, expired, or already used. Request a new link."), { statusCode: 400, code: "EMAIL_VERIFICATION_INVALID" });
    await db.query("update email_verification_token set consumed_at=now() where user_id=$1 and consumed_at is null", [row.user_id]);
    await db.query("update app_user set email_verified_at=coalesce(email_verified_at,now()),updated_at=now() where id=$1", [row.user_id]);
    await db.query(
      "insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'account.email_verified','account',$2,$3,'success',$4)",
      [row.user_id, row.user_id, requestId || null, { method: "single_use_email_link" }]
    );
    return { verified: true };
  });
}

export async function resendEmailVerification(emailInput, requestId) {
  const email = clean(emailInput).toLowerCase();
  if (!email || email.length > 320) return { accepted: true };
  assertEmailDeliveryConfigured();
  const db = getPool();
  const user = (await db.query("select id,email,registration_reference,email_verified_at from app_user where lower(email)=lower($1) limit 1", [email])).rows[0];
  // Keep responses indistinguishable for unknown and already-verified addresses.
  if (!user || user.email_verified_at) return { accepted: true };
  const token = randomBytes(32).toString("base64url");
  await withTransaction(async tx => {
    await tx.query("update email_verification_token set consumed_at=now() where user_id=$1 and consumed_at is null", [user.id]);
    await tx.query("insert into email_verification_token(user_id,token_hash,expires_at) values($1,$2,now()+interval '24 hours')", [user.id, sha256(token)]);
    await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'account.email_verification_resent','account',$2,$3,'success',$4)", [user.id, user.id, requestId || null, { method: "email_link" }]);
  });
  const message = { token, verificationUrl: emailUrl(token), registrationReference: user.registration_reference || "MPA account", email: user.email };
  const delivery = await deliverEmailVerification(message);
  return loadConfig().nodeEnv === "production" ? { accepted: true } : { accepted: true, developmentVerificationUrl: delivery.developmentVerificationUrl || message.verificationUrl };
}

export const PAYMENT_WORKFLOW = Object.freeze({
  initiated:["pending","failed","cancelled"],
  pending:["succeeded","failed","cancelled"],
  succeeded:["refunded"],
  failed:[],
  refunded:[],
  cancelled:[]
});

export function assertPaymentTransition(from,to) {
  if (!(PAYMENT_WORKFLOW[from] || []).includes(to)) {
    throw new Error(`Invalid payment transition: ${from} -> ${to}`);
  }
  return true;
}

export function createManualPayment({amount,currency,purpose,purposeReference,idempotencyKey,submittedBy,evidenceFileId=null,channel="manual"}) {
  if (!Number.isFinite(Number(amount)) || Number(amount) < 0) throw new Error("Payment amount must be non-negative.");
  if (!currency || currency.length !== 3) throw new Error("ISO currency code is required.");
  if (!purpose || !idempotencyKey || !submittedBy) throw new Error("purpose, idempotencyKey and submittedBy are required.");
  return {
    provider:"manual",
    channel,
    source:"manual_entry",
    amount:Number(amount),
    currency:currency.toUpperCase(),
    purpose,
    purposeReference:purposeReference ?? null,
    idempotencyKey,
    submittedBy,
    evidenceFileId
  };
}

export function verifyManualPayment(payment, decision, verifierUserId, note="") {
  if (payment.channel !== "manual" && payment.source !== "legacy_import")
    throw new Error("Manual verification is only available for manual/imported payment records.");
  if (!["approved","rejected","needs_correction"].includes(decision)) throw new Error("Invalid verification decision.");
  return {paymentId:payment.id,decision,verifierUserId,note,verifiedAt:new Date().toISOString()};
}

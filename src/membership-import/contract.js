export const LEGACY_MEMBER_COLUMNS = [
  "legacy_member_id","email","phone","membership_number","full_name",
  "product_code","status","start_date","end_date","paid_amount",
  "paid_currency","payment_reference"
];

export const IMPORT_STATES = ["uploaded","validated","review","approved","applied","failed","cancelled"];

export function normalizeLegacyMember(row) {
  const value = key => typeof row[key] === "string" ? row[key].trim() : row[key];
  return {
    legacyMemberId:value("legacy_member_id") || null,
    email:value("email")?.toLowerCase() || null,
    phone:value("phone") || null,
    membershipNumber:value("membership_number") || null,
    fullName:value("full_name") || null,
    productCode:value("product_code") || null,
    status:value("status") || "pending",
    startDate:value("start_date") || null,
    endDate:value("end_date") || null,
    paidAmount:value("paid_amount") === undefined ? null : Number(value("paid_amount")),
    paidCurrency:value("paid_currency") || null,
    paymentReference:value("payment_reference") || null
  };
}

export function classifyMatch(candidates) {
  if (!candidates.length) return {status:"new", reason:"no candidate"};
  const sorted=[...candidates].sort((a,b)=>b.score-a.score);
  if(sorted[0].score >= 95 && (!sorted[1] || sorted[0].score-sorted[1].score >= 10))
    return {status:"matched", candidate:sorted[0], reason:"high-confidence unique match"};
  return {status:"conflict", candidates:sorted, reason:"manual review required"};
}

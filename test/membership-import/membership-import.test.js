import test from "node:test";
import assert from "node:assert/strict";
import {normalizeLegacyMember,classifyMatch} from "../../src/membership-import/contract.js";
import {createManualPayment,verifyManualPayment,assertPaymentTransition} from "../../src/platform/payment-workflow.js";

test("legacy membership rows normalize into a stable contract",()=>{
  const row=normalizeLegacyMember({legacy_member_id:" OLD-1 ",email:" A@EXAMPLE.COM ",paid_amount:"1200",paid_currency:"etb"});
  assert.equal(row.legacyMemberId,"OLD-1"); assert.equal(row.email,"a@example.com"); assert.equal(row.paidAmount,1200); assert.equal(row.paidCurrency,"etb");
});
test("ambiguous membership matches require review",()=>{
  assert.equal(classifyMatch([{userId:"u1",score:96},{userId:"u2",score:94}]).status,"conflict");
  assert.equal(classifyMatch([{userId:"u1",score:99}]).status,"matched");
  assert.equal(classifyMatch([]).status,"new");
});
test("manual payment is provider-neutral and evidence-aware",()=>{
  const p=createManualPayment({amount:1200,currency:"ETB",purpose:"membership",purposeReference:"M-1",idempotencyKey:"manual:M-1",submittedBy:"u1"});
  assert.equal(p.provider,"manual"); assert.equal(p.source,"manual_entry"); assert.equal(p.currency,"ETB");
  const result=verifyManualPayment({...p,id:"p1"},"approved","reviewer"); assert.equal(result.paymentId,"p1"); assert.equal(result.decision,"approved"); assert.equal(result.verifierUserId,"reviewer"); assert.ok(result.verifiedAt);
});
test("payment transitions reject invalid states",()=>{assert.throws(()=>assertPaymentTransition("pending","refunded"),/Invalid payment transition/);});

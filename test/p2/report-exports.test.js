import test from "node:test";
import assert from "node:assert/strict";
import { listReportCatalogue,makePdf,makeXlsx } from "../../src/platform/reports.js";
import { memberImportTemplate } from "../../src/membership/admin-bulk.js";

test("report catalogue respects role scope and hides restricted personal/financial reports",()=>{
 const admin=listReportCatalogue({sub:"admin",roles:["system_admin"],permissions:[]});
 assert.ok(admin.some(r=>r.id==="member-directory"));
 assert.ok(admin.some(r=>r.id==="payment-reconciliation"));
 assert.ok(admin.some(r=>r.id==="audit-activity"));
 const support=listReportCatalogue({sub:"support",roles:["supporting_staff"],permissions:[]});
 assert.ok(support.some(r=>r.id==="service-demand"));
 assert.equal(support.some(r=>r.id==="member-directory"),false);
 assert.equal(support.some(r=>r.id==="payment-reconciliation"),false);
});
test("PDF report output is a valid PDF-shaped artifact with report metadata",()=>{
 const result={report:{title:"Membership status",scope:"Platform aggregate",definition:"Counts by membership status."},filters:{from:"2026-01-01",to:"2026-01-31"},generatedAt:"2026-10-14T12:00:00.000Z",rows:[{"Status":"active","Members":3}],totals:{rows:1}};
 const pdf=makePdf(result),text=pdf.toString("ascii");
 assert.ok(text.startsWith("%PDF-1.4"));
 assert.ok(text.includes("Membership status"));
 assert.ok(text.includes("startxref"));
});
test("XLSX output includes ZIP container and workbook parts",()=>{
 const result={report:{title:"Membership status",scope:"Platform aggregate",definition:"Counts by membership status.",columns:["Status","Members"]},filters:{},generatedAt:"2026-10-14T12:00:00.000Z",rows:[{"Status":"active","Members":3}],totals:{rows:1}};
 const xlsx=makeXlsx(result);
 assert.equal(xlsx.readUInt32LE(0),0x04034b50);
 assert.ok(xlsx.includes(Buffer.from("xl/workbook.xml")));
 assert.ok(xlsx.includes(Buffer.from("[Content_Types].xml")));
});
test("approved-member CSV template includes required columns and no password field",()=>{
 const csv=memberImportTemplate(),header=csv.split("\r\n")[0].split(",");
 for(const key of ["email","full_name","membership_number","product_code","status","start_date","end_date","approved_membership"])assert.ok(header.includes(key));
 assert.equal(header.some(key=>/password/i.test(key)),false);
 assert.match(csv,/MPA approval register reference/);
});

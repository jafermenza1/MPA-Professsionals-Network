import test from "node:test";
import assert from "node:assert/strict";
import { createXlsx, parseXlsxRows } from "../../src/platform/xlsx.js";

test("XLSX reference workbook round-trips stable codes, hierarchy, Unicode and escaped text", () => {
  const headers = ["code", "label", "description", "sort_order", "active", "parent_code", "aliases"];
  const rows = [
    { code: "EDU_LEVEL", label: "Education level", description: 'Qualification, "level" & category', sort_order: 1, active: true, parent_code: "", aliases: "education;level" },
    { code: "BA", label: "Bachelor's degree", description: "የትምህርት ደረጃ", sort_order: 2, active: true, parent_code: "EDU_LEVEL", aliases: "undergraduate;BA" }
  ];
  const workbook = createXlsx(rows, headers);
  const parsed = parseXlsxRows(workbook);
  assert.deepEqual(parsed.headers, headers);
  assert.deepEqual(parsed.rows, rows.map(row => Object.fromEntries(headers.map(key => [key, String(row[key] ?? "")]))));
});

test("XLSX parser rejects non-workbook input rather than silently treating it as CSV", () => {
  assert.throws(() => parseXlsxRows(Buffer.from("code,label\nA,Alpha")), /valid ZIP-based Excel workbook/);
});

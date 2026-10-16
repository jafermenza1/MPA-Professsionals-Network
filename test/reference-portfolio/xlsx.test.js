import test from "node:test";
import assert from "node:assert/strict";
import { createXlsx, parseXlsxRows } from "../../src/platform/xlsx.js";

test("XLSX reference workbook round-trips stable codes, hierarchy, metadata, dates and Unicode", () => {
  const headers = ["code", "label", "description", "sort_order", "active", "parent_code", "aliases", "short_label", "metadata", "effective_from", "effective_to"];
  const rows = [
    { code: "EDU_LEVEL", label: "Education level", description: 'Qualification, "level" & category', sort_order: 1, active: true, parent_code: "", aliases: "education;level", short_label: "Education", metadata: '{"source":"test"}', effective_from: "2026-01-01", effective_to: "" },
    { code: "BA", label: "Bachelor's degree", description: "የትምህርት ደረጃ", sort_order: 2, active: true, parent_code: "EDU_LEVEL", aliases: "undergraduate;BA", short_label: "BA", metadata: '{"source":"association"}', effective_from: "2026-02-01", effective_to: "2027-01-31" }
  ];
  const workbook = createXlsx(rows, headers);
  const parsed = parseXlsxRows(workbook);
  assert.deepEqual(parsed.headers, headers);
  assert.deepEqual(parsed.rows, rows.map(row => Object.fromEntries(headers.map(key => [key, String(row[key] ?? "")]))));
});

test("XLSX parser rejects non-workbook input rather than silently treating it as CSV", () => {
  assert.throws(() => parseXlsxRows(Buffer.from("code,label\nA,Alpha")), /valid ZIP-based Excel workbook/);
});

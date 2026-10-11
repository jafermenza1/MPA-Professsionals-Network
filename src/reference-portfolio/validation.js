const VALID_STATUSES = new Set(["active", "deprecated"]);
const CLASSIFICATIONS = ["new","unchanged","renamed","parent_changed","code_changed","duplicate","deleted","deprecated","invalid_parent","conflict","invalid"];

export function validateReferenceRows(rows) {
  const diagnostics = rows.map((row, index) => ({
    rowNumber: index + 1, classification: "new", code: row?.code, errors: [], warnings: []
  }));
  const codes = new Set();
  const parentByCode = new Map();

  rows.forEach((row, index) => {
    const d = diagnostics[index];
    if (!row || typeof row !== "object") {
      d.errors.push("Row must be an object.");
      d.classification = "invalid";
      return;
    }
    if (typeof row.code !== "string" || !row.code.trim()) d.errors.push("Code is required.");
    if (typeof row.name !== "string" || !row.name.trim()) d.errors.push("Name is required.");
    if (typeof row.type !== "string" || !row.type.trim()) d.errors.push("Type is required.");
    if (codes.has(row.code)) d.errors.push("Duplicate code in import.");
    codes.add(row.code);
    parentByCode.set(row.code, row.parent_code ?? null);
    if (row.parent_code === row.code) d.errors.push("An item cannot be its own parent.");
    if (row.status !== undefined && !VALID_STATUSES.has(row.status)) {
      d.errors.push("Unknown status is not publishable; map it to an allowed status.");
    }
    if (d.errors.length) d.classification = "invalid";
  });

  for (const [code, parent] of parentByCode) {
    if (!parent || parentByCode.has(parent)) continue;
    const d = diagnostics.find((item) => item.code === code);
    if (d) {
      d.errors.push("Parent code '" + parent + "' does not exist in this import.");
      if (d.classification === "new") d.classification = "invalid_parent";
    }
  }

  const visiting = new Set(), visited = new Set();
  const visit = (code) => {
    if (visited.has(code)) return;
    if (visiting.has(code)) {
      const d = diagnostics.find((item) => item.code === code);
      if (d) {
        d.errors.push("Hierarchy contains a parent cycle.");
        d.classification = "invalid";
      }
      return;
    }
    visiting.add(code);
    const parent = parentByCode.get(code);
    if (parent) visit(parent);
    visiting.delete(code);
    visited.add(code);
  };
  for (const code of parentByCode.keys()) visit(code);

  const counts = Object.fromEntries(CLASSIFICATIONS.map((key) => [key, 0]));
  for (const d of diagnostics) counts[d.classification]++;
  return { valid: diagnostics.every((d) => d.errors.length === 0), diagnostics, counts };
}

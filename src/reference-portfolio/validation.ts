import { z } from "zod";

export const referenceDomainSchema = z.enum([
  "geography","occupation","industry","education_level",
  "qualification_type","field_of_study","membership","verification",
]);

export const importFormatSchema = z.enum(["csv","xlsx","json"]);

export const importStatusSchema = z.enum([
  "uploaded","mapped","validated","rejected","drafted","published",
]);

export const rowClassificationSchema = z.enum([
  "new","unchanged","renamed","parent_changed","code_changed",
  "duplicate","deleted","deprecated","invalid_parent","conflict","invalid",
]);

export const referenceItemSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  type: z.string().trim().min(1),
  parent_code: z.string().trim().min(1).nullable().optional(),
  status: z.string().trim().min(1).default("active"),
  metadata: z.record(z.unknown()).default({}),
});

export type ReferenceItem = z.infer<typeof referenceItemSchema>;

export const importRequestSchema = z.object({
  datasetKey: z.string().trim().min(1),
  format: importFormatSchema,
  filename: z.string().trim().min(1),
  rows: z.array(referenceItemSchema).min(1),
});

export type ImportRequest = z.infer<typeof importRequestSchema>;

export type RowDiagnostic = {
  rowNumber: number;
  classification: z.infer<typeof rowClassificationSchema>;
  code?: string;
  errors: string[];
  warnings: string[];
};

export type ValidationResult = {
  valid: boolean;
  diagnostics: RowDiagnostic[];
  counts: Record<z.infer<typeof rowClassificationSchema>, number>;
};

export function validateReferenceRows(rows: ReferenceItem[]): ValidationResult {
  const diagnostics: RowDiagnostic[] = [];
  const counts = Object.fromEntries(
    rowClassificationSchema.options.map((value) => [value, 0]),
  ) as ValidationResult["counts"];

  const codes = new Set<string>();
  const parentByCode = new Map<string, string | null>();

  rows.forEach((row, index) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (codes.has(row.code)) errors.push("Duplicate code in import.");
    codes.add(row.code);
    parentByCode.set(row.code, row.parent_code ?? null);

    if (row.parent_code === row.code) {
      errors.push("An item cannot be its own parent.");
    }

    if (row.status !== "active" && row.status !== "deprecated") {
      warnings.push("Unknown status will require mapping before publication.");
    }

    const classification = errors.length ? "invalid" : "new";
    counts[classification]++;
    diagnostics.push({
      rowNumber: index + 1,
      classification,
      code: row.code,
      errors,
      warnings,
    });
  });

  for (const [code, parent] of parentByCode) {
    if (!parent) continue;
    if (!parentByCode.has(parent)) {
      const diagnostic = diagnostics.find((item) => item.code === code);
      if (diagnostic) {
        diagnostic.errors.push(`Parent code '${parent}' does not exist in this import.`);
        if (diagnostic.classification === "new") {
          counts.new--;
          counts.invalid_parent++;
          diagnostic.classification = "invalid_parent";
        }
      }
    }
  }

  // Detect cycles in the imported parent graph.
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (code: string): void => {
    if (visited.has(code)) return;
    if (visiting.has(code)) {
      const diagnostic = diagnostics.find((item) => item.code === code);
      if (diagnostic) {
        counts[diagnostic.classification]--;
        counts.invalid++;
        diagnostic.classification = "invalid";
        diagnostic.errors.push("Hierarchy contains a parent cycle.");
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

  return {
    valid: diagnostics.every((item) => item.errors.length === 0),
    diagnostics,
    counts,
  };
}

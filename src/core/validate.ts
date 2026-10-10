// Checks a filled form against its field definitions in intake.ts. The answers
// come from a Claude session, so this is what keeps the forms deterministic:
// anything outside the defined fields, options and ranges is rejected with a
// plain-language error rather than stored.
import type { Field } from "./intake.js";

export type Answers = Record<string, string | number | boolean | string[]>;

export type CheckResult = { ok: true; values: Answers } | { ok: false; errors: string[] };

/** A real calendar date as YYYY-MM-DD. Date.parse alone rolls impossible dates over (2026-02-30 becomes 2 March), so the parse must give back the same text. */
const isDate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
};

/** The shape of a command's input around its form answers: which keys exist and what each holds. */
export type Shape = Record<string, { type: "integer" | "number" | "string" | "object"; required?: boolean }>;

/** Plain-language errors for input that doesn't fit the shape; unknown keys are errors too, so a typo can't be silently dropped. */
export function checkShape(input: unknown, shape: Shape): string[] {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return ["Expected a JSON object."];
  const errors: string[] = [];
  const obj = input as Record<string, unknown>;
  for (const key of Object.keys(obj)) if (!Object.hasOwn(shape, key)) errors.push(`"${key}" isn't recognised. Use: ${Object.keys(shape).join(", ")}.`);
  for (const [key, { type, required }] of Object.entries(shape)) {
    const v = obj[key];
    if (v === undefined) {
      if (required) errors.push(`"${key}" is required.`);
      continue;
    }
    const ok =
      type === "integer" ? Number.isInteger(v) && (v as number) > 0
      : type === "number" ? typeof v === "number" && Number.isFinite(v)
      : type === "string" ? typeof v === "string"
      : typeof v === "object" && v !== null && !Array.isArray(v);
    if (!ok) errors.push(`"${key}" must be ${type === "integer" ? "a whole number above 0" : type === "number" ? "a number" : type === "string" ? "text" : "an object"}; got ${JSON.stringify(v)}.`);
  }
  return errors;
}

export function checkAnswers(fields: Field[], input: Record<string, unknown>): CheckResult {
  const errors: string[] = [];
  const values: Answers = {};
  const known = new Map(fields.map((f) => [f.id, f]));
  for (const key of Object.keys(input)) if (!known.has(key)) errors.push(`"${key}" is not a field on this form.`);

  for (const f of fields) {
    const v = input[f.id];
    // Blank text, including whitespace only, counts as unanswered: a name of "   " isn't a name.
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0)) {
      if (f.required) errors.push(`${f.label} is required.`);
      continue;
    }
    switch (f.kind) {
      case "text":
        if (typeof v !== "string") errors.push(`${f.label} must be text.`);
        else values[f.id] = v.trim();
        break;
      case "number": {
        const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
        const unit = f.unit ? ` ${f.unit}` : "";
        if (!Number.isFinite(n)) errors.push(`${f.label} must be a number.`);
        else if (f.integer && !Number.isInteger(n)) errors.push(`${f.label} must be a whole number; got ${n}${unit}.`);
        else if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max))
          errors.push(`${f.label} must be between ${f.min ?? "-∞"} and ${f.max ?? "∞"}${unit}; got ${n}${unit}.`);
        else values[f.id] = n;
        break;
      }
      case "date":
        if (typeof v !== "string" || !isDate(v)) errors.push(`${f.label} must be a date like 2026-10-04.`);
        else values[f.id] = v;
        break;
      case "boolean":
        if (typeof v !== "boolean") errors.push(`${f.label} must be true or false.`);
        else values[f.id] = v;
        break;
      case "choice":
      case "chips": {
        const allowed = f.options.map((o) => o.value);
        const picked = (Array.isArray(v) ? v : [v]).map(String);
        if (f.kind === "choice" && Array.isArray(v)) {
          errors.push(`${f.label} takes one answer.`);
          break;
        }
        const bad = picked.filter((p) => !allowed.includes(p));
        if (bad.length) errors.push(`${f.label}: ${bad.map((b) => `"${b}"`).join(", ")} isn't an option. Options: ${allowed.join(", ")}.`);
        else values[f.id] = f.kind === "chips" ? [...new Set(picked)] : picked[0];
        break;
      }
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, values };
}

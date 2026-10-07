// Rebuilds an importable .kpro from the profile a .klog carries in its header.
//
// Checked against a real stock .kpro and a log roasted on it: the log header has
// every profile key with the same values (written to 6 significant figures, so
// curve points lose about 0.001), plus the per-roast keys below, and lacks only
// profile_description. Output files are the user's data: never write them into
// the repo (fixtures/private/ is git-ignored).
import { parseHeader, splitLines } from "./parse.js";

/** Header keys a log adds about the roast itself; they are not part of the profile. */
export const LOG_ONLY_KEYS = [
  "log_file_name",
  "profile_file_name",
  "native_schema_version",
  "roasting_level",
  "boost_load_size",
  "boost_load_fan_multiplier",
  "boost_load_power_multiplier",
  "time_jump",
  "preheat_heater_percent",
  "ambient_temperature",
  "mains_voltage",
  "heater_power_available",
  "power_factor",
  "density_factor",
  "reference_temperature",
  "back2back_count",
  "model",
  "motor_hours",
  "heater_hours",
  "calibration_data",
  "firmware_version",
  "reference_load_size",
  "roast_date",
  // What the roaster typed about this roast (often a weight); it is theirs, not part of the profile.
  "tasting_notes",
] as const;

/** A profile as ordered key/value lines, the way .kpro files store it. */
export type ProfileLines = [key: string, value: string][];

/** The profile a .klog was roasted with, in the order the log lists it. */
export function profileFromLog(klogText: string): ProfileLines {
  const { header } = parseHeader(splitLines(klogText));
  if (!header.roast_profile) throw new Error("not a Kaffelogic log: no roast_profile line");
  const drop = new Set<string>(LOG_ONLY_KEYS);
  return Object.entries(header).filter(([k]) => !drop.has(k));
}

/** A .kpro's own lines, in file order. */
export function profileFromKpro(kproText: string): ProfileLines {
  const { header } = parseHeader(splitLines(kproText));
  if (!header.roast_profile) throw new Error("not a Kaffelogic profile: no roast_profile line");
  return Object.entries(header);
}

/** A Kaffelogic file found on disk; kind is decided by content, not by name. */
export interface KaffelogicFile {
  path: string;
  text: string;
}

export interface BaseProfile {
  lines: ProfileLines;
  /** Where it came from, for telling the person. */
  path: string;
  from: "kpro" | "klog";
}

/** profile_modified ("26/07/2020 05:51:19PM" or "10/02/2025 22:50:23 UTC") as a sortable number; 0 when missing or unreadable. */
function modifiedOrder(s: string | undefined): number {
  const m = s?.trim().match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})(AM|PM)?/);
  if (!m) return 0;
  const h = (Number(m[4]) % 12) + (m[7] === "PM" ? 12 : 0);
  return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), m[7] ? h : Number(m[4]), Number(m[5]), Number(m[6]));
}

/**
 * The profile to build on: a .kpro with that name (and modified stamp, when given),
 * else the copy embedded in a log roasted on it. A real .kpro wins because it keeps
 * full precision and its description. With no stamp, the most recently modified wins.
 */
export function findBaseProfile(files: KaffelogicFile[], want: { name: string; modified?: string }): BaseProfile | undefined {
  const candidates: (BaseProfile & { order: number })[] = [];
  for (const f of files) {
    const { header } = parseHeader(splitLines(f.text));
    if (!header.roast_profile || header.profile_short_name?.trim() !== want.name) continue;
    if (want.modified !== undefined && header.profile_modified?.trim() !== want.modified.trim()) continue;
    const isLog = header.log_file_name !== undefined || header.roasting_level !== undefined;
    candidates.push({
      lines: isLog ? profileFromLog(f.text) : profileFromKpro(f.text),
      path: f.path,
      from: isLog ? "klog" : "kpro",
      order: modifiedOrder(header.profile_modified),
    });
  }
  candidates.sort((a, b) => Number(a.from === "klog") - Number(b.from === "klog") || b.order - a.order);
  if (!candidates.length) return undefined;
  const { order: _, ...best } = candidates[0];
  return best;
}

/** Keys that label a profile without changing how it roasts. */
/**
 * Keys that label a profile without changing how it roasts. recommended_level is only the level the
 * machine offers first; the level actually roasted is chosen before each roast (the log's
 * roasting_level), so two profiles that differ only in it roast the same way.
 */
const LABEL_KEYS = new Set(["profile_short_name", "profile_designer", "profile_description", "profile_modified", "recommended_level"]);

/** Two header values agree: comma lists number by number to the 6 significant figures logs write, else as text. */
function sameValue(a: string, b: string): boolean {
  const xs = a.split(",");
  const ys = b.split(",");
  if (xs.length !== ys.length) return false;
  return xs.every((x, i) => {
    const [nx, ny] = [Number(x), Number(ys[i])];
    if (x.trim() === "" || Number.isNaN(nx) || Number.isNaN(ny)) return x.trim() === ys[i].trim();
    return Math.abs(nx - ny) <= Math.max(Math.abs(ny), 1) * 5e-6;
  });
}

/**
 * Whether two profiles roast the same way: same curves, levels, zones and settings, whatever
 * they are called. A stock profile renamed for a bean is the same profile as the stock one, and
 * the copy inside a log is the same as the .kpro it was roasted with.
 */
export function sameProfileBody(a: ProfileLines, b: ProfileLines): boolean {
  const body = (lines: ProfileLines) => new Map(lines.filter(([k]) => !LABEL_KEYS.has(k)));
  const [ma, mb] = [body(a), body(b)];
  if (ma.size !== mb.size) return false;
  for (const [k, v] of ma) if (!mb.has(k) || !sameValue(v, mb.get(k)!)) return false;
  return true;
}

/** .kpro text for profile lines exactly as given. */
export const formatKpro = (lines: ProfileLines) => lines.map(([k, v]) => `${k}:${v}`).join("\n") + "\n";

export interface ProfileEdits {
  /** The name the machine will show; give each written profile its own so they can't be confused. */
  shortName?: string;
  /** Plain text; newlines are stored as Kaffelogic's \v. */
  description?: string;
  /** The level the machine offers first when the profile is picked (a suggestion; any level can still be set). */
  recommendedLevel?: number;
  /** Stamped as profile_modified; defaults to now. */
  modified?: Date;
}

/**
 * Kaffelogic's profile_modified stamp as its 2025 profiles write it: "DD/MM/YYYY HH:MM:SS UTC".
 * (The 2020 stock profiles used "DD/MM/YYYY hh:mm:ssPM"; modifiedOrder reads both.)
 */
export function kaffelogicModified(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
}

/** .kpro text for a profile with the given edits applied. Keys keep their order; a new description goes after the designer, as in stock files, and other new keys at the end. */
export function writeKpro(lines: ProfileLines, edits: ProfileEdits = {}): string {
  const set: Record<string, string> = { profile_modified: kaffelogicModified(edits.modified ?? new Date()) };
  if (edits.shortName !== undefined) set.profile_short_name = edits.shortName;
  if (edits.description !== undefined) set.profile_description = edits.description.replace(/\r?\n/g, "\\v");
  if (edits.recommendedLevel !== undefined) {
    if (!(edits.recommendedLevel >= 0 && edits.recommendedLevel <= 6)) throw new Error(`recommended level must be between 0 and 6; got ${edits.recommendedLevel}`);
    set.recommended_level = String(edits.recommendedLevel);
  }
  for (const [k, v] of Object.entries(set)) if (/[\r\n]/.test(v)) throw new Error(`${k} can't contain a line break`);

  const out: ProfileLines = lines.map(([k, v]) => [k, set[k] ?? v]);
  const has = new Set(out.map(([k]) => k));
  for (const [k, v] of Object.entries(set)) {
    if (has.has(k)) continue;
    if (k === "profile_description") out.splice(out.findIndex(([key]) => key === "profile_designer") + 1, 0, [k, v]);
    else out.push([k, v]);
  }
  return formatKpro(out);
}

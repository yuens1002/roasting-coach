// Parser for Kaffelogic Nano 7 profile (.kpro) and roast log (.klog) files.
//
// Both files start with a `key:value` header, one per line. Curves in the header
// (`roast_profile`, `fan_profile`) are comma-separated Bezier nodes. A .klog then
// has a blank line, an `offsets` row, a tab-separated column header row, and
// tab-separated data rows. Events are interleaved as `!name:value` lines; they are
// written a few seconds after the event, so their value (not their position) is
// the time.

export interface Point {
  t: number;
  v: number;
}

/** A Bezier node: the point the curve passes through and its two control handles. */
export interface CurveNode {
  point: Point;
  handleIn: Point;
  handleOut: Point;
}

export interface KaffelogicProfile {
  header: Record<string, string>;
  shortName: string;
  designer?: string;
  /** Description with Kaffelogic's `\v` line breaks turned into newlines. */
  description: string;
  schemaVersion?: string;
  recommendedLevel?: number;
  /** End temperatures for levels 0..6; fractional levels interpolate between them. */
  roastLevels: number[];
  expectFirstCrack?: number;
  minDesiredRor?: number;
  preheatPower?: number;
  roastCurve: CurveNode[];
  fanCurve: CurveNode[];
  zones: { index: number; start: number; end: number; boost: number }[];
}

export interface KaffelogicLog {
  profile: KaffelogicProfile;
  roastDate?: string;
  level?: number;
  loadSize?: number;
  ambientTemp?: number;
  firmware?: string;
  model?: string;
  columns: string[];
  offsets: number[];
  /** Data columns keyed by cleaned column name (display prefixes `#`, `=`, `^` removed). */
  data: Record<string, number[]>;
  /** Events and computed values from `!name:value` lines. */
  markers: Record<string, number>;
}

const num = (s: string | undefined): number | undefined => {
  if (s === undefined || s.trim() === "") return undefined;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
};

function splitLines(text: string): string[] {
  return text.replace(/^﻿/, "").split(/\r?\n/);
}

/** Reads `key:value` lines until the first blank line (or the end). */
function parseHeader(lines: string[]): { header: Record<string, string>; next: number } {
  const header: Record<string, string> = {};
  let i = 0;
  // Some files start with a blank line before the header.
  while (i < lines.length && lines[i].trim() === "") i++;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") break;
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    header[line.slice(0, colon).trim()] = line.slice(colon + 1);
  }
  return { header, next: i };
}

export function parseCurve(raw: string | undefined): CurveNode[] {
  if (!raw) return [];
  const n = raw.split(",").map((s) => Number.parseFloat(s));
  if (n.some((x) => !Number.isFinite(x)) || n.length % 6 !== 0) {
    throw new Error(`curve has ${n.length} numbers; expected a multiple of 6`);
  }
  const nodes: CurveNode[] = [];
  for (let i = 0; i < n.length; i += 6) {
    nodes.push({
      point: { t: n[i], v: n[i + 1] },
      handleIn: { t: n[i + 2], v: n[i + 3] },
      handleOut: { t: n[i + 4], v: n[i + 5] },
    });
  }
  return nodes;
}

function bezier(p0: Point, p1: Point, p2: Point, p3: Point, s: number): Point {
  const u = 1 - s;
  const a = u * u * u, b = 3 * u * u * s, c = 3 * u * s * s, d = s * s * s;
  return { t: a * p0.t + b * p1.t + c * p2.t + d * p3.t, v: a * p0.v + b * p1.v + c * p2.v + d * p3.v };
}

/**
 * Value of a Bezier curve at time t (solved by bisection on the time axis).
 * Past the last node the curve continues in a straight line along the last
 * handle, which is what the Nano does: log0040's profile column keeps rising at
 * exactly that slope (3.88 °C/min) after the curve's last point.
 */
export function evalCurve(nodes: CurveNode[], t: number): number | undefined {
  const last = nodes[nodes.length - 1];
  if (last && nodes.length > 1 && t > last.point.t) {
    const dt = last.point.t - last.handleIn.t;
    if (dt <= 0) return last.point.v;
    return last.point.v + ((last.point.v - last.handleIn.v) / dt) * (t - last.point.t);
  }
  for (let k = 0; k + 1 < nodes.length; k++) {
    const a = nodes[k], b = nodes[k + 1];
    if (t < a.point.t || t > b.point.t) continue;
    let lo = 0, hi = 1;
    for (let it = 0; it < 50; it++) {
      const mid = (lo + hi) / 2;
      if (bezier(a.point, a.handleOut, b.handleIn, b.point, mid).t < t) lo = mid;
      else hi = mid;
    }
    return bezier(a.point, a.handleOut, b.handleIn, b.point, (lo + hi) / 2).v;
  }
  return undefined;
}

/** First time the curve (extended past its end) reaches `temp` before `limit` seconds. */
export function timeCurveReaches(nodes: CurveNode[], temp: number, step = 0.5, limit = 1200): number | undefined {
  if (nodes.length < 2) return undefined;
  const end = limit;
  for (let t = nodes[0].point.t; t <= end; t += step) {
    const v = evalCurve(nodes, t);
    if (v !== undefined && v >= temp) return t;
  }
  return undefined;
}

function profileFromHeader(header: Record<string, string>): KaffelogicProfile {
  const zones: KaffelogicProfile["zones"] = [];
  for (let z = 1; z <= 9; z++) {
    const start = num(header[`zone${z}_time_start`]);
    const end = num(header[`zone${z}_time_end`]);
    if (start === undefined || end === undefined) continue;
    if (end > start) zones.push({ index: z, start, end, boost: num(header[`zone${z}_boost`]) ?? 0 });
  }
  return {
    header,
    shortName: header.profile_short_name?.trim() ?? "",
    designer: header.profile_designer?.trim(),
    description: (header.profile_description ?? "").replace(/\\v/g, "\n").trim(),
    schemaVersion: header.profile_schema_version?.trim(),
    recommendedLevel: num(header.recommended_level),
    roastLevels: (header.roast_levels ?? "").split(",").map(num).filter((x): x is number => x !== undefined),
    // 0 means "not set" in these files.
    expectFirstCrack: num(header.expect_fc) || undefined,
    minDesiredRor: num(header.roast_min_desired_rate_of_rise),
    preheatPower: num(header.preheat_power),
    roastCurve: parseCurve(header.roast_profile),
    fanCurve: parseCurve(header.fan_profile),
    zones,
  };
}

export function parseKpro(text: string): KaffelogicProfile {
  const { header } = parseHeader(splitLines(text));
  if (!header.roast_profile) throw new Error("not a Kaffelogic profile: no roast_profile line");
  return profileFromHeader(header);
}

/** Kaffelogic writes dates as DD/MM/YYYY HH:MM:SS UTC. */
function kaffelogicDateToIso(s: string | undefined): string | undefined {
  const m = s?.trim().match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return undefined;
  return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}Z`;
}

const cleanColumn = (c: string) => c.replace(/^[#=^]+/, "").trim();

export function parseKlog(text: string): KaffelogicLog {
  const lines = splitLines(text);
  const { header, next } = parseHeader(lines);
  if (!header.roast_profile) throw new Error("not a Kaffelogic log: no roast_profile line");

  let offsets: number[] = [];
  let columns: string[] = [];
  const data: Record<string, number[]> = {};
  const markers: Record<string, number> = {};

  for (let i = next; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    if (line.startsWith("!")) {
      const colon = line.indexOf(":");
      const v = num(line.slice(colon + 1));
      if (colon > 1 && v !== undefined) markers[line.slice(1, colon).trim()] = v;
      continue;
    }
    const cells = line.split("\t").filter((c, idx, arr) => !(idx === arr.length - 1 && c.trim() === ""));
    if (cells[0] === "offsets") {
      offsets = cells.slice(1).map((c) => num(c) ?? 0);
    } else if (cells[0] === "time") {
      columns = cells.map(cleanColumn);
      for (const c of columns) data[c] = [];
    } else if (columns.length) {
      // Skip short or garbled rows rather than misalign columns.
      if (cells.length < columns.length) continue;
      const values = cells.map(num);
      if (values[0] === undefined) continue;
      columns.forEach((c, k) => data[c].push(values[k] ?? Number.NaN));
    }
  }
  if (!columns.length) throw new Error("Kaffelogic log has no data table");

  return {
    profile: profileFromHeader(header),
    roastDate: kaffelogicDateToIso(header.roast_date),
    level: num(header.roasting_level),
    loadSize: num(header.boost_load_size),
    ambientTemp: num(header.ambient_temperature),
    firmware: header.firmware_version?.trim(),
    model: header.model?.trim(),
    columns,
    offsets,
    data,
    markers,
  };
}

/**
 * End temperature for a roast level. Levels index `roast_levels` from 0, and
 * fractional levels interpolate linearly (level 3.3 on 204,209,214,219,222 → 219.9 °C).
 * Checked against log0040, where level 3.3 ended at 219.7 °C.
 */
export function levelToTemp(roastLevels: number[], level: number): number | undefined {
  if (!roastLevels.length) return undefined;
  const max = roastLevels.length - 1;
  const l = Math.min(Math.max(level, 0), max);
  const i = Math.min(Math.floor(l), max - 1);
  const f = l - i;
  return max === 0 ? roastLevels[0] : roastLevels[i] + f * (roastLevels[i + 1] - roastLevels[i]);
}

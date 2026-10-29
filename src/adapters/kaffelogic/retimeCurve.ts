// Retiming a profile's whole curve from checkpoints: "the curve reaches 150 °C at 190 s" (docs/ROADMAP.md, Next 3, curve edits).
//
// editCurve.ts reshapes the last climb only. This moves the curve in time anywhere between 100 °C and its last point, in terms a roaster
// uses: when it gets to a temperature. Each checkpoint splits the curve where it crosses that temperature (the shape does not change,
// the split only adds a point), then the stretch of curve between one checkpoint and the next is slid and stretched in time so the
// point sits at the time asked for. Temperatures never change: only when the curve gets to them. Everything after the last checkpoint
// keeps its shape and moves as a whole, so the roast comes to its end that much earlier or later; nothing there is squeezed.
import { type CurveNode, type Point, evalCurve } from "./parse.js";

/** The curve reaches `temp` (°C) at `at` seconds. */
export interface Checkpoint {
  temp: number;
  at: number;
}

/** Below this the curve is the machine's start, not the roast: the drum is already hot when the beans go in, so a checkpoint there says nothing about the beans. */
export const MIN_CHECKPOINT_TEMP_C = 100;

/** The fastest any stock profile in the library climbs once past MIN_CHECKPOINT_TEMP_C (Cupping, 115.3 °C/min): the fastest the machine has been seen to be asked for. */
export const MAX_RISE_C_PER_MIN = 116;

/** The late roast is asked for less: from LATE_FROM_C up, no stock profile climbs faster than this (2000-2700m Rest, 12.9 °C/min, at 200 °C; the others are under 12 and Classic's is 6). Not a limit of the machine, which is not known: a curve beyond it is made, with a warning. */
export const LATE_FROM_C = 200;
export const MAX_LATE_RISE_C_PER_MIN = 13;

/** The fastest a curve is asked to climb: overall once past MIN_CHECKPOINT_TEMP_C (refused beyond it), and from LATE_FROM_C up (warned beyond it). */
export interface ClimbLimits {
  early: number;
  late: number;
}

/** Two checkpoints closer than this in temperature are one: a point this near a checkpoint is taken to be it. */
const NODE_WITHIN_C = 0.05;
const MIN_APART_C = 1;

/** The rate of rise is compared over windows this long, and counts as picking up again when a window beats the one before by more than this fraction (the stock profiles never pick up at all). */
const RATE_WINDOW_S = 30;
const RATE_PICKS_UP_BY_FRACTION = 0.05;

/** A stretch where the rate of rise picks up again, °C/min, from the window starting at `from` seconds to the next. */
export interface RateRise {
  from: number;
  before: number;
  after: number;
}

/** Where a curve climbs, past LATE_FROM_C, faster than any stock profile does, °C/min and the second it does. */
export interface LateClimb {
  cPerMin: number;
  at: number;
  /** What the stock profiles reach there, or the base curve's own if that was faster. */
  limit: number;
}

export type RetimeResult = { ok: true; curve: CurveNode[]; rises: RateRise[]; late?: LateClimb } | { ok: false; problem: string };

const bezier1 = (a: number, b: number, c: number, d: number, u: number) => {
  const w = 1 - u;
  return w * w * w * a + 3 * w * w * u * b + 3 * w * u * u * c + u * u * u * d;
};

const lerp = (a: Point, b: Point, u: number): Point => ({ t: a.t + (b.t - a.t) * u, v: a.v + (b.v - a.v) * u });

/** The curve with a point where it reaches `temp` and the index of that point: an existing point if one is that near, else the curve split there (de Casteljau), which leaves its shape exactly as it was. */
function splitAtTemp(nodes: CurveNode[], temp: number): { nodes: CurveNode[]; index: number } | undefined {
  for (let k = 0; k + 1 < nodes.length; k++) {
    const a = nodes[k];
    const b = nodes[k + 1];
    if (temp < a.point.v - NODE_WITHIN_C || temp > b.point.v + NODE_WITHIN_C) continue;
    if (Math.abs(temp - a.point.v) <= NODE_WITHIN_C) return { nodes, index: k };
    if (Math.abs(temp - b.point.v) <= NODE_WITHIN_C) return { nodes, index: k + 1 };
    const [p0, p1, p2, p3] = [a.point, a.handleOut, b.handleIn, b.point];
    let [lo, hi] = [0, 1];
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (bezier1(p0.v, p1.v, p2.v, p3.v, mid) < temp) lo = mid;
      else hi = mid;
    }
    const u = (lo + hi) / 2;
    const [q0, q1, q2] = [lerp(p0, p1, u), lerp(p1, p2, u), lerp(p2, p3, u)];
    const [r0, r1] = [lerp(q0, q1, u), lerp(q1, q2, u)];
    const split: CurveNode[] = [
      { ...a, handleOut: q0 },
      { point: lerp(r0, r1, u), handleIn: r0, handleOut: r1 },
      { ...b, handleIn: q2 },
    ];
    return { nodes: [...nodes.slice(0, k), ...split, ...nodes.slice(k + 2)], index: k + 1 };
  }
  return undefined;
}

/** When the curve first reaches `temp` (MIN_CHECKPOINT_TEMP_C by default), to the next whole second: before 100 °C the curve is the machine's heat-up, which stock curves climb at several hundred °C/min. */
function firstSecondAt(nodes: CurveNode[], temp = MIN_CHECKPOINT_TEMP_C): number {
  // From the first point on: before it the curve has no value.
  let t = Math.ceil(nodes[0].point.t);
  while (t < nodes[nodes.length - 1].point.t && evalCurve(nodes, t)! < temp) t++;
  return t;
}

/** The fastest the curve climbs (°C/min, over one second) from where it reaches `from` (MIN_CHECKPOINT_TEMP_C by default) to its last point, and when. */
export function steepestClimb(nodes: CurveNode[], from = MIN_CHECKPOINT_TEMP_C): { cPerMin: number; at: number } {
  let best = { cPerMin: 0, at: 0 };
  for (let t = firstSecondAt(nodes, from); t < nodes[nodes.length - 1].point.t; t++) {
    const rise = (evalCurve(nodes, t + 1)! - evalCurve(nodes, t)!) * 60;
    if (rise > best.cPerMin) best = { cPerMin: rise, at: t };
  }
  return best;
}

/** Where the rate of rise picks up again, from where the curve reaches MIN_CHECKPOINT_TEMP_C to its last point. A steadily falling rate of rise is what the maker's guide calls optimal, and every stock profile in the library has one. */
export function risingRateOfRise(nodes: CurveNode[]): RateRise[] {
  const rises: RateRise[] = [];
  const end = nodes[nodes.length - 1].point.t;
  const rate = (t: number) => ((evalCurve(nodes, t + RATE_WINDOW_S)! - evalCurve(nodes, t)!) * 60) / RATE_WINDOW_S;
  for (let t = firstSecondAt(nodes); t + 2 * RATE_WINDOW_S <= end; t += RATE_WINDOW_S) {
    const [before, after] = [rate(t), rate(t + RATE_WINDOW_S)];
    if (after > before * (1 + RATE_PICKS_UP_BY_FRACTION)) rises.push({ from: t, before, after });
  }
  return rises;
}

/** Why these checkpoints cannot be asked of this curve, in plain words; undefined when they can. */
function checkpointsProblem(base: CurveNode[], marks: Checkpoint[]): string | undefined {
  if (base.length < 2) return `The curve has ${base.length} nodes, so there is nothing to retime.`;
  if (base.some((n, i) => i > 0 && !(n.point.t > base[i - 1].point.t && n.point.v >= base[i - 1].point.v))) return "The curve's points are not in order, rising in time and in temperature, so it cannot be retimed.";
  if (!marks.length) return "Give at least one checkpoint: a temperature and the second the curve reaches it.";
  const top = base[base.length - 1].point.v;
  for (const m of marks) {
    if (!Number.isFinite(m.temp) || !Number.isFinite(m.at)) return "Each checkpoint needs a temperature and a time in seconds, both numbers.";
    if (m.temp < MIN_CHECKPOINT_TEMP_C) return `A checkpoint at ${m.temp} °C is in the machine's heat-up, before ${MIN_CHECKPOINT_TEMP_C} °C; the beans' roast is read from there.`;
    if (m.temp > top + NODE_WITHIN_C) return `A checkpoint at ${m.temp} °C is past the curve's last point (${top.toFixed(1)} °C): above it the curve is one straight line the machine follows, and the level says where the roast stops.`;
    if (!(m.at > base[0].point.t)) return `A checkpoint at ${m.at} s is not after the curve starts (${base[0].point.t} s).`;
  }
  const sorted = [...marks].sort((a, b) => a.temp - b.temp);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].temp - sorted[i - 1].temp < MIN_APART_C) return `Checkpoints at ${sorted[i - 1].temp} and ${sorted[i].temp} °C are less than ${MIN_APART_C} °C apart; give one.`;
    if (!(sorted[i].at > sorted[i - 1].at)) return `The curve cannot reach ${sorted[i].temp} °C at ${sorted[i].at} s, which is not after ${sorted[i - 1].at} s, when it reaches ${sorted[i - 1].temp} °C: a hotter temperature comes later.`;
  }
  return undefined;
}

/**
 * The curve with each checkpoint's temperature reached at its time, and the rest of it kept in shape: the stretch before a checkpoint is
 * stretched or squeezed in time to fit, the stretch after the last one is moved as it is. The curve's corner at a checkpoint (the rate of
 * rise changes there where the stretches on either side were stretched by different amounts) is smoothed by giving both sides the
 * harmonic mean of their rates, which leaves the curve at the checkpoint where it was and rounds the way it leaves it.
 *
 * Refused, in plain words, when a checkpoint is out of range (see MIN_CHECKPOINT_TEMP_C and the curve's last point), when the checkpoints are not in order, when the curve would
 * fall anywhere, or when it would climb faster than the machine has been seen to follow (MAX_RISE_C_PER_MIN, or what the curve already did, if faster).
 * Where the rate of rise picks up again the edit is made and `rises` says where: it is the roaster's choice, with the maker's guide against it.
 */
export function retimeCurve(base: CurveNode[], checkpoints: Checkpoint[]): RetimeResult {
  const early = checkpointsProblem(base, checkpoints);
  if (early) return { ok: false, problem: early };
  const marks = [...checkpoints].sort((a, b) => a.temp - b.temp);
  // The machine's start-up, before MIN_CHECKPOINT_TEMP_C, is left as it is: the stretch begins where the curve reaches it, unless a checkpoint is already that near.
  const holdsStart = base[0].point.v < MIN_CHECKPOINT_TEMP_C - NODE_WITHIN_C && marks[0].temp - MIN_CHECKPOINT_TEMP_C >= MIN_APART_C;
  const stops: { temp: number; at?: number }[] = holdsStart ? [{ temp: MIN_CHECKPOINT_TEMP_C }, ...marks] : marks;
  let nodes = base;
  const placed: number[] = [];
  for (const m of stops) {
    const split = splitAtTemp(nodes, m.temp);
    if (!split) return { ok: false, problem: `The curve never reaches ${m.temp} °C between its points.` };
    nodes = split.nodes;
    // A later checkpoint is hotter, so it splits the curve after the earlier ones and their places in the list stand.
    placed.push(split.index);
  }
  if (placed.some((i) => i === 0)) return { ok: false, problem: "A checkpoint fell on the curve's first point, which cannot be moved." };
  // Anchors of the time map: the first point stays, each checkpoint's point goes to its time, and the start-up's end stays where it was.
  const anchors = [{ index: 0, was: nodes[0].point.t, now: nodes[0].point.t }, ...stops.map((m, j) => ({ index: placed[j], was: nodes[placed[j]].point.t, now: m.at ?? nodes[placed[j]].point.t }))];
  const asked = new Set(placed.filter((_, j) => stops[j].at !== undefined));
  if (holdsStart && !(marks[0].at > anchors[1].was)) {
    return { ok: false, problem: `The curve cannot reach ${marks[0].temp} °C at ${marks[0].at} s: it reaches ${MIN_CHECKPOINT_TEMP_C} °C at ${anchors[1].was.toFixed(0)} s, where the machine's start-up ends and the edit begins, and a hotter temperature comes later.` };
  }
  const last = anchors[anchors.length - 1];
  /** The map for times inside the segment from point k to point k + 1. */
  const within = (k: number) => {
    const p = anchors.findIndex((a) => a.index >= k + 1);
    if (p < 1) return (x: number) => x + (last.now - last.was);
    const [lo, hi] = [anchors[p - 1], anchors[p]];
    const scale = (hi.now - lo.now) / (hi.was - lo.was);
    return (x: number) => lo.now + (x - lo.was) * scale;
  };
  const moved: CurveNode[] = nodes.map((n, k) => {
    if (k === 0) return { ...n, handleOut: { t: within(0)(n.handleOut.t), v: n.handleOut.v } };
    const left = within(k - 1);
    const isLast = k === nodes.length - 1;
    const right = isLast ? left : within(k);
    // Kaffelogic writes the last node's out-handle as 0,0 (nothing follows it): that is not a time to move.
    const noHandleOut = isLast && n.handleOut.t === 0 && n.handleOut.v === 0;
    return { point: { t: left(n.point.t), v: n.point.v }, handleIn: { t: left(n.handleIn.t), v: n.handleIn.v }, handleOut: noHandleOut ? n.handleOut : { t: right(n.handleOut.t), v: n.handleOut.v } };
  });
  const smoothed = moved.map((n, k) => {
    if (!asked.has(k) || k === nodes.length - 1) return n;
    const slopeIn = (n.point.v - n.handleIn.v) / (n.point.t - n.handleIn.t);
    const slopeOut = (n.handleOut.v - n.point.v) / (n.handleOut.t - n.point.t);
    if (!(slopeIn > 0 && slopeOut > 0) || !Number.isFinite(slopeIn + slopeOut)) return n;
    const slope = (2 * slopeIn * slopeOut) / (slopeIn + slopeOut);
    return { ...n, handleIn: { t: n.handleIn.t, v: n.point.v - slope * (n.point.t - n.handleIn.t) }, handleOut: { t: n.handleOut.t, v: n.point.v + slope * (n.handleOut.t - n.point.t) } };
  });
  // The smoothing can bend a segment back on itself when its handles then cross; the unsmoothed curve is the fallback.
  const limits = limitsFor(base);
  let refusal = "";
  for (const curve of [smoothed, moved]) {
    const problem = curveProblem(curve, limits);
    if (!problem) return { ok: true, curve, rises: risingRateOfRise(curve), late: lateClimb(curve, limits) };
    refusal ||= problem;
  }
  return { ok: false, problem: refusal };
}

/** A stretch the edit only slides in time is measured on whole seconds again, from a different phase, so its steepest second moves by about 0.1%: what the base did counts with this much allowed over. */
const BASE_CLIMB_ALLOWANCE = 1.01;

/** The limits for an edit of `base`: the stock ones, or what the base already did where that was faster, so an edit never refuses the part of the curve it leaves alone. */
export function limitsFor(base?: CurveNode[]): ClimbLimits {
  return {
    early: Math.max(MAX_RISE_C_PER_MIN, base ? steepestClimb(base).cPerMin * BASE_CLIMB_ALLOWANCE : 0),
    late: Math.max(MAX_LATE_RISE_C_PER_MIN, base ? steepestClimb(base, LATE_FROM_C).cPerMin * BASE_CLIMB_ALLOWANCE : 0),
  };
}

/** Where the curve climbs past LATE_FROM_C faster than the limit, or undefined. */
export function lateClimb(nodes: CurveNode[], limits: ClimbLimits = limitsFor()): LateClimb | undefined {
  const late = steepestClimb(nodes, LATE_FROM_C);
  return late.cPerMin > limits.late ? { cPerMin: late.cPerMin, at: late.at, limit: limits.late } : undefined;
}

/** Why a curve cannot be roasted, or undefined: it falls somewhere, or climbs faster than the early limit once past MIN_CHECKPOINT_TEMP_C. */
export function curveProblem(nodes: CurveNode[], limits: ClimbLimits = limitsFor()): string | undefined {
  const end = nodes[nodes.length - 1].point.t;
  for (let t = nodes[0].point.t; t < end; t++) {
    const [a, b] = [evalCurve(nodes, t)!, evalCurve(nodes, t + 1)!];
    if (b < a - 1e-6) return `That would make the curve fall (from ${a.toFixed(1)} to ${b.toFixed(1)} °C at ${t} s); a roast curve only rises.`;
  }
  const steepest = steepestClimb(nodes);
  if (steepest.cPerMin > limits.early) {
    return `That would make the curve climb at ${steepest.cPerMin.toFixed(0)} °C/min at ${steepest.at} s; no stock profile climbs faster than ${MAX_RISE_C_PER_MIN} °C/min once it is past ${MIN_CHECKPOINT_TEMP_C} °C, so the machine isn't known to follow it.`;
  }
  return undefined;
}

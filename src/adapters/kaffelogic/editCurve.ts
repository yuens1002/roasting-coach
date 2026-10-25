// Reshaping a profile's curve while holding its thermal dose (docs/ROADMAP.md, Next 3, "First edit family").
//
// The level never changes a curve: it only picks the end temperature where the roast stops (`roast_levels`). On the one stock
// curve read so far (docs/research.md, "What the curve nodes do") the request after the last interior node is one straight
// climb, so the one edit built here is its slope. Raising it shortens the climb and ends hotter; lowering it lengthens the climb
// and ends cooler. The slope is found so that the curve's own predicted thermal dose, ended at the chosen level's temperature,
// equals a target. The prediction is the curve's, not a roast's: real roasts have run above it (docs/research.md, validation 3).
import type { CurveNode, KaffelogicProfile } from "./parse.js";
import { curveThermalDoseTo } from "./thermalDose.js";
import type { ProfileLines } from "./writeProfile.js";

/** The slopes (°C/min) an edit may ask for: below the first the climb stalls, above the second the machine is asked for more than it has been seen to follow. */
export const SLOPE_RANGE_C_PER_MIN = [2, 12] as const;

/** How far apart (as a fraction of the segment's own slope) the handles' slopes may be from its chord for the segment to count as straight. */
const STRAIGHT_WITHIN = 0.1;

/** Kaffelogic writes six significant figures ("20.0000", "110.000"). */
const figure = (x: number) => {
  const s = x.toPrecision(6);
  return s.includes("e") ? x.toFixed(6) : s;
};

/** A curve as its `roast_profile` / `fan_profile` header value: six numbers a node, point then in-handle then out-handle. */
export const formatCurve = (nodes: CurveNode[]): string =>
  nodes.flatMap((n) => [n.point.t, n.point.v, n.handleIn.t, n.handleIn.v, n.handleOut.t, n.handleOut.v]).map(figure).join(",");

/** The slope (°C/min) of the straight line from the second-to-last node to the last. */
export function lastSegmentSlope(nodes: CurveNode[]): number {
  const prev = nodes[nodes.length - 2];
  const last = nodes[nodes.length - 1];
  return ((last.point.v - prev.point.v) / (last.point.t - prev.point.t)) * 60;
}

/** Whether the last segment is one straight climb: its two handles and its chord all slope the same, to within STRAIGHT_WITHIN. */
export function lastSegmentIsStraight(nodes: CurveNode[]): boolean {
  if (nodes.length < 2) return false;
  const prev = nodes[nodes.length - 2];
  const last = nodes[nodes.length - 1];
  const chord = lastSegmentSlope(nodes);
  const slopeOf = (from: { t: number; v: number }, to: { t: number; v: number }) => ((to.v - from.v) / (to.t - from.t)) * 60;
  const handles = [slopeOf(prev.point, prev.handleOut), slopeOf(last.handleIn, last.point)];
  return chord > 0 && handles.every((s) => Number.isFinite(s) && Math.abs(s - chord) <= STRAIGHT_WITHIN * chord);
}

/**
 * The curve with its last segment (from the second-to-last node to the last) made a straight climb at `slopeCPerMin`. The last node
 * keeps its time, and every node before the second-to-last, and the curve up to it, is untouched. The second-to-last node keeps its
 * incoming handle, so where the new slope differs from the old one the curve has a corner there.
 */
export function setLastSegmentSlope(nodes: CurveNode[], slopeCPerMin: number): CurveNode[] {
  if (nodes.length < 3) throw new Error("a curve needs at least three nodes to have a last segment that is not the whole curve");
  if (!(slopeCPerMin > 0)) throw new Error(`the slope must be above 0 °C/min; got ${slopeCPerMin}`);
  const prev = nodes[nodes.length - 2];
  const last = nodes[nodes.length - 1];
  const dt = last.point.t - prev.point.t;
  if (!(dt > 0)) throw new Error("the last two nodes must be in time order");
  const perSecond = slopeCPerMin / 60;
  const endTemp = prev.point.v + perSecond * dt;
  return [
    ...nodes.slice(0, -2),
    { ...prev, handleOut: { t: prev.point.t + dt / 3, v: prev.point.v + (perSecond * dt) / 3 } },
    { point: { t: last.point.t, v: endTemp }, handleIn: { t: last.point.t - dt / 3, v: endTemp - (perSecond * dt) / 3 }, handleOut: last.handleOut },
  ];
}

/** The profile's lines with the roast curve replaced and everything else, in order, as it was. */
export function withRoastCurve(lines: ProfileLines, nodes: CurveNode[]): ProfileLines {
  if (!lines.some(([k]) => k === "roast_profile")) throw new Error("not a Kaffelogic profile: no roast_profile line");
  return lines.map(([k, v]) => (k === "roast_profile" ? [k, formatCurve(nodes)] : [k, v]));
}

/** What an edit did, in measured terms (the curve's predictions; no roast has been made on it). */
export interface HeldDoseEdit {
  curve: CurveNode[];
  /** Where the edited climb starts: the second-to-last node's time and temperature. */
  climbFrom: { t: number; temp: number };
  /** The slope of the last segment before the edit, and after it, °C/min. */
  slopeBefore: number;
  slopeAfter: number;
  endTemp: number;
  /** When the edited curve reaches the end temperature, seconds. */
  endsAtAfter: number;
  /** The edited curve's predicted thermal dose at the end temperature: the target, to within the search. */
  thermalDose: number;
}

/** An edit, or in plain words why there is none. */
export type HeldDoseResult = ({ ok: true } & HeldDoseEdit) | { ok: false; problem: string };

/**
 * The slope for which the curve, ended at `endTemp`, has the predicted thermal dose `targetDose`. Thermal dose falls as the slope
 * rises (a steeper climb reaches the end sooner), so the search halves the range. There is no edit when the last segment is not one
 * straight climb on a curve of at least three nodes, when `endTemp` falls before the climb starts (the slope would change nothing),
 * or when no slope in SLOPE_RANGE_C_PER_MIN gives the target.
 */
export function holdThermalDose(profile: KaffelogicProfile, endTemp: number, targetDose: number): HeldDoseResult {
  const nodes = profile.roastCurve;
  if (nodes.length < 3) return { ok: false, problem: `The curve has ${nodes.length} nodes, so it has no last segment to reshape without rewriting the whole curve.` };
  if (!lastSegmentIsStraight(nodes)) return { ok: false, problem: "The last segment of the curve is not one straight climb (its handles and its ends disagree on the slope), so there is no single slope to change." };
  const prev = nodes[nodes.length - 2];
  if (!(endTemp > prev.point.v)) return { ok: false, problem: `The end temperature ${endTemp.toFixed(1)} °C falls before the edited climb starts (at ${prev.point.v.toFixed(1)} °C), so the slope would change nothing.` };
  // A curve that never gets to the end temperature has taken all the time there is: more thermal dose than any target.
  const doseAt = (slope: number) => curveThermalDoseTo(setLastSegmentSlope(nodes, slope), endTemp, true)?.thermalDose ?? Number.POSITIVE_INFINITY;
  let lo: number = SLOPE_RANGE_C_PER_MIN[0];
  let hi: number = SLOPE_RANGE_C_PER_MIN[1];
  if (!(doseAt(hi) <= targetDose && targetDose <= doseAt(lo))) {
    return { ok: false, problem: `No climb between ${lo} and ${hi} °C/min gives that thermal dose ending at ${endTemp.toFixed(1)} °C.` };
  }
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (doseAt(mid) > targetDose) lo = mid;
    else hi = mid;
  }
  const slopeAfter = (lo + hi) / 2;
  const curve = setLastSegmentSlope(nodes, slopeAfter);
  const edited = curveThermalDoseTo(curve, endTemp, true)!;
  return {
    ok: true,
    curve,
    climbFrom: { t: prev.point.t, temp: prev.point.v },
    slopeBefore: lastSegmentSlope(nodes),
    slopeAfter,
    endTemp,
    endsAtAfter: edited.endsAt,
    thermalDose: edited.thermalDose,
  };
}

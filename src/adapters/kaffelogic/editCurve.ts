// Reshaping a profile's curve while holding its thermal dose (docs/ROADMAP.md, Next 3, "First edit family").
//
// The level never changes a curve: it only picks the end temperature where the roast stops (`roast_levels`). On the
// stock profiles read so far (docs/research.md, "What the curve nodes do") the request after the last interior node is one
// straight climb, so the one edit built here is its slope. Raising it shortens the climb and ends hotter; lowering it
// lengthens the climb and ends cooler. The slope is found so that the curve's own predicted thermal dose, ended at the
// chosen level's temperature, equals a target. The prediction is the curve's, not a roast's: real roasts ran 5 to 18% above it.
import type { CurveNode, KaffelogicProfile } from "./parse.js";
import { curveThermalDoseTo } from "./thermalDose.js";
import type { ProfileLines } from "./writeProfile.js";

/** The slopes (°C/min) an edit may ask for: below the first the climb stalls, above the second the machine is asked for more than it has been seen to follow. */
export const SLOPE_RANGE_C_PER_MIN = [2, 12] as const;

/** Kaffelogic writes six significant figures ("20.0000", "110.000"). */
const figure = (x: number) => {
  const s = x.toPrecision(6);
  return s.includes("e") ? x.toFixed(6) : s;
};

/** A curve as its `roast_profile` / `fan_profile` header value: six numbers a node, point then in-handle then out-handle. */
export const formatCurve = (nodes: CurveNode[]): string =>
  nodes.flatMap((n) => [n.point.t, n.point.v, n.handleIn.t, n.handleIn.v, n.handleOut.t, n.handleOut.v]).map(figure).join(",");

/** The slope (°C/min) the curve asks for past its last node, which is how `evalCurve` continues it. */
export function finalSlope(nodes: CurveNode[]): number {
  const last = nodes[nodes.length - 1];
  return ((last.point.v - last.handleIn.v) / (last.point.t - last.handleIn.t)) * 60;
}

/**
 * The curve with its last segment (from the second-to-last node to the last) made a straight climb at `slopeCPerMin`. The last node
 * keeps its time, so the nodes before the second-to-last, and the curve up to it, are untouched.
 */
export function setLastSegmentSlope(nodes: CurveNode[], slopeCPerMin: number): CurveNode[] {
  if (nodes.length < 2) throw new Error("a curve needs at least two nodes to have a last segment");
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
  slopeBefore: number;
  slopeAfter: number;
  endTemp: number;
  /** When each curve reaches the end temperature, seconds. */
  endsAtBefore: number | undefined;
  endsAtAfter: number;
  /** The target, and the edited curve's predicted thermal dose at the end temperature (equal to within the search). */
  targetDose: number;
  thermalDose: number;
}

/**
 * The slope for which the curve, ended at `endTemp`, has the predicted thermal dose `targetDose`; undefined when no slope in
 * SLOPE_RANGE_C_PER_MIN gives it, or when `endTemp` falls before the edited climb starts (then the slope changes nothing). Thermal dose
 * falls as the slope rises (a steeper climb reaches the end sooner), so the search halves the range.
 */
export function holdThermalDose(profile: KaffelogicProfile, endTemp: number, targetDose: number): HeldDoseEdit | undefined {
  const nodes = profile.roastCurve;
  if (nodes.length < 2) return undefined;
  const prev = nodes[nodes.length - 2];
  if (!(endTemp > prev.point.v)) return undefined;
  // A curve that never gets to the end temperature has taken all the time there is: more thermal dose than any target.
  const doseAt = (slope: number) => curveThermalDoseTo(setLastSegmentSlope(nodes, slope), endTemp, true)?.thermalDose ?? Number.POSITIVE_INFINITY;
  let [lo, hi] = SLOPE_RANGE_C_PER_MIN as unknown as [number, number];
  if (!(doseAt(hi) <= targetDose && targetDose <= doseAt(lo))) return undefined;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (doseAt(mid) > targetDose) lo = mid;
    else hi = mid;
  }
  const slopeAfter = (lo + hi) / 2;
  const curve = setLastSegmentSlope(nodes, slopeAfter);
  const edited = curveThermalDoseTo(curve, endTemp, true)!;
  return {
    curve,
    climbFrom: { t: prev.point.t, temp: prev.point.v },
    slopeBefore: finalSlope(nodes),
    slopeAfter,
    endTemp,
    endsAtBefore: curveThermalDoseTo(nodes, endTemp, true)?.endsAt,
    endsAtAfter: edited.endsAt,
    targetDose,
    thermalDose: edited.thermalDose,
  };
}

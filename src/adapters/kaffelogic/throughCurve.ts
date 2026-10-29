// A whole curve drawn through points: "120 s at 158.5 °C, 180 s at 178 °C, ..." (docs/ROADMAP.md, Next 3, curve edits).
//
// retimeCurve.ts moves when a curve reaches temperatures and keeps its shape; this replaces the shape: the curve is the smooth rising line
// through the points given, one Bezier segment between each pair. The tangent at each point is the weighted harmonic mean of the slopes
// either side (Fritsch and Carlson's monotone cubic, the one PCHIP uses), which cannot overshoot: between two points the curve never
// goes above the higher or below the lower, so a rising list of points gives a curve that only rises. The first and last points take the
// slope of their one neighbour; the last is also what the machine follows past the curve's end (evalCurve), so the roast carries on at
// the rate the last two points set.
import { type CurveNode, type Point } from "./parse.js";
import { type RetimeResult, curveProblem, lateClimb, limitsFor, risingRateOfRise } from "./retimeCurve.js";

/** A curve needs at least this many points: two give a straight line, which is not a roast. */
export const MIN_POINTS = 4;

/** Why these points cannot be a roast curve, in plain words; undefined when they can. */
function pointsProblem(points: Point[]): string | undefined {
  if (points.length < MIN_POINTS) return `Give at least ${MIN_POINTS} points to draw a curve through; got ${points.length}.`;
  if (points.some((p) => !Number.isFinite(p.t) || !Number.isFinite(p.v))) return "Each point needs a time in seconds and a temperature, both numbers.";
  if (points[0].t < 0) return `The first point is at ${points[0].t} s, before the roast starts.`;
  for (let i = 1; i < points.length; i++) {
    if (!(points[i].t > points[i - 1].t)) return `The point at ${points[i].t} s is not after the one before it, at ${points[i - 1].t} s: points go in time order.`;
    if (!(points[i].v > points[i - 1].v)) return `The point at ${points[i].t} s is ${points[i].v} °C, not above ${points[i - 1].v} °C at ${points[i - 1].t} s: a roast curve rises at every point.`;
  }
  return undefined;
}

/** The tangent (°C/s) at each point of a monotone cubic through them. */
function tangents(points: Point[]): number[] {
  const h = points.slice(1).map((p, i) => p.t - points[i].t);
  const d = points.slice(1).map((p, i) => (p.v - points[i].v) / h[i]);
  const m = points.map((_, k) => {
    if (k === 0) return d[0];
    if (k === points.length - 1) return d[d.length - 1];
    // Weighted harmonic mean of the neighbouring slopes, which are both positive on a rising list.
    const [w1, w2] = [2 * h[k] + h[k - 1], h[k] + 2 * h[k - 1]];
    return (w1 + w2) / (w1 / d[k - 1] + w2 / d[k]);
  });
  return m;
}

/**
 * The curve through `points`, a node at each, or in plain words why there is none: fewer than MIN_POINTS, not in time order, not rising,
 * falling anywhere, or climbing faster than the machine has been seen to follow once past 100 °C (the early limit of retimeCurve.ts).
 * Where the rate of rise picks up again, or the curve climbs past 200 °C faster than any stock profile, the curve is made and `rises` and
 * `late` say where, as retimeCurve does.
 */
export function curveThroughPoints(points: Point[]): RetimeResult {
  const problem = pointsProblem(points);
  if (problem) return { ok: false, problem };
  const m = tangents(points);
  const curve: CurveNode[] = points.map((p, k) => {
    const before = k > 0 ? (p.t - points[k - 1].t) / 3 : 0;
    const after = k + 1 < points.length ? (points[k + 1].t - p.t) / 3 : 0;
    return {
      point: { t: p.t, v: p.v },
      // The first point's in-handle and the last point's out-handle point nowhere, as in Kaffelogic's own files.
      handleIn: k > 0 ? { t: p.t - before, v: p.v - m[k] * before } : { t: 0, v: 0 },
      handleOut: k + 1 < points.length ? { t: p.t + after, v: p.v + m[k] * after } : { t: 0, v: 0 },
    };
  });
  const limits = limitsFor();
  const refusal = curveProblem(curve, limits);
  return refusal ? { ok: false, problem: refusal } : { ok: true, curve, rises: risingRateOfRise(curve), late: lateClimb(curve, limits) };
}

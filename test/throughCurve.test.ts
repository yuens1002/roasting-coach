import { describe, expect, it } from "vitest";
import { formatCurve } from "../src/adapters/kaffelogic/editCurve.js";
import { type CurveNode, evalCurve, parseCurve, parseKpro, timeCurveReaches } from "../src/adapters/kaffelogic/parse.js";
import { steepestClimb } from "../src/adapters/kaffelogic/retimeCurve.js";
import { MIN_POINTS, curveThroughPoints } from "../src/adapters/kaffelogic/throughCurve.js";
import { PRIVATE_PROFILES } from "./privateFiles.js";

// A made-up roast: a start-up to 110 °C, a drying climb, a long Maillard stretch and a short finish, with the rate of rise falling throughout.
const ROAST: [number, number][] = [[0, 20], [60, 110], [120, 160], [180, 186], [260, 204], [340, 214], [420, 222], [500, 229]];
const pts = (list: [number, number][]) => list.map(([t, v]) => ({ t, v }));

/** The curve, or a failed test saying why there is none. */
function drawn(list = ROAST) {
  const result = curveThroughPoints(pts(list));
  if (!result.ok) throw new Error(`expected a curve, got: ${result.problem}`);
  return result;
}

const slopes = (n: CurveNode) => ({ into: (n.point.v - n.handleIn.v) / (n.point.t - n.handleIn.t), out: (n.handleOut.v - n.point.v) / (n.handleOut.t - n.point.t) });

describe("a curve drawn through points", () => {
  it("passes through every point it was given, with a node at each", () => {
    const { curve } = drawn();
    expect(curve).toHaveLength(ROAST.length);
    for (const [t, v] of ROAST) expect(evalCurve(curve, t)).toBeCloseTo(v, 6);
  });

  it("only rises, and stays between each pair of points (no overshoot where the rate of rise changes sharply)", () => {
    // 6 °C/min, then 60, then 6 again: a plain average of the slopes would overshoot at the corners.
    const sharp: [number, number][] = [[0, 20], [60, 100], [120, 106], [180, 166], [240, 172]];
    for (const list of [ROAST, sharp]) {
      const { curve } = drawn(list);
      for (let t = list[0][0]; t < list[list.length - 1][0]; t += 1) {
        const [a, b] = [evalCurve(curve, t)!, evalCurve(curve, t + 1)!];
        expect(b).toBeGreaterThanOrEqual(a - 1e-9);
      }
      for (let k = 0; k + 1 < list.length; k++) {
        for (let t = list[k][0]; t <= list[k + 1][0]; t += 2) {
          const v = evalCurve(curve, t)!;
          expect(v).toBeGreaterThanOrEqual(list[k][1] - 1e-6);
          expect(v).toBeLessThanOrEqual(list[k + 1][1] + 1e-6);
        }
      }
    }
  });

  it("leaves each point at the rate it arrives at it, and a handle never crosses into the next segment", () => {
    const { curve } = drawn();
    for (let k = 1; k + 1 < curve.length; k++) {
      const { into, out } = slopes(curve[k]);
      expect(into).toBeCloseTo(out, 9);
      expect(curve[k].handleIn.t).toBeGreaterThan(curve[k - 1].point.t);
      expect(curve[k].handleOut.t).toBeLessThan(curve[k + 1].point.t);
    }
  });

  it("goes on past its last point at the rate the last two points set", () => {
    const { curve } = drawn();
    const [a, b] = [ROAST[ROAST.length - 2], ROAST[ROAST.length - 1]];
    const chord = (b[1] - a[1]) / (b[0] - a[0]);
    expect(evalCurve(curve, b[0] + 60)).toBeCloseTo(b[1] + chord * 60, 6);
  });

  it("writes a curve that reads back, through the file's six figures, as the same curve", () => {
    const { curve } = drawn();
    const back = parseCurve(formatCurve(curve));
    for (let t = 0; t <= 500; t += 13) expect(evalCurve(back, t)).toBeCloseTo(evalCurve(curve, t)!, 2);
  });

  it("says where the rate of rise picks up again, and that it climbs faster late than any stock profile does, and neither for a gentle curve", () => {
    expect(drawn().rises).toEqual([]);
    expect(drawn().late).toBeUndefined();
    // A stall (6 °C/min), then a spike (20 °C/min) past 200 °C.
    const flick: [number, number][] = [[0, 20], [60, 110], [120, 160], [180, 190], [260, 197], [320, 200], [380, 220], [440, 240]];
    const { rises, late } = drawn(flick);
    expect(rises.length).toBeGreaterThan(0);
    expect(late?.cPerMin).toBeGreaterThan(13);
    expect(late?.limit).toBe(13);
  });
});

describe("points that are refused", () => {
  const refused = (list: [number, number][]) => {
    const result = curveThroughPoints(pts(list));
    if (result.ok) throw new Error("expected a refusal");
    return result.problem;
  };

  it("needs enough points, with numbers for the second and the temperature", () => {
    expect(refused(ROAST.slice(0, MIN_POINTS - 1))).toContain(`at least ${MIN_POINTS} points`);
    expect(refused([...ROAST.slice(0, 3), [Number.NaN, 200]] as [number, number][])).toContain("both numbers");
    expect(refused([[-5, 20], ...ROAST.slice(1)] as [number, number][])).toContain("before the roast starts");
  });

  it("wants the points in time order and rising at every point", () => {
    expect(refused([[0, 20], [60, 110], [50, 120], [200, 190]])).toContain("points go in time order");
    expect(refused([[0, 20], [60, 110], [60, 120], [200, 190]])).toContain("points go in time order");
    expect(refused([[0, 20], [60, 110], [120, 110], [200, 190]])).toContain("a roast curve rises at every point");
    expect(refused([[0, 20], [60, 110], [120, 100], [200, 190]])).toContain("a roast curve rises at every point");
  });

  it("will not ask the machine for a climb faster than any stock profile makes once past 100 °C", () => {
    expect(refused([[0, 20], [60, 100], [65, 160], [200, 190]])).toContain("no stock profile climbs faster than 116 °C/min");
  });
});

// A real stock curve, sampled and drawn again through its samples, comes back as itself: the drawing is as good a model of a curve as the stock files'.
describe.skipIf(PRIVATE_PROFILES.length === 0)("on the real profiles in the library", () => {
  it("draws a stock curve, read at every 20 s, to within 3 °C of it, and never refuses it", () => {
    let tried = 0;
    for (const { text } of PRIVATE_PROFILES) {
      const real = parseKpro(text).roastCurve;
      if (real.length < 3) continue;
      const [from, to] = [Math.ceil(real[0].point.t), real[real.length - 1].point.t];
      const list: [number, number][] = [];
      for (let t = from; t < to; t += 20) list.push([t, evalCurve(real, t)!]);
      list.push([to, evalCurve(real, to)!]);
      const result = curveThroughPoints(pts(list));
      expect(result.ok, `${real.length} nodes`).toBe(true);
      if (!result.ok) continue;
      tried++;
      // The first minute is the machine's heat-up, climbing at several hundred °C/min: 20 s samples cannot follow it, and it is not the roast.
      const roastFrom = timeCurveReaches(real, 100)!;
      for (let t = roastFrom; t <= to; t += 5) expect(Math.abs(evalCurve(result.curve, t)! - evalCurve(real, t)!)).toBeLessThan(3);
      expect(steepestClimb(result.curve).cPerMin).toBeLessThan(steepestClimb(real).cPerMin * 1.2 + 1);
    }
    expect(tried).toBeGreaterThan(0);
  });
});

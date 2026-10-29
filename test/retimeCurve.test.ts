import { describe, expect, it } from "vitest";
import { formatCurve } from "../src/adapters/kaffelogic/editCurve.js";
import { type CurveNode, evalCurve, parseCurve, parseKpro, timeCurveReaches } from "../src/adapters/kaffelogic/parse.js";
import { LATE_FROM_C, MAX_LATE_RISE_C_PER_MIN, MAX_RISE_C_PER_MIN, MIN_CHECKPOINT_TEMP_C, curveProblem, lateClimb, retimeCurve, risingRateOfRise, steepestClimb } from "../src/adapters/kaffelogic/retimeCurve.js";
import { PRIVATE_PROFILES } from "./privateFiles.js";
import { CLIMB_CURVE, profileWithCurve } from "./syntheticLog.js";

// The made-up curve: points (0 s, 20 °C), (120 s, 160 °C), (300 s, 199 °C), (600 s, 229 °C); it reaches 150 °C at 111 s and 180 °C at 208 s.
const base = parseKpro(profileWithCurve(CLIMB_CURVE)).roastCurve;

/** The retimed curve, or a failed test saying why there is none. */
function retimed(marks: { temp: number; at: number }[], from = base) {
  const result = retimeCurve(from, marks);
  if (!result.ok) throw new Error(`expected a curve, got: ${result.problem}`);
  return result;
}

/** The slope (°C/s) the curve leaves a point with, and arrives at it with, read off its handles. */
const slopes = (n: CurveNode) => ({ into: (n.point.v - n.handleIn.v) / (n.point.t - n.handleIn.t), out: (n.handleOut.v - n.point.v) / (n.handleOut.t - n.point.t) });

describe("retiming a curve from checkpoints", () => {
  it("leaves the curve as it was when a checkpoint is where the curve already is, and adds only points", () => {
    const at = timeCurveReaches(base, 150, 0.01)!;
    const { curve } = retimed([{ temp: 150, at }]);
    // One point where the edit begins (100 °C) and one at the checkpoint.
    expect(curve).toHaveLength(base.length + 2);
    for (let t = 0; t <= 600; t += 7) expect(evalCurve(curve, t)).toBeCloseTo(evalCurve(base, t)!, 1);
  });

  it("reaches each temperature at the second asked for, and never changes a temperature", () => {
    const { curve } = retimed([{ temp: 150, at: 160 }, { temp: 180, at: 250 }]);
    expect(evalCurve(curve, 160)).toBeCloseTo(150, 2);
    expect(evalCurve(curve, 250)).toBeCloseTo(180, 2);
    expect(timeCurveReaches(curve, 150, 0.1)).toBeCloseTo(160, 0);
    expect(timeCurveReaches(curve, 180, 0.1)).toBeCloseTo(250, 0);
    // The points the curve already had keep their temperatures; the two new ones are the checkpoints'.
    expect(curve.map((n) => n.point.v).filter((v) => ![100, 150, 180].some((c) => Math.abs(v - c) < 0.01))).toEqual(base.map((n) => n.point.v));
    expect(curve.map((n) => n.point.t)).toEqual([...curve.map((n) => n.point.t)].sort((a, b) => a - b));
  });

  it("takes the checkpoints in any order", () => {
    const marks = [{ temp: 150, at: 160 }, { temp: 180, at: 250 }];
    expect(retimed([...marks].reverse()).curve).toEqual(retimed(marks).curve);
  });

  it("keeps the curve before its first point and moves everything after the last checkpoint as it was", () => {
    const { curve } = retimed([{ temp: 150, at: timeCurveReaches(base, 150, 0.001)! + 40 }]);
    expect(evalCurve(curve, 0)).toBeCloseTo(20, 9);
    // From the next point on (the base's 120 s) the curve is the same curve 40 s later, and goes on past its end in the same line.
    for (let t = 120; t <= 600; t += 20) expect(evalCurve(curve, t + 40)).toBeCloseTo(evalCurve(base, t)!, 2);
    expect(evalCurve(curve, 700 + 40)).toBeCloseTo(evalCurve(base, 700)!, 2);
  });

  it("rounds the corner at a checkpoint: the curve arrives at it and leaves it at one rate, between the two it was stretched to", () => {
    const { curve } = retimed([{ temp: 150, at: 160 }]);
    const node = curve.find((n) => Math.abs(n.point.v - 150) < 0.01)!;
    const { into, out } = slopes(node);
    expect(into).toBeCloseTo(out, 9);
    expect(into).toBeGreaterThan(0);
  });

  it("adds a point where the edit begins and one a checkpoint, and moves the point itself when a checkpoint is on an existing one", () => {
    expect(retimed([{ temp: 150, at: 160 }, { temp: 180, at: 250 }]).curve).toHaveLength(base.length + 3);
    const onPoint = retimed([{ temp: 160, at: 150 }]).curve;
    expect(onPoint).toHaveLength(base.length + 1);
    expect(onPoint.find((n) => n.point.v === 160)!.point).toEqual({ t: 150, v: 160 });
    // A checkpoint at 100 °C is where the edit begins: no second point there.
    expect(retimed([{ temp: 100, at: 90 }]).curve).toHaveLength(base.length + 1);
  });

  it("writes a curve that reads back, through the file's six figures, as the same curve", () => {
    const { curve } = retimed([{ temp: 150, at: 160 }, { temp: 180, at: 250 }]);
    const back = parseCurve(formatCurve(curve));
    for (let t = 0; t <= 600; t += 11) expect(evalCurve(back, t)).toBeCloseTo(evalCurve(curve, t)!, 2);
  });

  it("says where the rate of rise picks up again, and nowhere on a curve that falls steadily", () => {
    expect(retimed([{ temp: 150, at: 130 }]).rises).toEqual([]);
    expect(risingRateOfRise(base)).toEqual([]);
    const { rises } = retimed([{ temp: 150, at: 160 }]);
    expect(rises).toHaveLength(1);
    expect(rises[0].after).toBeGreaterThan(rises[0].before + 1);
    // The window the rate picks up in starts at 101 s, a second after the curve reaches 100 °C, and is the 30 s before the rate is read again.
    expect(rises[0].from).toBe(101);
    // Two straight climbs, the second twice as fast: 6 °C/min to 150 s, then 12 (every handle on the line between its points).
    const stepUp = parseCurve("0,100,0,0,50,105,150,115,100,110,250,135,450,175,350,155,500,185,600,205,550,195,0,0");
    const [step] = risingRateOfRise(stepUp);
    expect(risingRateOfRise(stepUp)).toHaveLength(1);
    expect(step.from).toBe(120);
    expect(step.before).toBeCloseTo(6, 1);
    expect(step.after).toBeCloseTo(12, 1);
  });

  it("leaves the last point's empty out-handle (0,0, which Kaffelogic writes) as it is, and moves a real one with the rest of the tail", () => {
    const stepUp = parseCurve("0,100,0,0,50,105,150,115,100,110,250,135,450,175,350,155,500,185,600,205,550,195,0,0");
    expect(retimed([{ temp: 150, at: 250 }], stepUp).curve.at(-1)!.handleOut).toEqual({ t: 0, v: 0 });
    const real = base.map((n, k) => (k === base.length - 1 ? { ...n, handleOut: { t: n.point.t + 30, v: n.point.v + 3 } } : n));
    const out = retimed([{ temp: 150, at: 160 }], real).curve.at(-1)!;
    expect(out.handleOut.t - out.point.t).toBeCloseTo(30, 6);
  });

  it("does not warn about a late climb the base already made, which the edit only slid in time", () => {
    // A gently bowed climb of 40 °C/min or so past 200 °C, three times the stock 13, in a stretch after the one the checkpoint's corner is smoothed into. Sliding it by a part of a second moves the whole second it is steepest over, and so the rate measured, by a fraction of a percent.
    const sCurve = parseCurve("0,100,0,0,66.667,116.667,200,150,133.333,133.333,240,161.667,320,185,280,173.333,342,198,380,225,358,212,400,230,440,240,420,235,0,0");
    expect(steepestClimb(sCurve, LATE_FROM_C).cPerMin).toBeGreaterThan(3 * MAX_LATE_RISE_C_PER_MIN);
    for (const at of [149.5, 149.75, 150.1, 150.25, 150.5]) {
      const result = retimed([{ temp: 150, at }], sCurve);
      expect(result.late, `150 °C at ${at} s`).toBeUndefined();
    }
  });

  it("says where it climbs past 200 °C faster than any stock profile does, and makes the curve all the same", () => {
    // A straight climb of 10 °C/min from 100 to 220 °C: reaching 205 °C in 400 s instead of 630 squeezes it to 16 °C/min.
    const gentle = parseCurve("0,100,0,100,120,120,360,160,240,140,480,180,720,220,600,200,720,220");
    const squeezed = retimed([{ temp: 205, at: 400 }], gentle);
    expect(squeezed.late?.cPerMin).toBeGreaterThan(MAX_LATE_RISE_C_PER_MIN);
    expect(squeezed.late?.limit).toBe(MAX_LATE_RISE_C_PER_MIN);
    expect(evalCurve(squeezed.curve, 400)).toBeCloseTo(205, 2);
    expect(retimed([{ temp: 205, at: 600 }], gentle).late).toBeUndefined();
    expect(retimed([{ temp: 150, at: 160 }]).late).toBeUndefined();
  });

  it("measures the steepest climb after the curve passes 100 °C, in °C/min", () => {
    const straight = parseCurve("0,100,0,100,100,120,300,160,200,140,300,160");
    expect(steepestClimb(straight).cPerMin).toBeCloseTo(12, 3);
    expect(steepestClimb(base).cPerMin).toBeGreaterThan(70);
  });
});

describe("a retime that is refused", () => {
  const refused = (marks: { temp: number; at: number }[], from = base) => {
    const result = retimeCurve(from, marks);
    if (result.ok) throw new Error("expected a refusal");
    return result.problem;
  };

  it("needs a checkpoint, with a temperature and a time that are numbers", () => {
    expect(refused([])).toContain("at least one checkpoint");
    expect(refused([{ temp: Number.NaN, at: 100 }])).toContain("both numbers");
    expect(refused([{ temp: 150, at: Number.POSITIVE_INFINITY }])).toContain("both numbers");
  });

  it("keeps to the part of the curve that is the beans' roast: from 100 °C to its last point", () => {
    expect(refused([{ temp: MIN_CHECKPOINT_TEMP_C - 1, at: 40 }])).toContain("heat-up");
    expect(retimeCurve(base, [{ temp: MIN_CHECKPOINT_TEMP_C, at: 60 }]).ok).toBe(true);
    expect(refused([{ temp: 230, at: 500 }])).toContain("past the curve's last point (229.0 °C)");
    expect(retimeCurve(base, [{ temp: 229, at: 650 }]).ok).toBe(true);
  });

  it("puts a hotter temperature later, at least 1 °C apart, and after the curve starts", () => {
    expect(refused([{ temp: 150, at: 200 }, { temp: 180, at: 190 }])).toContain("a hotter temperature comes later");
    expect(refused([{ temp: 150, at: 200 }, { temp: 150.5, at: 210 }])).toContain("less than 1 °C apart");
    expect(refused([{ temp: 150, at: 0 }])).toContain("not after the curve starts");
  });

  it("will not ask the machine for a climb faster than any stock profile makes", () => {
    // The curve is at 100 °C at 70 s; 150 °C five seconds later is over 500 °C/min.
    expect(refused([{ temp: 150, at: 75 }])).toContain(`no stock profile climbs faster than ${MAX_RISE_C_PER_MIN} °C/min`);
  });

  it("leaves the machine's start-up as it is: nothing hotter than 100 °C is reached before the curve is at 100 °C", () => {
    expect(refused([{ temp: 150, at: 30 }])).toContain("it reaches 100 °C at 70 s, where the machine's start-up ends");
    // And a retime further on leaves the curve up to 100 °C exactly as it was, with 100 °C reached when it was.
    const { curve } = retimed([{ temp: 150, at: 160 }]);
    const startsAt = timeCurveReaches(base, MIN_CHECKPOINT_TEMP_C, 0.01)!;
    for (let t = 0; t <= startsAt; t += 5) expect(evalCurve(curve, t)).toBeCloseTo(evalCurve(base, t)!, 6);
    expect(timeCurveReaches(curve, MIN_CHECKPOINT_TEMP_C, 0.01)).toBeCloseTo(startsAt, 1);
  });

  it("will not move the curve's first point, which a checkpoint on it would have to", () => {
    const gentle = parseCurve("0,100,0,100,120,120,360,160,240,140,480,180,720,220,600,200,720,220");
    expect(refused([{ temp: 100, at: 10 }], gentle)).toContain("fell on the curve's first point");
  });

  it("will not hand back a curve that falls", () => {
    const falling = parseCurve("0,20,0,0,60,80,120,160,90,130,160,168,300,150,240,189,360,205,600,229,500,219,0,0");
    expect(curveProblem(falling, { early: 1000, late: 1000 })).toContain("make the curve fall");
    expect(curveProblem(base, { early: 1000, late: 1000 })).toBeUndefined();
    expect(curveProblem(base, { early: 10, late: 1000 })).toContain("climb at");
    // The late limit is a warning, not a refusal.
    expect(curveProblem(base, { early: 1000, late: 1 })).toBeUndefined();
    expect(lateClimb(base, { early: 1000, late: 1 })).toMatchObject({ limit: 1 });
    expect(lateClimb(base, { early: 1000, late: 1000 })).toBeUndefined();
  });

  it("will not retime a curve whose points are out of order, or too short", () => {
    expect(refused([{ temp: 150, at: 160 }], base.slice(0, 1))).toContain("nothing to retime");
    expect(refused([{ temp: 150, at: 160 }], [...base].reverse())).toContain("not in order");
  });
});

// The same properties over every real profile in the library; skipped when there is none.
describe.skipIf(PRIVATE_PROFILES.length === 0)("on the real profiles in the library", () => {
  const curves = PRIVATE_PROFILES.map(({ text }) => parseKpro(text).roastCurve).filter((c) => c.length >= 3);

  it("none climbs faster than the ceiling once past 100 °C, and none has a rate of rise that picks up again", () => {
    expect(curves.length).toBeGreaterThan(0);
    for (const c of curves) {
      expect(steepestClimb(c).cPerMin).toBeLessThanOrEqual(MAX_RISE_C_PER_MIN);
      expect(steepestClimb(c, LATE_FROM_C).cPerMin).toBeLessThanOrEqual(MAX_LATE_RISE_C_PER_MIN);
      expect(risingRateOfRise(c)).toEqual([]);
    }
  });

  it("retimes 150 °C later and 180 °C with it on every curve, to the second asked for, and the file reads back", () => {
    for (const c of curves) {
      const [a, b] = [timeCurveReaches(c, 150)!, timeCurveReaches(c, 180)!];
      const result = retimeCurve(c, [{ temp: 150, at: a + 20 }, { temp: 180, at: b + 30 }]);
      expect(result.ok, `${c.length} nodes, 150 °C at ${a}`).toBe(true);
      if (!result.ok) continue;
      expect(evalCurve(result.curve, a + 20)).toBeCloseTo(150, 1);
      expect(evalCurve(result.curve, b + 30)).toBeCloseTo(180, 1);
      const back = parseCurve(formatCurve(result.curve));
      for (let t = 100; t <= 500; t += 25) expect(evalCurve(back, t)).toBeCloseTo(evalCurve(result.curve, t)!, 1);
    }
  });
});

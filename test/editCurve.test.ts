import { describe, expect, it } from "vitest";
import { SLOPE_RANGE_C_PER_MIN, formatCurve, holdThermalDose, lastSegmentIsStraight, lastSegmentSlope, setLastSegmentSlope, withRoastCurve } from "../src/adapters/kaffelogic/editCurve.js";
import { evalCurve, parseCurve, parseKpro } from "../src/adapters/kaffelogic/parse.js";
import { curveThermalDoseTo, profileThermalDoseAtLevel } from "../src/adapters/kaffelogic/thermalDose.js";
import { formatKpro, profileFromKpro, sameProfileBody } from "../src/adapters/kaffelogic/writeProfile.js";
import { PRIVATE_PROFILES } from "./privateFiles.js";
import { BENT_CLIMB_CURVE, CLIMB_CURVE, PROFILE, profileWithCurve } from "./syntheticLog.js";

const profile = (curve = CLIMB_CURVE) => parseKpro(profileWithCurve(curve));

/** The edit, or a failed test saying why there is none. */
function edited(...args: Parameters<typeof holdThermalDose>) {
  const result = holdThermalDose(...args);
  if (!result.ok) throw new Error(`expected an edit, got: ${result.problem}`);
  return result;
}

describe("a curve as a header value", () => {
  it("is six numbers a node in six significant figures, the way Kaffelogic writes them", () => {
    expect(formatCurve(parseCurve("0,20,0,0,60,80,120,160.8,90,130,160,168"))).toBe("0.00000,20.0000,0.00000,0.00000,60.0000,80.0000,120.000,160.800,90.0000,130.000,160.000,168.000");
  });

  it("reads back every number it wrote", () => {
    const nodes = setLastSegmentSlope(profile().roastCurve, 7.25);
    const six = (x: number) => Number(x.toPrecision(6));
    const normal = (n: (typeof nodes)[number]) => ({ point: { t: six(n.point.t), v: six(n.point.v) }, handleIn: { t: six(n.handleIn.t), v: six(n.handleIn.v) }, handleOut: { t: six(n.handleOut.t), v: six(n.handleOut.v) } });
    expect(parseCurve(formatCurve(nodes))).toEqual(nodes.map(normal));
  });
});

describe("the last segment of a curve", () => {
  const nodes = profile().roastCurve;

  it("has the slope of the line between its ends, and is straight when its handles agree", () => {
    expect(lastSegmentSlope(nodes)).toBeCloseTo(6, 9);
    expect(lastSegmentIsStraight(nodes)).toBe(true);
    expect(lastSegmentIsStraight(profile(BENT_CLIMB_CURVE).roastCurve)).toBe(false);
    expect(lastSegmentIsStraight(setLastSegmentSlope(profile(BENT_CLIMB_CURVE).roastCurve, 5))).toBe(true);
  });

  it("is edited without touching any node before the last two, nor the curve up to the second-to-last node", () => {
    const edit = setLastSegmentSlope(nodes, 8);
    expect(edit.slice(0, -2)).toEqual(nodes.slice(0, -2));
    expect(edit).toHaveLength(nodes.length);
    for (let t = 0; t <= 299; t += 20) expect(evalCurve(edit, t)).toBeCloseTo(evalCurve(nodes, t)!, 6);
    // The last node keeps its time and its out-handle, which is zero where the curve ends.
    expect(edit[edit.length - 1].point.t).toBe(600);
    expect(edit[edit.length - 1].handleOut).toEqual(nodes[nodes.length - 1].handleOut);
  });

  it("becomes a straight climb at the slope asked for, and the curve carries on at it past the end", () => {
    for (const slope of [3, 6, 9]) {
      const edit = setLastSegmentSlope(nodes, slope);
      const at = (t: number) => evalCurve(edit, t)!;
      expect(((at(500) - at(400)) / 100) * 60).toBeCloseTo(slope, 3);
      expect(((at(700) - at(650)) / 50) * 60).toBeCloseTo(slope, 3);
      expect(lastSegmentSlope(edit)).toBeCloseTo(slope, 9);
    }
  });

  it("keeps the curve rising, and refuses a slope that is not above zero and a curve without a last segment to reshape", () => {
    const edit = setLastSegmentSlope(nodes, SLOPE_RANGE_C_PER_MIN[0]);
    for (let t = 1; t <= 640; t++) expect(evalCurve(edit, t)!).toBeGreaterThan(evalCurve(edit, t - 1)!);
    expect(() => setLastSegmentSlope(nodes, 0)).toThrow(/above 0/);
    expect(() => setLastSegmentSlope(nodes.slice(-2), 6)).toThrow(/at least three nodes/);
    const outOfOrder = nodes.map((n, i) => (i === nodes.length - 1 ? { ...n, point: { ...n.point, t: 300 } } : n));
    expect(() => setLastSegmentSlope(outOfOrder, 6)).toThrow(/time order/);
  });
});

describe("the thermal dose of a curve ended at a temperature", () => {
  const nodes = profile().roastCurve;

  it("finds the end on a half-second grid, or inside the half second when asked, and not at all for a temperature the curve never reaches", () => {
    const grid = curveThermalDoseTo(nodes, 225)!;
    const exact = curveThermalDoseTo(nodes, 225, true)!;
    expect(grid.endsAt % 0.5).toBe(0);
    expect(evalCurve(nodes, exact.endsAt)!).toBeCloseTo(225, 6);
    expect(exact.endsAt).toBeLessThanOrEqual(grid.endsAt);
    expect(grid.endsAt - exact.endsAt).toBeLessThan(0.5);
    expect(Math.abs(grid.thermalDose - exact.thermalDose) / exact.thermalDose).toBeLessThan(0.01);
    expect(curveThermalDoseTo(nodes, 400)).toBeUndefined();
    expect(curveThermalDoseTo(nodes.slice(0, 1), 100)).toBeUndefined();
  });
});

describe("holding the thermal dose", () => {
  const p = profile();
  // The curve's thermal dose at a level with the end time found exactly, the figure an edit holds.
  const stock = (level: number) => {
    const at = profileThermalDoseAtLevel(p, level)!;
    return { ...at, ...curveThermalDoseTo(p.roastCurve, at.endTemp, true)! };
  };

  it("finds the slope whose curve, ended at another level's temperature, has the thermal dose of the first", () => {
    const target = stock(2.6).thermalDose;
    const edit = edited(p, stock(3).endTemp, target);
    expect(edit.thermalDose).toBeCloseTo(target, 6);
    expect(curveThermalDoseTo(edit.curve, stock(3).endTemp, true)!.thermalDose).toBeCloseTo(target, 6);
    // The same thermal dose at a hotter end takes a steeper climb, and the roast ends sooner.
    expect(edit.slopeBefore).toBeCloseTo(6, 9);
    expect(edit.slopeAfter).toBeGreaterThan(edit.slopeBefore);
    expect(edit.endsAtAfter).toBeLessThan(stock(2.6).endsAt);
  });

  it("goes the other way for a cooler end: a flatter climb, a longer roast", () => {
    const edit = edited(p, stock(2.2).endTemp, stock(2.6).thermalDose);
    expect(edit.slopeAfter).toBeLessThan(edit.slopeBefore);
    expect(edit.endsAtAfter).toBeGreaterThan(stock(2.6).endsAt);
  });

  it("changes nothing when asked for the thermal dose the curve already has", () => {
    const edit = edited(p, stock(2.6).endTemp, stock(2.6).thermalDose);
    expect(edit.slopeAfter).toBeCloseTo(edit.slopeBefore, 4);
    expect(edit.climbFrom).toEqual({ t: 300, temp: 199 });
  });

  it("reaches the slopes at the edges of the range, but no further", () => {
    const end = stock(3).endTemp;
    const doseAtSlope = (slope: number) => curveThermalDoseTo(setLastSegmentSlope(p.roastCurve, slope), end, true)!.thermalDose;
    const [lo, hi] = SLOPE_RANGE_C_PER_MIN;
    expect(edited(p, end, doseAtSlope(hi)).slopeAfter).toBeCloseTo(hi, 3);
    expect(edited(p, end, doseAtSlope(lo)).slopeAfter).toBeCloseTo(lo, 3);
    for (const target of [doseAtSlope(hi) * 0.99, doseAtSlope(lo) * 1.01]) expect(holdThermalDose(p, end, target)).toMatchObject({ ok: false, problem: expect.stringContaining("No climb between 2 and 12") });
  });

  it("treats a curve that does not reach the end temperature at a slow climb as having taken more time than any target", () => {
    // At 260 °C the 12 °C/min climb arrives just after the curve's last node and the 2 °C/min one never within the search's 1200 s.
    const end = 260;
    const fastest = curveThermalDoseTo(setLastSegmentSlope(p.roastCurve, 12), end, true)!.thermalDose;
    expect(curveThermalDoseTo(setLastSegmentSlope(p.roastCurve, 2), end, true)).toBeUndefined();
    const edit = edited(p, end, fastest * 1.5);
    expect(edit.thermalDose).toBeCloseTo(fastest * 1.5, 6);
    expect(edit.slopeAfter).toBeGreaterThan(2);
    expect(edit.slopeAfter).toBeLessThan(12);
  });

  it("refuses a target the search only seems to reach: past the slope where the curve stops reaching the end in time", () => {
    // At 260 °C the 2 °C/min climb never arrives within the search's 1200 s, so a huge target brackets, but no slope gives it.
    expect(holdThermalDose(p, 260, 1e6)).toMatchObject({ ok: false, problem: expect.stringContaining("No climb between 2 and 12 °C/min") });
  });

  it("says why there is no edit, in plain words", () => {
    const end = stock(3).endTemp;
    expect(holdThermalDose(p, end, stock(3).thermalDose * 3)).toMatchObject({ ok: false, problem: expect.stringContaining("No climb between 2 and 12 °C/min") });
    expect(holdThermalDose(p, end, stock(3).thermalDose / 3)).toMatchObject({ ok: false, problem: expect.stringContaining("No climb between 2 and 12 °C/min") });
    // An end before the climb starts: the target is the curve's own thermal dose there, so only the guard on the end can refuse it.
    const early = curveThermalDoseTo(p.roastCurve, 195, true)!.thermalDose;
    expect(holdThermalDose(p, 195, early)).toMatchObject({ ok: false, problem: expect.stringContaining("falls before the edited climb starts") });
    expect(holdThermalDose(p, 199, early)).toMatchObject({ ok: false, problem: expect.stringContaining("falls before the edited climb starts") });
    expect(holdThermalDose(profile(BENT_CLIMB_CURVE), end, stock(3).thermalDose)).toMatchObject({ ok: false, problem: expect.stringContaining("not one straight climb") });
    // Handles or nodes that coincide in time have no slope: not a straight climb, and not a crash.
    const sameTime = CLIMB_CURVE.replace("600,229,500,219", "300,229,200,219");
    const flatHandle = CLIMB_CURVE.replace("600,229,500,219", "600,229,600,219");
    // A final node before the second-to-last, falling with agreeing handles, has a positive chord too.
    const reversed = CLIMB_CURVE.replace("600,229,500,219", "240,193,220,191");
    for (const curve of [sameTime, flatHandle, reversed]) {
      expect(lastSegmentIsStraight(profile(curve).roastCurve)).toBe(false);
      expect(holdThermalDose(profile(curve), end, stock(3).thermalDose)).toMatchObject({ ok: false, problem: expect.stringContaining("not one straight climb") });
    }
    const twoNodes = parseKpro(`${PROFILE}\n`);
    expect(twoNodes.roastCurve).toHaveLength(2);
    expect(holdThermalDose(twoNodes, 215, 5)).toMatchObject({ ok: false, problem: expect.stringContaining("2 nodes") });
  });

  it("writes a different profile that reads back with the same levels, and rewrites nothing else", () => {
    const lines = profileFromKpro(profileWithCurve(CLIMB_CURVE));
    const edit = edited(p, stock(3).endTemp, stock(2.6).thermalDose);
    const written = withRoastCurve(lines, edit.curve);
    expect(sameProfileBody(written, lines)).toBe(false);
    expect(written.filter(([k]) => k !== "roast_profile")).toEqual(lines.filter(([k]) => k !== "roast_profile"));
    const back = parseKpro(formatKpro(written));
    expect(back.roastLevels).toEqual(p.roastLevels);
    // Through the file's six figures the exact figure moves by a few parts in a million.
    const readBack = curveThermalDoseTo(back.roastCurve, stock(3).endTemp, true)!.thermalDose;
    expect(Math.abs(readBack - stock(2.6).thermalDose) / stock(2.6).thermalDose).toBeLessThan(1e-3);
  });
});

// The same properties over every real profile in the library; skipped when there is none.
describe.skipIf(PRIVATE_PROFILES.length === 0)("on the real profiles in the library", () => {
  it("holds the predicted thermal dose of a level at the next level's end temperature when the last segment is one straight climb, and says why when it is not", () => {
    let tried = 0;
    for (const { text } of PRIVATE_PROFILES) {
      const real = parseKpro(text);
      for (const [from, to] of [[2.6, 3.0], [3.0, 2.6]]) {
        const a = profileThermalDoseAtLevel(real, from);
        const b = profileThermalDoseAtLevel(real, to);
        if (!a || !b) continue;
        tried++;
        const target = curveThermalDoseTo(real.roastCurve, a.endTemp, true)!.thermalDose;
        const result = holdThermalDose(real, b.endTemp, target);
        // A curve is edited exactly when its last segment is straight; otherwise the refusal says so.
        expect(result.ok, `${real.shortName} ${from} to ${to}`).toBe(real.roastCurve.length >= 3 && lastSegmentIsStraight(real.roastCurve));
        if (!result.ok) {
          expect(result.problem).toMatch(/not one straight climb|nodes/);
          continue;
        }
        expect(Math.abs(result.thermalDose - target) / target).toBeLessThan(1e-4);
        const back = parseKpro(formatKpro(withRoastCurve(profileFromKpro(text), result.curve)));
        expect(back.roastLevels).toEqual(real.roastLevels);
        // Through the file's six figures, far inside the 3% the roadmap allows for "about the same thermal dose".
        expect(Math.abs(curveThermalDoseTo(back.roastCurve, b.endTemp, true)!.thermalDose - target) / target).toBeLessThan(1e-3);
      }
    }
    expect(tried).toBeGreaterThan(0);
  });
});

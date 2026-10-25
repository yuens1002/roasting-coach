import { describe, expect, it } from "vitest";
import { SLOPE_RANGE_C_PER_MIN, finalSlope, formatCurve, holdThermalDose, setLastSegmentSlope, withRoastCurve } from "../src/adapters/kaffelogic/editCurve.js";
import { evalCurve, parseCurve, parseKpro } from "../src/adapters/kaffelogic/parse.js";
import { curveThermalDoseTo, profileThermalDoseAtLevel } from "../src/adapters/kaffelogic/thermalDose.js";
import { formatKpro, profileFromKpro, sameProfileBody } from "../src/adapters/kaffelogic/writeProfile.js";
import { PRIVATE_PROFILES } from "./privateFiles.js";
import { PROFILE } from "./syntheticLog.js";

// A made-up curve shaped like a stock one: a fast start, then a straight climb of 6 °C/min from 300 s (199 °C) to 600 s (229 °C).
const CURVE = "0,20,0,0,60,80,120,160,90,130,160,168,300,199,240,189,360,205,600,229,500,219,0,0";
const profile = () => parseKpro(`${PROFILE.replace(/^roast_profile:.*$/m, `roast_profile:${CURVE}`).replace(/^roast_levels:.*$/m, "roast_levels:205,215,222,227,231,235,241")}\n`);

describe("editing the last segment of a curve", () => {
  const nodes = profile().roastCurve;

  it("writes six significant figures the way Kaffelogic does, and reads back what it wrote", () => {
    expect(formatCurve(nodes).split(",")[1]).toBe("20.0000");
    const edited = setLastSegmentSlope(nodes, 7.25);
    expect(parseCurve(formatCurve(edited)).map((n) => n.point.v)).toEqual(edited.map((n) => Number(n.point.v.toPrecision(6))));
  });

  it("leaves every node before the last two as it was, and the curve up to the second-to-last node", () => {
    const edited = setLastSegmentSlope(nodes, 8);
    expect(edited.slice(0, -2)).toEqual(nodes.slice(0, -2));
    expect(edited).toHaveLength(nodes.length);
    for (let t = 0; t <= 299; t += 20) expect(evalCurve(edited, t)).toBeCloseTo(evalCurve(nodes, t)!, 6);
  });

  it("makes the last segment a straight climb at the slope asked for, and the curve carries on at it", () => {
    for (const slope of [3, 6, 9]) {
      const edited = setLastSegmentSlope(nodes, slope);
      const at = (t: number) => evalCurve(edited, t)!;
      expect(((at(500) - at(400)) / 100) * 60).toBeCloseTo(slope, 3);
      expect(((at(700) - at(650)) / 50) * 60).toBeCloseTo(slope, 3);
      expect(finalSlope(edited)).toBeCloseTo(slope, 6);
    }
  });

  it("keeps the curve rising, and refuses a slope that is not above zero", () => {
    const edited = setLastSegmentSlope(nodes, SLOPE_RANGE_C_PER_MIN[0]);
    for (let t = 1; t <= 640; t++) expect(evalCurve(edited, t)!).toBeGreaterThan(evalCurve(edited, t - 1)!);
    expect(() => setLastSegmentSlope(nodes, 0)).toThrow(/above 0/);
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
    const edit = holdThermalDose(p, stock(3).endTemp, target)!;
    expect(edit.thermalDose).toBeCloseTo(target, 6);
    expect(curveThermalDoseTo(edit.curve, stock(3).endTemp, true)!.thermalDose).toBeCloseTo(target, 6);
    // The same thermal dose at a hotter end takes a steeper climb, and the roast ends sooner.
    expect(edit.slopeAfter).toBeGreaterThan(edit.slopeBefore);
    expect(edit.endsAtAfter).toBeLessThan(stock(2.6).endsAt);
  });

  it("goes the other way for a cooler end: a flatter climb, a longer roast", () => {
    const edit = holdThermalDose(p, stock(2.2).endTemp, stock(2.6).thermalDose)!;
    expect(edit.slopeAfter).toBeLessThan(edit.slopeBefore);
    expect(edit.endsAtAfter).toBeGreaterThan(stock(2.6).endsAt);
  });

  it("changes nothing when asked for the thermal dose the curve already has", () => {
    const edit = holdThermalDose(p, stock(2.6).endTemp, stock(2.6).thermalDose)!;
    expect(edit.slopeAfter).toBeCloseTo(edit.slopeBefore, 4);
    expect(edit.climbFrom).toEqual({ t: 300, temp: 199 });
  });

  it("refuses what no slope in range gives, and an end the edited climb does not reach", () => {
    expect(holdThermalDose(p, stock(3).endTemp, stock(3).thermalDose * 3)).toBeUndefined();
    expect(holdThermalDose(p, stock(3).endTemp, stock(3).thermalDose / 3)).toBeUndefined();
    expect(holdThermalDose(p, 195, 5)).toBeUndefined();
  });

  it("writes a different profile that reads back with the same levels, and rewrites nothing else", () => {
    const lines = profileFromKpro(`${PROFILE.replace(/^roast_profile:.*$/m, `roast_profile:${CURVE}`).replace(/^roast_levels:.*$/m, "roast_levels:205,215,222,227,231,235,241")}\n`);
    const edit = holdThermalDose(p, stock(3).endTemp, stock(2.6).thermalDose)!;
    const edited = withRoastCurve(lines, edit.curve);
    expect(sameProfileBody(edited, lines)).toBe(false);
    expect(edited.filter(([k]) => k !== "roast_profile")).toEqual(lines.filter(([k]) => k !== "roast_profile"));
    const back = parseKpro(formatKpro(edited));
    expect(back.roastLevels).toEqual(p.roastLevels);
    // Read back from the file's six figures and ended on the half-second grid the rest of the tool uses.
    expect(Math.abs(profileThermalDoseAtLevel(back, 3)!.thermalDose - stock(2.6).thermalDose) / stock(2.6).thermalDose).toBeLessThan(0.005);
  });
});

// The same properties over every real profile in the library; skipped when there is none.
describe.skipIf(PRIVATE_PROFILES.length === 0)("on the real profiles in the library", () => {
  it("holds the predicted thermal dose of a level at the next level's end temperature, or refuses, and the file reads back", () => {
    let held = 0;
    for (const { text } of PRIVATE_PROFILES) {
      const real = parseKpro(text);
      for (const [from, to] of [[2.6, 3.0], [3.0, 2.6]]) {
        const a = profileThermalDoseAtLevel(real, from);
        const b = profileThermalDoseAtLevel(real, to);
        if (!a || !b) continue;
        const target = curveThermalDoseTo(real.roastCurve, a.endTemp, true)!.thermalDose;
        const edit = holdThermalDose(real, b.endTemp, target);
        if (!edit) continue;
        held++;
        expect(Math.abs(edit.thermalDose - target) / target).toBeLessThan(1e-4);
        const back = parseKpro(formatKpro(withRoastCurve(profileFromKpro(text), edit.curve)));
        expect(back.roastLevels).toEqual(real.roastLevels);
        // Through the file's six figures, inside the 3% the roadmap allows for "about the same thermal dose".
        expect(Math.abs(curveThermalDoseTo(back.roastCurve, b.endTemp, true)!.thermalDose - target) / target).toBeLessThan(0.01);
      }
    }
    expect(held).toBeGreaterThan(0);
  });
});

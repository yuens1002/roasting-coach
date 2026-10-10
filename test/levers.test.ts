import { describe, expect, it } from "vitest";
import { NO_OVERRIDES, applyChange, resolveCalibration } from "../src/core/calibration.js";
import { levelLadder } from "../src/core/levers.js";
import { DEFAULT_CALIBRATION, type TastedRoast } from "../src/core/rules.js";

const roast = (thermalDose: number, quality: number, over: Partial<TastedRoast> = {}): TastedRoast => ({
  thermalDose,
  taste: ["flat"],
  quality,
  brew: "pourover",
  profile: "Robusta",
  restedDays: 1,
  ...over,
});
/** A ladder of roasts, each about 10% less than the one before, oldest first, with the roast qualities given. */
const ladder = (qualities: number[], over: Partial<TastedRoast> = {}) => qualities.map((q, i) => roast(12 * 0.9 ** i, q, over));
const mine = (change: unknown) => {
  const r = applyChange(NO_OVERRIDES, change);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return resolveCalibration(r.overrides);
};

describe("the level's steps", () => {
  it("counts each real step back from the latest roast, in the direction it went", () => {
    const rs = ladder([3, 3, 3, 3]);
    expect(levelLadder(rs[3], rs.slice(0, 3), DEFAULT_CALIBRATION)).toMatchObject({ steps: 3, direction: "less" });
    expect(levelLadder(rs[1], rs.slice(0, 1), DEFAULT_CALIBRATION)).toMatchObject({ steps: 1, direction: "less" });
    // The same ladder walked upwards: more roasting each time.
    const up = ladder([3, 3, 3]).map((r, i) => ({ ...r, thermalDose: 9 * 1.1 ** i }));
    expect(levelLadder(up[2], up.slice(0, 2), DEFAULT_CALIBRATION)).toMatchObject({ steps: 2, direction: "more" });
  });
  it("counts a repeat of a rung, or a move inside the noise band, once: it is walked past, not a place to stop", () => {
    // 10.8 to 10.7 is under 1%: the same rung roasted twice. The run still reaches 12 above it.
    const rs = [roast(12, 3), roast(10.8, 3), roast(10.7, 3), roast(9.6, 3)];
    const ladder = levelLadder(rs[3], rs.slice(0, 3), DEFAULT_CALIBRATION);
    expect(ladder.steps).toBe(2);
    expect(ladder.run.map((r) => r.thermalDose)).toEqual([12, 10.7, 9.6]);
  });
  it("is not wiped out by the latest roast being a repeat of the one before", () => {
    // Three rungs (12, 10.8, 9.7) and then 9.75, the same level again: two steps, not none.
    const rs = [roast(12, 2), roast(10.8, 3), roast(9.7, 3), roast(9.75, 3)];
    expect(levelLadder(rs[3], rs.slice(0, 3), DEFAULT_CALIBRATION)).toMatchObject({ steps: 2, direction: "less" });
  });
  it("counts a move of exactly noResponsePct as a step, whichever way it went", () => {
    // 10 to 10.7 measures a hair over 7%, 10 to 9.3 a hair under, in floating point; both are 7%.
    expect(levelLadder(roast(10.7, 3), [roast(10, 3)], DEFAULT_CALIBRATION).steps).toBe(1);
    expect(levelLadder(roast(9.3, 3), [roast(10, 3)], DEFAULT_CALIBRATION).steps).toBe(1);
    expect(levelLadder(roast(10.69, 3), [roast(10, 3)], DEFAULT_CALIBRATION).steps).toBe(0);
  });
  it("stops where the direction turns", () => {
    const rs = [roast(9, 3), roast(12, 3), roast(10.8, 3)];
    expect(levelLadder(rs[2], rs.slice(0, 2), DEFAULT_CALIBRATION)).toMatchObject({ steps: 1, direction: "less" });
  });
  it("ignores roasts on another profile", () => {
    const rs = [roast(12, 3, { profile: "KL Washed" }), roast(10.8, 3), roast(9.7, 3)];
    expect(levelLadder(rs[2], rs.slice(0, 2), DEFAULT_CALIBRATION).steps).toBe(1);
  });
  it("compares fingerprints when both are known, not names", () => {
    const rs = [roast(12, 3, { profileKey: "a" }), roast(10.8, 3, { profileKey: "b" }), roast(9.7, 3, { profileKey: "b" })];
    expect(levelLadder(rs[2], rs.slice(0, 2), DEFAULT_CALIBRATION).steps).toBe(1);
  });
});

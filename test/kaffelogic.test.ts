import { describe, expect, it } from "vitest";
import { evalCurve, levelToTemp, parseKlog, parseKpro } from "../src/adapters/kaffelogic/parse.js";
import { kaffelogicToRoastLog } from "../src/adapters/kaffelogic/toRoastLog.js";
import { extractFeatures } from "../src/core/features.js";
import { PRIVATE_LOGS, PRIVATE_PROFILES, headerValue } from "./privateFiles.js";
import { PROFILE, syntheticLog } from "./syntheticLog.js";

describe("parseKpro", () => {
  const p = parseKpro(PROFILE);

  it("reads the header fields", () => {
    expect(p.shortName).toBe("Test line");
    expect(p.description).toBe("First line\nSecond line");
    expect(p.recommendedLevel).toBe(3.3);
    expect(p.expectFirstCrack).toBeUndefined();
    expect(p.roastLevels).toEqual([204, 209, 214, 219, 222, 224, 226]);
  });

  it("keeps only zones that are switched on", () => {
    expect(p.zones).toEqual([{ index: 1, start: 100, end: 200, boost: 3 }]);
  });

  it("evaluates the Bezier curve and extends it past the last point", () => {
    expect(p.roastCurve).toHaveLength(2);
    expect(evalCurve(p.roastCurve, 0)).toBeCloseTo(20, 3);
    expect(evalCurve(p.roastCurve, 300)).toBeCloseTo(120, 1);
    expect(evalCurve(p.roastCurve, 600)).toBeCloseTo(220, 3);
    expect(evalCurve(p.roastCurve, 630)).toBeCloseTo(230, 1);
  });

  it("rejects files that are not profiles", () => {
    expect(() => parseKpro("hello:world")).toThrow();
  });
});

describe("levelToTemp", () => {
  const levels = [204, 209, 214, 219, 222, 224, 226];
  it("indexes levels from 0 and interpolates", () => {
    expect(levelToTemp(levels, 0)).toBe(204);
    expect(levelToTemp(levels, 3)).toBe(219);
    expect(levelToTemp(levels, 3.3)).toBeCloseTo(219.9, 5);
    expect(levelToTemp(levels, 6)).toBe(226);
    expect(levelToTemp(levels, 9)).toBe(226);
  });
});

describe("parseKlog + features on a synthetic roast", () => {
  const raw = parseKlog(syntheticLog({ colour_change: 420, first_crack: 540, roast_end: 600 }));

  it("cleans column names and reads markers by value, not position", () => {
    expect(raw.columns).toContain("temp");
    expect(raw.columns).toContain("actual_fan_RPM");
    expect(raw.markers).toMatchObject({ colour_change: 420, first_crack: 540, roast_end: 600 });
    expect(raw.data.time).toHaveLength(641);
    expect(raw.roastDate).toBe("2025-06-25T14:21:55Z");
  });

  it("computes phases, development and RoR", () => {
    const log = kaffelogicToRoastLog(raw);
    expect(log.targetEndTemp).toBeCloseTo(219.9, 5);
    const f = extractFeatures(log);
    expect(f.totalTime).toBe(600);
    expect(f.dropTemp).toBeCloseTo(220, 5);
    expect(f.firstCrack?.temp).toBeCloseTo(200, 5);
    expect(f.phases).toEqual({ drying: 420, maillard: 120, development: 60 });
    expect(f.developmentRatio).toBeCloseTo(10, 5);
    expect(f.developmentDeltaT).toBeCloseTo(20, 5);
    expect(f.ror.atFirstCrack).toBeCloseTo(20, 3);
    expect(f.timeToTemp[150]).toBe(390);
    expect(f.profileTracking?.meanAbsError).toBeCloseTo(0, 5);
    expect(f.dataWarnings).toEqual([]);
  });

  it("flags a colour change pressed at first-crack temperatures", () => {
    const f = extractFeatures(kaffelogicToRoastLog(parseKlog(syntheticLog({ colour_change: 534, first_crack: 540, roast_end: 600 }))));
    expect(f.colourChange).toBeUndefined();
    expect(f.phases.drying).toBeUndefined();
    expect(f.dataWarnings[0]).toMatch(/Colour change is marked at 198/);
  });

  it("says so when first crack was never marked", () => {
    const f = extractFeatures(kaffelogicToRoastLog(parseKlog(syntheticLog({ roast_end: 600 }))));
    expect(f.developmentRatio).toBeUndefined();
    expect(f.dataWarnings.join(" ")).toMatch(/First crack was not marked/);
  });
});

// The reference roast from the first build pass (log0040 on the maintainer's machine), found by its
// roast date rather than its file name.
const reference = PRIVATE_LOGS.find((f) => headerValue(f.text, "roast_date")?.startsWith("25/06/2025 14:21:55"));

describe("real Kaffelogic files", () => {
  it.skipIf(!reference)("reads the reference log and agrees with the machine's own development figure", () => {
    const raw = parseKlog(reference!.text);
    expect(raw.profile.shortName).toBe("1500-2000m RTD");
    expect(raw.level).toBeCloseTo(3.3, 5);
    expect(raw.markers.first_crack).toBeCloseTo(380.455, 3);
    expect(raw.markers.roast_end).toBeCloseTo(622.841, 3);

    const log = kaffelogicToRoastLog(raw);
    const f = extractFeatures(log);
    expect(f.developmentRatio).toBeCloseTo(raw.markers.development_percent, 1);
    expect(f.dropTemp).toBeGreaterThan(219);
    expect(f.dropTemp).toBeLessThan(220.5);
    // Level 3.3 on this profile is 219.9 °C; the roast ended within half a degree of it.
    expect(Math.abs(f.dropTemp - (log.targetEndTemp as number))).toBeLessThan(0.5);
    // Colour change was pressed 6 s before first crack at ~201 °C.
    expect(f.colourChange).toBeUndefined();
    expect(f.dataWarnings.some((w) => w.startsWith("Colour change"))).toBe(true);
    expect(f.ror.shape).toBe("declining");
  });

  // Every real log the machine computed a development figure for: ours must agree with it.
  const withMachineFigure = PRIVATE_LOGS.filter((f) => /^!development_percent:/m.test(f.text) && /^!first_crack:/m.test(f.text));
  it.skipIf(!withMachineFigure.length)("agrees with the machine's own development figure on every log that has one", () => {
    for (const { file, text } of withMachineFigure) {
      const raw = parseKlog(text);
      expect(extractFeatures(kaffelogicToRoastLog(raw)).developmentRatio, file).toBeCloseTo(raw.markers.development_percent, 1);
    }
  });

  it.skipIf(!PRIVATE_LOGS.length)("parses every log present", () => {
    for (const { file, text } of PRIVATE_LOGS) {
      const log = kaffelogicToRoastLog(parseKlog(text));
      expect(log.samples.length, file).toBeGreaterThan(100);
      expect(extractFeatures(log).totalTime, file).toBeGreaterThan(300);
    }
  });

  it.skipIf(!PRIVATE_PROFILES.length)("parses every profile present", () => {
    for (const { file, text } of PRIVATE_PROFILES) {
      const p = parseKpro(text);
      expect(p.roastLevels, file).toHaveLength(7);
      expect(p.roastCurve.length, file).toBeGreaterThanOrEqual(3);
      expect(p.roastCurve[p.roastCurve.length - 1].point.t, file).toBeGreaterThan(400);
    }
  });
});

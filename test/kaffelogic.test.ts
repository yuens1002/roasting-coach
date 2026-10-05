import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evalCurve, levelToTemp, parseKlog, parseKpro } from "../src/adapters/kaffelogic/parse.js";
import { kaffelogicToRoastLog } from "../src/adapters/kaffelogic/toRoastLog.js";
import { extractFeatures } from "../src/core/features.js";

// A made-up profile in the .kpro shape: a straight line from 20 °C at 0 s to 220 °C at 600 s.
const CURVE = "0,20,0,0,200,86.6667,600,220,400,153.333,0,0";
const PROFILE = [
  "profile_short_name:Test line",
  "profile_designer:roast-copilot tests",
  "profile_description:First line\\vSecond line",
  "recommended_level:3.3",
  "expect_fc:0.0",
  "zone1_time_start:100",
  "zone1_time_end:200",
  "zone1_boost:3",
  "zone2_time_start:0",
  "zone2_time_end:0",
  "zone2_boost:4",
  "roast_levels:204,209,214,219,222,224,226",
  `roast_profile:${CURVE}`,
  "fan_profile:0,14700,0,0,100,14700,600,13200,500,13200,0,0",
].join("\n");

/** A synthetic log that follows the line above: 1 °C every 3 s, crack marked at 540 s. */
function syntheticLog(markers: Record<string, number>): string {
  const rows: string[] = [];
  for (let t = 0; t <= 640; t++) {
    const temp = t <= 600 ? 20 + t / 3 : 220 - (t - 600) * 2; // cooling after the end
    rows.push([t, temp, temp, temp, Math.min(20 + t / 3, 220), 20, 20, 20, 1, 14700].join("\t") + "\t");
    for (const [name, at] of Object.entries(markers)) {
      // Real logs write markers a few seconds after the event.
      if (Math.round(at) + 5 === t) rows.push(`!${name}:${at}`);
    }
  }
  return [
    "log_file_name:test.klog",
    "roast_date:25/06/2025 14:21:55 UTC",
    "roasting_level:3.3",
    "boost_load_size:120",
    "ambient_temperature:21.5",
    PROFILE,
    "",
    "offsets\t0\t0\t0\t0\t0\t0\t0\t0\t0",
    "time\t#spot_temp\t#=temp\t=mean_temp\t=profile\tprofile_ROR\t=actual_ROR\t#=desired_ROR\tpower_kW\t#^actual_fan_RPM",
    ...rows,
  ].join("\n");
}

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

// Real Kaffelogic files are not committed (see README); these run only when
// they have been copied into fixtures/private locally.
const PRIVATE = join(__dirname, "..", "fixtures", "private");
const hasPrivate = existsSync(join(PRIVATE, "log0040.klog"));

describe.skipIf(!hasPrivate)("real Kaffelogic files", () => {
  it("reads log0040 and agrees with the machine's own development figure", () => {
    const raw = parseKlog(readFileSync(join(PRIVATE, "log0040.klog"), "utf8"));
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

  it("parses every stock profile", () => {
    const files = readdirSync(PRIVATE).filter((f) => f.endsWith(".kpro"));
    expect(files.length).toBeGreaterThanOrEqual(15);
    for (const file of files) {
      const p = parseKpro(readFileSync(join(PRIVATE, file), "utf8"));
      expect(p.roastLevels, file).toHaveLength(7);
      expect(p.roastCurve.length, file).toBeGreaterThanOrEqual(3);
      expect(p.roastCurve[p.roastCurve.length - 1].point.t, file).toBeGreaterThan(400);
    }
  });
});

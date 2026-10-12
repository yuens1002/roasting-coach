import { describe, expect, it } from "vitest";
import { parseKlog, parseKpro } from "../src/adapters/kaffelogic/parse.js";
import { developmentOvershoot, roastRunOf } from "../src/adapters/kaffelogic/runStats.js";
import { profileThermalDoseAtLevel } from "../src/adapters/kaffelogic/thermalDose.js";
import { PROFILE, syntheticLog } from "./syntheticLog.js";

// A short made-up roast: the bean ran 1 °C below the profile until first crack (second 4), then 2 °C and then 4 °C above it.
const log = (over: Partial<{ data: Record<string, number[]>; markers: Record<string, number> }> = {}) => ({
  data: { time: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], temp: [19, 29, 39, 49, 62, 72, 82, 94, 104, 114], profile: [20, 30, 40, 50, 60, 70, 80, 90, 100, 110], ...over.data },
  markers: { first_crack: 4, roast_end: 8, ...over.markers },
});

describe("how far above its profile the bean ran in development", () => {
  it("is the mean difference between the bean's temperature and the profile's, from first crack to the end", () => {
    // Seconds 4 to 8: 62-60, 72-70, 82-80, 94-90, 104-100 = 2, 2, 2, 4, 4.
    expect(developmentOvershoot(log())).toBeCloseTo(2.8, 10);
  });

  it("is negative when the bean ran below the profile", () => {
    expect(developmentOvershoot(log({ data: { temp: [19, 29, 39, 49, 58, 68, 78, 88, 98, 108] } }))).toBeCloseTo(-2, 10);
  });

  it("looks only between first crack and the end, both included, and not before or after", () => {
    // Moving the first-crack mark from second 4 to second 7 leaves seconds 7 and 8: 94-90 and 104-100.
    expect(developmentOvershoot(log({ markers: { first_crack: 7 } }))).toBeCloseTo(4, 10);
    expect(developmentOvershoot(log({ markers: { roast_end: 5 } }))).toBeCloseTo(2, 10);
  });

  it("uses the smoothed or the spot temperature when the controlled one is not in the log", () => {
    const { temp: _, ...rest } = log().data;
    expect(developmentOvershoot({ data: { ...rest, mean_temp: [19, 29, 39, 49, 64, 74, 84, 94, 104, 114] }, markers: log().markers })).toBeCloseTo(4, 10);
    expect(developmentOvershoot({ data: { ...rest, spot_temp: [19, 29, 39, 49, 61, 71, 81, 91, 101, 111] }, markers: log().markers })).toBeCloseTo(1, 10);
  });

  it("skips a sample with no number, and says nothing without a first-crack or an end mark, a profile column, or any sample to look at", () => {
    expect(developmentOvershoot(log({ data: { temp: [19, 29, 39, 49, Number.NaN, 72, 82, 94, 104, 114] } }))).toBeCloseTo(3, 10);
    expect(developmentOvershoot({ ...log(), markers: { roast_end: 8 } })).toBeUndefined();
    expect(developmentOvershoot({ ...log(), markers: { first_crack: 4 } })).toBeUndefined();
    const { profile: _, ...noProfile } = log().data;
    expect(developmentOvershoot({ data: noProfile, markers: log().markers })).toBeUndefined();
    expect(developmentOvershoot(log({ markers: { first_crack: 20, roast_end: 30 } }))).toBeUndefined();
  });
});

describe("what a Kaffelogic log says about how its roast ran", () => {
  it("gives the profile it was roasted on, the thermal dose that profile's curve predicts at the level, and the overshoot", () => {
    const run = roastRunOf(parseKlog(syntheticLog({ first_crack: 540, roast_end: 600 })));
    expect(run.profile).toBe("Test line");
    expect(run.predictedThermalDose).toBeCloseTo(profileThermalDoseAtLevel(parseKpro(PROFILE), 3.3)!.thermalDose, 8);
    // The made-up log follows its profile's curve exactly.
    expect(run.overshootC).toBeCloseTo(0, 6);
  });

  it("leaves out a figure the log can't give", () => {
    const noMarkers = roastRunOf(parseKlog(syntheticLog({})));
    expect(noMarkers.overshootC).toBeUndefined();
    expect(noMarkers.predictedThermalDose).toBeGreaterThan(0);
    const noLevel = roastRunOf(parseKlog(syntheticLog({ first_crack: 540, roast_end: 600 }).replace("roasting_level:3.3\n", "")));
    expect(noLevel.predictedThermalDose).toBeUndefined();
    expect(noLevel.profile).toBe("Test line");
  });
});

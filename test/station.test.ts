import { tmpdir } from "node:os";
import { isAbsolute, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { parseKlog } from "../src/adapters/kaffelogic/parse.js";
import { kaffelogicToRoastLog } from "../src/adapters/kaffelogic/toRoastLog.js";
import { extractFeatures } from "../src/core/features.js";
import { STATION_DB, STATION_DIR, assertStationUrl, maintenanceUrl, stationEndTemp, stationEnv, stationLog, stationUrl } from "../scripts/stationKit.js";

const APP = "postgres://roast:secret@localhost:54320/roast_copilot";

describe("the dev station keeps away from the app's own database and folders", () => {
  it("builds the station's connection from the app's server and credentials, changing only the database", () => {
    expect(stationUrl(APP)).toBe(`postgres://roast:secret@localhost:54320/${STATION_DB}`);
    expect(maintenanceUrl(APP)).toBe("postgres://roast:secret@localhost:54320/postgres");
  });

  it("refuses to drop or write any database but its own", () => {
    expect(() => assertStationUrl(stationUrl(APP))).not.toThrow();
    for (const other of [APP, maintenanceUrl(APP), "postgres://roast:roast@localhost:54320/roast_copilot_backup", `${stationUrl(APP)}x`]) {
      expect(() => assertStationUrl(other), other).toThrow(/Refusing to touch/);
    }
  });

  it("points the CLI's database and folders at the station, and nowhere else", () => {
    const env = stationEnv(APP);
    expect(Object.keys(env).sort()).toEqual(["DATABASE_URL", "KAFFELOGIC_DIR", "KAFFELOGIC_OUT_DIR"]);
    expect(env.DATABASE_URL).toBe(stationUrl(APP));
    // Both folders sit inside the one scratch folder the station may empty, which is in the system temp folder.
    const inside = (parent: string, child: string) => {
      const path = relative(parent, child);
      return path !== "" && !path.startsWith("..") && !isAbsolute(path);
    };
    expect(inside(tmpdir(), STATION_DIR)).toBe(true);
    expect(inside(STATION_DIR, env.KAFFELOGIC_DIR)).toBe(true);
    expect(inside(STATION_DIR, env.KAFFELOGIC_OUT_DIR)).toBe(true);
    // A sibling folder that merely starts with the same letters is not inside it.
    expect(inside(STATION_DIR, `${STATION_DIR}-other`)).toBe(false);
  });
});

describe("the station's made-up logs", () => {
  const roast = (level: number) => kaffelogicToRoastLog(parseKlog(stationLog({ level, roastedOn: "2026-10-08", name: "station-test" })));

  it("carry the level, the date and the made-up profile they were roasted on", () => {
    const log = parseKlog(stationLog({ level: 3.6, roastedOn: "2026-10-08", name: "station-test" }));
    expect(log.level).toBe(3.6);
    expect(new Date(log.roastDate!).toISOString().slice(0, 10)).toBe("2026-10-08");
    expect(log.profile.shortName).toBe("Test line");
  });

  it("end at the level's temperature, so a higher level is hotter and later", () => {
    expect(stationEndTemp(3.3)).toBeCloseTo(219.9, 1);
    expect(stationEndTemp(4.2)).toBeGreaterThan(stationEndTemp(3.3));
    const low = roast(3.0);
    const high = roast(4.2);
    expect(high.samples[high.samples.length - 1].t).toBeGreaterThan(low.samples[low.samples.length - 1].t);
  });

  it("give a higher thermal dose at a higher level, which is what lets a scripted session step the level", () => {
    const thermalDoses = [3.0, 3.3, 3.8, 4.2].map((level) => extractFeatures(roast(level)).thermalDose);
    for (let i = 1; i < thermalDoses.length; i++) expect(thermalDoses[i], `level step ${i}`).toBeGreaterThan(thermalDoses[i - 1]);
  });

  it("read as clean roasts: the crack markers are in order and nothing is flagged as a data problem", () => {
    const features = extractFeatures(roast(3.3));
    expect(features.dataWarnings).toEqual([]);
  });
});

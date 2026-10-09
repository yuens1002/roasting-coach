import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { parseKlog } from "../src/adapters/kaffelogic/parse.js";
import { kaffelogicToRoastLog } from "../src/adapters/kaffelogic/toRoastLog.js";
import { extractFeatures } from "../src/core/features.js";
import {
  STATION_DB,
  STATION_DB_COMMENT,
  STATION_DIR,
  STATION_DIR_MARKER,
  assertLocalServer,
  assertStationDir,
  assertStationOwnsDatabase,
  assertStationOwnsDir,
  assertStationUrl,
  maintenanceUrl,
  stationEndTemp,
  stationEnv,
  stationLog,
  stationUrl,
} from "../scripts/stationKit.js";

const APP = "postgres://roast:secret@localhost:54320/roast_copilot";

describe("the dev station keeps away from the app's own database and folders", () => {
  it("builds the station's connection from the app's server and credentials, changing only the database", () => {
    expect(stationUrl(APP)).toBe(`postgres://roast:secret@localhost:54320/${STATION_DB}`);
    expect(maintenanceUrl(APP)).toBe("postgres://roast:secret@localhost:54320/postgres");
  });

  it("refuses to drop or write any database but its own", () => {
    expect(() => assertStationUrl(stationUrl(APP))).not.toThrow();
    for (const other of [APP, maintenanceUrl(APP), "postgres://roast:roast@localhost:54320/roast_copilot_backup", `${stationUrl(APP)}x`, `${stationUrl(APP)}/`, "postgres://roast:secret@localhost:54320/roast%5Fstation"]) {
      expect(() => assertStationUrl(other), other).toThrow(/Refusing/);
    }
    // A query that names another database, and a socket URL (where the database is not in the path), are refused too.
    expect(() => assertStationUrl(`${stationUrl(APP)}?database=roast_copilot`)).toThrow(/names a database in its query/);
    expect(() => assertStationUrl(`${stationUrl(APP)}?db=roast_copilot`)).toThrow(/names a database in its query/);
    expect(() => assertStationUrl("socket:/var/run/postgresql/roast_station?db=roast_copilot")).toThrow(/Refusing/);
  });

  it("drops a database of its name only when it made it: a missing one or one with its comment, never one without", () => {
    expect(() => assertStationOwnsDatabase(undefined)).not.toThrow();
    expect(() => assertStationOwnsDatabase({ comment: STATION_DB_COMMENT })).not.toThrow();
    for (const comment of [null, "", "someone else's database", `${STATION_DB_COMMENT} (copy)`]) {
      expect(() => assertStationOwnsDatabase({ comment }), String(comment)).toThrow(/was not made by the station/);
    }
  });

  it("keeps its database comment safe to write into an SQL statement that takes no parameters", () => {
    expect(STATION_DB_COMMENT).not.toMatch(/['\\]/);
  });

  it("runs only against a server on this machine, as pg reads the connection string, unless the person names that exact host", () => {
    for (const local of ["localhost", "LOCALHOST", "127.0.0.1", "[::1]"]) expect(() => assertLocalServer(`postgres://roast:secret@${local}:54320/roast_copilot`, undefined), local).not.toThrow();
    // A local socket, written as a host or as a query, is on this machine too.
    expect(() => assertLocalServer("postgres://%2Fvar%2Frun%2Fpostgresql/roast_copilot", undefined)).not.toThrow();
    expect(() => assertLocalServer("postgres://roast:secret@localhost/roast_copilot?host=/var/run/postgresql", undefined)).not.toThrow();
    for (const remote of ["db.example.com", "10.0.0.5", "production", "127.0.0.1.example.com", "localhost.example.com"]) {
      expect(() => assertLocalServer(`postgres://roast:secret@${remote}:5432/roast_copilot`, undefined), remote).toThrow(/only runs on this machine/);
    }
    // pg lets a ?host= query override the URL's host, so a loopback host in the URL proves nothing by itself.
    expect(() => assertLocalServer("postgres://roast:secret@localhost:54320/roast_copilot?host=db.prod.example.com", undefined)).toThrow(/against db.prod.example.com/);
    expect(() => assertLocalServer("postgres://roast:secret@localhost:54320/roast_copilot?host=db.prod.example.com", "localhost")).toThrow(/against db.prod.example.com/);
    // An opt-in must name the very host in the URL.
    expect(() => assertLocalServer("postgres://roast:secret@db.example.com:5432/roast_copilot", "db.example.com")).not.toThrow();
    expect(() => assertLocalServer("postgres://roast:secret@db.example.com:5432/roast_copilot", "other.example.com")).toThrow(/STATION_ALLOW_HOST=db.example.com/);
    expect(() => assertLocalServer("postgres://roast:secret@db.example.com:5432/roast_copilot", "")).toThrow(/only runs on this machine/);
  });

  it("reads the opt-in from STATION_ALLOW_HOST when none is passed", () => {
    const url = "postgres://roast:secret@db.example.com:5432/roast_copilot";
    const before = process.env.STATION_ALLOW_HOST;
    try {
      delete process.env.STATION_ALLOW_HOST;
      expect(() => assertLocalServer(url)).toThrow(/only runs on this machine/);
      process.env.STATION_ALLOW_HOST = "db.example.com";
      expect(() => assertLocalServer(url)).not.toThrow();
    } finally {
      if (before === undefined) delete process.env.STATION_ALLOW_HOST;
      else process.env.STATION_ALLOW_HOST = before;
    }
  });

  it("empties its folder only when it is missing, empty or marked as the station's, never one holding other files", () => {
    expect(() => assertStationOwnsDir(STATION_DIR, undefined)).not.toThrow();
    expect(() => assertStationOwnsDir(STATION_DIR, [])).not.toThrow();
    expect(() => assertStationOwnsDir(STATION_DIR, [STATION_DIR_MARKER, "logs", "out"])).not.toThrow();
    expect(() => assertStationOwnsDir(STATION_DIR, ["notes.txt"])).toThrow(/did not make/);
    expect(() => assertStationOwnsDir(STATION_DIR, ["logs", "out", "library"])).toThrow(/did not make/);
  });

  it("empties only its own scratch folder", () => {
    expect(() => assertStationDir(STATION_DIR)).not.toThrow();
    for (const other of [tmpdir(), process.cwd(), join(process.cwd(), "profiles"), join(tmpdir(), "roasting-coach-station-other"), join(STATION_DIR, "library")]) {
      expect(() => assertStationDir(other), other).toThrow(/Refusing to empty/);
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
    // The bean temperature at the roast_end marker is the level's end temperature, and the marker is where the line reaches it.
    for (const level of [3.0, 4.2]) {
      const log = parseKlog(stationLog({ level, roastedOn: "2026-10-08", name: "station-test" }));
      const endAt = Math.round(3 * (stationEndTemp(level) - 20));
      expect(log.markers.roast_end, `roast_end at level ${level}`).toBe(endAt);
      const atEnd = roast(level).samples.find((s) => s.t === endAt);
      expect(atEnd?.beanTemp, `end temperature at level ${level}`).toBeCloseTo(stationEndTemp(level), 0);
    }
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

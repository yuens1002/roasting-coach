// The dev station's pure parts: where its throwaway database and files live, and made-up roast logs for
// it. Nothing here touches a database or the disk, so tests can import it. The station never uses the
// app's own database (roast_copilot) or the roaster's folders (profiles/): see station.ts.
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { levelToTemp, parseKpro } from "../src/adapters/kaffelogic/parse.js";
import { PROFILE } from "../test/syntheticLog.js";

/** The only database the station may create, drop or write to. A plain lower-case name, so it is safe as an SQL identifier. */
export const STATION_DB = "roast_station";
if (!/^[a-z][a-z_]*$/.test(STATION_DB)) throw new Error("STATION_DB must be a plain lower-case name.");
const STATION_FOLDER = "roasting-coach-station";
/** The only folder the station may empty. Scratch space: made-up logs, the library it reads and the profiles it writes. */
export const STATION_DIR = join(tmpdir(), STATION_FOLDER);
/** The folders inside it: the library the CLI reads, where it writes profiles, and the made-up logs. */
export const STATION_SUBDIRS = { library: "library", out: "out", logs: "logs" } as const;

const withDatabase = (appUrl: string, database: string) => {
  const url = new URL(appUrl);
  url.pathname = `/${database}`;
  return url.toString();
};

/** The app's server and credentials with the station's database name. */
export const stationUrl = (appUrl: string) => withDatabase(appUrl, STATION_DB);
/** The server's maintenance database, from which the station database is dropped and created. */
export const maintenanceUrl = (appUrl: string) => withDatabase(appUrl, "postgres");

/**
 * Refuses any connection string that is not the station's database, before anything is dropped or written: a
 * postgres:// URL whose path is exactly the station's database and whose query names no other database.
 */
export function assertStationUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") throw new Error(`Refusing to touch ${parsed.protocol}// connections: the station uses a postgres:// URL.`);
  if (parsed.searchParams.has("db") || parsed.searchParams.has("database")) throw new Error("Refusing a connection string that names a database in its query: the station's database is set by its path.");
  if (parsed.pathname !== `/${STATION_DB}`) throw new Error(`Refusing to touch ${parsed.pathname.slice(1) || "the default database"}: the station only uses ${STATION_DB}.`);
}

/** Refuses to empty any folder but the station's own scratch folder. */
export function assertStationDir(dir: string): void {
  if (resolve(dir) !== resolve(tmpdir(), STATION_FOLDER)) throw new Error(`Refusing to empty ${dir}: the station only empties its own folder in the system temp folder.`);
}

/** What the CLI reads to find its database and folders; set these and `scripts/roast.ts` runs against the station. */
export const stationEnv = (appUrl: string): Record<string, string> => ({
  DATABASE_URL: stationUrl(appUrl),
  KAFFELOGIC_DIR: join(STATION_DIR, STATION_SUBDIRS.library),
  KAFFELOGIC_OUT_DIR: join(STATION_DIR, STATION_SUBDIRS.out),
});

const TEST_PROFILE = parseKpro(PROFILE);

/** The end temperature the made-up profile reaches at a level. */
export const stationEndTemp = (level: number): number => {
  const temp = levelToTemp(TEST_PROFILE.roastLevels, level);
  if (temp === undefined) throw new Error(`No end temperature for level ${level}.`);
  return temp;
};

/**
 * A made-up roast log on the made-up profile "Test line" at a level: the bean temperature rises 1 °C every 3 s from
 * 20 °C to the level's end temperature, then the log cools. A higher level ends hotter and later, so its thermal dose
 * is higher, which is what lets a scripted session step the level up and down. Made-up data; never a Kaffelogic file.
 */
export function stationLog(opts: { level: number; roastedOn: string; name: string }): string {
  const { level, roastedOn, name } = opts;
  const end = stationEndTemp(level);
  const endAt = Math.round(3 * (end - 20));
  const markers: Record<string, number> = { colour_change: Math.round(endAt * 0.62), first_crack: Math.round(endAt * 0.9), roast_end: endAt };
  const [y, m, d] = roastedOn.split("-");
  const rows: string[] = [];
  for (let t = 0; t <= endAt + 40; t++) {
    const temp = t <= endAt ? 20 + t / 3 : end - (t - endAt) * 2;
    rows.push([t, temp, temp, temp, Math.min(20 + t / 3, end), 20, 20, 20, 1, 14700].join("\t") + "\t");
    // Real logs write markers a few seconds after the event.
    for (const [marker, at] of Object.entries(markers)) if (at + 5 === t) rows.push(`!${marker}:${at}`);
  }
  return [
    `log_file_name:${name}.klog`,
    `roast_date:${d}/${m}/${y} 09:30:00 UTC`,
    `roasting_level:${level}`,
    "boost_load_size:120",
    "ambient_temperature:21.5",
    PROFILE,
    "",
    "offsets\t0\t0\t0\t0\t0\t0\t0\t0\t0",
    "time\t#spot_temp\t#=temp\t=mean_temp\t=profile\tprofile_ROR\t=actual_ROR\t#=desired_ROR\tpower_kW\t#^actual_fan_RPM",
    ...rows,
  ].join("\n");
}

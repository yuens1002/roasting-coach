// The dev station's pure parts: where its throwaway database and files live, and made-up roast logs for
// it. Nothing here touches a database or the disk, so tests can import it. The station never uses the
// app's own database (roast_copilot) and writes nothing to the roaster's folders (profiles/): see station.ts.
import { tmpdir } from "node:os";
import pg from "pg";
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
  // And the database pg itself would open, which is what counts.
  const { database } = dialTarget(url);
  if (database !== STATION_DB) throw new Error(`Refusing to touch ${database || "the default database"}: the station only uses ${STATION_DB}.`);
}

/** The comment the station puts on the database it creates; a database without it was not made by the station. */
export const STATION_DB_COMMENT = "roasting-coach dev station: made by npm run station, safe to drop and recreate";
// It is written into an SQL statement that takes no parameters, so a quote or backslash would break that statement and
// leave a database the station then refuses to drop.
if (/['\\]/.test(STATION_DB_COMMENT)) throw new Error("STATION_DB_COMMENT must contain no quote or backslash.");
/** The file the station puts in its scratch folder; a non-empty folder without it was not made by the station. */
export const STATION_DIR_MARKER = ".roasting-coach-station";

/**
 * The database is the station's to drop only if it does not exist yet or carries the station's comment. A database
 * of the same name made by anyone else (on any server DATABASE_URL points at) is refused, not dropped.
 */
export function assertStationOwnsDatabase(existing: { comment: string | null } | undefined): void {
  if (existing && existing.comment !== STATION_DB_COMMENT) {
    throw new Error(
      `The database ${STATION_DB} already exists and was not made by the station (its comment is ${JSON.stringify(existing.comment)}), so it is not dropped. If it is yours to delete, drop it yourself and run the station again.`,
    );
  }
}

/** The folder is the station's to empty only if it is empty, missing, or holds the station's marker file. */
export function assertStationOwnsDir(dir: string, entries: string[] | undefined): void {
  if (entries && entries.length > 0 && !entries.includes(STATION_DIR_MARKER)) {
    throw new Error(`${dir} already holds files the station did not make (no ${STATION_DIR_MARKER} file), so it is not emptied. Move them away and run the station again.`);
  }
}

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "::1"];

/**
 * The host and database the pg client would really use for a connection string. Not the URL's own hostname and path:
 * pg lets query parameters such as `?host=` override the host, so only its own reading says where a connection goes.
 * Creating the client does not connect.
 */
function dialTarget(connectionString: string): { host: string; database: string } {
  const client = new pg.Client({ connectionString });
  return { host: String(client.host ?? "").toLowerCase(), database: String(client.database ?? "") };
}

/**
 * The station creates and drops a database, so it only runs against a server on this machine: localhost, 127.0.0.1,
 * [::1] or a local socket path, as pg reads the connection string (a `?host=` query counts). Another server is refused
 * unless the person names that exact host in STATION_ALLOW_HOST, on the command line. Checked on the app's connection
 * string, before any connection is made.
 */
export function assertLocalServer(appUrl: string, allowHost: string | undefined = process.env.STATION_ALLOW_HOST): void {
  const { host } = dialTarget(appUrl);
  if (host.startsWith("/") || LOOPBACK_HOSTS.includes(host)) return;
  if (host && allowHost && allowHost.toLowerCase() === host) {
    console.error(`Running the station against ${host} because STATION_ALLOW_HOST names it.`);
    return;
  }
  throw new Error(
    `Refusing to run the station against ${host || "an unnamed host"}: it creates and drops a database, so it only runs on this machine (localhost, 127.0.0.1, [::1] or a local socket).${host ? ` To use another server on purpose, set STATION_ALLOW_HOST=${host} on the command line.` : ""}`,
  );
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

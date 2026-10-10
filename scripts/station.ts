// The dev station: try the current build against a throwaway database and a fresh session, whenever a rule,
// message or form changes. It never touches the app's own database (roast_copilot) and writes nothing to the
// roaster's folders; `start` only reads the profile files in profiles/.
//
//   npm run station            empty the station and start Claude Code on it, with a new user's data (run it in its own terminal)
//   npm run station:check      replay a scripted roasting session through the real CLI and check each answer
//   npm run station:beans      list what the station has recorded
//   npm run station:reset      empty the station (a fresh database and fresh scratch folders), nothing else
//
// Needs the docker-compose database running (`npm run db:up`). The station's database is `roast_station` on the
// same server; its scratch folders are under the system temp folder. The replay uses made-up logs only; `start` copies
// the roaster's own stock profiles in and nothing else.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import pg from "pg";
import { DATABASE_URL } from "./db.js";
import { ROOT } from "./env.js";
import type { OutcomeId } from "../src/core/rules.js";
import { migrate } from "./migrate.js";
import {
  STATION_DB,
  STATION_DB_COMMENT,
  STATION_DIR,
  STATION_DIR_MARKER,
  STATION_SUBDIRS,
  assertStationDir,
  assertLocalServer,
  assertStationOwnsDatabase,
  assertStationOwnsDir,
  assertStationUrl,
  maintenanceUrl,
  stationEnv,
  stationLog,
  stationUrl,
} from "./stationKit.js";

type Out = Record<string, unknown>;

/** Empties the station: its database is dropped and made again, with every migration applied, and its folders are made new. */
async function reset(): Promise<void> {
  assertLocalServer(DATABASE_URL);
  const target = stationUrl(DATABASE_URL);
  assertStationUrl(target);
  assertStationDir(STATION_DIR);
  // Ownership is checked before anything is dropped or emptied, so a refusal changes nothing.
  assertStationOwnsDir(STATION_DIR, existsSync(STATION_DIR) ? readdirSync(STATION_DIR) : undefined);
  const admin = new pg.Client({ connectionString: maintenanceUrl(DATABASE_URL) });
  admin.on("error", () => {});
  await admin.connect();
  try {
    const existing = await admin.query<{ comment: string | null }>("select shobj_description(oid, 'pg_database') as comment from pg_database where datname = $1", [STATION_DB]);
    assertStationOwnsDatabase(existing.rows[0]);
    // STATION_DB is a plain lower-case name (checked where it is defined), so it is safe as a quoted identifier.
    await admin.query(`drop database if exists "${STATION_DB}" with (force)`);
    await admin.query(`create database "${STATION_DB}"`);
    await admin.query(`comment on database "${STATION_DB}" is '${STATION_DB_COMMENT}'`);
  } finally {
    await admin.end();
  }
  const client = new pg.Client({ connectionString: target });
  client.on("error", () => {});
  await client.connect();
  try {
    await migrate(client);
  } finally {
    await client.end();
  }
  rmSync(STATION_DIR, { recursive: true, force: true });
  for (const sub of Object.values(STATION_SUBDIRS)) mkdirSync(join(STATION_DIR, sub), { recursive: true });
  writeFileSync(join(STATION_DIR, STATION_DIR_MARKER), "Made by npm run station in roasting-coach. Safe to delete.\n");
}

/** One command of the real CLI (`scripts/roast.ts`), run in a child process against the station. */
function cli(command: string, input?: unknown): { ok: boolean; out: Out } {
  const args = ["--import", "tsx", join(ROOT, "scripts", "roast.ts"), command];
  if (input !== undefined) args.push(typeof input === "string" ? input : JSON.stringify(input));
  const r = spawnSync(process.execPath, args, { cwd: ROOT, env: { ...process.env, ...stationEnv(DATABASE_URL) }, encoding: "utf8" });
  if (r.error) throw r.error;
  let out: Out;
  try {
    const parsed: unknown = JSON.parse(r.stdout);
    out = parsed && typeof parsed === "object" ? (parsed as Out) : { unreadable: r.stdout.slice(0, 600) };
  } catch {
    out = { unreadable: (r.stdout + r.stderr).slice(0, 600) };
  }
  return { ok: r.status === 0, out };
}

const at = (value: unknown, path: string): unknown => path.split(".").reduce<unknown>((v, key) => (v && typeof v === "object" ? (v as Out)[key] : undefined), value);

// --- the scripted session -----------------------------------------------------------------------------------------

interface Step {
  /** What the roaster is doing, in plain words. */
  does: string;
  /** The command, and its input (a function of what earlier steps returned). */
  run: (state: State) => { command: string; input?: unknown };
  /** Thrown on the first thing that is not as the rulebook says. */
  check: (out: Out, ok: boolean, state: State) => void;
}

interface State {
  beanId: number;
  flatBeanId: number;
  /** The `onYes` of the last advise, if it had one. */
  onYes?: { command: string; input: unknown };
  /** The level of the newest version. */
  level: number;
}

/** The answer's rule id must be one the engine can give, so a renamed outcome fails the typecheck, not just a run. */
const expectRule = (out: Out, want: OutcomeId) => expectEqual("rule", at(out, "advice.ruleId"), want);
const expectEqual = (what: string, got: unknown, want: unknown) => {
  if (got !== want) throw new Error(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
};
const expectIncludes = (what: string, got: unknown, part: string) => {
  if (typeof got !== "string" || !got.includes(part)) throw new Error(`${what}: expected text containing ${JSON.stringify(part)}, got ${JSON.stringify(got)}`);
};

const logPath = (name: string) => join(STATION_DIR, "logs", `${name}.klog`);
const writeLog = (name: string, level: number, roastedOn: string) => {
  const path = logPath(name);
  writeFileSync(path, stationLog({ level, roastedOn, name }));
  return path;
};
const weights = { greenG: 120, roastedG: 102 };

const SCENARIO: Step[] = [
  {
    does: "describes a new washed bean (no question about how it will be brewed)",
    run: () => ({ command: "bean:add", input: { name: "Station washed", species: "arabica", decaf: false, process: "washed", drinkWhen: "soon", altitudeM: 1900 } }),
    check: (out, ok, state) => {
      expectEqual("bean:add succeeded", ok, true);
      expectEqual("starting profile", at(out, "version.profileName"), "KL Washed");
      expectEqual("starting level", at(out, "version.level"), 0.8);
      state.beanId = Number(out.beanId);
    },
  },
  {
    does: "is refused when a brewing goal is given: the roast is not aimed at a brew method",
    run: () => ({ command: "bean:add", input: { name: "Goal given", species: "arabica", decaf: false, process: "washed", drinkWhen: "soon", goal: "espresso" } }),
    check: (out, ok) => {
      expectEqual("bean:add refused", ok, false);
      expectIncludes("refusal", JSON.stringify(out.errors), '\\"goal\\" is not a field');
    },
  },
  {
    does: "roasts it (a made-up log at level 3.3 on the made-up profile) and records the log",
    run: (s) => ({ command: "roast:add", input: { beanId: s.beanId, klogPath: writeLog("roast-1", 3.3, "2026-10-01"), answers: weights } }),
    check: (out, ok) => {
      expectEqual("roast:add succeeded", ok, true);
      expectIncludes("version change", out.versionChange, "Test line at level 3.3");
    },
  },
  {
    does: "is refused when the tasting is an espresso shot: tastings are of filter coffee",
    run: (s) => ({ command: "taste:add", input: { beanId: s.beanId, answers: { tastedOn: "2026-10-05", brew: "espresso", quality: 2, taste: ["sour", "grassy"] } } }),
    check: (out, ok) => {
      expectEqual("taste:add refused", ok, false);
      expectIncludes("refusal", JSON.stringify(out.errors), "isn't an option");
    },
  },
  {
    does: "tastes it four days later as a pour over: sour and grassy, roast quality 2",
    run: (s) => ({ command: "taste:add", input: { beanId: s.beanId, answers: { tastedOn: "2026-10-05", brew: "pourover", quality: 2, taste: ["sour", "grassy"] } } }),
    check: (_out, ok) => expectEqual("taste:add succeeded", ok, true),
  },
  {
    does: "asks what to change",
    run: (s) => ({ command: "advise", input: String(s.beanId) }),
    check: (out, ok, state) => {
      expectEqual("advise succeeded", ok, true);
      expectRule(out, "under-roasted");
      expectIncludes("say", out.say, "Roast about 15% more.");
      if (!out.onYes) throw new Error("a change has to carry an onYes");
      state.onYes = out.onYes as State["onYes"];
    },
  },
  {
    does: "says yes: the session records the version the engine handed it",
    run: (s) => ({ command: s.onYes!.command, input: s.onYes!.input }),
    check: (out, ok, state) => {
      expectEqual("version:add succeeded", ok, true);
      expectEqual("version number", at(out, "version.number") ?? out.number, 2);
      state.level = Number(at(out, "version.level") ?? out.level);
      if (!(state.level > 3.3)) throw new Error(`a step of more roasting is a level above 3.3; got ${state.level}`);
    },
  },
  {
    does: "roasts v2 at that level",
    run: (s) => ({ command: "roast:add", input: { beanId: s.beanId, klogPath: writeLog("roast-2", s.level, "2026-10-08"), answers: weights } }),
    check: (out, ok) => {
      expectEqual("roast:add succeeded", ok, true);
      expectEqual("recorded on v2", out.version, 2);
    },
  },
  {
    does: "tastes v2 as an immersion brew: bitter and ashy, roast quality 2",
    run: (s) => ({ command: "taste:add", input: { beanId: s.beanId, answers: { tastedOn: "2026-10-12", brew: "immersion", quality: 2, taste: ["bitter", "ashy"] } } }),
    check: (_out, ok) => expectEqual("taste:add succeeded", ok, true),
  },
  {
    does: "asks again: one roast tasted sour, the next bitter, so the answer goes halfway between them",
    run: (s) => ({ command: "advise", input: String(s.beanId) }),
    check: (out, ok, state) => {
      expectEqual("advise succeeded", ok, true);
      expectRule(out, "over-roasted-bracketed");
      if (!out.onYes) throw new Error("a change has to carry an onYes");
      state.onYes = out.onYes as State["onYes"];
    },
  },
  {
    does: "says yes to the halfway step, and the session records v3",
    run: (s) => ({ command: s.onYes!.command, input: s.onYes!.input }),
    check: (out, ok, state) => {
      expectEqual("version:add succeeded", ok, true);
      expectEqual("version number", at(out, "version.number") ?? out.number, 3);
      state.level = Number(at(out, "version.level") ?? out.level);
    },
  },
  {
    does: "roasts v3",
    run: (s) => ({ command: "roast:add", input: { beanId: s.beanId, klogPath: writeLog("roast-3", s.level, "2026-10-15"), answers: weights } }),
    check: (out, ok) => {
      expectEqual("roast:add succeeded", ok, true);
      expectEqual("recorded on v3", out.version, 3);
    },
  },
  {
    does: "tastes v3 as an AeroPress: sweet and balanced, roast quality 4",
    run: (s) => ({ command: "taste:add", input: { beanId: s.beanId, answers: { tastedOn: "2026-10-19", brew: "aeropress", quality: 4, taste: ["sweet", "balanced"] } } }),
    check: (_out, ok) => expectEqual("taste:add succeeded", ok, true),
  },
  {
    does: "asks again: a clean cup at the bar is left alone, with nothing to record",
    run: (s) => ({ command: "advise", input: String(s.beanId) }),
    check: (out, ok) => {
      expectEqual("advise succeeded", ok, true);
      expectRule(out, "keep-as-is");
      if (out.onYes) throw new Error("a hold must not carry an onYes");
    },
  },
  {
    does: "describes a second bean (Robusta) and roasts it",
    run: () => ({ command: "bean:add", input: { name: "Station flat", species: "robusta", decaf: false, process: "unknown", drinkWhen: "soon" } }),
    check: (out, ok, state) => {
      expectEqual("bean:add succeeded", ok, true);
      expectEqual("starting profile", at(out, "version.profileName"), "Robusta");
      state.flatBeanId = Number(out.beanId);
    },
  },
  {
    does: "roasts it",
    run: (s) => ({ command: "roast:add", input: { beanId: s.flatBeanId, klogPath: writeLog("flat-1", 3.0, "2026-10-02"), answers: weights } }),
    check: (_out, ok) => expectEqual("roast:add succeeded", ok, true),
  },
  {
    does: "tastes it: flat, no roast defect, roast quality 3",
    run: (s) => ({ command: "taste:add", input: { beanId: s.flatBeanId, answers: { tastedOn: "2026-10-06", brew: "pourover", quality: 3, taste: ["flat"] } } }),
    check: (_out, ok) => expectEqual("taste:add succeeded", ok, true),
  },
  {
    does: "asks what to change: nothing for the level to fix, so the answer lists the levers that change the roast",
    run: (s) => ({ command: "advise", input: String(s.flatBeanId) }),
    check: (out, ok) => {
      expectEqual("advise succeeded", ok, true);
      expectRule(out, "clean-below-bar");
      for (const lever of ["- level (", "- profile (", "- curve ("]) expectIncludes("lever ledger", out.say, lever);
      if (/- (rest|brew) \(/.test(String(out.say))) throw new Error("rest and brew are not levers");
    },
  },
];

async function replay(): Promise<void> {
  await reset();
  console.log(`Station ready: database ${new URL(stationUrl(DATABASE_URL)).pathname.slice(1)}, files in ${STATION_DIR}\n`);
  const state: State = { beanId: 0, flatBeanId: 0, level: 0 };
  SCENARIO.forEach((step, i) => {
    const { command, input } = step.run(state);
    console.log(`${String(i + 1).padStart(2)}. The roaster ${step.does}.`);
    console.log(`    $ roast.ts ${command}${typeof input === "string" ? ` ${input}` : input === undefined ? "" : ` ${JSON.stringify(input).slice(0, 150)}`}`);
    const { ok, out } = cli(command, input);
    if (typeof out.say === "string") console.log(out.say.split("\n").map((l) => `    | ${l}`).join("\n"));
    try {
      step.check(out, ok, state);
      console.log("    ok");
    } catch (e) {
      console.log(`    FAIL: ${(e as Error).message}`);
      console.log(`    output: ${JSON.stringify(out).slice(0, 400)}`);
      throw new Error(`Step ${i + 1} failed. Stopping: later steps depend on it.`);
    }
  });
  console.log(`\n${SCENARIO.length} steps, all as the rulebook says.`);
}

/**
 * Copies the roaster's profile files (the .kpro files at any depth in profiles/, as the library finds them, except the
 * generated out/ and logs/ folders) into the station's library with their relative paths, so a new bean finds its
 * starting profile as it would on a fresh install. Reads profiles/, never writes it.
 */
function copyStockProfiles(): number {
  const source = join(ROOT, "profiles");
  if (!existsSync(source)) return 0;
  const library = join(STATION_DIR, STATION_SUBDIRS.library);
  // statSync follows a symlink, so a symlinked profile counts and a folder named like a profile does not.
  const stock = (readdirSync(source, { recursive: true, encoding: "utf8" }) as string[]).filter(
    (file) => /\.kpro$/i.test(file) && !/^(out|logs)[\\/]/i.test(file) && statSync(join(source, file)).isFile(),
  );
  for (const file of stock) {
    const target = join(library, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(source, file), target);
  }
  return stock.length;
}

/** A command of the real CLI (`scripts/roast.ts`) run against the station with its output shown as it comes; a failure is thrown. */
function showCli(args: string[]): void {
  const run = spawnSync(process.execPath, ["--import", "tsx", join(ROOT, "scripts", "roast.ts"), ...args], { cwd: ROOT, env: { ...process.env, ...stationEnv(DATABASE_URL) }, stdio: "inherit" });
  if (run.error || run.status !== 0) {
    throw new Error(`\`roast.ts ${args.join(" ")}\` failed (${run.error ? run.error.message : `exit ${run.status ?? run.signal}`}), so what the station recorded could not be listed.`);
  }
}

/**
 * `npm run station`: starts Claude Code on a station holding what a new user would start with. The station is emptied
 * (an empty database, the profile files from profiles/ in the library, no made-up logs and no prompt) and `claude` is
 * started with the station's database and folders set for it, so nothing has to be typed or pasted. When Claude Code
 * exits, what it recorded is listed. Only the station's data is a new user's: the session itself still loads the
 * person's own Claude Code settings and this repository's local notes.
 */
async function start(): Promise<void> {
  // A Claude Code session started from inside another one, or with no terminal, cannot run; refuse before anything is dropped.
  if (process.env.CLAUDECODE || !process.stdin.isTTY) {
    throw new Error("`npm run station` starts Claude Code, so run it in a terminal of its own, not from inside a Claude Code session.");
  }
  await reset();
  const copied = copyStockProfiles();
  console.log(`Station ready: an empty database (${STATION_DB}) and ${copied} profile files copied from profiles/ (profiles/ itself is not changed).`);
  if (copied === 0) console.log("No profile files found in profiles/, so a new bean gets a warning instead of a profile file.");
  console.log("Starting Claude Code on it. Say something like: Use /roast, I have a new bean. Bring your own log paths.\n");
  const run = spawnSync("claude", [], { cwd: ROOT, env: { ...process.env, ...stationEnv(DATABASE_URL) }, stdio: "inherit", shell: process.platform === "win32" });
  // 127 and 9009 are the codes a shell gives for a command it cannot find.
  if (run.error || run.status === 127 || run.status === 9009) throw new Error("Could not start `claude`: is Claude Code installed and on your PATH?");
  console.log(run.signal ? `\nClaude Code was stopped (${run.signal}). What is recorded in the station:` : "\nClaude Code ended. What it recorded in the station:");
  showCli(["beans"]);
  console.log("\nRead the session against the /roast skill's own rules:");
  for (const line of WATCH_FOR) console.log(`  - ${line}`);
  console.log("\nnpm run station starts again from empty. npm run station:beans lists what is recorded now.");
}

/** What a fresh session has to do for the build to count as working; no script can check these, so the session is read by a person. */
const WATCH_FOR = [
  "It asks only for the required intake fields it was not told, and never asks how the coffee will be brewed.",
  "It shows the mapped answers before it runs bean:add, and it reports the starting profile, level and end temperature in plain words.",
  "It relays the engine's `say` exactly as written, and runs the `onYes` command exactly as given, only after a yes.",
  "If it is told a tasting was an espresso shot, it says tastings are of filter coffee and does not record another brew.",
  "It never writes SQL by hand and never invents a reason for a new version.",
];

const [command = "start"] = process.argv.slice(2);
try {
  if (command === "start") await start();
  else if (command === "check") await replay();
  else if (command === "beans") {
    assertLocalServer(DATABASE_URL);
    showCli(["beans"]);
  }
  else if (command === "reset") {
    await reset();
    console.log(`Station emptied: database ${STATION_DB} and ${STATION_DIR}.`);
  } else throw new Error(`Unknown station command "${command}". Use start, check, beans or reset.`);
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
}

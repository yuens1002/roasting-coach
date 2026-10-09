// The dev station: try the current build against a throwaway database and a fresh session, whenever a rule,
// message or form changes. It never touches the app's own database (roast_copilot) or the roaster's folders.
//
//   npm run station            replay a scripted roasting session through the real CLI and check each answer
//   npm run station:reset      empty the station (a fresh database and fresh scratch folders), nothing else
//   npm run station:session    reset, then print how to open a fresh Claude Code session against the station
//
// Needs the docker-compose database running (`npm run db:up`). The station's database is `roast_station` on the
// same server; its scratch folders are under the system temp folder. Made-up logs only.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

/** A value as a PowerShell single-quoted string (a quote inside is doubled) and as a bash single-quoted string. */
const quotePowerShell = (v: string) => `'${v.replace(/'/g, "''")}'`;
const quoteBash = (v: string) => `'${v.replace(/'/g, "'\\''")}'`;

async function session(): Promise<void> {
  await reset();
  writeLog("session-1", 3.3, "2026-10-01");
  writeLog("session-2", 3.6, "2026-10-08");
  const env = stationEnv(DATABASE_URL);
  const prompt = [
    "Use the /roast skill. I am a home roaster with a Kaffelogic Nano 7.",
    "I have a new washed coffee grown at about 1900 m, and I will drink it within a few days.",
    `I roasted it twice; the logs are ${logPath("session-1")} and ${logPath("session-2")}. Both used 120 g green and gave 102 g roasted.`,
    "Start by setting the bean up.",
  ].join(" ");
  const promptFile = join(STATION_DIR, "prompt.txt");
  writeFileSync(promptFile, prompt + "\n");
  console.log(`Station ready (database ${new URL(env.DATABASE_URL).pathname.slice(1)}, files in ${STATION_DIR}).`);
  console.log("\nOpen a fresh Claude Code session in this repository with these set, then paste the prompt in prompt.txt:\n");
  console.log("  PowerShell:");
  for (const [k, v] of Object.entries(env)) console.log(`    $env:${k} = ${quotePowerShell(v)}`);
  console.log(`    claude (Get-Content -Raw ${quotePowerShell(promptFile)})`);
  console.log("\n  bash:");
  console.log(`    ${Object.entries(env).map(([k, v]) => `${k}=${quoteBash(v)}`).join(" ")} claude "$(cat ${quoteBash(promptFile)})"`);
  console.log("\nThe session's commands (`npx tsx scripts/roast.ts ...`) then read and write the station only.");
  console.log("To see what it recorded, run `npx tsx scripts/roast.ts beans` with the same variables set. `npm run station:reset` starts again.");
  console.log("\nWhat to watch for in the session (the `/roast` skill's own rules):");
  for (const line of WATCH_FOR) console.log(`  - ${line}`);
}

/** What a fresh session has to do for the build to count as working; no script can check these, so the session is read by a person. */
const WATCH_FOR = [
  "It asks only for the required intake fields it was not told, and never asks how the coffee will be brewed.",
  "It shows the mapped answers before it runs bean:add, and it reports the starting profile, level and end temperature in plain words.",
  "It relays the engine's `say` exactly as written, and runs the `onYes` command exactly as given, only after a yes.",
  "If it is told a tasting was an espresso shot, it says tastings are of filter coffee and does not record another brew.",
  "It never writes SQL by hand and never invents a reason for a new version.",
];

const [command = "replay"] = process.argv.slice(2);
try {
  if (command === "replay") await replay();
  else if (command === "reset") {
    await reset();
    console.log(`Station emptied: database ${STATION_DB} and ${STATION_DIR}.`);
  } else if (command === "session") await session();
  else throw new Error(`Unknown station command "${command}". Use replay, reset or session.`);
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
}

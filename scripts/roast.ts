// The commands a Claude session calls to record roast projects. Input is JSON,
// inline or as a file path; output is JSON. Input mistakes exit 1 with
// {"errors": [...]} written for the person, so Claude can ask about them.
//
//   npx tsx scripts/roast.ts fields intake|roast|tasting
//   npx tsx scripts/roast.ts beans
//   npx tsx scripts/roast.ts bean:add    '{"name": "...", "species": "arabica", ...}'
//   npx tsx scripts/roast.ts roast:add   '{"beanId": 1, "version": 1, "klogPath": "C:/.../log0041.klog", "answers": {"greenG": 120, "roastedG": 102}}'
//   npx tsx scripts/roast.ts taste:add   '{"beanId": 1, "answers": {"tastedOn": "2026-10-08", ...}}'
//   npx tsx scripts/roast.ts version:add '{"beanId": 1, "level": 3.6, "reason": "..."}'   (same profile, new level)
//   npx tsx scripts/roast.ts version:add '{"beanId": 1, "profileName": "KL Washed", "level": 1.2, "reason": "..."}'
//   npx tsx scripts/roast.ts history 1
//   npx tsx scripts/roast.ts profile:write '{"beanId": 1, "version": 2}'   (a .kpro for that version, its level as the recommended level)
//   npx tsx scripts/roast.ts bean:update  '{"beanId": 1, "answers": {"sellerNotes": "..."}}'   (merged over the stored answers; null clears)
//   npx tsx scripts/roast.ts taste:update '{"tastingId": 2, "answers": {"quality": 3, "taste": ["flat"]}}'
//   npx tsx scripts/roast.ts thermal-dose '{"profile": "Robusta", "level": 3, "change": -15}'   (level for a thermal dose change, in %)
//   npx tsx scripts/roast.ts level-for '{"profile": "Robusta", "agtron": 65}'   (the level to try for an Agtron colour; records nothing)
//   npx tsx scripts/roast.ts advise 1   (the rule table's advice for the newest tasted roast, as a level when it is a change)
//   npx tsx scripts/roast.ts table 1   (the bean's table: each roast, how it tasted from uncooked to scorched, and where the bean stands)
//   npx tsx scripts/roast.ts calibration   (this roaster's settings and taste-word meanings, with the defaults)
//   npx tsx scripts/roast.ts calibration:set '{"settings": {"stepPct": 8}, "words": {"flat": "under", "sour": null}}'   (null: back to the default)
//   npx tsx scripts/roast.ts features:refresh   (recompute features of stored logs)
//   npx tsx scripts/roast.ts bean:remove 1   (only when the roaster asks; deletes its versions, roasts, tastings)
//   npx tsx scripts/roast.ts library   (the .kpro and .klog files in KAFFELOGIC_DIR)
//
// bean:add also writes the bean's own profile, "<bean name>.kpro", to KAFFELOGIC_OUT_DIR:
// the chosen stock profile renamed for the bean, curve unchanged. It needs that stock
// profile's .kpro (or a log roasted on it) in KAFFELOGIC_DIR; without one, v1 is the stock
// profile as is. Later level changes keep using the same profile.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseHeader, parseKpro, splitLines, timeCurveReaches } from "../src/adapters/kaffelogic/parse.js";
import { kaffelogicAdviceContext } from "../src/adapters/kaffelogic/adviceContext.js";
import { beanTable } from "../src/core/beanTable.js";
import { placeColour, placementSay } from "../src/adapters/kaffelogic/startingProfiles.js";
import { type LevelThermalDose, formatMinutesSeconds, levelAfterChange, profileThermalDoseAtLevel } from "../src/adapters/kaffelogic/thermalDose.js";
import { type ProfileLines, findBaseProfile, formatKpro, profileFromKpro, writeKpro } from "../src/adapters/kaffelogic/writeProfile.js";
import { describeCalibration, personalChanges, resolveCalibration } from "../src/core/calibration.js";
import { INTAKE_FIELDS, ROAST_FIELDS, TASTING_FIELDS } from "../src/core/intake.js";
import { type LevelMove, adviceReport, adviseFromHistory } from "../src/core/rules.js";
import { checkShape } from "../src/core/validate.js";
import { type Db, InputError, type NewRoast, type NewVersion, addBean, addRoast, addTasting, addVersion, beanHistory, changeCalibration, intakeFromBeanRow, listBeans, loadColourReadings, loadOverrides, NEW_ROAST_SHAPE, refreshFeatures, removeBean, updateBean, updateTasting, versionProfileFile } from "../src/db/store.js";
import { asDb, connect } from "./db.js";
import { KAFFELOGIC_DIR, KAFFELOGIC_OUT_DIR, loadLibrary, outPath } from "./library.js";

const FORMS = { intake: INTAKE_FIELDS, roast: ROAST_FIELDS, tasting: TASTING_FIELDS };
const [command, arg] = process.argv.slice(2);

function json(): Record<string, unknown> {
  if (!arg) throw new InputError([`${command} needs JSON, inline or as a file path.`]);
  const inline = arg.trimStart().startsWith("{");
  if (!inline && !existsSync(arg)) throw new InputError([`No file at ${arg}, and it isn't inline JSON either.`]);
  try {
    return JSON.parse(inline ? arg : readFileSync(arg, "utf8"));
  } catch (e) {
    throw new InputError([`That isn't valid JSON: ${(e as Error).message}`]);
  }
}

/** The bean id given as the command's argument. */
function beanIdArg(): number {
  const n = Number(arg);
  if (!Number.isInteger(n) || n < 1) throw new InputError([`${command} needs a bean id (a whole number); got ${arg === undefined ? "nothing" : JSON.stringify(arg)}.`]);
  return n;
}

const print = (v: unknown) => console.log(JSON.stringify(v, null, 2));

/** When a profile's curve reaches an end temperature, m:ss: a level worked out from an Agtron colour is not in the table of stock levels, so it is read off the profile's own curve. */
function curveReachesAt(lines: ProfileLines, endTempC: number): string | undefined {
  const seconds = timeCurveReaches(parseKpro(formatKpro(lines)).roastCurve, endTempC);
  return seconds === undefined ? undefined : formatMinutesSeconds(seconds);
}

const levelShape = (d: LevelThermalDose) => ({ level: d.level, endTempC: Math.round(d.endTemp * 10) / 10, endsAt: formatMinutesSeconds(d.endsAt), thermalDose: Math.round(d.thermalDose * 100) / 100 });

/** The profile a version was roasted with: its stored .kpro, else the roaster's copy of its stock profile. */
async function versionBase(db: Db, beanId: number, v: { number: number; profileName: string }) {
  const stored = await versionProfileFile(db, beanId, v.number);
  return stored ? { lines: profileFromKpro(stored), path: `v${v.number}'s stored profile` } : findBaseProfile(loadLibrary(), { name: v.profileName });
}

async function run() {
  if (command === "library") {
    return {
      dir: KAFFELOGIC_DIR,
      out: KAFFELOGIC_OUT_DIR,
      files: loadLibrary().map((f) => {
        const h = parseHeader(splitLines(f.text)).header;
        const isLog = h.log_file_name !== undefined || h.roasting_level !== undefined;
        return { path: f.path, kind: isLog ? "klog" : "kpro", profile: h.profile_short_name?.trim(), modified: h.profile_modified?.trim(), level: isLog ? Number(h.roasting_level) : undefined, roastDate: h.roast_date?.trim() };
      }),
    };
  }
  if (command === "thermal-dose") {
    // A profile's thermal dose at a level, and (with change, in %) the level that changes it by that much.
    const input = json();
    const shapeErrors = checkShape(input, { profile: { type: "string", required: true }, level: { type: "number", required: true }, change: { type: "number" } });
    if (shapeErrors.length) throw new InputError(shapeErrors);
    const { profile: name, level, change } = input as { profile: string; level: number; change?: number };
    if (level < 0 || level > 6) throw new InputError([`Level must be between 0 and 6; got ${level}.`]);
    if (change !== undefined && change <= -100) throw new InputError([`A change of ${change}% would leave no roasting at all; use a value above -100.`]);
    const base = findBaseProfile(loadLibrary(), { name });
    if (!base) throw new InputError([`No copy of "${name}" in ${KAFFELOGIC_DIR} (its .kpro, or a log roasted on it).`]);
    const profile = parseKpro(formatKpro(base.lines));
    const now = profileThermalDoseAtLevel(profile, level);
    if (!now) throw new InputError([`"${name}" never reaches level ${level}'s end temperature.`]);
    if (change === undefined) return { profile: name, ...levelShape(now) };
    const next = levelAfterChange(profile, now, change);
    if (!next) throw new InputError([`No level on "${name}" gives that thermal dose.`]);
    return { profile: name, from: levelShape(now), to: { ...levelShape(next), changePct: Math.round((next.thermalDose / now.thermalDose - 1) * 1000) / 10 } };
  }
  if (command === "fields") {
    const form = FORMS[arg as keyof typeof FORMS];
    if (!form) throw new InputError([`Which form? One of: ${Object.keys(FORMS).join(", ")}.`]);
    return form;
  }
  const client = await connect();
  const db = asDb(client);
  try {
    switch (command) {
      case "beans":
        return await listBeans(db);
      case "bean:add": {
        const library = loadLibrary();
        let file = undefined as { path: string; text: string; builtFrom: string } | undefined;
        const warnings: string[] = [];
        let endsAtFromFile: string | undefined;
        const input = json();
        // The profile file is written before the database insert, never over an existing file, and
        // removed again if the insert then fails: the database never claims a file that isn't there.
        try {
          const result = await addBean(db, input, (start) => {
            const base = findBaseProfile(library, { name: start.stockName });
            if (!base) {
              warnings.push(`No copy of "${start.stockName}" in ${KAFFELOGIC_DIR} (its .kpro, or a log roasted on it), so no profile file was written. Use the stock profile on the Nano.`);
              return undefined;
            }
            endsAtFromFile = curveReachesAt(base.lines, start.endTempC);
            const profileName = start.beanName;
            const description = [
              `${profileName}: ${start.stockName} for this bean, written by roasting-coach. Curve and settings are unchanged.`,
              `Set level ${start.level} (ends at ${start.endTempC} °C).`,
              ...start.why,
            ].join("\n");
            const text = writeKpro(base.lines, { shortName: profileName, description });
            const path = outPath(profileName);
            try {
              mkdirSync(dirname(path), { recursive: true });
              writeFileSync(path, text, { flag: "wx" });
            } catch (e) {
              throw new InputError([`Couldn't write ${path}: ${(e as Error).message}`]);
            }
            file = { path, text, builtFrom: base.path };
            return { profileName, profileFile: text };
          });
          return { ...result, endsAt: endsAtFromFile, profile: file ? { written: file.path, builtFrom: file.builtFrom } : undefined, warnings };
        } catch (e) {
          if (file) rmSync(file.path, { force: true });
          throw e;
        }
      }
      case "level-for": {
        // The level to try for an Agtron colour on a stock profile, using this roaster's colour readings where they give a line. Records nothing:
        // the roaster says yes, and version:add records it with their own words as the reason.
        const input = json();
        const shapeErrors = checkShape(input, { profile: { type: "string", required: true }, agtron: { type: "number", required: true } });
        if (shapeErrors.length) throw new InputError(shapeErrors);
        const { profile: name, agtron } = input as { profile: string; agtron: number };
        const placed = placeColour(name, agtron, await loadColourReadings(db));
        if (!placed.ok) throw new InputError([placed.problem]);
        const base = findBaseProfile(loadLibrary(), { name: placed.profile.name });
        const endsAt = base ? curveReachesAt(base.lines, placed.level.endTemp) : undefined;
        const { level, endTemp, colour } = placed.level;
        return {
          profile: placed.profile.name,
          agtron,
          level,
          endTempC: endTemp,
          endsAt,
          basis: colour.basis,
          readings: colour.readings,
          say: placementSay(placed, endsAt),
        };
      }
      case "version:add":
        return await addVersion(db, json() as unknown as NewVersion);
      case "roast:add": {
        // The log comes as a path, never inline; every other key is checked by the store.
        const input = json();
        const { klog: _inline, ...fromPath } = NEW_ROAST_SHAPE;
        const errors = checkShape(input, { ...fromPath, klogPath: { type: "string" } });
        if (errors.length) throw new InputError(errors);
        const { klogPath, ...rest } = input as { klogPath?: string } & Record<string, unknown>;
        if (klogPath !== undefined && !existsSync(klogPath)) throw new InputError([`No file at ${klogPath}.`]);
        return await addRoast(db, { ...rest, klog: klogPath === undefined ? undefined : readFileSync(klogPath, "utf8") } as unknown as NewRoast, loadLibrary());
      }
      case "taste:add":
        return await addTasting(db, json() as never);
      case "history":
        return await beanHistory(db, beanIdArg());
      case "table": {
        // The bean's own table, built from its recorded roasts and tastings the way the advice reads them.
        const history = await beanHistory(db, beanIdArg());
        const context = kaffelogicAdviceContext(intakeFromBeanRow(history.bean), await loadColourReadings(db));
        const { rows, levelChangesMade, say } = beanTable(history, context, resolveCalibration(await loadOverrides(db)));
        return { say, levelChangesMade, rows };
      }
      case "advise": {
        // The rule table's answer for the bean's newest tasted roast, finished: `say` is the whole
        // reply for the roaster and `onYes` the exact command to run if they agree. The advice is the
        // rules' alone; nothing is left for the session to interpret or add.
        const beanId = beanIdArg();
        const history = await beanHistory(db, beanId);
        // The roaster's own settings and taste-word meanings, where they've set any; `personal` lists them so the answer can be audited.
        const overrides = await loadOverrides(db);
        const result = adviseFromHistory(history, kaffelogicAdviceContext(intakeFromBeanRow(history.bean), await loadColourReadings(db)), resolveCalibration(overrides));
        if (!result) throw new InputError([`Bean ${arg} has no tasted roast with a measured thermal dose yet. Record a roast and a tasting first.`]);
        const { basedOn, advice } = result;
        const personal = personalChanges(overrides);
        const done = (move?: LevelMove, problem?: string) => ({ basedOn, advice, ...(personal.length ? { personal } : {}), ...(move ? { move } : {}), ...adviceReport(beanId, result, move, problem) });
        if (advice.kind !== "change") return done();
        const version = history.versions.find((v) => v.number === basedOn.version)!;
        const level = basedOn.level ?? version.level;
        const base = await versionBase(db, beanId, version);
        if (!base) return done(undefined, `v${version.number}'s profile "${version.profileName}" isn't stored and has no copy in ${KAFFELOGIC_DIR}, so I can't turn that into a level.`);
        const profile = parseKpro(formatKpro(base.lines));
        const now = profileThermalDoseAtLevel(profile, level);
        const next = now && levelAfterChange(profile, now, advice.thermalDoseChangePct);
        if (!now || !next) return done(undefined, `"${version.profileName}" has no level that matches that change from level ${level}.`);
        const move: LevelMove = { from: { level: now.level, endTempC: levelShape(now).endTempC }, to: { level: next.level, endTempC: levelShape(next).endTempC }, changePct: (next.thermalDose / now.thermalDose - 1) * 100 };
        if (next.level === now.level) return done(move, `Level ${level} is already the closest the machine can set (0.1 steps), so this change is too small or past the end of the scale. The next lever is the profile itself.`);
        return done(move);
      }
      case "calibration":
        return describeCalibration(await loadOverrides(db));
      case "calibration:set":
        return await changeCalibration(db, json());
      case "bean:update":
        return await updateBean(db, json() as never);
      case "taste:update":
        return await updateTasting(db, json() as never);
      case "profile:write": {
        // A .kpro for one version, to load onto the machine: the version's own profile (or the
        // roaster's copy of its stock profile) under a new name, with the version's level as the
        // level the machine offers first. Curve and settings are unchanged, so a roast on this file
        // still counts as the same profile.
        const input = json();
        const errors = checkShape(input, { beanId: { type: "integer", required: true }, version: { type: "integer" }, name: { type: "string" } });
        if (errors.length) throw new InputError(errors);
        const { beanId, version: number, name } = input as { beanId: number; version?: number; name?: string };
        const history = await beanHistory(db, beanId);
        const v = number === undefined ? history.versions[history.versions.length - 1] : history.versions.find((x) => x.number === number);
        if (!v) throw new InputError([`Bean ${beanId} has no v${number}.`]);
        const base = await versionBase(db, beanId, v);
        if (!base) throw new InputError([`v${v.number}'s profile "${v.profileName}" isn't stored and has no copy in ${KAFFELOGIC_DIR}, so there's nothing to write from.`]);
        const beanName = String(history.bean.name);
        const profileName = (name ?? `${beanName} ${v.level}`).trim();
        if (!profileName || /[\r\n]/.test(profileName)) throw new InputError(["The profile name must be one line of text."]);
        const description = [
          `${profileName}: v${v.number} of ${beanName}, level ${v.level} (ends at ${v.endTempC} °C), written by roasting-coach. Curve and settings are those of ${v.profileName}.`,
          v.changeReason ?? "",
        ].filter(Boolean).join("\n");
        const text = writeKpro(base.lines, { shortName: profileName, description, recommendedLevel: v.level });
        const path = outPath(profileName);
        try {
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, text, { flag: "wx" });
        } catch (e) {
          throw new InputError([`Couldn't write ${path}: ${(e as Error).message}`]);
        }
        return { written: path, profileName, version: v.number, level: v.level, endTempC: v.endTempC, builtFrom: base.path };
      }
      case "features:refresh":
        return await refreshFeatures(db);
      case "bean:remove":
        return await removeBean(db, beanIdArg());
      default:
        throw new InputError([`Unknown command "${command}". Commands: fields, library, thermal-dose, level-for, advise, table, calibration, calibration:set, beans, profile:write, bean:add, bean:update, bean:remove, version:add, roast:add, taste:add, taste:update, history, features:refresh.`]);
    }
  } finally {
    await client.end();
  }
}

try {
  print(await run());
} catch (e) {
  if (!(e instanceof InputError)) throw e;
  print({ errors: e.errors });
  process.exitCode = 1;
}

// Writing the .kpro files the tool makes for a bean: the one at intake (bean:add) and the one for a version (profile:write). The
// names come from profileNames, never from the roaster. Files go to the output folder and never over an existing file.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { holdThermalDose, withRoastCurve } from "../src/adapters/kaffelogic/editCurve.js";
import { levelToTemp, parseKpro, timeCurveReaches } from "../src/adapters/kaffelogic/parse.js";
import { profileNames, profileRevision } from "../src/adapters/kaffelogic/profileNames.js";
import { curveThermalDoseTo, formatMinutesSeconds, profileThermalDoseAtLevel } from "../src/adapters/kaffelogic/thermalDose.js";
import { type KaffelogicFile, type ProfileLines, findBaseProfile, formatKpro, profileFromKpro, sameProfileBody, writeKpro } from "../src/adapters/kaffelogic/writeProfile.js";
import type { Intake } from "../src/core/intake.js";
import { checkShape } from "../src/core/validate.js";
import { type Db, InputError, addBean, beanHistory, versionProfileFile } from "../src/db/store.js";
import { outPath } from "./library.js";

/** Where the roaster's Kaffelogic files are read from and written to. */
export interface ProfileFileEnv {
  library: KaffelogicFile[];
  /** The library's folder, for messages. */
  libraryDir: string;
  outDir: string;
}

/** When a profile's curve reaches an end temperature, m:ss: a level worked out from an Agtron colour is not in the table of stock levels, so it is read off the profile's own curve. */
export function curveReachesAt(lines: ProfileLines, endTempC: number): string | undefined {
  const seconds = timeCurveReaches(parseKpro(formatKpro(lines)).roastCurve, endTempC);
  return seconds === undefined ? undefined : formatMinutesSeconds(seconds);
}

/** The profile a version was roasted with: its stored .kpro, else the roaster's copy of its stock profile. */
export async function versionBase(db: Db, beanId: number, v: { number: number; profileName: string }, library: KaffelogicFile[]) {
  const stored = await versionProfileFile(db, beanId, v.number);
  return stored ? { lines: profileFromKpro(stored), path: `v${v.number}'s stored profile` } : findBaseProfile(library, { name: v.profileName });
}

function writeFile(path: string, text: string) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, { flag: "wx" });
  } catch (e) {
    throw new InputError([`Couldn't write ${path}: ${(e as Error).message}`]);
  }
}

/**
 * bean:add: stores the bean with its starting profile as v1, and writes the bean's own profile file when the roaster's library has a
 * copy of the stock profile. The file is written after the bean is stored (its name carries the bean's number) and before the
 * version is, inside the transaction, and removed again if the insert then fails: the database never claims a file that isn't there.
 * When the file can't be named (a number past what the names have room for) or there is no copy, no file is written and a warning says so.
 */
export async function addBeanWithProfile(db: Db, input: unknown, env: ProfileFileEnv) {
  let file: { path: string; text: string; builtFrom: string } | undefined;
  const warnings: string[] = [];
  let endsAt: string | undefined;
  try {
    const result = await addBean(db, input as Record<string, unknown>, (start) => {
      const base = findBaseProfile(env.library, { name: start.stockName });
      if (!base) {
        warnings.push(`No copy of "${start.stockName}" in ${env.libraryDir} (its .kpro, or a log roasted on it), so no profile file was written. Use the stock profile on the Nano.`);
        return undefined;
      }
      endsAt = curveReachesAt(base.lines, start.endTempC);
      let names: ReturnType<typeof profileNames>;
      try {
        // The names come from the bean, never from the roaster: the short name the machine shows and the file's name.
        names = profileNames({ beanId: start.beanId, beanName: start.beanName, origin: start.origin, process: start.process, version: 1, revision: 1 });
      } catch (e) {
        warnings.push(`No profile file was written: ${(e as Error).message} Use the stock profile on the Nano.`);
        return undefined;
      }
      const description = [
        `${names.shortName}: ${start.stockName} for ${start.beanName}, written by roasting-coach. Curve and settings are unchanged.`,
        `Set level ${start.level} (ends at ${start.endTempC} °C).`,
        ...start.why,
      ].join("\n");
      const text = writeKpro(base.lines, { shortName: names.shortName, description });
      const path = outPath(names.fileName, env.outDir);
      writeFile(path, text);
      file = { path, text, builtFrom: base.path };
      return { profileName: names.shortName, profileFile: text };
    });
    return { ...result, endsAt, profile: file ? { written: file.path, builtFrom: file.builtFrom } : undefined, warnings };
  } catch (e) {
    if (file) rmSync(file.path, { force: true });
    throw e;
  }
}

/**
 * Whether a stored profile has a different body from the roaster's copy of the stock profile it is built on, checked body to body
 * (a version's `baseProfile` is only ancestry, so it can't say an edit from the stock curve). Undefined when it can't be told: nothing
 * is stored, or the library has no copy of the stock profile.
 */
function curveWasEdited(stored: string | undefined, base: string, library: KaffelogicFile[]): boolean | undefined {
  const stock = stored ? findBaseProfile(library, { name: base }) : undefined;
  if (!stored || !stock) return undefined;
  return !sameProfileBody(profileFromKpro(stored), stock.lines);
}

/** Each version of a bean for naming: which stock profile's curve its stored body is (see curveWasEdited). */
async function versionsForRevision(db: Db, beanId: number, versions: Awaited<ReturnType<typeof beanHistory>>["versions"], library: KaffelogicFile[]) {
  return Promise.all(
    versions.map(async (v) => {
      const base = v.baseProfile ?? v.profileName;
      const stockBody = curveWasEdited(await versionProfileFile(db, beanId, v.number), base, library) === false ? base : undefined;
      return { number: v.number, profileName: v.profileName, baseProfile: v.baseProfile, profileKey: v.profileKey, stockBody };
    }),
  );
}

/** The designer credited on a profile whose curve we changed: the base designer did not make it, so their name is not left on it. */
export const EDITED_CURVE_DESIGNER = "roasting-coach";

/**
 * profile:write: a .kpro for one version, to load onto the machine: the version's own profile (or the roaster's copy of its stock
 * profile) under the convention's names, with the version's level as the level the machine offers first. Curve and settings are
 * those of the version's profile, so a roast on this file still counts as the same profile. A version whose stored curve differs from
 * its stock profile's is described as edited and credited to the tool, not to the base profile's designer.
 */
export async function writeVersionProfile(db: Db, input: unknown, env: ProfileFileEnv) {
  const errors = checkShape(input, { beanId: { type: "integer", required: true }, version: { type: "integer" } });
  if (errors.length) throw new InputError(errors);
  const { beanId, version: number } = input as { beanId: number; version?: number };
  const history = await beanHistory(db, beanId);
  const v = number === undefined ? history.versions[history.versions.length - 1] : history.versions.find((x) => x.number === number);
  if (!v) throw new InputError([`Bean ${beanId} has no v${number}.`]);
  const base = await versionBase(db, beanId, v, env.library);
  if (!base) throw new InputError([`v${v.number}'s profile "${v.profileName}" isn't stored and has no copy in ${env.libraryDir}, so there's nothing to write from.`]);
  const beanName = String(history.bean.name);
  // Looked up before the names are made: a failure here is the database's or a stored file's, not something the roaster typed.
  const revision = profileRevision(await versionsForRevision(db, beanId, history.versions, env.library), v.number);
  let names: ReturnType<typeof profileNames>;
  try {
    // The names follow the convention: the bean, this version and the curve's revision, never a name the roaster picks.
    names = profileNames({
      beanId,
      beanName,
      origin: history.bean.origin === undefined || history.bean.origin === null ? undefined : String(history.bean.origin),
      process: history.bean.process as Intake["process"],
      version: v.number,
      revision,
    });
  } catch (e) {
    throw new InputError([(e as Error).message]);
  }
  const stockName = v.baseProfile ?? v.profileName;
  const stored = await versionProfileFile(db, beanId, v.number);
  // A version recorded as another stock profile keeps its ancestor as `baseProfile`, so a stored body equal to the profile the version is
  // named for is that stock curve, not an edit of its ancestor. When neither copy is in the library the curve can't be told from a stock one.
  const againstBase = curveWasEdited(stored, stockName, env.library);
  const againstNamed = v.profileName === stockName ? againstBase : curveWasEdited(stored, v.profileName, env.library);
  const edited = againstBase === true && againstNamed !== false;
  const curveClaim = edited ? `Curve edited from ${stockName}.` : againstBase === false || againstNamed === false ? `Curve and settings are those of ${v.profileName}.` : `Curve and settings are as stored for v${v.number}.`;
  const description = [
    `${names.shortName}: v${v.number} of ${beanName}, level ${v.level} (ends at ${v.endTempC} °C), written by roasting-coach. ${curveClaim}`,
    v.changeReason ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  const text = writeKpro(base.lines, { shortName: names.shortName, description, recommendedLevel: v.level, ...(edited ? { designer: EDITED_CURVE_DESIGNER } : {}) });
  const path = outPath(names.fileName, env.outDir);
  writeFile(path, text);
  return { written: path, profileName: names.shortName, fileName: names.fileName, version: v.number, level: v.level, endTempC: v.endTempC, builtFrom: base.path };
}

/**
 * profile:edit: a preview of a curve edit that holds a version's thermal dose and ends at another level (docs/ROADMAP.md, Next 3). It
 * records nothing and writes no file: `onYes` is the `version:add` that stores the edited profile, and the roaster says yes first.
 * The figures are the curve's own predictions; no roast has been made on the edited curve.
 */
export async function previewCurveEdit(db: Db, input: unknown, env: ProfileFileEnv) {
  const errors = checkShape(input, { beanId: { type: "integer", required: true }, version: { type: "integer" }, level: { type: "number", required: true }, reason: { type: "string" } });
  if (errors.length) throw new InputError(errors);
  const { beanId, version: number, level: asked, reason: said } = input as { beanId: number; version?: number; level: number; reason?: string };
  const level = Math.round(asked * 10) / 10;
  if (!(asked >= 0 && asked <= 6)) throw new InputError([`Level must be between 0 and 6; got ${asked}.`]);
  // The machine sets levels in 0.1 steps and a version stores one decimal, so the edit is for a level the machine can be set to (float noise like 0.30000000000000004 is rounded away).
  if (Math.abs(asked * 10 - Math.round(asked * 10)) > 1e-9) throw new InputError([`Level must be in steps of 0.1; got ${asked}.`]);
  const history = await beanHistory(db, beanId);
  if (number === undefined && !history.versions.length) throw new InputError([`Bean ${beanId} has no versions.`]);
  const v = number === undefined ? history.versions[history.versions.length - 1] : history.versions.find((x) => x.number === number);
  if (!v) throw new InputError([`Bean ${beanId} has no v${number}.`]);
  const base = await versionBase(db, beanId, v, env.library);
  if (!base) throw new InputError([`v${v.number}'s profile "${v.profileName}" isn't stored and has no copy in ${env.libraryDir}, so there's no curve to edit.`]);
  const profile = parseKpro(formatKpro(base.lines));
  const from = profileThermalDoseAtLevel(profile, v.level);
  if (!from) throw new InputError([`v${v.number}'s curve never reaches the end of level ${v.level}, so there's no thermal dose to hold.`]);
  // The profile has levels, since `from` was found on them.
  const endTemp = levelToTemp(profile.roastLevels, level)!;
  const target = curveThermalDoseTo(profile.roastCurve, from.endTemp, true)!;
  const edit = holdThermalDose(profile, endTemp, target.thermalDose);
  if (!edit.ok) throw new InputError([`v${v.number}: ${edit.problem}`]);
  // A blank reason is no reason: version:add would refuse it, so the preview would hand back a command that fails.
  const reason = said?.trim() || undefined;
  const slope = (x: number) => x.toFixed(1);
  const summary = `the climb after ${formatMinutesSeconds(edit.climbFrom.t)} (${edit.climbFrom.temp.toFixed(1)} °C) goes from ${slope(edit.slopeBefore)} to ${slope(edit.slopeAfter)} °C/min, and the roast ends at level ${level} (${endTemp.toFixed(1)} °C)`;
  // The stored file describes itself: it is no longer the base designer's curve, and "unchanged" would be false.
  const file = writeKpro(withRoastCurve(base.lines, edit.curve), { designer: EDITED_CURVE_DESIGNER, description: `Curve edited from ${v.baseProfile ?? v.profileName}: ${summary}.` });
  const say = [
    `On the same profile, ${summary}.`,
    `The curve's predicted thermal dose stays ${target.thermalDose.toFixed(2)}, the figure for level ${v.level} (${from.endTemp.toFixed(1)} °C) on the current curve. The curve before ${formatMinutesSeconds(edit.climbFrom.t)} is unchanged.`,
    `By the curve the roast ends at ${formatMinutesSeconds(edit.endsAtAfter)} instead of ${formatMinutesSeconds(target.endsAt)}, a climb of ${formatMinutesSeconds(edit.endsAtAfter - edit.climbFrom.t)} instead of ${formatMinutesSeconds(target.endsAt - edit.climbFrom.t)}.`,
    `These are the curve's predictions: real roasts have run above them (docs/research.md, validation 3), and no roast has been made on this curve yet. Shall I record it as the next version?`,
  ].join(" ");
  return {
    from: { version: v.number, level: v.level, endTempC: from.endTemp, thermalDose: target.thermalDose, endsAtS: target.endsAt },
    edit: { climbFromS: edit.climbFrom.t, climbFromTempC: edit.climbFrom.temp, slopeBeforeCPerMin: edit.slopeBefore, slopeAfterCPerMin: edit.slopeAfter, level, endTempC: endTemp, thermalDose: edit.thermalDose, endsAtS: edit.endsAtAfter },
    say,
    onYes: { command: "version:add", input: { beanId, parent: v.number, level, reason: reason ?? `Curve edit: ${summary}, holding the predicted thermal dose of v${v.number}.`, profileFile: file } },
  };
}

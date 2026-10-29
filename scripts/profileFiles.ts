// Writing the .kpro files the tool makes for a bean: the one at intake (bean:add) and the one for a version (profile:write). The
// names come from profileNames, never from the roaster. Files go to the output folder and never over an existing file.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { holdThermalDose, withRoastCurve } from "../src/adapters/kaffelogic/editCurve.js";
import { type Point, levelToTemp, parseKpro, timeCurveReaches } from "../src/adapters/kaffelogic/parse.js";
import { profileNames, profileRevision } from "../src/adapters/kaffelogic/profileNames.js";
import { LATE_FROM_C, MAX_LATE_RISE_C_PER_MIN, type Checkpoint, type LateClimb, type RateRise, retimeCurve } from "../src/adapters/kaffelogic/retimeCurve.js";
import { curveThroughPoints } from "../src/adapters/kaffelogic/throughCurve.js";
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
 * Each version of a bean for naming: which stock profile's curve its stored body is, checked body to body against the roaster's copy
 * of that stock profile in the library (a version's `baseProfile` is only ancestry, so it can't say an edit from the stock curve).
 */
async function versionsForRevision(db: Db, beanId: number, versions: Awaited<ReturnType<typeof beanHistory>>["versions"], library: KaffelogicFile[]) {
  return Promise.all(
    versions.map(async (v) => {
      const stored = await versionProfileFile(db, beanId, v.number);
      const base = v.baseProfile ?? v.profileName;
      const stock = stored ? findBaseProfile(library, { name: base }) : undefined;
      const stockBody = stored && stock && sameProfileBody(profileFromKpro(stored), stock.lines) ? base : undefined;
      return { number: v.number, profileName: v.profileName, baseProfile: v.baseProfile, profileKey: v.profileKey, stockBody };
    }),
  );
}

/**
 * The designer credited on a profile whose curve `profile:edit` changed: the base designer did not make it, so their name is not left on it.
 * It is also the mark that a stored profile was edited by the tool: the file carries it, and so does every later version, which inherits the file.
 */
export const EDITED_CURVE_DESIGNER = "roasting-coach";

const designerOf = (lines: ProfileLines) => lines.find(([key]) => key === "profile_designer")?.[1].trim();

/**
 * profile:write: a .kpro for one version, to load onto the machine: the version's own profile (or the roaster's copy of its stock
 * profile) under the convention's names, with the version's level as the level the machine offers first. Curve and settings are
 * those of the version's profile, so a roast on this file still counts as the same profile. A version whose stored profile carries the
 * tool's credit (`profile:edit` stamps it) is described as edited and keeps that credit, not the base profile's designer.
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
  const edited = designerOf(base.lines) === EDITED_CURVE_DESIGNER;
  const description = [
    `${names.shortName}: v${v.number} of ${beanName}, level ${v.level} (ends at ${v.endTempC} °C), written by roasting-coach. ${edited ? "Curve edited by roasting-coach (profile:edit)." : `Curve and settings are those of ${v.profileName}.`}`,
    v.changeReason ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  const text = writeKpro(base.lines, { shortName: names.shortName, description, recommendedLevel: v.level });
  const path = outPath(names.fileName, env.outDir);
  writeFile(path, text);
  return { written: path, profileName: names.shortName, fileName: names.fileName, version: v.number, level: v.level, endTempC: v.endTempC, builtFrom: base.path };
}

/** The temperatures profile:edit retimes and reports: the curve's time to each is shown before and after, besides the checkpoints the roaster named. */
const REPORTED_TEMPS_C = [100, 150, 180, 200];

/** How far (in %) the predicted thermal dose may move for the edit to still be called about the same (docs/ROADMAP.md, "Decided": 3%). */
const ABOUT_THE_SAME_PCT = 3;

/** A climb's rate before and after an edit, in words: it stays where it was when the edit left it at the one decimal shown. */
const slopeText = (before: number, after: number) => (before.toFixed(1) === after.toFixed(1) ? `stays at ${after.toFixed(1)} °C/min` : `goes from ${before.toFixed(1)} to ${after.toFixed(1)} °C/min`);

/** The thermal dose weights heat by temperature (docs/research.md, "Thermal dose: the measure we adopted"), so the stretch below this adds little to it; the preview reports the share measured on the curve being edited. */
const THERMAL_DOSE_LITTLE_BELOW_C = 190;

/** `reach` as the checkpoints retimeCurve takes: {"150": 190} is the curve reaching 150 °C at 190 s. */
function checkpointsFrom(reach: Record<string, unknown>): Checkpoint[] {
  const entries = Object.entries(reach);
  if (!entries.length) throw new InputError(['"reach" needs a temperature and the second the curve reaches it, like {"150": 190}.']);
  return entries.map(([temp, at]) => {
    if (temp.trim() === "" || !Number.isFinite(Number(temp)) || typeof at !== "number" || !Number.isFinite(at)) {
      throw new InputError([`"reach" takes a temperature in °C and the second the curve reaches it, like {"150": 190}; got ${JSON.stringify(temp)}: ${JSON.stringify(at)}.`]);
    }
    return { temp: Number(temp), at };
  });
}

/** `through` as the points curveThroughPoints takes: [[120, 158.5], [180, 178]] is 158.5 °C at 120 s, then 178 °C at 180 s. */
function pointsFrom(through: unknown[]): Point[] {
  return through.map((p) => {
    if (!Array.isArray(p) || p.length !== 2 || p.some((x) => typeof x !== "number" || !Number.isFinite(x))) {
      throw new InputError([`"through" takes points, each the second and the temperature in °C, like [[120, 158.5], [180, 178]]; got ${JSON.stringify(p)}.`]);
    }
    return { t: p[0], v: p[1] };
  });
}

/** A level the machine can be set to: 0 to 6 in steps of 0.1, with float noise (0.30000000000000004) rounded away. */
function editLevel(asked: number): number {
  if (!(asked >= 0 && asked <= 6)) throw new InputError([`Level must be between 0 and 6; got ${asked}.`]);
  // The machine sets levels in 0.1 steps and a version stores one decimal, so the edit is for a level the machine can be set to.
  if (Math.abs(asked * 10 - Math.round(asked * 10)) > 1e-9) throw new InputError([`Level must be in steps of 0.1; got ${asked}.`]);
  return Math.round(asked * 10) / 10;
}

/** What a curve edit starts from: the version, its curve, and the curve's predicted thermal dose at the version's own level. */
async function editTarget(db: Db, beanId: number, number: number | undefined, env: ProfileFileEnv) {
  const history = await beanHistory(db, beanId);
  if (number === undefined && !history.versions.length) throw new InputError([`Bean ${beanId} has no versions.`]);
  const v = number === undefined ? history.versions[history.versions.length - 1] : history.versions.find((x) => x.number === number);
  if (!v) throw new InputError([`Bean ${beanId} has no v${number}.`]);
  const base = await versionBase(db, beanId, v, env.library);
  if (!base) throw new InputError([`v${v.number}'s profile "${v.profileName}" isn't stored and has no copy in ${env.libraryDir}, so there's no curve to edit.`]);
  const profile = parseKpro(formatKpro(base.lines));
  const from = profileThermalDoseAtLevel(profile, v.level);
  if (!from) throw new InputError([`v${v.number}'s curve never reaches the end of level ${v.level}, so there's no thermal dose to hold.`]);
  // The curve's own figure, not the level table's: the edited curve's is found the same way, so the two compare.
  const target = curveThermalDoseTo(profile.roastCurve, from.endTemp, true)!;
  return { v, base, profile, from, target };
}

/**
 * profile:edit: a preview of a curve edit. It records nothing and writes no file: `onYes` is the `version:add` that stores the edited
 * profile, and the roaster says yes first. The figures are the curve's own predictions; no roast has been made on the edited curve.
 * Three edits (docs/ROADMAP.md, Next 3):
 * - `through` draws the whole curve through points ([[120, 158.5], [180, 178]]: 158.5 °C at 120 s, 178 °C at 180 s), a smooth rising line
 *   (curveThroughPoints). It keeps the version's level unless `level` names another, which only moves where the roast stops; it takes no `reach`.
 * - `reach` retimes the curve from checkpoints ({"150": 190}: it reaches 150 °C at 190 s), anywhere between 100 °C and its last point
 *   (retimeCurve). Alone it keeps the version's level, and says how much the predicted thermal dose moved.
 * - `level` ends the roast at that level and reshapes the last climb so the predicted thermal dose is the version's (holdThermalDose).
 *   Together, the retime comes first and the last climb then makes up the difference.
 */
export async function previewCurveEdit(db: Db, input: unknown, env: ProfileFileEnv) {
  const errors = checkShape(input, { beanId: { type: "integer", required: true }, version: { type: "integer" }, level: { type: "number" }, reach: { type: "object" }, through: { type: "array" }, reason: { type: "string" } });
  if (errors.length) throw new InputError(errors);
  const { beanId, version: number, level: asked, reach, through, reason: said } = input as { beanId: number; version?: number; level?: number; reach?: Record<string, unknown>; through?: unknown[]; reason?: string };
  if (asked === undefined && reach === undefined && through === undefined) throw new InputError(['Say what to edit: "reach" (when the curve reaches temperatures, like {"150": 190}), "through" (draw the whole curve through points, like [[120, 158.5], [180, 178]]), "level" (end the roast at that level and reshape its last climb to hold the thermal dose), or reach and level together.']);
  if (reach !== undefined && through !== undefined) throw new InputError(['"through" draws the whole curve and "reach" moves points of the one there is: give one of them.']);
  const level = asked === undefined ? undefined : editLevel(asked);
  const checkpoints = reach === undefined ? undefined : checkpointsFrom(reach);
  const points = through === undefined ? undefined : pointsFrom(through);
  const { v, base, profile, from, target } = await editTarget(db, beanId, number, env);
  // The profile has levels, since `from` was found on them.
  const endTemp = level === undefined ? from.endTemp : levelToTemp(profile.roastLevels, level)!;
  let curve = profile.roastCurve;
  let rises: RateRise[] = [];
  let late: LateClimb | undefined;
  const reshaped = points ? curveThroughPoints(points) : checkpoints ? retimeCurve(curve, checkpoints) : undefined;
  if (reshaped) {
    if (!reshaped.ok) throw new InputError([`v${v.number}: ${reshaped.problem}`]);
    ({ curve, rises, late } = reshaped);
  }
  // A redrawn curve has no straight last climb to reshape: its level only says where the roast stops.
  const held = level === undefined || points ? undefined : holdThermalDose({ ...profile, roastCurve: curve }, endTemp, target.thermalDose);
  if (held && !held.ok) throw new InputError([`v${v.number}: ${held.problem}`]);
  if (held?.ok) curve = held.curve;
  const edited = held?.ok ? { endsAt: held.endsAtAfter, thermalDose: held.thermalDose } : curveThermalDoseTo(curve, endTemp, true);
  if (!edited) throw new InputError([`v${v.number}: the edited curve does not reach ${endTemp.toFixed(1)} °C within 20 minutes, so the roast would not end.`]);

  const climbText = held?.ok ? `the climb after ${formatMinutesSeconds(held.climbFrom.t)} (${held.climbFrom.temp.toFixed(1)} °C) ${slopeText(held.slopeBefore, held.slopeAfter)}, and the roast ends at level ${level} (${endTemp.toFixed(1)} °C)` : undefined;
  const parts: string[] = [];
  if (checkpoints || points) {
    const named = new Map(checkpoints?.map((c) => [c.temp, c.at]));
    const temps = [...new Set([...REPORTED_TEMPS_C, ...named.keys()])].sort((a, b) => a - b);
    const both = (temp: number) => {
      // A checkpoint is reached when it was asked for; reading it off the curve could be a half second out.
      const [was, now] = [timeCurveReaches(profile.roastCurve, temp), named.get(temp) ?? timeCurveReaches(curve, temp)];
      return was === undefined || now === undefined ? undefined : `${temp} °C ${formatMinutesSeconds(was)} to ${formatMinutesSeconds(now)}${named.has(temp) ? " (asked for)" : ""}`;
    };
    const times = [...temps.map(both).filter((s): s is string => s !== undefined), `the end, ${endTemp.toFixed(1)} °C, ${formatMinutesSeconds(target.endsAt)} to ${formatMinutesSeconds(edited.endsAt)}`];
    parts.push(`On the same profile, ${points ? `the whole curve is redrawn through ${points.length} points, from ${formatMinutesSeconds(points[0].t)} (${points[0].v} °C) to ${formatMinutesSeconds(points[points.length - 1].t)} (${points[points.length - 1].v} °C)` : "the curve is retimed"}. Time to each temperature, before to after: ${times.join("; ")}.`);
  }
  if (held?.ok) {
    parts.push(
      `${checkpoints ? "Then" : "On the same profile,"} ${climbText}.`,
      `The curve's predicted thermal dose stays ${target.thermalDose.toFixed(2)}, the figure for level ${v.level} (${from.endTemp.toFixed(1)} °C) on the current curve.${checkpoints ? "" : ` The curve before ${formatMinutesSeconds(held.climbFrom.t)} is unchanged.`}`,
    );
  } else {
    const change = ((edited.thermalDose - target.thermalDose) / target.thermalDose) * 100;
    const verdict = Math.abs(change) <= ABOUT_THE_SAME_PCT ? `about the same: within the ${ABOUT_THE_SAME_PCT}% this tool counts as the same` : `${change > 0 ? "more" : "less"} heat than v${v.number}, not the same`;
    parts.push(`The curve's predicted thermal dose goes from ${target.thermalDose.toFixed(2)} to ${edited.thermalDose.toFixed(2)} (${change >= 0 ? "+" : ""}${change.toFixed(1)}%), ${verdict}. The roast ${points && level !== undefined ? "ends" : "still ends"} at level ${level ?? v.level} (${endTemp.toFixed(1)} °C); pass "level" to end at another${points ? "" : " and hold the thermal dose"}.`);
  }
  const early = checkpoints && checkpoints.every((c) => c.temp < THERMAL_DOSE_LITTLE_BELOW_C) ? curveThermalDoseTo(curve, THERMAL_DOSE_LITTLE_BELOW_C, true) : undefined;
  if (early) parts.push(`The thermal dose counts very little below ${THERMAL_DOSE_LITTLE_BELOW_C} °C (${((100 * early.thermalDose) / edited.thermalDose).toFixed(0)}% of this curve's total comes before it), so it cannot say whether this edit changes the cup; only the cup can.`);
  if (rises.length) {
    const first = rises[0];
    const more = rises.length > 1 ? `, and in ${rises.length - 1} more place${rises.length > 2 ? "s" : ""}` : "";
    parts.push(`The rate of rise picks up again around ${formatMinutesSeconds(first.from + 30)} (from ${first.before.toFixed(1)} to ${first.after.toFixed(1)} °C/min)${more}; Kaffelogic's Roaster's Companion calls a steadily falling rate of rise optimal, and every stock profile has one. It is your choice.`);
  }
  if (late) parts.push(`The curve climbs at ${late.cPerMin.toFixed(0)} °C/min at ${formatMinutesSeconds(late.at)}, past ${LATE_FROM_C} °C, ${late.limit > MAX_LATE_RISE_C_PER_MIN ? `faster than the ${late.limit.toFixed(0)} °C/min this curve already had there` : `where no stock profile goes above ${MAX_LATE_RISE_C_PER_MIN}`}: the Nano may not keep up, and the roast would then end later than the curve says. It is your choice.`);
  parts.push("These are the curve's predictions: real roasts have run above them (docs/research.md, validation 3), and no roast has been made on this curve yet. Shall I record it as the next version?");
  const say = parts.join(" ");

  const summary = [
    ...(points ? [`redrawn through ${points.length} points, ${formatMinutesSeconds(points[0].t)} to ${formatMinutesSeconds(points[points.length - 1].t)}, ${points[0].v} to ${points[points.length - 1].v} °C`] : []),
    ...(checkpoints ? [`reaches ${[...checkpoints].sort((a, b) => a.temp - b.temp).map((c) => `${c.temp} °C at ${formatMinutesSeconds(c.at)} instead of ${formatMinutesSeconds(timeCurveReaches(profile.roastCurve, c.temp)!)}`).join(", ")}`] : []),
    ...(climbText ? [climbText] : []),
  ].join("; ");
  // A blank reason is no reason: version:add would refuse it, so the preview would hand back a command that fails.
  const reason = said?.trim() || `Curve edit: ${summary}${held?.ok ? `, holding the predicted thermal dose of v${v.number}` : ""}.`;
  // The stored file describes itself: it is no longer the base designer's curve, and "unchanged" would be false.
  const file = writeKpro(withRoastCurve(base.lines, curve), { designer: EDITED_CURVE_DESIGNER, description: `Curve edited from v${v.number}'s curve: ${summary}.` });
  return {
    from: { version: v.number, level: v.level, endTempC: from.endTemp, thermalDose: target.thermalDose, endsAtS: target.endsAt },
    edit: {
      level: level ?? v.level,
      endTempC: endTemp,
      thermalDose: edited.thermalDose,
      endsAtS: edited.endsAt,
      ...(held?.ok ? { climb: { fromS: held.climbFrom.t, fromTempC: held.climbFrom.temp, slopeBeforeCPerMin: held.slopeBefore, slopeAfterCPerMin: held.slopeAfter } } : {}),
      ...(points ? { through: points } : {}),
      ...(checkpoints ? { reach: checkpoints.map((c) => ({ tempC: c.temp, atS: c.at, wasS: timeCurveReaches(profile.roastCurve, c.temp)! })) } : {}),
      ...(reshaped ? { rateOfRiseRisesAt: rises.map((r) => ({ atS: r.from + 30, fromCPerMin: r.before, toCPerMin: r.after })), ...(late ? { climbsFasterThanStock: { atS: late.at, cPerMin: late.cPerMin, stockCPerMin: MAX_LATE_RISE_C_PER_MIN, limitCPerMin: late.limit } } : {}) } : {}),
    },
    say,
    onYes: { command: "version:add", input: { beanId, parent: v.number, level: level ?? v.level, reason, profileFile: file } },
  };
}

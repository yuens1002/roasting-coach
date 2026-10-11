// Writing the .kpro files the tool makes for a bean: the one at intake (bean:add) and the one for a version (profile:write). The
// names come from profileNames, never from the roaster. Files go to the output folder and never over an existing file.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseKpro, timeCurveReaches } from "../src/adapters/kaffelogic/parse.js";
import { profileNames, profileRevision } from "../src/adapters/kaffelogic/profileNames.js";
import { formatMinutesSeconds } from "../src/adapters/kaffelogic/thermalDose.js";
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
 * profile:write: a .kpro for one version, to load onto the machine: the version's own profile (or the roaster's copy of its stock
 * profile) under the convention's names, with the version's level as the level the machine offers first. Curve and settings are
 * unchanged, so a roast on this file still counts as the same profile.
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
  const description = [
    `${names.shortName}: v${v.number} of ${beanName}, level ${v.level} (ends at ${v.endTempC} °C), written by roasting-coach. Curve and settings are those of ${v.profileName}.`,
    v.changeReason ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  const text = writeKpro(base.lines, { shortName: names.shortName, description, recommendedLevel: v.level });
  const path = outPath(names.fileName, env.outDir);
  writeFile(path, text);
  return { written: path, profileName: names.shortName, fileName: names.fileName, version: v.number, level: v.level, endTempC: v.endTempC, builtFrom: base.path };
}

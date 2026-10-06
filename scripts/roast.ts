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
//   npx tsx scripts/roast.ts bean:update  '{"beanId": 1, "answers": {"sellerNotes": "..."}}'   (merged over the stored answers; null clears)
//   npx tsx scripts/roast.ts taste:update '{"tastingId": 2, "answers": {"wantNext": ["brighter"]}}'
//   npx tsx scripts/roast.ts dose '{"profile": "Robusta", "level": 3, "change": -15}'   (level for a dose change)
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
import { parseHeader, parseKpro, splitLines } from "../src/adapters/kaffelogic/parse.js";
import { levelForDose, profileDoseAtLevel } from "../src/adapters/kaffelogic/dose.js";
import { findBaseProfile, formatKpro, writeKpro } from "../src/adapters/kaffelogic/writeProfile.js";
import { INTAKE_FIELDS, ROAST_FIELDS, TASTING_FIELDS } from "../src/core/intake.js";
import { checkShape } from "../src/core/validate.js";
import { InputError, type NewRoast, type NewVersion, addBean, addRoast, addTasting, addVersion, beanHistory, listBeans, NEW_ROAST_SHAPE, refreshFeatures, removeBean, updateBean, updateTasting } from "../src/db/store.js";
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
  if (command === "dose") {
    // A profile's dose at a level, and (with change, in %) the level that changes it by that much.
    const input = json();
    const shapeErrors = checkShape(input, { profile: { type: "string", required: true }, level: { type: "number", required: true }, change: { type: "number" } });
    if (shapeErrors.length) throw new InputError(shapeErrors);
    const { profile: name, level, change } = input as { profile: string; level: number; change?: number };
    if (level < 0 || level > 6) throw new InputError([`Level must be between 0 and 6; got ${level}.`]);
    if (change !== undefined && change <= -100) throw new InputError([`A change of ${change}% would leave no roasting at all; use a value above -100.`]);
    const base = findBaseProfile(loadLibrary(), { name });
    if (!base) throw new InputError([`No copy of "${name}" in ${KAFFELOGIC_DIR} (its .kpro, or a log roasted on it).`]);
    const profile = parseKpro(formatKpro(base.lines));
    const now = profileDoseAtLevel(profile, level);
    if (!now) throw new InputError([`"${name}" never reaches level ${level}'s end temperature.`]);
    // Round the whole duration first, so 599.5 s reads 10:00, not 9:60.
    const mmss = (s: number) => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;
    const shape = (d: NonNullable<typeof now>) => ({ level: d.level, endTempC: Math.round(d.endTemp * 10) / 10, endsAt: mmss(d.endsAt), dose: Math.round(d.dose * 100) / 100 });
    if (change === undefined) return { profile: name, ...shape(now) };
    const next = levelForDose(profile, now.dose * (1 + change / 100));
    if (!next) throw new InputError([`No level on "${name}" gives that dose.`]);
    return { profile: name, from: shape(now), to: { ...shape(next), changePct: Math.round((next.dose / now.dose - 1) * 1000) / 10 } };
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
          return { ...result, profile: file ? { written: file.path, builtFrom: file.builtFrom } : undefined, warnings };
        } catch (e) {
          if (file) rmSync(file.path, { force: true });
          throw e;
        }
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
      case "bean:update":
        return await updateBean(db, json() as never);
      case "taste:update":
        return await updateTasting(db, json() as never);
      case "features:refresh":
        return await refreshFeatures(db);
      case "bean:remove":
        return await removeBean(db, beanIdArg());
      default:
        throw new InputError([`Unknown command "${command}". Commands: fields, library, dose, beans, bean:add, bean:update, bean:remove, version:add, roast:add, taste:add, taste:update, history, features:refresh.`]);
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

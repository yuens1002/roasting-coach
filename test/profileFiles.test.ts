import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseKpro } from "../src/adapters/kaffelogic/parse.js";
import { type Db, InputError, addVersion, beanHistory, listBeans } from "../src/db/store.js";
import { EDITED_CURVE_DESIGNER, type ProfileFileEnv, addBeanWithProfile, previewCurveEdit, writeVersionProfile } from "../scripts/profileFiles.js";
import { migratedDb } from "./pg.js";
import { BENT_CLIMB_CURVE, CLIMB_CURVE, PROFILE, profileWithCurve } from "./syntheticLog.js";

// The files the tool writes for a bean, on a real (in-memory) database and a temp folder. The "stock" files are made up: the
// made-up profile under a stock profile's name, and, for a different curve, with another fan curve.
const stockFile = (shortName: string, otherCurve = false) => ({
  path: `${shortName}.kpro`,
  text: PROFILE.replace("profile_short_name:Test line", `profile_short_name:${shortName}`).replace("fan_profile:0,14700,0,0,100,14700,600,13200,500,13200,0,0", otherCurve ? "fan_profile:0,12000,0,0,100,12000,600,11000,500,11000,0,0" : "fan_profile:0,14700,0,0,100,14700,600,13200,500,13200,0,0"),
});
const YIRG = { name: "Yirgacheffe", species: "arabica", decaf: false, process: "washed", drinkWhen: "soon", agtronTarget: 90, tastingBrew: "pourover", altitudeM: 2100, origin: "Ethiopia, Yirgacheffe" };

let outDir: string;
let env: ProfileFileEnv;
beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), "profile-files-"));
  // A washed bean to drink soon starts on KL Washed; the second file is for a switch to another stock profile.
  env = { library: [stockFile("KL Washed"), stockFile("2000-2700m RTD", true)], libraryDir: "the library", outDir };
});
afterEach(() => rmSync(outDir, { recursive: true, force: true }));

describe("bean:add's profile file", () => {
  it("is named by the convention, with the short name inside it and on the version, never the bean's name", async () => {
    const db = await migratedDb();
    const r = await addBeanWithProfile(db, YIRG, env);
    expect(readdirSync(outDir)).toEqual(["KLN7-YIRG-WSH-001-1r1.kpro"]);
    const text = readFileSync(join(outDir, "KLN7-YIRG-WSH-001-1r1.kpro"), "utf8");
    expect(text).toContain("profile_short_name:YIRG-001-1r1");
    expect(text).not.toContain("profile_short_name:Yirgacheffe");
    expect(r.version).toMatchObject({ number: 1, profileName: "YIRG-001-1r1", baseProfile: "KL Washed", hasProfileFile: true });
    expect(r.profile?.written).toBe(join(outDir, "KLN7-YIRG-WSH-001-1r1.kpro"));
    expect(r.warnings).toEqual([]);
  });

  it("writes no file and says so when the library has no copy of the stock profile, and still stores the bean on the stock profile", async () => {
    const db = await migratedDb();
    const r = await addBeanWithProfile(db, YIRG, { ...env, library: [] });
    expect(readdirSync(outDir)).toEqual([]);
    expect(r.profile).toBeUndefined();
    expect(r.warnings).toEqual([expect.stringContaining('No copy of "KL Washed" in the library')]);
    expect(r.version).toMatchObject({ profileName: "KL Washed", hasProfileFile: false });
  });

  it("writes no file and says why when the bean's number is past what a name has room for, and still stores the bean", async () => {
    const db = await migratedDb();
    await db.query("select setval(pg_get_serial_sequence('bean', 'id'), 1000)");
    const r = await addBeanWithProfile(db, YIRG, env);
    expect(r.beanId).toBe(1001);
    expect(readdirSync(outDir)).toEqual([]);
    expect(r.warnings).toEqual([expect.stringContaining("bean number from 1 to 999; got 1001")]);
    expect(r.version.profileName).toBe("KL Washed");
    expect(await listBeans(db)).toHaveLength(1);
  });

  it("removes the file and leaves no bean when the version can't be stored after it", async () => {
    const real = await migratedDb();
    const failing: Db = { query: ((text: string, params?: unknown[]) => (/insert into profile_version/i.test(text) ? Promise.reject(new Error("the version can't be stored")) : real.query(text, params))) as Db["query"] };
    await expect(addBeanWithProfile(failing, YIRG, env)).rejects.toThrow("the version can't be stored");
    expect(readdirSync(outDir)).toEqual([]);
    expect(await listBeans(real)).toEqual([]);
  });

  it("refuses to write over a file that is already there, and leaves no bean", async () => {
    const db = await migratedDb();
    await addBeanWithProfile(db, YIRG, env);
    await db.query("delete from bean");
    await db.query("alter table bean alter column id restart with 1");
    await expect(addBeanWithProfile(db, YIRG, env)).rejects.toThrow("already exists");
    expect(await listBeans(db)).toEqual([]);
    expect(readdirSync(outDir)).toEqual(["KLN7-YIRG-WSH-001-1r1.kpro"]);
  });
});

describe("profile:write", () => {
  it("names a level-only version's file with its version number and the same revision, and offers its level first", async () => {
    const db = await migratedDb();
    const { beanId } = await addBeanWithProfile(db, YIRG, env);
    await addVersion(db, { beanId, level: 1.2, reason: "a step" });
    const r = await writeVersionProfile(db, { beanId, version: 2 }, env);
    expect(r).toMatchObject({ profileName: "YIRG-001-2r1", fileName: "KLN7-YIRG-WSH-001-2r1.kpro", version: 2, level: 1.2 });
    const text = readFileSync(join(outDir, "KLN7-YIRG-WSH-001-2r1.kpro"), "utf8");
    expect(text).toContain("profile_short_name:YIRG-001-2r1");
    expect(text).toContain("recommended_level:1.2");
    expect(readdirSync(outDir).sort()).toEqual(["KLN7-YIRG-WSH-001-1r1.kpro", "KLN7-YIRG-WSH-001-2r1.kpro"]);
  });

  it("takes the next revision when the bean switches to another stock profile, and keeps it for level-only versions after", async () => {
    const db = await migratedDb();
    const { beanId } = await addBeanWithProfile(db, YIRG, env);
    await addVersion(db, { beanId, profileName: "2000-2700m RTD", level: 2.5, reason: "try the other profile" });
    await addVersion(db, { beanId, level: 2.7, reason: "a step" });
    expect((await writeVersionProfile(db, { beanId, version: 2 }, env)).profileName).toBe("YIRG-001-2r2");
    expect((await writeVersionProfile(db, { beanId, version: 3 }, env)).profileName).toBe("YIRG-001-3r2");
  });

  it("gives a return to the stock profile the first revision when the bean's own copy is that curve unedited", async () => {
    const db = await migratedDb();
    const { beanId } = await addBeanWithProfile(db, YIRG, env);
    await addVersion(db, { beanId, profileName: "2000-2700m RTD", level: 2.5, reason: "try the other profile" });
    await addVersion(db, { beanId, profileName: "KL Washed", level: 1, reason: "back to the first" });
    expect((await writeVersionProfile(db, { beanId, version: 3 }, env)).profileName).toBe("YIRG-001-3r1");
  });

  it("gives a stock profile a new revision when the bean's first version was edited and kept its stock base", async () => {
    const db = await migratedDb();
    const { beanId } = await addBeanWithProfile(db, YIRG, env);
    // v1's curve was replaced (a roast on an edited curve under the stock name); it keeps pointing at its stock profile.
    await db.query("update profile_version set profile_file = $2 where bean_id = $1 and number = 1", [beanId, stockFile("KL Washed", true).text]);
    await addVersion(db, { beanId, profileName: "KL Washed", level: 1, reason: "the stock profile itself" });
    expect((await writeVersionProfile(db, { beanId, version: 2 }, env)).profileName).toBe("YIRG-001-2r2");
  });

  it("refuses to write a file twice, a version the bean does not have, a name, and a bean number past what a name has room for", async () => {
    const db = await migratedDb();
    const { beanId } = await addBeanWithProfile(db, YIRG, env);
    await addVersion(db, { beanId, level: 1.2, reason: "a step" });
    await writeVersionProfile(db, { beanId, version: 2 }, env);
    await expect(writeVersionProfile(db, { beanId, version: 2 }, env)).rejects.toThrow("already exists");
    await expect(writeVersionProfile(db, { beanId, version: 9 }, env)).rejects.toThrow("Bean 1 has no v9.");
    await expect(writeVersionProfile(db, { beanId, version: 2, name: "My own name" }, env)).rejects.toThrow('"name" isn\'t recognised');
  });

  it("says in plain words, as an input error, that a bean number past 999 has no room in a name", async () => {
    const db = await migratedDb();
    await db.query("select setval(pg_get_serial_sequence('bean', 'id'), 1000)");
    const { beanId } = await addBeanWithProfile(db, YIRG, env);
    await addVersion(db, { beanId, level: 1.2, reason: "a step" });
    const err = await writeVersionProfile(db, { beanId, version: 2 }, env).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InputError);
    expect((err as InputError).errors).toEqual(["A profile name has room for a bean number from 1 to 999; got 1001."]);
    expect(readdirSync(outDir)).toEqual([]);
  });

  it("reports a database failure while working out the revision as itself, not as input the roaster can fix, and writes nothing", async () => {
    const real = await migratedDb();
    const { beanId } = await addBeanWithProfile(real, YIRG, env);
    // The first read of a stored profile is for the file to write from; the second is the revision's.
    let reads = 0;
    const flaky: Db = {
      query: ((text: string, params?: unknown[]) => (/select profile_file from profile_version where id/i.test(text) && ++reads === 2 ? Promise.reject(new Error("the database went away")) : real.query(text, params))) as Db["query"],
    };
    const err = await writeVersionProfile(flaky, { beanId, version: 1 }, env).catch((e: unknown) => e);
    expect(reads).toBe(2);
    expect(err).not.toBeInstanceOf(InputError);
    expect((err as Error).message).toBe("the database went away");
    expect(readdirSync(outDir)).toEqual(["KLN7-YIRG-WSH-001-1r1.kpro"]);
  });

  it("writes nothing when the version's profile is neither stored nor in the library", async () => {
    const db = await migratedDb();
    const { beanId } = await addBeanWithProfile(db, YIRG, { ...env, library: [] });
    await expect(writeVersionProfile(db, { beanId, version: 1 }, { ...env, library: [] })).rejects.toThrow("has no copy in the library");
    expect(existsSync(outDir) && readdirSync(outDir)).toEqual([]);
  });
});

describe("profile:edit", () => {
  // A library whose stock profile has a straight last climb, so there is something to reshape (the plain made-up one has two nodes).
  const climbLibrary = (curve = CLIMB_CURVE) => [{ path: "KL Washed.kpro", text: profileWithCurve(curve).replace("profile_short_name:Test line", "profile_short_name:KL Washed").replace("profile_designer:roasting-coach tests", "profile_designer:A. Designer") }];
  const setup = async (curve = CLIMB_CURVE) => {
    const db = await migratedDb();
    const climbEnv = { ...env, library: climbLibrary(curve) };
    const { beanId, version } = await addBeanWithProfile(db, YIRG, climbEnv);
    return { db, climbEnv, beanId, level: version.level };
  };

  it("previews an edit that holds the version's thermal dose and records nothing, with the version:add that would store it", async () => {
    const { db, climbEnv, beanId, level } = await setup();
    const before = { versions: (await beanHistory(db, beanId)).versions.length, files: readdirSync(outDir) };
    const preview = await previewCurveEdit(db, { beanId, level: level + 1 }, climbEnv);
    expect(preview.say).toContain("Shall I record it as the next version?");
    expect(preview.say).toContain("The curve before 5:00 is unchanged.");
    expect(preview.say).not.toMatch(/(?<!thermal )\bdose\b/);
    expect(preview.edit.slopeAfterCPerMin).toBeGreaterThan(preview.edit.slopeBeforeCPerMin);
    expect(Math.abs(preview.edit.thermalDose - preview.from.thermalDose) / preview.from.thermalDose).toBeLessThan(1e-6);
    expect(preview.onYes).toMatchObject({ command: "version:add", input: { beanId, parent: 1, level: level + 1 } });
    // A preview stores no version and writes no file.
    expect((await beanHistory(db, beanId)).versions).toHaveLength(before.versions);
    expect(readdirSync(outDir)).toEqual(before.files);
  });

  it("gives an onYes that version:add stores, as a profile with the edited curve and the same levels", async () => {
    const { db, climbEnv, beanId, level } = await setup();
    const preview = await previewCurveEdit(db, { beanId, level: level + 1, reason: "Try a steeper finish" }, climbEnv);
    expect(preview.onYes.input.reason).toBe("Try a steeper finish");
    const v = await addVersion(db, preview.onYes.input);
    expect(v).toMatchObject({ number: 2, parentNumber: 1, level: level + 1, hasProfileFile: true });
    const stored = parseKpro(preview.onYes.input.profileFile);
    expect(stored.roastLevels).toEqual(parseKpro(profileWithCurve(CLIMB_CURVE)).roastLevels);
    expect(stored.roastCurve[stored.roastCurve.length - 1].point.v).not.toBeCloseTo(parseKpro(profileWithCurve(CLIMB_CURVE)).roastCurve[3].point.v, 1);
  });

  it("is written by profile:write as an edited curve credited to the tool, while an unedited version keeps the base designer", async () => {
    const { db, climbEnv, beanId, level } = await setup();
    await addVersion(db, (await previewCurveEdit(db, { beanId, level: level + 1 }, climbEnv)).onYes.input);
    const edited = await writeVersionProfile(db, { beanId, version: 2 }, climbEnv);
    const editedText = readFileSync(edited.written, "utf8");
    expect(parseKpro(editedText).designer).toBe(EDITED_CURVE_DESIGNER);
    expect(editedText).not.toContain("A. Designer");
    expect(parseKpro(editedText).description).toContain("Curve edited from KL Washed.");
    expect(parseKpro(editedText).description).not.toContain("Curve and settings are those of");
    // The version one file, never edited, keeps the base profile's designer and its description of an unchanged curve.
    const unedited = parseKpro(readFileSync(join(outDir, "KLN7-YIRG-WSH-001-1r1.kpro"), "utf8"));
    expect(unedited.designer).toBe("A. Designer");
  });

  it("writes a version that was never edited with the base designer and the unchanged-curve wording", async () => {
    const { db, climbEnv, beanId, level } = await setup();
    await addVersion(db, { beanId, level: level + 1, reason: "A level change only" });
    const second = { ...climbEnv, outDir: join(outDir, "second") };
    for (const version of [1, 2]) {
      const written = parseKpro(readFileSync((await writeVersionProfile(db, { beanId, version }, second)).written, "utf8"));
      expect(written.designer).toBe("A. Designer");
      expect(written.description).toContain("Curve and settings are those of");
      expect(written.description).not.toContain("Curve edited");
    }
  });

  it("does not call a stored copy of another stock profile an edit of the profile it was recorded after", async () => {
    const { db, climbEnv, beanId, level } = await setup();
    const otherFan = profileWithCurve(CLIMB_CURVE)
      .replace("profile_short_name:Test line", "profile_short_name:2000-2700m RTD")
      .replace("profile_designer:roasting-coach tests", "profile_designer:B. Designer")
      .replace("fan_profile:0,14700,0,0,100,14700,600,13200,500,13200,0,0", "fan_profile:0,12000,0,0,100,12000,600,11000,500,11000,0,0");
    const library = [...climbEnv.library, { path: "2000-2700m RTD.kpro", text: otherFan }];
    await addVersion(db, { beanId, profileName: "2000-2700m RTD", profileFile: otherFan, level, reason: "Try the other stock profile" });
    const written = parseKpro(readFileSync((await writeVersionProfile(db, { beanId, version: 2 }, { ...climbEnv, library })).written, "utf8"));
    expect(written.designer).toBe("B. Designer");
    expect(written.description).toContain("Curve and settings are those of 2000-2700m RTD.");
  });

  it("keeps the edited credit and does not claim a curve it cannot check when the library has no copy of the stock profile", async () => {
    const { db, climbEnv, beanId, level } = await setup();
    await addVersion(db, (await previewCurveEdit(db, { beanId, level: level + 1 }, climbEnv)).onYes.input);
    const written = parseKpro(readFileSync((await writeVersionProfile(db, { beanId, version: 2 }, { ...climbEnv, library: [] })).written, "utf8"));
    // The stored file already carries the tool's credit and says it was edited, so the file is right without the library.
    expect(written.designer).toBe(EDITED_CURVE_DESIGNER);
    expect(written.description).toContain("Curve and settings are as stored for v2.");
    expect(written.description).not.toContain("are those of");
    expect(parseKpro(climbEnv.library[0].text).designer).toBe("A. Designer");
  });

  it("treats a blank reason as none, so what it hands back is a command that version:add accepts", async () => {
    const { db, climbEnv, beanId, level } = await setup();
    const preview = await previewCurveEdit(db, { beanId, level: level + 1, reason: "   " }, climbEnv);
    expect(preview.onYes.input.reason).toMatch(/^Curve edit: /);
    expect(await addVersion(db, preview.onYes.input)).toMatchObject({ number: 2 });
    const said = await previewCurveEdit(db, { beanId, level: level + 1, reason: "  Try a steeper finish  " }, climbEnv);
    expect(said.onYes.input.reason).toBe("Try a steeper finish");
  });

  it("describes its own reason in measured terms when the roaster gives none", async () => {
    const { db, climbEnv, beanId, level } = await setup();
    const preview = await previewCurveEdit(db, { beanId, level: level + 1 }, climbEnv);
    expect(preview.onYes.input.reason).toMatch(/^Curve edit: the climb after 5:00 \(199\.0 °C\) goes from 6\.0 to \d+\.\d °C\/min/);
  });

  it("refuses an unknown version, a level off the machine and an unknown key, in plain words", async () => {
    const { db, climbEnv, beanId, level } = await setup();
    await expect(previewCurveEdit(db, { beanId, version: 9, level }, climbEnv)).rejects.toThrow("Bean 1 has no v9.");
    await expect(previewCurveEdit(db, { beanId, level: 7 }, climbEnv)).rejects.toThrow("Level must be between 0 and 6; got 7.");
    // Float noise on a grid level is the same level, and is stored and shown as such.
    const noisy = await previewCurveEdit(db, { beanId, level: 0.1 + 0.2 }, climbEnv);
    expect(noisy.edit.level).toBe(0.3);
    expect(noisy.onYes.input.level).toBe(0.3);
    await expect(previewCurveEdit(db, { beanId, level: 0.249 }, climbEnv)).rejects.toThrow("Level must be in steps of 0.1; got 0.249.");
    await expect(previewCurveEdit(db, { beanId, level: 2.65 }, climbEnv)).rejects.toThrow("steps of 0.1");
    await expect(previewCurveEdit(db, { beanId, level, extra: 1 }, climbEnv)).rejects.toBeInstanceOf(InputError);
  });

  it("refuses a version with no stored file and no copy of its stock profile in the library", async () => {
    const db = await migratedDb();
    const bare = { ...env, library: [] };
    const { beanId, version } = await addBeanWithProfile(db, YIRG, bare);
    await expect(previewCurveEdit(db, { beanId, level: version.level }, bare)).rejects.toThrow("so there's no curve to edit");
  });

  it("refuses a curve with only two nodes", async () => {
    const db = await migratedDb();
    const { beanId, version } = await addBeanWithProfile(db, YIRG, env);
    await expect(previewCurveEdit(db, { beanId, level: version.level + 1 }, env)).rejects.toThrow("The curve has 2 nodes");
  });

  it("refuses a curve whose last segment is not one straight climb", async () => {
    const bent = await setup(BENT_CLIMB_CURVE);
    await expect(previewCurveEdit(bent.db, { beanId: bent.beanId, level: bent.level + 1 }, bent.climbEnv)).rejects.toThrow("not one straight climb");
  });
});

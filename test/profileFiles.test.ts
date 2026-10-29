import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { evalCurve, parseKpro, timeCurveReaches } from "../src/adapters/kaffelogic/parse.js";
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
    expect(preview.edit.climb!.slopeAfterCPerMin).toBeGreaterThan(preview.edit.climb!.slopeBeforeCPerMin);
    expect(preview.edit).not.toHaveProperty("reach");
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

  it("stamps the file it hands to version:add as the tool's, with a description of the edit", async () => {
    const { db, climbEnv, beanId, level } = await setup();
    const stored = parseKpro((await previewCurveEdit(db, { beanId, level: level + 1 }, climbEnv)).onYes.input.profileFile);
    expect(stored.designer).toBe(EDITED_CURVE_DESIGNER);
    expect(stored.description).toMatch(/^Curve edited from v1's curve: the climb after 5:00/);
    expect(stored.description).not.toContain("unchanged");
  });

  it("is written by profile:write as an edited curve, from the mark in the stored file, and the credit survives later versions", async () => {
    const { db, climbEnv, beanId, level } = await setup();
    await addVersion(db, (await previewCurveEdit(db, { beanId, level: level + 1 }, climbEnv)).onYes.input);
    // A level-only version after the edit inherits the edited file; a second edit stamps its own.
    await addVersion(db, { beanId, level: level + 1.2, reason: "A level change only" });
    await addVersion(db, (await previewCurveEdit(db, { beanId, version: 2, level: level + 1.2 }, climbEnv)).onYes.input);
    for (const version of [2, 3, 4]) {
      const written = parseKpro(readFileSync((await writeVersionProfile(db, { beanId, version }, climbEnv)).written, "utf8"));
      expect(written.designer, `v${version}`).toBe(EDITED_CURVE_DESIGNER);
      expect(written.description, `v${version}`).toContain("Curve edited by roasting-coach (profile:edit).");
      expect(written.description, `v${version}`).not.toContain("are those of");
    }
  });

  it("describes a version nobody edited as the unchanged curve and keeps the base designer, whatever the library holds", async () => {
    const { db, climbEnv, beanId, level } = await setup();
    await addVersion(db, { beanId, level: level + 1, reason: "A level change only" });
    for (const [library, version] of [[climbEnv.library, 1], [climbEnv.library, 2], [[], 1], [[], 2]] as const) {
      const written = parseKpro(readFileSync((await writeVersionProfile(db, { beanId, version }, { ...climbEnv, library: [...library], outDir: join(outDir, `lib${library.length}`) })).written, "utf8"));
      expect(written.designer, `v${version}, ${library.length} library files`).toBe("A. Designer");
      expect(written.description, `v${version}`).toContain("Curve and settings are those of");
      expect(written.description, `v${version}`).not.toContain("Curve edited");
    }
  });

  it("keeps the designer of a stock profile a version was recorded as, with or without its copy in the library", async () => {
    const { db, climbEnv, beanId, level } = await setup();
    const otherFan = profileWithCurve(CLIMB_CURVE)
      .replace("profile_short_name:Test line", "profile_short_name:2000-2700m RTD")
      .replace("profile_designer:roasting-coach tests", "profile_designer:B. Designer")
      .replace("fan_profile:0,14700,0,0,100,14700,600,13200,500,13200,0,0", "fan_profile:0,12000,0,0,100,12000,600,11000,500,11000,0,0");
    expect(otherFan).toContain("fan_profile:0,12000"); // the substitution matched, so this stock file's body differs from KL Washed's
    await addVersion(db, { beanId, profileName: "2000-2700m RTD", profileFile: otherFan, level, reason: "Try the other stock profile" });
    for (const library of [climbEnv.library, [...climbEnv.library, { path: "2000-2700m RTD.kpro", text: otherFan }]]) {
      const written = parseKpro(readFileSync((await writeVersionProfile(db, { beanId, version: 2 }, { ...climbEnv, library, outDir: join(outDir, `lib${library.length}`) })).written, "utf8"));
      expect(written.designer).toBe("B. Designer");
      expect(written.description).toContain("Curve and settings are those of 2000-2700m RTD.");
    }
  });

  it("describes a version built from the library's copy, with nothing stored, as that profile's curve", async () => {
    const db = await migratedDb();
    const { beanId } = await addBeanWithProfile(db, YIRG, { ...env, library: [] });
    const withCopy = { ...env, library: climbLibrary() };
    const written = parseKpro(readFileSync((await writeVersionProfile(db, { beanId, version: 1 }, withCopy)).written, "utf8"));
    expect(written.designer).toBe("A. Designer");
    expect(written.description).toContain("Curve and settings are those of KL Washed.");
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

  describe("retimed from checkpoints (reach)", () => {
    // The made-up curve reaches 150 °C at 111 s and 200 °C at 310 s.
    it("previews a curve that reaches a temperature when asked, at the version's own level, and records nothing", async () => {
      const { db, climbEnv, beanId, level } = await setup();
      const before = { versions: (await beanHistory(db, beanId)).versions.length, files: readdirSync(outDir) };
      const preview = await previewCurveEdit(db, { beanId, reach: { "150": 150 } }, climbEnv);
      expect(preview.say).toContain("the curve is retimed");
      expect(preview.say).toContain("150 °C 1:51 to 2:30 (asked for)");
      expect(preview.say).toContain("Shall I record it as the next version?");
      expect(preview.say).not.toMatch(/(?<!thermal )\bdose\b/);
      expect(preview.edit).toMatchObject({ level, reach: [{ tempC: 150, atS: 150 }] });
      expect(preview.edit).not.toHaveProperty("climb");
      expect(preview.onYes).toMatchObject({ command: "version:add", input: { beanId, parent: 1, level } });
      expect((await beanHistory(db, beanId)).versions).toHaveLength(before.versions);
      expect(readdirSync(outDir)).toEqual(before.files);
    });

    it("says how far the predicted thermal dose moved, calling it about the same only within 3%", async () => {
      const { db, climbEnv, beanId } = await setup();
      const small = await previewCurveEdit(db, { beanId, reach: { "150": 150 } }, climbEnv);
      expect(Math.abs(small.edit.thermalDose / small.from.thermalDose - 1)).toBeLessThan(0.03);
      expect(small.say).toContain("about the same");
      const large = await previewCurveEdit(db, { beanId, reach: { "200": 370 } }, climbEnv);
      expect(large.edit.thermalDose).toBeGreaterThan(large.from.thermalDose * 1.03);
      expect(large.say).toMatch(/more heat than v1, not the same/);
      expect(large.say).not.toContain("about the same");
    });

    it("says that the thermal dose counts little below 190 °C when every checkpoint is below it, and not otherwise", async () => {
      const { db, climbEnv, beanId } = await setup();
      expect((await previewCurveEdit(db, { beanId, reach: { "150": 150 } }, climbEnv)).say).toMatch(/counts very little below 190 °C \(\d+% of this curve's total comes before it\)/);
      expect((await previewCurveEdit(db, { beanId, reach: { "150": 150, "200": 330 } }, climbEnv)).say).not.toContain("counts very little");
    });

    it("says where the rate of rise picks up again, and leaves it to the roaster", async () => {
      const { db, climbEnv, beanId } = await setup();
      const preview = await previewCurveEdit(db, { beanId, reach: { "150": 160 } }, climbEnv);
      expect(preview.say).toMatch(/The rate of rise picks up again around \d:\d\d \(from [\d.]+ to [\d.]+ °C\/min\)/);
      expect(preview.say).toContain("It is your choice.");
      expect(preview.edit.rateOfRiseRisesAt).toHaveLength(1);
      expect((await previewCurveEdit(db, { beanId, reach: { "150": 130 } }, climbEnv)).say).not.toContain("rate of rise");
    });

    it("holds the version's thermal dose when a level is given too: the retime first, then the last climb makes up the difference", async () => {
      const { db, climbEnv, beanId, level } = await setup();
      const preview = await previewCurveEdit(db, { beanId, reach: { "180": 250 }, level }, climbEnv);
      expect(Math.abs(preview.edit.thermalDose - preview.from.thermalDose) / preview.from.thermalDose).toBeLessThan(1e-4);
      expect(preview.edit.climb!.slopeAfterCPerMin).toBeGreaterThan(preview.edit.climb!.slopeBeforeCPerMin);
      expect(preview.say).toMatch(/Then the climb after \d:\d\d .* goes from [\d.]+ to [\d.]+ °C\/min/);
      expect(preview.say).toContain("The curve's predicted thermal dose stays");
      expect(preview.say).not.toContain("The curve before");
      expect(preview.onYes.input.reason).toMatch(/^Curve edit: reaches 180 °C at 4:10 instead of 3:28; the climb after .*, holding the predicted thermal dose of v1\.$/);
    });

    it("gives an onYes that version:add stores, as a curve that reaches the temperature at the second asked for", async () => {
      const { db, climbEnv, beanId, level } = await setup();
      const preview = await previewCurveEdit(db, { beanId, reach: { "150": 150, "180": 240 }, reason: "Slower drying" }, climbEnv);
      expect(preview.onYes.input.reason).toBe("Slower drying");
      expect(await addVersion(db, preview.onYes.input)).toMatchObject({ number: 2, parentNumber: 1, level, hasProfileFile: true });
      const stored = parseKpro(preview.onYes.input.profileFile);
      expect(evalCurve(stored.roastCurve, 150)).toBeCloseTo(150, 1);
      expect(evalCurve(stored.roastCurve, 240)).toBeCloseTo(180, 1);
      expect(timeCurveReaches(stored.roastCurve, 150, 0.1)).toBeCloseTo(150, 0);
      expect(stored.roastLevels).toEqual(parseKpro(profileWithCurve(CLIMB_CURVE)).roastLevels);
      expect(stored.designer).toBe(EDITED_CURVE_DESIGNER);
      expect(stored.description).toContain("reaches 150 °C at 2:30 instead of 1:51, 180 °C at 4:00");
    });

    it("describes its own reason in measured terms when the roaster gives none", async () => {
      const { db, climbEnv, beanId } = await setup();
      const preview = await previewCurveEdit(db, { beanId, reach: { "150": 150 } }, climbEnv);
      expect(preview.onYes.input.reason).toBe("Curve edit: reaches 150 °C at 2:30 instead of 1:51.");
    });

    it("needs no straight last climb when it only retimes, and says so when a level is asked for on a curve without one", async () => {
      const bent = await setup(BENT_CLIMB_CURVE);
      expect((await previewCurveEdit(bent.db, { beanId: bent.beanId, reach: { "150": 150 } }, bent.climbEnv)).edit.reach).toHaveLength(1);
      await expect(previewCurveEdit(bent.db, { beanId: bent.beanId, reach: { "150": 150 }, level: bent.level + 1 }, bent.climbEnv)).rejects.toThrow("not one straight climb");
    });

    it("refuses a checkpoint the curve cannot have, in plain words and with the version", async () => {
      const { db, climbEnv, beanId } = await setup();
      await expect(previewCurveEdit(db, { beanId, reach: { "90": 40 } }, climbEnv)).rejects.toThrow("v1: A checkpoint at 90 °C is in the machine's heat-up");
      await expect(previewCurveEdit(db, { beanId, reach: { "150": 75 } }, climbEnv)).rejects.toThrow("no stock profile climbs faster than");
      await expect(previewCurveEdit(db, { beanId, reach: { "150": 30 } }, climbEnv)).rejects.toThrow("where the machine's start-up ends");
      await expect(previewCurveEdit(db, { beanId, reach: { "150": 200, "180": 190 } }, climbEnv)).rejects.toThrow("a hotter temperature comes later");
    });

    it("refuses a reach that is not temperatures with seconds, and a call that edits nothing", async () => {
      const { db, climbEnv, beanId } = await setup();
      await expect(previewCurveEdit(db, { beanId, reach: {} }, climbEnv)).rejects.toThrow('"reach" needs a temperature and the second');
      await expect(previewCurveEdit(db, { beanId, reach: { hot: 150 } }, climbEnv)).rejects.toThrow('"reach" takes a temperature in °C and the second the curve reaches it');
      await expect(previewCurveEdit(db, { beanId, reach: { "150": "soon" } }, climbEnv)).rejects.toThrow('"reach" takes a temperature');
      await expect(previewCurveEdit(db, { beanId, reach: [150, 200] }, climbEnv)).rejects.toThrow('"reach" must be an object');
      await expect(previewCurveEdit(db, { beanId }, climbEnv)).rejects.toThrow('Say what to edit: "reach"');
    });
  });

  describe("drawn through points (through)", () => {
    // A made-up roast whose rate of rise falls throughout, and one that stalls and then spikes past 200 °C.
    const ROAST = [[0, 20], [60, 110], [120, 160], [180, 186], [260, 204], [340, 214], [420, 222], [500, 229]];
    const FLICK = [[0, 20], [60, 110], [120, 160], [180, 190], [260, 197], [320, 200], [380, 220], [440, 240]];

    it("previews a whole curve through the points, at the version's own level, and records nothing", async () => {
      const { db, climbEnv, beanId, level } = await setup();
      const before = { versions: (await beanHistory(db, beanId)).versions.length, files: readdirSync(outDir) };
      const preview = await previewCurveEdit(db, { beanId, through: ROAST }, climbEnv);
      expect(preview.say).toContain("the whole curve is redrawn through 8 points, from 0:00 (20 °C) to 8:20 (229 °C)");
      expect(preview.say).toContain("Time to each temperature, before to after:");
      expect(preview.say).toContain("Shall I record it as the next version?");
      expect(preview.say).not.toMatch(/(?<!thermal )\bdose\b/);
      expect(preview.say).not.toContain("hold the thermal dose");
      expect(preview.edit).toMatchObject({ level, through: ROAST.map(([t, v]) => ({ t, v })) });
      expect(preview.edit).not.toHaveProperty("climb");
      expect(preview.edit).not.toHaveProperty("reach");
      expect(preview.onYes).toMatchObject({ command: "version:add", input: { beanId, parent: 1, level } });
      expect((await beanHistory(db, beanId)).versions).toHaveLength(before.versions);
      expect(readdirSync(outDir)).toEqual(before.files);
    });

    it("gives an onYes that version:add stores, as a curve through every point", async () => {
      const { db, climbEnv, beanId, level } = await setup();
      const preview = await previewCurveEdit(db, { beanId, through: ROAST, reason: "A slower Maillard stretch" }, climbEnv);
      expect(await addVersion(db, preview.onYes.input)).toMatchObject({ number: 2, parentNumber: 1, level, hasProfileFile: true });
      const stored = parseKpro(preview.onYes.input.profileFile);
      expect(stored.roastCurve).toHaveLength(ROAST.length);
      for (const [t, v] of ROAST) expect(evalCurve(stored.roastCurve, t)).toBeCloseTo(v, 1);
      expect(stored.roastLevels).toEqual(parseKpro(profileWithCurve(CLIMB_CURVE)).roastLevels);
      expect(stored.designer).toBe(EDITED_CURVE_DESIGNER);
      expect(stored.description).toContain("redrawn through 8 points, 0:00 to 8:20, 20 to 229 °C");
    });

    it("compares the predicted thermal dose with the version's, and takes a level only to say where the roast stops", async () => {
      const { db, climbEnv, beanId, level } = await setup();
      const same = await previewCurveEdit(db, { beanId, through: ROAST }, climbEnv);
      expect(same.say).toMatch(/The curve's predicted thermal dose goes from [\d.]+ to [\d.]+ \([+-][\d.]+%\)/);
      expect(same.say).toContain(`The roast still ends at level ${level}`);
      const hotter = await previewCurveEdit(db, { beanId, through: ROAST, level: level + 1 }, climbEnv);
      expect(hotter.edit.level).toBe(level + 1);
      expect(hotter.edit.endTempC).toBeGreaterThan(same.edit.endTempC);
      expect(hotter.edit.thermalDose).toBeGreaterThan(same.edit.thermalDose);
      expect(hotter.say).toContain(`The roast ends at level ${level + 1}`);
      expect(hotter.onYes.input.level).toBe(level + 1);
      expect(hotter.edit).not.toHaveProperty("climb");
    });

    it("says where the rate of rise picks up again and where the curve climbs faster late than any stock profile, and neither for a gentle one", async () => {
      const { db, climbEnv, beanId } = await setup();
      const gentle = await previewCurveEdit(db, { beanId, through: ROAST }, climbEnv);
      expect(gentle.say).not.toContain("rate of rise");
      expect(gentle.say).not.toContain("stock profile goes above");
      expect(gentle.edit.rateOfRiseRisesAt).toEqual([]);
      const flick = await previewCurveEdit(db, { beanId, through: FLICK }, climbEnv);
      expect(flick.say).toMatch(/The rate of rise picks up again around \d:\d\d/);
      expect(flick.say).toMatch(/The curve climbs at \d+ °C\/min at \d:\d\d, past 200 °C, where no stock profile goes above 13: the Nano may not keep up, and the roast would then end later than the curve says\. It is your choice\./);
      expect(flick.edit).toMatchObject({ climbsFasterThanStock: { stockCPerMin: 13 } });
    });

    it("refuses points the curve cannot be drawn through, in plain words and with the version", async () => {
      const { db, climbEnv, beanId } = await setup();
      await expect(previewCurveEdit(db, { beanId, through: ROAST.slice(0, 3) }, climbEnv)).rejects.toThrow("v1: Give at least 4 points");
      await expect(previewCurveEdit(db, { beanId, through: [[0, 20], [60, 110], [120, 100], [200, 190]] }, climbEnv)).rejects.toThrow("a roast curve rises at every point");
      await expect(previewCurveEdit(db, { beanId, through: [[0, 20], [60, 100], [65, 160], [200, 190]] }, climbEnv)).rejects.toThrow("no stock profile climbs faster than 116");
    });

    it("refuses points that are not a second and a temperature, a list that is not a list, and reach and through together", async () => {
      const { db, climbEnv, beanId } = await setup();
      await expect(previewCurveEdit(db, { beanId, through: [[0, 20], [60], [120, 160], [200, 190]] }, climbEnv)).rejects.toThrow('"through" takes points, each the second and the temperature in °C');
      await expect(previewCurveEdit(db, { beanId, through: [[0, 20], [60, "hot"], [120, 160], [200, 190]] }, climbEnv)).rejects.toThrow('"through" takes points');
      await expect(previewCurveEdit(db, { beanId, through: { "60": 110 } }, climbEnv)).rejects.toThrow('"through" must be a list');
      await expect(previewCurveEdit(db, { beanId, through: ROAST, reach: { "150": 150 } }, climbEnv)).rejects.toThrow('give one of them');
    });
  });
});

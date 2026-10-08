import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { INTAKE_FIELDS, TASTING_FIELDS } from "../src/core/intake.js";
import { checkAnswers } from "../src/core/validate.js";
import { type Db, InputError, addBean, addRoast, addTasting, addVersion, beanHistory, listBeans, removeBean, updateBean, updateTasting, versionProfileFile } from "../src/db/store.js";
import { migratedDb } from "./pg.js";
import { PROFILE, syntheticLog } from "./syntheticLog.js";

const GUJI = { name: "Ethiopia Guji", species: "arabica", decaf: false, process: "washed", goal: "espresso", drinkWhen: "rest", altitudeM: 1950, sellerNotes: "peach, jasmine" };

describe("checkAnswers", () => {
  it("accepts a complete intake and keeps only answered fields", () => {
    expect(checkAnswers(INTAKE_FIELDS, GUJI)).toEqual({ ok: true, values: GUJI });
  });

  it("explains every problem in plain words", () => {
    const r = checkAnswers(INTAKE_FIELDS, { ...GUJI, name: "", process: "wet", altitudeM: 4000, colour: "brown" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual([
      '"colour" is not a field on this form.',
      "Bean name is required.",
      'Processing: "wet" isn\'t an option. Options: washed, natural, honey, anaerobic, wet-hulled, unknown.',
      "Altitude must be between 0 and 3000 m; got 4000 m.",
    ]);
  });

  it("takes numbers for choices like the roast quality, and drops repeated chips", () => {
    const r = checkAnswers(TASTING_FIELDS, { tastedOn: "2026-10-08", brew: "espresso", quality: 4, taste: ["sour", "sour", "thin"] });
    expect(r).toEqual({ ok: true, values: { tastedOn: "2026-10-08", brew: "espresso", quality: "4", taste: ["sour", "thin"] } });
  });

  it("treats whitespace-only answers as unanswered", () => {
    const r = checkAnswers(INTAKE_FIELDS, { ...GUJI, name: "   ", altitudeM: "  " });
    expect(r.ok ? [] : r.errors).toEqual(["Bean name is required."]);
    const ok = checkAnswers(INTAKE_FIELDS, { ...GUJI, origin: " " });
    expect(ok.ok && ok.values).not.toHaveProperty("origin");
  });

  it("rejects calendar dates that don't exist, which Date.parse would roll over", () => {
    const r = checkAnswers(TASTING_FIELDS, { tastedOn: "2026-02-30", brew: "espresso", quality: 4, taste: ["sweet"] });
    expect(r.ok ? [] : r.errors).toEqual(["Tasted on must be a date like 2026-10-04."]);
    expect(checkAnswers(TASTING_FIELDS, { tastedOn: "2028-02-29", brew: "espresso", quality: 4, taste: ["sweet"] }).ok).toBe(true);
  });

  it("rejects malformed dates and a list for a one-answer choice", () => {
    const r = checkAnswers(TASTING_FIELDS, { tastedOn: "8 Oct", brew: ["espresso"], quality: 4, taste: ["sweet"] });
    expect(r.ok ? [] : r.errors).toEqual(["Tasted on must be a date like 2026-10-04.", "Brewed as takes one answer."]);
  });
});

describe("store", () => {
  let pg: PGlite;
  let db: Db;
  // Ids are captured as tests create rows, never assumed, so a test can be run or moved alone.
  let gujiId: number;
  let firstRoastId: number;
  beforeAll(async () => {
    pg = await migratedDb();
    db = pg;
  });

  /** The synthetic log under another name, level or levels; each edit must actually apply. */
  const editLog = (edits: [string, string][], base = syntheticLog({ roast_end: 600 })) =>
    edits.reduce((log, [from, to]) => {
      expect(log, `fixture edit "${from}"`).toContain(from);
      return log.replace(from, to);
    }, base);

  it("stores a bean with its starting profile as v1", async () => {
    const r = await addBean(db, GUJI);
    gujiId = r.beanId;
    expect(r.version).toMatchObject({ number: 1, profileName: "1500-2000m Rest", level: 3.2, endTempC: 222.4, parentNumber: undefined });
    expect(r.version.changeReason).toMatch(/^Starting profile\. Grown at 1950 m/);
    expect(r.alternative).toBe("KL Washed");
  });

  it("stores nothing when the intake is incomplete", async () => {
    await expect(addBean(db, { name: "Half" })).rejects.toBeInstanceOf(InputError);
    expect(await listBeans(db)).toHaveLength(1);
  });

  it("records a roast with its log; an unroasted plan becomes what was actually roasted", async () => {
    const r = await addRoast(db, { beanId: gujiId, klog: syntheticLog({ first_crack: 540, roast_end: 600 }), answers: { greenG: 120, roastedG: 101.5, looks: ["even"] } });
    firstRoastId = r.roastId;
    expect(r).toMatchObject({ version: 1, weightLossPct: 15.4, roastedAt: "2025-06-25T14:21:55Z", warnings: [] });
    expect(r.features?.firstCrack?.t).toBe(540);
    expect(r.versionChange).toBe("v1 hadn't been roasted yet, so it now records what was: Test line at level 3.3 (planned: 1500-2000m Rest at level 3.2).");
    const [v1] = (await beanHistory(db, gujiId)).versions;
    // Test line isn't a stock profile, so v1 keeps the copy the log carries; its levels give 219 + 0.3 * 3 = 219.9 °C.
    expect(v1).toMatchObject({ profileName: "Test line", level: 3.3, endTempC: 219.9, hasProfileFile: true, baseProfile: "1500-2000m Rest" });
    expect(v1.changeReason).toMatch(/Planned 1500-2000m Rest at level 3\.2; roasted Test line at level 3\.3\.$/);
  });

  it("asks for the date when the log has none", async () => {
    const undated = syntheticLog({ roast_end: 600 }).replace(/^roast_date:.*\n/m, "");
    expect(undated).not.toMatch(/^roast_date:/m);
    await expect(addRoast(db, { beanId: gujiId, klog: undated, answers: { greenG: 120, roastedG: 102 } })).rejects.toThrow("The log has no roast date. When was it roasted?");
  });

  it("records a roast without a log, and rejects impossible weights", async () => {
    expect((await addRoast(db, { beanId: gujiId, answers: { greenG: 120, roastedG: 103 } })).features).toBeUndefined();
    await expect(addRoast(db, { beanId: gujiId, answers: { greenG: 120, roastedG: 125 } })).rejects.toThrow("Roasted weight must be less than green weight.");
  });

  it("explains input that doesn't fit a command, instead of dropping or crashing on it", async () => {
    await expect(addRoast(db, { beanId: gujiId, klogpath: "x", answers: { greenG: 120, roastedG: 102 } } as never)).rejects.toMatchObject({
      errors: ['"klogpath" isn\'t recognised. Use: beanId, version, klog, roastedAt, answers, reason.'],
    });
    await expect(addVersion(db, { beanId: gujiId, level: "3.6", reason: "x" } as never)).rejects.toMatchObject({ errors: ['"level" must be a number; got "3.6".'] });
    await expect(addTasting(db, { beanId: "two" } as never)).rejects.toMatchObject({ errors: ['"beanId" must be a whole number above 0; got "two".', '"answers" is required.'] });
  });

  it("records a tasting against a chosen roast and counts days rested", async () => {
    const r = await addTasting(db, { beanId: gujiId, roastId: firstRoastId, answers: { tastedOn: "2025-06-29", brew: "espresso", quality: 2, taste: ["sour", "thin"] } });
    expect(r).toEqual({ tastingId: expect.any(Number), roastId: firstRoastId, version: 1, daysRested: 4 });
  });

  it("adds a version from the newest one, working out the end temperature for stock profiles", async () => {
    const v2 = await addVersion(db, { beanId: gujiId, profileName: "1500-2000m Rest", level: 3.6, reason: "Sour and thin at 4 days: go darker." });
    expect(v2).toMatchObject({ number: 2, parentNumber: 1, level: 3.6, endTempC: 222.9 });
    const own = await addVersion(db, { beanId: gujiId, profileName: "My Guji", level: 3, endTempC: 221, reason: "Own curve: longer Maillard." });
    expect(own).toMatchObject({ number: 3, parentNumber: 2, endTempC: 221 });
  });

  it("explains what's missing from a new version", async () => {
    await expect(addVersion(db, { beanId: gujiId, level: 7, reason: " " })).rejects.toMatchObject({
      errors: ["Say in one line what changed and why.", "Level must be between 0 and 6; got 7."],
    });
    await expect(addVersion(db, { beanId: gujiId, profileName: "My Guji", level: 3, reason: "x" })).rejects.toThrow(
      '"My Guji" isn\'t a stock profile and has no stored file, so give its end temperature (endTempC) too.',
    );
    await expect(addVersion(db, { beanId: gujiId, parent: 9, profileName: "1500-2000m Rest", level: 3, reason: "x" })).rejects.toThrow(`Bean ${gujiId} has no v9.`);
  });

  it("returns the whole history, version by version, with dates as plain dates", async () => {
    const h = await beanHistory(db, gujiId);
    expect(h.versions.map((v) => [v.number, v.roasts.length])).toEqual([[1, 2], [2, 0], [3, 0]]);
    const first = h.versions[0].roasts[0];
    expect(first).toMatchObject({ id: firstRoastId, weightLossPct: 15.4, logLevel: 3.3, looks: ["even"], tastings: [{ quality: 2, taste: ["sour", "thin"] }] });
    expect(first.features?.firstCrack?.t).toBe(540);
    // Dates come back as the date written, whatever the driver or time zone.
    expect(first.tastings[0].tastedOn).toBe("2025-06-29");
    expect(h.bean).toMatchObject({ name: "Ethiopia Guji", altitude_m: 1950 });
    expect(await listBeans(db)).toMatchObject([{ id: gujiId, name: "Ethiopia Guji", versions: 3 }]);
  });

  it("keeps the parent's profile when only the level changes", async () => {
    const { beanId } = await addBean(db, { ...GUJI, name: "Kenya" });
    const v2 = await addVersion(db, { beanId, level: 3.6, reason: "Sour: one step darker." });
    expect(v2).toMatchObject({ number: 2, profileName: "1500-2000m Rest", level: 3.6, endTempC: 222.9, baseProfile: "1500-2000m Rest", hasProfileFile: false });
  });

  it("can give v1 the bean's own profile file, which level changes keep using", async () => {
    let asked: unknown;
    const own = PROFILE.replace("profile_short_name:Test line", "profile_short_name:Burundi");
    expect(own).toContain("profile_short_name:Burundi");
    const { beanId, version } = await addBean(db, { ...GUJI, name: "Burundi" }, (start) => {
      asked = start;
      return { profileName: "Burundi", profileFile: own };
    });
    expect(asked).toMatchObject({ beanName: "Burundi", stockName: "1500-2000m Rest", level: 3.2, endTempC: 222.4 });
    expect(version).toMatchObject({ number: 1, profileName: "Burundi", level: 3.2, endTempC: 222.4, baseProfile: "1500-2000m Rest", hasProfileFile: true });
    const v2 = await addVersion(db, { beanId, level: 3.6, reason: "Sour: darker." });
    // Level 3.6 on the file's own levels (204..226 °C) is 220.8 °C.
    expect(v2).toMatchObject({ profileName: "Burundi", endTempC: 220.8, hasProfileFile: true });
    expect(await versionProfileFile(db, beanId, 2)).toBe(own);
  });

  it("starts a new version when an already-roasted version's log differs, and only with a reason", async () => {
    const { beanId } = await addBean(db, { ...GUJI, name: "Rwanda" });
    const log = (level: number) => editLog([["roasting_level:3.3", `roasting_level:${level}`]]);
    const answers = { greenG: 120, roastedG: 102 };
    expect((await addRoast(db, { beanId, klog: log(3.3), answers })).versionChange).toMatch(/^v1 hadn't been roasted yet/);
    expect(await addRoast(db, { beanId, klog: log(3.3), answers })).toMatchObject({ version: 1, versionChange: undefined });
    await expect(addRoast(db, { beanId, klog: log(3.8), answers })).rejects.toThrow(
      "This log was roasted on Test line at level 3.8, but v1 is Test line at level 3.3 and has already been roasted. Say in one line what you changed and why, and it will be recorded as a new version.",
    );
    const r = await addRoast(db, { beanId, klog: log(3.8), answers, reason: "Sour: tried darker." });
    expect(r).toMatchObject({ version: 2, versionChange: "Recorded as v2: Test line at level 3.8 (v1 is Test line at level 3.3)." });
    expect((await beanHistory(db, beanId)).versions.map((v) => [v.number, v.level, v.roasts.length])).toEqual([[1, 3.3, 2], [2, 3.8, 1]]);
  });

  it("treats a profile renamed for the bean as the same profile as the one it copies", async () => {
    const renamed = PROFILE.replace("profile_short_name:Test line", "profile_short_name:Kigali");
    expect(renamed).toContain("profile_short_name:Kigali");
    const { beanId } = await addBean(db, { ...GUJI, name: "Kigali" }, () => ({ profileName: "Kigali", profileFile: renamed }));
    // The log was roasted on "Test line" at the planned level: same curve, so it is v1 as planned.
    const log = editLog([["roasting_level:3.3", "roasting_level:3.2"]]);
    expect(await addRoast(db, { beanId, klog: log, answers: { greenG: 120, roastedG: 102 } })).toMatchObject({ version: 1, versionChange: undefined });
    expect((await beanHistory(db, beanId)).versions[0]).toMatchObject({ profileName: "Kigali", level: 3.2 });
  });

  it("treats a curve edited on the machine under the same name as a different profile", async () => {
    // v1 is the test profile itself; the log keeps its name and level but its curve ends 2 °C hotter.
    const { beanId } = await addBean(db, { ...GUJI, name: "Edited" }, () => ({ profileName: "Test line", profileFile: PROFILE }));
    const edited = editLog([
      ["roasting_level:3.3", "roasting_level:3.2"],
      ["600,220,400,153.333", "600,222,400,155.333"],
    ]);
    const answers = { greenG: 120, roastedG: 102 };
    const r = await addRoast(db, { beanId, klog: edited, answers });
    expect(r.versionChange).toBe("v1 hadn't been roasted yet, so it now records what was: Test line (a different curve or settings under the same name) at level 3.2 (planned: Test line at level 3.2).");
    // v1 now holds the edited curve, so the same edited log matches it.
    expect(await addRoast(db, { beanId, klog: edited, answers })).toMatchObject({ version: 1, versionChange: undefined });
  });

  it("compares a stock version with a log by the stock levels, then keeps the log's profile", async () => {
    // The bean starts on stock 1500-2000m Rest at 3.2. A log under that name with its real levels is that profile.
    const { beanId } = await addBean(db, { ...GUJI, name: "Stock" });
    const asStock = (levels: string) =>
      editLog([
        ["profile_short_name:Test line", "profile_short_name:1500-2000m Rest"],
        ["roast_levels:204,209,214,219,222,224,226", `roast_levels:${levels}`],
        ["roasting_level:3.3", "roasting_level:3.2"],
      ]);
    const answers = { greenG: 120, roastedG: 102 };
    expect(await addRoast(db, { beanId, klog: asStock("205,217,218.2,222.1,223.5,228.2,241"), answers })).toMatchObject({ version: 1, versionChange: undefined });
    expect((await beanHistory(db, beanId)).versions[0]).toMatchObject({ profileName: "1500-2000m Rest", hasProfileFile: true });
    // Same name, edited levels: not the same profile any more, and v1 has been roasted, so it needs a reason.
    await expect(addRoast(db, { beanId, klog: asStock("205,217,218.2,222.1,223.5,228.2,242"), answers })).rejects.toThrow(
      /^This log was roasted on 1500-2000m Rest \(a different curve or settings under the same name\) at level 3\.2/,
    );
  });

  it("catches a stock profile edited under its own name even on a version's first log", async () => {
    // Nothing is stored for a stock version until its first log, so the stock levels are all there is to compare.
    const { beanId } = await addBean(db, { ...GUJI, name: "Stock edited" });
    const edited = editLog([
      ["profile_short_name:Test line", "profile_short_name:1500-2000m Rest"],
      ["roast_levels:204,209,214,219,222,224,226", "roast_levels:205,217,218.2,222.1,223.5,228.2,242"],
      ["roasting_level:3.3", "roasting_level:3.2"],
    ]);
    const r = await addRoast(db, { beanId, klog: edited, answers: { greenG: 120, roastedG: 102 } });
    expect(r.versionChange).toBe(
      "v1 hadn't been roasted yet, so it now records what was: 1500-2000m Rest (a different curve or settings under the same name) at level 3.2 (planned: 1500-2000m Rest at level 3.2).",
    );
  });

  it("checks a stock version body to body against the roaster's own copy of the stock profile", async () => {
    // The roaster's library holds the stock profile (here, the test curve with the stock name and levels).
    const levels = "205,217,218.2,222.1,223.5,228.2,241";
    const stockCopy = PROFILE.replace("profile_short_name:Test line", "profile_short_name:1500-2000m Rest").replace(
      "roast_levels:204,209,214,219,222,224,226",
      `roast_levels:${levels}`,
    );
    expect(stockCopy).toContain("profile_short_name:1500-2000m Rest");
    expect(stockCopy).toContain(`roast_levels:${levels}`);
    const library = [{ path: "1500-2000m Rest v1.0.kpro", text: stockCopy }];
    // A log under the stock name with the stock levels, but its curve edited to end 2 °C hotter.
    const curveEdited = editLog([
      ["profile_short_name:Test line", "profile_short_name:1500-2000m Rest"],
      ["roast_levels:204,209,214,219,222,224,226", `roast_levels:${levels}`],
      ["roasting_level:3.3", "roasting_level:3.2"],
      ["600,220,400,153.333", "600,222,400,155.333"],
    ]);
    const answers = { greenG: 120, roastedG: 102 };
    const caught = await addBean(db, { ...GUJI, name: "Stock copy" });
    expect((await addRoast(db, { beanId: caught.beanId, klog: curveEdited, answers }, library)).versionChange).toMatch(
      /^v1 hadn't been roasted yet, so it now records what was: 1500-2000m Rest \(a different curve or settings under the same name\)/,
    );
    // Without the library only the stock levels can be compared, so this edit can't be seen.
    const blind = await addBean(db, { ...GUJI, name: "No library" });
    expect(await addRoast(db, { beanId: blind.beanId, klog: curveEdited, answers })).toMatchObject({ version: 1, versionChange: undefined });
  });

  it("keeps a curve edited under a stock name as roasted, unless the roaster's stock copy confirms it", async () => {
    // v1 is stock 1500-2000m Rest and its first log matches it (so v1 now holds that profile).
    const levels = "205,217,218.2,222.1,223.5,228.2,241";
    const asStock = (curveEnd: string) =>
      editLog([
        ["profile_short_name:Test line", "profile_short_name:1500-2000m Rest"],
        ["roast_levels:204,209,214,219,222,224,226", `roast_levels:${levels}`],
        ["roasting_level:3.3", "roasting_level:3.2"],
        ["600,220,400,153.333", curveEnd],
      ]);
    const answers = { greenG: 120, roastedG: 102 };
    const { beanId } = await addBean(db, { ...GUJI, name: "Kept edit" });
    expect(await addRoast(db, { beanId, klog: asStock("600,220,400,153.333"), answers })).toMatchObject({ version: 1, versionChange: undefined });
    // Next roast: same name and levels, curve edited. With no local stock copy, the edit must be kept.
    const r = await addRoast(db, { beanId, klog: asStock("600,222,400,155.333"), answers, reason: "Pushed the end of the curve." });
    expect(r).toMatchObject({ version: 2 });
    const v2 = await versionProfileFile(db, beanId, 2);
    expect(v2).toContain("600,222,400,155.333");
    expect(v2).not.toBe(await versionProfileFile(db, beanId, 1));
  });

  it("explains a profile file that can't be read instead of crashing", async () => {
    const { beanId } = await addBean(db, { ...GUJI, name: "Bad file" });
    await expect(addVersion(db, { beanId, profileName: "Mine", level: 3, reason: "Own curve.", profileFile: "not a profile\n" })).rejects.toMatchObject({
      errors: [expect.stringMatching(/^The profile file for "Mine" can't be read as a Kaffelogic profile \(.+\)\.$/)],
    });
  });

  it("explains a file that isn't a roast log instead of crashing", async () => {
    const { beanId } = await addBean(db, { ...GUJI, name: "Not a log" });
    await expect(addRoast(db, { beanId, klog: "this is not a roast log\n", answers: { greenG: 120, roastedG: 102 } })).rejects.toMatchObject({
      errors: [expect.stringMatching(/^That file can't be read as a Kaffelogic roast log \(.+\)\. Check the path points at a \.klog\.$/)],
    });
  });

  it("refuses a tasting dated before its roast and stores nothing", async () => {
    const { beanId } = await addBean(db, { ...GUJI, name: "Early taste" });
    const { roastId } = await addRoast(db, { beanId, roastedAt: "2026-03-10", answers: { greenG: 120, roastedG: 102 } });
    await expect(addTasting(db, { beanId, roastId, answers: { tastedOn: "2026-03-09", brew: "espresso", quality: 3, taste: ["sweet"] } })).rejects.toThrow(
      "Tasted on 2026-03-09 is before the roast on 2026-03-10. Check the date.",
    );
    expect((await beanHistory(db, beanId)).versions[0].roasts[0].tastings).toEqual([]);
  });

  it("refuses a log without its roast levels and records nothing", async () => {
    const { beanId } = await addBean(db, { ...GUJI, name: "No levels" });
    const log = syntheticLog({ roast_end: 600 }).replace(/^roast_levels:.*\n/m, "");
    expect(log).not.toMatch(/^roast_levels:/m);
    await expect(addRoast(db, { beanId, klog: log, answers: { greenG: 120, roastedG: 102 } })).rejects.toThrow(
      '"Test line" doesn\'t list its seven roast levels, so its end temperature can\'t be worked out.',
    );
    // The transaction rolled back: no roast, and the plan is unchanged.
    const h = await beanHistory(db, beanId);
    expect(h.versions).toMatchObject([{ number: 1, profileName: "1500-2000m Rest", level: 3.2, roasts: [] }]);
  });

  it("updates a bean's intake answers, keeping the others exactly as they were", async () => {
    const { beanId } = await addBean(db, { ...GUJI, name: "Updated", cropDate: "2024-01-01", moisturePct: 12 });
    const after = await updateBean(db, { beanId, answers: { sellerNotes: "At the farm, as a pour-over: lively and fruit-forward." } });
    expect(after).toMatchObject({ name: "Updated", crop_date: "2024-01-01", moisture_pct: 12, altitude_m: 1950, seller_notes: "At the farm, as a pour-over: lively and fruit-forward." });
    // null clears an optional answer; a required one can't be cleared.
    expect(await updateBean(db, { beanId, answers: { sellerNotes: null } })).toMatchObject({ seller_notes: null, crop_date: "2024-01-01" });
    await expect(updateBean(db, { beanId, answers: { name: null } })).rejects.toMatchObject({ errors: ["Bean name is required."] });
  });

  it("refuses an invalid bean update and changes nothing", async () => {
    const { beanId } = await addBean(db, { ...GUJI, name: "Unchanged" });
    await expect(updateBean(db, { beanId, answers: { process: "wet", sellerNotes: "x" } })).rejects.toMatchObject({
      errors: ['Processing: "wet" isn\'t an option. Options: washed, natural, honey, anaerobic, wet-hulled, unknown.'],
    });
    expect((await beanHistory(db, beanId)).bean).toMatchObject({ process: "washed", seller_notes: "peach, jasmine" });
    await expect(updateBean(db, { beanId: 999999, answers: {} })).rejects.toThrow("Bean 999999 doesn't exist.");
    await expect(updateBean(db, { beanId, answers: { colour: 50 } })).rejects.toMatchObject({ errors: ['"colour" is not a field on this form.'] });
  });

  it("doesn't undo a change made to another answer while an update is in flight", async () => {
    const { beanId } = await addBean(db, { ...GUJI, name: "Racing", origin: "Original origin" });
    // A second change lands right after this update has read the row, before it writes.
    let raced = false;
    const racing = {
      query: async (text: string, params?: unknown[]) => {
        const result = await db.query(text, params);
        if (!raced && /select to_jsonb\(t\) as row from bean t/.test(text)) {
          raced = true;
          await db.query("update bean set origin = 'Changed meanwhile' where id = $1", [beanId]);
        }
        return result;
      },
    } as unknown as Db;
    const after = await updateBean(racing, { beanId, answers: { sellerNotes: "Updated notes" } });
    expect(raced).toBe(true);
    expect(after).toMatchObject({ seller_notes: "Updated notes", origin: "Changed meanwhile" });
  });

  it("treats an update with no answers as no change", async () => {
    const { beanId } = await addBean(db, { ...GUJI, name: "Nothing to do" });
    expect(await updateBean(db, { beanId, answers: {} })).toMatchObject({ name: "Nothing to do", seller_notes: "peach, jasmine" });
  });

  it("won't move a tasting before its roast, and allows a correct date", async () => {
    const { beanId } = await addBean(db, { ...GUJI, name: "Moved taste" });
    const { roastId } = await addRoast(db, { beanId, roastedAt: "2026-03-10", answers: { greenG: 120, roastedG: 102 } });
    const { tastingId } = await addTasting(db, { beanId, roastId, answers: { tastedOn: "2026-03-12", brew: "pourover", quality: 3, taste: ["sweet"] } });
    await expect(updateTasting(db, { tastingId, answers: { tastedOn: "2026-03-09" } })).rejects.toThrow("Tasted on 2026-03-09 is before the roast on 2026-03-10. Check the date.");
    expect((await beanHistory(db, beanId)).versions[0].roasts[0].tastings[0].tastedOn).toBe("2026-03-12");
    expect(await updateTasting(db, { tastingId, answers: { tastedOn: "2026-03-10" } })).toMatchObject({ tasted_on: "2026-03-10" });
  });

  it("updates a tasting that had no notes, and can clear them again", async () => {
    const { beanId } = await addBean(db, { ...GUJI, name: "Chips" });
    const { roastId } = await addRoast(db, { beanId, roastedAt: "2026-03-10", answers: { greenG: 120, roastedG: 102 } });
    const { tastingId } = await addTasting(db, { beanId, roastId, answers: { tastedOn: "2026-03-11", brew: "pourover", quality: 3, taste: ["sweet"] } });
    expect(await updateTasting(db, { tastingId, answers: { notes: "Added later." } })).toMatchObject({ notes: "Added later.", taste: ["sweet"] });
    expect(await updateTasting(db, { tastingId, answers: { notes: null } })).toMatchObject({ notes: null, taste: ["sweet"] });
    // The required taste chips can't be cleared.
    await expect(updateTasting(db, { tastingId, answers: { taste: [] } })).rejects.toMatchObject({ errors: ["What did you taste is required."] });
  });

  it("updates a tasting's chips, keeping its date and roast quality", async () => {
    const { beanId } = await addBean(db, { ...GUJI, name: "Retaste" });
    const { roastId } = await addRoast(db, { beanId, roastedAt: "2026-03-10", answers: { greenG: 120, roastedG: 102 } });
    const { tastingId } = await addTasting(db, { beanId, roastId, answers: { tastedOn: "2026-03-11", brew: "pourover", quality: 2, taste: ["ashy"] } });
    const after = await updateTasting(db, { tastingId, answers: { taste: ["ashy", "flat"] } });
    expect(after).toMatchObject({ tasted_on: "2026-03-11", quality: 2, taste: ["ashy", "flat"] });
    await expect(updateTasting(db, { tastingId, answers: { taste: ["fruitier"] } })).rejects.toMatchObject({
      errors: [expect.stringMatching(/^What did you taste: "fruitier" isn't an option./)],
    });
  });

  it("no longer takes the old score or 'next time I want' answers, and says so", async () => {
    const { beanId } = await addBean(db, { ...GUJI, name: "Old answers" });
    const { roastId } = await addRoast(db, { beanId, roastedAt: "2026-03-10", answers: { greenG: 120, roastedG: 102 } });
    await expect(addTasting(db, { beanId, roastId, answers: { tastedOn: "2026-03-11", brew: "pourover", score: 3, taste: ["sweet"] } })).rejects.toMatchObject({
      errors: expect.arrayContaining(['"score" is not a field on this form.', "Roast quality is required."]),
    });
    await expect(addTasting(db, { beanId, roastId, answers: { tastedOn: "2026-03-11", brew: "pourover", quality: 3, taste: ["sweet"], wantNext: ["brighter"] } })).rejects.toMatchObject({
      errors: ['"wantNext" is not a field on this form.'],
    });
  });

  it("removes a bean with everything recorded for it", async () => {
    const { beanId } = await addBean(db, { ...GUJI, name: "Gone" });
    expect(await removeBean(db, beanId)).toEqual({ removed: beanId, name: "Gone" });
    await expect(beanHistory(db, beanId)).rejects.toThrow(`Bean ${beanId} doesn't exist.`);
  });

  it("uses a changed profile's own file, then carries it to later level changes", async () => {
    const { beanId } = await addBean(db, { ...GUJI, name: "Kenya slow" });
    const own = PROFILE.replace("profile_short_name:Test line", "profile_short_name:Kenya slow");
    expect(own).toContain("profile_short_name:Kenya slow");
    const v2 = await addVersion(db, { beanId, profileName: "Kenya slow", level: 3.6, reason: "Longer Maillard.", profileFile: own });
    // The test profile's levels are 204..226 °C: level 3.6 is 219 + 0.6 * 3 = 220.8 °C.
    expect(v2).toMatchObject({ number: 2, profileName: "Kenya slow", endTempC: 220.8, baseProfile: "1500-2000m Rest", hasProfileFile: true });
    const v3 = await addVersion(db, { beanId, level: 4, reason: "Still sour: darker." });
    expect(v3).toMatchObject({ number: 3, profileName: "Kenya slow", endTempC: 222, hasProfileFile: true });
    expect(await versionProfileFile(db, beanId, 3)).toBe(own);
  });

  it("fingerprints each version's stored profile, so the same curve matches and an edit doesn't", async () => {
    const { beanId } = await addBean(db, { ...GUJI, name: "Kenya keys" });
    const own = PROFILE.replace("profile_short_name:Test line", "profile_short_name:Kenya keys");
    await addVersion(db, { beanId, profileName: "Kenya keys", level: 3.6, reason: "Longer Maillard.", profileFile: own });
    await addVersion(db, { beanId, level: 4, reason: "Still sour: darker." });
    const edited = own.replace("roast_levels:204,", "roast_levels:205,");
    await addVersion(db, { beanId, profileName: "Kenya keys edited", level: 3.6, reason: "Raised the first level.", profileFile: edited });
    const keys = (await beanHistory(db, beanId)).versions.map((v) => v.profileKey);
    expect(keys[1]).toMatch(/^[0-9a-f]{12}$/);
    expect(keys[2]).toBe(keys[1]);
    expect(keys[3]).toMatch(/^[0-9a-f]{12}$/);
    expect(keys[3]).not.toBe(keys[1]);
  });

  it("gives two copies of one profile the same key even when a value sits on a rounding edge", async () => {
    const { beanId } = await addBean(db, { ...GUJI, name: "Kenya edge" });
    // 204.125 and 204.1249 are the same profile to the 6 figures logs write, but round to different 5-figure keys.
    const withFirstLevel = (value: string) => PROFILE.replace("profile_short_name:Test line", "profile_short_name:Kenya edge").replace("roast_levels:204,", `roast_levels:${value},`);
    await addVersion(db, { beanId, profileName: "Kenya edge", level: 3.6, reason: "Own copy.", profileFile: withFirstLevel("204.125") });
    await addVersion(db, { beanId, profileName: "Kenya edge", level: 3.3, reason: "Copy from a log.", profileFile: withFirstLevel("204.1249") });
    const keys = (await beanHistory(db, beanId)).versions.map((v) => v.profileKey);
    expect(keys[2]).toBe(keys[1]);
  });
});

describe("profile keys across a chain of near-identical copies", () => {
  it("joins two groups that a later copy bridges, so the level ladder doesn't split", async () => {
    const db = await migratedDb();
    const { beanId } = await addBean(db, { name: "Kenya chain", species: "arabica", decaf: false, process: "washed", goal: "filter", drinkWhen: "soon", altitudeM: 1950 });
    // 204.1044 and 204.1056 round to different 5-figure keys and are further apart than the 6-figure tolerance;
    // 204.105 is within the tolerance of both, so it bridges them.
    const withFirstLevel = (value: string) => PROFILE.replace("profile_short_name:Test line", "profile_short_name:Kenya chain").replace("roast_levels:204,", `roast_levels:${value},`);
    await addVersion(db, { beanId, profileName: "Kenya chain", level: 3.6, reason: "Copy A.", profileFile: withFirstLevel("204.1044") });
    await addVersion(db, { beanId, profileName: "Kenya chain", level: 3.3, reason: "Copy C.", profileFile: withFirstLevel("204.1056") });
    const apart = (await beanHistory(db, beanId)).versions.map((v) => v.profileKey);
    expect(apart[1]).not.toBe(apart[2]);
    await addVersion(db, { beanId, profileName: "Kenya chain", level: 3.0, reason: "Copy B, between them.", profileFile: withFirstLevel("204.105") });
    const keys = (await beanHistory(db, beanId)).versions.map((v) => v.profileKey);
    expect(keys[2]).toBe(keys[1]);
    expect(keys[3]).toBe(keys[1]);
  });
});

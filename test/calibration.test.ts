import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { MEANINGS, NO_OVERRIDES, SETTING_SPECS, TASTE_WORDS, applyChange, defaultMeaning, describeCalibration, personalChanges, resolveCalibration } from "../src/core/calibration.js";
import { InputError, changeCalibration, loadOverrides } from "../src/db/store.js";
import { RULE_SETTINGS, TASTE_CHIPS, type AdviceInput, type Calibration, type TastedRoast, advise } from "../src/core/rules.js";
import { migratedDb } from "./pg.js";
import type { PGlite } from "@electric-sql/pglite";

const DEFECTS: readonly string[] = [...TASTE_CHIPS.under, ...TASTE_CHIPS.over];
/** The roast quality agrees with the default words unless a test says otherwise: 2 with a roast defect, 3 without. */
const roast = (over: Partial<TastedRoast> = {}): TastedRoast => ({ thermalDose: 10, taste: ["balanced"], quality: (over.taste ?? ["balanced"]).some((c) => DEFECTS.includes(c)) ? 2 : 3, brew: "pourover", ...over });
const input = (latest: Partial<TastedRoast>, calibration: Calibration, earlier: TastedRoast[] = []): AdviceInput => ({ latest: roast(latest), earlier, calibration });
const mine = (change: unknown) => {
  const r = applyChange(NO_OVERRIDES, change);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return resolveCalibration(r.overrides);
};

describe("the defaults", () => {
  it("resolve to the rule table's own settings and taste words", () => {
    expect(resolveCalibration(NO_OVERRIDES)).toEqual({ settings: RULE_SETTINGS, chips: TASTE_CHIPS });
  });
  it("describe every setting and every word on the tasting form", () => {
    expect(Object.keys(SETTING_SPECS).sort()).toEqual(Object.keys(RULE_SETTINGS).sort());
    const d = describeCalibration(NO_OVERRIDES);
    expect(d.settings.map((s) => s.key).sort()).toEqual(Object.keys(RULE_SETTINGS).sort());
    expect(d.words.map((w) => w.word)).toEqual(TASTE_WORDS);
    expect(personalChanges(NO_OVERRIDES)).toEqual([]);
  });
  it("read every default setting as within its own allowed range", () => {
    for (const [key, spec] of Object.entries(SETTING_SPECS)) {
      const value = RULE_SETTINGS[key as keyof typeof RULE_SETTINGS];
      expect(value, key).toBeGreaterThanOrEqual(spec.min);
      expect(value, key).toBeLessThanOrEqual(spec.max);
    }
  });
  it("leave the words the rules don't act on as 'none'", () => {
    expect(["astringent", "flat", "thin"].map(defaultMeaning)).toEqual(["none", "none", "none"]);
  });
});

describe("a roaster's change", () => {
  it("is laid over the defaults and listed as personal", () => {
    const r = applyChange(NO_OVERRIDES, { settings: { stepPct: 8 }, words: { flat: "under" } });
    expect(r).toMatchObject({ ok: true, overrides: { settings: { stepPct: 8 }, words: { flat: "under" } } });
    if (!r.ok) return;
    expect(resolveCalibration(r.overrides).settings).toEqual({ ...RULE_SETTINGS, stepPct: 8 });
    expect(resolveCalibration(r.overrides).chips.under).toEqual(["sour", "grassy", "bready", "flat"]);
    expect(personalChanges(r.overrides)).toEqual(["stepPct is 8 (default 10)", "flat means under (default none)"]);
  });
  it("moves a word off its side and onto another", () => {
    const { chips } = mine({ words: { bready: "none", sweet: "over" } });
    expect(chips.under).toEqual(["sour", "grassy"]);
    expect(chips.over).toEqual(["sweet", "bitter", "roasty", "ashy"].sort((a, b) => TASTE_WORDS.indexOf(a) - TASTE_WORDS.indexOf(b)));
    expect(chips.good).toEqual(["bright", "balanced"]);
  });
  it("builds the same lists from the same overrides, whatever order they were given in", () => {
    expect(mine({ words: { flat: "under", thin: "under" } })).toEqual(mine({ words: { thin: "under", flat: "under" } }));
  });
  it("goes back to the default with null, and a value equal to the default is not an override", () => {
    const first = applyChange(NO_OVERRIDES, { settings: { stepPct: 8, noisePct: 4 }, words: { flat: "under" } });
    if (!first.ok) throw new Error("expected ok");
    const second = applyChange(first.overrides, { settings: { stepPct: null, noisePct: RULE_SETTINGS.noisePct }, words: { flat: null } });
    expect(second).toEqual({ ok: true, overrides: NO_OVERRIDES });
    expect(applyChange(NO_OVERRIDES, { words: { sour: "under" } })).toEqual({ ok: true, overrides: NO_OVERRIDES });
  });
  it("keeps what was already set when a later change names something else", () => {
    const first = applyChange(NO_OVERRIDES, { settings: { stepPct: 8 } });
    if (!first.ok) throw new Error("expected ok");
    const second = applyChange(first.overrides, { settings: { holdMinQuality: 3 } });
    expect(second).toMatchObject({ ok: true, overrides: { settings: { stepPct: 8, holdMinQuality: 3 } } });
  });
  it("does not change the overrides it was given", () => {
    const given = { settings: { stepPct: 8 }, words: {} };
    applyChange(given, { settings: { stepPct: null } });
    expect(given).toEqual({ settings: { stepPct: 8 }, words: {} });
  });

  describe("is refused, with every problem in plain words, when", () => {
    const errors = (change: unknown) => {
      const r = applyChange(NO_OVERRIDES, change);
      if (r.ok) throw new Error("expected a refusal");
      return r.errors;
    };
    it("it names nothing", () => {
      expect(errors({})).toEqual(['Nothing to change. Give "settings" and/or "words".']);
    });
    it("it has a key that isn't settings or words, or isn't an object", () => {
      expect(errors({ stepPct: 8 })[0]).toContain('"stepPct" isn\'t recognised');
      expect(errors({ settings: 8 })[0]).toContain('"settings" must be an object');
      expect(errors(null)).toEqual(["Expected a JSON object."]);
    });
    it("a setting is unknown, out of range, or the wrong kind of number", () => {
      expect(errors({ settings: { stepSize: 8 } })[0]).toContain('"stepSize" isn\'t a setting. Settings: stepPct, strongStepPct');
      expect(errors({ settings: { stepPct: 80 } })).toEqual(["stepPct must be between 1 and 50%; got 80%."]);
      expect(errors({ settings: { stepPct: 0 } })).toEqual(["stepPct must be between 1 and 50%; got 0%."]);
      expect(errors({ settings: { holdMinQuality: 6 } })).toEqual(["holdMinQuality must be between 1 and 5; got 6."]);
      expect(errors({ settings: { holdMinQuality: 3.5 } })).toEqual(["holdMinQuality must be a whole number; got 3.5."]);
      expect(errors({ settings: { stepPct: "8" } })).toEqual(['stepPct must be a number; got "8".']);
      expect(errors({ settings: { stepPct: Number.NaN } })[0]).toContain("stepPct must be a number");
    });
    it("a word isn't on the tasting form, or its meaning isn't one of the four", () => {
      expect(errors({ words: { juicy: "good" } })[0]).toContain('"juicy" isn\'t a taste word on the tasting form');
      expect(errors({ words: { flat: "baked" } })).toEqual([`flat must mean one of ${MEANINGS.join(", ")} (none: the rules don't act on it); got "baked".`]);
    });
    it("a strong step would be smaller than a single-word step", () => {
      expect(errors({ settings: { stepPct: 20 } })[0]).toContain("strongStepPct (15) can't be smaller than stepPct (20)");
      expect(errors({ settings: { strongStepPct: 5 } })[0]).toContain("strongStepPct (5) can't be smaller than stepPct (10)");
      expect(applyChange(NO_OVERRIDES, { settings: { stepPct: 20, strongStepPct: 30 } }).ok).toBe(true);
    });
    it("the step would be smaller than the move the level counts, or noise would count as a move", () => {
      // The tool's own 5% steps would never reach the 7% the level needs to see.
      expect(errors({ settings: { stepPct: 5, strongStepPct: 6 } })[0]).toContain("noResponsePct (7) can't be bigger than stepPct (5)");
      expect(applyChange(NO_OVERRIDES, { settings: { stepPct: 5, strongStepPct: 6, noResponsePct: 3, noisePct: 1 } }).ok).toBe(true);
      // Noise as big as the move that counts.
      expect(errors({ settings: { noisePct: 7 } })[0]).toContain("noisePct (7) must be smaller than noResponsePct (7)");
      expect(errors({ settings: { noisePct: 8 } })[0]).toContain("noisePct (8) must be smaller than noResponsePct (7)");
      expect(applyChange(NO_OVERRIDES, { settings: { noisePct: 6 } }).ok).toBe(true);
      // The defaults themselves pass.
      expect(RULE_SETTINGS.noisePct).toBeLessThan(RULE_SETTINGS.noResponsePct);
      expect(RULE_SETTINGS.noResponsePct).toBeLessThanOrEqual(RULE_SETTINGS.stepPct);
    });
    it("it reports all of the problems at once", () => {
      expect(errors({ settings: { stepPct: 80, bogus: 1 }, words: { juicy: "good" } })).toHaveLength(3);
    });
    it("a setting key is one of the object's own inherited names", () => {
      expect(errors({ settings: { constructor: 1 } })[0]).toContain("isn't a setting");
      expect(errors({ words: { toString: "good" } })[0]).toContain("isn't a taste word");
    });
  });
});

describe("the rules with a roaster's own calibration", () => {
  const change = (a: ReturnType<typeof advise>) => {
    if (a.kind !== "change") throw new Error(`expected a change, got ${a.kind} (${a.ruleId})`);
    return a;
  };
  it("take the roaster's step sizes", () => {
    const cal = mine({ settings: { stepPct: 7, strongStepPct: 12 } });
    expect(change(advise(input({ taste: ["sour"] }, cal))).thermalDoseChangePct).toBe(7);
    expect(change(advise(input({ taste: ["ashy", "bitter"] }, cal))).thermalDoseChangePct).toBe(-12);
  });
  it("count as strong at the roaster's chosen number of agreeing words", () => {
    const cal = mine({ settings: { strongChipCount: 3 } });
    expect(change(advise(input({ taste: ["sour", "grassy"] }, cal))).thermalDoseChangePct).toBe(10);
    expect(change(advise(input({ taste: ["sour", "grassy", "bready"] }, cal))).thermalDoseChangePct).toBe(15);
  });
  it("keep a cup at the roaster's own bar for roast quality", () => {
    const cup = { taste: ["sweet", "balanced"], quality: 3 };
    expect(advise(input(cup, resolveCalibration(NO_OVERRIDES)))).toMatchObject({ kind: "ask", ruleId: "clean-below-bar" });
    expect(advise(input(cup, mine({ settings: { holdMinQuality: 3 } })))).toMatchObject({ kind: "hold", ruleId: "keep-as-is" });
    expect(advise(input({ ...cup, quality: 4 }, mine({ settings: { holdMinQuality: 5 } })))).toMatchObject({ kind: "ask", ruleId: "clean-below-bar" });
  });
  it("use the roaster's noise band to tell a bracket from a contradiction", () => {
    // An over-roasted result 5% further along than this under-roasted cup: a bracket by default, within the noise at 6%.
    const earlier = [roast({ thermalDose: 10.5, taste: ["bitter"] })];
    expect(advise(input({ taste: ["grassy"] }, resolveCalibration(NO_OVERRIDES), earlier))).toMatchObject({ ruleId: "under-roasted-bracketed" });
    expect(advise(input({ taste: ["grassy"] }, mine({ settings: { noisePct: 6 } }), earlier))).toMatchObject({ kind: "ask", ruleId: "under-roasted-contradicted" });
  });
  it("use the roaster's bar for the level not helping", () => {
    // 8% more roasting than an earlier sour roast on the same profile, still sour: not helping at the default 7%, helping at 9%.
    const earlier = [roast({ thermalDose: 10, taste: ["sour"], profile: "KL Washed" })];
    const latest = { thermalDose: 10.8, taste: ["sour"], profile: "KL Washed" };
    const context = { alternative: { profileName: "KL Natural", level: 1.2, endTempC: 217.6 } };
    expect(advise({ latest: roast(latest), earlier, context })).toMatchObject({ ruleId: "level-not-helping" });
    expect(advise({ latest: roast(latest), earlier, context, calibration: mine({ settings: { noResponsePct: 9 } }) })).toMatchObject({ ruleId: "under-roasted", kind: "change" });
  });
  it("read a word the way the roaster does", () => {
    // Default: flat alone is clean, so there is no defect for the level to fix. For a roaster whose flat means
    // under-roasted it is a defect (and the roast quality has to say so), so it gets a plain step.
    expect(advise(input({ taste: ["flat"] }, resolveCalibration(NO_OVERRIDES)))).toMatchObject({ kind: "ask", ruleId: "clean-below-bar" });
    const a = change(advise(input({ taste: ["flat"], quality: 2 }, mine({ words: { flat: "under" } }))));
    expect(a).toMatchObject({ ruleId: "under-roasted", thermalDoseChangePct: 10 });
    expect(a.reason).toBe("The cup tasted flat, which means the beans were under-roasted. Roast about 10% more.");
  });
  it("hold the roaster to their own words when rating quality", () => {
    // For this roaster flat is a defect, so rating a flat cup 3 (clean) contradicts their own words.
    expect(advise(input({ taste: ["flat"], quality: 3 }, mine({ words: { flat: "under" } })))).toMatchObject({ kind: "ask", ruleId: "quality-vs-words" });
    expect(advise(input({ taste: ["flat"], quality: 1 }, mine({ words: { flat: "under" } }))).ruleId).toBe("under-roasted");
  });
  it("read a reassigned word in the bean's earlier roasts too", () => {
    // An earlier roast with 20% more roasting tasted 'flat'; for this roaster that is over-roasted, so the cup now brackets.
    const earlier = [roast({ thermalDose: 12, taste: ["flat"] })];
    expect(advise(input({ taste: ["grassy"] }, resolveCalibration(NO_OVERRIDES), earlier))).toMatchObject({ ruleId: "under-roasted" });
    expect(advise(input({ taste: ["grassy"] }, mine({ words: { flat: "over" } }), earlier))).toMatchObject({ ruleId: "under-roasted-bracketed", thermalDoseChangePct: 10 });
  });
  it("stop acting on a word the roaster sets to none", () => {
    // Not a defect for this roaster: a clean cup, so the quality has to be 3 or more.
    expect(advise(input({ taste: ["sour"], quality: 3, brew: "pourover" }, mine({ words: { sour: "none" } })))).toMatchObject({ kind: "ask", ruleId: "clean-below-bar" });
    const a = advise(input({ taste: ["sour"], quality: 4, brew: "pourover" }, mine({ words: { sour: "none" } })));
    expect(a).toMatchObject({ kind: "none", ruleId: "no-rule" });
    expect(a.reason).toContain("No rule covers sour yet");
  });
  it("see sour and bitter together as mixed signals whatever the other words mean", () => {
    expect(advise(input({ taste: ["flat", "bitter"] }, mine({ words: { flat: "under" } })))).toMatchObject({ kind: "ask", ruleId: "mixed-signals" });
  });
});

describe("stored in the roaster's database", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await migratedDb();
  });
  it("starts with nothing personal", async () => {
    expect(await loadOverrides(db)).toEqual(NO_OVERRIDES);
  });
  it("keeps a change, merges the next over it, and shows it in the description", async () => {
    const first = await changeCalibration(db, { settings: { stepPct: 8 }, words: { flat: "under" } });
    expect(first.personal).toEqual(["stepPct is 8 (default 10)", "flat means under (default none)"]);
    expect(await loadOverrides(db)).toEqual({ settings: { stepPct: 8 }, words: { flat: "under" } });
    const second = await changeCalibration(db, { settings: { holdMinQuality: 3 }, words: { thin: "under" } });
    expect(second.personal).toEqual(["stepPct is 8 (default 10)", "holdMinQuality is 3 (default 4)", "flat means under (default none)", "thin means under (default none)"]);
    expect(await loadOverrides(db)).toEqual({ settings: { stepPct: 8, holdMinQuality: 3 }, words: { flat: "under", thin: "under" } });
  });
  it("writes nothing when any part of a change is refused", async () => {
    const before = await loadOverrides(db);
    await expect(changeCalibration(db, { settings: { noisePct: 4 }, words: { flat: "baked" } })).rejects.toBeInstanceOf(InputError);
    await expect(changeCalibration(db, { settings: { stepPct: 99 } })).rejects.toThrow("stepPct must be between 1 and 50%");
    expect(await loadOverrides(db)).toEqual(before);
  });
  it("rolls everything back when a write fails part-way through", async () => {
    const before = await loadOverrides(db);
    let wordInserts = 0;
    const failing = {
      query: (text: string, params?: unknown[]) => {
        if (text.includes("insert into roaster_taste_word") && ++wordInserts === 2) throw new Error("disk full");
        return db.query(text, params);
      },
    } as unknown as Parameters<typeof changeCalibration>[0];
    await expect(changeCalibration(failing, { settings: { stepPct: 8 }, words: { flat: "under", thin: "under" } })).rejects.toThrow("disk full");
    // The setting written before the failure is gone too, and a later change works as normal.
    expect(await loadOverrides(db)).toEqual(before);
    await changeCalibration(db, { settings: { noisePct: 2 } });
    expect(await loadOverrides(db)).toEqual({ ...before, settings: { ...before.settings, noisePct: 2 } });
    await changeCalibration(db, { settings: { noisePct: null } });
  });
  it("puts a setting or word back to the default, and ends with nothing stored", async () => {
    await changeCalibration(db, { settings: { stepPct: null, holdMinQuality: null }, words: { flat: null, thin: null } });
    expect(await loadOverrides(db)).toEqual(NO_OVERRIDES);
    const rows = await db.query<{ n: number }>("select (select count(*) from roaster_setting) + (select count(*) from roaster_taste_word) as n");
    expect(Number(rows.rows[0].n)).toBe(0);
  });
  it("accepts a stored value the same way it was given, including a decimal", async () => {
    await changeCalibration(db, { settings: { noisePct: 2.5 } });
    expect(await loadOverrides(db)).toEqual({ settings: { noisePct: 2.5 }, words: {} });
    await changeCalibration(db, { settings: { noisePct: null } });
  });
  it("leaves the stored updated_at alone for a value that did not change", async () => {
    await changeCalibration(db, { settings: { stepPct: 8 } });
    const stamp = async () => (await db.query<{ t: string }>("select updated_at::text as t from roaster_setting where key = 'stepPct'")).rows[0].t;
    const before = await stamp();
    await db.query("select pg_sleep(0.05)");
    await changeCalibration(db, { settings: { stepPct: 8, holdMinQuality: 3 } });
    expect(await stamp()).toBe(before);
    await changeCalibration(db, { settings: { stepPct: null, holdMinQuality: null } });
  });
});

describe("the tables list exactly what the code allows", () => {
  const sql = readFileSync(join(__dirname, "..", "db", "004_roaster_calibration.sql"), "utf8");
  const listed = (table: string, column: string) => {
    const block = sql.split(`create table ${table}`)[1]?.split(");")[0] ?? "";
    const list = block.match(new RegExp(`check \\(${column} in \\(([^)]*)\\)`))?.[1] ?? "";
    return [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  };
  it("for setting keys, read from the constraint the migrated database really has (006 replaced the list in 004)", async () => {
    const db = await migratedDb();
    const def = await db.query<{ def: string }>("select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'roaster_setting'::regclass and contype = 'c'");
    expect(def.rows).toHaveLength(1);
    const keys = [...def.rows[0].def.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(keys.sort()).toEqual(Object.keys(RULE_SETTINGS).sort());
  });
  it("for taste words, in the tasting form's order", () => {
    expect(listed("roaster_taste_word", "word")).toEqual(TASTE_WORDS);
  });
  it("accepts every setting and every word the code allows", async () => {
    const db = await migratedDb();
    for (const key of Object.keys(RULE_SETTINGS)) await db.query("insert into roaster_setting (key, value) values ($1, 1)", [key]);
    for (const word of TASTE_WORDS) for (const meaning of MEANINGS) await db.query("insert into roaster_taste_word (word, meaning) values ($1, $2) on conflict (word) do update set meaning = excluded.meaning", [word, meaning]);
    expect((await loadOverrides(db)).words).toEqual(Object.fromEntries(TASTE_WORDS.map((w) => [w, "none"])));
  });
});

import { describe, expect, it } from "vitest";
import { NO_OVERRIDES, TASTE_WORDS, applyChange, resolveCalibration } from "../src/core/calibration.js";
import { type Field, INTAKE_FIELDS, QUALITY_ANCHORS, TASTING_FIELDS } from "../src/core/intake.js";
import { migratedDb } from "./pg.js";
import { syntheticLog } from "./syntheticLog.js";
import { addBean, addRoast, addTasting, beanHistory } from "../src/db/store.js";
import { kaffelogicAdviceContext } from "../src/adapters/kaffelogic/adviceContext.js";
import { RULES, RULE_SETTINGS, TASTE_CHIPS, type AdviceContext, type AdviceInput, type HistoryForAdvice, type TastedRoast, adviceReport, advise, adviseFromHistory } from "../src/core/rules.js";

const DEFECTS: readonly string[] = [...TASTE_CHIPS.under, ...TASTE_CHIPS.over];
/** A cup's roast quality agrees with its words unless a test says otherwise: 2 with a roast defect, 3 without. */
const roast = (over: Partial<TastedRoast> = {}): TastedRoast => ({ thermalDose: 10, taste: ["balanced"], quality: (over.taste ?? ["balanced"]).some((c) => DEFECTS.includes(c)) ? 2 : 3, brew: "pourover", ...over });
const input = (latest: Partial<TastedRoast>, earlier: TastedRoast[] = []): AdviceInput => ({ latest: roast(latest), earlier });
const change = (a: ReturnType<typeof advise>) => {
  if (a.kind !== "change") throw new Error(`expected a change, got ${a.kind} (${a.ruleId})`);
  return a;
};

describe("the table's chips are real form options", () => {
  const options = (id: string): string[] => {
    const field = TASTING_FIELDS.find((f) => f.id === id);
    if (!field || !("options" in field)) throw new Error(`${id} is not a choice or chips field`);
    return field.options.map((o) => o.value);
  };
  it("uses only taste chips the tasting form offers, each on one side", () => {
    const all = [...TASTE_CHIPS.under, ...TASTE_CHIPS.over, ...TASTE_CHIPS.good];
    expect(all.filter((c) => !options("taste").includes(c))).toEqual([]);
    expect(new Set(all).size).toBe(all.length);
  });
  it("offers a quality for each anchor, and no question about what the roaster wants next", () => {
    expect(options("quality")).toEqual(Object.keys(QUALITY_ANCHORS));
    expect(TASTING_FIELDS.map((f) => f.id)).not.toContain("wantNext");
    expect(TASTING_FIELDS.map((f) => f.id)).not.toContain("score");
  });
});

describe("under-roasted cups", () => {
  it("steps up 10% for one chip, with the reason in plain words", () => {
    const a = change(advise(input({ taste: ["grassy"], brew: "pourover" })));
    expect(a).toMatchObject({ ruleId: "under-roasted", thermalDoseChangePct: 10, basis: "step" });
    expect(a.reason).toBe("The cup tasted grassy, which means the beans were under-roasted. Roast about 10% more.");
  });
  it("steps up 15% when two chips agree", () => {
    expect(change(advise(input({ taste: ["grassy", "bready"], brew: "pourover" }))).thermalDoseChangePct).toBe(RULE_SETTINGS.strongStepPct);
    expect(change(advise(input({ taste: ["bitter", "roasty", "ashy"], brew: "pourover" }))).reason).toContain("bitter, roasty and ashy");
  });
  it("ignores chips that don't say how far the roast went", () => {
    expect(change(advise(input({ taste: ["grassy", "thin", "flat"] }))).thermalDoseChangePct).toBe(RULE_SETTINGS.stepPct);
  });
  it("halves the gap to an earlier over-roasted result with more roasting", () => {
    // Latest thermal dose 10 tasted grassy; an earlier roast at 12 (20% more) tasted bitter: go to 11.
    const a = change(advise(input({ taste: ["grassy"] }, [roast({ thermalDose: 12, taste: ["bitter"] })])));
    expect(a).toMatchObject({ ruleId: "under-roasted-bracketed", thermalDoseChangePct: 10, basis: "midpoint" });
    expect(a.reason).toContain("an earlier roast with 20% more roasting tasted bitter");
  });
  it("uses the nearest over-roasted result, not a farther one", () => {
    const a = change(advise(input({ taste: ["grassy"] }, [roast({ thermalDose: 14, taste: ["ashy"] }), roast({ thermalDose: 12, taste: ["bitter"] })])));
    expect(a.thermalDoseChangePct).toBe(10);
  });
  it("asks when an over-roasted result had less roasting, since the cups disagree", () => {
    const a = advise(input({ taste: ["grassy"] }, [roast({ thermalDose: 8, taste: ["bitter"] })]));
    expect(a).toMatchObject({ kind: "ask", ruleId: "under-roasted-contradicted" });
    expect(a.reason).toContain("an earlier roast with 20% less roasting tasted bitter");
  });
  it("asks when an over-roasted result had the same roasting, within the noise", () => {
    const a = advise(input({ taste: ["grassy"] }, [roast({ thermalDose: 10 * (1 + RULE_SETTINGS.noisePct / 200), taste: ["bitter"] })]));
    expect(a).toMatchObject({ kind: "ask", ruleId: "under-roasted-contradicted" });
    expect(a.reason).toContain("about the same roasting");
  });
  it("treats a result just beyond the noise as a real bracket, with a small step", () => {
    const a = change(advise(input({ taste: ["grassy"] }, [roast({ thermalDose: 10 * (1 + (RULE_SETTINGS.noisePct * 2) / 100), taste: ["bitter"] })])));
    expect(a).toMatchObject({ ruleId: "under-roasted-bracketed", thermalDoseChangePct: RULE_SETTINGS.noisePct });
  });
  it("is not moved by earlier good cups, or by under-roasted cups that had at least as much roasting", () => {
    const a = change(advise(input({ taste: ["grassy", "bready"], brew: "pourover" }, [roast({ thermalDose: 12, taste: ["sweet"], quality: 5 }), roast({ thermalDose: 10.5, taste: ["grassy"] })])));
    expect(a).toMatchObject({ ruleId: "under-roasted", basis: "step", thermalDoseChangePct: 15 });
  });
});

describe("over-roasted cups", () => {
  it("steps down 10% for one chip and 15% for two", () => {
    expect(change(advise(input({ taste: ["ashy"] }))).thermalDoseChangePct).toBe(-10);
    expect(change(advise(input({ taste: ["bitter", "roasty"] }))).thermalDoseChangePct).toBe(-15);
  });
  it("halves the gap to an earlier under-roasted result with less roasting", () => {
    const a = change(advise(input({ taste: ["bitter"], thermalDose: 10 }, [roast({ thermalDose: 8, taste: ["grassy"] })])));
    expect(a).toMatchObject({ ruleId: "over-roasted-bracketed", thermalDoseChangePct: -10, basis: "midpoint" });
    expect(a.reason).toContain("an earlier roast with 20% less roasting tasted grassy");
  });
  it("asks when an under-roasted result had more roasting", () => {
    expect(advise(input({ taste: ["bitter"] }, [roast({ thermalDose: 12, taste: ["grassy"] })]))).toMatchObject({ kind: "ask", ruleId: "over-roasted-contradicted" });
  });
});

describe("the guards", () => {
  it("asks about an uneven roast when the cup is both grassy and bitter, and moves nothing", () => {
    const a = advise(input({ taste: ["grassy", "bitter"] }));
    expect(a).toMatchObject({ kind: "ask", ruleId: "mixed-signals" });
    expect(a.reason).toContain("uneven roast");
  });
});

describe("roast quality has to agree with the words", () => {
  it("asks when a cup with a roast defect is rated clean", () => {
    const a = advise(input({ taste: ["ashy"], quality: 4 }));
    expect(a).toMatchObject({ kind: "ask", ruleId: "quality-vs-words" });
    expect(a.reason).toBe("You rated the roast quality 4 (clean and expressive), but the cup tasted ashy, which is a roast defect. A cup with a roast defect is a 1 or 2; a clean cup is a 3 or better. Which is right? Correct whichever is wrong and I'll go on from there.");
    expect(advise(input({ taste: ["grassy"], quality: 3 })).ruleId).toBe("quality-vs-words");
  });
  it("asks when a cup with no roast defect is rated as having one", () => {
    const a = advise(input({ taste: ["flat"], quality: 1 }));
    expect(a).toMatchObject({ kind: "ask", ruleId: "quality-vs-words" });
    expect(a.reason).toBe("You rated the roast quality 1 (a roast defect dominates the cup), but none of the taste words (flat) names a roast defect (under-roasted words: grassy and bready; over-roasted words: bitter, roasty and ashy). A 1 or 2 means a defect. Which is right? Correct whichever is wrong and I'll go on from there.");
    expect(advise(input({ taste: ["sweet"], quality: 2 })).ruleId).toBe("quality-vs-words");
  });
  it("lets a defect with quality 1 or 2, and a clean cup with 3 or more, through to the other rules", () => {
    expect(advise(input({ taste: ["grassy"], quality: 1, brew: "pourover" })).ruleId).toBe("under-roasted");
    expect(advise(input({ taste: ["grassy"], quality: 2, brew: "pourover" })).ruleId).toBe("under-roasted");
    expect(advise(input({ taste: ["flat"], quality: 3 })).ruleId).toBe("keep-as-is");
  });
  it("never prints 'undefined' or empty parentheses for a quality off the scale or a cup with no words", () => {
    const off = advise(input({ taste: ["ashy"], quality: 7 }));
    expect(off.reason).toContain("You rated the roast quality 7 (off the 1 to 5 scale), but the cup tasted ashy");
    const none = advise(input({ taste: [], quality: 1 }));
    expect(none.reason).toContain("but no taste word names a roast defect");
    expect(none.reason).not.toContain("()");
    expect(none.reason).not.toContain("undefined");
  });
  it("is judged first: it comes before every other answer", () => {
    expect(advise(input({ taste: ["grassy", "bitter"], quality: 4 })).ruleId).toBe("quality-vs-words");
  });
});

describe("keeping a clean roast", () => {
  it("holds a clean cup of good roast quality that tasted good", () => {
    const a = advise(input({ taste: ["sweet", "balanced"], quality: 4 }));
    expect(a).toMatchObject({ kind: "hold", ruleId: "keep-as-is" });
    expect(a.reason).toBe("The cup tasted sweet and balanced and the roast quality is 4 (clean and expressive). Keep this roast as it is.");
  });
  it("holds a clean cup of quality 3 as done, and says what would take it further that this tool cannot do yet", () => {
    const a = advise(input({ taste: ["balanced"], quality: 3 }));
    expect(a).toMatchObject({ kind: "hold", ruleId: "keep-as-is" });
    expect(a.reason).toBe("The cup tasted balanced and the roast quality is 3 (clean, with little character). A better cup would need another profile or an edited curve, which this tool can't choose or make yet. Keep this roast as it is.");
  });
  it("holds a clean cup with no good word too, naming no word and no defect", () => {
    const a = advise(input({ taste: ["flat", "thin"], quality: 3 }));
    expect(a).toMatchObject({ kind: "hold", ruleId: "keep-as-is" });
    expect(a.reason).toBe("Nothing in the cup is a roast defect and the roast quality is 3 (clean, with little character). A better cup would need another profile or an edited curve, which this tool can't choose or make yet. Keep this roast as it is.");
    expect(advise(input({ taste: ["flat"], quality: 4 }))).toMatchObject({ kind: "hold", ruleId: "keep-as-is" });
  });
  it("leaves sour to the rules that do not act on it: sour is not a roast defect, because it can come from the brew", () => {
    expect(advise(input({ taste: ["sour"], quality: 3 }))).toMatchObject({ kind: "hold", ruleId: "keep-as-is" });
    // A roaster who does read sour as under-roasting can say so.
    const changed = applyChange(NO_OVERRIDES, { words: { sour: "under" } });
    if (!changed.ok) throw new Error(changed.errors.join("; "));
    expect(advise({ latest: roast({ taste: ["sour"], quality: 2 }), earlier: [], calibration: resolveCalibration(changed.overrides) }).ruleId).toBe("under-roasted");
  });
});

describe("every tasting gets an answer from a rule", () => {
  it("never falls through the table, whatever the words and the quality", () => {
    const words = [...TASTE_WORDS];
    // Every set of up to three words, from every quality on the scale and one off it.
    const sets: string[][] = [[]];
    for (const a of words) {
      sets.push([a]);
      for (const b of words.filter((w) => w > a)) {
        sets.push([a, b]);
        for (const c of words.filter((w) => w > b)) sets.push([a, b, c]);
      }
    }
    for (const taste of sets) {
      for (const quality of [1, 2, 3, 4, 5, 7]) expect(() => advise(input({ taste, quality, brew: "pourover" })), `${taste.join("+") || "no words"} at ${quality}`).not.toThrow();
    }
  });
});

describe("the table itself", () => {
  it("has unique rule ids, in the order they are tried", () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(["tasted-in-other-brew", "quality-vs-words", "mixed-signals", "tasted-too-soon", "under-roasted", "over-roasted", "keep-as-is"]);
  });
  it("gives the same advice for the same evidence", () => {
    const e = input({ taste: ["grassy"] }, [roast({ thermalDose: 12, taste: ["bitter"] })]);
    expect(advise(e)).toEqual(advise(structuredClone(e)));
  });
});

describe("advice from a bean's history", () => {
  const tasting = (id: number, taste: string[], extra: Partial<HistoryForAdvice["versions"][0]["roasts"][0]["tastings"][0]> = {}) => ({ id, tastedOn: "2026-10-10", quality: taste.some((c) => DEFECTS.includes(c)) ? 2 : 3, taste, brew: "pourover", ...extra });
  const roastRow = (id: number, roastedAt: string, thermalDose: number | undefined, tastings: ReturnType<typeof tasting>[], logLevel = 3) => ({ id, roastedAt, logLevel, features: thermalDose === undefined ? undefined : { thermalDose }, tastings });

  describe("counts the level change a recommendation is", () => {
    const chain = (parents: Record<number, number | undefined>): HistoryForAdvice => ({
      versions: Object.entries(parents).map(([number, parentNumber], i) => ({
        number: Number(number),
        parentNumber,
        profileName: "Test",
        roasts: [roastRow(i + 1, `2026-10-0${i + 1}`, 10 + i, [tasting(i + 1, ["grassy"])])],
      })),
    });
    it("counts from the first recommendation: the first version's tasting is level change 1, and each version after is the next", () => {
      expect(adviseFromHistory(chain({ 1: undefined }))!.basedOn.levelChange).toBe(1);
      expect(adviseFromHistory(chain({ 1: undefined, 2: 1 }))!.basedOn.levelChange).toBe(2);
      expect(adviseFromHistory(chain({ 1: undefined, 2: 1, 3: 2 }))!.basedOn.levelChange).toBe(3);
      expect(adviseFromHistory(chain({ 1: undefined, 2: 1, 3: 2, 4: 3 }))!.basedOn.levelChange).toBe(4);
    });
    it("follows the version that was changed, not the order they were made in", () => {
      // v3 was made from v1 (the roaster went back to it), so the roast tasted newest is one change from the first version.
      expect(adviseFromHistory(chain({ 1: undefined, 2: 1, 3: 1 }))!.basedOn.levelChange).toBe(2);
    });
    it("counts every level change behind the roast, whoever chose it, and starts again on a new profile", () => {
      // Nothing in the history says who chose a version, so the count is the versions behind the roast on its profile.
      expect(adviseFromHistory(chain({ 1: undefined, 2: 1, 3: 2 }))!.basedOn.levelChange).toBe(3);
      const switched: HistoryForAdvice = chain({ 1: undefined, 2: 1, 3: 2, 4: 3, 5: 4 });
      switched.versions[3].profileName = "KL Washed";
      switched.versions[4].profileName = "KL Washed";
      // v4 is the switch (the first version on KL Washed) and v5 is one level change on it.
      expect(adviseFromHistory(switched)!.basedOn.levelChange).toBe(2);
    });
    it("compares profiles by content when it is known, and by the stock profile's name when it is not", () => {
      const same: HistoryForAdvice = chain({ 1: undefined, 2: 1, 3: 2 });
      same.versions.forEach((v, i) => ((v as { profileKey?: string }).profileKey = "same"));
      same.versions[1].profileName = "Renamed copy";
      expect(adviseFromHistory(same)!.basedOn.levelChange).toBe(3);
      const different: HistoryForAdvice = chain({ 1: undefined, 2: 1, 3: 2 });
      different.versions.forEach((v, i) => ((v as { profileKey?: string }).profileKey = i === 0 ? "stock" : "edited"));
      expect(adviseFromHistory(different)!.basedOn.levelChange).toBe(2);
    });
    it("is not thrown by a history with no parent links, or a parent loop", () => {
      expect(adviseFromHistory(chain({ 1: undefined, 2: undefined }))!.basedOn.levelChange).toBe(1);
      expect(adviseFromHistory(chain({ 1: 2, 2: 1 }))!.basedOn.levelChange).toBe(2);
    });
  });

  it("answers the newest tasted roast and uses the others as the bean's record", () => {
    const history: HistoryForAdvice = {
      versions: [
        { number: 1, profileName: "Test", roasts: [roastRow(1, "2026-10-01", 12, [tasting(1, ["bitter"])])] },
        { number: 2, parentNumber: 1, profileName: "Test", roasts: [roastRow(2, "2026-10-05", 10, [tasting(2, ["grassy"])])] },
      ],
    };
    const r = adviseFromHistory(history)!;
    expect(r.basedOn).toEqual({ version: 2, roastId: 2, tastingId: 2, level: 3, measuredThermalDose: 10, levelChange: 2 });
    expect(change(r.advice)).toMatchObject({ ruleId: "under-roasted-bracketed", thermalDoseChangePct: 10 });
  });

  it("orders by roast date, not by version number or id", () => {
    const history: HistoryForAdvice = {
      versions: [
        { number: 1, profileName: "Test", roasts: [roastRow(9, "2026-10-09", 10, [tasting(9, ["grassy", "bready"])])] },
        { number: 2, profileName: "Test", roasts: [roastRow(2, "2026-10-02", 12, [tasting(2, ["bitter"])])] },
      ],
    };
    expect(adviseFromHistory(history)!.basedOn).toMatchObject({ version: 1, roastId: 9 });
  });

  it("counts each roast once, by its newest tasting", () => {
    const history: HistoryForAdvice = {
      versions: [{ number: 1, profileName: "Test", roasts: [roastRow(1, "2026-10-01", 10, [tasting(1, ["grassy"], { brew: "pourover" }), tasting(2, ["balanced", "sweet"], { quality: 5 })])] }],
    };
    const r = adviseFromHistory(history)!;
    expect(r.basedOn.tastingId).toBe(2);
    expect(r.advice).toMatchObject({ kind: "hold", ruleId: "keep-as-is" });
  });

  it("leaves out roasts with no measured thermal dose or no tasting", () => {
    const history: HistoryForAdvice = {
      versions: [
        { number: 1, profileName: "Test", roasts: [roastRow(1, "2026-10-01", undefined, [tasting(1, ["bitter"])]), roastRow(2, "2026-10-02", 10, [])] },
        { number: 2, profileName: "Test", roasts: [roastRow(3, "2026-10-03", 10, [tasting(3, ["grassy"])])] },
      ],
    };
    expect(change(adviseFromHistory(history)!.advice)).toMatchObject({ ruleId: "under-roasted", basis: "step" });
  });

  it("returns nothing when no roast has been tasted", () => {
    expect(adviseFromHistory({ versions: [{ number: 1, profileName: "Test", roasts: [roastRow(1, "2026-10-01", 10, [])] }] })).toBeUndefined();
    expect(adviseFromHistory({ versions: [] })).toBeUndefined();
  });
});

describe("advice from what the store actually returns", () => {
  it("reads a bean, a logged roast and a tasting end to end", async () => {
    const db = await migratedDb();
    const { beanId } = await addBean(db, { name: "Rules bean", species: "arabica", decaf: false, process: "washed", drinkWhen: "soon", agtronTarget: 55, tastingBrew: "pourover" });
    const { roastId } = await addRoast(db, { beanId, klog: syntheticLog({ first_crack: 540, roast_end: 600 }), answers: { greenG: 120, roastedG: 101.5 } });
    expect(adviseFromHistory(await beanHistory(db, beanId))).toBeUndefined();
    await addTasting(db, { beanId, roastId, answers: { tastedOn: "2025-06-29", brew: "pourover", quality: 2, taste: ["grassy", "bready"] } });
    const result = adviseFromHistory(await beanHistory(db, beanId))!;
    expect(result.basedOn).toMatchObject({ version: 1, roastId, level: 3.3 });
    expect(result.basedOn.measuredThermalDose).toBeGreaterThan(0);
    expect(result.advice).toMatchObject({ kind: "change", ruleId: "under-roasted", thermalDoseChangePct: 15 });
  });
});

describe("the finished answer", () => {
  const basedOn = { version: 2, roastId: 7, tastingId: 7, level: 3, measuredThermalDose: 11.6, levelChange: 1 };
  const answer = (t: Partial<TastedRoast>) => ({ basedOn, advice: advise(input(t)) });
  const move = { from: { level: 3, endTempC: 223.4 }, to: { level: 2.7, endTempC: 222.2 } };

  it("says the reason and the level, and carries the exact command for a yes", () => {
    const r = adviceReport(2, answer({ taste: ["ashy"] }), move);
    expect(r.say).toBe("The cup tasted ashy, which means the beans were over-roasted. Roast about 10% less. That is level 2.7 (ends at 222.2 °C), down from level 3 (223.4 °C). This is level change 1 of the 3 this tool aims to get the roast right in. Shall I record it as the next version?");
    expect(r.onYes).toEqual({ command: "version:add", input: { beanId: 2, parent: 2, level: 2.7, reason: "The cup tasted ashy, which means the beans were over-roasted. Roast about 10% less." } });
  });
  it("says so when the nearest level gives a different change than the rule asked for", () => {
    const r = adviceReport(2, answer({ taste: ["ashy"] }), { ...move, changePct: -6.4 });
    expect(r.say).toContain("That is level 2.7 (ends at 222.2 °C), down from level 3 (223.4 °C). The nearest level on this profile gives about 6% less roasting, not 10%;");
    expect(r.onYes).toBeDefined();
  });
  it("stays quiet when the level gives the change asked for, to the nearest percent", () => {
    for (const changePct of [-10, -9.6, -10.4]) expect(adviceReport(2, answer({ taste: ["ashy"] }), { ...move, changePct }).say).not.toContain("nearest level");
  });
  it("says up when the level goes up", () => {
    const r = adviceReport(2, answer({ taste: ["grassy"] }), { from: move.to, to: move.from });
    expect(r.say).toContain("up from level 2.7");
  });
  it("offers no command when the change can't be turned into a level, and says why", () => {
    const r = adviceReport(2, answer({ taste: ["ashy"] }), undefined, "I can't find that profile.");
    expect(r.onYes).toBeUndefined();
    expect(r.say).toBe("The cup tasted ashy, which means the beans were over-roasted. Roast about 10% less. I can't find that profile.");
    expect(adviceReport(2, answer({ taste: ["ashy"] }), move, "Already the closest level.").onYes).toBeUndefined();
    expect(adviceReport(2, answer({ taste: ["ashy"] }), undefined).say).toContain("can't be turned into a level");
  });
  it("gives a hold or a question as plain words and never a command", () => {
    const hold = adviceReport(2, answer({ taste: ["sweet"], quality: 5 }), undefined);
    expect(hold).toEqual({ say: "The cup tasted sweet and the roast quality is 5 (clean, expressive, balanced and sweet). Keep this roast as it is. No new version is needed." });
    expect(adviceReport(2, answer({ taste: ["grassy", "bitter"] }), undefined).onYes).toBeUndefined();
    const clean = adviceReport(2, answer({ taste: ["flat"] }), undefined);
    expect(clean.onYes).toBeUndefined();
    expect(clean.say).toContain("Keep this roast as it is. No new version is needed.");
  });
  describe("counts the level changes the tool aims to get a roast right in", () => {
    const at = (levelChange: number, t: Partial<TastedRoast> = { taste: ["ashy"] }) => adviceReport(2, { basedOn: { ...basedOn, levelChange }, advice: advise(input(t)) }, move);
    it("says which of the three this recommendation is, before the question", () => {
      expect(at(1).say).toContain("This is level change 1 of the 3 this tool aims to get the roast right in. Shall I record it as the next version?");
      expect(at(2).say).toContain("This is level change 2 of the 3");
      expect(at(3).say).toContain("This is level change 3 of the 3");
    });
    it("counts only a level change: a switch of profile is not one, and a hold or a question has no count", () => {
      const switchAnswer = adviceReport(2, { basedOn: { ...basedOn, levelChange: 2 }, advice: { kind: "switch-profile", ruleId: "level-not-helping", profileName: "KL Washed", level: 1.2, endTempC: 217.6, reason: "The level isn't helping." } }, undefined);
      expect(switchAnswer.say).toBe("The level isn't helping. Next, try KL Washed instead: pick it on the Nano and set level 1.2 (ends at 217.6 °C). Shall I record that as the next version?");
      expect(at(2, { taste: ["sweet"], quality: 5 }).say).not.toContain("This is level change");
      expect(at(2, { taste: ["grassy", "bitter"] }).say).not.toContain("This is level change");
    });
    it("puts the earlier-roast note before the question as well", () => {
      const r = adviceReport(2, { basedOn: { ...basedOn, levelChange: 1 }, advice: advise(input({ taste: ["ashy"] })), setAside: { roasts: 1, tastingBrew: "pourover" } }, move);
      expect(r.say.endsWith("left out of the comparison (roasts are tasted as pour over). Shall I record it as the next version?")).toBe(true);
    });
  });
  it("has a command only for a change, whatever the evidence", () => {
    const cases: Partial<TastedRoast>[] = [{ taste: ["grassy"] }, { taste: ["grassy", "bitter"] }, { taste: ["flat"] }, { taste: ["flat"], quality: 4 }, { taste: ["balanced"], quality: 5 }];
    for (const c of cases) {
      const a = answer(c);
      expect(adviceReport(2, a, move).onYes !== undefined, JSON.stringify(c)).toBe(a.advice.kind === "change");
    }
  });
});

describe("every tasting of a coffee is of the brew its roaster chose", () => {
  const chosen = (brew: string, tastingBrew: string, extra: Partial<TastedRoast> = {}) =>
    advise({ latest: roast({ taste: ["grassy"], brew, ...extra }), earlier: [], context: { tastingBrew } });

  it("lets a tasting in the chosen brew through to the other rules, whatever the brew is", () => {
    for (const brew of ["espresso", "moka", "other", "pourover", "immersion", "aeropress"]) expect(change(chosen(brew, brew)).ruleId, brew).toBe("under-roasted");
  });
  it("asks for a retaste when the tasting is in another brew, filter or not, and names the chosen one", () => {
    const a = chosen("pourover", "espresso");
    expect(a).toMatchObject({ kind: "ask", ruleId: "tasted-in-other-brew" });
    expect(a.reason).toBe(
      "This roast was tasted brewed as pour over. Roasts of this coffee are tasted as espresso, so that a difference in the cup is not a difference between kinds of brew. Taste this roast brewed as espresso and record that tasting, then ask again.",
    );
    expect(chosen("espresso", "immersion").reason).toContain("tasted brewed as espresso.");
    expect(chosen("moka", "pourover").reason).toContain("tasted brewed as moka pot.");
  });
  it("is the same on every profile: the cupping protocol does not depend on the bean or its roast", () => {
    expect(chosen("espresso", "pourover", { profile: "1500-2000m Rest" }).ruleId).toBe("tasted-in-other-brew");
  });
  it("comes first: a cup in another brew is not judged on its words, its quality or its rest", () => {
    expect(chosen("espresso", "pourover", { quality: 4 }).ruleId).toBe("tasted-in-other-brew");
    expect(chosen("espresso", "pourover", { profile: "1500-2000m Rest", restNeeded: [3, 5], restedDays: 1 }).ruleId).toBe("tasted-in-other-brew");
  });
  it("has no brew to hold to when the engine is used without a bean: any brew goes through", () => {
    for (const brew of ["espresso", "pourover"]) expect(change(advise(input({ taste: ["grassy"], brew }))).ruleId, brew).toBe("under-roasted");
  });
  it("offers the same brews at intake and in the tasting form: the roaster's own brew is theirs to choose", () => {
    const brewsOf = (fields: Field[], id: string) => {
      const field = fields.find((f) => f.id === id);
      return field && "options" in field ? field.options.map((o) => o.value) : [];
    };
    expect(brewsOf(TASTING_FIELDS, "brew")).toEqual(brewsOf(INTAKE_FIELDS, "tastingBrew"));
    expect(brewsOf(TASTING_FIELDS, "brew")).toEqual(["pourover", "immersion", "aeropress", "espresso", "moka", "other"]);
  });

  describe("from a bean's history", () => {
    const pourover: AdviceContext = { tastingBrew: "pourover" };
    const espresso: AdviceContext = { tastingBrew: "espresso" };
    const tasting = (id: number, taste: string[], brew: string, extra: Partial<HistoryForAdvice["versions"][0]["roasts"][0]["tastings"][0]> = {}) => ({ id, tastedOn: "2026-10-10", quality: taste.some((c) => DEFECTS.includes(c)) ? 2 : 3, taste, brew, ...extra });
    const roastRow = (id: number, roastedAt: string, thermalDose: number, tastings: ReturnType<typeof tasting>[]) => ({ id, roastedAt, logLevel: 3, features: { thermalDose }, tastings });
    const history = (...roasts: ReturnType<typeof roastRow>[]): HistoryForAdvice => ({ versions: [{ number: 1, profileName: "Test", roasts }] });

    it("counts each roast by its newest tasting in the chosen brew, not by its newest tasting", () => {
      // Roast 1 was tasted as pour over (grassy) and then as espresso (balanced): the pour over tasting counts.
      const h = history(roastRow(1, "2026-10-01", 10, [tasting(1, ["grassy"], "pourover"), tasting(2, ["balanced", "sweet"], "espresso", { quality: 5 })]));
      const r = adviseFromHistory(h, pourover)!;
      expect(r.basedOn.tastingId).toBe(1);
      expect(r.advice).toMatchObject({ ruleId: "under-roasted" });
      expect(r.setAside).toBeUndefined();
    });
    it("asks for a retaste when the newest roast has no tasting in the chosen brew, and still reports which tasting it read", () => {
      const r = adviseFromHistory(history(roastRow(1, "2026-10-01", 10, [tasting(7, ["grassy"], "espresso")])), pourover)!;
      expect(r.advice).toMatchObject({ kind: "ask", ruleId: "tasted-in-other-brew" });
      expect(r.basedOn.tastingId).toBe(7);
    });
    it("leaves out earlier roasts with no tasting in the chosen brew, and says how many and which brew", () => {
      const h = history(roastRow(1, "2026-10-01", 10.5, [tasting(1, ["bitter"], "espresso")]), roastRow(2, "2026-10-03", 11, [tasting(2, ["bitter"], "pourover")]), roastRow(3, "2026-10-05", 10, [tasting(3, ["grassy"], "pourover")]));
      const r = adviseFromHistory(h, pourover)!;
      expect(r.setAside).toEqual({ roasts: 1, tastingBrew: "pourover" });
      // Roast 2 (11) is the earlier result that counts. Roast 1 (10.5) is closer, and would halve the gap to 2.5%, if it counted.
      expect(change(r.advice)).toMatchObject({ ruleId: "under-roasted-bracketed", thermalDoseChangePct: 5 });
      const say = adviceReport(1, r, undefined, "No profile.").say;
      expect(say.endsWith("One earlier roast was without a rated tasting brewed as pour over, so it is left out of the comparison (roasts are tasted as pour over).")).toBe(true);
    });
    it("counts several set-aside roasts in the plural, and says nothing when there are none", () => {
      const h = history(roastRow(1, "2026-10-01", 12, [tasting(1, ["bitter"], "espresso")]), roastRow(2, "2026-10-02", 11, [tasting(2, ["bitter"], "moka")]), roastRow(3, "2026-10-05", 10, [tasting(3, ["grassy"], "pourover")]));
      expect(adviceReport(1, adviseFromHistory(h, pourover)!, undefined, "No profile.").say).toContain("2 earlier roasts were without a rated tasting brewed as pour over, so they are left out of the comparison");
      const clean = adviseFromHistory(history(roastRow(1, "2026-10-01", 10, [tasting(1, ["grassy"], "pourover")])), pourover)!;
      expect(clean.setAside).toBeUndefined();
      expect(adviceReport(1, clean, undefined, "No profile.").say).not.toContain("left out");
    });
    it("holds a coffee to its own brew, espresso as much as any: the tastings in it count and the others are left out", () => {
      const h = history(roastRow(1, "2026-10-01", 10.5, [tasting(1, ["bitter"], "pourover")]), roastRow(2, "2026-10-03", 11, [tasting(2, ["bitter"], "espresso")]), roastRow(3, "2026-10-05", 10, [tasting(3, ["grassy"], "espresso")]));
      const r = adviseFromHistory(h, espresso)!;
      expect(r.setAside).toEqual({ roasts: 1, tastingBrew: "espresso" });
      expect(change(r.advice)).toMatchObject({ ruleId: "under-roasted-bracketed" });
      expect(adviceReport(1, r, undefined, "No profile.").say.endsWith("One earlier roast was without a rated tasting brewed as espresso, so it is left out of the comparison (roasts are tasted as espresso).")).toBe(true);
    });
    it("counts every tasting when the engine is used without a bean", () => {
      const h = history(roastRow(1, "2026-10-01", 10.5, [tasting(1, ["bitter"], "espresso")]), roastRow(2, "2026-10-05", 10, [tasting(3, ["grassy"], "pourover")]));
      expect(adviseFromHistory(h)!.setAside).toBeUndefined();
    });
  });
});

describe("the three level changes are used and the cup still has a defect", () => {
  const ALTERNATIVE: AdviceContext = { alternative: { profileName: "KL Washed", level: 1.2, endTempC: 217.6 } };
  const used = (latest: Partial<TastedRoast>, over: Partial<AdviceInput> = {}) => advise({ latest: roast(latest), earlier: [], levelChangesMade: 3, ...over });

  it("states to try a different profile, and names the bean's other profile with its level when there is one", () => {
    const a = used({ taste: ["grassy"], profile: "1500-2000m Rest" }, { context: ALTERNATIVE });
    expect(a).toEqual({
      kind: "switch-profile",
      ruleId: "level-changes-used",
      profileName: "KL Washed",
      level: 1.2,
      endTempC: 217.6,
      reason: "The cup tasted grassy (under-roasted) after 3 level changes, the number this tool aims to get the roast right in. Try a different profile.",
    });
  });
  it("is the same for a scorched cup", () => {
    expect(used({ taste: ["ashy", "roasty"] }, { context: ALTERNATIVE })).toMatchObject({ kind: "switch-profile", ruleId: "level-changes-used", reason: expect.stringContaining("The cup tasted ashy and roasty (over-roasted) after 3 level changes") });
  });
  it("asks the roaster to pick the profile when the bean has no other profile to suggest, because the tool can't choose one", () => {
    const a = used({ taste: ["grassy"] });
    expect(a).toEqual({
      kind: "ask",
      ruleId: "level-changes-used",
      reason: "The cup tasted grassy (under-roasted) after 3 level changes, the number this tool aims to get the roast right in. Try a different profile. No other stock profile is suggested for this bean. This tool can't choose one for this bean: pick another Kaffelogic profile, say which, and I'll work out the level for the colour you are after.",
    });
  });
  it("asks the same when the other profile has been roasted already, and says so", () => {
    const a = used({ taste: ["grassy"], profile: "KL Washed" }, { context: ALTERNATIVE });
    expect(a).toMatchObject({ kind: "ask", ruleId: "level-changes-used" });
    expect(a.reason).toContain("You've already roasted this bean on KL Washed, the other stock profile suggested for this bean.");
    const earlierOn = used({ taste: ["grassy"], profile: "1500-2000m Rest" }, { context: ALTERNATIVE, earlier: [roast({ taste: ["grassy"], profile: "KL Washed" })] });
    expect(earlierOn).toMatchObject({ kind: "ask", ruleId: "level-changes-used" });
  });
  it("comes before the bracket and the contradiction: a profile is next whatever the earlier roasts say", () => {
    expect(used({ taste: ["grassy"], thermalDose: 10 }, { earlier: [roast({ thermalDose: 12, taste: ["bitter"] })], context: ALTERNATIVE }).ruleId).toBe("level-changes-used");
    expect(used({ taste: ["grassy"], thermalDose: 10 }, { earlier: [roast({ thermalDose: 10, taste: ["bitter"] })], context: ALTERNATIVE }).ruleId).toBe("level-changes-used");
  });
  it("applies from the third level change on, not before it, and not when the engine is used without a bean", () => {
    expect(used({ taste: ["grassy"] }, { levelChangesMade: 2, context: ALTERNATIVE })).toMatchObject({ kind: "change", ruleId: "under-roasted" });
    expect(used({ taste: ["grassy"] }, { levelChangesMade: 4 }).ruleId).toBe("level-changes-used");
    expect(used({ taste: ["grassy"] }, { levelChangesMade: undefined, context: ALTERNATIVE })).toMatchObject({ kind: "change", ruleId: "under-roasted" });
  });
  it("leaves a clean cup, mixed signals, a cup in another brew and an early cup to the rules for them", () => {
    expect(used({ taste: ["sweet", "balanced"], quality: 4 }).ruleId).toBe("keep-as-is");
    expect(used({ taste: ["flat"] }).ruleId).toBe("keep-as-is");
    expect(used({ taste: ["grassy", "bitter"] }).ruleId).toBe("mixed-signals");
    expect(used({ taste: ["grassy"], profile: "1500-2000m Rest", restNeeded: [3, 5], restedDays: 1 }).ruleId).toBe("tasted-too-soon");
    expect(used({ taste: ["grassy"], brew: "moka" }, { context: { tastingBrew: "pourover" } }).ruleId).toBe("tasted-in-other-brew");
  });
  it("is reached from a bean's history once its newest roast has three level changes behind it", () => {
    const row = (id: number, thermalDose: number) => ({ id, roastedAt: `2026-10-0${id}`, logLevel: 3, features: { thermalDose }, tastings: [{ id, tastedOn: `2026-10-0${id}`, quality: 2, taste: ["grassy"], brew: "pourover" }] });
    const history: HistoryForAdvice = {
      versions: [1, 2, 3, 4].map((number) => ({ number, parentNumber: number === 1 ? undefined : number - 1, profileName: "Test", roasts: [row(number, 8 + number)] })),
    };
    const r = adviseFromHistory(history, ALTERNATIVE)!;
    expect(r.basedOn.levelChange).toBe(4);
    expect(r.advice).toMatchObject({ kind: "switch-profile", ruleId: "level-changes-used", profileName: "KL Washed" });
    // One version fewer and it is not reached yet: the level not helping is what switches the profile then.
    const three: HistoryForAdvice = { versions: history.versions.slice(0, 3) };
    expect(adviseFromHistory(three, ALTERNATIVE)!.basedOn.levelChange).toBe(3);
    expect(adviseFromHistory(three, ALTERNATIVE)!.advice.ruleId).toBe("level-not-helping");
  });
});

describe("a roast tasted before its profile is ready", () => {
  const rest = [3, 5] as const;
  const early = (days: number | undefined, taste: string[] = ["grassy"], extra: Partial<TastedRoast> = {}) =>
    advise(input({ taste, brew: "pourover", profile: "1500-2000m Rest", restNeeded: rest, restedDays: days, ...extra }));

  it("holds a grassy cup tasted before the rest the profile asks for, and says when to retaste", () => {
    const a = early(1);
    expect(a).toMatchObject({ kind: "hold", ruleId: "tasted-too-soon" });
    expect(a.reason).toBe(
      "The cup tasted grassy, but this roast's profile (1500-2000m Rest) is written for 3 to 5 days of resting before brewing, and it was tasted 1 day after roasting. The rest the profile asks for is not over. Taste it again on day 3 or later before changing anything.",
    );
    expect(early(0).reason).toContain("tasted the day it was roasted");
    expect(early(2).reason).toContain("2 days after roasting");
  });
  it("judges the cup normally from the first day of the rest window", () => {
    expect(change(early(3)).ruleId).toBe("under-roasted");
    expect(change(early(9)).ruleId).toBe("under-roasted");
  });
  it("only holds grassy-side cups: resting doesn't explain bitter or ashy", () => {
    expect(change(early(1, ["ashy"])).ruleId).toBe("over-roasted");
    expect(advise(input({ taste: ["sweet"], quality: 5, restNeeded: rest, restedDays: 1 })).ruleId).toBe("keep-as-is");
  });
  it("does nothing for a profile with no rest to wait for, or an unknown number of days", () => {
    expect(change(early(1, ["grassy"], { restNeeded: undefined })).ruleId).toBe("under-roasted");
    expect(change(early(undefined)).ruleId).toBe("under-roasted");
  });
  it("comes after the mixed-signals check, which is about the roast itself", () => {
    expect(early(1, ["grassy", "bitter"]).ruleId).toBe("mixed-signals");
  });
  it("comes after the quality check", () => {
    // A grassy cup rated clean contradicts itself, whatever the rest says.
    expect(early(1, ["grassy"], { quality: 4 }).ruleId).toBe("quality-vs-words");
  });
});

describe("when the level isn't helping", () => {
  const alternative = { profileName: "KL Washed", level: 1.2, endTempC: 217.6 };
  const context: AdviceContext = { alternative };
  const uncooked = (thermalDose: number, extra: Partial<TastedRoast> = {}) => roast({ thermalDose, taste: ["grassy"], profile: "1500-2000m Rest", ...extra });
  const run = (latest: TastedRoast, earlier: TastedRoast[], ctx: AdviceContext | undefined = context) => advise({ latest, earlier, context: ctx });

  it("suggests the other profile when more roasting left the cup just as grassy", () => {
    const a = run(uncooked(11), [uncooked(10)]);
    expect(a).toMatchObject({ kind: "switch-profile", ruleId: "level-not-helping", profileName: "KL Washed", level: 1.2, endTempC: 217.6 });
    expect(a.reason).toBe("The cup tasted grassy (under-roasted) even after the roasting went 10% more than an earlier roast on this profile, which tasted grassy too. The level moved the roast and the cup stayed on the same side.");
  });
  it("compares curves, not names: an edited copy of a stock profile is a different profile", () => {
    expect(change(run(uncooked(11, { profileKey: "edited" }), [uncooked(10, { profileKey: "stock" })])).ruleId).toBe("under-roasted");
    expect(run(uncooked(11, { profileKey: "same" }), [uncooked(10, { profileKey: "same" })]).kind).toBe("switch-profile");
    // Without a fingerprint on both sides, the profile name is all there is to go on.
    expect(run(uncooked(11, { profileKey: "edited" }), [uncooked(10)]).kind).toBe("switch-profile");
  });
  it("is the same on the over-roasted side: less roasting, still bitter", () => {
    const a = run(roast({ thermalDose: 9, taste: ["bitter"], profile: "KL Washed" }), [roast({ thermalDose: 10, taste: ["roasty"], profile: "KL Washed" })], { alternative: { profileName: "1500-2000m Rest", level: 2.5, endTempC: 220.1 } });
    expect(a).toMatchObject({ kind: "switch-profile", profileName: "1500-2000m Rest" });
    expect(a.reason).toContain("even after the roasting went 10% less than an earlier roast on this profile, which tasted roasty too");
  });
  it("needs the change to have been real: a move inside the noise doesn't count", () => {
    const small = 10 * (1 + (RULE_SETTINGS.noResponsePct - 1) / 100);
    expect(change(run(uncooked(small), [uncooked(10)])).ruleId).toBe("under-roasted");
    const enough = 10 * (1 + RULE_SETTINGS.noResponsePct / 100 + 0.001);
    expect(run(uncooked(enough), [uncooked(10)]).kind).toBe("switch-profile");
  });
  it("blames the level only when both roasts used the same profile", () => {
    expect(change(run(uncooked(11), [uncooked(10, { profile: "KL Washed" })])).ruleId).toBe("under-roasted");
  });
  it("blames the level only when the earlier roast tasted the same way", () => {
    expect(change(run(uncooked(11), [roast({ thermalDose: 10, taste: ["balanced"], profile: "1500-2000m Rest" })])).ruleId).toBe("under-roasted");
  });
  it("still halves the gap when a result on the other side exists: the level is working", () => {
    expect(run(uncooked(11), [uncooked(10), roast({ thermalDose: 13, taste: ["bitter"], profile: "1500-2000m Rest" })])).toMatchObject({ ruleId: "under-roasted-bracketed" });
  });
  it("asks instead when there is no other profile to suggest", () => {
    const a = run(uncooked(11), [uncooked(10)], {});
    expect(a).toMatchObject({ kind: "ask", ruleId: "level-not-helping" });
    expect(a.reason).toContain("No other stock profile is suggested for this bean.");
    expect(a.reason).toContain("can't edit yet");
  });
  it("asks instead when the other profile has already been tried, and doesn't send them back", () => {
    const a = run(uncooked(11), [uncooked(10), uncooked(7, { profile: "KL Washed" })]);
    expect(a).toMatchObject({ kind: "ask", ruleId: "level-not-helping" });
    expect(a.reason).toContain("You've already roasted this bean on KL Washed");
  });
  it("hands the roaster the profile switch as a version to record, and nothing else", () => {
    const basedOn = { version: 2, roastId: 4, tastingId: 4, level: 3.2, measuredThermalDose: 11, levelChange: 1 };
    const advice = run(uncooked(11), [uncooked(10)]);
    const report = adviceReport(7, { basedOn, advice }, undefined);
    expect(report.say).toBe(`${advice.reason} Next, try KL Washed instead: pick it on the Nano and set level 1.2 (ends at 217.6 °C). Shall I record that as the next version?`);
    expect(report.onYes).toEqual({ command: "version:add", input: { beanId: 7, parent: 2, profileName: "KL Washed", level: 1.2, reason: advice.reason } });
  });
});

describe("what the Kaffelogic adapter tells the rules", () => {
  const washed = { name: "Guji", species: "arabica", decaf: false, process: "washed", drinkWhen: "rest", agtronTarget: 55, tastingBrew: "pourover", altitudeM: 1950 } as const;

  it("knows which stock profiles must rest, and for how long", () => {
    const { restNeeded } = kaffelogicAdviceContext(washed);
    expect(restNeeded!("1500-2000m Rest")).toEqual([3, 5]);
    expect(restNeeded!("0-1200m Rest")).toEqual([3, 5]);
    expect(restNeeded!("1500-2000m RTD")).toBeUndefined();
    expect(restNeeded!("KL Washed")).toBeUndefined();
    expect(restNeeded!("Not a stock profile")).toBeUndefined();
  });
  it("offers the altitude profile as the alternative to the process profile, at the level the profile recommends", () => {
    expect(kaffelogicAdviceContext(washed).alternative).toEqual({ profileName: "1500-2000m Rest", level: 3.2, endTempC: 222.4 });
  });
  it("offers an RTD altitude profile when the coffee is drunk soon, and none when there is nothing else to try", () => {
    expect(kaffelogicAdviceContext({ ...washed, drinkWhen: "soon" }).alternative).toEqual({ profileName: "1500-2000m RTD", level: 3.1, endTempC: 219.3 });
    expect(kaffelogicAdviceContext({ ...washed, process: "unknown" }).alternative).toBeUndefined();
    expect(kaffelogicAdviceContext({ ...washed, species: "robusta" }).alternative).toBeUndefined();
  });
});

describe("rest and profile switching, from what the store returns", () => {
  it("holds a grassy cup tasted a day after a Rest-profile roast, then judges the retaste", async () => {
    const db = await migratedDb();
    const intake = { name: "Rest bean", species: "arabica", decaf: false, process: "unknown", drinkWhen: "rest", agtronTarget: 55, tastingBrew: "pourover", altitudeM: 1950 } as const;
    const { beanId } = await addBean(db, intake);
    const { roastId } = await addRoast(db, { beanId, klog: syntheticLog({ first_crack: 540, roast_end: 600 }), answers: { greenG: 120, roastedG: 101.5 } });
    const context = kaffelogicAdviceContext(intake);
    // The synthetic log isn't a Rest-profile roast, but the version keeps the stock profile it was planned on
    // (the store only replaces that link when a log names another stock profile). The hold depends on that link.
    expect((await beanHistory(db, beanId)).versions[0].baseProfile).toBe("1500-2000m Rest");
    // The synthetic roast is dated 2025-06-25.
    await addTasting(db, { beanId, roastId, answers: { tastedOn: "2025-06-26", brew: "pourover", quality: 2, taste: ["grassy", "bready"] } });
    const early = adviseFromHistory(await beanHistory(db, beanId), context)!;
    expect(early.advice).toMatchObject({ kind: "hold", ruleId: "tasted-too-soon" });
    expect(early.advice.reason).toContain("1500-2000m Rest");
    await addTasting(db, { beanId, roastId, answers: { tastedOn: "2025-06-29", brew: "pourover", quality: 2, taste: ["grassy", "bready"] } });
    const later = adviseFromHistory(await beanHistory(db, beanId), context)!;
    expect(later.advice).toMatchObject({ kind: "change", ruleId: "under-roasted", thermalDoseChangePct: 15 });
  });
});


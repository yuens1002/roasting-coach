import { describe, expect, it } from "vitest";
import { type RoastRun, TABLE_COLUMNS, beanTable, profileRanges, tableLegend } from "../src/core/beanTable.js";
import { NO_OVERRIDES, applyChange, resolveCalibration } from "../src/core/calibration.js";
import { LEVEL_CHANGE_BUDGET, type HistoryForAdvice, adviseFromHistory } from "../src/core/rules.js";

type Tasting = { words: string[]; quality: number; brew?: string };
/** A roast: its number (which also dates it), version, level, measured thermal dose (absent: no log), and tasting (absent: not tasted). */
const roast = (id: number, level: number, thermalDose: number | undefined, tasting?: Tasting) => ({
  id,
  roastedAt: `2026-10-0${id}`,
  logLevel: level,
  features: thermalDose === undefined ? undefined : { thermalDose },
  tastings: tasting ? [{ id, tastedOn: `2026-10-1${id}`, quality: tasting.quality, taste: tasting.words, brew: tasting.brew ?? "pourover" }] : [],
});
const version = (number: number, parentNumber: number | undefined, roasts: ReturnType<typeof roast>[]) => ({ number, parentNumber, level: roasts[0]?.logLevel, profileName: "Robusta", roasts });

const LADDER: HistoryForAdvice = {
  versions: [
    version(1, undefined, [roast(1, 3.0, 10, { words: ["grassy", "bready"], quality: 2 })]),
    version(2, 1, [roast(2, 3.8, 11, { words: ["bitter"], quality: 2 })]),
    version(3, 2, [roast(3, 3.4, 10.5, { words: ["sweet", "balanced"], quality: 4 })]),
  ],
};

describe("the bean's table", () => {
  it("has a row for each roast, with the step in thermal dose from the roast before and how it tasted from uncooked to scorched", () => {
    const { rows } = beanTable(LADDER);
    expect(rows.map((r) => [r.roast, r.version, r.level, r.thermalDose, r.stepPct, r.tasted?.reads, r.tasted?.quality])).toEqual([
      [1, 1, 3, 10, undefined, "uncooked", 2],
      [2, 2, 3.8, 11, 10, "scorched", 2],
      [3, 3, 3.4, 10.5, -4.5, "clean", 4],
    ]);
  });

  it("says the same in the finished text: the table, the level changes used, the bracket, and the clean roast", () => {
    expect(beanTable(LADDER).say).toBe(
      [
        "| Roast | Version | Profile | Level | Thermal dose | Step | Overshoot (°C) | Offset | Tasted | Quality | Reads as |",
        "|---|---|---|---|---|---|---|---|---|---|---|",
        "| 1 | 1 | Robusta | 3 | 10 | - | - | - | grassy, bready | 2 | uncooked |",
        "| 2 | 2 | Robusta | 3.8 | 11 | +10% | - | - | bitter | 2 | scorched |",
        "| 3 | 3 | Robusta | 3.4 | 10.5 | −4.5% | - | - | sweet, balanced | 4 | clean |",
        "",
        `Level changes made on this profile: 2 of the ${LEVEL_CHANGE_BUDGET} this tool aims to get the roast right in.`,
        "Uncooked up to thermal dose 10, roast 1, level 3; scorched from thermal dose 11, roast 2, level 3.8. The roast that clears both defects lies between them.",
        "Clean: roast 3. The best, roast 3, was rated 4 (clean and expressive).",
      ].join("\n"),
    );
  });

  it("counts the level changes behind the newest tasted roast, from the version links", () => {
    expect(beanTable(LADDER).levelChangesMade).toBe(2);
    expect(beanTable({ versions: LADDER.versions.slice(0, 1) }).levelChangesMade).toBe(0);
  });

  it("says plainly when the roasts so far are all on one side", () => {
    const uncooked = beanTable({ versions: [version(1, undefined, [roast(1, 3, 10, { words: ["grassy"], quality: 2 })]), version(2, 1, [roast(2, 3.3, 11, { words: ["bready"], quality: 2 })])] });
    expect(uncooked.say).toContain("Every defect so far was uncooked, up to thermal dose 11, roast 2, level 3.3. The roast that clears it lies with more roasting.");
    const scorched = beanTable({ versions: [version(1, undefined, [roast(1, 3, 10, { words: ["ashy"], quality: 2 })]), version(2, 1, [roast(2, 2.7, 9, { words: ["bitter"], quality: 2 })])] });
    expect(scorched.say).toContain("Every defect so far was scorched, from thermal dose 9, roast 2, level 2.7. The roast that clears it lies with less roasting.");
  });

  it("says when the roasts disagree about the way to go, rather than drawing a bracket", () => {
    // More roasting tasted uncooked, less roasting tasted scorched.
    const { say } = beanTable({ versions: [version(1, undefined, [roast(1, 3, 10, { words: ["ashy"], quality: 2 })]), version(2, 1, [roast(2, 3.3, 11, { words: ["grassy"], quality: 2 })])] });
    expect(say).toContain("Roast 2 (thermal dose 11) tasted uncooked and roast 1 (thermal dose 10), with no more roasting, tasted scorched. The roasts disagree about which way to go.");
    expect(say).not.toContain("lies between them");
  });

  it("calls a cup with both kinds of word uncooked and scorched, and does not use it for a bracket", () => {
    const { rows, say } = beanTable({ versions: [version(1, undefined, [roast(1, 3, 10, { words: ["grassy", "bitter"], quality: 2 })])] });
    expect(rows[0].tasted?.reads).toBe("uncooked and scorched");
    expect(say).not.toContain("Every defect so far");
    expect(say).not.toContain("Uncooked up to");
  });

  it("lists a roast that was not tasted, or has no measured thermal dose, and keeps it out of the steps", () => {
    const { rows, say } = beanTable({
      versions: [
        version(1, undefined, [roast(1, 3, 10, { words: ["grassy"], quality: 2 })]),
        version(2, 1, [roast(2, 3.3, 11), roast(3, 3.3, undefined, { words: ["bready"], quality: 2 })]),
        version(3, 2, [roast(4, 3.6, 12, { words: ["sweet"], quality: 3 })]),
      ],
    });
    expect(rows.map((r) => r.roast)).toEqual([1, 2, 3, 4]);
    expect(rows[1]).toMatchObject({ thermalDose: 11, tasted: undefined });
    expect(rows[2]).toMatchObject({ thermalDose: undefined, tasted: undefined });
    // The step is from the last roast that was tasted, 10 to 12.
    expect(rows[3].stepPct).toBe(20);
    expect(say).toContain("| 2 | 2 | Robusta | 3.3 | 11 | - | - | - | - | - | not tasted yet |");
    expect(say).toContain("| 3 | 2 | Robusta | 3.3 | - | - | - | - | - | - | no measured thermal dose |");
  });

  it("marks a roast whose tasting is not in the coffee's tasting brew as not counted, and leaves it out of the bracket", () => {
    const history: HistoryForAdvice = {
      versions: [
        version(1, undefined, [roast(1, 3, 10, { words: ["grassy"], quality: 2, brew: "espresso" })]),
        version(2, 1, [roast(2, 3.3, 11, { words: ["grassy"], quality: 2 })]),
      ],
    };
    const { say } = beanTable(history, { tastingBrew: "pourover" });
    expect(say).toContain("| 1 | 1 | Robusta | 3 | 10 | - | - | - | grassy | 2 | uncooked (not counted: tasted as espresso) |");
    expect(say).toContain("Every defect so far was uncooked, up to thermal dose 11, roast 2, level 3.3.");
  });

  it("reads the words the way the roaster does", () => {
    const changed = applyChange(NO_OVERRIDES, { words: { flat: "under" } });
    if (!changed.ok) throw new Error(changed.errors.join("; "));
    const flat: HistoryForAdvice = { versions: [version(1, undefined, [roast(1, 3, 10, { words: ["flat"], quality: 2 })])] };
    expect(beanTable(flat).rows[0].tasted?.reads).toBe("clean");
    expect(beanTable(flat, undefined, resolveCalibration(changed.overrides)).rows[0].tasted?.reads).toBe("uncooked");
  });

  it("keeps the bracket to what the advice would do: a scorched roast within the noise band of an uncooked one is a disagreement, not a bracket", () => {
    // 10 and 10.2 are 2% apart, inside the 3% noise band.
    const close = beanTable({ versions: [version(1, undefined, [roast(1, 3, 10, { words: ["grassy"], quality: 2 })]), version(2, 1, [roast(2, 3.1, 10.2, { words: ["bitter"], quality: 2 })])] });
    expect(close.say).toContain("The roasts disagree about which way to go.");
    const apart = beanTable({ versions: [version(1, undefined, [roast(1, 3, 10, { words: ["grassy"], quality: 2 })]), version(2, 1, [roast(2, 3.4, 10.5, { words: ["bitter"], quality: 2 })])] });
    expect(apart.say).toContain("lies between them");
  });

  it("takes the gap from the later roast, on unrounded thermal doses, so the bracket is the one the advice would draw", () => {
    // 10 and 10.305: the gap is 2.96% of 10.305 (inside the 3% band) when the scorched roast is the later one, and 3.05% of 10 (outside it) when the uncooked one is.
    const scorchedLater: HistoryForAdvice = { versions: [version(1, undefined, [roast(1, 3, 10, { words: ["grassy"], quality: 2 })]), version(2, 1, [roast(2, 3.1, 10.305, { words: ["bitter"], quality: 2 })])] };
    const uncookedLater: HistoryForAdvice = { versions: [version(1, undefined, [roast(1, 3.1, 10.305, { words: ["bitter"], quality: 2 })]), version(2, 1, [roast(2, 3, 10, { words: ["grassy"], quality: 2 })])] };
    expect(beanTable(scorchedLater).say).toContain("The roasts disagree about which way to go.");
    expect(beanTable(uncookedLater).say).toContain("lies between them");
    expect(adviseFromHistory(scorchedLater)!.advice.ruleId).toBe("over-roasted-contradicted");
    expect(adviseFromHistory(uncookedLater)!.advice.ruleId).toBe("under-roasted-bracketed");
  });

  it("says what it has when no tasted roast is in the coffee's tasting brew, or none has a measured thermal dose", () => {
    const history: HistoryForAdvice = { versions: [version(1, undefined, [roast(1, 3, 10, { words: ["grassy"], quality: 2, brew: "espresso" })])] };
    const other = beanTable(history, { tastingBrew: "pourover" }).say;
    expect(other).toContain("uncooked (not counted: tasted as espresso)");
    expect(other).toContain("Level changes made on this profile: 0 of the 3");
    expect(other).toContain("None of the tasted roasts is in the coffee's tasting brew yet.");
    expect(other).not.toContain("No roast has been tasted yet");
    const noDose = beanTable({ versions: [version(1, undefined, [roast(1, 3, undefined, { words: ["grassy"], quality: 2 })])] }).say;
    expect(noDose).toContain("no measured thermal dose");
    expect(noDose).toContain("No roast with a measured thermal dose has been tasted yet.");
  });

  it("says past the three, not 4 of the 3, when more level changes lie behind the roast on its profile", () => {
    const versions = [1, 2, 3, 4, 5].map((n) => version(n, n === 1 ? undefined : n - 1, [roast(n, 3 + n / 10, 10 + n, { words: ["sweet"], quality: 4 })]));
    const { say, levelChangesMade } = beanTable({ versions });
    expect(levelChangesMade).toBe(4);
    expect(say).toContain("Level changes made on this profile: 4, past the 3 this tool aims to get the roast right in.");
  });

  it("starts the count again on a new profile", () => {
    const onKl = (number: number, parent: number, thermalDose: number) => ({ ...version(number, parent, [roast(number, 1, thermalDose, { words: ["grassy"], quality: 2 })]), profileName: "KL Washed" });
    const versions = [version(1, undefined, [roast(1, 3, 8, { words: ["grassy"], quality: 2 })]), version(2, 1, [roast(2, 3.3, 9, { words: ["grassy"], quality: 2 })]), version(3, 2, [roast(3, 3.6, 10, { words: ["grassy"], quality: 2 })]), onKl(4, 3, 11), onKl(5, 4, 12)];
    expect(beanTable({ versions }).levelChangesMade).toBe(1);
  });

  it("shows what was roasted: a profile of the roaster's own with the stock profile it is built on", () => {
    const own = { ...version(1, undefined, [roast(1, 3, 10, { words: ["sweet"], quality: 4 })]), profileName: "Kenya slow", baseProfile: "1500-2000m Rest" };
    expect(beanTable({ versions: [own] }).rows[0].profile).toBe("Kenya slow (1500-2000m Rest)");
    expect(beanTable({ versions: [{ ...own, profileName: "1500-2000m Rest" }] }).rows[0].profile).toBe("1500-2000m Rest");
    expect(beanTable({ versions: [version(1, undefined, [roast(1, 3, 10, { words: ["sweet"], quality: 4 })])] }).rows[0].profile).toBe("Robusta");
  });

  describe("how each roast ran against its profile", () => {
    // LADDER's roasts measured 10, 11 and 10.5. What each profile's curve predicted, and how far above it the bean ran in development.
    const runs = new Map<number, RoastRun>([
      [1, { profile: "Robusta", predictedThermalDose: 9, measuredThermalDose: 10, overshootC: 1.9 }],
      [2, { profile: "Robusta", predictedThermalDose: 10, measuredThermalDose: 11, overshootC: 2 }],
      [3, { profile: "Robusta", predictedThermalDose: 9.5, measuredThermalDose: 10.5, overshootC: 3.3 }],
    ]);

    it("shows the overshoot and the offset of the measured thermal dose from the predicted one, signed", () => {
      const { rows, say } = beanTable(LADDER, undefined, undefined, runs);
      expect(rows.map((r) => [r.overshootC, r.offsetPct])).toEqual([[1.9, 11.1], [2, 10], [3.3, 10.5]]);
      expect(say).toContain("| 1 | 1 | Robusta | 3 | 10 | - | +1.9 | +11.1% | grassy, bready | 2 | uncooked |");
      expect(say).toContain("| 2 | 2 | Robusta | 3.8 | 11 | +10% | +2.0 | +10% | bitter | 2 | scorched |");
      const below = new Map([[1, { profile: "Robusta", predictedThermalDose: 11, measuredThermalDose: 10, overshootC: -0.4 }]]);
      expect(beanTable(LADDER, undefined, undefined, below).say).toContain("| 1 | 1 | Robusta | 3 | 10 | - | −0.4 | −9.1% | grassy, bready |");
    });

    it("sets the bean's roasts against every roast the roaster has had on the profile, over all their beans", () => {
      const others = new Map<number, RoastRun>([
        ...runs,
        [11, { profile: "Robusta", predictedThermalDose: 10, measuredThermalDose: 10.5, overshootC: 1 }],
        [12, { profile: "Robusta", predictedThermalDose: 10, measuredThermalDose: 10.8, overshootC: 1.5 }],
        [21, { profile: "1500-2000m RTD", predictedThermalDose: 8, measuredThermalDose: 9, overshootC: 3 }],
        [22, { profile: "1500-2000m RTD", predictedThermalDose: 8, measuredThermalDose: 9.2, overshootC: 3.5 }],
      ]);
      const { say } = beanTable(LADDER, undefined, undefined, others);
      expect(say).toContain("Across your 5 roasts on Robusta, the measured thermal dose is +5% to +11.1% against the profile's prediction (median +10%), and your roasts ran +1.0 to +3.3 °C against the profile in development.");
      // A profile this bean was not roasted on has no line, and a profile with one roast has none either.
      expect(say).not.toContain("1500-2000m RTD");
      expect(beanTable(LADDER, undefined, undefined, new Map([[1, runs.get(1)!]])).say).not.toContain("Across your");
    });

    it("leaves a dash where the log or the profile can't say, and does not count such a roast in the range", () => {
      const partial = new Map<number, RoastRun>([
        [1, { profile: "Robusta", measuredThermalDose: 10 }],
        [2, { profile: "Robusta", predictedThermalDose: 10, measuredThermalDose: 11 }],
      ]);
      const { rows, say } = beanTable(LADDER, undefined, undefined, partial);
      expect(rows.map((r) => [r.overshootC, r.offsetPct])).toEqual([[undefined, undefined], [undefined, 10], [undefined, undefined]]);
      expect(say).toContain("| 1 | 1 | Robusta | 3 | 10 | - | - | - | grassy, bready |");
      expect(say).toContain("| 2 | 2 | Robusta | 3.8 | 11 | +10% | - | +10% | bitter |");
      expect(say).not.toContain("Across your");
      expect(beanTable(LADDER).rows.map((r) => [r.overshootC, r.offsetPct])).toEqual([[undefined, undefined], [undefined, undefined], [undefined, undefined]]);
    });

    it("says how many roasts the overshoot range is over when that is not the roasts of the offset range, and says nothing of it when none has an overshoot", () => {
      const some = new Map<number, RoastRun>([
        [1, { profile: "Robusta", predictedThermalDose: 9, measuredThermalDose: 10, overshootC: 1.9 }],
        [2, { profile: "Robusta", predictedThermalDose: 10, measuredThermalDose: 11 }],
        [3, { profile: "Robusta", predictedThermalDose: 9.5, measuredThermalDose: 10.5, overshootC: 3.3 }],
      ]);
      expect(beanTable(LADDER, undefined, undefined, some).say).toContain("and your roasts ran +1.9 to +3.3 °C against the profile in development (over 2 roasts).");
      // A roast with an overshoot and no offset still counts in the overshoot range, and is not in the offset range.
      const extra = new Map<number, RoastRun>([
        [1, { profile: "Robusta", predictedThermalDose: 9, measuredThermalDose: 10, overshootC: 1.9 }],
        [2, { profile: "Robusta", predictedThermalDose: 10, measuredThermalDose: 11, overshootC: 2 }],
        [3, { profile: "Robusta", overshootC: 3.3 }],
      ]);
      expect(beanTable(LADDER, undefined, undefined, extra).say).toContain("Across your 2 roasts on Robusta, the measured thermal dose is +10% to +11.1% against the profile's prediction (median +10.6%), and your roasts ran +1.9 to +3.3 °C against the profile in development (over 3 roasts).");
      // Offsets from fewer than two roasts make no line, whatever overshoots there are.
      const one = new Map<number, RoastRun>([
        [1, { profile: "Robusta", predictedThermalDose: 9, measuredThermalDose: 10, overshootC: 1.9 }],
        [2, { profile: "Robusta", overshootC: 2 }],
        [3, { profile: "Robusta", overshootC: 3.3 }],
      ]);
      expect(beanTable(LADDER, undefined, undefined, one).say).not.toContain("Across your");
      const none = new Map<number, RoastRun>([
        [1, { profile: "Robusta", predictedThermalDose: 9, measuredThermalDose: 10 }],
        [2, { profile: "Robusta", predictedThermalDose: 10, measuredThermalDose: 11 }],
      ]);
      const say = beanTable(LADDER, undefined, undefined, none).say;
      expect(say).toContain("Across your 2 roasts on Robusta, the measured thermal dose is +10% to +11.1% against the profile's prediction (median +10.6%).");
      expect(say).not.toContain("your roasts ran");
    });

    it("works out a profile's range as its lowest, median and highest offset, and its overshoots, from two roasts up", () => {
      const ranges = profileRanges([
        { profile: "A", predictedThermalDose: 10, measuredThermalDose: 11, overshootC: 2 },
        { profile: "A", predictedThermalDose: 10, measuredThermalDose: 12, overshootC: 3 },
        { profile: "A", predictedThermalDose: 10, measuredThermalDose: 10.4 },
        { profile: "B", predictedThermalDose: 10, measuredThermalDose: 11 },
        { predictedThermalDose: 10, measuredThermalDose: 11 },
      ]);
      expect(ranges).toEqual([{ profile: "A", roasts: 3, offsetMinPct: 4, offsetMedianPct: 10, offsetMaxPct: 20, overshootMinC: 2, overshootMaxC: 3, overshootRoasts: 2 }]);
      // A roast with an overshoot and no offset is in the overshoot range only.
      expect(profileRanges([{ profile: "D", predictedThermalDose: 10, measuredThermalDose: 11, overshootC: 1 }, { profile: "D", predictedThermalDose: 10, measuredThermalDose: 12 }, { profile: "D", overshootC: 5 }])[0]).toMatchObject({ roasts: 2, overshootMinC: 1, overshootMaxC: 5, overshootRoasts: 2 });
      expect(profileRanges([{ profile: "C", predictedThermalDose: 10, measuredThermalDose: 11 }, { profile: "C", predictedThermalDose: 10, measuredThermalDose: 13 }])[0]).toMatchObject({ offsetMedianPct: 20, overshootMinC: undefined });
    });
  });

  describe("the description of the columns", () => {
    it("has one for every column of the table, in the table's order, and says them in plain words", () => {
      const headers = beanTable(LADDER).say.split("\n")[0].split("|").slice(1, -1).map((h) => h.trim());
      expect(TABLE_COLUMNS.map((c) => c.column)).toEqual(headers);
      expect(tableLegend().split("\n")).toEqual(["What each column means:", ...TABLE_COLUMNS.map((c) => `- ${c.column}: ${c.means}`)]);
    });
  });

  it("keeps a bar inside a profile name from splitting its row", () => {
    const { say } = beanTable({ versions: [{ ...version(1, undefined, [roast(1, 3, 10, { words: ["sweet"], quality: 4 })]), profileName: "A | B" }] });
    expect(say).toContain("| 1 | 1 | A \\| B | 3 |");
  });

  it("says so for a bean with no roast, and for one with roasts but no tasting", () => {
    expect(beanTable({ versions: [version(1, undefined, [])] }).say).toBe("No roast has been recorded for this bean yet.");
    const untasted = beanTable({ versions: [version(1, undefined, [roast(1, 3, 10)])] });
    expect(untasted.say).toContain("| 1 | 1 | Robusta | 3 | 10 | - | - | - | - | - | not tasted yet |");
    expect(untasted.say).toContain("No roast with a measured thermal dose has been tasted yet.");
    expect(untasted.levelChangesMade).toBeUndefined();
  });
});

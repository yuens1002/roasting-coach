import { describe, expect, it } from "vitest";
import { beanTable } from "../src/core/beanTable.js";
import { NO_OVERRIDES, applyChange, resolveCalibration } from "../src/core/calibration.js";
import { LEVEL_CHANGE_BUDGET, type HistoryForAdvice } from "../src/core/rules.js";

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
        "| Roast | Version | Profile | Level | Thermal dose | Step | Tasted | Quality | Reads as |",
        "|---|---|---|---|---|---|---|---|---|",
        "| 1 | 1 | Robusta | 3 | 10 | - | grassy, bready | 2 | uncooked |",
        "| 2 | 2 | Robusta | 3.8 | 11 | +10% | bitter | 2 | scorched |",
        "| 3 | 3 | Robusta | 3.4 | 10.5 | −4.5% | sweet, balanced | 4 | clean |",
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
    expect(say).toContain("| 2 | 2 | Robusta | 3.3 | 11 | - | - | - | not tasted yet |");
    expect(say).toContain("| 3 | 2 | Robusta | 3.3 | - | - | - | - | no measured thermal dose |");
  });

  it("marks a roast whose tasting is not in the coffee's tasting brew as not counted, and leaves it out of the bracket", () => {
    const history: HistoryForAdvice = {
      versions: [
        version(1, undefined, [roast(1, 3, 10, { words: ["grassy"], quality: 2, brew: "espresso" })]),
        version(2, 1, [roast(2, 3.3, 11, { words: ["grassy"], quality: 2 })]),
      ],
    };
    const { say } = beanTable(history, { tastingBrew: "pourover" });
    expect(say).toContain("| 1 | 1 | Robusta | 3 | 10 | - | grassy | 2 | uncooked (not counted: tasted as espresso) |");
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

  it("keeps a bar inside a profile name from splitting its row", () => {
    const { say } = beanTable({ versions: [{ ...version(1, undefined, [roast(1, 3, 10, { words: ["sweet"], quality: 4 })]), profileName: "A | B" }] });
    expect(say).toContain("| 1 | 1 | A \\| B | 3 |");
  });

  it("says so for a bean with no roast, and for one with roasts but no tasting", () => {
    expect(beanTable({ versions: [version(1, undefined, [])] }).say).toBe("No roast has been recorded for this bean yet.");
    const untasted = beanTable({ versions: [version(1, undefined, [roast(1, 3, 10)])] });
    expect(untasted.say).toContain("| 1 | 1 | Robusta | 3 | 10 | - | - | - | not tasted yet |");
    expect(untasted.say).toContain("No roast with a measured thermal dose has been tasted yet.");
    expect(untasted.levelChangesMade).toBeUndefined();
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseKlog } from "../src/adapters/kaffelogic/parse.js";
import { selectStartingProfile } from "../src/adapters/kaffelogic/startingProfiles.js";
import { kaffelogicToRoastLog } from "../src/adapters/kaffelogic/toRoastLog.js";
import { extractFeatures } from "../src/core/features.js";
import type { Intake } from "../src/core/intake.js";
import { type AdviceInput, type TastedRoast, adviceReport, advise } from "../src/core/rules.js";
import { EXAMPLES, sayFor } from "./rulesDocExamples.js";
import { syntheticLog } from "./syntheticLog.js";

// The tool states what the recorded roasts and tastings show and what a rule does about it. It does not
// give an opinion of its own, hedge a belief the data doesn't support, or judge the coffee (decided
// 2026-10-08, docs/ROADMAP.md "Design direction"). Offers and instructions are fine ("Shall I record it",
// "Taste it again on day 3"); a stance is not.
const STANCES: [RegExp, string][] = [
  [/\bI(?:'d| would| wouldn't| think| suggest| recommend| believe| feel)\b/, "first-person opinion"],
  [/\b(?:probably|likely|unlikely|usually|perhaps|maybe|hopefully|seems|appears|may|might)\b/i, "hedged belief"],
  [/don't write it off|write (?:it|the coffee) off|\bblame\b|\bgood coffee\b|\bbad coffee\b|\bthe best roast\b|\baims? for\b/i, "judgment of the coffee or the tool's own taste"],
  [/\bworth (?:a look|finding|checking|trying)\b|\brather than guessing\b/i, "the tool talking about itself"],
];

// Two phrases in the rulebook's prose are neutral and would trip the patterns: "may" as a permission ("the
// range it may be set to") and "appears" as where a word shows up ("where a defect word first appears").
// They are masked as exact phrases; every other use of those words is checked like the engine's replies.
const DOC_NEUTRAL_PHRASES = [/\bmay be set to\b/g, /\bfirst appears\b/g];
const maskNeutral = (line: string) => DOC_NEUTRAL_PHRASES.reduce((s, p) => s.replace(p, ""), line);

/**
 * The stances in some lines of prose, as one text: the lines are joined first, so a phrase that normal
 * wrapping splits across two lines ("rather than" / "guessing") is still found. Each hit shows its context.
 */
const stancesIn = (lines: string[]): string[] => {
  const text = lines.map(maskNeutral).join(" ");
  return STANCES.flatMap(([pattern, kind]) => {
    const hit = new RegExp(pattern.source, pattern.flags.replace("g", "") + "g");
    return [...text.matchAll(hit)].map((m) => `${kind}: "${m[0]}" in "…${text.slice(Math.max(0, m.index - 40), m.index + 60)}…"`);
  });
};

const DEFECT_WORDS = ["sour", "grassy", "bitter", "ashy", "flat", "thin"];
const roast = (over: Partial<TastedRoast>): TastedRoast => ({ thermalDose: 10, taste: ["flat"], quality: (over.taste ?? ["flat"]).some((c) => DEFECT_WORDS.includes(c)) ? 2 : 3, brew: "pourover", ...over });
const ladder = (qualities: number[], over: Partial<TastedRoast> = {}) => qualities.map((q, i) => roast({ thermalDose: 12 * 0.9 ** i, quality: q, level: 3 - i * 0.3, profile: "Robusta", restedDays: 1, ...over }));
const KL_WASHED = { alternative: { profileName: "KL Washed", level: 1.2, endTempC: 217.6 } };

/**
 * Inputs beyond the doc examples. Each one is chosen for a branch of the wording the examples do not reach,
 * and RULE_IDS below checks that it reaches it, so a case that quietly lands on an earlier rule fails.
 */
const EXTRA: { id: string; input: AdviceInput }[] = [
  // Level not helping: no other profile to suggest, then the other profile already roasted.
  { id: "level-not-helping", input: { latest: roast({ thermalDose: 11, taste: ["sour"], profile: "1500-2000m Rest" }), earlier: [roast({ thermalDose: 10, taste: ["sour"], profile: "1500-2000m Rest" })] } },
  { id: "level-not-helping", input: { latest: roast({ thermalDose: 11, taste: ["sour"], profile: "1500-2000m Rest" }), earlier: [roast({ thermalDose: 10, taste: ["sour"], profile: "1500-2000m Rest" }), roast({ thermalDose: 10.5, taste: ["sour"], profile: "KL Washed" })], context: KL_WASHED } },
  // Contradicted at the same roasting (the doc examples cover the backwards direction).
  { id: "under-roasted-contradicted", input: { latest: roast({ taste: ["sour"] }), earlier: [roast({ taste: ["bitter"] })] } },
  { id: "over-roasted-contradicted", input: { latest: roast({ taste: ["bitter"] }), earlier: [roast({ taste: ["sour"] })] } },
  // Clean cups below the bar: the level tried out and the other profile untested, with a reference; every lever tried out; the other profile ahead of the first.
  { id: "clean-below-bar", input: { latest: ladder([3, 3, 3])[2], earlier: ladder([3, 3, 3]).slice(0, 2), context: { ...KL_WASHED, reference: "Lively and fruit-forward." } } },
  { id: "clean-below-bar", input: { latest: ladder([3, 3, 3, 3])[3], earlier: ladder([3, 3, 3, 3]).slice(0, 3) } },
  {
    id: "clean-below-bar",
    input: {
      latest: roast({ taste: ["flat"], quality: 3, thermalDose: 10, profile: "KL Washed", level: 1.2 }),
      earlier: [roast({ taste: ["flat"], quality: 2, thermalDose: 11, profile: "Robusta", level: 3 })],
      context: KL_WASHED,
    },
  },
  // Tasted in a brew other than the filter brews the cupping protocol allows: one the form no longer offers.
  { id: "tasted-in-other-brew", input: { latest: roast({ taste: ["sour"], brew: "moka" }), earlier: [] } },
  { id: "quality-vs-words", input: { latest: roast({ taste: ["sour", "bitter"], quality: 5 }), earlier: [] } },
  { id: "keep-as-is", input: { latest: roast({ taste: ["sweet"], quality: 5 }), earlier: [] } },
];

/** Every reason the starting-profile choice gives, across the paths it can take. */
const STARTING_INTAKES: Intake[] = [
  { name: "a", species: "arabica", decaf: false, process: "unknown", drinkWhen: "soon" },
  { name: "b", species: "arabica", decaf: false, process: "washed", drinkWhen: "rest", altitudeM: 1850 },
  { name: "c", species: "arabica", decaf: false, process: "natural", drinkWhen: "soon" },
  { name: "e", species: "arabica", decaf: true, process: "unknown", drinkWhen: "soon" },
  { name: "f", species: "robusta", decaf: false, process: "unknown", drinkWhen: "soon", chaffy: true },
  { name: "g", species: "arabica", decaf: false, process: "unknown", drinkWhen: "rest", altitudeM: 900 },
] as Intake[];
const EXPECTED_WHY_LINES = 10;
const WHY_LINES = [...new Set(STARTING_INTAKES.flatMap((intake) => selectStartingProfile(intake).why))];

/** The data warnings the roast features give for a colour change that cannot be used: out of range, and too close to first crack. */
/** The note added to an answer when earlier roasts were without a rated tasting of filter coffee: one roast, and several. */
const SET_ASIDE_NOTES = [1, 2].map((roasts) => {
  const advice = advise({ latest: roast({ taste: ["sweet", "balanced"], quality: 4 }), earlier: [] });
  return adviceReport(1, { basedOn: { version: 1, roastId: 1, tastingId: 1, measuredThermalDose: 10 }, advice, setAside: roasts }, undefined).say;
});
const COLOUR_WARNINGS = [{ colour_change: 534, first_crack: 540 }, { colour_change: 480, first_crack: 520 }].map((markers) => extractFeatures(kaffelogicToRoastLog(parseKlog(syntheticLog({ ...markers, roast_end: 600 })))).dataWarnings[0]);

describe("the engine's voice", () => {
  const said = [
    ...EXAMPLES.map((e) => ({ name: `the doc example for ${e.id}`, text: sayFor(e) })),
    ...EXTRA.map(({ id, input }, i) => ({ name: `extra case ${i + 1} (${id})`, text: advise(input).reason })),
    ...WHY_LINES.map((text, i) => ({ name: `starting-profile reason ${i + 1}`, text })),
    ...COLOUR_WARNINGS.map((text, i) => ({ name: `colour-change warning ${i + 1}`, text })),
    ...SET_ASIDE_NOTES.map((text, i) => ({ name: `set-aside note ${i + 1}`, text })),
  ];

  for (const { name, text } of said) {
    it(`states evidence and rules, not a stance: ${name}`, () => {
      expect(text.length, "there is something to check").toBeGreaterThan(20);
      for (const [pattern, kind] of STANCES) expect(text.match(pattern)?.[0], `${kind} in: ${text.slice(0, 120)}…`).toBeUndefined();
    });
  }

  it("each extra case reaches the rule it is named for and says something the doc examples do not", () => {
    // The engine's own reply for each example, the same kind of text as the extra cases give (sayFor adds the offer or hold line).
    const docTexts = new Set(EXAMPLES.map((e) => advise(e.input).reason));
    const seen = new Set<string>();
    for (const { id, input } of EXTRA) {
      const advice = advise(input);
      expect(advice.ruleId, id).toBe(id);
      expect(docTexts.has(advice.reason), `${id} repeats a doc example`).toBe(false);
      expect(seen.has(advice.reason), `${id} repeats another extra case`).toBe(false);
      seen.add(advice.reason);
    }
  });

  it("the starting-profile reasons cover the paths the choice can take", () => {
    // The source has seven places that add a reason. If one is added, this fails until an intake below reaches it.
    const source = readFileSync(new URL("../src/adapters/kaffelogic/startingProfiles.ts", import.meta.url), "utf8");
    expect((source.match(/why\.push\(/g) ?? []).length, "why.push sites in startingProfiles.ts").toBe(7);
    // Ten distinct lines come from the six intakes.
    expect(WHY_LINES.length, WHY_LINES.join(" | ")).toBe(EXPECTED_WHY_LINES);
    expect(COLOUR_WARNINGS[0]).toMatch(/Colour change is marked at/);
    expect(COLOUR_WARNINGS[1], "the second log reaches the too-close branch").toMatch(/Colour change is only/);
  });

  it("the rulebook's prose, outside its worked examples, states no stance", () => {
    const prose = readFileSync(new URL("../docs/RULES.md", import.meta.url), "utf8")
      .split("\n")
      .map((line) => line.replace(/\r$/, ""))
      .filter((line) => !line.startsWith(">"));
    expect(stancesIn(prose)).toEqual([]);
  });

  it("the check itself catches each kind of stance it is meant to", () => {
    const caught = (s: string) => STANCES.some(([p]) => p.test(s));
    for (const s of ["I wouldn't blame the coffee yet", "It is probably the curve", "so don't write it off", "the best roast is between them", "below the 4 this tool aims for", "rather than guessing", "I'd suggest KL Washed", "The rest may not be over yet", "It might be the curve"]) expect(caught(s), s).toBe(true);
    const docCaught = (s: string) => stancesIn([s]).length > 0;
    expect(stancesIn(["this is a guess to be made rather than", "guessing from one cup"]), "a stance split across two lines").toHaveLength(1);
    for (const s of ["it is probably the curve", "the switch might come early", "the rule may switch too early", "the cup seems thin", "it appears the curve is wrong", "the range it may be set to, but may also change"]) expect(docCaught(s), s).toBe(true);
    for (const s of ["the range it may be set to", "where a defect word first appears (see below)", "Compare the cup against it."]) expect(docCaught(s), s).toBe(false);
    for (const s of ["Shall I record it as the next version?", "Taste it again on day 3 or later", "I'll record the roast as a new version.", "Compare the cup against it."]) expect(caught(s), s).toBe(false);
  });
});

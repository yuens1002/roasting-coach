import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseKlog } from "../src/adapters/kaffelogic/parse.js";
import { selectStartingProfile } from "../src/adapters/kaffelogic/startingProfiles.js";
import { kaffelogicToRoastLog } from "../src/adapters/kaffelogic/toRoastLog.js";
import { extractFeatures } from "../src/core/features.js";
import type { Intake } from "../src/core/intake.js";
import { type AdviceInput, type TastedRoast, advise } from "../src/core/rules.js";
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

// In the rulebook's prose "may" is a permission ("the range it may be set to") and "appears" says where a
// word shows up ("where a defect word first appears"), so only the hedges that claim something about the
// world are checked there. Its worked examples are checked as engine output.
const DOC_STANCES: [RegExp, string][] = [
  ...STANCES.filter(([, kind]) => kind !== "hedged belief"),
  [/\b(?:probably|likely|unlikely|usually|perhaps|maybe|hopefully|seems|might)\b/i, "hedged belief"],
  [/\bmay\b(?! be set to)/i, "hedged belief"],
];

const DEFECT_WORDS = ["sour", "grassy", "bitter", "ashy", "flat", "thin"];
const roast = (over: Partial<TastedRoast>): TastedRoast => ({ thermalDose: 10, taste: ["flat"], quality: (over.taste ?? ["flat"]).some((c) => DEFECT_WORDS.includes(c)) ? 2 : 3, brew: "pourover", ...over });
const ladder = (qualities: number[], over: Partial<TastedRoast> = {}) => qualities.map((q, i) => roast({ thermalDose: 12 * 0.9 ** i, quality: q, level: 3 - i * 0.3, profile: "Robusta", restedDays: 1, tastings: [{ restedDays: 1, brew: "pourover", quality: q }], ...over }));
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
  // Clean cups below the bar: every lever untested, with a reference; a rest and brew that moved the quality; a fair test that did not.
  { id: "clean-below-bar", input: { latest: ladder([3, 3, 3])[2], earlier: ladder([3, 3, 3]).slice(0, 2), context: { ...KL_WASHED, reference: "Lively and fruit-forward." } } },
  { id: "clean-below-bar", input: { latest: ladder([2, 3, 3, 3])[3], earlier: ladder([2, 3, 3, 3]).slice(0, 3) } },
  {
    id: "clean-below-bar",
    input: {
      latest: roast({ taste: ["flat"], quality: 3, thermalDose: 10, profile: "Robusta", level: 3, restedDays: 1, tastings: [{ restedDays: 1, brew: "pourover", quality: 3 }, { restedDays: 6, brew: "pourover", quality: 4 }, { restedDays: 6, brew: "espresso", quality: 2 }] }),
      earlier: ladder([3, 3, 3]).slice(0, 2),
      context: KL_WASHED,
    },
  },
  { id: "quality-vs-words", input: { latest: roast({ taste: ["sour", "bitter"], quality: 5 }), earlier: [] } },
  { id: "keep-as-is", input: { latest: roast({ taste: ["sweet"], quality: 5 }), earlier: [] } },
];

/** Every reason the starting-profile choice gives, across the paths it can take. */
const STARTING_INTAKES: Intake[] = [
  { name: "a", species: "arabica", decaf: false, process: "unknown", goal: "both", drinkWhen: "soon" },
  { name: "b", species: "arabica", decaf: false, process: "washed", goal: "filter", drinkWhen: "rest", altitudeM: 1850 },
  { name: "c", species: "arabica", decaf: false, process: "natural", goal: "cupping", drinkWhen: "soon" },
  { name: "d", species: "arabica", decaf: false, process: "honey", goal: "cupping", drinkWhen: "soon" },
  { name: "e", species: "arabica", decaf: true, process: "unknown", goal: "filter", drinkWhen: "soon" },
  { name: "f", species: "robusta", decaf: false, process: "unknown", goal: "espresso", drinkWhen: "soon", chaffy: true },
  { name: "h", species: "arabica", decaf: false, process: "natural", goal: "filter", drinkWhen: "soon" },
  { name: "g", species: "arabica", decaf: false, process: "unknown", goal: "espresso", drinkWhen: "rest", altitudeM: 900 },
] as Intake[];
const EXPECTED_WHY_LINES = 11;
const WHY_LINES = [...new Set(STARTING_INTAKES.flatMap((intake) => selectStartingProfile(intake).why))];

/** The data warnings the roast features give for a colour change that cannot be used: out of range, and too close to first crack. */
const COLOUR_WARNINGS = [{ colour_change: 534, first_crack: 540 }, { colour_change: 480, first_crack: 520 }].map((markers) => extractFeatures(kaffelogicToRoastLog(parseKlog(syntheticLog({ ...markers, roast_end: 600 })))).dataWarnings[0]);

describe("the engine's voice", () => {
  const said = [
    ...EXAMPLES.map((e) => ({ name: `the doc example for ${e.id}`, text: sayFor(e) })),
    ...EXTRA.map(({ id, input }, i) => ({ name: `extra case ${i + 1} (${id})`, text: advise(input).reason })),
    ...WHY_LINES.map((text, i) => ({ name: `starting-profile reason ${i + 1}`, text })),
    ...COLOUR_WARNINGS.map((text, i) => ({ name: `colour-change warning ${i + 1}`, text })),
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
    // The source has nine places that add a reason. If one is added, this fails until an intake below reaches it.
    const source = readFileSync(new URL("../src/adapters/kaffelogic/startingProfiles.ts", import.meta.url), "utf8");
    expect((source.match(/why\.push\(/g) ?? []).length, "why.push sites in startingProfiles.ts").toBe(9);
    // Eleven distinct lines come from the eight intakes (the line for a stock profile with no level for the goal cannot occur with the stock table).
    expect(WHY_LINES.length, WHY_LINES.join(" | ")).toBe(EXPECTED_WHY_LINES);
    expect(COLOUR_WARNINGS[0]).toMatch(/Colour change is marked at/);
    expect(COLOUR_WARNINGS[1], "the second log reaches the too-close branch").toMatch(/Colour change is only/);
  });

  it("the rulebook's prose, outside its worked examples, states no stance", () => {
    const prose = readFileSync(new URL("../docs/RULES.md", import.meta.url), "utf8")
      .split("\n")
      .map((line, i) => ({ line: line.replace(/\r$/, ""), n: i + 1 }))
      .filter(({ line }) => !line.startsWith(">"));
    for (const { line, n } of prose) for (const [pattern, kind] of DOC_STANCES) expect(line.match(pattern)?.[0], `${kind} at RULES.md:${n}: ${line.slice(0, 100)}`).toBeUndefined();
  });

  it("the check itself catches each kind of stance it is meant to", () => {
    const caught = (s: string) => STANCES.some(([p]) => p.test(s));
    for (const s of ["I wouldn't blame the coffee yet", "It is probably the curve", "so don't write it off", "the best roast is between them", "below the 4 this tool aims for", "rather than guessing", "I'd suggest KL Washed", "The rest may not be over yet", "It might be the curve"]) expect(caught(s), s).toBe(true);
    const docCaught = (s: string) => DOC_STANCES.some(([p]) => p.test(s));
    for (const s of ["it is probably the curve", "the switch might come early", "the rule may switch too early", "the cup seems thin"]) expect(docCaught(s), s).toBe(true);
    for (const s of ["the range it may be set to", "where a defect word first appears", "Compare the cup against it."]) expect(docCaught(s), s).toBe(false);
    for (const s of ["Shall I record it as the next version?", "Taste it again on day 3 or later", "I'll record the roast as a new version.", "Compare the cup against it."]) expect(caught(s), s).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { type AdviceInput, type TastedRoast, advise } from "../src/core/rules.js";
import { EXAMPLES, sayFor } from "./rulesDocExamples.js";

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

const DEFECT_WORDS = ["sour", "grassy", "bitter", "ashy", "flat", "thin"];
const roast = (over: Partial<TastedRoast>): TastedRoast => ({ thermalDose: 10, taste: ["flat"], quality: (over.taste ?? ["flat"]).some((c) => DEFECT_WORDS.includes(c)) ? 2 : 3, brew: "pourover", ...over });
const ladder = (qualities: number[], over: Partial<TastedRoast> = {}) => qualities.map((q, i) => roast({ thermalDose: 12 * 0.9 ** i, quality: q, level: 3 - i * 0.3, profile: "Robusta", restedDays: 1, tastings: [{ restedDays: 1, brew: "pourover", quality: q }], ...over }));
const KL_WASHED = { alternative: { profileName: "KL Washed", level: 1.2, endTempC: 217.6 } };

/**
 * Inputs beyond the doc examples. Each one is chosen for a branch of the wording the examples do not reach,
 * and RULE_IDS below checks that it reaches it, so a case that quietly lands on an earlier rule fails.
 */
const EXTRA: { id: string; input: AdviceInput }[] = [
  { id: "espresso-sour-only", input: { latest: roast({ taste: ["sour"], brew: "espresso" }), earlier: [] } },
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

describe("the engine's voice", () => {
  const said = [
    ...EXAMPLES.map((e) => ({ name: `the doc example for ${e.id}`, text: sayFor(e) })),
    ...EXTRA.map(({ id, input }, i) => ({ name: `extra case ${i + 1} (${id})`, text: advise(input).reason })),
  ];

  for (const { name, text } of said) {
    it(`states evidence and rules, not a stance: ${name}`, () => {
      expect(text.length, "there is something to check").toBeGreaterThan(20);
      for (const [pattern, kind] of STANCES) expect(text.match(pattern)?.[0], `${kind} in: ${text.slice(0, 120)}…`).toBeUndefined();
    });
  }

  it("each extra case reaches the rule it is named for and says something the doc examples do not", () => {
    const docTexts = new Set(EXAMPLES.map(sayFor));
    const seen = new Set<string>();
    for (const { id, input } of EXTRA) {
      const advice = advise(input);
      expect(advice.ruleId, id).toBe(id);
      expect(docTexts.has(advice.reason), `${id} repeats a doc example`).toBe(false);
      expect(seen.has(advice.reason), `${id} repeats another extra case`).toBe(false);
      seen.add(advice.reason);
    }
  });

  it("the check itself catches each kind of stance it is meant to", () => {
    const caught = (s: string) => STANCES.some(([p]) => p.test(s));
    for (const s of ["I wouldn't blame the coffee yet", "It is probably the curve", "so don't write it off", "the best roast is between them", "below the 4 this tool aims for", "rather than guessing", "I'd suggest KL Washed", "The rest may not be over yet", "It might be the curve"]) expect(caught(s), s).toBe(true);
    for (const s of ["Shall I record it as the next version?", "Taste it again on day 3 or later", "I'll record the roast as a new version.", "Compare the cup against it."]) expect(caught(s), s).toBe(false);
  });
});

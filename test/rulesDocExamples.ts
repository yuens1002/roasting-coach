// The worked examples quoted in docs/RULES.md. The engine's own words are checked against the doc
// (test/rulesDoc.test.ts), so an example there can't drift from what the engine really says.
import { type AdviceContext, type AdviceInput, type OutcomeId, TASTE_CHIPS, type TastedRoast, adviceReport, advise } from "../src/core/rules.js";

const DEFECTS: readonly string[] = [...TASTE_CHIPS.under, ...TASTE_CHIPS.over];
/** The roast quality agrees with the words unless an example says otherwise: 2 with a roast defect, 3 without. */
const roast = (over: Partial<TastedRoast>): TastedRoast => ({ thermalDose: 10, taste: ["balanced"], quality: (over.taste ?? ["balanced"]).some((c) => DEFECTS.includes(c)) ? 2 : 3, brew: "pourover", ...over });
const REST: AdviceContext["restNeeded"] = () => [3, 5];
const KL_WASHED: AdviceContext = { alternative: { profileName: "KL Washed", level: 1.2, endTempC: 217.6 } };

/** Four pour-over cups tasted the day after roasting, each roast about 10% less than the one before: ashy at first (quality 2), then flat and clean (3, 3, 3). */
const LADDER: TastedRoast[] = [2, 3, 3, 3].map((quality, i) =>
  roast({ thermalDose: 12 * 0.9 ** i, taste: i === 0 ? ["ashy", "flat"] : ["flat"], quality, level: [3, 2.7, 2.4, 2.1][i], profile: "Robusta", restedDays: 1 }),
);

export interface Example {
  /** The outcome this example shows (one of OUTCOME_IDS). */
  id: OutcomeId;
  /** What was tasted, in roaster's words, as the doc introduces it. */
  scenario: string;
  input: AdviceInput;
}

export const EXAMPLES: Example[] = [
  {
    id: "tasted-in-other-brew",
    scenario: "sour, brewed as espresso",
    input: { latest: roast({ taste: ["sour"], brew: "espresso" }), earlier: [] },
  },
  { id: "quality-vs-words", scenario: "ashy, rated roast quality 4", input: { latest: roast({ taste: ["ashy"], quality: 4 }), earlier: [] } },
  { id: "mixed-signals", scenario: "tasted sour and bitter", input: { latest: roast({ taste: ["sour", "bitter"] }), earlier: [] } },
  {
    id: "tasted-too-soon",
    scenario: "sour, on 1500-2000m Rest, tasted 1 day after roasting",
    input: { latest: roast({ taste: ["sour"], profile: "1500-2000m Rest", restedDays: 1, restNeeded: REST("") }), earlier: [] },
  },
  { id: "under-roasted", scenario: "sour and grassy, no earlier roasts", input: { latest: roast({ taste: ["sour", "grassy"] }), earlier: [] } },
  {
    id: "under-roasted-bracketed",
    scenario: "grassy; an earlier roast with 20% more roasting tasted bitter",
    input: { latest: roast({ taste: ["grassy"] }), earlier: [roast({ thermalDose: 12, taste: ["bitter"] })] },
  },
  {
    id: "under-roasted-contradicted",
    scenario: "grassy; an earlier roast with 20% less roasting tasted bitter",
    input: { latest: roast({ taste: ["grassy"] }), earlier: [roast({ thermalDose: 8, taste: ["bitter"] })] },
  },
  { id: "over-roasted", scenario: "ashy, no earlier roasts", input: { latest: roast({ taste: ["ashy"] }), earlier: [] } },
  {
    id: "over-roasted-bracketed",
    scenario: "bitter; an earlier roast with 20% less roasting tasted sour",
    input: { latest: roast({ taste: ["bitter"] }), earlier: [roast({ thermalDose: 8, taste: ["sour"] })] },
  },
  {
    id: "over-roasted-contradicted",
    scenario: "bitter; an earlier roast with 20% more roasting tasted sour",
    input: { latest: roast({ taste: ["bitter"] }), earlier: [roast({ thermalDose: 12, taste: ["sour"] })] },
  },
  {
    id: "level-not-helping",
    scenario: "sour on 1500-2000m Rest after a roast with 10% less roasting also tasted sour; KL Washed is the alternative",
    input: {
      latest: roast({ thermalDose: 11, taste: ["sour"], profile: "1500-2000m Rest" }),
      earlier: [roast({ thermalDose: 10, taste: ["sour"], profile: "1500-2000m Rest" })],
      context: KL_WASHED,
    },
  },
  {
    id: "clean-below-bar",
    scenario: "flat, clean, roast quality 3, the day after roasting, pour over, after three steps of about 10% less roasting (the first roast was ashy, quality 2; then 3, 3, 3); a reference of lively, fruit-forward; no other profile to suggest",
    input: { latest: LADDER[3], earlier: LADDER.slice(0, 3), context: { reference: "Lively and fruit-forward." } },
  },
  { id: "keep-as-is", scenario: "sweet and balanced, roast quality 4", input: { latest: roast({ taste: ["sweet", "balanced"], quality: 4 }), earlier: [] } },
  { id: "no-rule", scenario: "thin, roast quality 4", input: { latest: roast({ taste: ["thin"], quality: 4 }), earlier: [] } },
];

/** The words the engine says for an example; for a level change or profile switch, the full reply with a made-up level move. */
export function sayFor(example: Example): string {
  const advice = advise(example.input);
  const basedOn = { version: 1, roastId: 1, tastingId: 1, level: 3, measuredThermalDose: example.input.latest.thermalDose };
  if (advice.kind === "change") {
    const down = advice.thermalDoseChangePct < 0;
    return adviceReport(1, { basedOn, advice }, { from: { level: 3, endTempC: 223.4 }, to: { level: down ? 2.7 : 3.3, endTempC: down ? 222.2 : 224.6 } }).say;
  }
  return adviceReport(1, { basedOn, advice }, undefined).say;
}

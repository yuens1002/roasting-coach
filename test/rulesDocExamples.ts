// The worked examples quoted in docs/RULES.md. The engine's own words are checked against the doc
// (test/rulesDoc.test.ts), so an example there can't drift from what the engine really says.
import { type AdviceContext, type AdviceInput, type OutcomeId, type TastedRoast, adviceReport, advise } from "../src/core/rules.js";

const roast = (over: Partial<TastedRoast>): TastedRoast => ({ thermalDose: 10, taste: ["balanced"], wantNext: [], score: 3, brew: "pourover", ...over });
const REST: AdviceContext["restNeeded"] = () => [3, 5];
const KL_WASHED: AdviceContext = { alternative: { profileName: "KL Washed", level: 1.2, endTempC: 217.6 } };

export interface Example {
  /** The outcome this example shows (one of OUTCOME_IDS). */
  id: OutcomeId;
  /** What was tasted, in roaster's words, as the doc introduces it. */
  scenario: string;
  input: AdviceInput;
}

export const EXAMPLES: Example[] = [
  { id: "mixed-signals", scenario: "tasted sour and bitter", input: { latest: roast({ taste: ["sour", "bitter"] }), earlier: [] } },
  {
    id: "tasted-too-soon",
    scenario: "sour, on 1500-2000m Rest, tasted 1 day after roasting",
    input: { latest: roast({ taste: ["sour"], profile: "1500-2000m Rest", restedDays: 1, restNeeded: REST("") }), earlier: [] },
  },
  { id: "wish-against-taste", scenario: "sour, pour over, asking for a lighter roast next time", input: { latest: roast({ taste: ["sour"], wantNext: ["lighter"] }), earlier: [] } },
  { id: "espresso-sour-only", scenario: "only sour, brewed as espresso", input: { latest: roast({ taste: ["sour"], brew: "espresso" }), earlier: [] } },
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
  { id: "asked-for-change", scenario: "balanced, scoring 3, asking for a darker roast next time", input: { latest: roast({ taste: ["balanced"], wantNext: ["darker"] }), earlier: [] } },
  { id: "keep-as-is", scenario: "sweet and balanced, scoring 4", input: { latest: roast({ taste: ["sweet", "balanced"], score: 4 }), earlier: [] } },
  { id: "no-rule", scenario: "flat and thin, scoring 2", input: { latest: roast({ taste: ["flat", "thin"], score: 2 }), earlier: [] } },
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

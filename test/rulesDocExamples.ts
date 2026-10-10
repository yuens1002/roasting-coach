// The worked examples quoted in docs/RULES.md. The engine's own words are checked against the doc
// (test/rulesDoc.test.ts), so an example there can't drift from what the engine really says.
import { type AdviceContext, type AdviceInput, type HistoryForAdvice, type OutcomeId, TASTE_CHIPS, type TastedRoast, adviceReport, advise } from "../src/core/rules.js";

const DEFECTS: readonly string[] = [...TASTE_CHIPS.under, ...TASTE_CHIPS.over];
/** The roast quality agrees with the words unless an example says otherwise: 2 with a roast defect, 3 without. */
const roast = (over: Partial<TastedRoast>): TastedRoast => ({ thermalDose: 10, taste: ["balanced"], quality: (over.taste ?? ["balanced"]).some((c) => DEFECTS.includes(c)) ? 2 : 3, brew: "pourover", ...over });
const REST: AdviceContext["restNeeded"] = () => [3, 5];
/** What the adapter gives a bean that started on KL Washed: the altitude profile as the alternative, at the level it starts that profile at. */
const ALTITUDE_REST: AdviceContext = { alternative: { profileName: "1500-2000m Rest", level: 3.2, endTempC: 222.4 } };

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
    scenario: "grassy, tasted as pour over, when espresso is the coffee's tasting brew",
    input: { latest: roast({ taste: ["grassy"], brew: "pourover" }), earlier: [], context: { tastingBrew: "espresso" } },
  },
  { id: "quality-vs-words", scenario: "ashy, rated roast quality 4", input: { latest: roast({ taste: ["ashy"], quality: 4 }), earlier: [] } },
  { id: "mixed-signals", scenario: "tasted grassy and bitter", input: { latest: roast({ taste: ["grassy", "bitter"] }), earlier: [] } },
  {
    id: "tasted-too-soon",
    scenario: "grassy, on 1500-2000m Rest, tasted 1 day after roasting",
    input: { latest: roast({ taste: ["grassy"], profile: "1500-2000m Rest", restedDays: 1, restNeeded: REST("") }), earlier: [] },
  },
  { id: "under-roasted", scenario: "grassy and bready, no earlier roasts", input: { latest: roast({ taste: ["grassy", "bready"] }), earlier: [] } },
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
    scenario: "bitter; an earlier roast with 20% less roasting tasted grassy",
    input: { latest: roast({ taste: ["bitter"] }), earlier: [roast({ thermalDose: 8, taste: ["grassy"] })] },
  },
  {
    id: "over-roasted-contradicted",
    scenario: "bitter; an earlier roast with 20% more roasting tasted grassy",
    input: { latest: roast({ taste: ["bitter"] }), earlier: [roast({ thermalDose: 12, taste: ["grassy"] })] },
  },
  {
    id: "level-not-helping",
    scenario: "grassy on KL Washed after a roast with 10% less roasting also tasted grassy; 1500-2000m Rest is the alternative",
    input: {
      latest: roast({ thermalDose: 11, taste: ["grassy"], profile: "KL Washed" }),
      earlier: [roast({ thermalDose: 10, taste: ["grassy"], profile: "KL Washed" })],
      context: ALTITUDE_REST,
    },
  },
  {
    id: "level-changes-used",
    scenario: "grassy on KL Washed after three level changes; 1500-2000m Rest is the alternative",
    input: { latest: roast({ taste: ["grassy"], profile: "KL Washed" }), earlier: [], context: ALTITUDE_REST, levelChangesMade: 3 },
  },
  { id: "keep-as-is", scenario: "flat and thin, clean, roast quality 3", input: { latest: roast({ taste: ["flat", "thin"], quality: 3 }), earlier: [] } },
];

/** The words the engine says for an example; for a level change or profile switch, the full reply with a made-up level move. */
export function sayFor(example: Example): string {
  const advice = advise(example.input);
  const basedOn = { version: 1, roastId: 1, tastingId: 1, level: 3, measuredThermalDose: example.input.latest.thermalDose, levelChange: 1 };
  if (advice.kind === "change") {
    const down = advice.thermalDoseChangePct < 0;
    return adviceReport(1, { basedOn, advice }, { from: { level: 3, endTempC: 223.4 }, to: { level: down ? 2.7 : 3.3, endTempC: down ? 222.2 : 224.6 } }).say;
  }
  return adviceReport(1, { basedOn, advice }, undefined).say;
}

/** The bean's table quoted in docs/RULES.md: a ladder of three roasts, uncooked then scorched then clean. */
const tableRoast = (id: number, level: number, thermalDose: number, taste: string[], quality: number) => ({
  id,
  roastedAt: `2026-10-0${id}`,
  logLevel: level,
  features: { thermalDose },
  tastings: [{ id, tastedOn: `2026-10-1${id}`, quality, taste, brew: "pourover" }],
});
export const TABLE_EXAMPLE: HistoryForAdvice = {
  versions: [
    { number: 1, profileName: "Robusta", roasts: [tableRoast(1, 3.0, 10, ["grassy", "bready"], 2)] },
    { number: 2, parentNumber: 1, profileName: "Robusta", roasts: [tableRoast(2, 3.8, 11, ["bitter"], 2)] },
    { number: 3, parentNumber: 2, profileName: "Robusta", roasts: [tableRoast(3, 3.4, 10.5, ["sweet", "balanced"], 4)] },
  ],
};

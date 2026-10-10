// What a thermal-dose step means on each stock profile, in the terms a roaster sets on the machine: how many
// levels it moves. It is the same arithmetic as the advice (levelAfterChange), shown for every selectable stock
// profile across the levels the tool can start a bean at, so the step sizes in docs/RULES.md can be judged without
// reading any code. It names no single starting level: the roaster's colour target changes, and the level they are
// at comes from their cups, so a table at one level would show a step they are not taking.
import { SCA_TILES } from "../../core/roastColour.js";
import { RULE_SETTINGS } from "../../core/rules.js";
import { type KaffelogicProfile, parseKpro } from "./parse.js";
import { STOCK_PROFILES, type StockProfile, levelForAgtron } from "./startingProfiles.js";
import { nearestThermalDose, thermalDoseLadder } from "./thermalDose.js";
import { findBaseProfile, formatKpro } from "./writeProfile.js";

/** The steps shown, as % of the roast's thermal dose: the rules' two step sizes, each way. */
export const STEP_TABLE_STEPS = [-RULE_SETTINGS.strongStepPct, -RULE_SETTINGS.stepPct, RULE_SETTINGS.stepPct, RULE_SETTINGS.strongStepPct];

const range = (values: number[]) => (values.length ? `${Math.min(...values).toFixed(1)} to ${Math.max(...values).toFixed(1)}` : "-");

/** The lightest and darkest level a bean can start at on a profile: where the eight tiles of the Agtron scale land on it. */
function startingLevelSpan(stock: StockProfile): [number, number] | undefined {
  const levels = SCA_TILES.flatMap((tile) => {
    const placed = levelForAgtron(stock, tile.agtron);
    return placed ? [placed.level] : [];
  });
  return levels.length ? [Math.min(...levels), Math.max(...levels)] : undefined;
}

/** Every stock profile found in a library of .kpro files, parsed, by name. */
export function stockProfilesFrom(library: Parameters<typeof findBaseProfile>[0]): Record<string, KaffelogicProfile> {
  return Object.fromEntries(
    Object.keys(STOCK_PROFILES).flatMap((name) => {
      const base = findBaseProfile(library, { name });
      return base ? [[name, parseKpro(formatKpro(base.lines))]] : [];
    }),
  );
}

/**
 * A markdown table, one row per selectable stock profile: the levels a bean can start at on it, and how many levels a
 * step in either direction moves from any of them (the fewest to the most). `profiles` holds each stock profile's parsed
 * file by name; profiles missing from it are left out.
 */
export function stepTable(profiles: Record<string, KaffelogicProfile>): string {
  const rows = ["| Profile | Starting levels | " + STEP_TABLE_STEPS.map((s) => `${s > 0 ? "+" : "−"}${Math.abs(s)}%`).join(" | ") + " |", "|---|---|" + STEP_TABLE_STEPS.map(() => "---").join("|") + "|"];
  for (const stock of Object.values(STOCK_PROFILES)) {
    const profile = profiles[stock.name];
    const span = startingLevelSpan(stock);
    if (!profile || stock.selectable === false || !span) continue;
    const moved = STEP_TABLE_STEPS.map(() => [] as number[]);
    // The same search as the advice's (levelAfterChange), over a ladder worked out once. A step that would need more or less
    // thermal dose than the profile gives at its lightest or darkest level goes nowhere, so it is not counted.
    const ladder = thermalDoseLadder(profile);
    const lightest = ladder[0]?.thermalDose;
    const darkest = ladder[ladder.length - 1]?.thermalDose;
    for (const from of ladder) {
      if (from.level < span[0] - 1e-9 || from.level > span[1] + 1e-9) continue;
      STEP_TABLE_STEPS.forEach((step, i) => {
        const target = from.thermalDose * (1 + step / 100);
        const next = target >= lightest && target <= darkest ? nearestThermalDose(ladder, target) : undefined;
        if (next) moved[i].push(Math.round(Math.abs(next.level - from.level) * 10) / 10);
      });
    }
    rows.push(`| ${stock.name} | ${range(span)} | ${moved.map(range).join(" | ")} |`);
  }
  return rows.join("\n");
}

// What a thermal-dose step means on each stock profile, in the terms a roaster sets on the machine:
// the level, the end temperature and when the curve gets there. It is the same arithmetic as the
// advice (levelAfterChange), shown for every selectable stock profile at the level the tool starts it at,
// so the step sizes in docs/RULES.md can be judged without reading any code.
import { RULE_SETTINGS } from "../../core/rules.js";
import { type KaffelogicProfile, parseKpro } from "./parse.js";
import { STOCK_PROFILES, startingLevel } from "./startingProfiles.js";
import { type LevelThermalDose, formatMinutesSeconds, levelAfterChange, profileThermalDoseAtLevel } from "./thermalDose.js";
import { findBaseProfile, formatKpro } from "./writeProfile.js";

/** The steps shown, as % of the roast's thermal dose: the rules' two step sizes, each way. */
export const STEP_TABLE_STEPS = [-RULE_SETTINGS.strongStepPct, -RULE_SETTINGS.stepPct, RULE_SETTINGS.stepPct, RULE_SETTINGS.strongStepPct];

const cell = (d: LevelThermalDose | undefined) => (d ? `${d.level.toFixed(1)} · ${(Math.round(d.endTemp * 10) / 10).toFixed(1)} °C · ${formatMinutesSeconds(d.endsAt)}` : "-");

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
 * A markdown table, one row per selectable stock profile. `profiles` holds each stock
 * profile's parsed file by name; profiles missing from it are left out.
 */
export function stepTable(profiles: Record<string, KaffelogicProfile>): string {
  const rows = ["| Profile | Starts at (level · end · time) | " + STEP_TABLE_STEPS.map((s) => `${s > 0 ? "+" : "−"}${Math.abs(s)}%`).join(" | ") + " |", "|---|---|" + STEP_TABLE_STEPS.map(() => "---").join("|") + "|"];
  for (const stock of Object.values(STOCK_PROFILES)) {
    const profile = profiles[stock.name];
    if (!profile || stock.selectable === false) continue;
    const from = profileThermalDoseAtLevel(profile, startingLevel(stock).level);
    if (!from) continue;
    rows.push(`| ${stock.name} | ${cell(from)} | ${STEP_TABLE_STEPS.map((s) => cell(levelAfterChange(profile, from, s))).join(" | ")} |`);
  }
  return rows.join("\n");
}

// What the rules need to know about Kaffelogic's stock profiles: which ones must rest before they are
// judged, and which other profile to try when the level isn't helping. The rules themselves stay
// machine-independent (src/core/rules.ts); this is where the machine's facts come in.
import type { Intake } from "../../core/intake.js";
import type { AdviceContext } from "../../core/rules.js";
import { STOCK_PROFILES, selectStartingProfile, startingLevel } from "./startingProfiles.js";

export function kaffelogicAdviceContext(intake: Intake): AdviceContext {
  const start = selectStartingProfile(intake);
  const alternative = start.alternative ? STOCK_PROFILES[start.alternative] : undefined;
  const level = alternative && startingLevel(alternative, start.goal);
  return {
    restNeeded: (profile) => STOCK_PROFILES[profile]?.restDays,
    alternative: alternative && level ? { profileName: alternative.name, level: level.level, endTempC: level.endTemp } : undefined,
  };
}

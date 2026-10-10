// What the rules need to know about Kaffelogic's stock profiles: which ones must rest before they are
// judged, which other profile to try when the level isn't helping (at the level for the Agtron being shot for), and the brew every tasting is of. The rules themselves stay
// machine-independent (src/core/rules.ts); this is where the machine's facts come in.
import type { Intake } from "../../core/intake.js";
import type { AdviceContext } from "../../core/rules.js";
import { type ColourReading, levelForAgtron, selectStartingProfile, stockProfile } from "./startingProfiles.js";

export function kaffelogicAdviceContext(intake: Intake, readings: readonly ColourReading[] = []): AdviceContext {
  const start = selectStartingProfile(intake, readings);
  const alternative = start.alternative ? stockProfile(start.alternative) : undefined;
  // The alternative starts at the level for the same Agtron target, when the profile can place it.
  const level = alternative && levelForAgtron(alternative, intake.agtronTarget, readings);
  return {
    restNeeded: (profile) => stockProfile(profile)?.restDays,
    alternative: alternative && level ? { profileName: alternative.name, level: level.level, endTempC: level.endTemp } : undefined,
    reference: intake.sellerNotes,
    tastingBrew: intake.tastingBrew,
  };
}

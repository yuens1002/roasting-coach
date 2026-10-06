// Thermal dose of a Kaffelogic profile at a level, before roasting: the profile's own curve,
// ended where that level ends. Level numbers are an uneven ruler (on Robusta, 2.6 -> 3.0 adds
// about 15% dose, 3.0 -> 3.4 about 3%), so a change is decided in dose and turned into a level
// for the profile at hand. Real roasts have measured 6-12.5% above the curve's figure (Robusta
// level 3: +6.4%; 1500-2000m RTD levels 1.9 and 3.3: +11% and +12.5%; see docs/research.md), all
// above, so this ranks levels and sizes a step well, but expect the roast to land a little further.
import { thermalDose } from "../../core/features.js";
import { type KaffelogicProfile, evalCurve, levelToTemp, timeCurveReaches } from "./parse.js";

export interface LevelDose {
  level: number;
  /** End temperature for the level, °C. */
  endTemp: number;
  /** When the curve reaches it, seconds. */
  endsAt: number;
  /** Equivalent minutes at 200 °C (THERMAL_DOSE). */
  dose: number;
}

/** The dose of the profile's curve ended at this level's temperature; undefined if the curve never gets there. */
export function profileDoseAtLevel(profile: KaffelogicProfile, level: number): LevelDose | undefined {
  const endTemp = levelToTemp(profile.roastLevels, level);
  if (endTemp === undefined || profile.roastCurve.length < 2) return undefined;
  const endsAt = timeCurveReaches(profile.roastCurve, endTemp);
  if (endsAt === undefined) return undefined;
  // Curves can start a little after 0 s (KL Washed starts at 2.5 s).
  const points: { t: number; temp: number }[] = [];
  for (let t = profile.roastCurve[0].point.t; t < endsAt; t++) points.push({ t, temp: evalCurve(profile.roastCurve, t)! });
  points.push({ t: endsAt, temp: evalCurve(profile.roastCurve, endsAt)! });
  return { level, endTemp, endsAt, dose: thermalDose(points) };
}

/**
 * The level, in the machine's 0.1 steps, whose curve gives the dose closest to `target`.
 * End temperature rises with level, so dose does too, and a search over 0..6 finds it.
 */
export function levelForDose(profile: KaffelogicProfile, target: number): LevelDose | undefined {
  let best: LevelDose | undefined;
  for (let tenths = 0; tenths <= 60; tenths++) {
    const d = profileDoseAtLevel(profile, tenths / 10);
    if (d && (!best || Math.abs(d.dose - target) < Math.abs(best.dose - target))) best = d;
  }
  return best;
}

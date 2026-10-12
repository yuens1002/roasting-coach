// How a Kaffelogic roast ran against its own profile, read from the log: the log carries the profile it was roasted on and the
// temperature the profile asked for at each second, next to the temperature the bean had.
import type { KaffelogicLog } from "./parse.js";
import { profileThermalDoseAtLevel } from "./thermalDose.js";

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * How far above its profile the bean ran, on average, from first crack to the end of the roast, in °C (negative: below it). It uses
 * the bean temperature the machine controls on, as the roast's features do. Undefined without a first-crack and an end marker, or
 * without a profile column to compare with.
 */
export function developmentOvershoot(log: Pick<KaffelogicLog, "data" | "markers">): number | undefined {
  const { time, profile } = log.data;
  const bean = log.data.temp ?? log.data.mean_temp ?? log.data.spot_temp;
  const start = log.markers.first_crack;
  const end = log.markers.roast_end;
  if (!time || !bean || !profile || start === undefined || end === undefined) return undefined;
  const differences: number[] = [];
  for (let i = 0; i < time.length; i++) {
    if (time[i] >= start && time[i] <= end && Number.isFinite(bean[i]) && Number.isFinite(profile[i])) differences.push(bean[i] - profile[i]);
  }
  return differences.length ? mean(differences) : undefined;
}

/**
 * What a log says about how its roast ran: the profile it was roasted on (its short name), the thermal dose that profile's curve
 * predicts at the level the roast was made at (the curve ended where the level ends), and the overshoot in development.
 */
export function roastRunOf(log: KaffelogicLog): { profile?: string; predictedThermalDose?: number; overshootC?: number } {
  const atLevel = log.level === undefined ? undefined : profileThermalDoseAtLevel(log.profile, log.level);
  return { profile: log.profile.shortName || undefined, predictedThermalDose: atLevel?.thermalDose, overshootC: developmentOvershoot(log) };
}

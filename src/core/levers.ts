// What the rules read from a bean's earlier roasts on one profile: whether two roasts used the same profile, and the run of
// level steps taken on it. (A ledger of levers, for a clean cup below a bar, was removed: a clean cup is done for what
// this tool can do, because it cannot choose another profile or edit a curve.)
//
// This file imports only types from rules.ts, so there is no import cycle at run time (rules.ts imports this file).
import type { Calibration, TastedRoast } from "./rules.js";

/** Two roasts used the same profile: the same curve and settings when both are known, else the same profile name. */
export const sameProfile = (a: TastedRoast, b: TastedRoast) => (a.profileKey && b.profileKey ? a.profileKey === b.profileKey : a.profile === b.profile);

/**
 * Percentages are compared with this much slack, so a move of exactly the threshold counts the same
 * whichever way it went (10 to 10.7 and 10 to 9.3 differ from 7% by float error in opposite directions).
 */
export const PCT_EPSILON = 1e-9;

/** The run of steps, ending at the latest roast, that the level has taken on this roast's profile. */
export interface LevelLadder {
  /** The roasts in the run, oldest first; the last is the latest. */
  run: TastedRoast[];
  steps: number;
  direction: "less" | "more";
}

/**
 * Walking back from the latest roast on its profile: an earlier roast is a new rung only if its roasting
 * really differed from the rung already reached (by at least `noResponsePct`, so batch noise isn't a step)
 * and in the same direction as the steps already counted. A repeat of a rung (the same level roasted again,
 * the latest roast included) is within that band and counts once, by its later roast: it is walked past, not a
 * place to stop. A step the other way ends the run.
 */
export function levelLadder(latest: TastedRoast, earlier: TastedRoast[], { settings }: Calibration): LevelLadder {
  const onProfile = earlier.filter((e) => sameProfile(e, latest));
  const run = [latest];
  let direction: LevelLadder["direction"] | undefined;
  for (let i = onProfile.length - 1; i >= 0; i--) {
    const change = (run[0].thermalDose / onProfile[i].thermalDose - 1) * 100;
    if (Math.abs(change) < settings.noResponsePct - PCT_EPSILON) continue;
    const way = change < 0 ? "less" : "more";
    if (direction && way !== direction) break;
    direction = way;
    run.unshift(onProfile[i]);
  }
  return { run, steps: run.length - 1, direction: direction ?? "less" };
}

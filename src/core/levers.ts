// The levers that change the roast, and where each one stands for a bean: still moving the roast quality,
// tried without effect, not tried yet, or out of this tool's reach. Every state is read from recorded
// roasts and tastings, never guessed. The ledger is what stops "no rule covers this" from being the
// whole answer: for a clean cup below the bar it says what can raise the quality, what each lever
// changes, and what the evidence says about it. Rest and brew are not levers: they change the cup, not
// the roast. Every tasting of a coffee is of its roaster's chosen brew so roasts can be compared (rules.ts, tasted-in-other-brew).
//
// This file imports only types from rules.ts, so there is no import cycle at run time (rules.ts
// imports this file).
import { qualityMeaning } from "./intake.js";
import type { AdviceContext, Calibration, TastedRoast } from "./rules.js";

export const LEVERS = ["level", "profile", "curve"] as const;
export type LeverName = (typeof LEVERS)[number];

/** moving: changing it improved the roast quality. exhausted: tried enough with no gain. unclear: tried, too thin to say. untested: not tried. unavailable: out of this tool's reach. */
export type LeverState = "moving" | "exhausted" | "unclear" | "untested" | "unavailable";

/**
 * What changing each lever does, in one sentence each. docs/RULES.md quotes these word for word (a
 * test checks it).
 */
export const LEVER_EFFECTS: Record<LeverName, string> = {
  level: "Moves the end temperature, so the whole roast goes further or less far, by a measured amount of thermal dose; the shape of the curve stays as it is.",
  profile: "Changes the curve's shape (how fast heat goes in and how long the beans develop), not only where the roast stops.",
  curve: "The same as a profile change, made by editing the curve yourself.",
};

export interface Lever {
  lever: LeverName;
  state: LeverState;
  /** What the recorded roasts and tastings say about this lever. */
  evidence: string;
  /** What to do with it next, when there is something to do. */
  next?: string;
  /** Something that weakens the evidence, said after the verdict. */
  caveat?: string;
}

/** Two roasts used the same profile: the same curve and settings when both are known, else the same profile name. */
export const sameProfile = (a: TastedRoast, b: TastedRoast) => (a.profileKey && b.profileKey ? a.profileKey === b.profileKey : a.profile === b.profile);

/**
 * Percentages are compared with this much slack, so a move of exactly the threshold counts the same
 * whichever way it went (10 to 10.7 and 10 to 9.3 differ from 7% by float error in opposite directions).
 */
export const PCT_EPSILON = 1e-9;

const round1 = (n: number) => Math.round(n * 10) / 10;
const list = (items: (string | number)[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
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

function levelLever(latest: TastedRoast, earlier: TastedRoast[], calibration: Calibration): Lever {
  const { run, steps, direction } = levelLadder(latest, earlier, calibration);
  const { settings } = calibration;
  const first = run[0];
  const qualities = run.map((r) => r.quality);
  if (!steps) return { lever: "level", state: "untested", evidence: `No step of ${settings.noResponsePct}% or more in thermal dose has been tasted on this profile yet.` };
  const days = [...new Set(run.map((r) => r.restedDays).filter((d): d is number => d !== undefined))];
  const caveat = days.length > 1 ? `The tastings were on different days of rest (${list(run.map((r) => r.restedDays ?? "?"))}), which can blur the comparison.` : undefined;
  const total = Math.round(Math.abs((latest.thermalDose / first.thermalDose - 1) * 100));
  const evidence = `${plural(steps, "step")} ${direction} roasting on this profile (thermal dose ${round1(first.thermalDose)} to ${round1(latest.thermalDose)}, about ${total}% ${direction}); the roast quality was ${list(qualities)}.`;
  // Steps at the end of the run that did not raise the quality: the level is stuck once there are enough of them.
  let stuck = 0;
  for (let i = run.length - 1; i > 0 && run[i].quality <= run[i - 1].quality; i--) stuck++;
  const state: LeverState = stuck === 0 ? "moving" : stuck >= settings.plateauSteps && latest.quality < settings.holdMinQuality ? "exhausted" : "unclear";
  const lately = stuck === 0 ? " The last step raised it." : stuck === 1 ? " The last step did not raise it." : ` The last ${stuck} steps did not raise it.`;
  const next = state === "exhausted" ? undefined : "A clean cup gives the level no direction: only a defect word shows which way to go, so another step is a probe for the edge of the clean zone, and it costs a roast.";
  return { lever: "level", state, evidence: evidence + lately, caveat, next };
}

function profileLever(all: TastedRoast[], alternative: AdviceContext["alternative"], { settings }: Calibration): Lever {
  if (!alternative) return { lever: "profile", state: "unavailable", evidence: "No other stock profile is suggested for this bean." };
  const named = all.filter((r) => r.profile === alternative.profileName);
  if (!named.length) {
    return { lever: "profile", state: "untested", evidence: `${alternative.profileName} hasn't been roasted for this bean.`, next: `Roast it on ${alternative.profileName} at level ${alternative.level} (ends at ${alternative.endTempC} °C); it costs a roast.` };
  }
  // A renamed copy of the alternative (same curve and settings, so the same key) is the alternative, however its
  // stock parent is recorded: it counts as a trial of it, and is not "the other profile".
  const keys = new Set(named.flatMap((r) => (r.profileKey ? [r.profileKey] : [])));
  const tried = all.filter((r) => r.profile === alternative.profileName || (r.profileKey !== undefined && keys.has(r.profileKey)));
  const others = all.filter((r) => !tried.includes(r));
  const there = Math.max(...tried.map((r) => r.quality));
  const against = others.length ? `, against ${Math.max(...others.map((r) => r.quality))} on the other profile` : "";
  const evidence = `${alternative.profileName} has ${plural(tried.length, "tasted roast")}, best roast quality ${there}${against}.`;
  const better = others.length > 0 && there > Math.max(...others.map((r) => r.quality));
  if (better) return { lever: "profile", state: "moving", evidence };
  // A fair test is enough roasts on the other profile, with something to compare them with, and none better.
  if (others.length > 0 && tried.length >= settings.profileTestRoasts) return { lever: "profile", state: "exhausted", evidence: `${evidence} ${alternative.profileName} has not improved a cup yet.` };
  if (others.length === 0) return { lever: "profile", state: "unclear", evidence: `${evidence} There is no roast on the other profile to compare it with.` };
  return { lever: "profile", state: "unclear", evidence: `${evidence} That is too few roasts to rule it out.` };
}

const CURVE: Lever = { lever: "curve", state: "unavailable", evidence: "This tool can't edit a curve yet.", next: "If you edit one in Kaffelogic Studio, tell me and I'll record the roast as a new version." };

/** Every lever with where it stands for this roast and the bean's earlier ones. */
export function leverLedger(latest: TastedRoast, earlier: TastedRoast[], calibration: Calibration, context?: AdviceContext): Lever[] {
  const all = [...earlier, latest];
  return [levelLever(latest, earlier, calibration), profileLever(all, context?.alternative, calibration), CURVE];
}

/**
 * The answer for a clean cup that is below the bar: no roast defect, so the level has nothing to fix.
 * What else can change the cup, what each lever changes and what the roasts say about it, and what that adds up to.
 */
export function cleanBelowBarMessage(ledger: Lever[], latest: TastedRoast, { settings }: Calibration, reference?: string): string {
  const head = `The cup is clean: no roast defect, so there is nothing for the level to fix. The roast quality is ${latest.quality} (${qualityMeaning(latest.quality)}), below the bar of ${settings.holdMinQuality}.`;
  const lines = ledger.map((l) => `- ${l.lever} (${l.state}): ${LEVER_EFFECTS[l.lever]} ${l.evidence}${l.caveat ? ` ${l.caveat}` : ""}${l.next ? ` ${l.next}` : ""}`);
  const open = ledger.filter((l) => l.lever !== "curve" && l.state !== "unavailable" && l.state !== "exhausted").map((l) => l.lever);
  const verdict = open.length
    ? `Still to try before the coffee can be named as the limit: ${list(open)}.`
    : "Everything this tool can move has had a fair test, the level in the direction it was tried. What is left is the curve, which the tool can't edit yet, or the coffee itself; a ladder of levels can't tell those two apart.";
  const quoted = reference?.trim().replace(/[.!?\s]+$/, "");
  const ref = quoted ? ` Your reference for this coffee is "${quoted}". Compare the cup against it.` : "";
  return `${head} What can raise it:\n${lines.join("\n")}\n${verdict}${ref}`;
}

// The levers that can change a cup, and where each one stands for a bean: still moving the cup, tried
// without effect, not tried yet, or out of this tool's reach. Every state is read from recorded
// roasts and tastings, never guessed. The ledger is what stops "no rule covers this" from being the
// whole answer: for a clean cup below the bar it says what can raise the quality, what each lever
// changes, and what the evidence says about it.
//
// This file imports only types from rules.ts, so there is no import cycle at run time (rules.ts
// imports this file).
import { TASTING_FIELDS, qualityMeaning } from "./intake.js";
import type { AdviceContext, Calibration, TastedRoast } from "./rules.js";

export const LEVERS = ["rest", "brew", "level", "profile", "curve"] as const;
export type LeverName = (typeof LEVERS)[number];

/** moving: changing it improved the roast quality. exhausted: tried enough with no gain. unclear: tried, too thin to say. untested: not tried. unavailable: out of this tool's reach. */
export type LeverState = "moving" | "exhausted" | "unclear" | "untested" | "unavailable";

/**
 * What changing each lever does, in one sentence each. docs/RULES.md quotes these word for word (a
 * test checks it). The roast levers say what the tool can measure; the cup levers say what they leave alone.
 */
export const LEVER_EFFECTS: Record<LeverName, string> = {
  rest: "Changes how the roast has settled by the time you taste it; the roast itself stays as it is. Kaffelogic's Rest profiles are written for 3 to 5 days.",
  brew: "Changes how much of the roast reaches the cup; the roast itself stays as it is. The tasting form's own note: espresso exaggerates sourness and filter exaggerates flatness.",
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
/** A brew as the tasting form words it ("Pour over"), lower-cased for a sentence. */
const BREW_LABELS = new Map(
  TASTING_FIELDS.flatMap((f): [string, string][] => (f.id === "brew" && "options" in f ? f.options.map((o): [string, string] => [o.value, o.label.toLowerCase()]) : [])),
);
const brewName = (value: string) => BREW_LABELS.get(value) ?? value;
const which = (r: TastedRoast) => (r.level === undefined ? "One roast" : `The level ${r.level} roast`);

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

type Tasting = NonNullable<TastedRoast["tastings"]>[number];

/** One fair-looking comparison inside a single roast: what it showed, whether quality rose, whether the test was big enough to trust. */
interface Comparison {
  gain: number;
  said: string;
  fair: boolean;
}

/**
 * A lever that changes the cup but not the roast (rest, brew), judged from one roast tasted more than
 * one way. Rest is compared only between tastings with the same brew, and brew only between tastings on
 * the same day, so one pair of tastings can't credit both. Per comparison: the roast quality went up
 * (moving), or it did not although the test was fair (enough days apart, enough different brews:
 * exhausted), or the test was too small to say (unclear). Across comparisons, moving beats exhausted beats
 * unclear. A roast whose tastings differ in this lever only along with the other one is unclear (the
 * difference could be either). With no roast tasted a second way: untested.
 */
interface CupTest {
  /** What varies inside a comparison. */
  vary: "restedDays" | "brew";
  /** What a comparison holds the same. */
  hold: "restedDays" | "brew";
  untested: (all: TastedRoast[]) => string;
  confounded: (r: TastedRoast) => string;
  judge: (r: TastedRoast, group: Tasting[], calibration: Calibration) => Comparison;
  next: string;
  noGain: string;
}

const CUP_TESTS: Record<"rest" | "brew", CupTest> = {
  rest: {
    vary: "restedDays",
    hold: "brew",
    untested: (all) => {
      const days = [...new Set(all.flatMap((r) => r.tastings?.map((t) => t.restedDays) ?? (r.restedDays === undefined ? [] : [r.restedDays])))].sort((a, b) => a - b);
      if (!days.length) return "No tasting says how many days the roast rested.";
      return days.length === 1
        ? `Every tasting so far was on day ${days[0]} after roasting; no roast has been tasted again on another day.`
        : `Tastings so far were on days ${list(days)} after roasting, but no single roast has been tasted on more than one day.`;
    },
    confounded: (r) => `${which(r)} was tasted on different days but brewed differently each time, so the difference could be the brew.`,
    judge: (r, group, { settings }) => {
      const byDay = [...group].sort((a, b) => a.restedDays - b.restedDays);
      const first = byDay[0];
      const last = byDay[byDay.length - 1];
      const bestLater = byDay.slice(1).reduce((a, b) => (b.quality > a.quality ? b : a));
      const to = bestLater.quality > first.quality ? bestLater : last;
      return { gain: bestLater.quality - first.quality, said: `${which(r)} had roast quality ${first.quality} on day ${first.restedDays} and ${to.quality} on day ${to.restedDays}.`, fair: last.restedDays - first.restedDays >= settings.restTestDays };
    },
    next: "Taste the newest roast again after more days of rest (it costs no roast).",
    noGain: "Resting has not improved a cup yet.",
  },
  brew: {
    vary: "brew",
    hold: "restedDays",
    untested: (all) => {
      const brews = [...new Set(all.flatMap((r) => (r.tastings ?? [{ brew: r.brew }]).map((t) => t.brew)))];
      return brews.length === 1
        ? `Every tasting so far was brewed as ${brewName(brews[0])}; no roast has been brewed another way.`
        : `No single roast has been brewed more than one way (brews so far: ${list(brews.map(brewName))}).`;
    },
    confounded: (r) => `${which(r)} was brewed more than one way but never two ways on the same day, so the difference could be the rest.`,
    judge: (r, group, { settings }) => {
      // The best quality each brew reached, so a gain is always between two different brews.
      const perBrew = [...new Set(group.map((t) => t.brew))].map((brew) => ({ brew, quality: Math.max(...group.filter((t) => t.brew === brew).map((t) => t.quality)) }));
      const best = perBrew.reduce((a, b) => (b.quality > a.quality ? b : a));
      const worst = perBrew.reduce((a, b) => (b.quality < a.quality ? b : a));
      return {
        gain: best.quality - worst.quality,
        said: best.quality > worst.quality ? `${which(r)} had roast quality ${best.quality} brewed as ${brewName(best.brew)} and ${worst.quality} brewed as ${brewName(worst.brew)}.` : `${which(r)} had roast quality ${best.quality} brewed as ${list(perBrew.map((b) => brewName(b.brew)))}.`,
        fair: perBrew.length >= settings.brewTestCount,
      };
    },
    next: "Taste the newest roast brewed another way (it costs no roast).",
    noGain: "Changing the brew has not improved a cup yet.",
  },
};

function cupLever(lever: "rest" | "brew", all: TastedRoast[], calibration: Calibration): Lever {
  const test = CUP_TESTS[lever];
  const comparisons: Comparison[] = [];
  let confounded: string | undefined;
  for (const r of all) {
    const tastings = r.tastings ?? [];
    const groups = new Map<string | number, Tasting[]>();
    for (const t of tastings) groups.set(t[test.hold], [...(groups.get(t[test.hold]) ?? []), t]);
    const comparable = [...groups.values()].filter((g) => new Set(g.map((t) => t[test.vary])).size > 1);
    comparisons.push(...comparable.map((g) => test.judge(r, g, calibration)));
    if (!comparable.length && new Set(tastings.map((t) => t[test.vary])).size > 1) confounded ??= test.confounded(r);
  }
  if (!comparisons.length) {
    return confounded ? { lever, state: "unclear", evidence: confounded, next: test.next } : { lever, state: "untested", evidence: test.untested(all), next: test.next };
  }
  const moving = comparisons.reduce((a, b) => (b.gain > a.gain ? b : a));
  if (moving.gain > 0) return { lever, state: "moving", evidence: moving.said, next: test.next };
  const fair = comparisons.find((c) => c.fair);
  if (fair) return { lever, state: "exhausted", evidence: `${fair.said} ${test.noGain}` };
  return { lever, state: "unclear", evidence: `${comparisons[0].said} ${test.noGain} That is too small a test to rule it out.`, next: test.next };
}

function profileLever(all: TastedRoast[], alternative: AdviceContext["alternative"], { settings }: Calibration): Lever {
  if (!alternative) return { lever: "profile", state: "unavailable", evidence: "There's no other stock profile I'd suggest for this bean." };
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
  return [cupLever("rest", all, calibration), cupLever("brew", all, calibration), levelLever(latest, earlier, calibration), profileLever(all, context?.alternative, calibration), CURVE];
}

/**
 * The answer for a clean cup that is below the bar: no roast defect, so the level has nothing to fix.
 * What else can change the cup, what each lever changes and what the roasts say about it, and what that adds up to.
 */
export function cleanBelowBarMessage(ledger: Lever[], latest: TastedRoast, { settings }: Calibration, reference?: string): string {
  const head = `The cup is clean: no roast defect, so there is nothing for the level to fix. The roast quality is ${latest.quality} (${qualityMeaning(latest.quality)}), below the ${settings.holdMinQuality} this tool aims for.`;
  const lines = ledger.map((l) => `- ${l.lever} (${l.state}): ${LEVER_EFFECTS[l.lever]} ${l.evidence}${l.caveat ? ` ${l.caveat}` : ""}${l.next ? ` ${l.next}` : ""}`);
  const open = ledger.filter((l) => l.lever !== "curve" && l.state !== "unavailable" && l.state !== "exhausted").map((l) => l.lever);
  const verdict = open.length
    ? `I wouldn't blame the coffee yet: ${list(open)} ${open.length === 1 ? "is" : "are"} still to try.`
    : "Everything this tool can move has had a fair test, the level in the direction it was tried. What is left is the curve, which the tool can't edit yet, or the coffee itself; a ladder of levels can't tell those two apart.";
  const quoted = reference?.trim().replace(/[.!?\s]+$/, "");
  const ref = quoted ? ` Your reference for this coffee is "${quoted}". It says what the coffee can be, so don't write it off; compare the cup against it.` : "";
  return `${head} What can raise it:\n${lines.join("\n")}\n${verdict}${ref}`;
}

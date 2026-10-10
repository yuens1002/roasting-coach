// The deterministic rule table: what a tasting says about the roast, and the one change that
// follows. The same evidence always gives the same advice. Nothing here reads a raw curve or
// calls a model; it works on the tasting chips, the roast's measured thermal dose and the bean's
// own earlier results. A change is sized in thermal dose (a percentage of the tasted roast's own
// thermal dose); turning it into a level for the profile at hand is the adapter's job (thermalDose.ts).
//
// Only the clear cases are here. Every tasting gets an answer from a rule (a test checks that), never an
// improvised one, and a clean cup is left alone: this tool can't choose another profile or edit a curve to take
// it further. Every setting is a first guess to be tuned against real roasts and tastings;
// each lives in RULE_SETTINGS so the rules and tests can see it.

import { daysBetween } from "./dates.js";
import { brewLabel, qualityMeaning } from "./intake.js";
import { PCT_EPSILON, sameProfile } from "./levers.js";

/** How many level changes the tool aims to get a roast right in. The count starts at the first level change it recommends. */
export const LEVEL_CHANGE_BUDGET = 3;

/** The roast quality the product aims for (docs/ROADMAP.md): clean and expressive. A clean cup below it is left alone too, with what would take it further. */
const RIGHT_QUALITY = 4;

export const RULE_SETTINGS = {
  /** Thermal dose change, as % of the tasted roast's thermal dose, when one chip points the way. */
  stepPct: 10,
  /** The same, when `strongChipCount` or more chips agree. */
  strongStepPct: 15,
  strongChipCount: 2,
  /** Roasts within this % of each other's thermal dose count as the same roasting (batch-to-batch noise). */
  noisePct: 3,
  /**
   * A roast whose thermal dose moved at least this % past an earlier same-side result, on the same
   * profile, and still tastes the same way: the level isn't helping. A step of `stepPct` lands
   * within `noisePct` of its target, so this is `stepPct` less `noisePct`.
   */
  noResponsePct: 7,
} as const;

/**
 * What each taste chip says about how far the roast went: from uncooked (grassy, bready or baked, raw) to scorched (bitter,
 * roasty, ashy). The engine goes halfway between the two when a bean has been tasted on both sides. Chips not listed
 * (sour, astringent, flat, thin) are ambiguous: sour can come from the brew as well as from the roast, and flat and thin can
 * mean under-development, over-extraction or the curve's shape, so no rule acts on them unless the roaster assigns them a side.
 */
export const TASTE_CHIPS = {
  under: ["grassy", "bready"],
  over: ["bitter", "roasty", "ashy"],
  good: ["sweet", "bright", "balanced"],
} as const;

/** The settings as numbers, for a roaster whose own values replace the defaults. */
export type RuleSettings = { -readonly [K in keyof typeof RULE_SETTINGS]: number };

/** What the taste words mean, as lists a roaster can reassign words between. */
export interface ChipMeanings {
  under: readonly string[];
  over: readonly string[];
  good: readonly string[];
}

/**
 * What the rules read besides the tasting: the settings and the taste-word meanings. The defaults are
 * the ones in this file; a roaster's own overrides (src/core/calibration.ts) replace some of them.
 */
export interface Calibration {
  settings: RuleSettings;
  chips: ChipMeanings;
}

export const DEFAULT_CALIBRATION: Calibration = { settings: RULE_SETTINGS, chips: TASTE_CHIPS };

/**
 * Every answer the engine can give, by rule id. Advice can carry no other id (the type below makes
 * the compiler enforce that), and docs/RULES.md must describe each one (a test checks that).
 */
export const OUTCOME_IDS = [
  "tasted-in-other-brew",
  "quality-vs-words",
  "mixed-signals",
  "tasted-too-soon",
  "under-roasted",
  "under-roasted-bracketed",
  "under-roasted-contradicted",
  "over-roasted",
  "over-roasted-bracketed",
  "over-roasted-contradicted",
  "level-not-helping",
  "level-changes-used",
  "keep-as-is",
] as const;
export type OutcomeId = (typeof OUTCOME_IDS)[number];

export type Side = "under" | "over";
type Move = "more" | "less";

/** What each side of the table means, in one place: the opposite side, which way to move, how to say it. */
const SIDES = {
  under: { opposite: "over", sign: 1, move: "more", verdict: "under-roasted" },
  over: { opposite: "under", sign: -1, move: "less", verdict: "over-roasted" },
} as const satisfies Record<Side, { opposite: Side; sign: 1 | -1; move: Move; verdict: string }>;

/** One tasted roast, as the rules see it. */
export interface TastedRoast {
  /** The roast's measured thermal dose (equivalent minutes at 200 °C). */
  thermalDose: number;
  taste: string[];
  /** Roast quality, 1-5 (QUALITY_ANCHORS in intake.ts): judged by defects, not by liking. */
  quality: number;
  brew: string;
  /** The profile the roast used (its stock profile when it is a copy of one). Names the rest days and the profiles tried. */
  profile?: string;
  /** What the profile's curve and settings come to, when known: two roasts are on the same profile only when this agrees (an edited copy keeps its stock parent's name). */
  profileKey?: string;
  /** Whole days from the roast to this tasting. */
  restedDays?: number;
  /** The level the roast was made at, for telling roasts apart in what the engine says. */
  level?: number;
  /** Days this roast's profile wants it to rest before it is judged, when the profile says (min, max). */
  restNeeded?: readonly [number, number];
}

/** What the machine adapter knows that the rules need (see adapters/kaffelogic/adviceContext.ts). */
export interface AdviceContext {
  /** Days a roast on this profile should rest before it is judged, if the profile says. */
  restNeeded?: (profile: string) => readonly [number, number] | undefined;
  /** Where to go when the level isn't helping: another profile, at the level it starts that profile at. */
  alternative?: { profileName: string; level: number; endTempC: number };
  /** What the roaster says this coffee should taste like (the supplier's or producer's description, or their own cup), when they know. */
  reference?: string;
  /** The one brew every tasting of this coffee is of, chosen at intake. Left out when the engine is used without a bean: any brew counts then. */
  tastingBrew?: string;
}

export interface AdviceInput {
  /** The roast just tasted. */
  latest: TastedRoast;
  /** The bean's other tasted roasts. */
  earlier: TastedRoast[];
  context?: AdviceContext;
  /** The roaster's settings and taste-word meanings; the defaults when left out. */
  calibration?: Calibration;
  /** How many level changes lie behind the roast tasted (its version's steps from the first). Left out when the engine is used without a bean: the count is not kept then. */
  levelChangesMade?: number;
}

export type Advice =
  | {
      kind: "change";
      ruleId: OutcomeId;
      /** Signed % change of the tasted roast's thermal dose: positive roasts further. */
      thermalDoseChangePct: number;
      /** A fixed step, or the midpoint between an under- and an over-roasted result. */
      basis: "step" | "midpoint";
      reason: string;
    }
  /** The level isn't what's wrong: try another profile, at the level it suggests. */
  | { kind: "switch-profile"; ruleId: OutcomeId; profileName: string; level: number; endTempC: number; reason: string }
  /** Keep the roast as it is. */
  | { kind: "hold"; ruleId: OutcomeId; reason: string }
  /** The evidence disagrees with itself; the roaster decides. */
  | { kind: "ask"; ruleId: OutcomeId; reason: string };

interface Reading {
  under: string[];
  over: string[];
  good: string[];
}

const pick = (taste: string[], chips: readonly string[]) => taste.filter((c) => chips.includes(c));
const joined = (items: readonly string[], conjunction: "and" | "or") => (items.length < 3 ? items.join(` ${conjunction} `) : `${items.slice(0, -1).join(", ")} ${conjunction} ${items[items.length - 1]}`);
const words = (items: readonly string[]) => joined(items, "and");
/** Whether a tasting counts for a coffee: it is of the brew chosen at intake (any brew, when the engine is used without a bean). */
const countsAsTasted = (brew: string, context?: AdviceContext) => !context?.tastingBrew || brew === context.tastingBrew;
const pct = (n: number) => Math.round(Math.abs(n) * 10) / 10;

function read(t: TastedRoast, { chips }: Calibration): Reading {
  return {
    under: pick(t.taste, chips.under),
    over: pick(t.taste, chips.over),
    good: pick(t.taste, chips.good),
  };
}

/** Which side one tasting points to: only when it names one side and not the other. */
function sideOf(t: TastedRoast, calibration: Calibration): Side | undefined {
  const r = read(t, calibration);
  if (r.under.length && !r.over.length) return "under";
  if (r.over.length && !r.under.length) return "over";
  return undefined;
}

interface Rule {
  id: string;
  /** The advice if this rule applies, else undefined. The first rule that applies wins. */
  run: (input: AdviceInput, reading: Reading, calibration: Calibration) => Advice | undefined;
}

/** The level moved the roast and the cup stayed on the same side: go to another profile if there is one not yet tried, else ask. */
function levelNotHelping(side: Side, mine: string[], latest: TastedRoast, earlier: TastedRoast[], unmoved: TastedRoast, alternative: AdviceContext["alternative"], { chips }: Calibration): Advice {
  const { move, verdict } = SIDES[side];
  const moved = pct((latest.thermalDose / unmoved.thermalDose - 1) * 100);
  const seen = `The cup tasted ${words(mine)} (${verdict}) even after the roasting went ${moved}% ${move} than an earlier roast on this profile, which tasted ${words(pick(unmoved.taste, chips[side]))} too. The level moved the roast and the cup stayed on the same side.`;
  const tried = alternative && [latest, ...earlier].some((r) => r.profile === alternative.profileName);
  if (alternative && !tried) return { kind: "switch-profile", ruleId: "level-not-helping", profileName: alternative.profileName, level: alternative.level, endTempC: alternative.endTempC, reason: seen };
  const why = alternative ? `You've already roasted this bean on ${alternative.profileName}, the other stock profile suggested for this bean.` : "No other stock profile is suggested for this bean.";
  return { kind: "ask", ruleId: "level-not-helping", reason: `${seen} ${why} The next lever would be the profile's curve, which this tool can't edit yet. Keep adjusting the level anyway, or try something else?` };
}

/**
 * The three level changes are used and the cup still has a defect: the next change is another profile. The bean's other
 * profile, when there is one not yet roasted, is named with its level; otherwise the roaster picks one, because this tool
 * can't choose a profile for a bean that has none to suggest.
 */
function levelChangesUsed(side: Side, mine: string[], latest: TastedRoast, earlier: TastedRoast[], alternative: AdviceContext["alternative"]): Advice {
  const { verdict } = SIDES[side];
  const seen = `The cup tasted ${words(mine)} (${verdict}) after ${LEVEL_CHANGE_BUDGET} level changes, the number this tool aims to get the roast right in. Try a different profile.`;
  const tried = alternative && [latest, ...earlier].some((r) => r.profile === alternative.profileName);
  if (alternative && !tried) return { kind: "switch-profile", ruleId: "level-changes-used", profileName: alternative.profileName, level: alternative.level, endTempC: alternative.endTempC, reason: seen };
  const why = alternative ? `You've already roasted this bean on ${alternative.profileName}, the other stock profile suggested for this bean.` : "No other stock profile is suggested for this bean.";
  return { kind: "ask", ruleId: "level-changes-used", reason: `${seen} ${why} This tool can't choose one for this bean: pick another Kaffelogic profile, say which, and I'll work out the level for the colour you are after.` };
}

/** A clear under- or over-roasted cup: step that way, or halve the gap to a result on the other side. */
function developmentRule(side: Side): Rule["run"] {
  const { opposite, sign, move, verdict } = SIDES[side];
  return ({ latest, earlier, context, levelChangesMade }, reading, calibration) => {
    const { settings } = calibration;
    const mine = reading[side];
    if (!mine.length || reading[opposite].length) return undefined;
    // The level changes this tool aims to get a roast right in are used: the next change is another profile, whatever the earlier roasts say.
    if (levelChangesMade !== undefined && levelChangesMade >= LEVEL_CHANGE_BUDGET) return levelChangesUsed(side, mine, latest, earlier, context?.alternative);
    const ruleId = verdict;
    // How far each opposite-side result sits from this roast, in % of this roast's thermal dose, counted in
    // the direction we'd move: positive means further along that way.
    const gaps = earlier.filter((e) => sideOf(e, calibration) === opposite).map((e) => ({ e, along: (sign * (e.thermalDose - latest.thermalDose) * 100) / latest.thermalDose }));
    const disagree = gaps.find((g) => g.along <= settings.noisePct);
    if (disagree) {
      const backwards = disagree.along < -settings.noisePct;
      return {
        kind: "ask",
        ruleId: `${ruleId}-contradicted` as const,
        reason: `This cup tasted ${words(mine)} (${verdict}), but an earlier roast with ${backwards ? `${pct(disagree.along)}% ${sign === 1 ? "less" : "more"}` : "about the same"} roasting tasted ${words(read(disagree.e, calibration)[opposite])} (${SIDES[opposite].verdict}). ${backwards ? `That runs against the expected direction: the roast with ${sign === 1 ? "less" : "more"} roasting should not taste ${sign === 1 ? "more" : "less"} roasted.` : "Roasts this close should not taste opposite."} So something other than the roast differs between them: the days of rest or the batch. Find out which before changing the roast.`,
      };
    }
    const bracket = gaps.reduce<(typeof gaps)[number] | undefined>((nearest, g) => (!nearest || g.along < nearest.along ? g : nearest), undefined);
    if (bracket) {
      const thermalDoseChangePct = Math.round(((bracket.e.thermalDose / latest.thermalDose - 1) * 100) / 2 * 10) / 10;
      return {
        kind: "change",
        ruleId: `${ruleId}-bracketed` as const,
        thermalDoseChangePct,
        basis: "midpoint",
        reason: `The cup tasted ${words(mine)} (${verdict}), while an earlier roast with ${pct(bracket.along)}% ${move} roasting tasted ${words(read(bracket.e, calibration)[opposite])} (${SIDES[opposite].verdict}). Halving the gap between them: about ${pct(thermalDoseChangePct)}% ${move} roasting.`,
      };
    }
    // The level has already moved this side's result a real distance, on this profile, and the cup is
    // the same: the cup did not follow the level, so another step along it has no evidence behind it either.
    const unmoved = earlier.find((e) => sideOf(e, calibration) === side && sameProfile(e, latest) && (sign * (latest.thermalDose - e.thermalDose) * 100) / e.thermalDose >= settings.noResponsePct - PCT_EPSILON);
    if (unmoved) return levelNotHelping(side, mine, latest, earlier, unmoved, context?.alternative, calibration);
    const thermalDoseChangePct = sign * (mine.length >= settings.strongChipCount ? settings.strongStepPct : settings.stepPct);
    return {
      kind: "change",
      ruleId,
      thermalDoseChangePct,
      basis: "step",
      reason: `The cup tasted ${words(mine)}, which means the beans were ${verdict}. Roast about ${pct(thermalDoseChangePct)}% ${move}.`,
    };
  };
}

/** The table, in the order the rules are tried. */
export const RULES: Rule[] = [
  {
    // Brew and rest change the cup, not the roast. Every tasting of a coffee is of the one brew chosen at intake (the cupping
    // protocol), so that no roast is tasted as a different kind of brew. The form offers every brew, so this catches a tasting
    // in another one, which says nothing the others can be set against.
    id: "tasted-in-other-brew",
    run: ({ latest, context }) => {
      const chosen = context?.tastingBrew;
      if (!chosen || countsAsTasted(latest.brew, context)) return undefined;
      return {
        kind: "ask",
        ruleId: "tasted-in-other-brew",
        reason: `This roast was tasted brewed as ${brewLabel(latest.brew)}. Roasts of this coffee are tasted as ${brewLabel(chosen)}, so that a difference in the cup is not a difference between kinds of brew. Taste this roast brewed as ${brewLabel(chosen)} and record that tasting, then ask again.`,
      };
    },
  },
  {
    // Quality is judged by defects, so it has to agree with the words: a cup with a roast defect is a 1 or 2,
    // a clean one a 3 or better. When they disagree, one of them is wrong, and advice built on either would be too.
    id: "quality-vs-words",
    run: ({ latest }, r, { chips }) => {
      const defects = [...r.under, ...r.over];
      const said = `You rated the roast quality ${latest.quality} (${qualityMeaning(latest.quality)})`;
      const fix = "Which is right? Correct whichever is wrong and I'll go on from there.";
      if (defects.length && latest.quality >= 3) {
        return { kind: "ask", ruleId: "quality-vs-words", reason: `${said}, but the cup tasted ${words(defects)}, which is a roast defect. A cup with a roast defect is a 1 or 2; a clean cup is a 3 or better. ${fix}` };
      }
      if (!defects.length && latest.quality <= 2) {
        return { kind: "ask", ruleId: "quality-vs-words", reason: `${said}, but ${latest.taste.length ? `none of the taste words (${words(latest.taste)})` : "no taste word"} names a roast defect (under-roasted words: ${words([...chips.under])}; over-roasted words: ${words([...chips.over])}). A 1 or 2 means a defect. ${fix}` };
      }
      return undefined;
    },
  },
  {
    id: "mixed-signals",
    run: (_input, r) =>
      r.under.length && r.over.length
        ? {
            kind: "ask",
            ruleId: "mixed-signals",
            reason: `The cup tasted both ${words(r.under)} (under-roasted) and ${words(r.over)} (over-roasted). That is the pattern of an uneven roast, which a level change does not address: some beans went too far while others didn't go far enough. Check how the beans looked after the roast (uneven colour, dark tips) before changing anything; the curve is what changes how evenly the heat is applied.`,
          }
        : undefined,
  },
  {
    id: "tasted-too-soon",
    run: ({ latest }, r) => {
      const needed = latest.restNeeded;
      if (!needed || latest.restedDays === undefined || latest.restedDays >= needed[0] || !r.under.length || r.over.length) return undefined;
      const when = latest.restedDays === 0 ? "the day it was roasted" : latest.restedDays === 1 ? "1 day after roasting" : `${latest.restedDays} days after roasting`;
      return {
        kind: "hold",
        ruleId: "tasted-too-soon",
        reason: `The cup tasted ${words(r.under)}, but this roast's profile (${latest.profile ?? "unknown"}) is written for ${needed[0]} to ${needed[1]} days of resting before brewing, and it was tasted ${when}. The rest the profile asks for is not over. Taste it again on day ${needed[0]} or later before changing anything.`,
      };
    },
  },
  { id: SIDES.under.verdict, run: developmentRule("under") },
  { id: SIDES.over.verdict, run: developmentRule("over") },
  {
    // A cup with no roast defect is done for what this tool can do. Rule 2 has already sent a defect-free cup rated 1 or 2 back
    // to the roaster, so the quality here is 3 or more. A cup that is clean but short of the best would need another profile or
    // an edited curve, and the tool can neither choose another profile for a cup with no defect to show the way nor edit a curve.
    id: "keep-as-is",
    run: ({ latest }, r) => {
      if (r.under.length || r.over.length) return undefined;
      const cup = r.good.length ? `The cup tasted ${words(r.good)} and the roast quality is ${latest.quality} (${qualityMeaning(latest.quality)}).` : `Nothing in the cup is a roast defect and the roast quality is ${latest.quality} (${qualityMeaning(latest.quality)}).`;
      const further = latest.quality < RIGHT_QUALITY ? " A better cup would need another profile or an edited curve, which this tool can't choose or make yet." : "";
      return { kind: "hold", ruleId: "keep-as-is", reason: `${cup}${further} Keep this roast as it is.` };
    },
  },
];

/** The advice for a tasting, from the table; the first rule that applies. */
export function advise(input: AdviceInput): Advice {
  const calibration = input.calibration ?? DEFAULT_CALIBRATION;
  const reading = read(input.latest, calibration);
  for (const rule of RULES) {
    const advice = rule.run(input, reading, calibration);
    if (advice) return advice;
  }
  throw new Error(`No rule answers this tasting: ${JSON.stringify(input.latest)}. The table has to cover every tasting.`);
}

/** The part of a bean's history the rules read (a structural subset of `beanHistory`). */
export interface HistoryForAdvice {
  versions: {
    number: number;
    /** The version this one changes; absent for the first version. */
    parentNumber?: number;
    level?: number;
    profileName: string;
    /** The stock profile this version is built on, when it is. */
    baseProfile?: string;
    /** A fingerprint of the version's stored profile (see profileBodyKey), when it has one. */
    profileKey?: string;
    roasts: {
      id: number;
      roastedAt: unknown;
      logLevel?: number;
      features?: { thermalDose: number };
      tastings: { id: number; tastedOn: string; quality: number; taste: string[]; brew: string }[];
    }[];
  }[];
}

export interface AdviceResult {
  /** The roast and tasting the advice answers, newest first among tasted roasts. */
  basedOn: { version: number; roastId: number; tastingId: number; level?: number; measuredThermalDose: number; levelChange: number };
  advice: Advice;
  /** The earlier roasts left out of the comparison because none of their rated tastings was of the coffee's tasting brew: how many, and that brew. Absent when none were. */
  setAside?: { roasts: number; tastingBrew: string };
}

type HistoryVersion = HistoryForAdvice["versions"][number];
const sameVersionProfile = (a: HistoryVersion, b: HistoryVersion) => (a.profileKey && b.profileKey ? a.profileKey === b.profileKey : (a.baseProfile ?? a.profileName) === (b.baseProfile ?? b.profileName));

/**
 * How many level changes lie behind a version on its profile: the steps back along the versions' parents while the profile stays
 * the same. A switch to another profile starts the count again, so the first version on a profile has none behind it. A
 * recommendation made on a version is the next level change.
 */
export function levelChangesTo(versions: HistoryForAdvice["versions"], number: number): number {
  const seen = new Set<number>([number]);
  let steps = 0;
  let child = versions.find((v) => v.number === number);
  while (child?.parentNumber !== undefined && !seen.has(child.parentNumber)) {
    const parent = versions.find((v) => v.number === child!.parentNumber);
    if (!parent || !sameVersionProfile(parent, child)) break;
    seen.add(parent.number);
    steps++;
    child = parent;
  }
  return steps;
}

/**
 * Advice for a bean's newest tasted roast, using its other tasted roasts as the bean's own record.
 * Each roast counts once, by its newest tasting in the coffee's tasting brew (the cupping protocol; any brew when the
 * context names none). The newest roast counts by its newest tasting when none is in that brew, and the rules then ask
 * for one. An earlier roast with no tasting in that brew is left out and counted in `setAside`. Roasts without a measured thermal dose can't be compared, so they're left out;
 * undefined when no roast with a thermal dose has been tasted.
 */
export function adviseFromHistory(history: HistoryForAdvice, context?: AdviceContext, calibration?: Calibration): AdviceResult | undefined {
  const tasted = tastedRoastsOf(history, context);
  const newest = tasted[tasted.length - 1];
  if (!newest) return undefined;
  const earlier = tasted.slice(0, -1).filter((entry) => entry.counted).map((entry) => entry.tasted);
  const setAside = tasted.length - 1 - earlier.length;
  const levelChangesMade = levelChangesTo(history.versions, newest.version.number);
  return {
    basedOn: { version: newest.version.number, roastId: newest.roast.id, tastingId: newest.tasting.id, level: newest.roast.logLevel, measuredThermalDose: newest.tasted.thermalDose, levelChange: levelChangesMade + 1 },
    advice: advise({ latest: newest.tasted, earlier, context, calibration, levelChangesMade }),
    // A roast is only set aside by a brew the context names, so the brew is there whenever there is a roast set aside.
    ...(setAside && context?.tastingBrew ? { setAside: { roasts: setAside, tastingBrew: context.tastingBrew } } : {}),
  };
}

/** A roast of a bean that has been tasted and has a measured thermal dose, as the rules read it. */
export interface TastedEntry {
  version: HistoryForAdvice["versions"][number];
  roast: HistoryForAdvice["versions"][number]["roasts"][number];
  /** The tasting the rules read for this roast: its newest in the coffee's tasting brew, else its newest. */
  tasting: HistoryForAdvice["versions"][number]["roasts"][number]["tastings"][number];
  /** Whether that tasting is in the coffee's tasting brew. A roast without one is left out of the comparison (but the newest still gets its answer). */
  counted: boolean;
  tasted: TastedRoast;
}

/** Every roast of a bean that has a tasting and a measured thermal dose, oldest first, as the rules read it. */
export function tastedRoastsOf(history: HistoryForAdvice, context?: AdviceContext): TastedEntry[] {
  return history.versions
    .flatMap((version) => version.roasts.map((roast) => ({ version, roast })))
    .filter(({ roast }) => roast.features && Number.isFinite(roast.features.thermalDose) && roast.tastings.length)
    .sort((a, b) => new Date(a.roast.roastedAt as string).getTime() - new Date(b.roast.roastedAt as string).getTime() || a.roast.id - b.roast.id)
    .map(({ version, roast }) => {
      const inBrew = roast.tastings.filter((t) => countsAsTasted(t.brew, context)).pop();
      const tasting = inBrew ?? roast.tastings[roast.tastings.length - 1];
      const profile = version.baseProfile ?? version.profileName;
      const tasted: TastedRoast = {
        thermalDose: roast.features!.thermalDose,
        taste: tasting.taste,
        quality: tasting.quality,
        brew: tasting.brew,
        profile,
        profileKey: version.profileKey,
        restedDays: daysBetween(roast.roastedAt as string | Date, tasting.tastedOn),
        restNeeded: context?.restNeeded?.(profile),
        level: roast.logLevel ?? version.level,
      };
      return { version, roast, tasting, counted: inBrew !== undefined, tasted };
    });
}

/** Where a level change lands on the roast's profile: both ends, with the end temperature the machine will aim for. */
export interface LevelMove {
  from: { level: number; endTempC: number };
  to: { level: number; endTempC: number };
  /** The thermal dose change the new level really gives, in percent: levels come in 0.1 steps on an uneven scale, so it can differ from the change asked for. */
  changePct?: number;
}

/** The finished answer to one tasting. */
export interface AdviceReport {
  /** The whole answer for the roaster, in plain words. Relay it as is. */
  say: string;
  /** Present only when the roaster can say yes: the exact `version:add` input to run then. Nothing else follows from the advice. */
  onYes?: { command: "version:add"; input: { beanId: number; parent: number; profileName?: string; level: number; reason: string } };
}

/**
 * The finished answer for one advice: the words to say and, for a level change the roaster can
 * accept, the exact command for a yes. `move` is the change turned into a level for the roast's
 * profile; `problem` says in plain words why it couldn't be (the profile isn't on hand, or the
 * level can't go finer), in which case the advice is given without an offer to record it.
 */
export function adviceReport(beanId: number, result: AdviceResult, move: LevelMove | undefined, problem?: string): AdviceReport {
  const draft = draftFor(beanId, result, move, problem);
  // A level change is numbered only when it is offered: with no level to set (the profile isn't on hand), there is nothing to number.
  const notes = [move && !problem ? levelChangeNote(result) : undefined, setAsideNote(result)].filter((note): note is string => note !== undefined);
  // The notes come before the question, so the answer still ends on what the roaster is asked.
  const say = [draft.statement, ...notes, draft.question].filter((part): part is string => part !== undefined).join(" ");
  return { say, ...(draft.onYes ? { onYes: draft.onYes } : {}) };
}

/** An answer in parts: what the engine says, then what it asks (when it asks), and the command for a yes. */
interface Draft {
  statement: string;
  question?: string;
  onYes?: AdviceReport["onYes"];
}

/** Which of the level changes the tool aims to get a roast right in a recommendation of a level change is. A switch of profile is not a level change, and past the budget the answer is to try a different profile. */
function levelChangeNote({ basedOn, advice }: AdviceResult): string | undefined {
  if (advice.kind !== "change") return undefined;
  return `This is level change ${basedOn.levelChange} of the ${LEVEL_CHANGE_BUDGET} this tool aims to get the roast right in.`;
}

function setAsideNote({ setAside }: AdviceResult): string | undefined {
  if (!setAside) return undefined;
  const { roasts, tastingBrew } = setAside;
  return `${roasts === 1 ? "One earlier roast was" : `${roasts} earlier roasts were`} without a rated tasting brewed as ${brewLabel(tastingBrew)}, so ${roasts === 1 ? "it is" : "they are"} left out of the comparison (roasts are tasted as ${brewLabel(tastingBrew)}).`;
}

function draftFor(beanId: number, { basedOn, advice }: AdviceResult, move: LevelMove | undefined, problem?: string): Draft {
  if (advice.kind === "hold") return { statement: `${advice.reason} No new version is needed.` };
  if (advice.kind === "switch-profile") {
    return {
      statement: `${advice.reason} Next, try ${advice.profileName} instead: pick it on the Nano and set level ${advice.level} (ends at ${advice.endTempC} °C).`,
      question: "Shall I record that as the next version?",
      onYes: { command: "version:add", input: { beanId, parent: basedOn.version, profileName: advice.profileName, level: advice.level, reason: advice.reason } },
    };
  }
  if (advice.kind !== "change") return { statement: advice.reason };
  if (!move || problem) return { statement: `${advice.reason} ${problem ?? "That can't be turned into a level for this roast's profile."}` };
  const direction = move.to.level > move.from.level ? "up" : "down";
  const asked = Math.round(Math.abs(advice.thermalDoseChangePct));
  const got = move.changePct === undefined ? asked : Math.round(Math.abs(move.changePct));
  const shortfall = got === asked ? "" : ` The nearest level on this profile gives about ${got}% ${advice.thermalDoseChangePct > 0 ? "more" : "less"} roasting, not ${asked}%; levels come in 0.1 steps on an uneven scale.`;
  return {
    statement: `${advice.reason} That is level ${move.to.level} (ends at ${move.to.endTempC} °C), ${direction} from level ${move.from.level} (${move.from.endTempC} °C).${shortfall}`,
    question: "Shall I record it as the next version?",
    onYes: { command: "version:add", input: { beanId, parent: basedOn.version, level: move.to.level, reason: advice.reason } },
  };
}

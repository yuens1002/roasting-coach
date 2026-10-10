// Which stock Nano 7 profile and level to start a new bean on.
//
// Numbers are facts read from the stock profile files (levels, end temperatures,
// the light/medium/dark levels each profile suggests, development targets where a
// profile states one). End temperatures come from levelToTemp; "ends at" is when
// the profile curve reaches that temperature. We refer to profiles by name only;
// the files themselves stay on the user's machine.
import type { Intake } from "../../core/intake.js";
import { AGTRON_MAX, AGTRON_MIN, agtronName, endTempForAgtron, fitColourLine } from "../../core/roastColour.js";
import { levelToTemp } from "./parse.js";

/**
 * Kaffelogic's labels for the levels a profile suggests. Their names come from the brews they were written for, and no
 * choice reads them as a brew: the tool reads them only as three points on a profile's own ladder of levels, to which the
 * Agtron scale is tied (LABELLED_LEVEL_AGTRON) until the roaster's own colour readings replace that.
 */
export type Goal = "filter" | "espresso" | "dark" | "cupping";

export const MACHINE_ID = "kaffelogic-nano7";

/** Database id of a stock profile, e.g. "1500-2000m RTD" -> "kaffelogic-nano7/1500-2000m-rtd". */
export const stockProfileId = (name: string) => `${MACHINE_ID}/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

export interface StockLevel {
  level: number;
  /** End temperature for this level, °C. */
  endTemp: number;
  /** When the profile curve reaches endTemp, m:ss. */
  endsAt: string;
}

export interface StockProfile {
  /** profile_short_name as it appears on the machine and in logs. */
  name: string;
  version?: string;
  family: "altitude" | "process" | "special" | "legacy";
  /**
   * The level the profile's own file recommends (its recommended_level). Reference data, checked against the file: no
   * choice of a level reads it, because a bean's first level comes from its Agtron target. It names no brew.
   */
  recommended: StockLevel;
  /** End temperature for levels 0..6, °C. */
  roastLevels: number[];
  /** First-crack temperature the profile expects, °C, when it states one. */
  expectFirstCrack?: number;
  /** False for stock profiles we know about but never pick as a starting point. */
  selectable?: boolean;
  /** The levels Kaffelogic labels by use. Read only as points on the profile's ladder (LABELLED_LEVEL_AGTRON); nothing else does. */
  levels: Partial<Record<Goal, StockLevel>>;
  /** Development % the profile itself says to aim for, when it says. */
  developmentTarget?: Partial<Record<Goal, [number, number]>>;
  /** Temperature rise after first crack the profile says to aim for, °C, when it says. */
  riseAfterCrack?: Partial<Record<Goal, [number, number]>>;
  /**
   * Days to rest the roast before brewing, for the "Rest" profiles. The "RTD" (ready to drink)
   * profiles are built to be drunk within a day or two and have none.
   */
  restDays?: readonly [number, number];
}

/** What the Rest profiles assume: 3 to 5 days of resting before brewing. */
const REST: readonly [number, number] = [3, 5];

/** A stock profile by name; own keys only, so names like "constructor" aren't found on Object.prototype. */
export const stockProfile = (name: string): StockProfile | undefined => (Object.hasOwn(STOCK_PROFILES, name) ? STOCK_PROFILES[name] : undefined);

const L = (level: number, endTemp: number, endsAt: string): StockLevel => ({ level, endTemp, endsAt });

export const STOCK_PROFILES: Record<string, StockProfile> = {
  "0-1200m RTD": { name: "0-1200m RTD", recommended: L(3.0, 221.0, "10:07"), version: "1.0", roastLevels: [208.4, 215.4, 217.6, 221, 222.3, 227.8, 241], family: "altitude", levels: { filter: L(2.2, 218.3, "9:31"), espresso: L(3.0, 221.0, "10:07"), dark: L(4.6, 225.6, "11:10") } },
  "0-1200m Rest": { name: "0-1200m Rest", recommended: L(3.0, 227.8, "12:27"), version: "1.0", roastLevels: [205, 212.8, 219.5, 227.8, 229.3, 235, 241], family: "altitude", restDays: REST, levels: { filter: L(2.2, 221.2, "11:31"), espresso: L(3.0, 227.8, "12:27"), dark: L(5.0, 235.0, "13:27") } },
  "1200-1500m RTD": { name: "1200-1500m RTD", recommended: L(3.0, 221.8, "10:22"), version: "1.0", roastLevels: [208.4, 215.4, 217.6, 221.8, 222.9, 227.8, 241], family: "altitude", levels: { filter: L(2.2, 218.4, "9:39"), espresso: L(3.0, 221.8, "10:22"), dark: L(4.6, 225.8, "11:13") } },
  "1200-1500m Rest": { name: "1200-1500m Rest", recommended: L(3.0, 226.0, "9:52"), version: "1.0", roastLevels: [205, 216.5, 218.2, 226, 228, 232.9, 241], family: "altitude", restDays: REST, levels: { filter: L(2.2, 219.8, "8:55"), espresso: L(3.0, 226.0, "9:52"), dark: L(4.6, 230.9, "10:36") } },
  "1500-2000m RTD": { name: "1500-2000m RTD", recommended: L(3.1, 219.3, "10:19"), version: "1.0", roastLevels: [204, 209, 214, 219, 222, 224, 226], family: "altitude", levels: { filter: L(2.4, 216.0, "9:32"), espresso: L(3.1, 219.3, "10:19"), dark: L(4.3, 222.6, "11:10") } },
  "1500-2000m Rest": { name: "1500-2000m Rest", recommended: L(3.2, 222.4, "9:17"), version: "1.0", roastLevels: [205, 217, 218.2, 222.1, 223.5, 228.2, 241], family: "altitude", restDays: REST, levels: { filter: L(2.5, 220.1, "8:41"), espresso: L(3.2, 222.4, "9:17"), dark: L(4.3, 224.9, "9:59") } },
  "2000-2700m RTD": { name: "2000-2700m RTD", recommended: L(3.2, 219.6, "10:24"), version: "1.0", roastLevels: [204, 209, 214, 219, 222, 224, 226], family: "altitude", levels: { filter: L(2.5, 216.5, "9:36"), espresso: L(3.2, 219.6, "10:24"), dark: L(4.5, 223.0, "11:16") } },
  "2000-2700m Rest": { name: "2000-2700m Rest", recommended: L(3.2, 220.1, "8:40"), version: "1.0", roastLevels: [205, 216.1, 217.1, 219.9, 221, 225, 241], family: "altitude", restDays: REST, levels: { filter: L(2.0, 217.1, "7:55"), espresso: L(3.2, 220.1, "8:40"), dark: L(4.6, 223.4, "9:34") } },
  "KL Washed": {
    name: "KL Washed",
    recommended: L(0.8, 214.4, "6:34"),
    version: "1.1", roastLevels: [205.8, 216.5, 222, 224.5, 226.5, 228.5, 230.5], expectFirstCrack: 209, family: "process",
    levels: { cupping: L(0.8, 214.4, "6:34"), filter: L(1.0, 216.5, "6:55"), espresso: L(1.2, 217.6, "7:06") },
    developmentTarget: { cupping: [10, 15.5], filter: [10, 18], espresso: [15.5, 26] },
    riseAfterCrack: { cupping: [5, 7], filter: [5, 8.5], espresso: [7, 12] },
  },
  "KL Natural": {
    name: "KL Natural",
    recommended: L(1.4, 218.7, "8:55"),
    version: "1.1", roastLevels: [205.8, 216.5, 222, 224.5, 226.5, 228.5, 230.5], expectFirstCrack: 212.8, family: "process",
    levels: { cupping: L(0.8, 214.4, "7:46"), filter: L(1.0, 216.5, "8:17"), espresso: L(1.3, 218.2, "8:44") },
    developmentTarget: { cupping: [13, 16.5], filter: [10, 20], espresso: [20, 30] },
    riseAfterCrack: { cupping: [5, 6], filter: [5, 7.5], espresso: [7, 10] },
  },
  // No longer picked by selectStartingProfile (only the removed "just tasting" goal led here). It stays selectable
  // in the stored seed (db/002) so the table of stock profiles is unchanged.
  Cupping: { name: "Cupping", recommended: L(2.0, 212.0, "8:20"), version: "1.0", roastLevels: [204.5, 209, 212, 214, 215.3, 216.8, 241], family: "special", levels: { cupping: L(2.0, 212.0, "8:20") }, developmentTarget: { cupping: [18, 19] } },
  Decaf: {
    name: "Decaf",
    recommended: L(3.0, 221.3, "8:59"),
    version: "1.0", roastLevels: [211, 217.1, 218.5, 221.3, 222.5, 224, 241], family: "special",
    levels: { filter: L(2.1, 218.8, "8:21"), espresso: L(3.0, 221.3, "8:59"), dark: L(4.0, 222.5, "9:19") },
    developmentTarget: { filter: [19.8, 19.8], espresso: [25, 25], dark: [28, 28] },
  },
  Robusta: {
    name: "Robusta",
    recommended: L(3.0, 223.4, "10:36"),
    version: "1.0", roastLevels: [208.4, 215.4, 219.3, 223.4, 224.4, 227.8, 241], family: "special",
    levels: { filter: L(2.2, 220.1, "9:47"), espresso: L(3.0, 223.4, "10:36"), dark: L(4.8, 227.1, "11:28") },
    developmentTarget: { filter: [25, 27], espresso: [25, 27], dark: [25, 27] },
  },
  // Same curve and levels as Robusta with a higher fan; offered when beans are chaffy.
  Robusta_inc_fan: {
    name: "Robusta_inc_fan",
    recommended: L(3.0, 223.4, "10:36"),
    version: "1a",
    roastLevels: [208.4, 215.4, 219.3, 223.4, 224.4, 227.8, 241],
    family: "special",
    selectable: false,
    levels: { filter: L(2.2, 220.1, "9:47"), espresso: L(3.0, 223.4, "10:36"), dark: L(4.8, 227.1, "11:28") },
    developmentTarget: { filter: [25, 27], espresso: [25, 27], dark: [25, 27] },
  },
  // The Nano's original built-in profile; kept so its logs are recognised.
  "K-logic classic": {
    name: "K-logic classic",
    recommended: L(3.3, 228.2, "9:57"),
    roastLevels: [205, 215, 222, 227, 231, 235, 241],
    expectFirstCrack: 209,
    family: "legacy",
    selectable: false,
    levels: { espresso: L(3.3, 228.2, "9:57") },
  },
};

/** A level worked out from an Agtron colour. When the profile's curve reaches its end temperature is read off the profile's file by whoever has it (scripts/roast.ts). */
export interface StartingLevel {
  level: number;
  /** End temperature for this level, °C. */
  endTemp: number;
  colour: {
    agtron: number;
    /** From the roaster's own readings on the profile, or from the profile's labelled levels until there are enough. */
    basis: "readings" | "approximation";
    readings: number;
    /** Set when the profile's lightest or darkest level is as near as it gets. */
    reach?: "lightest" | "darkest";
  };
}

export interface StartingProfile {
  profile: StockProfile;
  level: StartingLevel;
  /** The other stock profile the rules suggest if changing the level stops helping. */
  alternative?: string;
  /** Plain-language reasons, shown to the user. */
  why: string[];
}

/** A colour-meter reading from one of the roaster's roasts: the stock profile, the end temperature it ended at, and its Agtron number. */
export interface ColourReading {
  profile: string;
  endTempC: number;
  agtron: number;
}

export function altitudeBand(m: number | undefined): "0-1200m" | "1200-1500m" | "1500-2000m" | "2000-2700m" {
  if (m === undefined) return "1500-2000m";
  if (m < 1200) return "0-1200m";
  if (m < 1500) return "1200-1500m";
  if (m < 2000) return "1500-2000m";
  return "2000-2700m";
}

/**
 * The Agtron assumed for the levels Kaffelogic labels, until the roaster's own readings say otherwise. The basis: the
 * Robusta profile's file calls its filter-labelled level "Light/Medium", its espresso-labelled one "Medium" (its default
 * roast) and its dark-labelled one "Medium Dark", and those are the SCA tiles 65, 55 and 45. The other profiles are
 * assumed to name their levels alike. This is not measured, and the answer says so.
 */
export const LABELLED_LEVEL_AGTRON: Partial<Record<Goal, number>> = { filter: 65, espresso: 55, dark: 45 };

/** How a profile's end temperature relates to Agtron for this roaster, and where that came from; undefined when the profile has none. */
interface ColourScale {
  /** The end temperature, °C, that an Agtron number is placed at. */
  endTempFor: (agtron: number) => number;
  basis: "readings" | "approximation";
  readings: number;
}

function colourScale(profile: StockProfile, readings: readonly ColourReading[]): ColourScale | undefined {
  const own = fitColourLine(readings.filter((r) => r.profile === profile.name));
  if (own) return { endTempFor: (agtron) => endTempForAgtron(own, agtron), basis: "readings", readings: own.readings };
  // Through the profile's labelled levels, exactly at each of them, and along the nearest stretch beyond them.
  const anchors = Object.entries(LABELLED_LEVEL_AGTRON)
    .flatMap(([label, agtron]) => {
      const level = profile.levels[label as Goal];
      return level ? [{ endTempC: level.endTemp, agtron: agtron! }] : [];
    })
    .sort((x, y) => y.agtron - x.agtron);
  if (anchors.length < 2 || anchors.some((anchor, i) => i > 0 && anchor.endTempC <= anchors[i - 1].endTempC)) return undefined;
  return {
    endTempFor: (agtron) => {
      // The stretch between two anchors that holds the number, or the lightest or darkest stretch when it lies beyond them.
      const lighter = anchors.findIndex((anchor) => agtron >= anchor.agtron);
      const i = lighter === -1 ? anchors.length - 2 : Math.min(Math.max(lighter - 1, 0), anchors.length - 2);
      const [from, to] = [anchors[i], anchors[i + 1]];
      return from.endTempC + ((agtron - from.agtron) * (to.endTempC - from.endTempC)) / (to.agtron - from.agtron);
    },
    basis: "approximation",
    readings: 0,
  };
}

/** The profile's level nearest an end temperature, on its 0.1 grid; the lightest or darkest level when the temperature is beyond them. */
function levelNearEndTemp(roastLevels: number[], endTempC: number): { level: number; reach?: "lightest" | "darkest" } {
  const last = roastLevels.length - 1;
  if (endTempC <= levelToTemp(roastLevels, 0)!) return { level: 0, reach: "lightest" };
  if (endTempC >= levelToTemp(roastLevels, last)!) return { level: last, reach: "darkest" };
  let best = 0;
  let gap = Infinity;
  for (let tenth = 0; tenth <= last * 10; tenth++) {
    const diff = Math.abs(levelToTemp(roastLevels, tenth / 10)! - endTempC);
    if (diff < gap - 1e-9) {
      best = tenth / 10;
      gap = diff;
    }
  }
  return { level: best };
}

/**
 * The level on a profile for an Agtron target, from the roaster's readings on that profile when they give a line, else
 * from the profile's labelled levels. Undefined when the profile cannot give one: it has no line, or its file labels no dark
 * level (the KL profiles) and the target is darker than the darkest level it does label, so the placement would
 * extrapolate beyond the file, whatever readings there are.
 */
export function levelForAgtron(profile: StockProfile, agtron: number, readings: readonly ColourReading[] = []): StartingLevel | undefined {
  const scale = colourScale(profile, readings);
  if (!scale) return undefined;
  const darkestLabelled = Math.min(...Object.entries(LABELLED_LEVEL_AGTRON).filter(([label]) => profile.levels[label as Goal]).map(([, value]) => value!));
  if (!profile.levels.dark && agtron < darkestLabelled) return undefined;
  const { level, reach } = levelNearEndTemp(profile.roastLevels, scale.endTempFor(agtron));
  const endTemp = Math.round(levelToTemp(profile.roastLevels, level)! * 10) / 10;
  return { level, endTemp, colour: { agtron, basis: scale.basis, readings: scale.readings, ...(reach ? { reach } : {}) } };
}

/** The reasons a level was placed for an Agtron target, in plain words: the colour, what the placement rests on, and that the cup decides the steps after it. */
export function colourReasons(colour: StartingLevel["colour"]): string[] {
  const shot = `You are shooting for Agtron ${colour.agtron} (${agtronName(colour.agtron)}).`;
  return [
    colour.basis === "readings"
      ? `${shot} Your ${colour.readings} colour readings on this profile place that at this level.`
      : `${shot} The profile's file gives no Agtron, so this level is an approximation from its own labelled levels, and colour readings from your roasts on this profile replace it.`,
    ...(colour.reach ? [`The ${colour.reach} level this profile has is as near to Agtron ${colour.agtron} as it gets.`] : []),
    "The defects in the cup decide each step after the first roast.",
  ];
}

/** The level on a stock profile for an Agtron colour the roaster names, or the plain reason there is none. */
export type Placement = { ok: true; profile: StockProfile; level: StartingLevel; why: string[] } | { ok: false; problem: string };

export function placeColour(profileName: string, agtron: number, readings: readonly ColourReading[] = []): Placement {
  const profile = stockProfile(profileName);
  if (!profile || profile.selectable === false) {
    return { ok: false, problem: `"${profileName}" is not a stock profile a level can be placed on. Name the stock profile the bean's profile is built on (for example Robusta or 1500-2000m RTD).` };
  }
  if (!(agtron >= AGTRON_MIN && agtron <= AGTRON_MAX)) return { ok: false, problem: `Agtron must be between ${AGTRON_MIN} and ${AGTRON_MAX}; got ${agtron}.` };
  if (Object.keys(LABELLED_LEVEL_AGTRON).filter((label) => profile.levels[label as Goal]).length < 2) {
    return { ok: false, problem: `${profile.name} labels too few levels to place a colour on. Name a stock profile a bean starts on.` };
  }
  const level = levelForAgtron(profile, agtron, readings);
  if (!level) return { ok: false, problem: `${profile.name} names no level as dark as Agtron ${agtron}. A bean that dark starts on an altitude profile, which does.` };
  return { ok: true, profile, level, why: colourReasons(level.colour) };
}

/** What to tell the roaster about a placement: the reasons, the level and its end temperature (and when the curve gets there, when known), and the offer to record it. */
export function placementSay(placed: Extract<Placement, { ok: true }>, endsAt?: string): string {
  const { level, endTemp } = placed.level;
  return `${placed.why.join(" ")} On ${placed.profile.name}, try level ${level}: it ends at ${endTemp} °C${endsAt ? `, reached at ${endsAt}` : ""}. Shall I record that as the next version, with your own words as the reason?`;
}

/**
 * Deterministic first pick. Order matters: species and decaf override everything, then process, then altitude.
 * The roast colour being shot for picks the level on the chosen profile, and nothing else; how the bean will be brewed is
 * not used. `readings` are the roaster's colour-meter readings on their earlier roasts, which tune the level.
 */
export function selectStartingProfile(intake: Intake, readings: readonly ColourReading[] = []): StartingProfile {
  const why: string[] = [];
  const timing = intake.drinkWhen === "rest" ? "Rest" : "RTD";
  const altName = `${altitudeBand(intake.altitudeM)} ${timing}`;
  const target = intake.agtronTarget;
  const pick = (name: string, alternative?: string): StartingProfile => {
    const profile = STOCK_PROFILES[name];
    const found = levelForAgtron(profile, target, readings);
    // The process profiles that cannot place a target were handed on to the altitude profiles below; every other selectable profile can place every target (tested).
    if (!found) throw new Error(`${profile.name} has no level for Agtron ${target}.`);
    why.push(...colourReasons(found.colour));
    return { profile, level: found, alternative, why };
  };

  if (intake.species === "robusta") {
    why.push("Robusta has its own stock profile, so this uses it.");
    if (intake.chaffy) why.push("If chaff builds up, the stock 'Robusta_inc_fan' variant runs the fan harder.");
    return pick("Robusta");
  }
  if (intake.decaf) {
    why.push("Decaf has its own stock profile, so this uses it.");
    return pick("Decaf");
  }
  if (intake.process === "washed" || intake.process === "natural") {
    const name = intake.process === "washed" ? "KL Washed" : "KL Natural";
    // A profile whose file names no level as dark as the target cannot start it there; the altitude profile can.
    if (!levelForAgtron(STOCK_PROFILES[name], target, readings)) {
      why.push(`${name} is written for ${intake.process} coffees, but its file names no level as dark as Agtron ${target}, so this uses ${altName}, which does.`);
      return pick(altName);
    }
    why.push(`${name} is written for ${intake.process} coffees.`);
    return pick(name, altName);
  }
  why.push(
    intake.altitudeM === undefined
      ? "Altitude unknown, so this uses the 1500-2000m band."
      : `Grown at ${intake.altitudeM} m, so the ${altitudeBand(intake.altitudeM)} band.`,
  );
  why.push(timing === "Rest" ? `Rest profiles assume ${REST[0]} to ${REST[1]} days of resting before brewing.` : "RTD (ready to drink) profiles are built to drink within a day or two.");
  return pick(altName);
}

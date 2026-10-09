// Which stock Nano 7 profile and level to start a new bean on.
//
// Numbers are facts read from the stock profile files (levels, end temperatures,
// the light/medium/dark levels each profile suggests, development targets where a
// profile states one). End temperatures come from levelToTemp; "ends at" is when
// the profile curve reaches that temperature. We refer to profiles by name only;
// the files themselves stay on the user's machine.
import type { Intake } from "../../core/intake.js";

/** Kaffelogic's labels for the levels a profile suggests. The tool does not choose a level by them. */
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
   * The level the profile's own file recommends (its recommended_level), where a bean starts on it. It names no
   * brew: roasting is not aimed at a brew method, and the ladder of roasts finds the bean's own level from here.
   */
  recommended: StockLevel;
  /** End temperature for levels 0..6, °C. */
  roastLevels: number[];
  /** First-crack temperature the profile expects, °C, when it states one. */
  expectFirstCrack?: number;
  /** False for stock profiles we know about but never pick as a starting point. */
  selectable?: boolean;
  /** The levels Kaffelogic labels by use. Kept as reference data; no choice of level reads these labels. */
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

export interface StartingProfile {
  profile: StockProfile;
  level: StockLevel;
  /** The other stock profile the rules suggest if changing the level stops helping. */
  alternative?: string;
  /** Plain-language reasons, shown to the user. */
  why: string[];
}

export function altitudeBand(m: number | undefined): "0-1200m" | "1200-1500m" | "1500-2000m" | "2000-2700m" {
  if (m === undefined) return "1500-2000m";
  if (m < 1200) return "0-1200m";
  if (m < 1500) return "1200-1500m";
  if (m < 2000) return "1500-2000m";
  return "2000-2700m";
}

/** The level a bean starts at on a profile: the one the profile's own file recommends. */
export const startingLevel = (profile: StockProfile): StockLevel => profile.recommended;

/**
 * Deterministic first pick. Order matters: species and decaf override everything, then process, then altitude.
 * Nothing about how the bean will be brewed is asked or used.
 */
export function selectStartingProfile(intake: Intake): StartingProfile {
  const why: string[] = [];
  const timing = intake.drinkWhen === "rest" ? "Rest" : "RTD";
  const altName = `${altitudeBand(intake.altitudeM)} ${timing}`;
  const pick = (name: string, alternative?: string): StartingProfile => {
    const profile = STOCK_PROFILES[name];
    why.push("It starts at the level the profile's own file recommends.");
    return { profile, level: startingLevel(profile), alternative, why };
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

// Which stock Nano 7 profile and level to start a new bean on.
//
// Numbers are facts read from the stock profile files (levels, end temperatures,
// the light/medium/dark levels each profile suggests, development targets where a
// profile states one). End temperatures come from levelToTemp; "ends at" is when
// the profile curve reaches that temperature. We refer to profiles by name only;
// the files themselves stay on the user's machine.
import type { Intake } from "../../core/intake.js";

export type Goal = "filter" | "espresso" | "dark" | "cupping";

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
  family: "altitude" | "process" | "special";
  levels: Partial<Record<Goal, StockLevel>>;
  /** Development % the profile itself says to aim for, when it says. */
  developmentTarget?: Partial<Record<Goal, [number, number]>>;
  /** Temperature rise after first crack the profile says to aim for, °C, when it says. */
  riseAfterCrack?: Partial<Record<Goal, [number, number]>>;
}

const L = (level: number, endTemp: number, endsAt: string): StockLevel => ({ level, endTemp, endsAt });

export const STOCK_PROFILES: Record<string, StockProfile> = {
  "0-1200m RTD": { name: "0-1200m RTD", family: "altitude", levels: { filter: L(2.2, 218.3, "9:31"), espresso: L(3.0, 221.0, "10:07"), dark: L(4.6, 225.6, "11:10") } },
  "0-1200m Rest": { name: "0-1200m Rest", family: "altitude", levels: { filter: L(2.2, 221.2, "11:31"), espresso: L(3.0, 227.8, "12:27"), dark: L(5.0, 235.0, "13:27") } },
  "1200-1500m RTD": { name: "1200-1500m RTD", family: "altitude", levels: { filter: L(2.2, 218.4, "9:39"), espresso: L(3.0, 221.8, "10:22"), dark: L(4.6, 225.8, "11:13") } },
  "1200-1500m Rest": { name: "1200-1500m Rest", family: "altitude", levels: { filter: L(2.2, 219.8, "8:55"), espresso: L(3.0, 226.0, "9:52"), dark: L(4.6, 230.9, "10:36") } },
  "1500-2000m RTD": { name: "1500-2000m RTD", family: "altitude", levels: { filter: L(2.4, 216.0, "9:32"), espresso: L(3.1, 219.3, "10:19"), dark: L(4.3, 222.6, "11:10") } },
  "1500-2000m Rest": { name: "1500-2000m Rest", family: "altitude", levels: { filter: L(2.5, 220.1, "8:41"), espresso: L(3.2, 222.4, "9:17"), dark: L(4.3, 224.9, "9:59") } },
  "2000-2700m RTD": { name: "2000-2700m RTD", family: "altitude", levels: { filter: L(2.5, 216.5, "9:36"), espresso: L(3.2, 219.6, "10:24"), dark: L(4.5, 223.0, "11:16") } },
  "2000-2700m Rest": { name: "2000-2700m Rest", family: "altitude", levels: { filter: L(2.0, 217.1, "7:55"), espresso: L(3.2, 220.1, "8:40"), dark: L(4.6, 223.4, "9:34") } },
  "KL Washed": {
    name: "KL Washed",
    family: "process",
    levels: { cupping: L(0.8, 214.4, "6:34"), filter: L(1.0, 216.5, "6:55"), espresso: L(1.2, 217.6, "7:06") },
    developmentTarget: { cupping: [10, 15.5], filter: [10, 18], espresso: [15.5, 26] },
    riseAfterCrack: { cupping: [5, 7], filter: [5, 8.5], espresso: [7, 12] },
  },
  "KL Natural": {
    name: "KL Natural",
    family: "process",
    levels: { cupping: L(0.8, 214.4, "7:46"), filter: L(1.0, 216.5, "8:17"), espresso: L(1.3, 218.2, "8:44") },
    developmentTarget: { cupping: [13, 16.5], filter: [10, 20], espresso: [20, 30] },
    riseAfterCrack: { cupping: [5, 6], filter: [5, 7.5], espresso: [7, 10] },
  },
  Cupping: { name: "Cupping", family: "special", levels: { cupping: L(2.0, 212.0, "8:20") }, developmentTarget: { cupping: [18, 19] } },
  Decaf: {
    name: "Decaf",
    family: "special",
    levels: { filter: L(2.1, 218.8, "8:21"), espresso: L(3.0, 221.3, "8:59"), dark: L(4.0, 222.5, "9:19") },
    developmentTarget: { filter: [19.8, 19.8], espresso: [25, 25], dark: [28, 28] },
  },
  Robusta: {
    name: "Robusta",
    family: "special",
    levels: { filter: L(2.2, 220.1, "9:47"), espresso: L(3.0, 223.4, "10:36"), dark: L(4.8, 227.1, "11:28") },
    developmentTarget: { filter: [25, 27], espresso: [25, 27], dark: [25, 27] },
  },
};

export interface StartingProfile {
  profile: StockProfile;
  goal: Goal;
  level: StockLevel;
  /** A second profile worth trying if the first result disappoints. */
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

/**
 * Deterministic first pick. Order matters: species and decaf override everything,
 * an explicit cupping goal comes next, then process, then altitude.
 */
export function selectStartingProfile(intake: Intake): StartingProfile {
  const why: string[] = [];
  const goal: Goal = intake.goal === "both" ? "espresso" : intake.goal;
  if (intake.goal === "both") why.push("For filter and espresso, start at the espresso level; go lighter next time if filter tastes flat.");
  const timing = intake.drinkWhen === "rest" ? "Rest" : "RTD";
  const altName = `${altitudeBand(intake.altitudeM)} ${timing}`;
  const pick = (name: string, g: Goal, alternative?: string): StartingProfile => {
    const profile = STOCK_PROFILES[name];
    const level = profile.levels[g] ?? profile.levels.espresso ?? Object.values(profile.levels)[0]!;
    if (!profile.levels[g]) why.push(`${name} has no suggested ${g} level, so this uses its ${level === profile.levels.espresso ? "espresso" : "default"} level.`);
    return { profile, goal: g, level, alternative, why };
  };

  if (intake.species === "robusta") {
    why.push("Robusta roasts differently from arabica and has its own profile.");
    if (intake.chaffy) why.push("If chaff builds up, the stock 'Robusta_inc_fan' variant runs the fan harder.");
    return pick("Robusta", goal === "cupping" ? "espresso" : goal);
  }
  if (intake.decaf) {
    why.push("Decaf beans start darker and take heat differently, so they get their own profile.");
    return pick("Decaf", goal === "cupping" ? "filter" : goal);
  }
  if (goal === "cupping") {
    why.push("Cupping roasts are for judging a new bean before choosing how to roast it.");
    if (intake.process === "washed" || intake.process === "natural") {
      const name = intake.process === "washed" ? "KL Washed" : "KL Natural";
      return pick(name, "cupping", "Cupping");
    }
    return pick("Cupping", "cupping");
  }
  if ((intake.process === "washed" || intake.process === "natural") && goal === "filter") {
    const name = intake.process === "washed" ? "KL Washed" : "KL Natural";
    why.push(`${name} is written for ${intake.process} coffees and gives explicit filter targets.`);
    return pick(name, "filter", altName);
  }
  why.push(
    intake.altitudeM === undefined
      ? "Altitude unknown, so this uses the 1500-2000m band, where most specialty arabica grows."
      : `Grown at ${intake.altitudeM} m, so the ${altitudeBand(intake.altitudeM)} band.`,
  );
  why.push(timing === "Rest" ? "Rest profiles assume 3 to 5 days of resting before brewing." : "RTD profiles are built to drink within a day or two.");
  const processAlt =
    intake.process === "washed" ? "KL Washed" : intake.process === "natural" ? "KL Natural" : undefined;
  return pick(altName, goal, processAlt);
}

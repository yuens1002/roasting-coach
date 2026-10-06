// Machine-independent roast model. Adapters (Kaffelogic today, Kaleido later)
// turn their native files into a RoastLog; everything downstream (features,
// rules, advice) only ever sees these types.

/** One sample of the roast, time in seconds from charge, temperatures in °C. */
export interface RoastSample {
  t: number;
  /** The machine's main bean/probe temperature reading. */
  beanTemp: number;
  /** Where the profile wanted the temperature to be at this time, if the machine follows a profile. */
  targetTemp?: number;
  /** Rate of rise as the machine reported it, °C/min. Not all machines log this. */
  machineRor?: number;
  /** Heater power, kW or %, machine specific; only compared within one machine. */
  power?: number;
  fan?: number;
}

export type RoastEventName = "colour_change" | "first_crack" | "second_crack" | "roast_end";

export interface RoastEvent {
  name: RoastEventName;
  t: number;
  /** Who decided the time: the roaster pressed a button, the machine detected it, or we inferred it. */
  source: "user" | "machine" | "inferred";
}

export interface RoastLog {
  machine: string; // e.g. "kaffelogic-nano7"
  profileName?: string;
  roastDate?: string; // ISO 8601
  ambientTemp?: number;
  batchGrams?: number;
  /** Machine-native roast level setting, kept for display and for profile versioning. */
  nativeLevel?: number;
  /** End temperature the machine was aiming for, derived from the native level. */
  targetEndTemp?: number;
  samples: RoastSample[];
  events: RoastEvent[];
  /** Values the machine computed itself, kept so we can cross-check our own numbers. */
  machineReported?: { developmentPercent?: number };
}

export type RorShape =
  | "declining" // steady fall after the turning point: the textbook shape
  | "crash" // a sharp drop shortly after first crack
  | "flick" // falls, then rises again before the end
  | "flat" // stalls near zero for a long stretch
  | "unknown";

export interface PhaseTimes {
  drying?: number; // charge to colour change, s
  maillard?: number; // colour change to first crack, s
  development?: number; // first crack to end, s
}

export interface RoastFeatures {
  totalTime: number;
  dropTemp: number;
  colourChange?: { t: number; temp: number };
  firstCrack?: { t: number; temp: number };
  phases: PhaseTimes;
  /** Development time as % of total time. */
  developmentRatio?: number;
  /** Temperature gained between first crack and the end, °C. */
  developmentDeltaT?: number;
  /** Time to fixed temperatures; works even when no events were marked. */
  timeToTemp: Record<number, number | undefined>;
  ror: {
    atFirstCrack?: number;
    atEnd: number;
    peak: number;
    peakT: number;
    /** Mean RoR over the minute after first crack minus the minute before. */
    dropAfterFirstCrack?: number;
    shape: RorShape;
    /** RoR sampled every 30 s, for charts and for comparing versions. */
    series: { t: number; ror: number }[];
  };
  /** How closely the machine followed the profile: mean |bean - target| from 60 s to the end. */
  profileTracking?: { meanAbsError: number; maxAbsError: number };
  /**
   * How far the heat-driven chemistry went, as minutes at a constant 200 °C that would do the same
   * (see THERMAL_DOSE in features.ts). Doesn't depend on button presses; compare roasts on one
   * machine, not across machines.
   */
  thermalDose: number;
  /** Plain-language warnings about the data itself, for example a likely mis-pressed button. */
  dataWarnings: string[];
}

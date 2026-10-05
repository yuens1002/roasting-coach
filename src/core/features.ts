import type { RoastEventName, RoastFeatures, RoastLog, RoastSample, RorShape } from "./types.js";

// Thresholds are first guesses to be tuned against real roasts and tasting
// results; they live here so the rules and tests can see them.
export const THRESHOLDS = {
  rorWindowSeconds: 30,
  lateRorWindowSeconds: 60,
  colourChangeTempRange: [140, 190] as const,
  firstCrackTempRange: [185, 220] as const,
  minMaillardSeconds: 60,
  /** RoR in the minute after first crack below this fraction of the minute before = crash. */
  crashRatio: 0.5,
  /** RoR rising this much (°C/min) from its post-crack low before the end = flick. */
  flickRise: 1.5,
  flickSeconds: 90,
  /** RoR under this (°C/min) for flatSeconds before the end = flat/stalled. */
  flatRor: 1,
  flatSeconds: 60,
  timeToTemps: [100, 150, 170, 190, 200] as const,
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.NaN);

function eventTime(log: RoastLog, name: RoastEventName): number | undefined {
  return log.events.find((e) => e.name === name)?.t;
}

/** Linear interpolation of bean temperature at time t. */
export function tempAt(samples: RoastSample[], t: number): number {
  if (t <= samples[0].t) return samples[0].beanTemp;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    if (t <= b.t) return a.beanTemp + ((t - a.t) / (b.t - a.t)) * (b.beanTemp - a.beanTemp);
  }
  return samples[samples.length - 1].beanTemp;
}

/**
 * Rate of rise in °C/min from our own least-squares slope over a centred window,
 * so every machine is measured the same way whatever it logs itself.
 */
export function rorAt(samples: RoastSample[], t: number, window = THRESHOLDS.rorWindowSeconds): number {
  const pts = samples.filter((s) => Math.abs(s.t - t) <= window / 2);
  if (pts.length < 3) return Number.NaN;
  const mt = mean(pts.map((p) => p.t)), mv = mean(pts.map((p) => p.beanTemp));
  let num = 0, den = 0;
  for (const p of pts) {
    num += (p.t - mt) * (p.beanTemp - mv);
    den += (p.t - mt) ** 2;
  }
  return den === 0 ? Number.NaN : (num / den) * 60;
}

function meanRor(samples: RoastSample[], from: number, to: number): number {
  const vals: number[] = [];
  for (let t = from; t <= to; t += 5) {
    const r = rorAt(samples, t);
    if (Number.isFinite(r)) vals.push(r);
  }
  return mean(vals);
}

function classifyRor(samples: RoastSample[], fc: number | undefined, end: number): { shape: RorShape; drop?: number } {
  if (fc === undefined || end - fc < 30) return { shape: "unknown" };
  const before = meanRor(samples, Math.max(fc - 60, 0), fc);
  const after = meanRor(samples, fc, Math.min(fc + 60, end));
  const drop = after - before;

  // Stall: RoR under flatRor for the last flatSeconds.
  const tail = meanRor(samples, end - THRESHOLDS.flatSeconds, end);
  if (tail < THRESHOLDS.flatRor) return { shape: "flat", drop };

  if (before > 0 && after / before < THRESHOLDS.crashRatio) return { shape: "crash", drop };

  // Flick: RoR climbs again in the last flickSeconds. A bump earlier in development
  // (the Nano's zone boosts cause these) is not a flick. Stop half a window before
  // the end, where the slope would come from a one-sided window. Late-roast RoR is
  // small next to the probe's 0.25 °C steps, so this uses a wider window.
  const w = THRESHOLDS.lateRorWindowSeconds;
  let low = Number.POSITIVE_INFINITY, rise = 0;
  for (let t = Math.max(fc, end - THRESHOLDS.flickSeconds); t <= end - w / 2; t += 5) {
    const r = rorAt(samples, t, w);
    if (!Number.isFinite(r)) continue;
    low = Math.min(low, r);
    rise = Math.max(rise, r - low);
  }
  if (rise >= THRESHOLDS.flickRise) return { shape: "flick", drop };
  return { shape: "declining", drop };
}

export function extractFeatures(log: RoastLog): RoastFeatures {
  const warnings: string[] = [];
  const endMarker = eventTime(log, "roast_end");
  const all = log.samples.filter((s) => Number.isFinite(s.beanTemp));
  if (all.length < 10) throw new Error("too few samples to analyse");
  const end = endMarker ?? all[all.length - 1].t;
  if (endMarker === undefined) warnings.push("No roast end marker; using the last sample as the end.");
  // Everything below is about the roast itself, not the cooling that follows.
  const samples = all.filter((s) => s.t <= end + 0.5);

  const pick = (name: RoastEventName) => {
    const t = eventTime(log, name);
    if (t === undefined) return undefined;
    if (t > end) {
      warnings.push(`${name} is marked after the roast ended, so it was ignored.`);
      return undefined;
    }
    return { t, temp: tempAt(samples, t) };
  };
  let cc = pick("colour_change");
  const fc = pick("first_crack");

  if (cc) {
    const [lo, hi] = THRESHOLDS.colourChangeTempRange;
    if (cc.temp < lo || cc.temp > hi) {
      warnings.push(
        `Colour change is marked at ${cc.temp.toFixed(1)} °C, outside the usual ${lo}–${hi} °C, so it was probably pressed by mistake. Drying and Maillard times are left out.`,
      );
      cc = undefined;
    } else if (fc && fc.t - cc.t < THRESHOLDS.minMaillardSeconds) {
      warnings.push(`Colour change is only ${Math.round(fc.t - cc.t)} s before first crack, which is too close to be real. It was ignored.`);
      cc = undefined;
    }
  }
  if (fc) {
    const [lo, hi] = THRESHOLDS.firstCrackTempRange;
    if (fc.temp < lo || fc.temp > hi) {
      warnings.push(`First crack is marked at ${fc.temp.toFixed(1)} °C, outside the usual ${lo}–${hi} °C on this probe. Check the button press.`);
    }
  } else {
    warnings.push("First crack was not marked, so development time can't be measured.");
  }

  const developmentRatio = fc ? ((end - fc.t) / end) * 100 : undefined;
  const reported = log.machineReported?.developmentPercent;
  if (developmentRatio !== undefined && reported !== undefined && Math.abs(reported - developmentRatio) > 1) {
    warnings.push(`Our development ratio (${developmentRatio.toFixed(1)}%) differs from the machine's (${reported.toFixed(1)}%).`);
  }

  const timeToTemp: Record<number, number | undefined> = {};
  for (const target of THRESHOLDS.timeToTemps) timeToTemp[target] = samples.find((s) => s.beanTemp >= target)?.t;

  const series: { t: number; ror: number }[] = [];
  for (let t = 30; t <= end; t += 30) series.push({ t, ror: rorAt(samples, t) });
  let peak = Number.NEGATIVE_INFINITY, peakT = 0;
  // Ignore the first two minutes: the Nano starts from cold, so early RoR mostly
  // reflects the heater warming up, not the beans.
  for (let t = 120; t <= end; t += 5) {
    const r = rorAt(samples, t);
    if (r > peak) {
      peak = r;
      peakT = t;
    }
  }
  const { shape, drop } = classifyRor(samples, fc?.t, end);

  let profileTracking: RoastFeatures["profileTracking"];
  const tracked = samples.filter((s) => s.t >= 60 && s.targetTemp !== undefined && Number.isFinite(s.targetTemp));
  if (tracked.length) {
    const errs = tracked.map((s) => Math.abs(s.beanTemp - (s.targetTemp as number)));
    profileTracking = { meanAbsError: mean(errs), maxAbsError: Math.max(...errs) };
  }

  const dropTemp = tempAt(samples, end);
  return {
    totalTime: end,
    dropTemp,
    colourChange: cc,
    firstCrack: fc,
    phases: {
      drying: cc?.t,
      maillard: cc && fc ? fc.t - cc.t : undefined,
      development: fc ? end - fc.t : undefined,
    },
    developmentRatio,
    developmentDeltaT: fc ? dropTemp - fc.temp : undefined,
    timeToTemp,
    ror: {
      atFirstCrack: fc ? rorAt(samples, fc.t) : undefined,
      atEnd: rorAt(samples, end - THRESHOLDS.lateRorWindowSeconds / 2, THRESHOLDS.lateRorWindowSeconds),
      peak,
      peakT,
      dropAfterFirstCrack: drop,
      shape,
      series,
    },
    profileTracking,
    dataWarnings: warnings,
  };
}

// How far the thermal dose can be trusted on real Kaffelogic logs: repeatability, the activation energy, a probe offset, and what
// the thermal dose adds to end temperature and time. Reads every .klog under KAFFELOGIC_DIR (default profiles/); reads only, writes
// nothing, and no log is copied anywhere. Needs no roasted weight, bean name or tasting: only the temperature trace and the profile the log carries.
// Usage: KAFFELOGIC_DIR=<folder of logs> npm run research:sensitivity
import { createHash } from "node:crypto";
import { parseKlog } from "../src/adapters/kaffelogic/parse.js";
import { developmentOvershoot } from "../src/adapters/kaffelogic/runStats.js";
import { profileThermalDoseAtLevel } from "../src/adapters/kaffelogic/thermalDose.js";
import { kaffelogicToRoastLog } from "../src/adapters/kaffelogic/toRoastLog.js";
import { THERMAL_DOSE, extractFeatures, thermalDose } from "../src/core/features.js";
import { loadLibrary } from "./library.js";

type Point = { t: number; temp: number };
interface Run {
  name: string;
  profile: string;
  /** Hash of the profile's curve and levels: two logs with the same key were roasted on the same profile body. */
  profileBody: string;
  level?: number;
  loadGrams?: number;
  minutes: number;
  dropTemp: number;
  beanTrace: Point[];
  /** The temperature the profile asked for, second by second, as the log records it. */
  requestedTrace: Point[];
  /** The profile curve's thermal dose, ended where the roast's level ends. */
  predicted?: number;
  overshoot?: number;
}

/** A log that is a whole roast: at least five minutes, dropped at 180 °C or more, with a trace to integrate. */
const MIN_SECONDS = 300, MIN_DROP_C = 180, MIN_POINTS = 100;

const files = loadLibrary().filter((f) => /\.klog$/i.test(f.path));
const seen = new Set<string>();
const runs: Run[] = [];
const setAside: string[] = [];
for (const file of files) {
  const name = file.path.split(/[\\/]/).pop()!;
  const text = file.text.replace(/\r\n/g, "\n");
  const hash = createHash("sha1").update(text).digest("hex");
  if (seen.has(hash)) { setAside.push(`${name}: same content as an earlier file`); continue; }
  seen.add(hash);
  try {
    const log = parseKlog(file.text);
    const roast = kaffelogicToRoastLog(log);
    const features = extractFeatures(roast);
    // The same window extractFeatures measures over: every sample up to half a second past the roast end.
    const beanTrace = roast.samples.filter((s) => s.t <= features.totalTime + 0.5 && Number.isFinite(s.beanTemp)).map((s) => ({ t: s.t, temp: s.beanTemp }));
    if (Math.abs(thermalDose(beanTrace) - features.thermalDose) > 1e-9) throw new Error(`${name}: the trace used here does not give the thermal dose the tool stores`);
    if (beanTrace.length < MIN_POINTS || features.totalTime < MIN_SECONDS || features.dropTemp < MIN_DROP_C) { setAside.push(`${name}: not a whole roast (${(features.totalTime / 60).toFixed(1)} min, dropped at ${features.dropTemp.toFixed(0)} °C)`); continue; }
    const requestedTrace = (log.data.time ?? []).map((t, i) => ({ t, temp: (log.data.profile ?? [])[i] })).filter((p) => p.t <= features.totalTime + 0.5 && Number.isFinite(p.temp));
    runs.push({
      name,
      profile: log.profile.shortName || "(unnamed)",
      profileBody: createHash("sha1").update(JSON.stringify([log.profile.roastCurve, log.profile.roastLevels])).digest("hex").slice(0, 8),
      level: log.level,
      loadGrams: log.loadSize,
      minutes: features.totalTime / 60,
      dropTemp: features.dropTemp,
      beanTrace,
      requestedTrace,
      predicted: log.level === undefined ? undefined : profileThermalDoseAtLevel(log.profile, log.level)?.thermalDose,
      overshoot: developmentOvershoot(log),
    });
  } catch (e) {
    setAside.push(`${name}: ${(e as Error).message}`);
  }
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => sum(xs) / xs.length;
const pct = (x: number, digits = 1) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(digits)}%`;
const abs = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
const quantile = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * (xs.length - 1) + 0.5))];
const ranks = (xs: number[]) => {
  const out = new Array<number>(xs.length);
  xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]).forEach(([, i], k) => { out[i] = k + 1; });
  return out;
};
function pearson(a: number[], b: number[]): number {
  const ma = mean(a), mb = mean(b);
  return sum(a.map((x, i) => (x - ma) * (b[i] - mb))) / Math.sqrt(sum(a.map((x) => (x - ma) ** 2)) * sum(b.map((x) => (x - mb) ** 2)));
}
const spearman = (a: number[], b: number[]) => pearson(ranks(a), ranks(b));

const at = (run: Run, activationEnergyKjMol: number = THERMAL_DOSE.activationEnergyKjMol, shiftC = 0) =>
  thermalDose(run.beanTrace.map((p) => ({ t: p.t, temp: p.temp + shiftC })), activationEnergyKjMol);
const base = runs.map((r) => at(r));
const pairs = <T>(xs: T[]): [number, number][] => xs.flatMap((_, i) => xs.slice(i + 1).map((__, k): [number, number] => [i, i + 1 + k]));
const allPairs = pairs(runs);
/** How far the ratio of two roasts' thermal doses moves when the activation energy or the trace changes, as a fraction of the original ratio. */
const ratioShift = (a: number[], b: number[], [i, j]: [number, number]) => Math.abs(b[i] / b[j] / (a[i] / a[j]) - 1);

console.log(`${files.length} log files read; ${runs.length} whole roasts analysed; ${setAside.length} set aside:`);
for (const s of setAside) console.log(`   ${s}`);
if (runs.length < 3) { console.log("\n(needs a folder of real logs: set KAFFELOGIC_DIR)"); process.exit(0); }

console.log(`\n1. Repeatability: the same profile body, level and load, roasted more than once (spread = highest minus lowest, over the mean)`);
const groups = new Map<string, Run[]>();
for (const r of runs) groups.set(`${r.profileBody}|${r.level}|${r.loadGrams}`, [...(groups.get(`${r.profileBody}|${r.level}|${r.loadGrams}`) ?? []), r]);
const spreads: number[] = [];
for (const whole of groups.values()) {
  // A roast that dropped more than 5 °C from the group's median was stopped early or late by hand: a different roast, not noise.
  const medianDrop = quantile(whole.map((r) => r.dropTemp), 0.5);
  const g = whole.filter((r) => Math.abs(r.dropTemp - medianDrop) <= 5);
  for (const r of whole) if (!g.includes(r)) console.log(`   (${r.name} left out of its group: dropped at ${r.dropTemp.toFixed(0)} °C, the others near ${medianDrop.toFixed(0)} °C)`);
  if (g.length < 2) continue;
  const ds = g.map((r) => at(r));
  const spread = (Math.max(...ds) - Math.min(...ds)) / mean(ds);
  spreads.push(spread);
  console.log(`   ${g[0].profile.slice(0, 20).padEnd(20)} level ${g[0].level} ${g[0].loadGrams} g, ${g.length} roasts (${g.map((r) => r.name.replace(/\.klog$/i, "")).join(", ")}): ${ds.map((d) => d.toFixed(2)).join(", ")}; spread ${abs(spread)}`);
}
if (spreads.length) console.log(`   ${spreads.length} groups: median spread ${abs(quantile(spreads, 0.5))}, 90th percentile ${abs(quantile(spreads, 0.9))}, largest ${abs(Math.max(...spreads))}. Two or three roasts per group, so the true spread is wider than these show.`);

console.log(`\n2. Activation energy (the code uses ${THERMAL_DOSE.activationEnergyKjMol} kJ/mol; the fits behind it span about 90-140)`);
const sameProfile = allPairs.filter(([i, j]) => runs[i].profileBody === runs[j].profileBody);
for (const ea of [90, 120, 140]) {
  const other = runs.map((r) => at(r, ea));
  const flips = (set: [number, number][]) => set.filter(([i, j]) => Math.abs(Math.log(base[i] / base[j])) > 0.02 && Math.sign(Math.log(base[i] / base[j])) !== Math.sign(Math.log(other[i] / other[j]))).length;
  const shiftsAll = allPairs.map((p) => ratioShift(base, other, p)), shiftsSame = sameProfile.map((p) => ratioShift(base, other, p));
  console.log(`   ${String(ea).padStart(3)} kJ/mol: rank correlation with ${THERMAL_DOSE.activationEnergyKjMol} ${spearman(base, other).toFixed(4)}.`);
  console.log(`      two roasts on one profile body (${sameProfile.length} pairs): their ratio moves by median ${abs(quantile(shiftsSame, 0.5))}, 95th percentile ${abs(quantile(shiftsSame, 0.95))}, largest ${abs(Math.max(...shiftsSame))}; order flips ${flips(sameProfile)}`);
  console.log(`      any two roasts (${allPairs.length} pairs): median ${abs(quantile(shiftsAll, 0.5))}, 95th percentile ${abs(quantile(shiftsAll, 0.95))}, largest ${abs(Math.max(...shiftsAll))}; order flips ${flips(allPairs)}`);
}

console.log(`\n3. A probe offset: add a constant to every bean temperature`);
for (const shiftC of [-5, -2, 2, 5]) {
  const shifted = runs.map((r) => at(r, THERMAL_DOSE.activationEnergyKjMol, shiftC));
  const factors = shifted.map((d, i) => d / base[i]);
  const shifts = allPairs.map((p) => ratioShift(base, shifted, p));
  console.log(`   ${shiftC > 0 ? "+" : ""}${shiftC} °C: every thermal dose x${Math.min(...factors).toFixed(2)}-${Math.max(...factors).toFixed(2)}; rank correlation ${spearman(base, shifted).toFixed(4)}; the ratio between two roasts moves by median ${abs(quantile(shifts, 0.5))}, largest ${abs(Math.max(...shifts))}`);
}

console.log(`\n4. Measured against what the profile asked for (the log's own profile column, over the same seconds)`);
const withRequest = runs.filter((r) => r.requestedTrace.length > MIN_POINTS);
const gaps = withRequest.map((r) => at(r) / thermalDose(r.requestedTrace) - 1);
console.log(`   ${withRequest.length} roasts: measured over requested ${pct(Math.min(...gaps))} to ${pct(Math.max(...gaps))}, median ${pct(quantile(gaps, 0.5))}`);
const byProfile = new Map<string, number[]>();
withRequest.forEach((r, i) => byProfile.set(r.profile, [...(byProfile.get(r.profile) ?? []), gaps[i]]));
for (const [profile, v] of [...byProfile].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`   ${profile.slice(0, 22).padEnd(22)} ${String(v.length).padStart(2)} roasts: median ${pct(quantile(v, 0.5))}, from ${pct(Math.min(...v))} to ${pct(Math.max(...v))}`);
}
const withOvershoot = withRequest.map((r, i) => [gaps[i], r.overshoot] as const).filter((x): x is [number, number] => x[1] !== undefined);
if (withOvershoot.length > 2) {
  console.log(`   against the overshoot in development (${withOvershoot.length} roasts with a first-crack press): Pearson ${pearson(withOvershoot.map((x) => x[0]), withOvershoot.map((x) => x[1])).toFixed(2)}, Spearman ${spearman(withOvershoot.map((x) => x[0]), withOvershoot.map((x) => x[1])).toFixed(2)}. Both come from the same difference between bean and profile temperature, so this shows the gap is made in development, not why.`);
}
const withPrediction = runs.filter((r) => r.predicted !== undefined);
const predictionGaps = withPrediction.map((r) => at(r) / r.predicted! - 1);
console.log(`   against the curve's prediction at the log's level (${withPrediction.length} roasts; a roast stopped early or late misses it by construction): ${pct(Math.min(...predictionGaps))} to ${pct(Math.max(...predictionGaps))}, median ${pct(quantile(predictionGaps, 0.5))}`);

console.log(`\n5. What the thermal dose adds to end temperature and to time`);
console.log(`   rank correlation of thermal dose with drop temperature ${spearman(base, runs.map((r) => r.dropTemp)).toFixed(2)}, with total time ${spearman(base, runs.map((r) => r.minutes)).toFixed(2)}`);
const twice = (i: number, j: number) => Math.max(base[i], base[j]) / Math.min(base[i], base[j]) > 1.5;
const sameEnd = allPairs.filter(([i, j]) => Math.abs(runs[i].dropTemp - runs[j].dropTemp) <= 1);
const sameTime = allPairs.filter(([i, j]) => Math.abs(runs[i].minutes - runs[j].minutes) <= 0.25);
console.log(`   roasts dropped within 1 °C of each other: ${sameEnd.length} pairs, of which ${sameEnd.filter(([i, j]) => twice(i, j)).length} differ by more than 1.5x in thermal dose`);
console.log(`   roasts of the same total time (within 15 s): ${sameTime.length} pairs, of which ${sameTime.filter(([i, j]) => twice(i, j)).length} differ by more than 1.5x in thermal dose`);
console.log("   This says the measure separates roasts that the two simple numbers do not. It does not say the cups differ.");

// Reproduces the validation computations in docs/research.md.
// Usage: npm run research
//
// Uses published data only (both sources are open access, CC BY 4.0, cited below) plus any real
// Kaffelogic files in the local library (KAFFELOGIC_DIR, default profiles/), which are never
// committed. Sections that need real files are skipped when there are none.
import { levelForDose, profileDoseAtLevel } from "../src/adapters/kaffelogic/dose.js";
import { parseHeader, parseKlog, parseKpro, splitLines } from "../src/adapters/kaffelogic/parse.js";
import { STOCK_PROFILES } from "../src/adapters/kaffelogic/startingProfiles.js";
import { kaffelogicToRoastLog } from "../src/adapters/kaffelogic/toRoastLog.js";
import { THERMAL_DOSE, extractFeatures, thermalDose } from "../src/core/features.js";
import { loadLibrary } from "./library.js";

type Point = { t: number; temp: number };
const mmss = (s: string) => s.split(":").reduce((m, x) => m * 60 + Number(x), 0);
const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

/** Piecewise cubic Hermite interpolation with Fritsch-Carlson slopes (MATLAB pchip), as the paper used. */
function pchip(pts: [number, number][]): (t: number) => number {
  const x = pts.map((p) => p[0]), y = pts.map((p) => p[1]), n = pts.length;
  const h = x.slice(1).map((v, i) => v - x[i]);
  const d = h.map((hi, i) => (y[i + 1] - y[i]) / hi);
  const m = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] > 0) {
      const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  const end = (h0: number, h1: number, d0: number, d1: number) => {
    let s = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if (Math.sign(s) !== Math.sign(d0)) s = 0;
    else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(s) > Math.abs(3 * d0)) s = 3 * d0;
    return s;
  };
  m[0] = end(h[0], h[1], d[0], d[1]);
  m[n - 1] = end(h[n - 2], h[n - 3], d[n - 2], d[n - 3]);
  return (t) => {
    let i = 0;
    while (i < n - 2 && x[i + 1] <= t) i++;
    const s = (t - x[i]) / h[i];
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
    return h00 * y[i] + h10 * h[i] * m[i] + h01 * y[i + 1] + h11 * h[i] * m[i + 1];
  };
}

const sample = (f: (t: number) => number, end: number): Point[] => {
  const out: Point[] = [];
  for (let t = 0; t < end; t++) out.push({ t, temp: f(t) });
  out.push({ t: end, temp: f(end) });
  return out;
};

// ---------------------------------------------------------------------------------------------
// Source 1: Bruno M.J., Egidi N., Fatone L., Giacomini J., Maponi P., Sagratini G., Santanatoglia
// A., Trebović E. "A preliminary model to establish a digital twin for coffee roasting."
// Scientific Reports 16:15857 (2026). https://doi.org/10.1038/s41598-026-43923-9 (CC BY 4.0)
// Table 3: roast markers [m:ss, °C] on an industrial drum roaster; the paper starts the bean at
// 25 °C and interpolates with pchip. Table 7: fitted activation energies, kJ/mol, reactions 1..15.
// ---------------------------------------------------------------------------------------------
const BRUNO_MARKERS: Record<string, [string, number][]> = {
  "Mexico (arabica)": [["0:00", 25], ["1:33", 88.5], ["5:20", 151], ["10:05", 202], ["13:03", 214.8]],
  "Rwanda (arabica)": [["0:00", 25], ["1:31", 88], ["5:15", 150], ["10:06", 200], ["12:56", 213]],
  "Nicaragua (robusta)": [["0:00", 25], ["1:39", 77.6], ["6:35", 156], ["11:56", 201], ["15:20", 230]],
  "Indonesia (robusta)": [["0:00", 25], ["1:38", 77.4], ["6:55", 156], ["11:52", 203], ["14:56", 228]],
};
const BRUNO_EA: Record<string, number[]> = {
  "Mexico (arabica)": [109.9181, 109.9752, 104.9629, 104.9773, 104.9766, 105.0229, 104.9297, 134.8449, 110.0308, 60.0827, 100.0092, 100.0092, 100.0018, 100.142, 100.198],
  "Rwanda (arabica)": [124.618, 90.8344, 87.8731, 112.6491, 115.2129, 105.7871, 120.9254, 145.8624, 126.8107, 51.7517, 77.5419, 96.2164, 112.17, 93.3901, 105.9417],
  "Nicaragua (robusta)": [122.3157, 100.019, 121.341, 96.795, 115.6815, 122.5968, 123.4736, 109.2285, 139.7457, 48.1179, 95.4996, 93.8043, 121.7768, 103.2257, 111.7874],
  "Indonesia (robusta)": [109.9405, 109.9741, 104.9826, 105.0052, 105.0028, 105.0231, 104.9468, 135.0001, 110.0046, 59.9898, 100.0035, 100.0091, 99.9926, 100.1612, 100.0466],
};
const brunoCurve = (name: string) => {
  const pts = BRUNO_MARKERS[name].map(([t, c]) => [mmss(t), c] as [number, number]);
  return sample(pchip(pts), pts[pts.length - 1][0]);
};

// ---------------------------------------------------------------------------------------------
// Source 2: Debona D.G., Oliveira E.C.S., ten Caten C.S., Guarçoni R.C., Moreira T.R., Moreli
// A.P., Pereira L.L. "Sensory analysis and mid-infrared spectroscopy for discriminating roasted
// specialty coffees." Coffee Science 16:e161878 (2021). https://doi.org/10.25186/.v16i.1878
// (CC BY 4.0). Table 1: IKAWA Pro (fluid bed, 50 g) programs, linear between points; SCA scores
// of two semi-dry arabicas (750 m and 1050 m).
// ---------------------------------------------------------------------------------------------
const IKAWA: Record<string, { points: [string, number][]; end: [string, number]; sca: [number, number] }> = {
  "High temp, short (HTST)": { points: [["0:00", 180], ["0:30", 130], ["1:00", 155], ["2:00", 180], ["3:00", 195], ["4:00", 200], ["5:00", 205], ["6:00", 210]], end: ["6:30", 210], sca: [78.82, 86.23] },
  "Medium, medium (MTMT)": { points: [["0:00", 140], ["0:30", 105], ["1:00", 115], ["2:00", 135], ["3:00", 150], ["4:00", 165], ["5:00", 180], ["6:00", 190], ["7:00", 200]], end: ["8:00", 210], sca: [77.81, 86.62] },
  "Low temp, long (LTLT)": { points: [["0:00", 115], ["0:30", 95], ["1:00", 102], ["2:00", 115], ["3:00", 140], ["4:00", 155], ["5:00", 165], ["6:00", 175], ["7:00", 185], ["8:00", 195], ["9:00", 202]], end: ["10:00", 208], sca: [78.84, 85.37] },
};
const linearCurve = (points: [string, number][], end: [string, number]): Point[] => {
  const xs = [...points, end].map(([t, c]) => ({ t: mmss(t), temp: c }));
  const out: Point[] = [];
  for (let i = 1; i < xs.length; i++) for (let t = xs[i - 1].t; t < xs[i].t; t++) out.push({ t, temp: xs[i - 1].temp + ((t - xs[i - 1].t) / (xs[i].t - xs[i - 1].t)) * (xs[i].temp - xs[i - 1].temp) });
  out.push(xs[xs.length - 1]);
  return out;
};

// ---------------------------------------------------------------------------------------------
// Local Kaffelogic files, recognised by content.
// ---------------------------------------------------------------------------------------------
const library = loadLibrary().map((f) => ({ ...f, header: parseHeader(splitLines(f.text)).header }));
const logs = library.filter((f) => f.header.log_file_name !== undefined || f.header.roasting_level !== undefined);
const kpros = library.filter((f) => !logs.includes(f) && f.header.roast_profile);
const kproFor = (h: Record<string, string>) =>
  kpros.find((k) => k.header.profile_short_name?.trim() === h.profile_short_name?.trim() && k.header.profile_modified?.trim() === h.profile_modified?.trim());
const logName = (h: Record<string, string>) => `${h.profile_short_name?.trim()} level ${Number(h.roasting_level)}`;

console.log(`Thermal dose: minutes at a constant ${THERMAL_DOSE.referenceC} °C doing the same chemistry, Ea = ${THERMAL_DOSE.activationEnergyKjMol} kJ/mol.`);
console.log(`Local library: ${logs.length} log(s), ${kpros.length} profile(s).`);

console.log("\n1. Bruno et al. 2026 industrial roasts: thermal dose, and each reaction's spread across its fitted Ea");
for (const name of Object.keys(BRUNO_MARKERS)) {
  const curve = brunoCurve(name);
  const doses = BRUNO_EA[name].map((ea) => thermalDose(curve, ea));
  // Ratios between roasts barely depend on Ea within the fitted range, which is why one Ea suffices.
  console.log(`   ${name.padEnd(20)} ${(curve[curve.length - 1].t / 60).toFixed(1)} min, drop ${curve[curve.length - 1].temp} °C: dose ${thermalDose(curve).toFixed(2)} (per-reaction ${Math.min(...doses).toFixed(2)}-${Math.max(...doses).toFixed(2)})`);
}
for (const log of logs) {
  const roast = kaffelogicToRoastLog(parseKlog(log.text));
  const f = extractFeatures(roast);
  const pts = roast.samples.filter((s) => s.t <= f.totalTime && Number.isFinite(s.beanTemp)).map((s) => ({ t: s.t, temp: s.beanTemp }));
  const vs = Object.keys(BRUNO_MARKERS).map((name) => {
    const ratios = BRUNO_EA[name].map((ea) => thermalDose(pts, ea) / thermalDose(brunoCurve(name), ea));
    return `${name.split(" ")[0]} ${Math.min(...ratios).toFixed(2)}-${Math.max(...ratios).toFixed(2)}x`;
  });
  console.log(`   local ${logName(log.header)} (${(f.totalTime / 60).toFixed(1)} min, drop ${f.dropTemp.toFixed(1)} °C): dose ${f.thermalDose.toFixed(2)}; vs ${vs.join(", ")}`);
}

console.log("\n2. Debona et al. 2021, IKAWA Pro profiles: same end temperature, very different chemistry");
console.log("   profile                    time   end      dose   SCA 750 m  SCA 1050 m");
for (const [name, p] of Object.entries(IKAWA)) {
  const curve = linearCurve(p.points, p.end);
  console.log(`   ${name.padEnd(26)} ${p.end[0].padStart(5)}  ${p.end[1]} °C  ${thermalDose(curve).toFixed(2).padStart(5)}  ${p.sca[0].toFixed(2).padStart(8)}  ${p.sca[1].toFixed(2).padStart(9)}`);
}

console.log("\n3. Does a profile's curve predict a real roast's dose? (log vs the .kpro it was roasted on)");
let pairs = 0;
for (const log of logs) {
  const kpro = kproFor(log.header);
  if (!kpro) continue;
  const roast = kaffelogicToRoastLog(parseKlog(log.text));
  const measured = extractFeatures(roast).thermalDose;
  const predicted = profileDoseAtLevel(parseKpro(kpro.text), roast.nativeLevel!)?.dose;
  if (predicted === undefined) continue;
  pairs++;
  console.log(`   ${logName(log.header).padEnd(28)} measured ${measured.toFixed(2)}, curve predicts ${predicted.toFixed(2)}: ${pct(measured / predicted - 1)}`);
}
if (!pairs) console.log("   (needs a log and the .kpro it was roasted on in the local library)");

console.log("\n4. Level steps are uneven in chemistry (each stock profile in the local library)");
let shown = 0;
for (const name of Object.keys(STOCK_PROFILES)) {
  const kpro = kpros.find((k) => k.header.profile_short_name?.trim() === name);
  if (!kpro) continue;
  const p = parseKpro(kpro.text);
  const steps: string[] = [];
  for (let l = 1; l < 4.5; l += 0.4) {
    const a = profileDoseAtLevel(p, l), b = profileDoseAtLevel(p, l + 0.4);
    if (a && b) steps.push(`${l.toFixed(1)}->${(l + 0.4).toFixed(1)} ${pct(b.dose / a.dose - 1)}`);
  }
  const lessFromThree = levelForDose(p, profileDoseAtLevel(p, 3)!.dose * 0.85);
  console.log(`   ${name.padEnd(16)} ${steps.join("  ")}   (15% less than level 3.0: level ${lessFromThree?.level})`);
  shown++;
}
if (!shown) console.log("   (needs stock .kpro files in the local library)");

console.log("\n5. Our development ratio against the machine's own figure (every log that has one)");
let checked = 0;
for (const log of logs) {
  const raw = parseKlog(log.text);
  if (raw.markers.development_percent === undefined || raw.markers.first_crack === undefined) continue;
  checked++;
  const ours = extractFeatures(kaffelogicToRoastLog(raw)).developmentRatio!;
  console.log(`   ${logName(log.header).padEnd(28)} machine ${raw.markers.development_percent.toFixed(3)}%, ours ${ours.toFixed(3)}%`);
}
if (!checked) console.log("   (needs logs with a first-crack press in the local library)");

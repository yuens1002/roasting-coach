// Usage: npx tsx scripts/analyze-log.ts path/to/log.klog
import { readFileSync } from "node:fs";
import { parseKlog } from "../src/adapters/kaffelogic/parse.js";
import { kaffelogicToRoastLog } from "../src/adapters/kaffelogic/toRoastLog.js";
import { extractFeatures } from "../src/core/features.js";

const path = process.argv[2];
if (!path) throw new Error("usage: analyze-log.ts <file.klog>");
const log = kaffelogicToRoastLog(parseKlog(readFileSync(path, "utf8")));
const f = extractFeatures(log);
const mmss = (s?: number) => {
  if (s === undefined) return "–";
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
};
const r1 = (x?: number) => (x === undefined || !Number.isFinite(x) ? "–" : x.toFixed(1));

console.log(`Profile        ${log.profileName}  (level ${log.nativeLevel}, target end ${r1(log.targetEndTemp)} °C)`);
console.log(`Roast date     ${log.roastDate}   ambient ${r1(log.ambientTemp)} °C   batch ${log.batchGrams} g`);
console.log(`Total time     ${mmss(f.totalTime)}   drop ${r1(f.dropTemp)} °C`);
console.log(`Colour change  ${f.colourChange ? `${mmss(f.colourChange.t)} at ${r1(f.colourChange.temp)} °C` : "–"}`);
console.log(`First crack    ${f.firstCrack ? `${mmss(f.firstCrack.t)} at ${r1(f.firstCrack.temp)} °C` : "–"}`);
console.log(`Development    ${mmss(f.phases.development)}  (${r1(f.developmentRatio)}%, +${r1(f.developmentDeltaT)} °C after crack)`);
console.log(`Time to temp   ${Object.entries(f.timeToTemp).map(([k, v]) => `${k}°C ${mmss(v)}`).join("  ")}`);
console.log(`RoR (°C/min)   peak after 2:00 ${r1(f.ror.peak)} at ${mmss(f.ror.peakT)}, at crack ${r1(f.ror.atFirstCrack)}, at end ${r1(f.ror.atEnd)}, change across crack ${r1(f.ror.dropAfterFirstCrack)}, shape ${f.ror.shape}`);
console.log(`RoR series     ${f.ror.series.map((p) => `${mmss(p.t)} ${r1(p.ror)}`).join(" | ")}`);
console.log(`Tracking       mean ${r1(f.profileTracking?.meanAbsError)} °C, max ${r1(f.profileTracking?.maxAbsError)} °C off the profile`);
for (const w of f.dataWarnings) console.log(`WARNING        ${w}`);

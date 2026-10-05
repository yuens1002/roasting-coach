// Usage: npx tsx scripts/summarize-profiles.ts dir-with-kpro-files
// Prints the numbers the starting-profile table is built from.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { evalCurve, levelToTemp, parseKpro, timeCurveReaches } from "../src/adapters/kaffelogic/parse.js";

const dir = process.argv[2] ?? "fixtures/private";
const mmss = (s?: number) => {
  if (s === undefined) return "never";
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
};

for (const file of readdirSync(dir).filter((f) => f.endsWith(".kpro")).sort()) {
  const p = parseKpro(readFileSync(join(dir, file), "utf8"));
  const last = p.roastCurve[p.roastCurve.length - 1].point;
  // "= 2.2 Recommended End (...)" lines: the light/medium/dark levels the profile suggests.
  const suggested = [...p.description.matchAll(/([A-Za-z/ .]+?)\s*=\s*([\d.]+)\s*Recommended End/g)].map(
    (m) => `${m[1].trim().replace(/ profile\.?$/i, "").replace(/^Default (roast|Roast) for a /, "")} ${m[2]}`,
  );
  const levels = [...new Set([p.recommendedLevel ?? 3, 1, 2, 3, 4, 5])].sort();
  console.log(`\n${p.shortName}  (${file})`);
  console.log(`  levels 0-6: ${p.roastLevels.join(", ")}  recommended ${p.recommendedLevel}  expect FC ${p.expectFirstCrack ?? "-"}  min RoR ${p.minDesiredRor}  preheat ${p.preheatPower} W`);
  console.log(`  curve: ends ${mmss(last.t)} at ${last.v.toFixed(1)} °C; at 3:00 ${evalCurve(p.roastCurve, 180)?.toFixed(0)} °C, 5:00 ${evalCurve(p.roastCurve, 300)?.toFixed(0)} °C; reaches 150 °C ${mmss(timeCurveReaches(p.roastCurve, 150))}, 203 °C ${mmss(timeCurveReaches(p.roastCurve, 203))}, 209 °C ${mmss(timeCurveReaches(p.roastCurve, 209))}`);
  console.log(`  zones: ${p.zones.map((z) => `${mmss(z.start)}-${mmss(z.end)} boost ${z.boost}`).join("; ") || "none"}`);
  if (suggested.length) console.log(`  suggested: ${suggested.join(" | ")}`);
  for (const l of levels) {
    const temp = levelToTemp(p.roastLevels, l)!;
    const end = timeCurveReaches(p.roastCurve, temp);
    const fc203 = timeCurveReaches(p.roastCurve, 203);
    const dev = end && fc203 ? (((end - fc203) / end) * 100).toFixed(0) : "-";
    console.log(`  level ${l}: end ${temp.toFixed(1)} °C at ${mmss(end)}, dev ${dev}% if crack at 203 °C`);
  }
}

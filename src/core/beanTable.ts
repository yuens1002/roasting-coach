// The bean's own table: one row per roast, built as the roasts come in. It shows where the bean stands: what each
// roast was (level, thermal dose, the step from the roast before), what it tasted like from uncooked to scorched, and
// the quality it was rated. Under it, in a few plain lines, the bracket the roasts make (uncooked up to here, scorched
// from there), the clean roasts, and how many of the three level changes are used. It reads the roasts the way the
// rules do (tastedRoastsOf), so what the table shows is what the advice went on. Nothing here is a judgment of the coffee.
import { qualityMeaning } from "./intake.js";
import { type AdviceContext, type Calibration, DEFAULT_CALIBRATION, type HistoryForAdvice, LEVEL_CHANGE_BUDGET, levelChangesTo, tastedRoastsOf } from "./rules.js";

/** What a roast's tasting says about how far it went. */
export type Reads = "uncooked" | "scorched" | "uncooked and scorched" | "clean";

export interface BeanTableRow {
  /** 1 for the bean's first roast, in the order roasted. */
  roast: number;
  version: number;
  profile: string;
  level?: number;
  /** Absent for a roast with no measured thermal dose. */
  thermalDose?: number;
  /** The change in thermal dose from the roast before it that was tasted, in %. Absent for the first. */
  stepPct?: number;
  /** Absent for a roast not tasted yet, or without a measured thermal dose. */
  tasted?: { words: string[]; quality: number; reads: Reads; brew: string; counted: boolean };
}

export interface BeanTable {
  rows: BeanTableRow[];
  /** The level changes behind the newest tasted roast, of the LEVEL_CHANGE_BUDGET the tool aims to get a roast right in. Absent before a roast is tasted. */
  levelChangesMade?: number;
  /** The table and the lines under it, as the finished text to show the roaster. */
  say: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const roundTo = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}%`;

function readsOf(words: string[], { chips }: Calibration): Reads {
  const under = words.some((w) => chips.under.includes(w));
  const over = words.some((w) => chips.over.includes(w));
  return under && over ? "uncooked and scorched" : under ? "uncooked" : over ? "scorched" : "clean";
}

/** A bean's table and where it stands, from its recorded history. */
export function beanTable(history: HistoryForAdvice, context?: AdviceContext, calibration: Calibration = DEFAULT_CALIBRATION): BeanTable {
  const tasted = tastedRoastsOf(history, context);
  const byRoast = new Map(tasted.map((entry) => [entry.roast.id, entry]));
  const all = history.versions
    .flatMap((version) => version.roasts.map((roast) => ({ version, roast })))
    .sort((a, b) => new Date(a.roast.roastedAt as string).getTime() - new Date(b.roast.roastedAt as string).getTime() || a.roast.id - b.roast.id);
  let previousDose: number | undefined;
  const rows: BeanTableRow[] = all.map(({ version, roast }, i) => {
    const entry = byRoast.get(roast.id);
    const thermalDose = roast.features && Number.isFinite(roast.features.thermalDose) ? roast.features.thermalDose : undefined;
    const row: BeanTableRow = {
      roast: i + 1,
      version: version.number,
      profile: version.baseProfile ?? version.profileName,
      level: roast.logLevel ?? version.level,
      thermalDose: thermalDose === undefined ? undefined : roundTo(thermalDose, 2),
      stepPct: entry && previousDose !== undefined ? round1((entry.tasted.thermalDose / previousDose - 1) * 100) : undefined,
      tasted: entry && { words: entry.tasting.taste, quality: entry.tasting.quality, reads: readsOf(entry.tasting.taste, calibration), brew: entry.tasting.brew, counted: entry.counted },
    };
    if (entry) previousDose = entry.tasted.thermalDose;
    return row;
  });
  const newest = tasted[tasted.length - 1];
  const levelChangesMade = newest && levelChangesTo(history.versions, newest.version.number);
  return { rows, levelChangesMade, say: render(rows, levelChangesMade, calibration) };
}

const cell = (value: string | number | undefined) => (value === undefined ? "-" : String(value));

/** A table cell: a bar inside it would split the row. */
const escaped = (text: string) => text.replace(/\|/g, "\\|");

function render(rows: BeanTableRow[], levelChangesMade: number | undefined, calibration: Calibration): string {
  if (!rows.length) return "No roast has been recorded for this bean yet.";
  const head = "| Roast | Version | Profile | Level | Thermal dose | Step | Tasted | Quality | Reads as |\n|---|---|---|---|---|---|---|---|---|";
  const lines = rows.map((r) => {
    const reads = r.tasted ? `${r.tasted.reads}${r.tasted.counted ? "" : ` (not counted: tasted as ${r.tasted.brew})`}` : r.thermalDose === undefined ? "no measured thermal dose" : "not tasted yet";
    return `| ${r.roast} | ${r.version} | ${escaped(r.profile)} | ${cell(r.level)} | ${cell(r.thermalDose)} | ${r.stepPct === undefined ? "-" : signed(r.stepPct)} | ${r.tasted ? escaped(r.tasted.words.join(", ")) : "-"} | ${r.tasted ? r.tasted.quality : "-"} | ${reads} |`;
  });
  return [head, ...lines, "", ...standing(rows, levelChangesMade, calibration)].join("\n");
}

/** The lines under the table: the level changes used, the bracket the tasted roasts make, and the clean ones. */
function standing(rows: BeanTableRow[], levelChangesMade: number | undefined, { settings }: Calibration): string[] {
  if (!rows.some((r) => r.tasted)) return ["No roast with a measured thermal dose has been tasted yet."];
  const lines = [
    levelChangesMade! <= LEVEL_CHANGE_BUDGET
      ? `Level changes made on this profile: ${levelChangesMade} of the ${LEVEL_CHANGE_BUDGET} this tool aims to get the roast right in.`
      : `Level changes made on this profile: ${levelChangesMade}, past the ${LEVEL_CHANGE_BUDGET} this tool aims to get the roast right in.`,
  ];
  const counted = rows.filter((r): r is BeanTableRow & { tasted: NonNullable<BeanTableRow["tasted"]>; thermalDose: number } => r.tasted?.counted === true && r.thermalDose !== undefined);
  if (!counted.length) return [...lines, "None of the tasted roasts is in the coffee's tasting brew yet."];
  const uncooked = counted.filter((r) => r.tasted.reads === "uncooked");
  const scorched = counted.filter((r) => r.tasted.reads === "scorched");
  const furthestUncooked = uncooked.reduce<(typeof counted)[number] | undefined>((best, r) => (!best || r.thermalDose > best.thermalDose ? r : best), undefined);
  const lightestScorched = scorched.reduce<(typeof counted)[number] | undefined>((best, r) => (!best || r.thermalDose < best.thermalDose ? r : best), undefined);
  const at = (r: (typeof counted)[number]) => `thermal dose ${r.thermalDose}, roast ${r.roast}${r.level === undefined ? "" : `, level ${r.level}`}`;
  if (furthestUncooked && lightestScorched) {
    // The advice's own test: a scorched roast counts as further along than an uncooked one only beyond the noise band.
    const apart = ((lightestScorched.thermalDose - furthestUncooked.thermalDose) * 100) / furthestUncooked.thermalDose > settings.noisePct;
    lines.push(
      apart
        ? `Uncooked up to ${at(furthestUncooked)}; scorched from ${at(lightestScorched)}. The roast that clears both defects lies between them.`
        : `Roast ${furthestUncooked.roast} (thermal dose ${furthestUncooked.thermalDose}) tasted uncooked and roast ${lightestScorched.roast} (thermal dose ${lightestScorched.thermalDose}), with no more roasting, tasted scorched. The roasts disagree about which way to go.`,
    );
  } else if (furthestUncooked) {
    lines.push(`Every defect so far was uncooked, up to ${at(furthestUncooked)}. The roast that clears it lies with more roasting.`);
  } else if (lightestScorched) {
    lines.push(`Every defect so far was scorched, from ${at(lightestScorched)}. The roast that clears it lies with less roasting.`);
  }
  const clean = counted.filter((r) => r.tasted.reads === "clean");
  if (clean.length) {
    const best = clean.reduce((a, b) => (b.tasted.quality > a.tasted.quality ? b : a));
    lines.push(`Clean: ${clean.map((r) => `roast ${r.roast}`).join(", ")}. The best, roast ${best.roast}, was rated ${best.tasted.quality} (${qualityMeaning(best.tasted.quality)}).`);
  }
  return lines;
}

// The bean's own table: one row per roast, built as the roasts come in. It shows where the bean stands: what each
// roast was (level, thermal dose, the step from the roast before), what it tasted like from uncooked to scorched, and
// the quality it was rated; and how each roast ran against its own profile (the overshoot above the profile in development, and
// the offset of the measured thermal dose from the one the profile's curve predicts), with the range the roaster's roasts on that
// profile run in. Under it, in a few plain lines, the bracket the roasts make (uncooked up to here, scorched
// from there), the clean roasts, and how many of the three level changes are used. It reads the roasts the way the
// rules do (tastedRoastsOf), so what the table shows is what the advice went on. Nothing here is a judgment of the coffee.
import { qualityMeaning } from "./intake.js";
import type { ColourMethod } from "./roastColour.js";
import { type AdviceContext, type Calibration, CLEAN_QUALITY, DEFAULT_CALIBRATION, type HistoryForAdvice, LEVEL_CHANGE_BUDGET, levelChangesTo, tastedRoastsOf } from "./rules.js";

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
  /** The same, unrounded, for comparing roasts the way the rules do. */
  exactThermalDose?: number;
  /** The change in thermal dose from the roast before it that was tasted, in %. Absent for the first. */
  stepPct?: number;
  /** How far above its profile the bean ran on average from first crack to the end, in °C (negative: below it). Absent when the log can't say. */
  overshootC?: number;
  /** How far the measured thermal dose is above the one the profile's curve predicts at the level, in % (negative: below). Absent when either is missing. */
  offsetPct?: number;
  /** The colour reading of the roasted coffee and how it was read, when the roaster gave one. */
  colour?: { agtron: number; method: ColourMethod };
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

/** What a roast's log and its profile say about how the roast ran, worked out by the machine's adapter. */
export interface RoastRun {
  /** The profile the log was roasted on (its short name): roasts on one profile are compared with each other. */
  profile?: string;
  /** The thermal dose the profile's curve predicts at the level the roast was made at. */
  predictedThermalDose?: number;
  /** The roast's measured thermal dose. */
  measuredThermalDose?: number;
  /** How far above the profile the bean ran on average from first crack to the end, in °C (negative: below it). */
  overshootC?: number;
}

/** The range one profile's roasts run in, over all the roaster's beans. */
export interface ProfileRange {
  profile: string;
  roasts: number;
  offsetMinPct: number;
  offsetMedianPct: number;
  offsetMaxPct: number;
  overshootMinC?: number;
  overshootMaxC?: number;
  /** How many roasts have an overshoot (a log with no first-crack or end mark has none, and a roast with no offset can still have one): the overshoot range is over these. */
  overshootRoasts?: number;
}

const offsetOf = (run: RoastRun) => (run.predictedThermalDose && run.measuredThermalDose !== undefined ? (run.measuredThermalDose / run.predictedThermalDose - 1) * 100 : undefined);

/**
 * For each profile with at least two roasts that have an offset, the range of those offsets, and the range of the overshoots of every
 * roast on the profile that has one (a roast can have an overshoot and no offset, or the other way round), so a roast can be set
 * against the roaster's own.
 */
export function profileRanges(runs: Iterable<RoastRun>): ProfileRange[] {
  const byProfile = new Map<string, { offsets: number[]; overshoots: number[] }>();
  for (const run of runs) {
    if (run.profile === undefined) continue;
    const group = byProfile.get(run.profile) ?? { offsets: [], overshoots: [] };
    const offset = offsetOf(run);
    if (offset !== undefined) group.offsets.push(offset);
    if (run.overshootC !== undefined) group.overshoots.push(run.overshootC);
    byProfile.set(run.profile, group);
  }
  return [...byProfile]
    .filter(([, g]) => g.offsets.length >= 2)
    .map(([profile, g]) => {
      const sorted = [...g.offsets].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      return {
        profile,
        roasts: sorted.length,
        offsetMinPct: round1(sorted[0]),
        offsetMedianPct: round1(median),
        offsetMaxPct: round1(sorted[sorted.length - 1]),
        overshootMinC: g.overshoots.length ? round1(Math.min(...g.overshoots)) : undefined,
        overshootMaxC: g.overshoots.length ? round1(Math.max(...g.overshoots)) : undefined,
        overshootRoasts: g.overshoots.length || undefined,
      };
    });
}

/** What each column of the table signifies, in plain words. docs/RULES.md quotes these exactly, and `table` hands them to the session with the table. */
export const TABLE_COLUMNS: readonly { column: string; means: string }[] = [
  { column: "Roast", means: "The bean's roasts, numbered in the order roasted." },
  { column: "Version", means: "The step in the bean's journey the roast was made on. Each recorded change to the level or the profile is a new version." },
  { column: "Profile", means: "The profile the roast was made on. A profile written for the bean shows the stock profile it is built on in brackets." },
  { column: "Level", means: "The level set on the machine." },
  { column: "Thermal dose", means: "How much heat-driven roasting the roast got, worked out from its log as equivalent minutes at 200 °C. It compares one bean's roasts fairly across levels and profiles. It is not a time." },
  { column: "Step", means: "How much the thermal dose changed from the roast tasted before this one, in percent." },
  { column: "Overshoot (°C)", means: "How far above its profile the bean ran, on average, from first crack to the end of the roast. A positive number is hotter than the profile asked for." },
  { column: "Offset", means: "How far the measured thermal dose is above (+) or below (−) the thermal dose the profile's own curve predicts at that level. A larger offset means the roast got more heat than its level suggests." },
  { column: "Colour", means: "The roast colour you read from the ground roasted coffee: a number on the SCA scale (95 lightest, 25 darkest) and how you read it, against the roast colour card or with a colour meter." },
  { column: "Tasted", means: "The taste words you gave for the roast." },
  { column: "Quality", means: "The roast quality you gave, 1 to 5, judged by defects." },
  { column: "Reads as", means: "How the cup reads from uncooked to scorched, from your taste words." },
];

/** The column descriptions as the text to show the roaster. */
export const tableLegend = (): string => ["What each column means:", ...TABLE_COLUMNS.map((c) => `- ${c.column}: ${c.means}`)].join("\n");

const round1 = (n: number) => Math.round(n * 10) / 10;
export const roundTo = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;
export const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}%`;

export function readsOf(words: string[], { chips }: Calibration): Reads {
  const under = words.some((w) => chips.under.includes(w));
  const over = words.some((w) => chips.over.includes(w));
  return under && over ? "uncooked and scorched" : under ? "uncooked" : over ? "scorched" : "clean";
}

/** Every roast of a bean with its version, oldest first: the order that numbers the bean's roasts in its table. */
export function roastsInOrder(history: HistoryForAdvice) {
  return history.versions
    .flatMap((version) => version.roasts.map((roast) => ({ version, roast })))
    .sort((a, b) => new Date(a.roast.roastedAt as string).getTime() - new Date(b.roast.roastedAt as string).getTime() || a.roast.id - b.roast.id);
}

/**
 * The two edges of the bracket the tasted roasts make: the uncooked roast that went furthest (the highest thermal dose) and
 * the scorched one that went least (the lowest). The thermal doses compared are the unrounded ones, as the advice compares them.
 * With both edges, `apart` is the advice's own test: the gap is taken from the roast tasted later (the one the advice is about),
 * and the two edges are apart only beyond the noise band; when they are not, the roasts disagree about which way to go.
 */
export function bracketOf<T extends { roast: number; tasted: { reads: Reads }; exactThermalDose: number }>(entries: readonly T[], noisePct: number): { furthestUncooked?: T; lightestScorched?: T; apart?: boolean } {
  const furthestUncooked = entries.filter((r) => r.tasted.reads === "uncooked").reduce<T | undefined>((best, r) => (!best || r.exactThermalDose > best.exactThermalDose ? r : best), undefined);
  const lightestScorched = entries.filter((r) => r.tasted.reads === "scorched").reduce<T | undefined>((best, r) => (!best || r.exactThermalDose < best.exactThermalDose ? r : best), undefined);
  if (!furthestUncooked || !lightestScorched) return { furthestUncooked, lightestScorched };
  const later = furthestUncooked.roast > lightestScorched.roast ? furthestUncooked : lightestScorched;
  const apart = ((lightestScorched.exactThermalDose - furthestUncooked.exactThermalDose) * 100) / later.exactThermalDose > noisePct;
  return { furthestUncooked, lightestScorched, apart };
}

/** A bean's table and where it stands, from its recorded history. */
export function beanTable(history: HistoryForAdvice, context?: AdviceContext, calibration: Calibration = DEFAULT_CALIBRATION, runs: ReadonlyMap<number, RoastRun> = new Map()): BeanTable {
  const tasted = tastedRoastsOf(history, context);
  const byRoast = new Map(tasted.map((entry) => [entry.roast.id, entry]));
  const all = roastsInOrder(history);
  let previousDose: number | undefined;
  const rows: BeanTableRow[] = all.map(({ version, roast }, i) => {
    const entry = byRoast.get(roast.id);
    const thermalDose = roast.features && Number.isFinite(roast.features.thermalDose) ? roast.features.thermalDose : undefined;
    const row: BeanTableRow = {
      roast: i + 1,
      version: version.number,
      // What was roasted: the profile's own name, with the stock profile it is built on when that is another name.
      profile: version.baseProfile && version.baseProfile !== version.profileName ? `${version.profileName} (${version.baseProfile})` : version.profileName,
      level: roast.logLevel ?? version.level,
      thermalDose: thermalDose === undefined ? undefined : roundTo(thermalDose, 2),
      exactThermalDose: thermalDose,
      stepPct: entry && previousDose !== undefined ? round1((entry.tasted.thermalDose / previousDose - 1) * 100) : undefined,
      overshootC: runs.get(roast.id)?.overshootC === undefined ? undefined : round1(runs.get(roast.id)!.overshootC!),
      offsetPct: (() => {
        const run = runs.get(roast.id);
        const offset = run && thermalDose !== undefined ? offsetOf({ predictedThermalDose: run.predictedThermalDose, measuredThermalDose: thermalDose }) : undefined;
        return offset === undefined ? undefined : round1(offset);
      })(),
      colour: roast.colour !== undefined && roast.colourMethod !== undefined ? { agtron: roast.colour, method: roast.colourMethod } : undefined,
      tasted: entry && { words: entry.tasting.taste, quality: entry.tasting.quality, reads: readsOf(entry.tasting.taste, calibration), brew: entry.tasting.brew, counted: entry.counted },
    };
    if (entry) previousDose = entry.tasted.thermalDose;
    return row;
  });
  const newest = tasted[tasted.length - 1];
  const levelChangesMade = newest && levelChangesTo(history.versions, newest.version.number);
  // The ranges of the profiles this bean's roasts were made on, over every roast the roaster has had on them.
  const mine = new Set(all.map(({ roast }) => runs.get(roast.id)?.profile).filter((p): p is string => p !== undefined));
  const ranges = profileRanges(runs.values()).filter((r) => mine.has(r.profile));
  return { rows, levelChangesMade, say: render(rows, levelChangesMade, calibration, ranges) };
}

/** A temperature difference with its sign, to a tenth of a degree. */
const signedC = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}`;

/** One line for each profile the bean was roasted on that the roaster has roasted at least twice: where this roast sits among their own. */
function rangeLines(ranges: ProfileRange[]): string[] {
  return ranges.map((r) => {
    // Over all the roaster's beans, so "your roasts"; the overshoot is over the roasts that have one, which the line says when that is not the roasts of the offset range.
    const some = r.overshootRoasts !== undefined && r.overshootRoasts !== r.roasts ? ` (over ${r.overshootRoasts} roasts)` : "";
    const overshoot = r.overshootMinC === undefined || r.overshootMaxC === undefined ? "" : `, and your roasts ran ${signedC(r.overshootMinC)} to ${signedC(r.overshootMaxC)} °C against the profile in development${some}`;
    return `Across your ${r.roasts} roasts on ${r.profile}, the measured thermal dose is ${signed(r.offsetMinPct)} to ${signed(r.offsetMaxPct)} against the profile's prediction (median ${signed(r.offsetMedianPct)})${overshoot}.`;
  });
}

export const cell = (value: string | number | undefined) => (value === undefined ? "-" : String(value));

/** A table cell: a bar inside it would split the row. */
export const escaped = (text: string) => text.replace(/\r\n|[\r\n]/g, " ").replace(/\|/g, "\\|");

function render(rows: BeanTableRow[], levelChangesMade: number | undefined, calibration: Calibration, ranges: ProfileRange[]): string {
  if (!rows.length) return "No roast has been recorded for this bean yet.";
  const head = `| ${TABLE_COLUMNS.map((c) => c.column).join(" | ")} |\n|${TABLE_COLUMNS.map(() => "---").join("|")}|`;
  const lines = rows.map((r) => {
    const reads = r.tasted ? `${r.tasted.reads}${r.tasted.counted ? "" : ` (not counted: tasted as ${r.tasted.brew})`}` : r.thermalDose === undefined ? "no measured thermal dose" : "not tasted yet";
    return `| ${r.roast} | ${r.version} | ${escaped(r.profile)} | ${cell(r.level)} | ${cell(r.thermalDose)} | ${r.stepPct === undefined ? "-" : signed(r.stepPct)} | ${r.overshootC === undefined ? "-" : signedC(r.overshootC)} | ${r.offsetPct === undefined ? "-" : signed(r.offsetPct)} | ${r.colour ? `${r.colour.agtron} ${r.colour.method}` : "-"} | ${r.tasted ? escaped(r.tasted.words.join(", ")) : "-"} | ${r.tasted ? r.tasted.quality : "-"} | ${reads} |`;
  });
  return [head, ...lines, "", ...rangeLines(ranges), ...standing(rows, levelChangesMade, calibration)].join("\n");
}

/** The lines under the table: the level changes used, the bracket the tasted roasts make, and the clean ones. */
function standing(rows: BeanTableRow[], levelChangesMade: number | undefined, { settings }: Calibration): string[] {
  if (!rows.some((r) => r.tasted)) return ["No roast with a measured thermal dose has been tasted yet."];
  const lines = [
    levelChangesMade! <= LEVEL_CHANGE_BUDGET
      ? `Level changes made on this profile: ${levelChangesMade} of the ${LEVEL_CHANGE_BUDGET} this tool aims to get the roast right in.`
      : `Level changes made on this profile: ${levelChangesMade}, past the ${LEVEL_CHANGE_BUDGET} this tool aims to get the roast right in.`,
  ];
  const counted = rows.filter((r): r is BeanTableRow & { tasted: NonNullable<BeanTableRow["tasted"]>; thermalDose: number; exactThermalDose: number } => r.tasted?.counted === true && r.thermalDose !== undefined && r.exactThermalDose !== undefined);
  if (!counted.length) return [...lines, "None of the tasted roasts is in the coffee's tasting brew yet."];
  const { furthestUncooked, lightestScorched, apart } = bracketOf(counted, settings.noisePct);
  const at = (r: (typeof counted)[number]) => `thermal dose ${r.thermalDose}, roast ${r.roast}${r.level === undefined ? "" : `, level ${r.level}`}`;
  if (furthestUncooked && lightestScorched) {
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
  // A clean roast is a cup with no under or over word and a roast quality of CLEAN_QUALITY or more (a lower one with no defect word is for the advice to ask about).
  const clean = counted.filter((r) => r.tasted.reads === "clean" && r.tasted.quality >= CLEAN_QUALITY);
  if (clean.length) {
    const best = clean.reduce((a, b) => (b.tasted.quality > a.tasted.quality ? b : a));
    lines.push(`Clean: ${clean.map((r) => `roast ${r.roast}`).join(", ")}. The best, roast ${best.roast}, was rated ${best.tasted.quality} (${qualityMeaning(best.tasted.quality)}).`);
  }
  return lines;
}

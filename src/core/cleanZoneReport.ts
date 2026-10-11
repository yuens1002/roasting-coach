// The cross-bean report: one row per bean, so beans can be set side by side. Each row says what the bean is (altitude,
// process, moisture, density, crop date) and where its first clean roast stands in thermal dose: the level, the thermal dose
// the profile's curve predicts for that roast, the thermal dose measured, and the offset of the measured one from the
// prediction (above it, or below). A clean roast is a tasting of the coffee's own brew with roast quality CLEAN_QUALITY or more and no under or
// over word; a bean whose only such tasting contradicts itself (a high quality with a defect word) is not clean. The roasts
// are read the way the rules read them (tastedRoastsOf). The report judges nothing and no advice uses it: it is the data a
// link between a bean's properties and the thermal dose it needs to be clean would be fitted from, once there are enough
// beans (docs/ROADMAP.md, Next 2b and 3; docs/research.md, "Using bean properties in the thermal dose target").
import type { Intake } from "./intake.js";
import { bracketOf, cell, escaped, readsOf, roastsInOrder, roundTo, signed } from "./beanTable.js";
import { type AdviceContext, CLEAN_QUALITY, type Calibration, DEFAULT_CALIBRATION, type HistoryForAdvice, tastedRoastsOf } from "./rules.js";

export interface ReportBean {
  id: number;
  name: string;
  intake: Pick<Intake, "process" | "altitudeM" | "moisturePct" | "densityGL" | "cropDate">;
  history: HistoryForAdvice;
  context?: AdviceContext;
}

export interface ReportRow {
  beanId: number;
  name: string;
  altitudeM?: number;
  process: string;
  moisturePct?: number;
  densityGL?: number;
  cropDate?: string;
  /** Tasted roasts in the coffee's own tasting brew: the ones the rules count. */
  roastsTasted: number;
  /** The first clean roast, in the order roasted. */
  firstClean?: {
    /** Its number in the bean's table (`table`), which numbers every roast the bean has had: 1 when the first roast was clean. */
    roast: number;
    level?: number;
    quality: number;
    measuredThermalDose: number;
    /** What the profile's curve gives at the level the roast was made at; absent when the log or its profile can't say. */
    predictedThermalDose?: number;
    /** How far the measured thermal dose ran above the predicted one, in %. */
    offsetPct?: number;
  };
  /**
   * The measured thermal doses of the bracket the tasted roasts make: the furthest uncooked roast and the lightest scorched one.
   * `disagree` is set when both exist and are not apart beyond the noise band (the bean table says the roasts disagree about which way to go).
   */
  bracket: { uncookedUpTo?: number; scorchedFrom?: number; disagree?: boolean };
}

export interface CleanZoneReport {
  rows: ReportRow[];
  /** The table and the lines under it, as the finished text to show the roaster. */
  say: string;
}

/**
 * The report over the roaster's beans. `predicted` maps a roast's id to the thermal dose the profile's curve predicts for it
 * (the roaster's logs carry the profile, so the adapter can work it out; a roast missing from the map has no prediction).
 */
export function cleanZoneReport(beans: readonly ReportBean[], predicted: ReadonlyMap<number, number> = new Map(), calibration: Calibration = DEFAULT_CALIBRATION): CleanZoneReport {
  const rows = beans.map((bean): ReportRow => {
    const numbered = new Map(roastsInOrder(bean.history).map(({ roast }, i) => [roast.id, i + 1]));
    const counted = tastedRoastsOf(bean.history, bean.context)
      .filter((entry) => entry.counted)
      .map((entry) => ({ entry, roast: numbered.get(entry.roast.id)!, exactThermalDose: entry.tasted.thermalDose, tasted: { reads: readsOf(entry.tasting.taste, calibration) } }));
    const clean = counted.find((c) => c.tasted.reads === "clean" && c.entry.tasting.quality >= CLEAN_QUALITY);
    const { furthestUncooked, lightestScorched, apart } = bracketOf(counted, calibration.settings.noisePct);
    const predictedThermalDose = clean ? predicted.get(clean.entry.roast.id) : undefined;
    return {
      beanId: bean.id,
      name: bean.name,
      altitudeM: bean.intake.altitudeM,
      process: bean.intake.process,
      moisturePct: bean.intake.moisturePct,
      densityGL: bean.intake.densityGL,
      cropDate: bean.intake.cropDate,
      roastsTasted: counted.length,
      firstClean: clean && {
        roast: clean.roast,
        level: clean.entry.tasted.level,
        quality: clean.entry.tasting.quality,
        measuredThermalDose: roundTo(clean.exactThermalDose, 2),
        predictedThermalDose: predictedThermalDose === undefined ? undefined : roundTo(predictedThermalDose, 2),
        offsetPct: predictedThermalDose === undefined ? undefined : roundTo((clean.exactThermalDose / predictedThermalDose - 1) * 100, 1),
      },
      bracket: {
        uncookedUpTo: furthestUncooked && roundTo(furthestUncooked.exactThermalDose, 2),
        scorchedFrom: lightestScorched && roundTo(lightestScorched.exactThermalDose, 2),
        disagree: apart === undefined ? undefined : !apart,
      },
    };
  });
  return { rows, say: render(rows) };
}

function render(rows: ReportRow[]): string {
  if (!rows.length) return "No bean has been recorded yet.";
  const head = "| Bean | Altitude (m) | Process | Moisture (%) | Density (g/L) | Crop | Roasts tasted | First clean roast | Level | Predicted thermal dose | Measured thermal dose | Offset | Bracket (measured thermal dose) |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|";
  const lines = rows.map((r) => {
    const bracket = [r.bracket.uncookedUpTo !== undefined && `uncooked up to ${r.bracket.uncookedUpTo}`, r.bracket.scorchedFrom !== undefined && `scorched from ${r.bracket.scorchedFrom}`].filter(Boolean).join("; ") + (r.bracket.disagree ? " (the roasts disagree)" : "");
    const c = r.firstClean;
    return `| ${escaped(r.name)} | ${cell(r.altitudeM)} | ${r.process} | ${cell(r.moisturePct)} | ${cell(r.densityGL)} | ${cell(r.cropDate)} | ${r.roastsTasted} | ${c ? `roast ${c.roast}, quality ${c.quality}` : "none yet"} | ${cell(c?.level)} | ${cell(c?.predictedThermalDose)} | ${cell(c?.measuredThermalDose)} | ${c?.offsetPct === undefined ? "-" : signed(c.offsetPct)} | ${bracket || "-"} |`;
  });
  const withClean = rows.filter((r) => r.firstClean).length;
  return [head, ...lines, "", `Beans with a clean roast: ${withClean} of ${rows.length}. Nothing in this report is used by the advice.`].join("\n");
}

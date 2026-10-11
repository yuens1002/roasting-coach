import { describe, expect, it } from "vitest";
import { kaffelogicAdviceContext } from "../src/adapters/kaffelogic/adviceContext.js";
import { parseKpro } from "../src/adapters/kaffelogic/parse.js";
import { profileThermalDoseAtLevel } from "../src/adapters/kaffelogic/thermalDose.js";
import { type ReportBean, cleanZoneReport } from "../src/core/cleanZoneReport.js";
import { CLEAN_QUALITY, type AdviceContext, type HistoryForAdvice } from "../src/core/rules.js";
import { addBean, addRoast, addTasting, beanHistory, intakeFromBeanRow, listBeans, predictedThermalDoses } from "../src/db/store.js";
import { migratedDb } from "./pg.js";
import { PROFILE, syntheticLog } from "./syntheticLog.js";

type Tasting = { words: string[]; quality: number; brew?: string };
/** A roast: its number (which also dates it), level, measured thermal dose, and tasting (absent: not tasted). */
const roast = (id: number, level: number, thermalDose: number, tasting?: Tasting) => ({
  id,
  roastedAt: `2026-10-0${id}`,
  logLevel: level,
  features: { thermalDose },
  tastings: tasting ? [{ id, tastedOn: `2026-10-1${id}`, quality: tasting.quality, taste: tasting.words, brew: tasting.brew ?? "pourover" }] : [],
});
const history = (...roasts: ReturnType<typeof roast>[]): HistoryForAdvice => ({
  versions: roasts.map((r, i) => ({ number: i + 1, parentNumber: i === 0 ? undefined : i, level: r.logLevel, profileName: "Robusta", roasts: [r] })),
});
const context: AdviceContext = { tastingBrew: "pourover" };
const bean = (id: number, name: string, h: HistoryForAdvice, intake: Partial<ReportBean["intake"]> = {}): ReportBean => ({
  id,
  name,
  intake: { process: "washed", ...intake },
  history: h,
  context,
});

const CLEAN = { words: ["sweet", "balanced"], quality: 4 };

describe("the cross-bean report", () => {
  it("names the first clean roast in the order roasted, with its level, thermal doses and the offset of the measured one from the predicted one", () => {
    const b = bean(1, "A", history(roast(1, 3, 8, { words: ["grassy", "bready"], quality: 2 }), roast(2, 3.4, 9, CLEAN), roast(3, 3.8, 9.6, { words: ["sweet"], quality: 5 })), { altitudeM: 1900, moisturePct: 10.5, densityGL: 720, cropDate: "2026-02-01" });
    const { rows } = cleanZoneReport([b], new Map([[2, 8.5]]));
    expect(rows[0]).toMatchObject({
      beanId: 1,
      name: "A",
      altitudeM: 1900,
      process: "washed",
      moisturePct: 10.5,
      densityGL: 720,
      cropDate: "2026-02-01",
      roastsTasted: 3,
      firstClean: { roastsToClean: 2, level: 3.4, quality: 4, measuredThermalDose: 9, predictedThermalDose: 8.5, offsetPct: 5.9 },
      bracket: { uncookedUpTo: 8 },
    });
  });

  it("has no prediction or offset for a roast the adapter could not predict, and says so with dashes", () => {
    const { rows, say } = cleanZoneReport([bean(1, "A", history(roast(1, 3, 9, CLEAN)))]);
    expect(rows[0].firstClean).toEqual({ roastsToClean: 1, level: 3, quality: 4, measuredThermalDose: 9, predictedThermalDose: undefined, offsetPct: undefined });
    expect(say).toContain("| A | - | washed | - | - | - | 1 | roast 1, quality 4 | 3 | - | 9 | - | - |");
  });

  it("does not call a roast clean when its quality and its words disagree, or its quality is below the clean quality", () => {
    expect(CLEAN_QUALITY).toBe(3);
    const contradicts = bean(1, "Both", history(roast(1, 3, 8, { words: ["bitter"], quality: 4 })));
    const flat = bean(2, "Flat", history(roast(1, 3, 8, { words: ["flat"], quality: 2 })));
    const exactly = bean(3, "Three", history(roast(1, 3, 8, { words: ["flat"], quality: 3 })));
    const rows = cleanZoneReport([contradicts, flat, exactly]).rows;
    expect(rows.map((r) => r.firstClean?.quality)).toEqual([undefined, undefined, 3]);
  });

  it("counts only tastings in the coffee's own brew, as the rules do", () => {
    const { rows } = cleanZoneReport([bean(1, "A", history(roast(1, 3, 8, { ...CLEAN, brew: "espresso" }), roast(2, 3.4, 9, CLEAN)))]);
    expect(rows[0].roastsTasted).toBe(1);
    expect(rows[0].firstClean).toMatchObject({ roastsToClean: 1, level: 3.4 });
  });

  it("gives the bracket of a bean with no clean roast yet, and a bean with nothing tasted a row of dashes", () => {
    const b = bean(1, "B", history(roast(1, 3, 8, { words: ["grassy"], quality: 2 }), roast(2, 4, 11, { words: ["ashy"], quality: 2 })));
    const untasted = bean(2, "C", history(roast(1, 3, 8)));
    const { rows, say } = cleanZoneReport([b, untasted]);
    expect(rows[0]).toMatchObject({ roastsTasted: 2, firstClean: undefined, bracket: { uncookedUpTo: 8, scorchedFrom: 11 } });
    expect(rows[1]).toMatchObject({ roastsTasted: 0, firstClean: undefined, bracket: {} });
    expect(say).toContain("| B | - | washed | - | - | - | 2 | none yet | - | - | - | - | uncooked up to 8; scorched from 11 |");
    expect(say).toContain("| C | - | washed | - | - | - | 0 | none yet | - | - | - | - | - |");
    expect(say).toContain("Beans with a clean roast: 0 of 2. Nothing in this report is used by the advice.");
  });

  it("says the whole table as the finished text, and says so when there is no bean", () => {
    const b = bean(1, "A|B", history(roast(1, 3, 9, CLEAN)), { altitudeM: 1900, densityGL: 720 });
    expect(cleanZoneReport([b], new Map([[1, 8]])).say).toBe(
      [
        "| Bean | Altitude (m) | Process | Moisture (%) | Density (g/L) | Crop | Roasts tasted | First clean roast | Level | Predicted thermal dose | Measured thermal dose | Offset | Bracket (measured thermal dose) |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
        "| A\\|B | 1900 | washed | - | 720 | - | 1 | roast 1, quality 4 | 3 | 8 | 9 | +12.5% | - |",
        "",
        "Beans with a clean roast: 1 of 1. Nothing in this report is used by the advice.",
      ].join("\n"),
    );
    expect(cleanZoneReport([]).say).toBe("No bean has been recorded yet.");
  });
});

describe("the report on a database, with made-up logs", () => {
  it("predicts a roast's thermal dose from the profile its log carries, and leaves a roast without a log out", async () => {
    const db = await migratedDb();
    const intake = { name: "Report bean", species: "arabica", decaf: false, process: "washed", drinkWhen: "soon", agtronTarget: 60, tastingBrew: "pourover", altitudeM: 1900, moisturePct: 10.5 };
    const { beanId } = await addBean(db, intake);
    const logged = await addRoast(db, { beanId, klog: syntheticLog({ first_crack: 540, roast_end: 600 }), answers: { greenG: 120, roastedG: 101.5 } });
    await addRoast(db, { beanId, roastedAt: "2026-03-10", answers: { greenG: 120, roastedG: 102 } });
    await addTasting(db, { beanId, roastId: Number(logged.roastId), answers: { tastedOn: "2026-10-12", quality: 4, taste: ["sweet", "balanced"] } });

    const predicted = await predictedThermalDoses(db);
    const expected = profileThermalDoseAtLevel(parseKpro(PROFILE), 3.3)!.thermalDose;
    expect([...predicted.keys()]).toEqual([Number(logged.roastId)]);
    expect(predicted.get(Number(logged.roastId))).toBeCloseTo(expected, 6);

    const beans = await Promise.all(
      (await listBeans(db)).map(async ({ id }) => {
        const h = await beanHistory(db, id);
        const i = intakeFromBeanRow(h.bean);
        return { id, name: i.name, intake: i, history: h, context: kaffelogicAdviceContext(i) };
      }),
    );
    const { rows } = cleanZoneReport(beans, predicted);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Report bean", altitudeM: 1900, moisturePct: 10.5, roastsTasted: 1 });
    expect(rows[0].firstClean).toMatchObject({ roastsToClean: 1, level: 3.3, quality: 4, predictedThermalDose: Math.round(expected * 100) / 100 });
    // The made-up log follows its profile's curve, so the measured thermal dose is close to the predicted one.
    expect(Math.abs(rows[0].firstClean!.offsetPct!)).toBeLessThan(5);
  });
});

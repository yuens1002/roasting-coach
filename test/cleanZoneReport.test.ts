import { describe, expect, it } from "vitest";
import { kaffelogicAdviceContext } from "../src/adapters/kaffelogic/adviceContext.js";
import { parseKpro } from "../src/adapters/kaffelogic/parse.js";
import { profileThermalDoseAtLevel } from "../src/adapters/kaffelogic/thermalDose.js";
import { beanTable } from "../src/core/beanTable.js";
import { type ReportBean, cleanZoneReport } from "../src/core/cleanZoneReport.js";
import { CLEAN_QUALITY, type AdviceContext, type HistoryForAdvice } from "../src/core/rules.js";
import { addBean, addRoast, addTasting, beanHistory, intakeFromBeanRow, listBeans, predictedThermalDoses, roastRuns } from "../src/db/store.js";
import { migratedDb } from "./pg.js";
import { PROFILE, syntheticLog } from "./syntheticLog.js";

type Tasting = { words: string[]; quality: number; brew?: string };
/** A roast: its number (which also dates it), level, measured thermal dose, and tasting (absent: not tasted). */
const roast = (id: number, level: number, thermalDose: number, tasting?: Tasting | Tasting[]) => ({
  id,
  roastedAt: `2026-10-0${id}`,
  logLevel: level,
  features: { thermalDose },
  tastings: [tasting ?? []].flat().map((t, i) => ({ id: id * 10 + i, tastedOn: `2026-10-1${id}`, quality: t.quality, taste: t.words, brew: t.brew ?? "pourover" })),
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
      firstClean: { roast: 2, level: 3.4, quality: 4, measuredThermalDose: 9, predictedThermalDose: 8.5, offsetPct: 5.9 },
      bracket: { uncookedUpTo: 8 },
    });
  });

  it("has no prediction or offset for a roast the adapter could not predict, and says so with dashes", () => {
    const { rows, say } = cleanZoneReport([bean(1, "A", history(roast(1, 3, 9, CLEAN)))]);
    expect(rows[0].firstClean).toEqual({ roast: 1, level: 3, quality: 4, measuredThermalDose: 9, predictedThermalDose: undefined, offsetPct: undefined });
    expect(say).toContain("| A | - | washed | - | - | - | 1 | roast 1, quality 4 | 3 | - | 9 | - | - |");
  });

  it("does not call a roast clean when its quality and its words disagree, or its quality is below the clean quality", () => {
    expect(CLEAN_QUALITY).toBe(3);
    const rows = cleanZoneReport([
      bean(1, "Both", history(roast(1, 3, 8, { words: ["bitter"], quality: 4 }))),
      bean(2, "Flat", history(roast(1, 3, 8, { words: ["flat"], quality: 2 }))),
      bean(3, "Three", history(roast(1, 3, 8, { words: ["flat"], quality: 3 }))),
      bean(4, "Under", history(roast(1, 3, 8, { words: ["grassy"], quality: 3 }))),
    ]).rows;
    expect(rows.map((r) => r.firstClean?.quality)).toEqual([undefined, undefined, 3, undefined]);
  });

  it("reads a roast tasted twice by its newest tasting in the coffee's brew, as the rules do", () => {
    const twice = roast(1, 3, 8, [CLEAN, { words: ["bitter"], quality: 2 }]);
    expect(cleanZoneReport([bean(1, "A", history(twice))]).rows[0].firstClean).toBeUndefined();
    const flipped = roast(1, 3, 8, [{ words: ["bitter"], quality: 2 }, CLEAN]);
    expect(cleanZoneReport([bean(1, "A", history(flipped))]).rows[0].firstClean).toMatchObject({ roast: 1, quality: 4 });
  });

  it("counts only tastings in the coffee's own brew, as the rules do, and numbers the roast as the bean's table does", () => {
    const h = history(roast(1, 3, 8, { ...CLEAN, brew: "espresso" }), roast(2, 3.4, 9, CLEAN));
    const { rows } = cleanZoneReport([bean(1, "A", h)]);
    expect(rows[0].roastsTasted).toBe(1);
    expect(rows[0].firstClean).toMatchObject({ roast: 2, level: 3.4 });
    // The table numbers every roast the bean has had, so its row for the clean roast carries the same number.
    expect(beanTable(h, context).rows.find((r) => r.tasted?.counted && r.tasted.reads === "clean")?.roast).toBe(rows[0].firstClean!.roast);
  });

  it("agrees with the bean's table on which roasts are clean: a cup with no defect word and a quality below the clean quality is not", () => {
    const h = history(roast(1, 3, 8, { words: ["flat"], quality: 2 }), roast(2, 3.4, 9, CLEAN));
    expect(cleanZoneReport([bean(1, "A", h)]).rows[0].firstClean?.roast).toBe(2);
    const { say, rows } = beanTable(h, context);
    expect(say).toContain("Clean: roast 2. The best, roast 2,");
    expect(say).not.toContain("roast 1,");
    // The row still reads the words as they are: no defect word. Only the clean summary asks for the quality too.
    expect(rows[0].tasted?.reads).toBe("clean");
    // With only the low-quality cup, the table names no clean roast at all.
    expect(beanTable(history(roast(1, 3, 8, { words: ["flat"], quality: 2 })), context).say).not.toContain("Clean:");
  });

  it("gives the bracket of a bean with no clean roast yet, and a bean with nothing tasted or no roast a row of dashes", () => {
    const b = bean(1, "B", history(roast(1, 3, 8, { words: ["grassy"], quality: 2 }), roast(2, 4, 11, { words: ["ashy"], quality: 2 })));
    const untasted = bean(2, "C", history(roast(1, 3, 8)));
    const noRoasts = bean(3, "D", { versions: [] });
    const otherBrew = bean(4, "E", history(roast(1, 3, 8, { ...CLEAN, brew: "espresso" })));
    const { rows, say } = cleanZoneReport([b, untasted, noRoasts, otherBrew]);
    expect(rows[0]).toMatchObject({ roastsTasted: 2, firstClean: undefined, bracket: { uncookedUpTo: 8, scorchedFrom: 11 } });
    for (const r of rows.slice(1)) expect(r).toMatchObject({ roastsTasted: 0, firstClean: undefined });
    for (const r of rows.slice(1)) expect(r.bracket).toEqual({ uncookedUpTo: undefined, scorchedFrom: undefined, disagree: undefined });
    expect(say).toContain("| B | - | washed | - | - | - | 2 | none yet | - | - | - | - | uncooked up to 8; scorched from 11 |");
    for (const name of ["C", "D", "E"]) expect(say).toContain(`| ${name} | - | washed | - | - | - | 0 | none yet | - | - | - | - | - |`);
    expect(say).toContain("Beans with a clean roast: 0 of 4. Nothing in this report is used by the advice.");
  });

  it("marks a bracket whose edges are not apart beyond the noise band, as the bean's table does", () => {
    // Scorched at thermal dose 10, then uncooked at 11: the roasts disagree about which way to go.
    const h = history(roast(1, 3, 10, { words: ["ashy"], quality: 2 }), roast(2, 3.3, 11, { words: ["grassy"], quality: 2 }));
    const { rows, say } = cleanZoneReport([bean(1, "A", h)]);
    expect(rows[0].bracket).toEqual({ uncookedUpTo: 11, scorchedFrom: 10, disagree: true });
    expect(say).toContain("uncooked up to 11; scorched from 10 (the roasts disagree) |");
    expect(beanTable(h, context).say).toContain("disagree");
    // Apart beyond the noise band, the same two edges are a bracket.
    const apart = history(roast(1, 3, 8, { words: ["grassy"], quality: 2 }), roast(2, 3.8, 11, { words: ["ashy"], quality: 2 }));
    expect(cleanZoneReport([bean(1, "A", apart)]).rows[0].bracket.disagree).toBe(false);
  });

  it("keeps a bean name with a bar or a line break inside its cell, so the row stays one row", () => {
    const { say } = cleanZoneReport([bean(1, "Kenya\r\nAA | lot 2\nfermented", history(roast(1, 3, 9, CLEAN)))]);
    const row = say.split("\n").find((line) => line.includes("Kenya"))!;
    expect(row.startsWith("| Kenya AA \\| lot 2 fermented | ")).toBe(true);
    expect(say.split("\n").filter((line) => line.startsWith("|"))).toHaveLength(3);
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

describe("how each roast ran, on a database", () => {
  it("leaves out a roast whose stored log can't be read now, and gives a roast with no stored features no measured figure", async () => {
    const db = await migratedDb();
    const intake = { name: "Run bean", species: "arabica", decaf: false, process: "washed", drinkWhen: "soon", agtronTarget: 60, tastingBrew: "pourover" };
    const { beanId } = await addBean(db, intake);
    const { roastId } = await addRoast(db, { beanId, klog: syntheticLog({ first_crack: 540, roast_end: 600 }), answers: { greenG: 120, roastedG: 101.5 } });
    const id = Number(roastId);
    expect((await roastRuns(db)).get(id)).toMatchObject({ profile: "Test line" });
    await db.query("update roast set features = null where id = $1", [id]);
    expect((await roastRuns(db)).get(id)).toMatchObject({ profile: "Test line", measuredThermalDose: undefined });
    await db.query("update roast set log_file = 'not a Kaffelogic log' where id = $1", [id]);
    expect((await roastRuns(db)).has(id)).toBe(false);
  });
});

describe("the report on a database, with made-up logs", () => {
  it("predicts a roast's thermal dose from the profile its log carries, at the level the log was roasted at, and leaves a roast without a log out", async () => {
    const db = await migratedDb();
    const intake = { name: "Report bean", species: "arabica", decaf: false, process: "washed", drinkWhen: "soon", agtronTarget: 60, tastingBrew: "pourover", altitudeM: 1900, moisturePct: 10.5 };
    const { beanId } = await addBean(db, intake);
    // The made-up profile recommends level 3.3; the log says level 2.8, so a prediction at either the recommended level or the log's own is told apart.
    const log = syntheticLog({ first_crack: 540, roast_end: 600 });
    expect(log).toContain("roasting_level:3.3");
    const logged = await addRoast(db, { beanId, klog: log.replace("roasting_level:3.3", "roasting_level:2.8"), answers: { greenG: 120, roastedG: 101.5 }, reason: "Roasted at another level on the machine" });
    await addRoast(db, { beanId, roastedAt: "2026-03-10", answers: { greenG: 120, roastedG: 102 } });
    await addTasting(db, { beanId, roastId: Number(logged.roastId), answers: { tastedOn: "2026-10-12", quality: 4, taste: ["sweet", "balanced"] } });

    // How each roast ran: only the roast with a log has figures, and they come from the log and the roast's stored features.
    const runs = await roastRuns(db);
    expect([...runs.keys()]).toEqual([Number(logged.roastId)]);
    const run = runs.get(Number(logged.roastId))!;
    expect(run.profile).toBe("Test line");
    // The measured thermal dose is the roast's stored one, the figure the offset divides.
    const stored = (await beanHistory(db, beanId)).versions.flatMap((v) => v.roasts).find((r) => r.id === Number(logged.roastId))!.features!.thermalDose;
    expect(run.measuredThermalDose).toBeCloseTo(stored, 10);
    expect(run.overshootC).toBeCloseTo(0, 6);
    expect(run.predictedThermalDose).toBeCloseTo(profileThermalDoseAtLevel(parseKpro(PROFILE), 2.8)!.thermalDose, 6);

    const predicted = await predictedThermalDoses(db);
    const profile = parseKpro(PROFILE);
    const expected = profileThermalDoseAtLevel(profile, 2.8)!.thermalDose;
    expect(expected).not.toBeCloseTo(profileThermalDoseAtLevel(profile, 3.3)!.thermalDose, 1);
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
    expect(rows[0].firstClean).toMatchObject({ roast: 1, level: 2.8, quality: 4, predictedThermalDose: Math.round(expected * 100) / 100 });
    expect(rows[0].firstClean!.offsetPct).toBeTypeOf("number");
  });
});

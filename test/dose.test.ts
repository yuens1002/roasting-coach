import { describe, expect, it } from "vitest";
import { levelForDose, profileDoseAtLevel } from "../src/adapters/kaffelogic/dose.js";
import { parseKlog, parseKpro } from "../src/adapters/kaffelogic/parse.js";
import { kaffelogicToRoastLog } from "../src/adapters/kaffelogic/toRoastLog.js";
import { THERMAL_DOSE, extractFeatures, thermalDose } from "../src/core/features.js";
import { addBean, addRoast, beanHistory, refreshFeatures } from "../src/db/store.js";
import { migratedDb } from "./pg.js";
import { PRIVATE_LOGS, PRIVATE_PROFILES, headerValue } from "./privateFiles.js";
import { PROFILE, syntheticLog } from "./syntheticLog.js";

const constant = (temp: number, seconds: number) => [
  { t: 0, temp },
  { t: seconds, temp },
];

describe("thermal dose", () => {
  it("is minutes at 200 °C: ten minutes at 200 °C is a dose of 10", () => {
    expect(thermalDose(constant(200, 600))).toBeCloseTo(10, 9);
  });

  it("grows exponentially with temperature, as the Arrhenius law says", () => {
    // exp(Ea/R · (1/473.15 − 1/483.15)) ≈ 1.737: ten degrees hotter does about 74% more chemistry.
    const R = 8.314462618e-3;
    const factor = Math.exp((THERMAL_DOSE.activationEnergyKjMol / R) * (1 / 473.15 - 1 / 483.15));
    expect(thermalDose(constant(210, 600))).toBeCloseTo(10 * factor, 6);
    expect(factor).toBeCloseTo(1.737, 3);
  });

  it("is part of a roast's features, and a hotter roast gets more", () => {
    const log = kaffelogicToRoastLog(parseKlog(syntheticLog({ roast_end: 600 })));
    const dose = extractFeatures(log).thermalDose;
    expect(dose).toBeGreaterThan(0);
    const hotter = extractFeatures({ ...log, samples: log.samples.map((s) => ({ ...s, beanTemp: s.beanTemp + 5 })) }).thermalDose;
    expect(hotter).toBeGreaterThan(dose * 1.2);
  });
});

describe("a profile's dose at a level", () => {
  const profile = parseKpro(PROFILE);

  it("rises with the level", () => {
    const doses = [1, 2, 3, 4, 5].map((l) => profileDoseAtLevel(profile, l)!.dose);
    for (let i = 1; i < doses.length; i++) expect(doses[i]).toBeGreaterThan(doses[i - 1]);
  });

  it("turns a target dose back into the level that gives it", () => {
    const at = profileDoseAtLevel(profile, 3.3)!;
    expect(at).toMatchObject({ level: 3.3, endTemp: 219.9 });
    expect(levelForDose(profile, at.dose)!.level).toBe(3.3);
  });
});

describe("stored roasts", () => {
  it("get the thermal dose when their features are recomputed from the stored log", async () => {
    const db = await migratedDb();
    const { beanId } = await addBean(db, { name: "Old", species: "arabica", decaf: false, process: "washed", goal: "filter", drinkWhen: "soon" });
    const { roastId } = await addRoast(db, { beanId, klog: syntheticLog({ roast_end: 600 }), answers: { greenG: 120, roastedG: 102 } });
    // A roast recorded before thermalDose existed.
    await db.query("update roast set features = features - 'thermalDose' where id = $1", [roastId]);
    expect(await refreshFeatures(db)).toEqual({ refreshed: 1 });
    const [roast] = (await beanHistory(db, beanId)).versions[0].roasts;
    expect(roast.features?.thermalDose).toBeGreaterThan(0);
  });
});

describe("the profile curve predicts a roast that follows it", () => {
  it("exactly, for a log that tracks the curve exactly (runs anywhere)", () => {
    // The synthetic log follows the test profile's straight line to the second, ending at 600 s.
    const measured = extractFeatures(kaffelogicToRoastLog(parseKlog(syntheticLog({ roast_end: 600 })))).thermalDose;
    const predicted = profileDoseAtLevel(parseKpro(PROFILE), 3.3)!.dose;
    expect(measured / predicted).toBeCloseTo(1, 2);
  });
});

// Real files, picked by content: each log against the .kpro it was roasted on (same name and
// modified stamp, so two versions of one stock profile can't be confused), when present.
const pairs = PRIVATE_LOGS.flatMap((log) => {
  const same = (key: string) => (p: { text: string }) => headerValue(p.text, key)?.trim() === headerValue(log.text, key)?.trim();
  const kpro = PRIVATE_PROFILES.find((p) => same("profile_short_name")(p) && same("profile_modified")(p));
  return kpro ? [{ log, kpro }] : [];
});

describe.skipIf(!pairs.length)("the profile curve predicts a real roast's dose", () => {
  for (const { log, kpro } of pairs) {
    it(`${log.file} (${headerValue(log.text, "profile_short_name")?.trim()} level ${Number(headerValue(log.text, "roasting_level"))})`, () => {
      const roast = kaffelogicToRoastLog(parseKlog(log.text));
      const measured = extractFeatures(roast).thermalDose;
      const predicted = profileDoseAtLevel(parseKpro(kpro.text), roast.nativeLevel!)!.dose;
      // Real roasts have measured 6-12.5% above their curve; within 15% is close enough to choose a level step.
      expect(Math.abs(measured / predicted - 1)).toBeLessThan(0.15);
    });
  }
});

describe.skipIf(!PRIVATE_PROFILES.some((p) => headerValue(p.text, "profile_short_name")?.trim() === "Robusta"))("level steps on the real Robusta profile", () => {
  const robusta = parseKpro(PRIVATE_PROFILES.find((p) => headerValue(p.text, "profile_short_name")?.trim() === "Robusta")!.text);

  it("are uneven: 2.6 to 3.0 adds far more than 3.0 to 3.4", () => {
    const d = (l: number) => profileDoseAtLevel(robusta, l)!.dose;
    expect(d(3.0) / d(2.6) - 1).toBeGreaterThan(0.1);
    expect(d(3.4) / d(3.0) - 1).toBeLessThan(0.05);
  });

  it("take 15% off level 3.0 at level 2.5", () => {
    const from = profileDoseAtLevel(robusta, 3)!;
    expect(levelForDose(robusta, from.dose * 0.85)!.level).toBe(2.5);
  });
});

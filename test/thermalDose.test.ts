import { describe, expect, it } from "vitest";
import { levelAfterChange, levelForThermalDose, profileThermalDoseAtLevel } from "../src/adapters/kaffelogic/thermalDose.js";
import { parseKlog, parseKpro } from "../src/adapters/kaffelogic/parse.js";
import { STOCK_PROFILES } from "../src/adapters/kaffelogic/startingProfiles.js";
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
  it("is minutes at 200 °C: ten minutes at 200 °C is a thermal dose of 10", () => {
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
    const baseline = extractFeatures(log).thermalDose;
    expect(baseline).toBeGreaterThan(0);
    const hotter = extractFeatures({ ...log, samples: log.samples.map((s) => ({ ...s, beanTemp: s.beanTemp + 5 })) }).thermalDose;
    expect(hotter).toBeGreaterThan(baseline * 1.2);
  });
});

describe("a profile's thermal dose at a level", () => {
  const profile = parseKpro(PROFILE);

  it("rises with the level", () => {
    const thermalDoses = [1, 2, 3, 4, 5].map((l) => profileThermalDoseAtLevel(profile, l)!.thermalDose);
    for (let i = 1; i < thermalDoses.length; i++) expect(thermalDoses[i]).toBeGreaterThan(thermalDoses[i - 1]);
  });

  it("turns a target thermal dose back into the level that gives it", () => {
    const at = profileThermalDoseAtLevel(profile, 3.3)!;
    expect(at).toMatchObject({ level: 3.3, endTemp: 219.9 });
    expect(levelForThermalDose(profile, at.thermalDose)!.level).toBe(3.3);
  });

  it("moves a level by a percentage of its thermal dose, in either direction", () => {
    const from = profileThermalDoseAtLevel(profile, 3.3)!;
    const less = levelAfterChange(profile, from, -10)!;
    const more = levelAfterChange(profile, from, 10)!;
    expect(less.level).toBeLessThan(3.3);
    expect(more.level).toBeGreaterThan(3.3);
    // The 0.1 level grid on this line lands within about 1% of the target (measured: -10% gives 2.8 at -9.8%, +10% gives 3.9 at +10.7%).
    expect(Math.abs(less.thermalDose / from.thermalDose - 0.9)).toBeLessThan(0.02);
    expect(Math.abs(more.thermalDose / from.thermalDose - 1.1)).toBeLessThan(0.02);
    expect(levelAfterChange(profile, from, 0)!.level).toBe(3.3);
  });

  it("answers for the level asked, whatever was asked for before", () => {
    // The made-up profile's end temperatures for levels 0..6 are 204, 209, 214, 219, 222, 224, 226.
    const endTemps = new Map([[3, 219], [6, 226], [0.5, 206.5]]);
    for (const level of [3, 6, 3, 0.5, 3]) {
      const d = profileThermalDoseAtLevel(profile, level)!;
      expect(d.level).toBe(level);
      expect(d.endTemp).toBeCloseTo(endTemps.get(level)!, 9);
    }
  });

  it("gives a new object each call and leaves earlier answers alone, so a search can't overwrite them", () => {
    const first = profileThermalDoseAtLevel(profile, 3)!;
    const copy = { ...first };
    const again = profileThermalDoseAtLevel(profile, 3)!;
    const found = levelForThermalDose(profile, first.thermalDose * 0.85)!;
    expect(again).toEqual(first);
    expect(again).not.toBe(first);
    expect(found).not.toBe(first);
    // Scanning every level (as the search does) changed nothing the first answer holds.
    expect(first).toEqual(copy);
  });

  it("finds each level it is given the thermal dose of", () => {
    for (const level of [1, 2.5, 3, 4.2]) {
      const d = profileThermalDoseAtLevel(profile, level)!;
      expect(levelForThermalDose(profile, d.thermalDose)!.level).toBe(level);
    }
  });
});

describe("stored roasts", () => {
  it("get the thermal dose when their features are recomputed from the stored log", async () => {
    const db = await migratedDb();
    const { beanId } = await addBean(db, { name: "Old", species: "arabica", decaf: false, process: "washed", drinkWhen: "soon", agtronTarget: 55, tastingBrew: "pourover" });
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
    const predicted = profileThermalDoseAtLevel(parseKpro(PROFILE), 3.3)!.thermalDose;
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

describe.skipIf(!pairs.length)("the profile curve predicts a real roast's thermal dose", () => {
  for (const { log, kpro } of pairs) {
    it(`${log.file} (${headerValue(log.text, "profile_short_name")?.trim()} level ${Number(headerValue(log.text, "roasting_level"))})`, () => {
      const roast = kaffelogicToRoastLog(parseKlog(log.text));
      const measured = extractFeatures(roast).thermalDose;
      const predicted = profileThermalDoseAtLevel(parseKpro(kpro.text), roast.nativeLevel!)!.thermalDose;
      // Real roasts have measured 6-12.5% above their curve; within 15% is close enough to choose a level step.
      expect(measured / predicted, "measured is at or above the curve").toBeGreaterThan(1);
      expect(measured / predicted - 1).toBeLessThan(0.15);
    });
  }
});

// The stock Robusta profile, found by content. A roaster's own saved copy of it (same name, another
// modified stamp) would make the numbers below ambiguous, so the block runs only when there is one stamp.
const ROBUSTA_FILES = PRIVATE_PROFILES.filter((p) => headerValue(p.text, "profile_short_name")?.trim() === "Robusta");
const ROBUSTA_UNAMBIGUOUS = new Set(ROBUSTA_FILES.map((p) => headerValue(p.text, "profile_modified")?.trim())).size === 1;

describe.skipIf(!ROBUSTA_UNAMBIGUOUS)("level steps on the real Robusta profile", () => {
  const file = ROBUSTA_FILES[0];
  const robusta = parseKpro(file.text);

  it("is the stock Robusta profile, so the numbers below mean what they say", () => {
    expect(robusta.roastLevels, file.file).toEqual(STOCK_PROFILES.Robusta.roastLevels);
  });

  it("are uneven: 2.6 to 3.0 adds far more than 3.0 to 3.4", () => {
    const d = (l: number) => profileThermalDoseAtLevel(robusta, l)!.thermalDose;
    expect(d(3.0) / d(2.6) - 1).toBeGreaterThan(0.1);
    expect(d(3.4) / d(3.0) - 1).toBeLessThan(0.05);
  });

  it("take 15% off level 3.0 at level 2.5", () => {
    const from = profileThermalDoseAtLevel(robusta, 3);
    expect(from, "the profile reaches level 3").toBeDefined();
    const target = from!.thermalDose * 0.85;
    const got = levelForThermalDose(robusta, target);
    // The numbers as text: JSON would print NaN as null and drop undefined fields.
    const context = [
      `file ${file.file}, modified ${headerValue(file.text, "profile_modified") ?? "<none>"}, ${file.text.length} characters`,
      `from ${JSON.stringify(from)}`,
      `target ${String(target)}`,
      `got ${JSON.stringify(got)}`,
      `same object: ${from === got}`,
      `level 3 asked again: ${JSON.stringify(profileThermalDoseAtLevel(robusta, 3))}`,
    ].join("; ");
    // A failure seen once, with `from` and `got` both showing level 6, has not been explained, and this
    // module has never returned a shared object, so the line above tells a recurrence apart from the guard
    // tests earlier in this file: a different file than expected, the two results being one object, the
    // same call answering differently the second time, or a search that found no level at all.
    expect(got, context).toBeDefined();
    // The thermal dose first: a level that is far from the target means the search fell off its end, not that 2.5 is wrong.
    expect(Math.abs(got!.thermalDose / target - 1), context).toBeLessThan(0.05);
    expect(got!.level, context).toBe(2.5);
  });
});

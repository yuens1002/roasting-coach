import { describe, expect, it } from "vitest";
import { levelToTemp, parseKpro, timeCurveReaches } from "../src/adapters/kaffelogic/parse.js";
import { STOCK_PROFILES, altitudeBand, selectStartingProfile, startingLevel } from "../src/adapters/kaffelogic/startingProfiles.js";
import { INTAKE_FIELDS, type Intake } from "../src/core/intake.js";
import { PRIVATE_PROFILES, headerValue } from "./privateFiles.js";

const base: Intake = { name: "test", species: "arabica", decaf: false, process: "unknown", drinkWhen: "soon" };

describe("selectStartingProfile", () => {
  it("uses the altitude band and timing by default, at the level the profile recommends", () => {
    const s = selectStartingProfile({ ...base, altitudeM: 1850 });
    expect(s.profile.name).toBe("1500-2000m RTD");
    expect(s.level.level).toBe(3.1);
  });

  it("falls back to 1500-2000m when altitude is unknown", () => {
    expect(selectStartingProfile({ ...base, drinkWhen: "rest" }).profile.name).toBe("1500-2000m Rest");
  });

  it("puts band edges in the higher band", () => {
    expect(altitudeBand(1199)).toBe("0-1200m");
    expect(altitudeBand(1200)).toBe("1200-1500m");
    expect(altitudeBand(2000)).toBe("2000-2700m");
  });

  it("prefers the process profiles for washed or natural coffee, offering the altitude profile as the alternative", () => {
    const natural = selectStartingProfile({ ...base, process: "natural", altitudeM: 2100 });
    expect(natural.profile.name).toBe("KL Natural");
    expect(natural.level.level).toBe(1.4);
    expect(natural.alternative).toBe("2000-2700m RTD");
    const washed = selectStartingProfile({ ...base, process: "washed", altitudeM: 1400 });
    expect(washed.profile.name).toBe("KL Washed");
    expect(washed.alternative).toBe("1200-1500m RTD");
  });

  it("lets robusta and decaf override everything else", () => {
    expect(selectStartingProfile({ ...base, species: "robusta", decaf: true, process: "natural" }).profile.name).toBe("Robusta");
    expect(selectStartingProfile({ ...base, decaf: true }).profile.name).toBe("Decaf");
  });

  it("does not ask how the bean will be brewed, and starts every profile at the level its own file recommends", () => {
    // Roasting is not aimed at a brew method (docs/ROADMAP.md, 2026-10-09): no brew label picks a level.
    expect(INTAKE_FIELDS.map((f) => f.id)).not.toContain("goal");
    for (const profile of Object.values(STOCK_PROFILES)) expect(startingLevel(profile), profile.name).toBe(profile.recommended);
  });
});

// The table's numbers must match the real files when they're available locally.
const stockNames = new Set(Object.keys(STOCK_PROFILES));
const presentStock = PRIVATE_PROFILES.filter((f) => stockNames.has(headerValue(f.text, "profile_short_name")?.trim() ?? ""));

describe("starting-profile table matches the stock files", () => {
  // Once any stock profile is in the local library, all of them must be: a missing or renamed
  // file would otherwise skip its check silently.
  it.skipIf(!presentStock.length)("finds every stock profile once the library has any", () => {
    const found = new Set(presentStock.map((f) => headerValue(f.text, "profile_short_name")!.trim()));
    expect([...stockNames].filter((n) => !found.has(n))).toEqual([]);
  });

  for (const name of Object.keys(STOCK_PROFILES)) {
    const stock = PRIVATE_PROFILES.find((f) => headerValue(f.text, "profile_short_name")?.trim() === name);
    it.skipIf(!stock)(name, () => {
      const p = parseKpro(stock!.text);
      expect(p.roastLevels).toEqual(STOCK_PROFILES[name].roastLevels);
      expect(p.expectFirstCrack).toBe(STOCK_PROFILES[name].expectFirstCrack);
      // The level a bean starts at is the one the profile's own file recommends.
      expect(STOCK_PROFILES[name].recommended.level).toBe(Number(headerValue(stock!.text, "recommended_level")));
      for (const lv of [STOCK_PROFILES[name].recommended, ...Object.values(STOCK_PROFILES[name].levels)]) {
        expect(levelToTemp(p.roastLevels, lv.level)).toBeCloseTo(lv.endTemp, 1);
        const t = Math.round(timeCurveReaches(p.roastCurve, levelToTemp(p.roastLevels, lv.level)!)!);
        expect(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`).toBe(lv.endsAt);
      }
    });
  }
});

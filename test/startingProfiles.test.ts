import { describe, expect, it } from "vitest";
import { kaffelogicAdviceContext } from "../src/adapters/kaffelogic/adviceContext.js";
import { levelToTemp, parseKpro, timeCurveReaches } from "../src/adapters/kaffelogic/parse.js";
import { type ColourReading, STOCK_PROFILES, altitudeBand, levelForAgtron, placeColour, placementSay, selectStartingProfile } from "../src/adapters/kaffelogic/startingProfiles.js";
import { SCA_TILES } from "../src/core/roastColour.js";
import { INTAKE_FIELDS, type Intake } from "../src/core/intake.js";
import { PRIVATE_PROFILES, headerValue } from "./privateFiles.js";

const base: Intake = { name: "test", species: "arabica", decaf: false, process: "unknown", drinkWhen: "soon", agtronTarget: 55, tastingBrew: "pourover" };

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
    expect(natural.level.level).toBe(1.3);
    expect(natural.alternative).toBe("2000-2700m RTD");
    const washed = selectStartingProfile({ ...base, process: "washed", altitudeM: 1400 });
    expect(washed.profile.name).toBe("KL Washed");
    expect(washed.alternative).toBe("1200-1500m RTD");
  });

  it("lets robusta and decaf override everything else", () => {
    expect(selectStartingProfile({ ...base, species: "robusta", decaf: true, process: "natural" }).profile.name).toBe("Robusta");
    expect(selectStartingProfile({ ...base, decaf: true }).profile.name).toBe("Decaf");
  });

  it("does not ask how the bean will be brewed for, and picks no profile or level by the brew it is tasted with: the roast colour does", () => {
    // Roasting is not aimed at a brew method (docs/ROADMAP.md, 2026-10-09).
    expect(INTAKE_FIELDS.map((f) => f.id)).not.toContain("goal");
    for (const brew of ["pourover", "immersion", "aeropress", "espresso", "moka", "other"]) {
      for (const intake of [base, { ...base, species: "robusta" as const }, { ...base, process: "washed" as const, altitudeM: 1850 }]) {
        expect(selectStartingProfile({ ...intake, tastingBrew: brew }), `${intake.species} ${intake.process} tasted as ${brew}`).toEqual(selectStartingProfile({ ...intake, tastingBrew: "pourover" }));
      }
    }
  });
});

describe("the Agtron colour being shot for picks the first level on the profile", () => {
  const robusta: Intake = { ...base, species: "robusta" };

  it("places the profile's labelled levels at Agtron 65, 55 and 45, exactly", () => {
    const at = (agtronTarget: number) => selectStartingProfile({ ...robusta, agtronTarget }).level;
    expect(at(65)).toMatchObject({ level: 2.2, endTemp: 220.1 });
    expect(at(55)).toMatchObject({ level: 3.0, endTemp: 223.4 });
    expect(at(45)).toMatchObject({ level: 4.8, endTemp: 227.1 });
  });

  it("runs from lighter to darker as the number falls, past the labelled levels", () => {
    const levels = [95, 85, 75, 65, 55, 45, 35, 25].map((agtronTarget) => selectStartingProfile({ ...robusta, agtronTarget }).level.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(new Set(levels).size).toBe(levels.length);
  });

  it("says it is an approximation from the profile's labelled levels, which readings will replace, and that the cup decides after the first roast", () => {
    const start = selectStartingProfile({ ...robusta, agtronTarget: 55 });
    expect(start.level.colour).toMatchObject({ agtron: 55, basis: "approximation", readings: 0 });
    expect(start.why).toContain("You are shooting for Agtron 55 (medium). The profile's file gives no Agtron, so this level is an approximation from its own labelled levels, and colour readings from your roasts on this profile replace it.");
    expect(start.why).toContain("The defects in the cup decide each step after the first roast.");
  });

  it("moves with the profile: the same colour is a different level on each", () => {
    const medium = (intake: Partial<Intake>) => selectStartingProfile({ ...base, agtronTarget: 55, ...intake }).level.level;
    expect(medium({ altitudeM: 1850 })).toBe(3.1);
    expect(medium({ altitudeM: 2100, drinkWhen: "rest" })).toBe(3.2);
    expect(medium({ decaf: true })).toBe(3.0);
    expect(medium({ process: "natural" })).toBe(1.3);
  });

  it("starts a profile whose file names no level as dark as the target on the altitude profile, which does", () => {
    // The KL profiles label light-to-medium levels only (Agtron 65 and 55 here): nothing darker.
    const washed = { ...base, process: "washed", altitudeM: 1850, drinkWhen: "rest" } as const;
    const dark = selectStartingProfile({ ...washed, agtronTarget: 35 });
    expect(dark.profile.name).toBe("1500-2000m Rest");
    expect(dark.level.level).toBe(4.8);
    expect(dark.alternative).toBeUndefined();
    expect(dark.why).toContain("KL Washed is written for washed coffees, but its file names no level as dark as Agtron 35, so this uses 1500-2000m Rest, which does.");
    const mediumDark = selectStartingProfile({ ...washed, agtronTarget: 45 });
    expect(mediumDark.profile.name).toBe("1500-2000m Rest");
    expect(mediumDark.level.level).toBe(4.3);
    // Lighter than its labelled levels is fine: it runs lighter along its own ladder.
    const light = selectStartingProfile({ ...washed, agtronTarget: 85 });
    expect(light.profile.name).toBe("KL Washed");
    expect(light.level.level).toBe(0.8);
    expect(light.alternative).toBe("1500-2000m Rest");
  });

  it("places every tile of the scale on every profile a bean can start on, except that the KL profiles go no darker than Agtron 55", () => {
    const tiles = SCA_TILES.map((t) => t.agtron);
    // Cupping is never picked, and the legacy and fan variants are not selectable.
    const startable = Object.values(STOCK_PROFILES).filter((p) => p.selectable !== false && p.name !== "Cupping");
    expect(startable.length).toBeGreaterThan(10);
    for (const profile of startable) {
      const placed = tiles.filter((agtron) => levelForAgtron(profile, agtron));
      expect(placed, profile.name).toEqual(profile.name.startsWith("KL ") ? tiles.filter((agtron) => agtron >= 55) : tiles);
    }
  });

  it("says when the profile's lightest or darkest level is as near as it gets", () => {
    const start = selectStartingProfile({ ...base, altitudeM: 1850, agtronTarget: 25 });
    expect(start.level).toMatchObject({ level: 6, colour: { reach: "darkest" } });
    expect(start.why).toContain("The darkest level this profile has is as near to Agtron 25 as it gets.");
  });

  describe("with the roaster's own colour readings on the profile", () => {
    // Two roasts on Robusta: level 2 (219.3 °C) read Agtron 70 and level 4 (224.4 °C) read Agtron 50.
    const readings: ColourReading[] = [
      { profile: "Robusta", endTempC: 219.3, agtron: 70 },
      { profile: "Robusta", endTempC: 224.4, agtron: 50 },
    ];
    const at = (agtronTarget: number, found: readonly ColourReading[] = readings) => selectStartingProfile({ ...robusta, agtronTarget }, found);

    it("places the target on the line through them instead", () => {
      // The line gives Agtron 60 at 221.85 °C, between levels 2 and 3 (219.3 and 223.4).
      expect(at(60).level.level).toBeCloseTo(2.6, 1);
      expect(at(60).level.colour).toMatchObject({ basis: "readings", readings: 2 });
      expect(at(60).why.join(" ")).toContain("Your 2 colour readings on this profile place that at this level.");
      expect(at(70).level.level).toBe(2);
    });

    it("applies to the profile they were read on, not another", () => {
      const decaf = selectStartingProfile({ ...base, decaf: true, agtronTarget: 60 }, readings);
      expect(decaf.level.colour?.basis).toBe("approximation");
    });

    it("is not used when the readings cannot give a line: one reading, readings a degree apart, or a hotter end reading lighter", () => {
      for (const found of [
        [readings[0]],
        [readings[0], { profile: "Robusta", endTempC: 220.3, agtron: 60 }],
        [readings[0], { profile: "Robusta", endTempC: 224.4, agtron: 80 }],
      ]) {
        expect(at(60, found).level.colour?.basis, JSON.stringify(found)).toBe("approximation");
      }
    });
  });

  describe("placing a colour the roaster names later (level-for)", () => {
    it("gives the level, its end temperature and the reasons, and says what to do with it", () => {
      const placed = placeColour("Robusta", 65);
      expect(placed).toMatchObject({ ok: true, level: { level: 2.2, endTemp: 220.1 } });
      if (!placed.ok) return;
      expect(placementSay(placed, "9:47")).toBe(
        "You are shooting for Agtron 65 (light-medium). The profile's file gives no Agtron, so this level is an approximation from its own labelled levels, and colour readings from your roasts on this profile replace it. The defects in the cup decide each step after the first roast. On Robusta, try level 2.2: it ends at 220.1 °C, reached at 9:47. Shall I record that as the next version, with your own words as the reason?",
      );
      expect(placementSay(placed)).not.toContain("reached at");
    });

    it("uses the roaster's readings when they give a line, and says so", () => {
      const readings: ColourReading[] = [{ profile: "Robusta", endTempC: 219.3, agtron: 70 }, { profile: "Robusta", endTempC: 224.4, agtron: 50 }];
      const placed = placeColour("Robusta", 60, readings);
      expect(placed).toMatchObject({ ok: true, level: { colour: { basis: "readings", readings: 2 } } });
    });

    it("keeps a KL profile to what its file names even with the roaster's readings on it, rather than extrapolating a two-point line", () => {
      const readings: ColourReading[] = [{ profile: "KL Washed", endTempC: 214.4, agtron: 80 }, { profile: "KL Washed", endTempC: 218.2, agtron: 62 }];
      expect(placeColour("KL Washed", 35, readings)).toMatchObject({ ok: false });
      expect(placeColour("KL Washed", 60, readings)).toMatchObject({ ok: true, level: { colour: { basis: "readings" } } });
    });

    it("says in plain words why it cannot: a profile that is not a stock one, a colour off the scale, a colour the profile does not go as dark as", () => {
      expect(placeColour("My Bean", 65)).toEqual({ ok: false, problem: expect.stringContaining('"My Bean" is not a stock profile a level can be placed on') });
      expect(placeColour("Robusta_inc_fan", 65)).toMatchObject({ ok: false });
      expect(placeColour("Robusta", 20)).toEqual({ ok: false, problem: "Agtron must be between 25 and 95; got 20." });
      expect(placeColour("Robusta", 120)).toMatchObject({ ok: false });
      expect(placeColour("KL Washed", 35)).toEqual({ ok: false, problem: "KL Washed names no level as dark as Agtron 35. A bean that dark starts on an altitude profile, which does." });
      expect(placeColour("KL Washed", 85)).toMatchObject({ ok: true });
      // Cupping labels one level only, so there is nothing to place a colour between.
      expect(placeColour("Cupping", 85)).toEqual({ ok: false, problem: "Cupping labels too few levels to place a colour on. Name a stock profile a bean starts on." });
    });
  });

  it("gives the alternative profile its level for the same colour", () => {
    const natural: Intake = { ...base, process: "natural", altitudeM: 2100 };
    const alternativeLevel = (agtronTarget: number) => kaffelogicAdviceContext({ ...natural, agtronTarget }).alternative?.level;
    expect(alternativeLevel(85)).toBe(1.3);
    expect(alternativeLevel(55)).toBe(3.2);
    // A colour KL Natural cannot reach starts on the altitude profile itself, so it has no other to switch to.
    expect(alternativeLevel(35)).toBeUndefined();
  });

  it("carries the bean's tasting brew to the rules", () => {
    expect(kaffelogicAdviceContext({ ...base, tastingBrew: "espresso" }).tastingBrew).toBe("espresso");
    expect(kaffelogicAdviceContext(base).tastingBrew).toBe("pourover");
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

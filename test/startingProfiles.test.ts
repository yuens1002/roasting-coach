import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { levelToTemp, parseKpro, timeCurveReaches } from "../src/adapters/kaffelogic/parse.js";
import { STOCK_PROFILES, altitudeBand, selectStartingProfile } from "../src/adapters/kaffelogic/startingProfiles.js";
import type { Intake } from "../src/core/intake.js";

const base: Intake = { name: "test", species: "arabica", decaf: false, process: "unknown", goal: "espresso", drinkWhen: "soon" };

describe("selectStartingProfile", () => {
  it("uses the altitude band and timing by default", () => {
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

  it("prefers the process profiles for washed or natural filter coffee", () => {
    const s = selectStartingProfile({ ...base, process: "natural", goal: "filter", altitudeM: 2100 });
    expect(s.profile.name).toBe("KL Natural");
    expect(s.level.level).toBe(1.0);
    expect(s.alternative).toBe("2000-2700m RTD");
  });

  it("keeps altitude profiles for washed espresso, offering KL Washed as the alternative", () => {
    const s = selectStartingProfile({ ...base, process: "washed", altitudeM: 1400 });
    expect(s.profile.name).toBe("1200-1500m RTD");
    expect(s.alternative).toBe("KL Washed");
  });

  it("lets robusta and decaf override everything else", () => {
    expect(selectStartingProfile({ ...base, species: "robusta", decaf: true, process: "natural", goal: "filter" }).profile.name).toBe("Robusta");
    expect(selectStartingProfile({ ...base, decaf: true, goal: "filter" }).profile.name).toBe("Decaf");
  });

  it("uses espresso levels when brewing both ways", () => {
    const s = selectStartingProfile({ ...base, goal: "both", altitudeM: 1600 });
    expect(s.goal).toBe("espresso");
    expect(s.why[0]).toMatch(/filter and espresso/);
  });

  it("sends cupping to the Cupping profile unless the process profile covers it", () => {
    expect(selectStartingProfile({ ...base, goal: "cupping" }).profile.name).toBe("Cupping");
    expect(selectStartingProfile({ ...base, goal: "cupping", process: "washed" }).profile.name).toBe("KL Washed");
  });
});

// The table's numbers must match the real files when they're available locally.
const PRIVATE = join(__dirname, "..", "fixtures", "private");
const FILES: Record<string, string> = {
  "0-1200m RTD": "0-1200m_RTD_v1.0", "0-1200m Rest": "0-1200m_Rest_v1.0", "1200-1500m RTD": "1200-1500m_RTD_v1.0",
  "1200-1500m Rest": "1200-1500m_Rest_v1.0", "1500-2000m RTD": "1500-2000m_RTD_v1.0", "1500-2000m Rest": "1500-2000m_Rest_v1.0",
  "2000-2700m RTD": "2000-2700m_RTD_v1.0", "2000-2700m Rest": "2000-2700m_Rest_v1.0", "KL Washed": "KL_Washed_v1.1",
  "KL Natural": "KL_Natural_v1.1", Cupping: "Cupping_v1.0", Decaf: "Decaf_v1.0", Robusta: "Robusta_v1.0",
};

describe.skipIf(!existsSync(PRIVATE))("starting-profile table matches the stock files", () => {
  for (const [name, file] of Object.entries(FILES)) {
    it(name, () => {
      const p = parseKpro(readFileSync(join(PRIVATE, `${file}.kpro`), "utf8"));
      for (const lv of Object.values(STOCK_PROFILES[name].levels)) {
        expect(levelToTemp(p.roastLevels, lv.level)).toBeCloseTo(lv.endTemp, 1);
        const t = Math.round(timeCurveReaches(p.roastCurve, levelToTemp(p.roastLevels, lv.level)!)!);
        expect(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`).toBe(lv.endsAt);
      }
    });
  }
});

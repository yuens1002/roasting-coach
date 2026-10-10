import { describe, expect, it } from "vitest";
import { parseKpro } from "../src/adapters/kaffelogic/parse.js";
import { STOCK_PROFILES, levelForAgtron } from "../src/adapters/kaffelogic/startingProfiles.js";
import { STEP_TABLE_STEPS, stepTable } from "../src/adapters/kaffelogic/stepTable.js";
import { levelAfterChange, levelForThermalDose, nearestThermalDose, profileThermalDoseAtLevel, thermalDoseLadder } from "../src/adapters/kaffelogic/thermalDose.js";
import { SCA_TILES } from "../src/core/roastColour.js";
import { PROFILE } from "./syntheticLog.js";

// The made-up "Test line" profile stands in for a stock profile, because the real files are never committed.
const profile = parseKpro(PROFILE);
const asRobusta = { Robusta: profile };

describe("the step table", () => {
  const rows = stepTable(asRobusta).split("\n");

  it("has the rules' two step sizes each way as columns, and one row per profile it was given", () => {
    expect(STEP_TABLE_STEPS).toEqual([-15, -10, 10, 15]);
    expect(rows[0]).toBe("| Profile | Starting levels | −15% | −10% | +10% | +15% |");
    expect(rows).toHaveLength(3);
    expect(rows[2]).toMatch(/^\| Robusta \| /);
  });

  it("gives ranges of levels moved, not one number at one starting level", () => {
    const cells = rows[2].split("|").slice(2, -1).map((c) => c.trim());
    expect(cells).toHaveLength(1 + STEP_TABLE_STEPS.length);
    for (const cell of cells) expect(cell).toMatch(/^\d\.\d to \d\.\d$/);
    // The starting levels run lighter to darker, and each range runs fewest to most.
    for (const cell of cells) {
      const [low, high] = cell.split(" to ").map(Number);
      expect(low, cell).toBeLessThanOrEqual(high);
    }
  });

  it("leaves out a profile it was not given, and one a bean never starts on", () => {
    expect(stepTable({}).split("\n")).toHaveLength(2);
    expect(stepTable({ Robusta_inc_fan: profile, "K-logic classic": profile }).split("\n")).toHaveLength(2);
  });

  it("states the fewest and most levels the advice's own step (levelAfterChange) moves from the levels it covers", () => {
    const cells = rows[2].split("|").slice(1, -1).map((c) => c.trim());
    const [lowStart, highStart] = cells[1].split(" to ").map(Number);
    // Recomputed through levelAfterChange, a separate path from the table's ladder search; a step that leaves the profile's range goes nowhere and is not counted.
    const lightest = profileThermalDoseAtLevel(profile, 0)!.thermalDose;
    const darkest = profileThermalDoseAtLevel(profile, 6)!.thermalDose;
    STEP_TABLE_STEPS.forEach((step, i) => {
      const moved: number[] = [];
      for (let tenth = Math.round(lowStart * 10); tenth <= Math.round(highStart * 10); tenth++) {
        const from = profileThermalDoseAtLevel(profile, tenth / 10)!;
        const target = from.thermalDose * (1 + step / 100);
        if (target < lightest || target > darkest) continue;
        moved.push(Math.round(Math.abs(levelAfterChange(profile, from, step)!.level - tenth / 10) * 10) / 10);
      }
      expect(cells[2 + i], `${step}%`).toBe(`${Math.min(...moved).toFixed(1)} to ${Math.max(...moved).toFixed(1)}`);
    });
    // The starting levels are where the eight tiles of the Agtron scale land on the profile.
    expect(lowStart).toBe(Math.min(...SCA_TILES.map((t) => levelForAgtron(STOCK_PROFILES.Robusta, t.agtron)!.level)));
    expect(highStart).toBe(Math.max(...SCA_TILES.map((t) => levelForAgtron(STOCK_PROFILES.Robusta, t.agtron)!.level)));
  });

  it("gives a bigger step a bigger or equal range at the same end of it", () => {
    const cells = rows[2].split("|").slice(3, -1).map((c) => c.trim().split(" to ").map(Number));
    // −15% against −10%, and +10% against +15%: the larger step moves at least as many levels at its fewest and its most.
    expect(cells[0][0]).toBeGreaterThanOrEqual(cells[1][0]);
    expect(cells[0][1]).toBeGreaterThanOrEqual(cells[1][1]);
    expect(cells[3][0]).toBeGreaterThanOrEqual(cells[2][0]);
    expect(cells[3][1]).toBeGreaterThanOrEqual(cells[2][1]);
  });

  it("leaves out the Cupping profile, which labels one level only", () => {
    expect(stepTable({ Cupping: profile }).split("\n")).toHaveLength(2);
  });
});

describe("the thermal dose ladder", () => {
  it("is the profile's thermal dose at every level from 0 to 6 in tenths, lightest first, and a hotter end is a larger thermal dose", () => {
    const ladder = thermalDoseLadder(profile);
    expect(ladder).toHaveLength(61);
    expect(ladder.map((d) => d.level)).toEqual(Array.from({ length: 61 }, (_, i) => i / 10));
    for (let i = 1; i < ladder.length; i++) expect(ladder[i].thermalDose, `level ${ladder[i].level}`).toBeGreaterThanOrEqual(ladder[i - 1].thermalDose);
  });

  it("finds the level whose thermal dose is nearest a target, the lighter one on a tie, and the ends beyond the ladder", () => {
    const ladder = thermalDoseLadder(profile);
    const at = (level: number) => profileThermalDoseAtLevel(profile, level)!;
    expect(levelForThermalDose(profile, at(3.3).thermalDose)?.level).toBe(3.3);
    expect(nearestThermalDose(ladder, 0)?.level).toBe(0);
    expect(nearestThermalDose(ladder, 1e9)?.level).toBe(6);
    expect(nearestThermalDose([], 5)).toBeUndefined();
    const between = (at(3.3).thermalDose + at(3.4).thermalDose) / 2;
    expect(nearestThermalDose(ladder, between)?.level).toBe(3.3);
  });
});

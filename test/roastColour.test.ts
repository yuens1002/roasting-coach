import { describe, expect, it } from "vitest";
import { AGTRON_MAX, AGTRON_MIN, MIN_SPREAD_C, SCA_TILES, agtronName, endTempForAgtron, fitColourLine } from "../src/core/roastColour.js";

describe("the SCA / Agtron roast colour scale", () => {
  it("runs from 95 (very light) to 25 (extremely dark) in eight tiles of ten", () => {
    expect([AGTRON_MAX, AGTRON_MIN]).toEqual([95, 25]);
    expect(SCA_TILES.map((t) => t.agtron)).toEqual([95, 85, 75, 65, 55, 45, 35, 25]);
    expect(SCA_TILES[0].name).toBe("very light");
    expect(SCA_TILES[SCA_TILES.length - 1].name).toBe("extremely dark");
  });

  it("names a number by the tile nearest it", () => {
    expect(agtronName(95)).toBe("very light");
    expect(agtronName(78)).toBe("moderately light");
    expect(agtronName(52)).toBe("medium");
    expect(agtronName(25)).toBe("extremely dark");
  });

  it("names no brew method: the scale is a colour", () => {
    for (const tile of SCA_TILES) expect(tile.name).not.toMatch(/espresso|filter|pour|press|brew/);
  });
});

describe("fitting a roaster's colour readings to an end temperature", () => {
  const point = (endTempC: number, agtron: number) => ({ endTempC, agtron });

  it("fits the line through two readings, and puts a number at the temperature the line gives", () => {
    const line = fitColourLine([point(220, 70), point(225, 50)])!;
    expect(line.slope).toBeCloseTo(-4, 6);
    expect(line.readings).toBe(2);
    expect(endTempForAgtron(line, 60)).toBeCloseTo(222.5, 6);
    expect(endTempForAgtron(line, 70)).toBeCloseTo(220, 6);
  });

  it("fits the least-squares line through more than two", () => {
    const line = fitColourLine([point(220, 70), point(222, 62), point(225, 50), point(228, 38)])!;
    expect(line.readings).toBe(4);
    expect(line.slope).toBeLessThan(0);
    // The line passes through the means.
    const meanX = (220 + 222 + 225 + 228) / 4;
    const meanY = (70 + 62 + 50 + 38) / 4;
    expect(line.intercept + line.slope * meanX).toBeCloseTo(meanY, 6);
  });

  it("gives no line from fewer than two readings, from readings too close in temperature, or from a hotter end reading lighter", () => {
    expect(fitColourLine([])).toBeUndefined();
    expect(fitColourLine([point(220, 70)])).toBeUndefined();
    expect(fitColourLine([point(220, 70), point(220 + MIN_SPREAD_C - 0.1, 60)])).toBeUndefined();
    expect(fitColourLine([point(220, 70), point(225, 80)])).toBeUndefined();
    expect(fitColourLine([point(220, 70), point(225, 70)])).toBeUndefined();
  });

  it("can be asked for a different spread: the profile's own labelled levels sit closer together than a roaster's readings need to", () => {
    expect(fitColourLine([point(216.5, 65), point(217.6, 55)], 0)).toBeDefined();
    expect(fitColourLine([point(216.5, 65), point(217.6, 55)])).toBeUndefined();
  });
});

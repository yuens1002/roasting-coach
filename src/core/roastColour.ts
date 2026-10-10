// The roast colour scale the tool speaks in: the SCA / Agtron scale, 95 (very light) to 25 (extremely dark). A roaster's
// target and a colour-meter reading are both on it, whatever the machine; how the machine's own level relates to it is the
// machine adapter's business (adapters/kaffelogic/startingProfiles.ts). No brew method is part of it.

/** The ends of the scale. Higher is lighter. */
export const AGTRON_MIN = 25;
export const AGTRON_MAX = 95;

/** The eight SCA tiles. The numbers are the scale; the names differ a little between sources. */
export const SCA_TILES: readonly { agtron: number; name: string }[] = [
  { agtron: 95, name: "very light" },
  { agtron: 85, name: "light" },
  { agtron: 75, name: "moderately light" },
  { agtron: 65, name: "light-medium" },
  { agtron: 55, name: "medium" },
  { agtron: 45, name: "medium-dark" },
  { agtron: 35, name: "dark" },
  { agtron: 25, name: "extremely dark" },
];

/** The name of the tile nearest an Agtron number, e.g. 78 is "moderately light". */
export const agtronName = (agtron: number): string => SCA_TILES.reduce((best, tile) => (Math.abs(tile.agtron - agtron) < Math.abs(best.agtron - agtron) ? tile : best)).name;

/** A colour reading on a roast, with the bean temperature that roast ended at. */
export interface ColourPoint {
  endTempC: number;
  agtron: number;
}

/** Agtron as a straight line of the end temperature: agtron = intercept + slope * endTempC. A hotter end is a darker roast, so the slope is negative. */
export interface ColourLine {
  slope: number;
  intercept: number;
  /** How many readings the line was fitted to; 0 for a line that comes from no reading. */
  readings: number;
}

/** Readings closer together in end temperature than this say nothing about the slope. */
export const MIN_SPREAD_C = 3;

/**
 * The least-squares line through a roaster's readings, or undefined when they cannot give one: fewer than two readings,
 * end temperatures closer than MIN_SPREAD_C, or a line that gets lighter as the end gets hotter (noise, not colour).
 */
export function fitColourLine(points: readonly ColourPoint[], minSpreadC = MIN_SPREAD_C): ColourLine | undefined {
  if (points.length < 2) return undefined;
  const n = points.length;
  const meanX = points.reduce((sum, p) => sum + p.endTempC, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.agtron, 0) / n;
  const spread = Math.max(...points.map((p) => p.endTempC)) - Math.min(...points.map((p) => p.endTempC));
  if (spread < minSpreadC) return undefined;
  const sxx = points.reduce((sum, p) => sum + (p.endTempC - meanX) ** 2, 0);
  const sxy = points.reduce((sum, p) => sum + (p.endTempC - meanX) * (p.agtron - meanY), 0);
  const slope = sxy / sxx;
  if (!(slope < 0)) return undefined;
  return { slope, intercept: meanY - slope * meanX, readings: n };
}

/** The end temperature a line puts an Agtron number at. */
export const endTempForAgtron = (line: ColourLine, agtron: number): number => (agtron - line.intercept) / line.slope;

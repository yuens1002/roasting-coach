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

/** How a colour reading was taken: with a colour meter, or against the roast colour card on a ground sample. */
export type ColourMethod = "meter" | "card";
export const COLOUR_METHODS: readonly ColourMethod[] = ["meter", "card"];

/**
 * The numbers on the roast colour card, one per SCA tile. A reading against the card is one of them, never a number between two:
 * the eye cannot tell a tile from the half between it and its neighbour, and the card prints none.
 */
export const CARD_TILES: readonly number[] = SCA_TILES.map((tile) => tile.agtron);

/** What is wrong, in plain words, with a roast's colour reading and the way it was read: both are given or neither, and a card reading is one of the card's tiles. */
export function colourReadingProblems(colour: number | undefined, method: string | undefined): string[] {
  if (colour !== undefined && method === undefined) return ["A colour reading says how it was read: with a colour meter, or against the roast colour card."];
  if (colour === undefined && method !== undefined) return ["A colour reading's method is given without the reading: give the number too, or leave both out."];
  if (colour !== undefined && method === "card" && !CARD_TILES.includes(colour)) {
    return [`A reading against the roast colour card is one of the card's numbers (${CARD_TILES.slice(0, -1).join(", ")} or ${CARD_TILES[CARD_TILES.length - 1]}); got ${colour}.`];
  }
  return [];
}

/**
 * The common roast-level chart reads each tile as a band of ten: a tile's number is the band's darker edge (medium is 55 to
 * 65, dark is 35 to 45). The name of the band an Agtron number is in, e.g. 78 is "moderately light" (75 to 85) and 60 is
 * "medium"; a number sitting on an edge belongs to the band it starts, so 55 is "medium". Below 25 is "extremely dark".
 */
export const agtronName = (agtron: number): string => (SCA_TILES.find((tile) => agtron >= tile.agtron) ?? SCA_TILES[SCA_TILES.length - 1]).name;

/**
 * What the words light, medium and dark mean as an Agtron number: the middle of their band, not its edge (light 85 to 95
 * is 90, medium 55 to 65 is 60, dark 35 to 45 is 40), so a roaster who only says a word is aimed at the centre of it.
 */
export const ROAST_WORDS = { light: 90, medium: 60, dark: 40 } as const;

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

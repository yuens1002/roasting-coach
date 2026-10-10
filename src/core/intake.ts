// The two deterministic forms: bean intake (once per bean) and roast result
// (once per roast). Field definitions are data so the CLI prompts from them and
// the rules can rely on the same ids. Anything the log already records
// (profile, level, ambient temperature, times, temperatures) is not asked for.

import { AGTRON_MAX, AGTRON_MIN, SCA_TILES } from "./roastColour.js";

export type Field =
  | { id: string; label: string; kind: "text"; required?: boolean; help?: string; usedFor: string }
  | { id: string; label: string; kind: "number"; unit?: string; min?: number; max?: number; integer?: boolean; required?: boolean; help?: string; usedFor: string }
  | { id: string; label: string; kind: "date"; required?: boolean; help?: string; usedFor: string }
  | { id: string; label: string; kind: "boolean"; required?: boolean; help?: string; usedFor: string }
  | { id: string; label: string; kind: "choice" | "chips"; options: { value: string; label: string }[]; required?: boolean; help?: string; usedFor: string };

const opts = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));

/**
 * The cupping protocol: every tasting of a coffee is of one brew, the roaster's own, chosen at intake, so no roast's cup is
 * a different kind of brew from the others. What the roaster usually brews is theirs to say; the tool does not aim the
 * roast at it. Brew and rest change the cup, not the roast, so the tool holds the brew steady instead of advising on it
 * (docs/RULES.md, rule 1).
 */
const BREWS: [string, string][] = [
  ["pourover", "Pour over"],
  ["immersion", "French press / immersion"],
  ["aeropress", "AeroPress"],
  ["espresso", "Espresso"],
  ["moka", "Moka pot"],
  ["other", "Other"],
];
/** Bean intake: one per bean, i.e. per roast project. */
export const INTAKE_FIELDS: Field[] = [
  { id: "name", label: "Bean name", kind: "text", required: true, help: "Whatever you call it, e.g. 'Ethiopia Guji from Sweet Maria's'.", usedFor: "Display" },
  { id: "species", label: "Species", kind: "choice", required: true, options: opts(["arabica", "Arabica"], ["robusta", "Robusta"], ["blend", "Blend / not sure"]), usedFor: "Picks the Robusta profile" },
  { id: "decaf", label: "Decaf", kind: "boolean", required: true, usedFor: "Picks the Decaf profile" },
  {
    id: "process",
    label: "Processing",
    kind: "choice",
    required: true,
    options: opts(["washed", "Washed"], ["natural", "Natural / dry"], ["honey", "Honey / pulped natural"], ["anaerobic", "Anaerobic / experimental"], ["wet-hulled", "Wet-hulled"], ["unknown", "Don't know"]),
    usedFor: "Picks KL Washed / KL Natural; naturals scorch and develop faster",
  },
  { id: "drinkWhen", label: "When will you drink it", kind: "choice", required: true, options: opts(["soon", "Within a day or two"], ["rest", "After resting 3 to 5 days"]), usedFor: "RTD vs Rest profiles" },
  {
    id: "agtronTarget",
    label: "Roast you are shooting for",
    kind: "number",
    unit: "Agtron",
    min: AGTRON_MIN,
    max: AGTRON_MAX,
    integer: true,
    required: true,
    help: `The SCA / Agtron roast colour, higher is lighter: ${SCA_TILES.map((t) => `${t.agtron} ${t.name}`).join(", ")}. A word is taken as its number; a colour meter's reading can be used as it is. It only picks the first level to try: after that, the defects in the cup decide each step.`,
    usedFor: "The first level to try, from the Agtron scale",
  },
  {
    id: "tastingBrew",
    label: "The brew you will taste every roast of this coffee with",
    kind: "choice",
    required: true,
    options: opts(...BREWS),
    help: "Your usual brew, whatever it is. Stay on it for every tasting of this coffee, so a difference in the cup is a difference in the roast. With no usual brew, a filter brew (pour over, French press or AeroPress) is the easiest to make the same way each time.",
    usedFor: "Every tasting is of this brew (docs/RULES.md, rule 1)",
  },
  { id: "altitudeM", label: "Altitude", kind: "number", unit: "m", min: 0, max: 3000, integer: true, help: "If the bag gives a range, use the middle.", usedFor: "Altitude band; a proxy for density" },
  { id: "origin", label: "Country / region", kind: "text", usedFor: "Display; comparing beans later" },
  { id: "variety", label: "Variety", kind: "text", help: "e.g. Bourbon, Gesha, SL28.", usedFor: "Comparing beans later" },
  { id: "cropDate", label: "Harvest or arrival date", kind: "date", help: "Old crop roasts faster and tastes flatter.", usedFor: "Flags past-crop beans" },
  { id: "moisturePct", label: "Moisture", kind: "number", unit: "%", min: 5, max: 15, help: "Only if the seller lists it.", usedFor: "Adjusts drying expectations" },
  { id: "densityGL", label: "Density", kind: "number", unit: "g/L", min: 550, max: 850, integer: true, help: "Only if the seller lists it.", usedFor: "Better than altitude when known" },
  { id: "chaffy", label: "Lots of chaff", kind: "boolean", help: "Leave blank until you've roasted it once.", usedFor: "Suggests the higher-fan variant" },
  { id: "sellerNotes", label: "Seller's tasting notes", kind: "text", usedFor: "What 'good' should taste like for this bean" },
];

/** Shape of a filled intake, as the rules read it. */
export interface Intake {
  name: string;
  species: "arabica" | "robusta" | "blend";
  decaf: boolean;
  process: "washed" | "natural" | "honey" | "anaerobic" | "wet-hulled" | "unknown";
  drinkWhen: "soon" | "rest";
  /** The SCA / Agtron roast colour shot for, 25 to 95. The roaster can restate it at any time. */
  agtronTarget: number;
  /** The one brew every tasting of this coffee is of. */
  tastingBrew: string;
  altitudeM?: number;
  origin?: string;
  variety?: string;
  cropDate?: string;
  moisturePct?: number;
  densityGL?: number;
  chaffy?: boolean;
  sellerNotes?: string;
}

/** Right after the roast. The log supplies everything else. */
export const ROAST_FIELDS: Field[] = [
  { id: "greenG", label: "Green weight", kind: "number", unit: "g", min: 50, max: 200, required: true, help: "Weigh it; the machine's load setting isn't the actual weight.", usedFor: "Weight loss" },
  { id: "roastedG", label: "Roasted weight", kind: "number", unit: "g", min: 30, max: 200, required: true, usedFor: "Weight loss: a check on development that doesn't depend on button presses" },
  { id: "cracksPressedOk", label: "I pressed first crack when I heard it", kind: "boolean", help: "Untick if you missed it or pressed late.", usedFor: "Whether to trust development time" },
  { id: "colour", label: "Agtron reading", kind: "number", unit: "Agtron", min: AGTRON_MIN, max: AGTRON_MAX, help: "The SCA / Agtron reading of the roasted coffee, only with a colour meter. Readings tune the first level suggested for a roast colour on that profile, when the roast's log is recorded.", usedFor: "Ties the profile's levels to the Agtron scale for this roaster" },
  {
    id: "looks",
    label: "How the beans look",
    kind: "chips",
    options: opts(["even", "Even"], ["uneven", "Uneven colour"], ["tipping", "Dark tips / edges"], ["oily", "Oily already"], ["chaff", "Lots of chaff left"]),
    usedFor: "Spots scorching and uneven roasts",
  },
];

/**
 * The roast quality scale, anchored to roast defects, not to liking: a cup with a defect is a 1 or 2,
 * a clean one a 3 or better. The form's options and the engine's messages are both made from this.
 */
export const QUALITY_ANCHORS: Record<number, string> = {
  1: "a roast defect dominates the cup",
  2: "a roast defect is there, but doesn't dominate",
  3: "clean, with little character",
  4: "clean and expressive",
  5: "clean, expressive, balanced and sweet",
};

/** What a quality means, or a plain fallback for a value off the scale (the form never stores one, but the engine can be called directly). */
export const qualityMeaning = (quality: number) => QUALITY_ANCHORS[quality] ?? "off the 1 to 5 scale";

/** After resting and brewing. This is the field that matters most; keep it quick. */
export const TASTING_FIELDS: Field[] = [
  { id: "tastedOn", label: "Tasted on", kind: "date", required: true, help: "Defaults to today.", usedFor: "Days of rest" },
  { id: "brew", label: "Brewed as", kind: "choice", options: opts(...BREWS), help: "Left out, it is the brew chosen for this coffee at intake, so roasts can be compared. Name one only when this tasting was a different brew.", usedFor: "The cupping protocol: every roast of a coffee is tasted as the same brew" },
  {
    id: "quality",
    label: "Roast quality",
    kind: "choice",
    required: true,
    options: Object.entries(QUALITY_ANCHORS).map(([n, meaning]) => ({ value: n, label: `${n} ${meaning[0].toUpperCase()}${meaning.slice(1)}` })),
    help: "How well the roast came out, judged by defects. Not whether you like the cup.",
    usedFor: "Whether the roast is good, and whether a change helped",
  },
  {
    id: "taste",
    label: "What did you taste",
    kind: "chips",
    required: true,
    options: opts(
      ["sweet", "Sweet"],
      ["bright", "Pleasantly bright"],
      ["balanced", "Balanced"],
      ["sour", "Sour / sharp"],
      ["grassy", "Grassy / green"],
      ["bready", "Bready / baked / raw"],
      ["astringent", "Dry / astringent"],
      ["flat", "Flat / dull / papery"],
      ["bitter", "Bitter"],
      ["roasty", "Roasty / smoky"],
      ["ashy", "Ashy / burnt"],
      ["thin", "Thin body"],
    ),
    usedFor: "Maps to under-, over- or baked development",
  },
  { id: "notes", label: "Notes", kind: "text", usedFor: "Your own words; kept with the version" },
];

const BREW_LABELS = new Map(TASTING_FIELDS.flatMap((f): [string, string][] => (f.id === "brew" && "options" in f ? f.options.map((o): [string, string] => [o.value, o.label.toLowerCase()]) : [])));
/** A brew as the tasting form words it ("pour over"), lower-cased for a sentence; a value that is not one of the form's brews (the engine can be called with any text) is shown as given. */
export const brewLabel = (value: string) => BREW_LABELS.get(value) ?? value;

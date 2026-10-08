// What is personal to a roaster, as opposed to what the rules share: the rule settings (step sizes,
// the noise band, which roast quality is good enough to keep) and what each taste word means to them. The
// defaults are the ones in rules.ts; a roaster's overrides replace some of them, are stored in
// their own database (db/004_roaster_calibration.sql) and are checked here before anything is stored.
// Pure: no database and no machine.

import { TASTING_FIELDS } from "./intake.js";
import { type Calibration, type ChipMeanings, type RuleSettings, RULE_SETTINGS, TASTE_CHIPS } from "./rules.js";
import { checkShape } from "./validate.js";

interface SettingSpec {
  min: number;
  max: number;
  unit?: string;
  integer?: boolean;
  plain: string;
}

/** What a setting may be set to, and what it does in plain words. One entry per setting in RULE_SETTINGS. */
export const SETTING_SPECS = {
  stepPct: { min: 1, max: 50, unit: "%", plain: "thermal dose change when one taste word points the way" },
  strongStepPct: { min: 1, max: 50, unit: "%", plain: "the same when several taste words agree" },
  strongChipCount: { min: 1, max: 6, integer: true, plain: "how many agreeing taste words make the step strong" },
  noisePct: { min: 0, max: 10, unit: "%", plain: "thermal dose difference between roasts that still counts as the same roasting" },
  noResponsePct: { min: 1, max: 50, unit: "%", plain: "thermal dose move after which an unchanged cup means the level isn't helping" },
  plateauSteps: { min: 1, max: 6, integer: true, plain: "steps the level takes without the roast quality improving before it counts as tried out" },
  restTestDays: { min: 1, max: 14, integer: true, plain: "days between the first and last tasting of one roast that make resting a fair test" },
  brewTestCount: { min: 2, max: 6, integer: true, plain: "different brews of one roast that make changing the brew a fair test" },
  holdMinQuality: { min: 1, max: 5, integer: true, plain: "the roast quality at which a clean cup is left alone" },
} as const satisfies Record<keyof RuleSettings, SettingSpec>;

/** What a taste word can mean to the rules: a side of the roast, a good cup, or nothing they act on. */
export const MEANINGS = ["under", "over", "good", "none"] as const;
export type Meaning = (typeof MEANINGS)[number];

/** The words the tasting form offers, in the form's order. */
export const TASTE_WORDS: string[] = (() => {
  const field = TASTING_FIELDS.find((f) => f.id === "taste");
  if (!field || !("options" in field)) throw new Error("the tasting form has no taste words");
  return field.options.map((o) => o.value);
})();

/** What each word means with no overrides. */
export function defaultMeaning(word: string): Meaning {
  return MEANINGS.find((m) => m !== "none" && (TASTE_CHIPS[m] as readonly string[]).includes(word)) ?? "none";
}

/** A roaster's own values: only what differs from the defaults. */
export interface Overrides {
  settings: Partial<RuleSettings>;
  words: Record<string, Meaning>;
}

export const NO_OVERRIDES: Overrides = { settings: {}, words: {} };

/** The defaults with a roaster's overrides laid over them. */
export function resolveCalibration(overrides: Overrides): Calibration {
  const chips = { under: [] as string[], over: [] as string[], good: [] as string[] };
  for (const word of TASTE_WORDS) {
    const meaning = overrides.words[word] ?? defaultMeaning(word);
    if (meaning !== "none") chips[meaning].push(word);
  }
  // Words are listed in the form's order, so the same overrides always give the same lists.
  return { settings: { ...RULE_SETTINGS, ...overrides.settings }, chips: chips as ChipMeanings };
}

/** A change to ask for: a setting or a word set to a value, or to null to go back to the default. */
export interface CalibrationChange {
  settings?: Record<string, unknown>;
  words?: Record<string, unknown>;
}

export const CALIBRATION_CHANGE_SHAPE = { settings: { type: "object" }, words: { type: "object" } } as const;

export type ChangeResult = { ok: true; overrides: Overrides } | { ok: false; errors: string[] };

const settingKeys = Object.keys(SETTING_SPECS) as (keyof RuleSettings)[];

/**
 * The overrides after a change, or every problem with it in plain words. A value equal to the
 * default is dropped (it is not an override), and the merged settings are checked as a whole.
 */
export function applyChange(current: Overrides, change: unknown): ChangeResult {
  const shapeErrors = checkShape(change, CALIBRATION_CHANGE_SHAPE);
  if (shapeErrors.length) return { ok: false, errors: shapeErrors };
  const { settings = {}, words = {} } = change as CalibrationChange;
  const errors: string[] = [];
  const next: Overrides = { settings: { ...current.settings }, words: { ...current.words } };
  if (!Object.keys(settings).length && !Object.keys(words).length) errors.push('Nothing to change. Give "settings" and/or "words".');

  for (const [key, value] of Object.entries(settings)) {
    if (!Object.hasOwn(SETTING_SPECS, key)) {
      errors.push(`"${key}" isn't a setting. Settings: ${settingKeys.join(", ")}.`);
      continue;
    }
    const k = key as keyof RuleSettings;
    const spec: SettingSpec = SETTING_SPECS[k];
    if (value === null) {
      delete next.settings[k];
    } else if (typeof value !== "number" || !Number.isFinite(value) || (spec.integer && !Number.isInteger(value))) {
      errors.push(`${k} must be ${spec.integer ? "a whole number" : "a number"}; got ${JSON.stringify(value)}.`);
    } else if (value < spec.min || value > spec.max) {
      errors.push(`${k} must be between ${spec.min} and ${spec.max}${spec.unit ?? ""}; got ${value}${spec.unit ?? ""}.`);
    } else if (value === RULE_SETTINGS[k]) {
      delete next.settings[k];
    } else {
      next.settings[k] = value;
    }
  }

  for (const [word, meaning] of Object.entries(words)) {
    if (!TASTE_WORDS.includes(word)) {
      errors.push(`"${word}" isn't a taste word on the tasting form. Words: ${TASTE_WORDS.join(", ")}.`);
    } else if (meaning === null) {
      delete next.words[word];
    } else if (!MEANINGS.includes(meaning as Meaning)) {
      errors.push(`${word} must mean one of ${MEANINGS.join(", ")} (none: the rules don't act on it); got ${JSON.stringify(meaning)}.`);
    } else if (meaning === defaultMeaning(word)) {
      delete next.words[word];
    } else {
      next.words[word] = meaning as Meaning;
    }
  }

  if (!errors.length) {
    const merged = resolveCalibration(next).settings;
    if (merged.strongStepPct < merged.stepPct) errors.push(`strongStepPct (${merged.strongStepPct}) can't be smaller than stepPct (${merged.stepPct}): several agreeing words should move the roast at least as far as one.`);
    // The level counts a move as a real step only from noResponsePct up, and batch noise must stay below that,
    // or the tool's own steps would not count (or noise would).
    if (merged.noResponsePct > merged.stepPct) errors.push(`noResponsePct (${merged.noResponsePct}) can't be bigger than stepPct (${merged.stepPct}): the tool's own steps would not count as real moves, so the level could never be called stuck. Lower noResponsePct too.`);
    if (merged.noisePct >= merged.noResponsePct) errors.push(`noisePct (${merged.noisePct}) must be smaller than noResponsePct (${merged.noResponsePct}): batch-to-batch noise would count as a real step.`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, overrides: next };
}

/** Every setting and taste word with its default, its current value and whether the roaster changed it. */
export function describeCalibration(overrides: Overrides) {
  const resolved = resolveCalibration(overrides);
  return {
    settings: settingKeys.map((key) => {
      const spec: SettingSpec = SETTING_SPECS[key];
      return {
        key,
        value: resolved.settings[key],
        default: RULE_SETTINGS[key],
        personal: Object.hasOwn(overrides.settings, key),
        range: `${spec.min} to ${spec.max}${spec.unit ?? ""}`,
        meaning: spec.plain,
      };
    }),
    words: TASTE_WORDS.map((word) => ({
      word,
      means: overrides.words[word] ?? defaultMeaning(word),
      default: defaultMeaning(word),
      personal: Object.hasOwn(overrides.words, word),
    })),
  };
}

/** The roaster's departures from the defaults as short sentences; empty when they use the defaults. */
export function personalChanges(overrides: Overrides): string[] {
  const d = describeCalibration(overrides);
  return [
    ...d.settings.filter((s) => s.personal).map((s) => `${s.key} is ${s.value} (default ${s.default})`),
    ...d.words.filter((w) => w.personal).map((w) => `${w.word} means ${w.means} (default ${w.default})`),
  ];
}

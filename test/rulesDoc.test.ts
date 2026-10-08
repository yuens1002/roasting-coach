import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STOCK_PROFILES } from "../src/adapters/kaffelogic/startingProfiles.js";
import { stepTable, stockProfilesFrom } from "../src/adapters/kaffelogic/stepTable.js";
import { SETTING_SPECS } from "../src/core/calibration.js";
import { QUALITY_ANCHORS } from "../src/core/intake.js";
import { LEVERS, LEVER_EFFECTS } from "../src/core/levers.js";
import { OUTCOME_IDS, RULES, RULE_SETTINGS, TASTE_CHIPS, advise } from "../src/core/rules.js";
import { PRIVATE_PROFILES } from "./privateFiles.js";
import { EXAMPLES, sayFor } from "./rulesDocExamples.js";

// docs/RULES.md is the rulebook a roaster reads to audit the advice. Each thing the doc states
// about the program is checked here, so the doc can't say something the program doesn't do.
const doc = readFileSync(join(__dirname, "..", "docs", "RULES.md"), "utf8").replace(/\r\n/g, "\n");
const rows = (pattern: RegExp) => [...doc.matchAll(pattern)];
const words = (cell: string) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

describe("docs/RULES.md matches the program", () => {
  it("lists every answer the engine can give, and no other", () => {
    const listed = rows(/^\| [^|]+ \| `([a-z-]+)` \|/gm).map((m) => m[1]);
    expect([...listed].sort()).toEqual([...OUTCOME_IDS].sort());
  });

  it("has a section for every rule in the table, in the order they are tried", () => {
    const headings = doc.split("\n").filter((l) => l.startsWith("#"));
    for (const rule of RULES) expect(headings.some((h) => h.includes(`\`${rule.id}\``)), `a heading for ${rule.id}`).toBe(true);
    const order = RULES.map((r) => headings.findIndex((h) => h.includes(`\`${r.id}\``)));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("states every setting at its real value, and no other", () => {
    const stated = Object.fromEntries(rows(/^\| `(\w+)` \| (\d+(?:\.\d+)?) \|/gm).map((m) => [m[1], Number(m[2])]));
    expect(stated).toEqual({ ...RULE_SETTINGS });
  });

  it("states the range each setting may be set to", () => {
    const stated = Object.fromEntries(rows(/^\| `(\w+)` \| \d+(?:\.\d+)? \| (\d+) to (\d+) \|/gm).map((m) => [m[1], [Number(m[2]), Number(m[3])]]));
    const real = Object.fromEntries(Object.entries(SETTING_SPECS).map(([key, spec]) => [key, [spec.min, spec.max]]));
    expect(stated).toEqual(real);
  });

  it("states what each lever changes, in the words the answer uses", () => {
    for (const lever of LEVERS) expect(doc, lever).toContain(`| \`${lever}\` | ${LEVER_EFFECTS[lever]} |`);
    const stated = rows(/^\| `(rest|brew|level|profile|curve)` \| /gm).map((m) => m[1]);
    expect(stated, "every lever once, in the ledger's order").toEqual([...LEVERS]);
  });

  it("states how each taste word is read", () => {
    const stated = Object.fromEntries(rows(/^\| (under|over|good) \| (.+) \|$/gm).map((m) => [m[1], words(m[2])]));
    expect(stated).toEqual({ under: [...TASTE_CHIPS.under], over: [...TASTE_CHIPS.over], good: [...TASTE_CHIPS.good] });
  });

  it("states what each roast quality means, as the form does", () => {
    const stated = Object.fromEntries(rows(/^\| ([1-5]) \| ([^`|]+) \|$/gm).map((m) => [Number(m[1]), m[2]]));
    expect(stated).toEqual(QUALITY_ANCHORS);
  });

  it("states the rest days of every Rest profile, and no other", () => {
    const stated = Object.fromEntries(rows(/^\| `([^`]+)` \| (\d+) to (\d+) \|$/gm).map((m) => [m[1], [Number(m[2]), Number(m[3])]]));
    const real = Object.fromEntries(Object.values(STOCK_PROFILES).filter((p) => p.restDays).map((p) => [p.name, [...p.restDays!]]));
    expect(stated).toEqual(real);
  });

  describe("worked examples", () => {
    it("cover every answer", () => {
      expect(EXAMPLES.map((e) => e.id).sort()).toEqual([...OUTCOME_IDS].sort());
    });
    for (const example of EXAMPLES) {
      it(`${example.id}: the engine says what the doc quotes`, () => {
        expect(advise(example.input).ruleId).toBe(example.id);
        expect(doc, "the scenario as the doc describes it").toContain(example.scenario);
        expect(doc, "the engine's exact words").toContain(`"${sayFor(example)}"`);
      });
    }
  });

  // The step table is measured from real Kaffelogic files, which are never committed, so this
  // checks every stock profile you have locally and skips the rest.
  const library = PRIVATE_PROFILES.map((f) => ({ path: f.file, text: f.text }));
  const profiles = stockProfilesFrom(library);
  it.skipIf(!Object.keys(profiles).length)("step table: every row measured from your stock profile files is in the doc", () => {
    const stated = doc.split("<!-- steps:start -->")[1]?.split("<!-- steps:end -->")[0] ?? "";
    const measuredRows = stepTable(profiles).split("\n");
    expect(measuredRows.length, "at least one profile row was measured, not just the header").toBeGreaterThan(2);
    for (const row of measuredRows) expect(stated, row).toContain(row);
  }, 60_000);
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseKpro } from "../src/adapters/kaffelogic/parse.js";
import { STOCK_PROFILES } from "../src/adapters/kaffelogic/startingProfiles.js";
import { stepTable } from "../src/adapters/kaffelogic/stepTable.js";
import { findBaseProfile, formatKpro } from "../src/adapters/kaffelogic/writeProfile.js";
import { OUTCOME_IDS, RULES, RULE_SETTINGS, TASTE_CHIPS, WANT_NEXT_MOVE, advise } from "../src/core/rules.js";
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

  it("states how each taste word is read", () => {
    const stated = Object.fromEntries(rows(/^\| (under|over|good) \| (.+) \|$/gm).map((m) => [m[1], words(m[2])]));
    expect(stated).toEqual({ under: [...TASTE_CHIPS.under], over: [...TASTE_CHIPS.over], good: [...TASTE_CHIPS.good] });
  });

  it("states which way each wish moves the roasting", () => {
    const stated = Object.fromEntries(rows(/^\| `([a-z-]+)` \| (more|less) \|$/gm).map((m) => [m[1], m[2]]));
    expect(stated).toEqual(WANT_NEXT_MOVE);
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
  const profiles = Object.fromEntries(
    Object.keys(STOCK_PROFILES).flatMap((name) => {
      const base = findBaseProfile(library, { name });
      return base ? [[name, parseKpro(formatKpro(base.lines))]] : [];
    }),
  );
  it.skipIf(!Object.keys(profiles).length)("step table: every row measured from your stock profile files is in the doc", () => {
    const stated = doc.split("<!-- steps:start -->")[1]?.split("<!-- steps:end -->")[0] ?? "";
    for (const row of stepTable(profiles).split("\n")) expect(stated, row).toContain(row);
  }, 60_000);
});

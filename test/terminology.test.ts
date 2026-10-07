import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// In coffee, "dose" means the grams of ground coffee in an espresso basket. This project means heat
// exposure over a roast, so it always says "thermal dose" and never the bare word.
const ROOT = join(import.meta.dirname, "..");
// CHANGELOG.md keeps released history as written; CLAUDE.md is a git-ignored local file.
const SKIP = new Set(["node_modules", ".git", "profiles", "fixtures", "CHANGELOG.md", "CLAUDE.md", "terminology.test.ts"]);
const SCANNED = [/\.(ts|md|sql|json)$/];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : SCANNED.some((re) => re.test(name)) ? [path] : [];
  });
}

describe("terminology", () => {
  it("never uses the bare word 'dose' (the espresso meaning) outside the notes that explain the difference", () => {
    const bare = /(?<!thermal[ -])\bdoses?\b/i;
    const offenders = files(ROOT).flatMap((path) =>
      readFileSync(path, "utf8")
        .split(/\r?\n/)
        .flatMap((line, i) => (bare.test(line) && !/espresso|basket/i.test(line) ? [`${relative(ROOT, path)}:${i + 1}: ${line.trim()}`] : [])),
    );
    expect(offenders).toEqual([]);
  });
});

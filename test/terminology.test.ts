import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// In coffee, "dose" means the grams of ground coffee in an espresso basket. This project means heat
// exposure over a roast, so it always says "thermal dose" and never the bare word.
const ROOT = join(__dirname, "..");
// The repo's own folders and top-level files, so a stray local file (a scratch script, build output) can't decide the result.
const SCANNED_DIRS = ["src", "test", "scripts", "db", "docs", join(".claude", "skills")];
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

const topLevel = () => readdirSync(ROOT).filter((name) => !SKIP.has(name) && SCANNED.some((re) => re.test(name)) && statSync(join(ROOT, name)).isFile()).map((name) => join(ROOT, name));
const scanned = () => [...topLevel(), ...SCANNED_DIRS.flatMap((dir) => files(join(ROOT, dir)))];

describe("terminology", () => {
  it("never uses the bare word 'dose' (the espresso meaning) outside the notes that explain the difference", () => {
    const bare = /(?<!thermal[ -])\bdoses?\b/i;
    const offenders = scanned().flatMap((path) =>
      readFileSync(path, "utf8")
        .split(/\r?\n/)
        .flatMap((line, i) => (bare.test(line) && !/espresso|basket/i.test(line) ? [`${relative(ROOT, path)}:${i + 1}: ${line.trim()}`] : [])),
    );
    expect(scanned().length, "the scan found the repo's files").toBeGreaterThan(20);
    expect(offenders).toEqual([]);
  });
});

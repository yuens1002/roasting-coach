import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mainCheckoutOf } from "../scripts/env.js";

// .env is git-ignored, so a git worktree has none; its scripts and tests read the one in the checkout it was made from.
describe("mainCheckoutOf", () => {
  const scratch = mkdtempSync(join(tmpdir(), "env-test-"));
  const folder = (name: string) => {
    const dir = join(scratch, name);
    mkdirSync(dir, { recursive: true });
    return dir;
  };

  it("finds the checkout a worktree was made from", () => {
    const main = folder("main");
    const worktree = folder("worktree");
    writeFileSync(join(worktree, ".git"), `gitdir: ${join(main, ".git", "worktrees", "feature")}\n`);
    expect(mainCheckoutOf(worktree)).toBe(main);
  });

  it("finds it when the worktree names the git folder relative to itself", () => {
    const main = folder("rel-main");
    const worktree = join(main, ".claude", "worktrees", "feature");
    mkdirSync(worktree, { recursive: true });
    writeFileSync(join(worktree, ".git"), "gitdir: ../../../.git/worktrees/feature\n");
    expect(mainCheckoutOf(worktree)).toBe(main);
  });

  it("returns nothing for a main checkout, where .git is a folder", () => {
    const main = folder("plain");
    mkdirSync(join(main, ".git"));
    expect(mainCheckoutOf(main)).toBeUndefined();
  });

  it("returns nothing when there is no .git or it names nothing", () => {
    expect(mainCheckoutOf(folder("none"))).toBeUndefined();
    const odd = folder("odd");
    writeFileSync(join(odd, ".git"), "not a gitdir line\n");
    expect(mainCheckoutOf(odd)).toBeUndefined();
  });
});

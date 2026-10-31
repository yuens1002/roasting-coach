// Loads .env (if present) once, for every script.
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export const ROOT = join(import.meta.dirname, "..");

/**
 * The checkout a git worktree was made from, or undefined when `root` is not a worktree. A worktree's `.git` is a file naming
 * `<main checkout>/.git/worktrees/<name>`. `.env` is git-ignored, so a worktree has none of its own.
 */
export function mainCheckoutOf(root: string): string | undefined {
  try {
    const gitFile = join(root, ".git");
    if (!statSync(gitFile).isFile()) return undefined;
    const gitDir = /^gitdir:\s*(.+)$/m.exec(readFileSync(gitFile, "utf8"))?.[1].trim();
    return gitDir ? resolve(root, gitDir, "..", "..", "..") : undefined;
  } catch {
    return undefined;
  }
}

// This checkout's .env, else the one in the checkout it is a worktree of. No .env at all: defaults apply.
for (const dir of [ROOT, mainCheckoutOf(ROOT)]) {
  if (!dir) continue;
  try {
    process.loadEnvFile(join(dir, ".env"));
    break;
  } catch {
    // None here: try the next.
  }
}

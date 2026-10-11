// The roaster's Kaffelogic files: stock and own .kpro profiles plus .klog logs, in one
// folder (KAFFELOGIC_DIR, default profiles/), searched at any depth and
// recognised by content, so any file names work. Profiles roasting-coach writes go
// to KAFFELOGIC_OUT_DIR (default profiles/out/). Both are git-ignored.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { KaffelogicFile } from "../src/adapters/kaffelogic/writeProfile.js";
import { InputError } from "../src/db/store.js";
import { ROOT } from "./env.js";

export const KAFFELOGIC_DIR = process.env.KAFFELOGIC_DIR ?? join(ROOT, "profiles");
export const KAFFELOGIC_OUT_DIR = process.env.KAFFELOGIC_OUT_DIR ?? join(KAFFELOGIC_DIR, "out");

/** Every .kpro and .klog under KAFFELOGIC_DIR; empty if the folder doesn't exist. */
export function loadLibrary(): KaffelogicFile[] {
  if (!existsSync(KAFFELOGIC_DIR)) return [];
  return (readdirSync(KAFFELOGIC_DIR, { recursive: true, encoding: "utf8" }) as string[])
    .filter((f) => /\.(kpro|klog)$/i.test(f))
    .map((f) => join(KAFFELOGIC_DIR, f))
    .map((path) => ({ path, text: readFileSync(path, "utf8") }));
}

/** Where a new profile will be written, from its file name (profileNames). Refuses to overwrite: every written profile gets its own file. */
export function outPath(fileName: string, dir: string = KAFFELOGIC_OUT_DIR): string {
  const path = join(dir, fileName.replace(/[<>:"/\\|?*]/g, "-"));
  if (existsSync(path)) throw new InputError([`${path} already exists. Move or delete it, then run the command again.`]);
  return path;
}

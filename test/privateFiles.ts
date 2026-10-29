// Real Kaffelogic files are never committed (see CONTRIBUTING.md). Tests that need them
// look in fixtures/private/ and in the profiles/ library (both git-ignored) and, when it
// is set, in KAFFELOGIC_DIR (the roaster's own Kaffelogic folder), and pick files by what
// is inside them, never by file name, so any name works. Tests skip when the file they
// need isn't there.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
// Loads .env, so KAFFELOGIC_DIR set there reaches the tests as it reaches the scripts.
import "../scripts/env.js";
import { hasProfile } from "../src/adapters/kaffelogic/parse.js";
import { EDITED_CURVE_DESIGNER } from "../scripts/profileFiles.js";

const ROOT = join(__dirname, "..");
const LIBRARY_DIR = process.env.KAFFELOGIC_DIR ? [process.env.KAFFELOGIC_DIR] : [];
// A folder named twice (KAFFELOGIC_DIR left pointing at profiles/) is read once.
export const PRIVATE_DIRS = [...new Set([join(ROOT, "fixtures", "private"), join(ROOT, "profiles"), ...LIBRARY_DIR].map((dir) => resolve(dir)))];

export interface PrivateFile {
  file: string;
  text: string;
}

// A profile roasting-coach drew a curve for is not one of Kaffelogic's, and with KAFFELOGIC_OUT_DIR inside the roaster's folder it sits among them.
const isReal = (text: string) => hasProfile(text) && headerValue(text, "profile_designer")?.trim() !== EDITED_CURVE_DESIGNER;

function load(ext: string): PrivateFile[] {
  return PRIVATE_DIRS.filter((dir) => existsSync(dir)).flatMap((dir) =>
    (readdirSync(dir, { recursive: true, encoding: "utf8" }) as string[])
      // out/ holds profiles roasting-coach wrote, not real Kaffelogic files.
      .filter((f) => f.toLowerCase().endsWith(ext) && !/^out[\\/]/.test(f))
      .map((file) => ({ file, text: readFileSync(join(dir, file), "utf8") }))
      .filter(({ text }) => isReal(text)),
  );
}

/** Every .kpro in those folders and their subfolders (except profiles/out/), whatever it is called. */
export const PRIVATE_PROFILES = load(".kpro");
/** Every .klog in those folders, whatever it is called. A roaster's own folder also holds empty files and fragments the machine left when a roast was stopped; those are left out. */
export const PRIVATE_LOGS = load(".klog");

/** The value of one header line, e.g. headerValue(text, "profile_short_name"). */
export function headerValue(text: string, key: string): string | undefined {
  return text.match(new RegExp(`^${key}:(.*?)\\r?$`, "m"))?.[1];
}

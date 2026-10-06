// Real Kaffelogic files are never committed (see CONTRIBUTING.md). Tests that need them
// look in fixtures/private/ and in the profiles/ library (both git-ignored), and pick
// files by what is inside them, never by file name, so any name works. Tests skip
// when the file they need isn't there.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
export const PRIVATE_DIRS = [join(ROOT, "fixtures", "private"), join(ROOT, "profiles")];

export interface PrivateFile {
  file: string;
  text: string;
}

function load(ext: string): PrivateFile[] {
  return PRIVATE_DIRS.filter((dir) => existsSync(dir)).flatMap((dir) =>
    (readdirSync(dir, { recursive: true, encoding: "utf8" }) as string[])
      // out/ holds profiles roasting-coach wrote, not real Kaffelogic files.
      .filter((f) => f.toLowerCase().endsWith(ext) && !/^out[\\/]/.test(f))
      .map((file) => ({ file, text: readFileSync(join(dir, file), "utf8") })),
  );
}

/** Every .kpro in those folders and their subfolders (except profiles/out/), whatever it is called. */
export const PRIVATE_PROFILES = load(".kpro");
/** Every .klog in those folders, whatever it is called. */
export const PRIVATE_LOGS = load(".klog");

/** The value of one header line, e.g. headerValue(text, "profile_short_name"). */
export function headerValue(text: string, key: string): string | undefined {
  return text.match(new RegExp(`^${key}:(.*?)\\r?$`, "m"))?.[1];
}

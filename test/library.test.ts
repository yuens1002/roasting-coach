import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadLibrary } from "../scripts/library.js";
import { PROFILE, syntheticLog } from "./syntheticLog.js";

// A folder laid out like the one Kaffelogic Studio syncs: logs in one subfolder, profiles in another, and bookkeeping files beside them.
const dir = mkdtempSync(join(tmpdir(), "roast-library-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
for (const sub of ["roast-logs-archive/2025", "roast-profiles"]) mkdirSync(join(dir, sub), { recursive: true });
const put = (path: string, text: string) => writeFileSync(join(dir, path), text);

put("roast-logs-archive/log0001.klog", syntheticLog({}));
put("roast-logs-archive/2025/log0004.KLOG", syntheticLog({})); // any depth, any case of the extension
put("roast-logs-archive/log0002.klog", ""); // a roast stopped at the start leaves an empty file
put("roast-logs-archive/log0003.klog", "20.8\t70.4\t70.6\n!roast_end:10.3\n"); // or a bare run of readings
put("roast-logs-archive/.sync_base", "(lp1\n"); // Studio's own bookkeeping, not a profile or a log
put("roast-profiles/Test line.kpro", PROFILE);
put("roast-profiles/Windows.kpro", PROFILE.replace(/\n/g, "\r\n")); // saved with CRLF line ends
put("roast-profiles/Leading blank line.kpro", `\n${PROFILE}`);
put("Root.kpro", PROFILE);
put("roast-profiles/notes.txt", PROFILE); // not a .kpro or .klog by name

describe("the roaster's Kaffelogic folder", () => {
  it("lists the profiles and logs at any depth, by content, and leaves out files with no profile in them", () => {
    const found = loadLibrary(dir).map((f) => relative(dir, f.path).split(sep).join("/")).sort();
    expect(found).toEqual(["Root.kpro", "roast-logs-archive/2025/log0004.KLOG", "roast-logs-archive/log0001.klog", "roast-profiles/Leading blank line.kpro", "roast-profiles/Test line.kpro", "roast-profiles/Windows.kpro"]);
  });

  it("is empty when the folder is not there", () => {
    expect(loadLibrary(join(dir, "nothing-here"))).toEqual([]);
  });
});

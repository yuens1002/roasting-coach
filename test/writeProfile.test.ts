import { describe, expect, it } from "vitest";
import { parseHeader, parseKpro, splitLines } from "../src/adapters/kaffelogic/parse.js";
import { LOG_ONLY_KEYS, findBaseProfile, kaffelogicModified, profileFromKpro, profileFromLog, sameProfileBody, writeKpro } from "../src/adapters/kaffelogic/writeProfile.js";
import { PRIVATE_LOGS, PRIVATE_PROFILES, headerValue } from "./privateFiles.js";
import { PROFILE, syntheticLog } from "./syntheticLog.js";

const WHEN = new Date("2026-10-04T15:07:09Z");

describe("profile from a log", () => {
  const lines = profileFromLog(syntheticLog({ roast_end: 600 }));

  it("drops what the log says about the roast and keeps the profile", () => {
    const keys = lines.map(([k]) => k);
    expect(keys.filter((k) => (LOG_ONLY_KEYS as readonly string[]).includes(k))).toEqual([]);
    expect(keys).toContain("roast_profile");
    expect(keys).toContain("roast_levels");
  });

  it("leaves out the roaster's notes on the roast, so they neither enter a profile nor make one look different", () => {
    const noted = (notes: string) => profileFromLog(`tasting_notes:${notes}
${syntheticLog({ roast_end: 600 })}`);
    expect(noted("ended at 123.7g").map(([k]) => k)).not.toContain("tasting_notes");
    expect(sameProfileBody(noted("ended at 123.7g"), noted("ended weight 120.5g"))).toBe(true);
    expect(sameProfileBody(noted("ended at 123.7g"), lines)).toBe(true);
  });

  it("writes a .kpro that parses back to the same curve and levels", () => {
    const text = writeKpro(lines, { shortName: "Test line v2", description: "Longer Maillard.\nWhy: sour.", modified: WHEN });
    const p = parseKpro(text);
    expect(p.shortName).toBe("Test line v2");
    expect(p.description).toBe("Longer Maillard.\nWhy: sour.");
    // The level is set on the machine for each roast, so the file's suggestion is left alone.
    expect(p.recommendedLevel).toBe(3.3);
    expect(p.roastLevels).toEqual([204, 209, 214, 219, 222, 224, 226]);
    expect(p.roastCurve).toEqual(parseKpro(writeKpro(lines)).roastCurve);
    expect(text).toContain("profile_modified:04/10/2026 15:07:09 UTC\n");
    // The description goes right after the designer, as in stock files.
    expect(text.split("\n").map((l) => l.split(":")[0]).slice(0, 3)).toEqual(["profile_short_name", "profile_designer", "profile_description"]);
  });

  it("can set the level the machine offers first, which doesn't make it a different profile", () => {
    const original = profileFromKpro(PROFILE);
    const atLevel = writeKpro(original, { shortName: "Guji 2.2", recommendedLevel: 2.2 });
    expect(parseKpro(atLevel).recommendedLevel).toBe(2.2);
    expect(parseKpro(PROFILE).recommendedLevel).toBe(3.3);
    // Only labels differ (name, modified stamp, recommended level): the profile roasts the same way.
    expect(sameProfileBody(profileFromKpro(atLevel), original)).toBe(true);
    // A real setting does make it different.
    expect(sameProfileBody(profileFromKpro(atLevel.replace("roast_levels:204,", "roast_levels:205,")), original)).toBe(false);
    expect(() => writeKpro(original, { recommendedLevel: 7 })).toThrow("recommended level must be between 0 and 6; got 7");
  });

  it("refuses edits that would break the line format", () => {
    expect(() => writeKpro(lines, { shortName: "two\nlines" })).toThrow("profile_short_name can't contain a line break");
  });

  it("stamps the modified time the way Kaffelogic's 2025 profiles do", () => {
    expect(kaffelogicModified(new Date("2025-02-10T22:50:23Z"))).toBe("10/02/2025 22:50:23 UTC");
    expect(kaffelogicModified(new Date("2026-07-06T00:05:00Z"))).toBe("06/07/2026 00:05:00 UTC");
  });
});

describe("finding the profile to build on", () => {
  const kpro = (modified: string) => `${PROFILE}\nprofile_modified:${modified}\n`;
  // The log is the newest of all, so only the "a real .kpro wins" rule can pick a .kpro over it.
  const log = syntheticLog({ roast_end: 600 }).replace("roast_levels:", "profile_modified:01/01/2027 09:00:00AM\nroast_levels:");
  const files = [
    { path: "a.klog", text: log },
    { path: "old.kpro", text: kpro("01/01/2024 09:00:00AM") },
    // Both stamp styles occur in stock files; the newest wins either way.
    { path: "new.kpro", text: kpro("01/03/2025 14:00:00 UTC") },
    { path: "other.kpro", text: kpro("01/01/2026 09:00:00AM").replace("profile_short_name:Test line", "profile_short_name:Other") },
  ];

  it("prefers a real .kpro, the most recently modified one", () => {
    expect(findBaseProfile(files, { name: "Test line" })).toMatchObject({ path: "new.kpro", from: "kpro" });
  });

  it("matches the exact profile a log was roasted on when given its stamp", () => {
    expect(findBaseProfile(files, { name: "Test line", modified: "01/01/2024 09:00:00AM" })?.path).toBe("old.kpro");
  });

  it("falls back to the copy inside a log", () => {
    const base = findBaseProfile(files, { name: "Test line", modified: "01/01/2027 09:00:00AM" });
    expect(base).toMatchObject({ path: "a.klog", from: "klog" });
    expect(base!.lines.map(([k]) => k)).not.toContain("roasting_level");
  });

  it("finds nothing for a profile that isn't there", () => {
    expect(findBaseProfile(files, { name: "1500-2000m Rest" })).toBeUndefined();
  });
});

// Each real log paired with the real .kpro it was roasted on: same profile name and same
// modified stamp. Any file names work.
const pairs = PRIVATE_LOGS.flatMap((klog) => {
  const same = (k: string) => (f: { text: string }) => headerValue(f.text, k)?.trim() === headerValue(klog.text, k)?.trim();
  const kpro = PRIVATE_PROFILES.find((f) => same("profile_short_name")(f) && same("profile_modified")(f));
  return kpro ? [{ klog, kpro }] : [];
});

describe.skipIf(!pairs.length)("profile from a real log matches the real .kpro", () => {
  for (const { klog, kpro } of pairs) describe(`${klog.file} vs ${kpro.file}`, () => {
    const real = parseHeader(splitLines(kpro.text)).header;
    const fromLog = Object.fromEntries(profileFromLog(klog.text));

    it("has the same keys, except the description", () => {
      expect(Object.keys(fromLog).sort()).toEqual(Object.keys(real).filter((k) => k !== "profile_description").sort());
    });

    it("has the same values, to the 6 significant figures logs write", () => {
      for (const [k, v] of Object.entries(fromLog)) {
        const a = v.split(",");
        const b = real[k].split(",");
        expect(a.length, k).toBe(b.length);
        a.forEach((x, i) => {
          const [nx, ny] = [Number(x), Number(b[i])];
          if (Number.isNaN(nx) || Number.isNaN(ny)) expect(x.trim(), k).toBe(b[i].trim());
          else expect(Math.abs(nx - ny), `${k}[${i}]`).toBeLessThanOrEqual(Math.max(Math.abs(ny), 1) * 5e-6);
        });
      }
    });

    it("rebuilds a .kpro whose curve and levels match the real one", () => {
      const rebuilt = parseKpro(writeKpro(profileFromLog(klog.text)));
      const p = parseKpro(kpro.text);
      expect(rebuilt.roastLevels).toEqual(p.roastLevels);
      expect(rebuilt.zones).toEqual(p.zones);
      rebuilt.roastCurve.forEach((n, i) => {
        expect(n.point.t).toBeCloseTo(p.roastCurve[i].point.t, 2);
        expect(n.point.v).toBeCloseTo(p.roastCurve[i].point.v, 2);
      });
    });
  });
});

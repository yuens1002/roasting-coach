import { describe, expect, it } from "vitest";
import { MAX_SHORT_NAME, PROCESS_CODES, originCode, profileNames, profileRevision } from "../src/adapters/kaffelogic/profileNames.js";
import { INTAKE_FIELDS } from "../src/core/intake.js";

const base = { beanId: 3, beanName: "Yirgacheffe", origin: "Ethiopia, Yirgacheffe", process: "washed", version: 1, revision: 1 } as const;

describe("the origin part of a profile name", () => {
  it("is the first four letters of the last part of the origin text", () => {
    expect(originCode("Ethiopia, Yirgacheffe", "x")).toBe("YIRG");
    expect(originCode("Guji", "x")).toBe("GUJI");
    expect(originCode("Kron Nang, Dak Lak, Vietnam", "x")).toBe("VIET");
    expect(originCode("Peru", "x")).toBe("PERU");
  });

  it("takes accents and anything but letters off, and keeps a short code short", () => {
    expect(originCode("Ethiopia, Yirgacheffé", "x")).toBe("YIRG");
    expect(originCode("Costa Rica", "x")).toBe("COST");
    expect(originCode("PNG", "x")).toBe("PNG");
    expect(originCode("Ethiopia, 1234 , ", "x")).toBe("ETHI");
  });

  it("falls back to the bean's name when there is no origin text with a letter in it", () => {
    expect(originCode(undefined, "Kron Nang")).toBe("KRON");
    expect(originCode("", "Kron Nang")).toBe("KRON");
    expect(originCode(" , 12", "Kron Nang")).toBe("KRON");
    expect(originCode(undefined, "123")).toBe("BEAN");
  });
});

describe("a profile's short name and file name", () => {
  it("are the short name for the machine and the whole convention for the file", () => {
    expect(profileNames({ ...base, version: 3, revision: 1 })).toEqual({ shortName: "YIRG-003-3r1", fileName: "KLN7-YIRG-WSH-003-3r1.kpro" });
    expect(profileNames({ beanId: 2, beanName: "Kron Nang", origin: "Kron Nang, Dak Lak, Vietnam", process: "natural", version: 1, revision: 1 })).toEqual({
      shortName: "VIET-002-1r1",
      fileName: "KLN7-VIET-NAT-002-1r1.kpro",
    });
  });

  it("has a code for every processing the intake offers, and the short name has no processing in it", () => {
    const processes = INTAKE_FIELDS.find((f) => f.id === "process" && "options" in f)!;
    const offered = "options" in processes ? processes.options.map((o) => o.value) : [];
    expect(Object.keys(PROCESS_CODES).sort()).toEqual([...offered].sort());
    expect(new Set(Object.values(PROCESS_CODES)).size).toBe(offered.length);
    for (const process of offered) {
      const names = profileNames({ ...base, process: process as keyof typeof PROCESS_CODES });
      expect(names.fileName).toContain(`-${PROCESS_CODES[process as keyof typeof PROCESS_CODES]}-`);
      expect(names.shortName).not.toContain(PROCESS_CODES[process as keyof typeof PROCESS_CODES]);
    }
  });

  it("keeps the short name within the 15 characters Studio shows, at the largest numbers it has room for", () => {
    expect(MAX_SHORT_NAME).toBe(15);
    const largest = profileNames({ ...base, beanId: 999, version: 99, revision: 99 });
    expect(largest.shortName).toBe("YIRG-999-99r99");
    expect(largest.shortName.length).toBeLessThanOrEqual(MAX_SHORT_NAME);
    expect(profileNames({ ...base, beanId: 1 }).shortName).toBe("YIRG-001-1r1");
  });

  it("names a number past the room it has in plain words", () => {
    expect(() => profileNames({ ...base, beanId: 1000 })).toThrow("bean number from 1 to 999; got 1000");
    expect(() => profileNames({ ...base, beanId: 0 })).toThrow("bean number from 1 to 999; got 0");
    expect(() => profileNames({ ...base, version: 100 })).toThrow("version from 1 to 99; got 100");
    expect(() => profileNames({ ...base, revision: 1.5 })).toThrow("revision from 1 to 99; got 1.5");
    expect(() => profileNames({ ...base, machineId: "other-machine" })).toThrow('No profile name code for the machine "other-machine"');
  });
});

describe("a version's revision", () => {
  const v = (number: number, profileKey: string | undefined, profileName = "Robusta", baseProfile?: string) => ({ number, profileKey, profileName, baseProfile });

  it("is 1 for a bean's first curve, and a level-only version keeps it", () => {
    const versions = [v(1, "aaa"), v(2, "aaa"), v(3, "aaa")];
    expect([1, 2, 3].map((n) => profileRevision(versions, n))).toEqual([1, 1, 1]);
  });

  it("takes the next number when the curve changes, and a return to an earlier curve takes its number back", () => {
    const versions = [v(1, "aaa"), v(2, "bbb"), v(3, "bbb"), v(4, "aaa"), v(5, "ccc")];
    expect([1, 2, 3, 4, 5].map((n) => profileRevision(versions, n))).toEqual([1, 2, 2, 1, 3]);
  });

  it("counts a version with no stored profile yet as its stock profile, the same curve as an earlier version on it", () => {
    const versions = [v(1, undefined, "KL Washed"), v(2, undefined, "KL Washed"), v(3, undefined, "2000-2700m RTD"), v(4, undefined, "KL Washed")];
    expect([1, 2, 3, 4].map((n) => profileRevision(versions, n))).toEqual([1, 1, 2, 1]);
    // A version written under the bean's name is that stock profile's curve: it names its base.
    const named = [v(1, "k1", "Yirgacheffe", "KL Washed"), v(2, undefined, "KL Washed")];
    expect(profileRevision(named, 2)).toBe(1);
  });

  it("only looks at versions up to the one asked about, and refuses a version the bean does not have", () => {
    const versions = [v(1, "aaa"), v(2, "bbb")];
    expect(profileRevision(versions, 1)).toBe(1);
    expect(() => profileRevision(versions, 3)).toThrow("The bean has no version 3.");
  });
});

import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { generateSeed } from "../scripts/seed-sql.js";
import { levelToTemp } from "../src/adapters/kaffelogic/parse.js";
import { STOCK_PROFILES } from "../src/adapters/kaffelogic/startingProfiles.js";
import { migratedDb, readSql } from "./pg.js";

let db: PGlite;

beforeAll(async () => {
  db = await migratedDb();
});

describe("stock profile tables", () => {
  it("seed file is up to date with the TypeScript table", () => {
    // Git on Windows may check the file out with CRLF line endings; the content is what matters.
    expect(readSql("002_stock_profiles_seed.sql").replace(/\r\n/g, "\n")).toBe(generateSeed());
  });

  it("loads every profile and level", async () => {
    const p = await db.query<{ n: number }>("select count(*)::int as n from stock_profile");
    expect(p.rows[0].n).toBe(Object.keys(STOCK_PROFILES).length);
    const l = await db.query<{ n: number }>("select count(*)::int as n from stock_profile_level");
    expect(l.rows[0].n).toBe(Object.values(STOCK_PROFILES).reduce((n, s) => n + Object.keys(s.levels).length, 0));
  });

  it("level_to_temp matches the TypeScript version", async () => {
    const levels = [204, 209, 214, 219, 222, 224, 226];
    for (const lvl of [-1, 0, 0.8, 3, 3.3, 5.5, 6, 9]) {
      const r = await db.query<{ t: string }>("select level_to_temp($1::numeric[], $2) as t", [levels, lvl]);
      expect(Number(r.rows[0].t)).toBeCloseTo(levelToTemp(levels, lvl)!, 6);
    }
  });

  it("every stored end temperature agrees with its level", async () => {
    const r = await db.query<{ off: string }>(
      "select max(abs(level_to_temp(p.roast_levels_c, l.level) - l.end_temp_c)) as off from stock_profile_level l join stock_profile p on p.id = l.profile_id",
    );
    expect(Number(r.rows[0].off)).toBeLessThan(0.051);
  });

  it("answers the starting-profile lookup in plain SQL", async () => {
    const r = await db.query<{ name: string; level: string; end_temp_c: string; ends_at_s: number }>(
      `select p.name, l.level, l.end_temp_c, l.ends_at_s
         from stock_profile p join stock_profile_level l on l.profile_id = p.id
        where p.selectable and p.family = 'altitude' and p.drink_when = $1
          and $2 >= p.altitude_min_m and ($2 < p.altitude_max_m or p.altitude_max_m = 2700)
          and l.goal = $3`,
      ["soon", 1850, "espresso"],
    );
    expect(r.rows).toEqual([{ name: "1500-2000m RTD", level: "3.1", end_temp_c: "219.3", ends_at_s: 619 }]);
  });

  it("rejects a profile without seven levels", async () => {
    await expect(
      db.exec(`insert into stock_profile (id, machine_id, name, family, roast_levels_c) values ('x', 'kaffelogic-nano7', 'x', 'special', '{1,2,3}')`),
    ).rejects.toThrow();
  });
});

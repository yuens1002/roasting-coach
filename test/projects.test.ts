import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { type Field, INTAKE_FIELDS, ROAST_FIELDS, TASTING_FIELDS } from "../src/core/intake.js";
import { fieldColumn as column } from "../src/db/store.js";
import { migratedDb } from "./pg.js";

type Row = Record<string, unknown>;
let db: PGlite;

async function insert(table: string, row: Row): Promise<number> {
  const cols = Object.keys(row);
  const r = await db.query<{ id: number }>(
    `insert into ${table} (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    Object.values(row),
  );
  return Number(r.rows[0].id);
}

/** Whether the insert succeeds; nothing is kept either way. */
async function accepts(table: string, row: Row): Promise<boolean> {
  await db.exec("begin");
  try {
    await insert(table, row);
    return true;
  } catch {
    return false;
  } finally {
    await db.exec("rollback");
  }
}

const bean = (over: Row = {}): Row => ({ name: "Guji", species: "arabica", decaf: false, process: "washed", goal: "filter", drink_when: "rest", ...over });
const version = (beanId: number, over: Row = {}): Row => ({
  bean_id: beanId,
  number: 1,
  machine_id: "kaffelogic-nano7",
  stock_profile_id: "kaffelogic-nano7/1500-2000m-rest",
  profile_name: "1500-2000m Rest",
  level: 2.5,
  end_temp_c: 220.1,
  ...over,
});
const roast = (versionId: number, over: Row = {}): Row => ({ version_id: versionId, roasted_at: "2026-10-01T09:00:00Z", green_g: 120, roasted_g: 102, ...over });
const tasting = (roastId: number, over: Row = {}): Row => ({ roast_id: roastId, tasted_on: "2026-10-05", brew: "pourover", quality: 4, taste: ["sweet"], ...over });

let beanId: number;
let v1: number;
let roastId: number;

beforeAll(async () => {
  db = await migratedDb();
  beanId = await insert("bean", bean());
  v1 = await insert("profile_version", version(beanId, { change_reason: "Starting profile: washed, 1850 m, rest" }));
  roastId = await insert("roast", roast(v1));
});

describe("tables match the forms in src/core/intake.ts", () => {
  const forms: [string, Field[], (over: Row) => Row][] = [
    ["bean", INTAKE_FIELDS, (over) => bean(over)],
    ["roast", ROAST_FIELDS, (over) => roast(v1, over)],
    ["tasting", TASTING_FIELDS, (over) => tasting(roastId, over)],
  ];

  for (const [table, fields, row] of forms) {
    it(`${table} has a column for every field, not null when required`, async () => {
      const r = await db.query<{ column_name: string; is_nullable: string }>(
        "select column_name, is_nullable from information_schema.columns where table_name = $1",
        [table],
      );
      const cols = new Map(r.rows.map((c) => [c.column_name, c.is_nullable]));
      for (const f of fields) {
        expect(cols.has(column(f.id)), `${table}.${column(f.id)} for field ${f.id}`).toBe(true);
        if (f.required) expect(cols.get(column(f.id)), `${table}.${column(f.id)} should be not null`).toBe("NO");
      }
    });

    it(`${table} accepts each number field's range and nothing outside it`, async () => {
      // Roasted weight must stay below green weight, so each weight is tested with the other out of the way.
      const companion: Record<string, Row> = { greenG: { roasted_g: 30 }, roastedG: { green_g: 200 } };
      let checked = 0;
      for (const f of fields) {
        if (f.kind !== "number" || f.min === undefined || f.max === undefined) continue;
        const at = (v: number) => accepts(table, row({ ...companion[f.id], [column(f.id)]: v }));
        expect(await at(f.min), `${f.id} = min ${f.min}`).toBe(true);
        // A roasted weight at the maximum can never be below a green weight, which shares that maximum.
        if (f.id !== "roastedG") expect(await at(f.max), `${f.id} = max ${f.max}`).toBe(true);
        expect(await at(f.min - 1), `${f.id} below min`).toBe(false);
        expect(await at(f.max + 1), `${f.id} above max`).toBe(false);
        checked++;
      }
      expect(checked, `${table} has number fields with ranges`).toBeGreaterThanOrEqual(table === "tasting" ? 0 : 1);
    });

    it(`${table} accepts every option and nothing else`, async () => {
      for (const f of fields) {
        if (f.kind !== "choice" && f.kind !== "chips") continue;
        const value = (v: string) => (f.kind === "chips" ? [v] : v);
        for (const o of f.options) expect(await accepts(table, row({ [column(f.id)]: value(o.value) })), `${f.id} = ${o.value}`).toBe(true);
        expect(await accepts(table, row({ [column(f.id)]: value("bogus") })), `${f.id} = bogus`).toBe(false);
      }
    });
  }
});

describe("profile versions", () => {
  it("chains versions to the starting profile", async () => {
    const v2 = await insert("profile_version", version(beanId, { parent_id: v1, number: 2, level: 3.2, end_temp_c: 222.4, change_reason: "Sour: one level darker" }));
    const v3 = await insert("profile_version", version(beanId, { parent_id: v2, number: 3, level: 3.0, end_temp_c: 221.6, change_reason: "A bit roasty: back off 0.2" }));
    const r = await db.query<{ number: number; change_reason: string }>(
      `with recursive lineage as (
         select * from profile_version where id = $1
         union all
         select p.* from profile_version p join lineage l on p.id = l.parent_id
       ) select number, change_reason from lineage`,
      [v3],
    );
    expect(r.rows.map((x) => x.number)).toEqual([3, 2, 1]);
  });

  it("requires a change reason on every version after the first", async () => {
    expect(await accepts("profile_version", version(beanId, { parent_id: v1, number: 9 }))).toBe(false);
  });

  it("rejects a parent from another bean", async () => {
    const other = await insert("bean", bean({ name: "Other" }));
    expect(await accepts("profile_version", version(other, { parent_id: v1, change_reason: "x" }))).toBe(false);
  });

  it("rejects a repeated version number within a bean", async () => {
    expect(await accepts("profile_version", version(beanId, { number: 1 }))).toBe(false);
  });
});

describe("roasts and tastings", () => {
  it("computes weight loss from the weights", async () => {
    const r = await db.query<{ weight_loss_pct: string }>("select weight_loss_pct from roast where id = $1", [roastId]);
    expect(r.rows[0].weight_loss_pct).toBe("15.0");
  });

  it("rejects a roasted weight that isn't below the green weight", async () => {
    expect(await accepts("roast", roast(v1, { roasted_g: 120 }))).toBe(false);
  });

  it("keeps features only alongside the log they came from", async () => {
    expect(await accepts("roast", roast(v1, { features: { totalTime: 600 } }))).toBe(false);
    expect(await accepts("roast", roast(v1, { log_file: "raw", features: { totalTime: 600 } }))).toBe(false); // no format
    expect(await accepts("roast", roast(v1, { log_format: "kaffelogic-klog", log_file: "raw", features: { totalTime: 600 } }))).toBe(true);
  });

  it("allows several roasts of a version and several tastings of a roast", async () => {
    expect(await accepts("roast", roast(v1))).toBe(true);
    await insert("tasting", tasting(roastId, { tasted_on: "2026-10-03", quality: 3, taste: ["sour", "thin"] }));
    expect(await accepts("tasting", tasting(roastId))).toBe(true);
  });

  it("requires at least one taste and a 1-5 roast quality", async () => {
    expect(await accepts("tasting", tasting(roastId, { taste: [] }))).toBe(false);
    expect(await accepts("tasting", tasting(roastId, { quality: 6 }))).toBe(false);
  });

  it("deleting a bean deletes its versions, roasts and tastings", async () => {
    const b = await insert("bean", bean({ name: "Doomed" }));
    const v = await insert("profile_version", version(b));
    const rv = await insert("profile_version", version(b, { parent_id: v, number: 2, change_reason: "x" }));
    const ro = await insert("roast", roast(rv));
    await insert("tasting", tasting(ro));
    await db.query("delete from bean where id = $1", [b]);
    const r = await db.query<{ n: number }>(
      "select (select count(*) from profile_version where bean_id = $1) + (select count(*) from roast where id = $2) + (select count(*) from tasting where roast_id = $2) as n",
      [b, ro],
    );
    expect(Number(r.rows[0].n)).toBe(0);
  });
});

describe("migration 005 marks earlier scores as unrated", () => {
  it("keeps an old overall score but flags it, and rates new tastings from the start", async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { readdirSync } = await import("node:fs");
    const { DB_DIR, readSql } = await import("./pg.js");
    const old = new PGlite();
    // The database as it was before 005: a tasting with an overall score.
    for (const file of readdirSync(DB_DIR).filter((f) => f.endsWith(".sql") && f < "005").sort()) await old.exec(readSql(file));
    await old.exec(`
      insert into bean (name, species, decaf, process, goal, drink_when) values ('Old bean', 'arabica', false, 'washed', 'filter', 'rest');
      insert into profile_version (bean_id, number, machine_id, stock_profile_id, profile_name, level, end_temp_c)
        select id, 1, 'kaffelogic-nano7', 'kaffelogic-nano7/1500-2000m-rest', '1500-2000m Rest', 2.5, 220.1 from bean;
      insert into roast (version_id, roasted_at, green_g, roasted_g) select id, '2026-10-01T09:00:00Z', 120, 102 from profile_version;
      insert into tasting (roast_id, tasted_on, brew, score, taste) select id, '2026-10-05', 'pourover', 4, '{sweet}' from roast;`);
    await old.exec(readSql("005_roast_quality.sql"));
    const before = await old.query<{ quality: number; quality_rated: boolean }>("select quality, quality_rated from tasting");
    expect(before.rows).toEqual([{ quality: 4, quality_rated: false }]);
    await old.exec("insert into tasting (roast_id, tasted_on, brew, quality, taste) select id, '2026-10-06', 'pourover', 3, '{flat}' from roast");
    const after = await old.query<{ quality_rated: boolean }>("select quality_rated from tasting order by id");
    expect(after.rows.map((r) => r.quality_rated)).toEqual([false, true]);
  });
});

describe("migration 006 drops the rest and brew test settings", () => {
  it("removes a roaster's stored values for them and stops the table accepting them, keeping the other settings", async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { readdirSync } = await import("node:fs");
    const { DB_DIR, readSql } = await import("./pg.js");
    const old = new PGlite();
    // The database as it was before 006: a roaster with their own values for two cup-test settings and one other.
    for (const file of readdirSync(DB_DIR).filter((f) => f.endsWith(".sql") && f < "006").sort()) await old.exec(readSql(file));
    await old.exec("insert into roaster_setting (key, value) values ('restTestDays', 5), ('brewTestCount', 4), ('stepPct', 8)");
    await old.exec(readSql("006_drop_cup_settings.sql"));
    const kept = await old.query<{ key: string; value: string }>("select key, value::text as value from roaster_setting order by key");
    expect(kept.rows).toEqual([{ key: "stepPct", value: "8" }]);
    await expect(old.exec("insert into roaster_setting (key, value) values ('restTestDays', 3)")).rejects.toThrow(/roaster_setting_key_check/);
    await old.exec("insert into roaster_setting (key, value) values ('holdMinQuality', 3)");
  });
});

describe("migration 007 makes the brewing goal optional", () => {
  it("keeps a goal already stored and accepts a bean without one", async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { readdirSync } = await import("node:fs");
    const { DB_DIR, readSql } = await import("./pg.js");
    const old = new PGlite();
    for (const file of readdirSync(DB_DIR).filter((f) => f.endsWith(".sql") && f < "007").sort()) await old.exec(readSql(file));
    await old.exec("insert into bean (name, species, decaf, process, goal, drink_when) values ('Old bean', 'arabica', false, 'washed', 'espresso', 'rest')");
    await expect(old.exec("insert into bean (name, species, decaf, process, drink_when) values ('No goal yet', 'arabica', false, 'washed', 'rest')")).rejects.toThrow(/null value in column "goal"/);
    await old.exec(readSql("007_bean_goal_optional.sql"));
    await old.exec("insert into bean (name, species, decaf, process, drink_when) values ('No goal', 'arabica', false, 'washed', 'rest')");
    const rows = await old.query<{ name: string; goal: string | null }>("select name, goal from bean order by id");
    expect(rows.rows).toEqual([{ name: "Old bean", goal: "espresso" }, { name: "No goal", goal: null }]);
  });
});

// Applies db/*.sql in name order, once each, recording them in schema_migrations. Shared by
// `npm run db:migrate` and the dev station, which builds a throwaway database the same way.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";

const dir = join(import.meta.dirname, "..", "db");

/** Applies every migration not yet recorded and returns the file names it applied; `onApplied` hears of each one as it commits, so a later failure still leaves a record of the earlier ones. */
export async function migrate(client: pg.Client, onApplied?: (file: string) => void): Promise<string[]> {
  await client.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await client.query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name));
  const applied: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    await client.query("begin");
    try {
      await client.query(readFileSync(join(dir, file), "utf8"));
      await client.query("insert into schema_migrations (name) values ($1)", [file]);
      await client.query("commit");
      applied.push(file);
      onApplied?.(file);
    } catch (e) {
      await client.query("rollback");
      throw new Error(`${file}: ${(e as Error).message}`);
    }
  }
  return applied;
}

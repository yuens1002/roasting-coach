// Applies db/*.sql in name order, once each, recording them in schema_migrations.
// Usage: npm run db:migrate   (reads DATABASE_URL, defaulting to the docker-compose database)
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { connect } from "./db.js";

const dir = join(import.meta.dirname, "..", "db");
const client = await connect();
try {
  await client.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await client.query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name));
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    await client.query("begin");
    try {
      await client.query(readFileSync(join(dir, file), "utf8"));
      await client.query("insert into schema_migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log(`applied ${file}`);
    } catch (e) {
      await client.query("rollback");
      throw new Error(`${file}: ${(e as Error).message}`);
    }
  }
  console.log("database is up to date");
} finally {
  await client.end();
}

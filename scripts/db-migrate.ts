// Applies db/*.sql in name order, once each, recording them in schema_migrations.
// Usage: npm run db:migrate   (reads DATABASE_URL, defaulting to the docker-compose database)
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const root = join(import.meta.dirname, "..");
try {
  process.loadEnvFile(join(root, ".env"));
} catch {
  // No .env: use the docker-compose database.
}
const url = process.env.DATABASE_URL ?? "postgres://roast:roast@localhost:54320/roast_copilot";
const dir = join(root, "db");

// A freshly started container takes a few seconds to accept connections (and
// restarts once after its first-run setup), so retry for up to 30 s.
async function connect(): Promise<pg.Client> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const client = new pg.Client({ connectionString: url });
    client.on("error", () => {}); // a dropped startup connection must not crash the process
    try {
      await client.connect();
      await client.query("select 1");
      return client;
    } catch (e) {
      await client.end().catch(() => {});
      if (Date.now() > deadline) throw new Error(`can't reach ${url.replace(/:[^:@/]*@/, ":***@")}: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
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

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

export const DB_DIR = join(__dirname, "..", "db");
export const readSql = (file: string) => readFileSync(join(DB_DIR, file), "utf8");

/** An in-memory Postgres with every db/*.sql applied in name order, as `npm run db:migrate` does. */
export async function migratedDb(): Promise<PGlite> {
  const db = new PGlite();
  for (const file of readdirSync(DB_DIR).filter((f) => f.endsWith(".sql")).sort()) await db.exec(readSql(file));
  return db;
}

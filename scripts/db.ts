// Connection to the app database for scripts. Reads DATABASE_URL (from .env if
// present), defaulting to the docker-compose database.
import pg from "pg";
import type { Db } from "../src/db/store.js";
import "./env.js";

export const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://roast:roast@localhost:54320/roast_copilot";

// A freshly started container takes a few seconds to accept connections (and
// restarts once after its first-run setup), so retry for up to 30 s.
export async function connect(): Promise<pg.Client> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const client = new pg.Client({ connectionString: DATABASE_URL });
    client.on("error", () => {}); // a dropped startup connection must not crash the process
    try {
      await client.connect();
      await client.query("select 1");
      return client;
    } catch (e) {
      await client.end().catch(() => {});
      if (Date.now() > deadline) throw new Error(`can't reach ${DATABASE_URL.replace(/:[^:@/]*@/, ":***@")}: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

/** A pg client seen through the store's Db interface. */
export const asDb = (client: pg.Client): Db => ({ query: (text, params) => client.query(text, params as unknown[]) as never });

// Writes db/002_stock_profiles_seed.sql. Usage: npm run db:seed
// Written from Node rather than shell redirection so the bytes are the same on every OS.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateSeed } from "./seed-sql.js";

writeFileSync(join(import.meta.dirname, "..", "db", "002_stock_profiles_seed.sql"), generateSeed());

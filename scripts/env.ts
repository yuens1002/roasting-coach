// Loads .env (if present) once, for every script.
import { join } from "node:path";

export const ROOT = join(import.meta.dirname, "..");
try {
  process.loadEnvFile(join(ROOT, ".env"));
} catch {
  // No .env: defaults apply.
}

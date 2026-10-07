import { defineConfig } from "vitest/config";

// Starting the in-memory Postgres (PGlite) takes a couple of seconds, and longer when the machine
// is busy or several suites run at once, so the 5 s default flakes.
export default defineConfig({ test: { testTimeout: 30_000 } });

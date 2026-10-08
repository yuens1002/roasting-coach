import { defineConfig } from "vitest/config";

// Starting the in-memory Postgres (PGlite) takes a couple of seconds, and longer when the machine
// is busy or several suites run at once, so the 5 s default flakes. Four suites start it in a
// beforeAll hook, which has its own timeout (10 s by default): three full runs at once hit it
// ("Hook timed out in 10000ms"), so it is raised with the test timeout.
export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 60_000 } });

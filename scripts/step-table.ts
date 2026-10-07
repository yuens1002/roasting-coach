// Usage: npm run rules:steps
// Prints the table of what a thermal-dose step means on each stock profile (level, end temperature,
// time), measured from your own Kaffelogic files in KAFFELOGIC_DIR. It is the table in docs/RULES.md;
// run it after changing a step size and paste it between the markers there.
import { parseKpro } from "../src/adapters/kaffelogic/parse.js";
import { stepTable } from "../src/adapters/kaffelogic/stepTable.js";
import { STOCK_PROFILES } from "../src/adapters/kaffelogic/startingProfiles.js";
import { findBaseProfile, formatKpro } from "../src/adapters/kaffelogic/writeProfile.js";
import { KAFFELOGIC_DIR, loadLibrary } from "./library.js";

const library = loadLibrary();
const profiles = Object.fromEntries(
  Object.keys(STOCK_PROFILES).flatMap((name) => {
    const base = findBaseProfile(library, { name });
    return base ? [[name, parseKpro(formatKpro(base.lines))]] : [];
  }),
);
if (!Object.keys(profiles).length) {
  console.error(`No stock profiles found in ${KAFFELOGIC_DIR}. Put your Kaffelogic .kpro files there (see README).`);
  process.exit(1);
}
console.log(stepTable(profiles));

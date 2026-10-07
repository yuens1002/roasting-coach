// Usage: npm run rules:steps
// Prints the table of what a thermal-dose step means on each stock profile (level, end temperature,
// time), measured from your own Kaffelogic files in KAFFELOGIC_DIR. It is the table in docs/RULES.md;
// run it after changing a step size and paste it between the markers there.
import { stepTable, stockProfilesFrom } from "../src/adapters/kaffelogic/stepTable.js";
import { KAFFELOGIC_DIR, loadLibrary } from "./library.js";

const profiles = stockProfilesFrom(loadLibrary());
if (!Object.keys(profiles).length) {
  console.error(`No stock profiles found in ${KAFFELOGIC_DIR}. Put your Kaffelogic .kpro files there (see README).`);
  process.exit(1);
}
console.log(stepTable(profiles));

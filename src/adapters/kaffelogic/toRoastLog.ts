import type { RoastEvent, RoastLog, RoastSample } from "../../core/types.js";
import { type KaffelogicLog, levelToTemp } from "./parse.js";
import { MACHINE_ID } from "./startingProfiles.js";

const EVENT_MARKERS = ["colour_change", "first_crack", "second_crack", "roast_end"] as const;

/** Maps a parsed Kaffelogic log onto the machine-independent RoastLog. */
export function kaffelogicToRoastLog(log: KaffelogicLog): RoastLog {
  const d = log.data;
  const time = d.time ?? [];
  // `temp` is the temperature the Nano controls on; `mean_temp` is a smoothed copy.
  const bean = d.temp ?? d.mean_temp ?? d.spot_temp;
  if (!bean) throw new Error("Kaffelogic log has no temperature column");

  const samples: RoastSample[] = time.map((t, i) => ({
    t,
    beanTemp: bean[i],
    targetTemp: d.profile?.[i],
    machineRor: d.actual_ROR?.[i],
    power: d.power_kW?.[i],
    fan: d.actual_fan_RPM?.[i],
  }));

  const events: RoastEvent[] = [];
  for (const name of EVENT_MARKERS) {
    const t = log.markers[name];
    if (t === undefined) continue;
    // On the Nano the roaster presses a button for colour change and first crack;
    // the machine itself decides when the roast ends.
    events.push({ name, t, source: name === "roast_end" ? "machine" : "user" });
  }

  return {
    machine: MACHINE_ID,
    profileName: log.profile.shortName || undefined,
    roastDate: log.roastDate,
    ambientTemp: log.ambientTemp,
    batchGrams: log.loadSize,
    nativeLevel: log.level,
    targetEndTemp: log.level !== undefined ? levelToTemp(log.profile.roastLevels, log.level) : undefined,
    samples,
    events,
    machineReported: { developmentPercent: log.markers.development_percent },
  };
}

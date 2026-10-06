// Made-up Kaffelogic files for tests; real ones are never committed (see CONTRIBUTING.md).

// A made-up profile in the .kpro shape: a straight line from 20 °C at 0 s to 220 °C at 600 s.
const CURVE = "0,20,0,0,200,86.6667,600,220,400,153.333,0,0";
export const PROFILE = [
  "profile_short_name:Test line",
  "profile_designer:roasting-coach tests",
  "profile_description:First line\\vSecond line",
  "recommended_level:3.3",
  "expect_fc:0.0",
  "zone1_time_start:100",
  "zone1_time_end:200",
  "zone1_boost:3",
  "zone2_time_start:0",
  "zone2_time_end:0",
  "zone2_boost:4",
  "roast_levels:204,209,214,219,222,224,226",
  `roast_profile:${CURVE}`,
  "fan_profile:0,14700,0,0,100,14700,600,13200,500,13200,0,0",
].join("\n");

/** A synthetic log that follows the line above: 1 °C every 3 s, crack marked at 540 s. */
export function syntheticLog(markers: Record<string, number>): string {
  const rows: string[] = [];
  for (let t = 0; t <= 640; t++) {
    const temp = t <= 600 ? 20 + t / 3 : 220 - (t - 600) * 2; // cooling after the end
    rows.push([t, temp, temp, temp, Math.min(20 + t / 3, 220), 20, 20, 20, 1, 14700].join("\t") + "\t");
    for (const [name, at] of Object.entries(markers)) {
      // Real logs write markers a few seconds after the event.
      if (Math.round(at) + 5 === t) rows.push(`!${name}:${at}`);
    }
  }
  return [
    "log_file_name:test.klog",
    "roast_date:25/06/2025 14:21:55 UTC",
    "roasting_level:3.3",
    "boost_load_size:120",
    "ambient_temperature:21.5",
    PROFILE,
    "",
    "offsets\t0\t0\t0\t0\t0\t0\t0\t0\t0",
    "time\t#spot_temp\t#=temp\t=mean_temp\t=profile\tprofile_ROR\t=actual_ROR\t#=desired_ROR\tpower_kW\t#^actual_fan_RPM",
    ...rows,
  ].join("\n");
}

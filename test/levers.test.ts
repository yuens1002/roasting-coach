import { describe, expect, it } from "vitest";
import { NO_OVERRIDES, applyChange, resolveCalibration } from "../src/core/calibration.js";
import { LEVERS, LEVER_EFFECTS, leverLedger, levelLadder } from "../src/core/levers.js";
import { type AdviceContext, DEFAULT_CALIBRATION, type TastedRoast, advise } from "../src/core/rules.js";

const roast = (thermalDose: number, quality: number, over: Partial<TastedRoast> = {}): TastedRoast => ({
  thermalDose,
  taste: ["flat"],
  quality,
  brew: "pourover",
  profile: "Robusta",
  restedDays: 1,
  tastings: [{ restedDays: 1, brew: "pourover", quality }],
  ...over,
});
/** A ladder of roasts, each about 10% less than the one before, oldest first, with the roast qualities given. */
const ladder = (qualities: number[], over: Partial<TastedRoast> = {}) => qualities.map((q, i) => roast(12 * 0.9 ** i, q, over));
const lever = (name: (typeof LEVERS)[number], latest: TastedRoast, earlier: TastedRoast[], calibration = DEFAULT_CALIBRATION, context?: AdviceContext) => leverLedger(latest, earlier, calibration, context).find((l) => l.lever === name)!;
const mine = (change: unknown) => {
  const r = applyChange(NO_OVERRIDES, change);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return resolveCalibration(r.overrides);
};

describe("every lever has an effect, in the order the ledger lists them", () => {
  it("lists rest, brew, level, profile and curve, each with a sentence", () => {
    expect(LEVERS).toEqual(["rest", "brew", "level", "profile", "curve"]);
    for (const l of LEVERS) expect(LEVER_EFFECTS[l].length, l).toBeGreaterThan(20);
    expect(leverLedger(roast(10, 3), [], DEFAULT_CALIBRATION).map((l) => l.lever)).toEqual(["rest", "brew", "level", "profile", "curve"]);
  });
});

describe("the level's steps", () => {
  it("counts each real step back from the latest roast, in the direction it went", () => {
    const rs = ladder([3, 3, 3, 3]);
    expect(levelLadder(rs[3], rs.slice(0, 3), DEFAULT_CALIBRATION)).toMatchObject({ steps: 3, direction: "less" });
    expect(levelLadder(rs[1], rs.slice(0, 1), DEFAULT_CALIBRATION)).toMatchObject({ steps: 1, direction: "less" });
    // The same ladder walked upwards: more roasting each time.
    const up = ladder([3, 3, 3]).map((r, i) => ({ ...r, thermalDose: 9 * 1.1 ** i }));
    expect(levelLadder(up[2], up.slice(0, 2), DEFAULT_CALIBRATION)).toMatchObject({ steps: 2, direction: "more" });
  });
  it("counts a repeat of a rung, or a move inside the noise band, once: it is walked past, not a place to stop", () => {
    // 10.8 to 10.7 is under 1%: the same rung roasted twice. The run still reaches 12 above it.
    const rs = [roast(12, 3), roast(10.8, 3), roast(10.7, 3), roast(9.6, 3)];
    const ladder = levelLadder(rs[3], rs.slice(0, 3), DEFAULT_CALIBRATION);
    expect(ladder.steps).toBe(2);
    expect(ladder.run.map((r) => r.thermalDose)).toEqual([12, 10.7, 9.6]);
  });
  it("is not wiped out by the latest roast being a repeat of the one before", () => {
    // Three rungs (12, 10.8, 9.7) and then 9.75, the same level again: two steps, not none.
    const rs = [roast(12, 2), roast(10.8, 3), roast(9.7, 3), roast(9.75, 3)];
    expect(levelLadder(rs[3], rs.slice(0, 3), DEFAULT_CALIBRATION)).toMatchObject({ steps: 2, direction: "less" });
    const l = lever("level", rs[3], rs.slice(0, 3));
    expect(l.state).toBe("unclear");
    expect(l.evidence).not.toContain("No step");
  });
  it("counts a move of exactly noResponsePct as a step, whichever way it went", () => {
    // 10 to 10.7 measures a hair over 7%, 10 to 9.3 a hair under, in floating point; both are 7%.
    expect(levelLadder(roast(10.7, 3), [roast(10, 3)], DEFAULT_CALIBRATION).steps).toBe(1);
    expect(levelLadder(roast(9.3, 3), [roast(10, 3)], DEFAULT_CALIBRATION).steps).toBe(1);
    expect(levelLadder(roast(10.69, 3), [roast(10, 3)], DEFAULT_CALIBRATION).steps).toBe(0);
  });
  it("stops where the direction turns", () => {
    const rs = [roast(9, 3), roast(12, 3), roast(10.8, 3)];
    expect(levelLadder(rs[2], rs.slice(0, 2), DEFAULT_CALIBRATION)).toMatchObject({ steps: 1, direction: "less" });
  });
  it("ignores roasts on another profile", () => {
    const rs = [roast(12, 3, { profile: "KL Washed" }), roast(10.8, 3), roast(9.7, 3)];
    expect(levelLadder(rs[2], rs.slice(0, 2), DEFAULT_CALIBRATION).steps).toBe(1);
  });
  it("compares fingerprints when both are known, not names", () => {
    const rs = [roast(12, 3, { profileKey: "a" }), roast(10.8, 3, { profileKey: "b" }), roast(9.7, 3, { profileKey: "b" })];
    expect(levelLadder(rs[2], rs.slice(0, 2), DEFAULT_CALIBRATION).steps).toBe(1);
  });
});

describe("the level lever", () => {
  it("is untested before any real step", () => {
    expect(lever("level", roast(10, 3), []).state).toBe("untested");
  });
  it("says 'the last step' for one step and 'the last 2 steps' for more", () => {
    const rs = ladder([2, 3, 3]);
    expect(lever("level", rs[2], rs.slice(0, 2)).evidence).toContain("The last step did not raise it.");
    const more = ladder([3, 3, 3]);
    expect(lever("level", more[2], more.slice(0, 2)).evidence).toContain("The last 2 steps did not raise it.");
  });
  it("counts only the steps at the end of the run: an earlier stall doesn't count once the last step raised the quality", () => {
    // Two steps with no gain (3, 3, 2) and then a rise (3): a plain count of stalled steps says exhausted, the trailing count says moving.
    const rs = ladder([3, 3, 2, 3]);
    expect(lever("level", rs[3], rs.slice(0, 3)).state).toBe("moving");
    // And the other way round: a rise early on, then two stalled steps at the end.
    const late = ladder([2, 3, 3, 3]);
    expect(lever("level", late[3], late.slice(0, 3)).state).toBe("exhausted");
  });
  it("is moving while the last step raised the quality", () => {
    const rs = ladder([1, 2, 3]);
    expect(lever("level", rs[2], rs.slice(0, 2)).state).toBe("moving");
  });
  it("is unclear after one step that did not raise the quality, exhausted after the roaster's number of them", () => {
    const rs = ladder([2, 3, 3, 3]);
    expect(lever("level", rs[2], rs.slice(0, 2)).state).toBe("unclear");
    expect(lever("level", rs[3], rs.slice(0, 3)).state).toBe("exhausted");
    expect(lever("level", rs[3], rs.slice(0, 3), mine({ settings: { plateauSteps: 3 } })).state).toBe("unclear");
    expect(lever("level", rs[2], rs.slice(0, 2), mine({ settings: { plateauSteps: 1 } })).state).toBe("exhausted");
  });
  it("only looks at the steps at the end: an earlier improvement doesn't hide a stall", () => {
    // Defect removed on the way (2 to 3), then two steps with nothing more.
    const rs = ladder([2, 3, 3, 3]);
    expect(lever("level", rs[3], rs.slice(0, 3)).state).toBe("exhausted");
  });
  it("is never exhausted by a cup at the bar", () => {
    const rs = ladder([4, 4, 4]);
    expect(lever("level", rs[2], rs.slice(0, 2)).state).toBe("unclear");
    expect(lever("level", rs[2], rs.slice(0, 2), mine({ settings: { holdMinQuality: 5 } })).state).toBe("exhausted");
  });
  it("says the qualities and the thermal dose it saw, and warns when the tastings were on different days of rest", () => {
    const rs = ladder([3, 3, 3]);
    rs[2] = { ...rs[2], restedDays: 0, tastings: [{ restedDays: 0, brew: "pourover", quality: 3 }] };
    const l = lever("level", rs[2], rs.slice(0, 2));
    expect(l.evidence).toBe("2 steps less roasting on this profile (thermal dose 12 to 9.7, about 19% less); the roast quality was 3, 3 and 3. The last 2 steps did not raise it.");
    expect(l.caveat).toBe("The tastings were on different days of rest (1, 1 and 0), which can blur the comparison.");
    expect(lever("level", ladder([3, 3, 3])[2], ladder([3, 3, 3]).slice(0, 2)).caveat).toBeUndefined();
  });
});

describe("the rest lever", () => {
  it("is untested when every tasting was on one day, and says which", () => {
    const l = lever("rest", roast(10, 3), []);
    expect(l).toMatchObject({ state: "untested" });
    expect(l.evidence).toBe("Every tasting so far was on day 1 after roasting; no roast has been tasted again on another day.");
  });
  it("is moving when a roast's quality was higher on a later day", () => {
    const again = roast(10, 2, { level: 3, tastings: [{ restedDays: 0, brew: "pourover", quality: 1 }, { restedDays: 1, brew: "pourover", quality: 2 }] });
    const l = lever("rest", roast(9, 3), [again]);
    expect(l).toMatchObject({ state: "moving", evidence: "The level 3 roast had roast quality 1 on day 0 and 2 on day 1." });
  });
  it("is unclear after a short retaste with no gain, and exhausted after a fair one", () => {
    const retaste = (days: number) => roast(10, 3, { tastings: [{ restedDays: 0, brew: "pourover", quality: 3 }, { restedDays: days, brew: "pourover", quality: 3 }] });
    expect(lever("rest", roast(9, 3), [retaste(1)]).state).toBe("unclear");
    expect(lever("rest", roast(9, 3), [retaste(3)]).state).toBe("exhausted");
    expect(lever("rest", roast(9, 3), [retaste(3)], mine({ settings: { restTestDays: 5 } })).state).toBe("unclear");
    expect(lever("rest", roast(9, 3), [retaste(3)]).next).toBeUndefined();
  });
  it("credits the best later day, not just the last: a rise and a fall is still a rise", () => {
    const peaked = roast(10, 3, { level: 3, tastings: [{ restedDays: 0, brew: "pourover", quality: 3 }, { restedDays: 2, brew: "pourover", quality: 4 }, { restedDays: 6, brew: "pourover", quality: 3 }] });
    expect(lever("rest", roast(9, 3), [peaked])).toMatchObject({ state: "moving", evidence: "The level 3 roast had roast quality 3 on day 0 and 4 on day 2." });
  });
  it("compares days only within one brew, so a change of brew can't be credited to rest", () => {
    const changed = roast(10, 3, { tastings: [{ restedDays: 1, brew: "pourover", quality: 3 }, { restedDays: 5, brew: "espresso", quality: 4 }] });
    expect(lever("rest", roast(9, 3), [changed])).toMatchObject({ state: "unclear", evidence: "One roast was tasted on different days but brewed differently each time, so the difference could be the brew." });
    expect(lever("brew", roast(9, 3), [changed])).toMatchObject({ state: "unclear", evidence: "One roast was brewed more than one way but never two ways on the same day, so the difference could be the rest." });
  });
  it("says so when different roasts were tasted on different days but no single roast was tasted twice", () => {
    const l = lever("rest", roast(10, 3), [roast(9, 3, { tastings: [{ restedDays: 0, brew: "pourover", quality: 3 }] })]);
    expect(l).toMatchObject({ state: "untested", evidence: "Tastings so far were on days 0 and 1 after roasting, but no single roast has been tasted on more than one day." });
  });
  it("does not blame an unrecorded rest", () => {
    expect(lever("rest", roast(10, 3, { restedDays: undefined, tastings: undefined }), []).evidence).toBe("No tasting says how many days the roast rested.");
  });
});

describe("the brew lever", () => {
  const brewed = (...pairs: [string, number][]) => roast(10, 3, { level: 2.4, tastings: pairs.map(([brew, quality]) => ({ restedDays: 1, brew, quality })) });
  it("is untested when everything was brewed one way, using the form's name for it", () => {
    expect(lever("brew", roast(10, 3), []).evidence).toBe("Every tasting so far was brewed as pour over; no roast has been brewed another way.");
  });
  it("is moving when another brew gave a higher quality", () => {
    const l = lever("brew", roast(9, 3), [brewed(["pourover", 3], ["espresso", 4])]);
    expect(l).toMatchObject({ state: "moving", evidence: "The level 2.4 roast had roast quality 4 brewed as espresso and 3 brewed as pour over." });
  });
  it("compares brews only on the same day, so a gain from resting isn't credited to the brew", () => {
    // Pour over rose from 3 to 4 between day 1 and day 5; espresso on day 5 scored 3. Same-day brews: 4 and 3, a real difference.
    const rested = roast(10, 3, { level: 2.4, tastings: [{ restedDays: 1, brew: "pourover", quality: 3 }, { restedDays: 5, brew: "pourover", quality: 4 }, { restedDays: 5, brew: "espresso", quality: 3 }] });
    expect(lever("brew", roast(9, 3), [rested]).evidence).toBe("The level 2.4 roast had roast quality 4 brewed as pour over and 3 brewed as espresso.");
    // The same brew twice is never a comparison of brews.
    const twice = roast(10, 3, { tastings: [{ restedDays: 1, brew: "pourover", quality: 3 }, { restedDays: 5, brew: "pourover", quality: 4 }] });
    expect(lever("brew", roast(9, 3), [twice]).state).toBe("untested");
  });
  it("says so when different roasts were brewed different ways but no single roast was brewed twice", () => {
    const l = lever("brew", roast(10, 3), [roast(9, 3, { tastings: [{ restedDays: 1, brew: "espresso", quality: 3 }] })]);
    expect(l).toMatchObject({ state: "untested", evidence: "No single roast has been brewed more than one way (brews so far: espresso and pour over)." });
  });
  it("is unclear with two brews and exhausted with three, when none gave a higher quality", () => {
    expect(lever("brew", roast(9, 3), [brewed(["pourover", 3], ["espresso", 3])]).state).toBe("unclear");
    expect(lever("brew", roast(9, 3), [brewed(["pourover", 3], ["espresso", 3], ["immersion", 3])]).state).toBe("exhausted");
    expect(lever("brew", roast(9, 3), [brewed(["pourover", 3], ["espresso", 3])], mine({ settings: { brewTestCount: 2 } })).state).toBe("exhausted");
  });
});

describe("the profile lever", () => {
  const alt: AdviceContext = { alternative: { profileName: "KL Washed", level: 1.2, endTempC: 217.6 } };
  it("is unavailable with no other profile to suggest", () => {
    expect(lever("profile", roast(10, 3), [])).toMatchObject({ state: "unavailable", evidence: "There's no other stock profile I'd suggest for this bean." });
  });
  it("is untested with an alternative nobody roasted, and says what to do", () => {
    expect(lever("profile", roast(10, 3), [], DEFAULT_CALIBRATION, alt)).toMatchObject({ state: "untested", next: "Roast it on KL Washed at level 1.2 (ends at 217.6 °C); it costs a roast." });
  });
  it("is moving when the alternative gave a higher quality, and unclear when it did not", () => {
    expect(lever("profile", roast(10, 2), [roast(9, 3, { profile: "KL Washed" })], DEFAULT_CALIBRATION, alt).state).toBe("moving");
    const l = lever("profile", roast(10, 3), [roast(9, 3, { profile: "KL Washed" })], DEFAULT_CALIBRATION, alt);
    expect(l.state).toBe("unclear");
    expect(l.evidence).toBe("KL Washed has 1 tasted roast, best roast quality 3, against 3 on the other profile. That is too few roasts to rule it out.");
  });
  it("compares against the profile it started on once the bean has been switched to the alternative", () => {
    const l = lever("profile", roast(10, 3, { profile: "KL Washed" }), [roast(9, 2)], DEFAULT_CALIBRATION, alt);
    expect(l).toMatchObject({ state: "moving", evidence: "KL Washed has 1 tasted roast, best roast quality 3, against 2 on the other profile." });
    // Only roasted on the alternative: nothing to compare with, and not called better.
    const only = lever("profile", roast(10, 3, { profile: "KL Washed" }), [], DEFAULT_CALIBRATION, alt);
    expect(only).toMatchObject({ state: "unclear", evidence: "KL Washed has 1 tasted roast, best roast quality 3. That is too few roasts to rule it out." });
  });
});

describe("the curve lever", () => {
  it("is out of reach and says how to bring a curve change back", () => {
    expect(lever("curve", roast(10, 3), [])).toMatchObject({ state: "unavailable", evidence: "This tool can't edit a curve yet." });
  });
});

describe("the clean-below-bar rule", () => {
  const rs = ladder([2, 3, 3, 3]);
  const run = (over: Partial<Parameters<typeof advise>[0]> = {}) => advise({ latest: rs[3], earlier: rs.slice(0, 3), ...over });
  it("asks, says there is no defect for the level to fix, and lists every lever with what it changes", () => {
    const a = run();
    expect(a).toMatchObject({ kind: "ask", ruleId: "clean-below-bar" });
    expect(a.reason).toContain("The cup is clean: no roast defect, so there is nothing for the level to fix. The roast quality is 3 (clean, with little character), below the 4 this tool aims for. What can raise it:");
    for (const lever of ["rest (untested)", "brew (untested)", "level (exhausted)", "profile (unavailable)", "curve (unavailable)"]) expect(a.reason, lever).toContain(`- ${lever}:`);
    expect(a.reason).toContain("The last 2 steps did not raise it.");
  });
  it("fires on a first roast too, where the level has not been tried either way", () => {
    const a = advise({ latest: roast(10, 3), earlier: [] });
    expect(a).toMatchObject({ kind: "ask", ruleId: "clean-below-bar" });
    expect(a.reason).toContain("- level (untested):");
    expect(a.reason).toContain("I wouldn't blame the coffee yet: rest, brew and level are still to try.");
  });
  it("names the levers still to try before blaming the coffee", () => {
    expect(run().reason).toContain("I wouldn't blame the coffee yet: rest and brew are still to try.");
  });
  it("names the coffee or the curve only when every lever the tool can reach has been tried", () => {
    const tried = rs.map((r, i) => (i === 3 ? { ...r, tastings: [{ restedDays: 0, brew: "pourover", quality: 3 }, { restedDays: 4, brew: "pourover", quality: 3 }, { restedDays: 4, brew: "espresso", quality: 3 }, { restedDays: 4, brew: "immersion", quality: 3 }] } : r));
    const a = run({ latest: tried[3], earlier: tried.slice(0, 3) });
    expect(a.reason).toContain("- rest (exhausted):");
    expect(a.reason).toContain("- brew (exhausted):");
    expect(a.reason).toContain("Everything this tool can move has had a fair test, the level in the direction it was tried. What is left is the curve, which the tool can't edit yet, or the coffee itself");
    expect(a.reason).not.toContain("I wouldn't blame the coffee");
  });
  it("quotes the roaster's reference when there is one, and says nothing about one when there isn't", () => {
    expect(run({ context: { reference: "Lively and fruit-forward." } }).reason).toContain('Your reference for this coffee is "Lively and fruit-forward". It says what the coffee can be, so don\'t write it off; compare the cup against it.');
    expect(run().reason).not.toContain("reference");
    expect(run({ context: { reference: "   " } }).reason).not.toContain("reference");
  });
  it("offers the other profile when there is one", () => {
    const a = run({ context: { alternative: { profileName: "KL Washed", level: 1.2, endTempC: 217.6 } } });
    expect(a.reason).toContain("- profile (untested):");
    expect(a.reason).toContain("Roast it on KL Washed at level 1.2 (ends at 217.6 °C); it costs a roast.");
  });
  it("uses the roaster's bar and their number of steps", () => {
    expect(run({ calibration: mine({ settings: { plateauSteps: 3 } }) }).reason).toContain("- level (unclear):");
    expect(run({ calibration: mine({ settings: { holdMinQuality: 3 } }) }).ruleId).not.toBe("clean-below-bar");
  });
  it("leaves a cup with a roast defect to the rules for that side", () => {
    const sour = ladder([2, 2, 2, 2], { taste: ["sour"] });
    expect(advise({ latest: sour[3], earlier: sour.slice(0, 3) }).ruleId).not.toBe("clean-below-bar");
  });
  it("leaves a good cup to keep-as-is, and a cup at the bar with no good word to no-rule", () => {
    const good = ladder([4, 4, 4], { taste: ["sweet", "balanced"] });
    expect(advise({ latest: good[2], earlier: good.slice(0, 2) }).ruleId).toBe("keep-as-is");
    expect(advise({ latest: roast(10, 4), earlier: [] }).ruleId).toBe("no-rule");
  });
  it("does not blame an unrecorded rest", () => {
    const bare = ladder([2, 3, 3, 3], { restedDays: undefined, tastings: undefined });
    expect(advise({ latest: bare[3], earlier: bare.slice(0, 3) }).reason).toContain("No tasting says how many days the roast rested.");
  });
});

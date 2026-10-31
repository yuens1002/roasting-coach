# Roadmap

The one place that records where the project stands: what works, what is next, what is waiting on
someone else. Update it in the same change that moves any of these. Design rationale lives in
[research.md](research.md) and [thread1-notes.md](thread1-notes.md); the release history is in
[CHANGELOG.md](../CHANGELOG.md).

Last updated 2026-10-28 (0.6.x alpha).

## The goal

The tool has one goal: show the roaster how to reach the potential of a given coffee, and teach them
to do it. It coaches the roast, not the taste.

Two things are kept apart (decided 2026-10-08):

- **The best roast of a coffee** is what this tool is for. It is judged by **roast quality**, a 1 to 5
  scale anchored to roast defects (a defect dominates the cup is 1; clean with little character is 3;
  clean and expressive is 4; see `docs/RULES.md` section 3), and measured in thermal dose.
- **How much the roaster likes the cup** is not a goal. It is not asked and not used. A flat cup with no
  roast defect is a 3 however little the roaster likes it.

Concretely (decided 2026-10-10): get a bean's roast right in **no more than three level changes**, by telling the
roaster which way to go each time. The count starts at the first level change the tool recommends, and counts the
versions behind the roast tasted on its profile (each is one change, whoever chose it; a switch of profile starts the count again). "Right", for what is
built, is a **clean cup, roast quality 3 or better**: the tool can't choose another profile for a cup that shows no
defect to point the way, and no rule chooses a curve change (`profile:edit` draws one only as the roaster describes it). A quality of **4 or better** stays the
aim for when a rule can choose the direction. The levers are the level, then the profile and the curve. When three level changes are used and the
cup still has a defect, the answer states to try a different profile (`level-changes-used`): it names the bean's other
profile when there is one, and otherwise asks the roaster to pick one, because the tool can't choose a profile for a bean
that has none to suggest. The bean's own table (`table`) is built as the roasts come in and shows where it stands. Still open:
choosing a profile deterministically for a bean with no alternative; carrying what one bean taught (the level that worked,
the step response) to the next.

Where it stands: the rules bracket a bean between uncooked (grassy, bready) and scorched (bitter, roasty, ashy) and go
halfway, name the level, or a switch to the bean's other profile, for cups with a roast defect. They hold (a cup
tasted too soon, a clean cup), and ask (mixed or contradictory evidence, or a quality that disagrees with the words).
The first real ladder (a bean roasted at four levels, 3.0 down to 2.1) went from ashy to flat and monotone, not
baked and not under-developed: a clean cup of little character, which is a 3, and done for now.

## Design direction: roast quality, not preference

**The direction (decided 2026-10-08): more objective, less opinionated.** The tool should become more
deterministic, with the only personal input being the roaster's own taste *sensitivity* (how they perceive
and name a cup), never their preference. When a rule, a message or a setting could be read as the tool
having a taste of its own (a target it prefers, wording that judges the coffee), that is a bug to remove.

First sweep done (2026-10-08): the engine's messages now state what the roasts and tastings show and what
a rule does, with no first-person opinion ("I wouldn't blame the coffee yet", "the one profile I'd
suggest"), no hedged belief ("probably", "usually means"), and no judgment of the coffee or the tool's own
aim ("don't write it off", "the best roast", "the 4 this tool aims for"). `test/voice.test.ts` keeps it so:
it checks every worked example and a set of extra cases against a short list of stances.

Second sweep done (2026-10-09): the same standard now covers the colour-change warning in
`src/core/features.ts`, the starting-profile reasons shown at intake (opinions of the coffee and unsourced
claims about it became statements about the stock profile), and the prose of `docs/RULES.md` outside its
worked examples (the Why and Check-this paragraphs and the `bready` note). The voice test reads all three.
One gap the sweep left (closed 2026-10-09, see below): a roaster who brewed for both filter and espresso was told the
roast starts at the espresso level, with no direction if the filter cup tasted flat.
The test's patterns cannot catch a neutrally worded claim about the world (the quoted lever effects had one,
"espresso exaggerates sourness", since removed), and it does not read the README, the session skill or the research notes.

**Decided (2026-10-09): rest and brew are not levers.** They change the cup, not the roast, and one bean
cannot show what they do (conventional wisdom on them would be an outside claim the tool cannot check).
The tool coaches the roast, so it controls them instead of advising on them.

**Decided (2026-10-09), changed 2026-10-10: the cupping protocol is one brew per coffee, the roaster's own.**
It was filter coffee only; a filter brew is now the suggestion for a roaster with no usual brew (the easiest cup to
make well with inexpensive equipment), and the roaster's own brew is theirs to say, because what the tool's author
brews is not what each roaster is used to. This is a customisation to each roaster that the tool accounts for and
still gives useful guidance with: the intake asks for the brew (`tastingBrew`: pour over, French press / immersion,
AeroPress, espresso, moka pot or other), every tasting of that coffee is of it, and `tasted-in-other-brew` (rule 1
of `docs/RULES.md`) asks for a retaste in it. A tasting left without a brew is recorded in it. A roast is counted by its
newest tasting in that brew; earlier roasts with none are left out and the answer says how many. The roaster can name a
different brew at any time. It is a way to compare tastings, not a roast target. The rules do not correct for what a
brew does to the cup; a roaster whose brew changes what a taste word means can set that word's meaning. The levers are now the level, the profile and the curve. The rest guard
(`tasted-too-soon`) stays: it rests on Kaffelogic's own Rest/RTD profile naming. The rule
`espresso-sour-only` is removed: it asserted a fact about espresso that nothing the tool records could
check.

**Decided (2026-10-10): database changes convert, they do not tolerate; breaking changes are versioned.** Nobody uses the
tool yet and the author's own roasts and profiles are disposable, so when the schema or a form changes, the migration
converts the stored rows (a default, a derivation, or a drop) and the code has no case for the old shape: no nullable
column kept for old rows, no fallback branch, no "unused, kept so answers are not lost". A change that breaks the stored
data, a command or a form is a breaking change and is versioned as one: while the version is 0.x, a minor bump
(0.2.0), listed under "Breaking" in `CHANGELOG.md`. Migration 008 is the first; migration 009 (0.3.0) deleted the tastings that
still held an old overall score (`quality_rated = false`, migration 005) with their skip logic in the rules, the CLI and the
skill, and dropped the unused `want_next` column.

**Decided (2026-10-09): roasting is not aimed at a brew method.** The coaching is for the best result the
bean's own properties allow (species, process, altitude, density, moisture, age), judged by roast quality. The intake no longer
asks "Brewing for", and nothing in the tool maps a brew method to a roast level. Every bean starts from the
same path: species and decaf first, then washed or natural (KL Washed or KL Natural, with the altitude profile
as the alternative), then the altitude band with RTD or Rest by when it will be drunk. The starting level was the one the
chosen profile's own file recommends (its `recommended_level`), which names no brew; the ladder of roasts finds the bean's
own level from there.
**Changed 2026-10-10: the intake asks for the roast colour the roaster is shooting for, on the SCA / Agtron scale**
(`agtronTarget`, 95 very light to 25 extremely dark; `src/core/roastColour.ts`), so a first level can be suggested for
that colour instead of every bean starting at the profile's default. The level is no longer defined by a brew
method: Kaffelogic's labels (filter, espresso, dark) are read only as three points on a profile's own ladder of levels.
Kaffelogic publishes no level-to-Agtron table (its levels are end temperatures), so the tie is made two ways. Until the
roaster has two colour readings on a profile at end temperatures 3 °C or more apart (the roast form's `colour` is an Agtron
reading now, with `colourMethod` saying how it was read, see below), the three levels a profile's file labels (Medium/Light, Medium, Medium/Dark) are taken as Agtron 70, 60 and
50 (`LABELLED_LEVEL_AGTRON`; 40 for the `0-1200m Rest` file's "Dark", `labelledAgtron`): the middle of the common roast-level
bands, the same middle a roaster's word is taken at (light 90, medium 60, dark 40; `ROAST_WORDS`). The bands follow LeBrew's lab
chart (one lab, one meter; `docs/research.md`). The match of Kaffelogic's words to the bands is our reading, not measured, and the
answer says so; the KL files use no colour words (brews with level ranges), so for them the Filter and Espresso levels listed are
taken as 70 and 60, a weaker guess.
**Changed 2026-10-11:** the level is found between the labelled levels and goes no further (a colour beyond the lightest or
darkest labelled level gets that level, `colour.beyondLabels`, and the answer says so): a straight extension of the ladder put
a dark target (Agtron 35) at level 5.9 on 1500-2000m RTD, 3 °C past the file's darkest recommendation and at the end of the
profile's ladder, and no file or measurement says what lies there. With readings, the level comes from the least-squares line
through them for that profile (`loadColourReadings`), across all the roaster's beans. A profile whose labelled levels reach
no darker than Agtron 60 (KL Washed, KL Natural) hands a darker target to the altitude profile; with readings, a colour beyond
the profile's lightest or darkest level gets that level and the answer says so. After the first roast the defects in the cup
decide every step. The roaster can restate the colour at any time (`bean:update`); it is their aim, not a measurement. Open: the
advice does not use the colour readings yet (a roast read lighter or darker than its target says nothing to the rules);
the readings are fitted per profile, not per bean or per density. Open: whether a level is the same colour across the altitude, Robusta and Decaf profiles (the roaster's observation on the machine; the files' wording fits it except the KL profiles, whose Espresso level, taken as 60, is 1.2 or 1.3) so one level-to-Agtron curve could take every reading, which only a colour meter can show; beans stored by migration 008 hold Agtron 55, which was then the word medium (now 60) and is a valid colour as it stands. Earlier "Brewing for" answers are dropped (column `goal`, removed by migration 008). What changes for the roaster: a washed or natural bean now starts on KL Washed or KL Natural
(at 0.8 and 1.4 when this was written, that profile's own recommendation; since 2026-10-11 the level comes from the colour, 1.0 to 1.3) whatever it was brewed for. Open: no model turns bean
properties (density, moisture, age) into a starting level; only the profile choice uses altitude and process.
The "Cupping" stock profile is never picked now; it stays in the table.

**Decided (2026-10-28): a colour reading says how it was read, with a colour meter or against the roast colour card (one
method per roast).** The two do not read the same (a card reading is one of the card's tiles, 95 to 25, never a number between
two), so `colourMethod` (`meter` or `card`) is given with `colour` and only with it (`colourReadingProblems`), and the fit of a
profile's levels to Agtron uses the readings of one method at a time: a meter's line when the profile has one, else the card's.
Readings of the two methods are never mixed. Migration 010 (0.6.0) marked every reading stored before as `meter`, which was
true: the form took readings "only with a colour meter", and the three stored are not card tiles. `roast:update` adds or
corrects a reading after the roast is recorded (a sample ground later). **Not built, on purpose:** both a card and a meter
reading on one roast, which would map the card's tiles to meter numbers; either one is enough. Open: the advice still does
not use the colour readings (see above).

**Idea (2026-10-09), planned 2026-10-11 (Next, 3), built in part: curve edits sized by thermal dose.** The thermal dose can be computed for
any curve, so a new profile can hold the total thermal dose fixed and change only the shape (moving it
between phases). That makes shape a clean experiment: the quality change belongs to the shape, not to a
different amount of heat. The roaster chooses to try it; the tool reports what a change does in measured
terms (thermal dose held, phase times, development ratio) and ranks nothing. To read first: what the curve nodes, fan and zones
control in real logs, and how closely the machine follows an edited curve (real roasts run 5.3 to 18.5% above
their curve's prediction).

Measurement (thermal dose, level to end temperature, rest days) and the basic reading of a cup (ashy and
bitter point to too much roasting, grassy and bready to too little; sour is not read as a roast defect, because it can come from the brew) are shared. What a roaster may
personalise is how they **perceive and name** a cup (what their taste words mean: one roaster's "flat" is
monotone, not baked or under-developed) and the **size of the method** (step sizes, how many steps count as
a fair try), kept in their own database with defaults shipped in the repo. Not personal, and not built:
what the roaster likes. Each roaster runs their own copy; sharing profiles stays undecided (see "Waiting on
others").

Built (one lever at a time): the rule settings and the meaning of each taste word can be overridden per
roaster (`calibration`, `calibration:set`; stored in `roaster_setting` and `roaster_taste_word`; defaults
stay in `rules.ts`; the rules take them through `Calibration`). Still to do: learning a roaster's own step size from their tastings instead of asking for
it; profile facts (rest days, alternatives) that the roaster can correct.

**Changed on 2026-10-08:** the tasting's 1 to 5 score was an overall liking; it is now the roast quality
(column `quality`, migration 005), and "next time I want" is no longer asked or used (its column is kept
so earlier answers aren't lost). Rules removed: `wish-against-taste`, `asked-for-change`. Rules added:
`quality-vs-words` (the quality has to agree with the words) and `clean-below-bar` (replaced on 2026-10-10: a clean cup is held). Tastings recorded
before the change held liking scores; migration 005 marked them unrated and migration 009 deleted them.

**Decided: the reference cup is optional.** It says what the coffee can be. It can be unknown, when the
producer doesn't specify the coffee. When the supplier or producer gives a description, that description is
the reference; it is the bean's `sellerNotes`, so no new storage is needed. The tool must give useful advice
with no reference at all, and must never treat a missing one as a sign the bean is poor.

**Decided (2026-10-10): sour is not a roast defect; a clean cup is done; three level changes.** The user's cup
reading is a bracket from uncooked (grassy, bready, baked or raw) to scorched (bitter, roasty, ashy), and the engine
goes halfway between the two sides when a bean has been tasted on both. Sour moved out of the under-roasted words
(it stays on the form, not acted on, and a roaster can assign it a side). A clean cup (roast quality 3 or more, no
under or over word) is held as done: the lever ledger, the `clean-below-bar` rule, the `no-rule` answer and the settings
`plateauSteps`, `profileTestRoasts` and `holdMinQuality` were removed (migration 009 clears the stored values), because
a ledger of levers the tool cannot move helps nobody. They return with profile choice and curve edits. Every tasting now
gets an answer from a rule, and a test says so. Built after it (same day): the bean's table (`src/core/beanTable.ts`,
`table <bean>`), and the rule `level-changes-used`, which states to try a different profile once three level changes are
behind the roast tasted on its profile and the cup still has a defect. A switch of profile starts the count again on that profile.

### Levers and ideas considered

What each change does, and where it stands. The reason is there when it was set aside.

| Considered | What it would change | Status |
|---|---|---|
| Level (thermal dose step) | Where the roast stops: more or less of the chemistry, by a measured amount | Built (rules 5, 6) |
| Rest (days before tasting) | How the roast has settled, not the roast | **Dropped as a lever (2026-10-09):** the rest guard (rule 4) stays |
| Brew method | How much of the roast reaches the cup, not the roast | **Dropped as a lever (2026-10-09):** every tasting of a coffee is of one brew, the roaster's own (rule 1) |
| Another stock profile | The curve's shape | Built as a switch (`level-not-helping`), only after a defect shows the level is not the lever; only washed and natural beans (which start on KL Washed or KL Natural) have an alternative. Not built: choosing another profile for a clean cup, which has no defect to point the way |
| Editing the curve, fan or zones | The curve's shape, tuned to the bean | Curve edits built as a preview the roaster asks for (`profile:edit`); the engine does not offer one. Fan and zones not built (see Next, 3) |
| Reference cup | What the coffee can be; stops it being written off | Built as the bean's `sellerNotes`, optional |
| Roaster's own words and numbers | Taste-word meanings, step sizes, the noise band | Built (`calibration`) |
| Roast quality, anchored to defects | A criterion that is about the roast, not the roaster's liking | Built (`quality`, rule 2 checks it against the words) |
| Liking and "next time I want" | What the roaster prefers | **Dropped:** not a goal of the tool. The `want_next` column was dropped by migration 009 |
| Size a step by how bad the cup was | Bigger first step for quality 1 than for 2 | Not built, on purpose: one bean is too little to set the sizes, and the ladder showed the level wasn't the lever. Revisit with a second bean; a personal setting when built |
| A rule for flat, monotone cups | Name what a flat cup means (baked, under-developed, bean) | Not built as a rule: a clean cup is held (`keep-as-is`); the word `flat` stays unmapped until a tasting shows what moves it |
| Probe for the edge of the clean zone | Find where sourness or ashiness starts, to centre the roast between them | A step costs a roast. Not built as a rule |
| Learn a roaster's own step size | Shortest path to the right roast per person | Not built: needs several beans |
| Fix the count of "three roasts" | Where the count starts, how a deliberate ladder counts | **Decided (2026-10-10):** three level changes, counted from the first level change recommended; each version behind the roast tasted is one. Built: `advise` says which one it is |

### Dev mode and production mode (decided 2026-10-24)

Two modes, kept apart. **Production** is what a roaster meets: the shipped engine, which relays only finished text from tested rules
and never uses a model's judgement. **Dev** is a session where Claude gives its own roasting judgement and writes down where that
differs from what production said; each difference is a candidate rule, input or test. The loop: run production on a real roast,
read the cup, set production's answer against the dev-mode view, change the tool, run again. A dev-mode view is an opinion with a
stated confidence and is never shown to a roaster as advice; it enters the tool only as a deterministic rule with a status (what it
rests on, how many roasts agree and disagree), and the `voice` and `rulesDoc` tests apply to it.

**First dev-mode findings (2026-10-25): a washed coffee roasted twice on one stock profile.** Production read the first cup as scorched and
said "10% less roasting"; the next cup was clean, quality 3, and production held it (`keep-as-is`). The roaster's tasting records stay in their
own database and are not reproduced here. Where the dev-mode view differs:

1. **Colour is not an input.** The first roast ended darker than the colour aimed at; the rules never compare the two. Colour gives a
   direction and a size the cup words do not.
2. **Weight loss and development ratio are not inputs.** Weight loss was 18% at about Agtron 42 and development 46.9% of the roast, long for
   that colour and above the development targets `startingProfiles.ts` lists for the stock profiles that have one (10 to 30%; none is
   listed for the Classic body itself). Dev-mode view (medium confidence): a long, slow finish, so a shorter or equal development, not a
   longer one. Check first the first-crack press (`cracksPressedOk` was not recorded), since the ratio rests on it.
3. **The brew's water temperature is not recorded.** The brews tasted for two roasts differed in it, and the tool cannot tell a roast defect from a
   hot brew. A candidate optional tasting field (a minor-version change under the conversion policy above).
4. **Level is the only lever.** Shape (development time at held thermal dose) is Next, 3; a bean is a case for it when a level change
   leaves the defect; a clean cup the roaster wants to take further is a candidate case (item 6), which reopens "a clean cup is done".

Results: a 10.9% cut in thermal dose (13.15 to 11.72) moved neither weight loss (18.0% to 18.2%) nor development (46.9% to 47.0%); the
end temperature fell 2 °C and the colour moved 4.7 Agtron (42.5 to 47.2). Two more dev-mode findings:

5. **A clean cup with no listed flavour cannot be recorded.** The chips are required and there is no neutral one, so a flavour that is not
   on the list has to be entered as a chip it was not described with. Candidates: allow no chip on a clean cup (quality 3 or more), and a
   free-text flavour that the rules do not read.
6. **A bean held at a clean quality 3 is the wall case for curve edits** (Next, 3): the level is exhausted for defects, and the roaster
   wants more. The clean zone is bracketed by the clean roast (thermal dose 11.72) and the scorched one (13.15); production holds, and
   probing between them is considered-and-not-built.

**Wanted: personal defaults** (roaster, 2026-10-24). Answers a roaster gives the same way every time (not decaf, arabica, their
tasting brew, drink soon) stored once and applied at intake without asking, with the response listing each default it used.
Not designed; fits beside `calibration` (stored in the roaster's own database).

## Working today

- **How each roast ran against its profile** (in the bean's table, `src/adapters/kaffelogic/runStats.ts`, `roastRuns`): per roast, the
  overshoot (the mean of the bean temperature minus the profile's, from first crack to the end) and the offset of the measured
  thermal dose from the one the profile's curve predicts, with the range of the roaster's roasts on that profile over all their
  beans, and a description of every column (`legend`, quoted in docs/RULES.md). Measured, and no rule uses it. The first data
  (nine real roasts) is in [research.md](research.md), validation 3. Those nine all ran above their curve; the finished roasts in
  the roaster's whole folder (checked 2026-10-29, several firmware versions) ran from about 22% below to 36% above, below on
  several profiles, so "real roasts run above their curve" holds for the first nine and not as a rule. The advice uses changes in
  thermal dose, not the offset, but the same-proportion assumption (`levelAfterChange`) has only been checked on the nine.
- **Thermal dose write-up and sensitivity check** (draft): `docs/thermal-dose-writeup.md` reports a first check of the
  thermal dose on 75 real roasts; `npm run research:sensitivity` (`scripts/sensitivity.ts`) reproduces its numbers from the
  roaster's own logs. Reviewed by no one but the maintainer.
- **Reading the folder Kaffelogic Studio syncs**: `KAFFELOGIC_DIR` and `KAFFELOGIC_OUT_DIR` already named any folder; pointing them
  at the synced one (README, "Using the folder Kaffelogic Studio syncs") reads logs where Studio put them and writes a profile into
  `roast-profiles/`, from where Studio sends it to the machine. Files with no profile in them (empty logs, fragments) are skipped,
  and the real-file tests read `KAFFELOGIC_DIR` too (profiles the tool drew a curve for are left out), each stating which files
  it applies to: finished roasts, with the keys that differ between firmware versions excused. Shown (2026-10-29): a profile written
  straight into `roast-profiles/` in a Claude session was registered by Studio (its `.sync_base` lists the file) and roasted on the
  machine, whose logs record the profile's file name and short name. A curve `profile:edit` redrew is a separate open question (Next, 3).
- **Cross-bean report** (`clean-zone`): every bean side by side: its altitude, process, moisture, density and crop date, its
  first clean roast with the level, the predicted and measured thermal dose and the offset, and the bracket. Read-only; no advice
  uses it. The predicted thermal dose comes from the profile each roast's log carries (`predictedThermalDoses`).
- **Reading Kaffelogic files**: `.kpro` profiles and `.klog` logs, mapped onto a machine-independent
  `RoastLog`. A log carries its own profile, so any log rebuilds the profile it was roasted on.
- **Roast features**: phases, development ratio (matches the machine's own figure), rate of rise,
  drop temperature, data-sanity warnings for button presses outside their usual range, and thermal dose.
- **Starting profile for a new bean** from the intake form, from a stock-profile table kept in
  Postgres (names and derived numbers only, never Kaffelogic's files).
- **Roast projects in Postgres**: bean -> profile version (a tree, with a one-line change reason)
  -> roast (log, features, weight loss) -> tasting. The log decides which version a roast belongs
  to. `bean:update` and `taste:update` correct answers after the fact.
- **Writing profile files**: the bean's own `.kpro` is written to `KAFFELOGIC_OUT_DIR` at intake, and
  `profile:write` writes a version's file. A written file is accepted by Kaffelogic Studio and the
  Nano; a curve that `profile:edit` retimed or redrew, with the extra points that makes, is not yet shown to load (Next, 3). Fan and zone edits are not built (see below), and the curve edits built (`profile:edit`: when the curve reaches temperatures, the whole curve drawn through points, and the slope of the last segment)
  are a preview a roaster accepts, so a written file differs from its base in name (by the naming convention, Next 5),
  description and the level it offers first, and, for a version whose curve `profile:edit` changed, in that curve and in its designer
  line (`roasting-coach`, stamped in the stored file and inherited by later versions, since the base profile's designer did not make it).
- **Sizing a level change in thermal dose** (`thermal-dose`, `levelForThermalDose`), so "about 15% less
  roasting" becomes the right level for the profile at hand.
- **Restating the roast colour** (`level-for`, `placeColour`): when the roaster's target colour changes, the level to try
  for an Agtron number on a stock profile, from their own readings where they give a line. It records nothing; the roaster
  says yes and `version:add` records it with their words. The rulebook's step table gives ranges of levels a step moves
  across the levels a bean can start at, not one row at a recommended level, because neither the colour aimed at nor the
  level the cups lead to is fixed.
- **The rulebook for audit** (`docs/RULES.md`): every rule, setting, taste word and message in
  roasting terms, with worked examples and a step table measured from the stock profiles. A test
  fails if it and the code disagree, so a roaster can audit what runs.
- **First rules** (`src/core/rules.ts`, `advise <beanId>`): the clear cases of a tasting, as an
  ordered rule table with its settings in one place (`RULE_SETTINGS`, first guesses to tune) and
  a test per rule. Grassy or bready chips mean more roasting; bitter, roasty or ashy mean
  less: a 10% step in thermal dose, 15% when two chips agree, halfway to the nearest opposite
  result when the bean already has one (so it stops bouncing), then turned into a level for the
  roast's profile. It asks instead of guessing when the evidence disagrees (grassy and bitter
  together, a roast quality that contradicts the words, an earlier roast that contradicts this
  one), holds a clean cup (a quality of 3 or more) as done, holds an uncooked cup tasted before its profile's rest is over (the Rest profiles assume
  3 to 5 days; RTD, ready to drink, ones none), switches to the bean's alternative profile when more
  roasting left the cup on the same side (the level isn't what's wrong; not one the bean has been roasted on), asks for a retaste in the coffee's tasting brew when a roast was tasted another way, and says which of the three level changes a
  recommendation is. The engine returns the finished answer: `say`,
  the whole reply in plain words, and `onYes`, the exact command for a yes (`version:add`, or `bean:update` to restate the colour shot for). The
  `/roast` skill only relays `say` and runs `onYes`; it interprets nothing.
- **Per-roaster settings and taste words** (`src/core/calibration.ts`): the `RULE_SETTINGS`
  and the meaning of each taste word (under, over, good, none) can be overridden in the roaster's
  own database, checked before storing (ranges in `docs/RULES.md` section 4, tested). `advise`
  lists the roaster's departures from the defaults under `personal`.
- **Dev station** (`npm run station`, `station:check`, `station:beans`, `station:reset`; `scripts/station.ts`): a
  throwaway database and scratch folders; `npm run station` empties it and starts Claude Code on it with a new user's
  data (read by a person against a printed list; the session still loads the person's own settings and notes), and
  `station:new-bean`, `station:follow-up` and `station:three-changes` start it on a scenario (earlier roasts already
  recorded, a script to say, a list to watch for), and
  `station:check` replays a scripted session and each scenario through the real CLI with each answer checked. It never touches the
  roaster's database and writes nothing to their folders; it only reads the library (`KAFFELOGIC_DIR`). Not built: running the fresh session
  headless and checking its transcript.
- **Session interface**: `scripts/roast.ts` (JSON in, JSON out, inputs checked against the form
  definitions) driven by the `/roast` skill. No UI by design.

## Next

Order is a suggestion; the roaster picks.

1. **Rule core, next rules** (the part that matters most; the first rules are in "Working today").
   Advice must keep coming from tested rules, never a model's judgement.
   - Tune `RULE_SETTINGS` (step sizes, the noise band, how big a move counts as "the level didn't help") against real roasts and tastings: they are
     first guesses, and there is no research number for them. A roaster can already set their own
     (see "Design direction"); this is about the shipped defaults. Open question: a percentage of
     thermal dose is the same heat on any profile, but how far the cup moves per percent may differ
     by bean. Each roast records its thermal dose and tasting, so after a few beans we can see
     whether one step size holds or the step should adapt per bean.
   - "The level isn't helping" is judged from one failed step (a 10% move that left the cup on the
     same side). That is thin evidence for a timid first step; raise the bar (two failed steps) if
     real tastings show it switching profiles too early. It applies to bitter cups too, by symmetry.
   - Chips the table doesn't act on: astringent, flat, thin (ambiguous: under-development,
     over-extraction, or the curve's shape). They count as clean cups. Flat and thin wait for
     curve edits and for evidence from real tastings of what moves them.
   - Weight loss, development against the profile's own targets and the log's data warnings are
     not rule inputs yet; add them when there are enough real roasts to know what a good range
     is per profile.
   - The rules read the bean's newest tasted roast; they check the rest days only to hold a too-early
     sour cup, not to weigh the same thermal dose tasted at different days of rest.
2. **End-to-end session** with a real bean and log in `profiles/`: intake -> roast -> tasting ->
   next version. Note anything awkward in the forms or the skill. Cheap, and it shows which rules
   matter first; it can run before or alongside the rule core.
2b. **Clean-zone report** (built 2026-10-11: `clean-zone`, `src/core/cleanZoneReport.ts`): a read-only command that lists, per bean, the
   predicted thermal dose of its first clean roast (roast quality 3 or more and no under or over word, the definition under "Decided (2026-10-10)"; a stored tasting where the two disagree is not clean), the bracket around it, the bean's properties and the
   first clean roast's offset from its curve's prediction (an offset for every roast is not built). It records nothing and changes no advice; it is the data the bean-properties item
   (under item 3) waits for, and what the clean zone as a number of the roaster's own steps would need.
3. **Curve edits and new profiles** (planned 2026-10-11, built in part; see the proposed sequencing below). Change the curve of a base profile (the one a log
   was roasted on, matched by name and `profile_modified`, or a stock profile chosen at intake), write it with `writeKpro`
   to `profiles/out/` (never overwrite) and store it as the version's `profile_file`, with the base as its parent.
   *Storage already exists:* `version:add` takes a `profileFile` and reads its levels, `profile_version.profile_file` and
   `parent_id` hold the file and the tree, and a changed body is a different profile to `sameProfileBody`.
   - **Sequencing (proposed 2026-10-11, awaiting the roaster's decision): not yet.** A roast on an edited profile has never
     been made, nothing offline shows what a shape edit does to a cup, each edit costs a real roast, and the engine's own job
     (a defect-free roast in three level changes) has had one real bean. The case for building is a wall the level and the stock
     profiles cannot get past: beans that end at the three-change limit with no profile to try, or hold at a quality of 3 when
     the roaster wants more. Proposed order: item 2 (end-to-end sessions) and item 2b (built) first; step 1 below (read-only analysis of
     the real logs, no code shipped) any time; steps 2 to 4 once real sessions show the wall (for example, two of the first five
     beans end at the limit or at a flat quality of 3 and the roaster wants more).
   - **Decided:** "about the same thermal dose" is within **3%**, and it is enforced: the error of the matched level is
     computed (`levelForThermalDose` returns the nearest level whatever the error), and an edit whose best level is more than
     3% off is reduced or refused, never written or described as holding the thermal dose. The worst miss between two adjacent
     levels is half the gap between them, so it can pass 3% only where adjacent 0.1 levels are more than 6% apart. Measured on
     the stock files (2026-10-11), the largest such gap on each profile a bean can start on is 6.4% to 16.0%, and it sits at
     the lightest levels (1.0 or lighter) or the darkest (5.1 or darker); between them the grid is finer than 3% (Robusta, 2.6
     to 3.0, adds about 15% over four steps). A target the new curve cannot reach at any level is refused the same way. The direction of a shape edit is the roaster's choice; the tool ranks
     nothing and records each edit as an experiment (the edit, the defect before, the defect after), which is the evidence a
     direction rule would need later. A written file never leaves the roaster's machine (sharing is undecided, see below).
   - **The mechanism:** edit the curve, then find the level on the new curve whose *predicted* thermal dose (the curve's own
     figure, `profileThermalDoseAtLevel`) matches the predicted thermal dose of the roast being held. A thermal dose
     measured on a roast is never passed to that search: real roasts ran 5.3 to 18.5% above their curve's prediction (Robusta +5.3% to +7%;
     1500-2000m RTD +11% and +12.5%; 2000-2700m RTD +9.1% to +18.5%), and the offset was larger where the bean ran further above the profile in development and differs by profile, so a measured figure would pick a
     level with too much predicted heat. The answer is a plain-words account in measured terms: thermal dose held, end temperature
     against the old one, minutes in each phase, development ratio, rate of rise at first crack. It cannot say the roast will be
     clean; the cup decides.
   - **Three ways in, one engine.** (1) *Engine-offered, no clean roast yet:* after three level changes with a defect the
     engine says "try a different profile"; when it has no other profile to name (or it was tried), it offers a shape edit.
     The case for it is strongest when one cup shows both defects (`mixed-signals`): the same total heat gives both, so
     the level is not the lever. (2) *Engine-offered, clean but flat (quality 3):* `keep-as-is` says a better cup needs
     another profile or an edited curve; the roaster can take the edit at the predicted thermal dose of the clean roast's profile and level, which is
     the lever for a quality of 4 or better. (3) *Roaster-asked:* "the same roast on a different profile", through a preview
     command (like `level-for`, it records nothing until they say yes).
   - **Known thermal doses.** Each roast stores its measured thermal dose, its version stores the profile and level, and each
     tasting its words. So the tool knows a clean roast, the bracket around it (the uncooked roast of highest thermal dose and
     the scorched one of lowest), and the *predicted* thermal dose of each, which is what a match uses. The 3% is a
     claim about the curve's predictions, on the same profile as on another: roasts on one profile differ by up to 9.4 points
     (2000-2700m RTD: +9.1%, +9.3% and +18.5%), the offset was larger where the overshoot in development was, whether it belongs to the profile
     or to the bean is open, and an edit changes the profile's shape. A switch to another profile after cup evidence should place the level by
     predicted thermal dose, not by the colour target as the first level is, and there the offsets can differ by several points
     (5.3 to 18.5% above), more than the tolerance. The answer states the match as predicted until the roaster has measured
     offsets to correct with (by their ratio); the protocol below is what checks the measured thermal dose.
   - **First edit family:** development time at about the same thermal dose: reshape the stretch after first crack (against
     the drying and Maillard stretches), then re-level to hold the thermal dose. The research says the early phase adds almost no
     thermal dose, so holding the thermal dose while moving it between phases mostly changes the hot end.
   - **Step 1 done for the Classic curve (2026-10-25, [research.md](research.md), "What the curve nodes do"):** seven Bezier nodes, a
     straight 5.9 °C/min climb after 300 s, the level only picks where it stops, the machine follows within a few °C. A held thermal dose
     family (slope after first crack against end temperature) is computed; the open question for a real roast is whether colour
     follows the end temperature or the thermal dose. Fan, zones and `roast_end_by_time_ratio` are unread.
   - **Step 2 built in part (2026-10-25, `editCurve.ts`, `test/editCurve.test.ts`) and a preview command (`profile:edit`):** one edit, the
     slope of the last segment of the curve, found so the curve's predicted thermal dose at another level's end temperature equals a
     version's (bisection on the slope, 2 to 12 °C/min, the end time found to within the search; refused when no slope gives it, when the curve has fewer than three nodes, or when its last segment is not one straight climb). It records
     nothing; `onYes` is the `version:add` with the edited `profileFile`. The edit matches the target to within the search, and the tests
     check the written file to 1%, inside the decided 3%.
   - **Whole-curve retime built (2026-10-27, `retimeCurve.ts`, `test/retimeCurve.test.ts`; `profile:edit` takes `reach`):** "the curve reaches 150 °C at 190 s",
     for any temperature from 100 °C to the curve's last point, several at once. Each checkpoint splits the curve where it crosses that temperature (the shape
     does not change), the stretch before it is stretched in time to fit, everything after the last checkpoint moves as it was (so the roast ends that much later or
     earlier), and the corner at a checkpoint is smoothed. Temperatures never change, only when they are reached. Refused when a checkpoint is in the machine's heat-up
     (under 100 °C), past the curve's last point, out of order, or would make the curve fall or climb faster than any stock profile does once past 100 °C (116 °C/min);
     the edit is made, and the preview says so, where the rate of rise picks up again (every stock profile falls steadily). Alone, `reach` keeps the version's level and says
     how far the predicted thermal dose moved ("about the same" only within 3%); with a `level` too it then reshapes the last climb to hold the version's thermal dose.
     The thermal dose is nearly blind to the drying stretch (about 6% of a curve's total comes before 190 °C), so a retime there says the thermal dose cannot tell the cup apart: only a roast can.
     Not yet shown on a machine: that Studio and the Nano accept a curve with the extra points a checkpoint adds, and that the machine follows the retimed curve. Load the first one in Studio
     and compare it with its base before roasting.
   - **Whole curve drawn through points built (2026-10-27, `throughCurve.ts`; `profile:edit` takes `through`: `[[0, 20], [60, 110], [120, 158.5], [180, 178], ...]`, seconds and °C):** a smooth
     monotone cubic through at least four points (no overshoot between points; the last two set the rate the machine follows past the end). It replaces the shape, so it is for a
     curve the roaster has sketched or has numbers for; a stock curve sampled every 20 s and redrawn is within 3 °C of itself after 100 °C. A level only says where the roast stops.
     The climb past 200 °C is a warning, not a refusal (stock profiles reach 12.9 °C/min there at most, which is what they ask of the machine, not what it can do); the climb past 100 °C is
     refused above 116 °C/min. A sketch with a stalled stretch of rate of rise and a late spike (6 then 21 °C/min) draws, with both warnings, and has about half the predicted
     thermal dose of the same end temperature on a stock curve: so the end temperature alone may not carry the colour, and the heat may (a hypothesis until a roast on an edited curve tests it). Not built: fan and zone edits, a level search for a
     chosen end rather than a chosen level, a station scenario, the engine offering an edit, a RULES.md section.
   - **Steps, each its own PR.** (1) Read first, no code shipped: compare the real logs' achieved curve with the requested one,
     what the nodes do, how the machine follows a curve, and each roast's offset from its curve's prediction (findings in [research.md](research.md), "Heat transfer"; the
     Studio check below). (2) Pure edit functions (`editCurve.ts`): phase boundaries, one reshape, the re-level that holds the thermal dose, and the
     level that matches the thermal dose for a profile switch. (3) The session surface: a `profile:edit` preview, the version recorded on yes,
     `profile:write`, the engine statements at the entries above, the skill text, a RULES.md section, a station scenario per
     entry. (4) Real roasts of the base and the edited profile (the protocol below), then the rules. (5) Later, blocked on 4: fan
     and zone edits and learning from the roaster's own logs.
   - **How it is tested without edited roasts.** Real logs in `profiles/logs`: five, four on Robusta (levels 3.0, 2.7, 2.4,
     2.1) and one on 1500-2000m RTD (3.3), all on unedited stock profiles; no roast on an edited profile exists. Layers:
     (a) pure tests on made-up curves whose thermal dose is known by hand, and properties: the thermal dose after the edit and the
     re-level is within 3% of the original over a range of edits, the curve stays rising, the file round-trips through
     `parseKpro`, the levels are unchanged, an edit is a different body and a rename is the same. (b) The same properties over
     every stock profile in the library (`KAFFELOGIC_DIR`), skipped when the files are absent, as today. (c) Station scenarios on made-up logs of
     an edited profile (`stationLog` taught to embed an edited file), so edit, `version:add` with a `profileFile`,
     `roast:add` matched by body, the three-level count restarting and the engine's statements run end to end, one scenario per
     way in. (d) The made-up log follows the requested curve with a tracking error taken from the real logs (mean 2.1 °C, max 5.8
     °C on log0040) and a thermal dose 5 to 18.5% above the curve's; it is labelled made-up and shows the pipeline copes, nothing
     about the Nano. (e) Each new test is shown to fail when its logic is broken. What no offline test can show, and a roaster
     must: whether Studio and the Nano accept an edited file, whether the machine follows the edited curve, and whether the cup
     improves. The protocol, written before the roasts: roast the base twice (the spread between the two is the machine's own
     repeat variation) and the edited profile at the level that matches its predicted thermal dose; pass if the file loads, the
     roast ends at that level's temperature, tracking is no worse than the stock roasts', the edited roast's measured thermal dose
     is within 3% of the base's plus the spread between the two base roasts (a direct comparison: two profiles whose offsets
     are 6% and 12.5% above their predictions would both look right against that band while their measured thermal doses
     differ by about 6%), the offset of each roast is recorded, and the tasting is recorded. Real results enter the code as
     derived numbers only, never the files.
   - **The organizing idea (roaster, 2026-10-11).** The thermal dose says how much heat a roast needs; the bean's properties
     (moisture, density) and the roaster's philosophy decide the shape that delivers it. So one thermal dose maps to different
     profiles, and a profile is a thermal dose plus a shape. A hypothesis, not a finding: the research supports moisture
     changing the timing and the drying phase far more than the total ([research.md](research.md), "Heat transfer"), and says
     nothing yet about how much for a Nano.
   - **Bean properties: moisture, density and altitude (altitude only picks the profile band today; more research or data is
     needed before any is used to adjust a level).** Today altitude
     picks the profile's band (a stand-in for density) and `chaffy` adds a note for Robusta; moisture, density and crop date are
     stored from optional intake answers and no rule reads them (the form's help text said otherwise until 2026-10-11).
     Thermal dose is computed from the bean-temperature curve alone, so none of them is in it; if they matter, the correction goes in
     the target the level search aims at, as a separate adjustment (a sketch with a worked example on real ladder numbers is in
     [research.md](research.md), "Using bean properties in the thermal dose target"). They are candidates for three things, each
     a hypothesis: where the clean zone sits (the thermal dose a coffee needs to be clean), the offset of a roast's measured
     thermal dose from its curve's prediction (which a cross-profile match needs), and the timing of the drying phase. Fitted
     values would belong to one roaster on one machine. Why it is not built: one bean is recorded so far (moisture, no density or
     altitude); seeing a strong link (correlation 0.7) takes about 14 beans with a first clean roast (quality 3 or more and no under or over word) and a weak one (0.3) about 85
     (a sample-size calculation, not a measurement); the published support is two coffees (Debona 2021) and an industry claim
     with no peer-reviewed measurement; and moisture and density need meters (altitude is on the bag). The plan: ask for altitude
     at every intake (and moisture and density when the roaster has meters), and show each bean's first clean roast and its
     offset beside its properties (the report, item 2b, built; it derives them on each run and records nothing; an offset for
     every roast is not built), so the table builds as the roaster roasts. No rule until it shows a link.
     Density is whatever the roaster's own instrument reads, the same instrument for every bean (2026-10-31): the range is
     550 to 1300 g/L, not the 550 to 850 of a bulk density weighed from a known volume, because some instruments read above 850.
     A roaster who changes instrument can't compare beans read on the old one.
   - **Roasting philosophies, not yet considered.** Roast masters differ on shape: how fast to dry, how steeply to approach and
     pass first crack, how long development lasts. Kaffelogic's stock profiles already state targets for some of these
     (`developmentTarget` and `riseAfterCrack` in the table). A philosophy would be a named set of targets on the measured axes
     an edit moves (phase times, development ratio, rate of rise at first crack), shipped as data with the roaster's own
     overrides like the step sizes: the edit moves toward it at the held thermal dose and reports the result in measured terms.
     It waits on three things: the axes must be measured first (steps 1 and 2); a named preset needs a cited source for each
     number, and no roaster's published practice has been read for this repository, so nothing is claimed about any of them;
     and it is a method choice, like the step sizes, not a choice of taste, which the project keeps out. To decide with the
     roaster: which practices to read first, and whether presets are wanted before their own roasts show what an edit does.
   - **Not done, on purpose:** a rule that picks the direction from a defect (no evidence yet); sharing edited profiles;
     asking what the roaster likes.
   - **Later, to decide:** the clean zone as a number of the roaster's own steps (the bracket's width in % of thermal dose over
     their step size), and exploring inside it by the quality they record. It reopens "a clean cup is done" and the
     considered-and-not-built "probe within the clean zone" (see "Levers and ideas considered"), so it needs the roaster's say.
   Read first: the "Heat transfer" section of [research.md](research.md) (how moisture and density shape the
   bean temperature, what is unread, and the hypotheses to test with the roaster's own logs).
4. **Profile files in Postgres as the source of truth**: an uploaded-profile table keyed by name
   and `profile_modified`, text kept verbatim, import from `profiles/`, export `.kpro` on demand.
   Fits both personal use and a later sharing feature.
5. **Naming convention for written profiles** (decided and built 2026-10-11; `src/adapters/kaffelogic/profileNames.ts`; explained for
   roasters in the README, "The names of the files it writes"). Two names,
   each with its job, and nothing asks the roaster for a name. The **short name** (what the machine and Kaffelogic Studio show) is at
   most 15 characters: Studio cuts a longer one at 15, measured 2026-10-11 (`KLN7-YGRG-WSH-001-3r1`, 21 characters, showed as
   `KLN7-YGRG-WSH-0`), which matches every stock short name (all 15 or fewer). It is `{origin}-{bean number}-{version}r{revision}`,
   e.g. `YIRG-003-1r1`. The **file name** (free length; Studio loaded a 26-character one) is the whole convention,
   `{manufacturer and model}-{origin}-{processing}-{bean number}-{version}r{revision}.kpro`, e.g. `KLN7-YIRG-WSH-003-1r1.kpro`; the
   log records it beside the short name (`profile_file_name`). The origin is the first four letters of the last part of the intake's
   origin text that has at least three letters, uppercase, accents off ("Ethiopia, Yirgacheffe" is YIRG: country first, region last;
   "Ethiopia, 1900m" is ETHI), else the first four letters of the bean's name (BEAN when that has no Latin letter either). Processing: WSH, NAT, HON, ANA, WHL (wet-hulled), UNK. The bean number is the bean's id (to 999), the version is the bean's
   version number (to 99), and the revision (to 99) is which curve the bean's profile has: it bumps only when the curve changes, a
   level-only version keeps it, a return to an earlier curve takes its number back, and switching to another stock profile is a
   different curve. A stored profile counts as a stock curve only when it matches the library's copy of that stock profile body to
   body (a version keeps its stock base through edits, so the base alone cannot say), so an edited curve and the stock one differ. `bean:add` stores the bean first so the file can carry its number; `profile:write` takes no name. Profiles already
   written were renamed to match (one: Kron Nang's v1, now `VIET-002-1r1`). Not built: the clean-zone report and the roadmap do not
   use the names; revisions only differ once an edited curve is stored or a bean switches stock profile.

## Waiting on others

- **Kaffelogic permission** (asked 2026-10-06, no reply yet). Their terms require express written
  permission to reproduce any part of the service. Asked whether users may share their own
  modified profiles through the tool (modified only, credited, per-roast keys stripped, never
  stock profiles), on what conditions, and whether a few stock profiles may be test fixtures.
  **Nothing to build until they answer; a no or conditions decides whether sharing is built at
  all.** Keep further mail to them free of anything confidential.
- **Curve data from two studies** (asked 2026-10-06): Guo and Cao (Food Chem 517:149463) and
  Debona, Pereira and de Castro (Food Chem 478:143586). If their roast temperature curves
  arrive, express their aroma peaks on the thermal-dose scale (open questions in
  [research.md](research.md)). Check the mail for replies, and ask the roaster before acting.

## Later, not decided

- **Community sharing** of profiles with their evidence (bean, version history, weight loss,
  tasting qualities). It would reverse "personal use only, no web UI" (accounts, shared database, a
  front end), so it needs the roaster's go-ahead and Kaffelogic's permission first. Don't build
  toward it; just keep choices compatible: whole profile files per version with parent links,
  per-roast keys stripped from anything that leaves a user's database, stock profiles never
  shareable unmodified.
- **Kaleido M1** through its own adapter.
- **Per-profile curve-to-roast thermal dose offset** (measured thermal doses run 5.3-18.5% above the curve's
  prediction, mostly more where the bean runs further above the profile in development: nine roasts, one exception). Worth modelling once there are more logs; see the open questions in
  [research.md](research.md).

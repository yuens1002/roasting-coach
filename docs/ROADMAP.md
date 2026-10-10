# Roadmap

The one place that records where the project stands: what works, what is next, what is waiting on
someone else. Update it in the same change that moves any of these. Design rationale lives in
[research.md](research.md) and [thread1-notes.md](thread1-notes.md); the release history is in
[CHANGELOG.md](../CHANGELOG.md).

Last updated 2026-10-10 (0.2.x alpha).

## The goal

The tool has one goal: show the roaster how to reach the potential of a given coffee, and teach them
to do it. It coaches the roast, not the taste.

Two things are kept apart (decided 2026-10-08):

- **The best roast of a coffee** is what this tool is for. It is judged by **roast quality**, a 1 to 5
  scale anchored to roast defects (a defect dominates the cup is 1; clean with little character is 3;
  clean and expressive is 4; see `docs/RULES.md` section 3), and measured in thermal dose.
- **How much the roaster likes the cup** is not a goal. It is not asked and not used. A flat cup with no
  roast defect is a 3 however little the roaster likes it.

Concretely: get a bean's roast right in **no more than three roasts**, by telling the roaster which lever to
push each time. "Right" is a roast quality of **4 or better**. The levers are the level, the profile, and
what sits outside the roast (the brew, the days of rest). Still open: whether the count starts at the
bean's first roast or at its first tasted one, and how to count a roast that is only a step along a
deliberate ladder.

Where it stands: the rules name the level, or a switch to the bean's other profile, for cups with a roast
defect. They hold (a cup tasted too soon, a clean cup of good roast quality that tasted good), ask (mixed or
contradictory evidence, or a quality that disagrees with the words), and, for a clean cup below the bar,
list every lever that can raise the quality with what it changes and what the roasts say about it. The
first real ladder (a bean roasted at four levels, 3.0 down to 2.1) went from ashy to flat and monotone, not
baked and not under-developed: a clean cup of little character, which is a 3. Getting it to a 4 is a
question for the levers beyond the level, and for the coffee itself.

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
(0.2.0), listed under "Breaking" in `CHANGELOG.md`. Migration 008 is the first. Older tolerance still in the code and
to convert the same way: the unrated tastings (`quality_rated`, migration 005) with their skip logic in the rules, the
CLI and the skill.

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
reading now), those three points are taken as Agtron 65, 55 and 45 (`LABELLED_LEVEL_AGTRON`; the basis is the Robusta file
calling them Light/Medium, Medium and Medium Dark, assumed alike on the other profiles, not measured) and the level is found
between and beyond them; the answer says it is an approximation. With the readings, the level comes from the least-squares line
through them for that profile (`loadColourReadings`), across all the roaster's beans. A profile whose labelled levels reach
no darker than Agtron 55 (KL Washed, KL Natural) hands a darker target to the altitude profile; a colour beyond the
profile's lightest or darkest level gets that level and the answer says so. After the first roast the defects in the cup
decide every step. The roaster can restate the colour at any time (`bean:update`); it is their aim, not a measurement. Open: the
advice does not use the colour readings yet (a roast read lighter or darker than its target says nothing to the rules);
the readings are fitted per profile, not per bean or per density. Earlier "Brewing for" answers are dropped (column `goal`, removed by migration 008). What changes for the roaster: a washed or natural bean now starts on KL Washed or KL Natural
(at 0.8 and 1.4 then, that profile's own recommendation) whatever it was brewed for. Open: no model turns bean
properties (density, moisture, age) into a starting level; only the profile choice uses altitude and process.
The "Cupping" stock profile is never picked now; it stays in the table.

**Idea (2026-10-09), not built: curve edits sized by thermal dose.** The thermal dose can be computed for
any curve, so a new profile can hold the total thermal dose fixed and change only the shape (moving it
between phases). That makes shape a clean experiment: the quality change belongs to the shape, not to a
different amount of heat. The roaster chooses to try it; the tool reports what a change does in measured
terms (thermal dose held, phase times, development ratio) and ranks nothing. To read first: what the curve nodes, fan and zones
control in real logs, and how closely the machine follows an edited curve (real roasts run 6 to 12.5% above
their curve's prediction).

Measurement (thermal dose, level to end temperature, rest days) and the basic reading of a cup (ashy and
bitter point to too much roasting, sour and grassy to too little) are shared. What a roaster may
personalise is how they **perceive and name** a cup (what their taste words mean: one roaster's "flat" is
monotone, not baked or under-developed) and the **size of the method** (step sizes, how many steps count as
a fair try), kept in their own database with defaults shipped in the repo. Not personal, and not built:
what the roaster likes. Each roaster runs their own copy; sharing profiles stays undecided (see "Waiting on
others").

Built (one lever at a time): the rule settings and the meaning of each taste word can be overridden per
roaster (`calibration`, `calibration:set`; stored in `roaster_setting` and `roaster_taste_word`; defaults
stay in `rules.ts`; the rules take them through `Calibration`). `holdMinQuality` is the roast quality that
counts as good. Still to do: learning a roaster's own step size from their tastings instead of asking for
it; profile facts (rest days, alternatives) that the roaster can correct.

**Changed on 2026-10-08:** the tasting's 1 to 5 score was an overall liking; it is now the roast quality
(column `quality`, migration 005), and "next time I want" is no longer asked or used (its column is kept
so earlier answers aren't lost). Rules removed: `wish-against-taste`, `asked-for-change`. Rules added:
`quality-vs-words` (the quality has to agree with the words) and `clean-below-bar`. Tastings recorded
before the change held liking scores, so migration 005 marks them unrated (`quality_rated`) and the
advice skips them until they are rated by the new anchors (`taste:update` with a `quality`).

**Decided: the reference cup is optional.** It says what the coffee can be. It can be unknown, when the
producer doesn't specify the coffee. When the supplier or producer gives a description, that description is
the reference; it is the bean's `sellerNotes`, so no new storage is needed. The tool must give useful advice
with no reference at all, and must never treat a missing one as a sign the bean is poor.

**Built: the lever ledger** (`src/core/levers.ts`, rule `clean-below-bar`). For a clean cup below the bar
it lists the levers (level, profile, curve), each moving, exhausted, unclear, untested or
unavailable, every state read from recorded roasts and tastings, with what each lever changes
(`docs/RULES.md` rule 7). The level is exhausted when the last `plateauSteps` (2) real steps the same way on
one profile did not raise the quality. The answer says "what is left is the curve, or the coffee itself" only
when the level and the profile are both exhausted or unavailable (the profile is exhausted after
`profileTestRoasts` (2) tasted roasts on the alternative that did not beat the other profile); until then
it says which levers are still to try. A reference cup, when there is one, is quoted so the coffee
isn't written off. The worked example in `docs/RULES.md` rule 7 is a ladder that starts ashy and then goes
flat and clean: qualities 2, 3, 3, 3. The level took the defect out and then stopped adding anything.

### Levers and ideas considered

What each change does, and where it stands. The reason is there when it was set aside.

| Considered | What it would change | Status |
|---|---|---|
| Level (thermal dose step) | Where the roast stops: more or less of the chemistry, by a measured amount | Built (rules 5, 6; a lever in 7) |
| Rest (days before tasting) | How the roast has settled, not the roast | **Dropped as a lever (2026-10-09):** the rest guard (rule 4) stays; the ledger no longer tests it |
| Brew method | How much of the roast reaches the cup, not the roast | **Dropped as a lever (2026-10-09):** every tasting of a coffee is of one brew, the roaster's own (rule 1) |
| Another stock profile | The curve's shape | Built (`level-not-helping`, ledger); only washed and natural beans (which start on KL Washed or KL Natural) have an alternative, so the profile lever is unavailable for the rest |
| Editing the curve, fan or zones | The curve's shape, tuned to the bean | Not built (see Next, 3); the ledger lists it as unavailable |
| Reference cup | What the coffee can be; stops it being written off | Built as the bean's `sellerNotes`, optional |
| Roaster's own words and numbers | Taste-word meanings, step sizes, the quality bar, plateau and test sizes | Built (`calibration`) |
| Roast quality, anchored to defects | A criterion that is about the roast, not the roaster's liking | Built (`quality`, rule 2 checks it against the words) |
| Liking and "next time I want" | What the roaster prefers | **Dropped:** not a goal of the tool. Data kept in `want_next`, unused |
| Size a step by how bad the cup was | Bigger first step for quality 1 than for 2 | Not built, on purpose: one bean is too little to set the sizes, and the ladder showed the level wasn't the lever. Revisit with a second bean; a personal setting when built |
| A rule for flat, monotone cups | Name what a flat cup means (baked, under-developed, bean) | Not built as a rule: `clean-below-bar` lists the levers; the word `flat` stays unmapped until a tasting shows what moves it |
| Probe for the edge of the clean zone | Find where sourness or ashiness starts, to centre the roast between them | Mentioned in the level lever; a step costs a roast. Not built as a rule |
| Learn a roaster's own step size | Shortest path to the right roast per person | Not built: needs several beans |
| Fix the count of "three roasts" | Where the count starts, how a deliberate ladder counts | Open question |

## Working today

- **Reading Kaffelogic files**: `.kpro` profiles and `.klog` logs, mapped onto a machine-independent
  `RoastLog`. A log carries its own profile, so any log rebuilds the profile it was roasted on.
- **Roast features**: phases, development ratio (matches the machine's own figure), rate of rise,
  drop temperature, data-sanity warnings for button presses outside their usual range, and thermal dose.
- **Starting profile for a new bean** from the intake form, from a stock-profile table kept in
  Postgres (names and derived numbers only, never Kaffelogic's files).
- **Roast projects in Postgres**: bean -> profile version (a tree, with a one-line change reason)
  -> roast (log, features, weight loss) -> tasting. The log decides which version a roast belongs
  to. `bean:update` and `taste:update` correct answers after the fact.
- **Writing profile files**: the bean's own `.kpro` is written to `profiles/out/` at intake, and
  `profile:write` writes a version's file. A written file is accepted by Kaffelogic Studio and the
  Nano. Curve, fan and zone edits are not built (see below), so a written file differs from its
  base only in name, description and the level it offers first.
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
  a test per rule. Sour, grassy or bready chips mean more roasting; bitter, roasty or ashy mean
  less: a 10% step in thermal dose, 15% when two chips agree, halfway to the nearest opposite
  result when the bean already has one (so it stops bouncing), then turned into a level for the
  roast's profile. It asks instead of guessing when the evidence disagrees (sour and bitter
  together, a roast quality that contradicts the words, an earlier roast that contradicts this
  one), holds a clean cup of good roast quality, lists what else can raise a clean cup below the
  bar, holds a sour cup tasted before its profile's rest is over (the Rest profiles assume
  3 to 5 days; RTD, ready to drink, ones none), switches to the bean's alternative profile when more
  roasting left the cup on the same side (the level isn't what's wrong; not one that already has a tasted roast), asks for a retaste in the coffee's tasting brew when a roast was tasted another way, and says
  "no rule" for anything else rather than improvising. The engine returns the finished answer: `say`,
  the whole reply in plain words, and `onYes`, the exact `version:add` command for a yes. The
  `/roast` skill only relays `say` and runs `onYes`; it interprets nothing.
- **Per-roaster settings and taste words** (`src/core/calibration.ts`): the `RULE_SETTINGS`
  and the meaning of each taste word (under, over, good, none) can be overridden in the roaster's
  own database, checked before storing (ranges in `docs/RULES.md` section 4, tested). `advise`
  lists the roaster's departures from the defaults under `personal`.
- **Dev station** (`npm run station`, `station:check`, `station:beans`, `station:reset`; `scripts/station.ts`): a
  throwaway database and scratch folders; `npm run station` empties it and starts Claude Code on it with a new user's
  data (read by a person against a printed list; the session still loads the person's own settings and notes), and
  `station:check` replays a scripted session through the real CLI with each answer checked. It never touches the
  roaster's database and writes nothing to their folders; it only reads `profiles/`. Not built: running the fresh session
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
3. **Curve edits**: change the curve, fan or zones of a base profile (the one a log was roasted
   on, matched by name and `profile_modified`, or a stock profile chosen at intake), write it with
   `writeKpro` to `profiles/out/` (never overwrite) and store it as the version's `profile_file`.
   Only when the rule core asks for more than a level change. Each edit needs its own
   plain-language account of what it does to the roast, in measured terms. First build, per the
   2026-10-09 idea above: one edit that holds the total thermal dose and moves thermal dose between phases.
   Read first: the "Heat transfer" section of [research.md](research.md) (how moisture and density shape the
   bean temperature, what is unread, and the hypotheses to test with the roaster's own logs).
4. **Profile files in Postgres as the source of truth**: an uploaded-profile table keyed by name
   and `profile_modified`, text kept verbatim, import from `profiles/`, export `.kpro` on demand.
   Fits both personal use and a later sharing feature.
5. **Naming convention for written profiles** (before any wider use). Today: `<bean name>.kpro`,
   short name = bean name. Two names exist: `profile_short_name` (shown on the Nano; stock names
   are all 15 characters or fewer, so probably a display limit, to confirm on the machine) and the
   file name (free length). Name by profile revision (r1, r2: bumps only when the file changes;
   level-only versions reuse it), not by version number; keep it unique (bean id or date in the
   file name) and credit the base. Starting idea: short `Guji2100 r2`, file
   `2026-10-05 Guji2100 r2 (KL Washed) b12.kpro`. With files generated from the database on
   export, the name is a function and easy to change.

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
- **Per-profile curve-to-roast thermal dose offset** (measured thermal doses run 6-12.5% above the curve's
  prediction). Worth modelling once there are more logs; see the open questions in
  [research.md](research.md).

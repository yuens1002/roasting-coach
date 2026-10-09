# Changelog

All notable changes to roasting-coach. Versions follow [semantic versioning](https://semver.org/);
0.x releases are alpha, and anything may still change.

## [Unreleased]

## [0.1.12] - 2026-10-09

- 2026-10-09 - feat(station): add a dev station that replays a scripted session and opens a fresh session on a throwaway database

### Added

- `npm run station` replays a scripted 18-step roasting session through the real `scripts/roast.ts` against a
  throwaway database (`roast_station`, on the same Docker server) and scratch folders in the system temp folder,
  and stops at the first answer that is not what the rulebook says. It covers the intake with no brewing question,
  a refused brewing goal, a refused espresso tasting, the under-roasted step and its `onYes`, the bracketed
  over-roasted step, keep-as-is, and the clean-below-bar ledger.
- `npm run station:session` resets the station and prints how to open a fresh Claude Code session against it,
  with a prompt and a list of what the `/roast` skill must do; `npm run station:reset` empties it.
- The station refuses any database but its own and never uses `profiles/`; its logs are made up
  (`scripts/stationKit.ts`), never Kaffelogic files. `test/station.test.ts` checks the guards and the logs.
- `scripts/migrate.ts`: the migration runner, shared by `npm run db:migrate` and the station.
- `CONTRIBUTING.md` and `docs/ROADMAP.md` describe the station. Not built: running the fresh session headless and
  checking its transcript.

## [0.1.11] - 2026-10-09

- 2026-10-09 - refactor(rules): take brew method out of the roast, with rest and brew no longer levers and every tasting of filter coffee

### Changed

- Rest and brew are no longer levers. They change the cup, not the roast, so the lever ledger now lists the
  level, the profile and the curve; the rest and brew tests and their two settings (`restTestDays`,
  `brewTestCount`) are gone, and so is the quoted line "espresso exaggerates sourness". Migration 006 removes
  a roaster's stored values for the two settings.
- The cupping protocol is filter coffee only (pour over, French press / immersion, AeroPress), the same for
  every roaster and every bean. Filter is a baseline chosen for access, not a roast target. The tasting form
  offers only those brews. New rule 1, `tasted-in-other-brew`, asks for a retaste as filter coffee when a
  roast's tastings were all of another brew (recorded before the form was limited); earlier roasts with no
  filter tasting are left out of the comparison and the answer says how many. The rules are renumbered: the
  rule list in `docs/RULES.md` now runs 1 to 9. A tasting recorded in a brew the form no longer offers
  (an espresso shot) can still be corrected or re-rated; naming that brew in an update is refused. The three
  filter brews are counted as one standard, so the rule says it keeps other kinds of brew out of the comparison,
  not that every cup was brewed the same way.
- Roasting is not aimed at a brew method. The intake no longer asks "Brewing for" (earlier answers stay in the
  database and are not used; migration 007 makes the column optional), and the starting profile no longer
  depends on it: species and decaf, then washed or natural (KL Washed or KL Natural), then the altitude band.
  A bean starts at the level its profile's own file recommends (`recommended` in `startingProfiles.ts`, read
  from each stock file's `recommended_level`; a test checks it against the files). Kaffelogic's filter,
  espresso, dark and cupping level labels stay as reference data and no choice reads them. The "Cupping"
  profile is no longer picked.
- The step table in `docs/RULES.md` is regenerated at the starting levels, one row per profile.
- `docs/research.md` has a new section on how moisture and density shape the bean temperature, with the
  sources read, what could not be read, and hypotheses to test when curve editing starts. No rule uses it.

### Removed

- The `espresso-sour-only` rule: it asserted a fact about espresso that nothing the tool records can check.
- The "Brewing for" intake question and the `goal` field on the intake.

## [0.1.10] - 2026-10-09

- 2026-10-09 - refactor(rules): extend the wording standard to the starting-profile reasons, the colour-change warning and the rulebook prose

### Changed

- The reasons shown at intake state facts about the stock profile instead of opinions of the coffee: "Robusta
  roasts differently from arabica" and "Decaf beans start darker and take heat differently" became "Robusta
  has its own stock profile, so this uses it" (and the same for decaf); "where most specialty arabica grows"
  and "go lighter next time if filter tastes flat" are gone.
- The colour-change warning says "so the press is not used" instead of "so it was probably pressed by mistake".
- `docs/RULES.md` prose: the Why and Check-this paragraphs, the `bready` note and the intro state what the
  rule does and what it assumes, without "likely", "may switch too early", "best starting point" or "our
  extension".
- `test/voice.test.ts` also checks every starting-profile reason (across eight intakes, and failing if the source gains a reason no intake reaches), both colour-change
  warnings, and every line of `docs/RULES.md` outside its worked examples.
- The test's patterns cannot catch a neutrally worded claim about the world (the quoted lever effects, e.g.
  "espresso exaggerates sourness"), and it does not read the README, the session skill or the research notes.

## [0.1.9] - 2026-10-08

- 2026-10-08 - refactor(rules): state evidence and rules in advice messages, not opinion or hedged belief

### Changed

- The engine's messages say what the recorded roasts and tastings show and what a rule does about it.
  Gone: first-person opinion ("I wouldn't blame the coffee yet"), hedged belief ("probably", "usually
  means", "may simply not be ready") and judgments of the coffee or the tool's aim ("don't write it off",
  "the best roast is between them", "below the 4 this tool aims for"). Offers and instructions stay.
- The worked examples in `docs/RULES.md` match the new wording.
- New `test/voice.test.ts` checks every worked example and nine more advice cases (each checked to reach its named rule
  and to word its reply differently from the examples) against a short list of stances, and checks that the list itself catches each kind.
- Still open (in `docs/ROADMAP.md`): the Why and Check-this prose in `docs/RULES.md`, the taste-word
  notes and the starting-profile `why` lines are not covered by the test.

## [0.1.8] - 2026-10-08

- 2026-10-08 - fix(tests): raise the hook timeout so parallel suites stop timing out and guard the profile thermal dose search

### Changed

- `vitest.config.ts` sets `hookTimeout` to 60 s. Four suites build an in-memory Postgres in `beforeAll`;
  with three full runs at once they failed with "Hook timed out in 10000ms". Twelve triple runs now pass.
- `test/thermalDose.test.ts` has three guards on `profileThermalDoseAtLevel` and `levelForThermalDose`
  (each answer names the level asked for, each call returns a new object, the search finds the level it
  was given the thermal dose of) and a real-Robusta failure that prints the file, whether the two results
  are the same object, and the answer recomputed at failure time. One earlier failure on the real Robusta
  profile has not been explained or reproduced.

## [0.1.7] - 2026-10-08

- 2026-10-08 - docs(readme): lead with roast quality as the goal and point to the docs for how and why

### Changed

- The README opens with the goal (the best roast a coffee can give, in at most three roasts, judged by
  roast quality and not by how much the roaster likes the cup) and explains roast quality and why liking
  is not asked.
- "The thesis" is now "How it works": it covers the lever list for a clean cup below the bar, and no
  longer claims weight loss as a yardstick (the rules don't use it yet).
- New "Where to read how and why" table pointing to the rulebook, the research, the roadmap, the design
  notes, the changelog and the session skill; an upgrade note for migration 005.

## [0.1.6] - 2026-10-08

- 2026-10-08 - feat(rules): coach the roast, not the taste, with roast quality, a lever ledger and per-roaster settings

### Added

- Roast quality replaces the tasting's overall score: a 1 to 5 scale anchored to roast defects (1: a
  defect dominates the cup; 3: clean with little character; 4: clean and expressive; 5: clean,
  expressive, balanced and sweet), not to how much the roaster likes the cup. The anchors
  (`QUALITY_ANCHORS`) feed the form, the engine's messages and `docs/RULES.md`.
- Rule `quality-vs-words`, tried first: a roast defect word with a quality of 3 or more, or a quality
  of 1 or 2 with no defect word, makes the engine ask which is right instead of advising.
- Rule `clean-below-bar`: a clean cup below `holdMinQuality` gets the lever ledger (`src/core/levers.ts`).
  Rest, brew, level, profile and curve are each moving, exhausted, unclear, untested or unavailable,
  read from recorded roasts and tastings, with what each lever changes. Rest is compared only between
  tastings of the same brew and brew only between tastings on the same day, a repeat of the same level
  counts once, and the level is judged by its last steps. What is left (the curve, or the coffee itself) is
  only named once rest, brew and the level are exhausted and the profile is exhausted (after
  `profileTestRoasts` tasted roasts on the other profile that did not beat it) or unavailable;
  until then the answer says which levers are still to try. A reference for the coffee (the bean's
  `sellerNotes`, optional) is quoted so the coffee isn't written off.
- Per-roaster settings and taste-word meanings: `calibration` shows every setting and word with its
  default, `calibration:set` changes them (checked before storing, `null` restores the default), and
  `advise` lists the roaster's departures from the defaults under `personal`. Stored in
  `roaster_setting` and `roaster_taste_word` (`db/004_roaster_calibration.sql`). New settings:
  `plateauSteps`, `restTestDays`, `brewTestCount`, `profileTestRoasts`. A change that would stop the level counting its own
  steps (`noResponsePct` above `stepPct`, or `noisePct` at or above `noResponsePct`) is refused.
- `docs/RULES.md` has the quality scale, the allowed range of every setting, the lever table and the
  new rules, each checked against the code by `test/rulesDoc.test.ts`.

### Changed

- The tasting's `score` column is now `quality` (`db/005_roast_quality.sql`). Scores recorded before
  this were an overall liking, so the migration marks every existing tasting unrated (`quality_rated`):
  `advise` skips it, says so (`unratedTastings`, or a plain message when nothing else is left), and a
  `taste:update` with a `quality` rates it.
- `holdMinScore` is now `holdMinQuality`. The `no-rule` answer asks what to test next.
- A profile key now follows `sameProfileBody`: two copies of one profile that rounding put on either
  side of an edge share a key, and a later copy that matches two separate groups joins them, so the
  level ladder doesn't drop a roast. Two profiles that round alike but differ by more than the
  tolerance keep different keys.
- The roadmap states the goal as the best roast of a coffee, judged by roast quality; liking is not a goal.

### Removed

- "Next time I want" is no longer asked or used, and the rules `wish-against-taste` and
  `asked-for-change` are gone. The `want_next` column is kept, unused, so earlier answers aren't lost.

## [0.1.5] - 2026-10-07

- 2026-10-07 - docs(roadmap): record the goal, a right roast in three roasts or fewer

### Added

- `docs/ROADMAP.md` has a "The goal" section: get a bean's roast right (a cup scored 4 or better)
  in no more than three roasts, with where the rules stand against it.

## [0.1.4] - 2026-10-07

- 2026-10-07 - fix(profile): treat tasting_notes as a per-roast key, not part of the profile

### Fixed

- A log's `tasting_notes` line (what the roaster typed about the roast, often the weight) was
  treated as part of the profile. It was copied into the stored profile of a version, would have
  been written into a `.kpro` by `profile:write`, and made two logs of the same profile look
  different. It is now in `LOG_ONLY_KEYS` with the other per-roast keys, and is also ignored in a
  profile stored before this fix.

## [0.1.3] - 2026-10-07

- 2026-10-07 - feat(rules): add the deterministic advice engine and its roaster-readable rulebook

### Added

- `src/core/rules.ts`: the rule engine. An ordered rule table turns the latest tasting (and the
  earlier roasts of the bean) into one answer: change the roasting by a stated percentage of thermal
  dose (10%, or 15% when two taste words agree), try the midpoint between two roasts that bracket
  the cup, hold, ask, or switch profile. Among its rules are a rest check (`tasted-too-soon`) and a
  level-versus-profile check (`level-not-helping`). The answer carries finished wording (`say`) and
  the exact command to run on a yes (`onYes`); it says so when the nearest level gives a different
  change than the step asked for. Supporting modules: `src/core/dates.ts` and
  `src/adapters/kaffelogic/adviceContext.ts` (rest days and the alternative profile).
- `advise <beanId>` command in `scripts/roast.ts`; the `/roast` skill now relays its `say` and runs
  its `onYes` instead of interpreting a list.
- `docs/RULES.md`: the rulebook in roasting terms, for a roaster to audit, with a step table
  generated from your stock profiles (`npm run rules:steps`, from `scripts/step-table.ts` and
  `src/adapters/kaffelogic/stepTable.ts`). `test/rulesDoc.test.ts` fails when the doc and the
  program disagree on rule names, settings, taste words, rest days, examples or the step table.
- `test/terminology.test.ts` keeps the bare word "dose" out (it means grams in an espresso basket).
- `vitest.config.ts`: 30 s test timeout, because the in-memory Postgres tests exceed 5 s under load.

### Changed

- The `level-not-helping` check compares roasts by what their stored profile roasts like (a
  fingerprint of its curve and settings, `profileKey` in `history`), not by the stock profile's name,
  so an edited copy of a stock profile is no longer taken for the stock one.
- "Dose" is now always "thermal dose". The `dose` command is renamed `thermal-dose`, and
  `src/adapters/kaffelogic/dose.ts` is now `thermalDose.ts`.
- Stock "Rest" profiles record their rest days (3 to 5), used by the rest check.
- `docs/ROADMAP.md` lists what the rules cover and what is still open.

## [0.1.2] - 2026-10-07

- 2026-10-07 - docs(roadmap): add ROADMAP.md as the single record of project state

### Added

- `docs/ROADMAP.md`: the single record of what works, what is next and what is waiting on others.
  The README's Status section now points to it.

### Changed

- `docs/thread1-notes.md` records two file-format facts: a `.klog` header embeds its full profile,
  and some logs have no `roast_date`.

## [0.1.1] - 2026-10-06

- 2026-10-06 - feat(store): add bean:update and taste:update commands
- 2026-10-06 - feat(profile): add profile:write; recommended level counts as a label

### Added

- `profile:write`: writes a version's own `.kpro` to `profiles/out/`, named for the bean and
  level, with the version's level as the level the machine offers first.
- `bean:update` and `taste:update`: correct or add to a bean's intake answers or a tasting after
  the fact. Changes are merged over the stored answers and checked as a whole form; `null` clears
  an optional answer.

### Changed

- The README now opens with the core problem (a profile-following roaster, and a profile graph that
  doesn't say what a change will do to the roast or the cup) and states the thesis around it.
- A profile's `recommended_level` now counts as a label, not a setting: it is only the level the
  machine offers first, so two profiles that differ only in it roast the same way.

## [0.1.0] - 2026-10-06

- 2026-10-06 - feat(roast): roast projects, profile files and thermal dose

First alpha.

### Added

- Kaffelogic adapter: reads `.kpro` profiles and `.klog` logs, maps logs onto a machine-independent
  roast model, and holds the stock-profile table used to pick a starting profile for a new bean.
- Roast features: phases, development ratio (matches the machine's own figure), rate of rise, drop
  temperature, and data-sanity warnings for mis-pressed buttons.
- Thermal dose: how far a roast's chemistry went, as equivalent minutes at 200 °C (Arrhenius,
  Ea = 105 kJ/mol), plus a profile's dose at any level and the level for a target dose, so changes
  are sized in chemistry rather than uneven level numbers. Sources and validation in
  `docs/research.md`; `npm run research` reproduces them.
- Roast projects in Postgres: bean (intake form) -> profile versions (profile plus the level to
  set, end temperature, reason) -> roasts (result form, stored log, features, weight loss) ->
  tastings. Form fields and table columns are kept in step by tests.
- Versions record what was actually roasted: the log decides whether a roast belongs to the
  planned version, turns an unroasted plan into what was roasted, or starts a new version.
  "Same profile" means same curve and settings, whatever the name.
- Session commands (`scripts/roast.ts`, JSON in and out) for recording intake, roasts and tastings
  from a Claude Code session, with every input checked and errors in plain words.
- Profile files: rebuild a `.kpro` from the profile embedded in any `.klog`, find base profiles by
  content, and write a bean's own profile at intake to `profiles/out/`.
- Open-source files: AGPL-3.0 licence, contributing guide, Code of Conduct, security policy.

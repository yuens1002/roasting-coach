# Changelog

All notable changes to roasting-coach. Versions follow [semantic versioning](https://semver.org/);
0.x releases are alpha, and anything may still change.

## [Unreleased]

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

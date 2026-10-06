# Changelog

All notable changes to roasting-coach. Versions follow [semantic versioning](https://semver.org/);
0.x releases are alpha, and anything may still change.

## [Unreleased]

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

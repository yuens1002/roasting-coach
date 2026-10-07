# Roadmap

The one place that records where the project stands: what works, what is next, what is waiting on
someone else. Update it in the same change that moves any of these. Design rationale lives in
[research.md](research.md) and [thread1-notes.md](thread1-notes.md); the release history is in
[CHANGELOG.md](../CHANGELOG.md).

Last updated 2026-10-07 (0.1.x alpha).

## Working today

- **Reading Kaffelogic files**: `.kpro` profiles and `.klog` logs, mapped onto a machine-independent
  `RoastLog`. A log carries its own profile, so any log rebuilds the profile it was roasted on.
- **Roast features**: phases, development ratio (matches the machine's own figure), rate of rise,
  drop temperature, data-sanity warnings for mis-pressed buttons, and thermal dose.
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
- **The rulebook for audit** (`docs/RULES.md`): every rule, setting, taste word and message in
  roasting terms, with worked examples and a step table measured from the stock profiles. A test
  fails if it and the code disagree, so a roaster can audit what runs.
- **First rules** (`src/core/rules.ts`, `advise <beanId>`): the clear cases of a tasting, as an
  ordered rule table with its settings in one place (`RULE_SETTINGS`, first guesses to tune) and
  a test per rule. Sour, grassy or bready chips mean more roasting; bitter, roasty or ashy mean
  less: a 10% step in thermal dose, 15% when two chips agree, halfway to the nearest opposite
  result when the bean already has one (so it stops bouncing), then turned into a level for the
  roast's profile. It asks instead of guessing when the evidence disagrees (sour and bitter
  together, a wish against the cup, an earlier roast that contradicts this one), holds a good,
  well-scored cup, holds a sour cup tasted before its profile's rest is over (the Rest profiles assume
  3 to 5 days; RTD, ready to drink, ones none), switches to the bean's alternative profile when more
  roasting left the cup on the same side (the level isn't what's wrong; never one already tried), holds on espresso that is only sour (espresso fakes sourness), and says
  "no rule" for anything else rather than improvising. The engine returns the finished answer: `say`,
  the whole reply in plain words, and `onYes`, the exact `version:add` command for a yes. The
  `/roast` skill only relays `say` and runs `onYes`; it interprets nothing.
- **Session interface**: `scripts/roast.ts` (JSON in, JSON out, inputs checked against the form
  definitions) driven by the `/roast` skill. No UI by design.

## Next

Order is a suggestion; the roaster picks.

1. **Rule core, next rules** (the part that matters most; the first rules are in "Working today").
   Advice must keep coming from tested rules, never a model's judgement.
   - Tune `RULE_SETTINGS` (step sizes, the noise band, how big a move counts as "the level didn't help") against real roasts and tastings: they are
     first guesses, and there is no research number for them.
   - "The level isn't helping" is judged from one failed step (a 10% move that left the cup on the
     same side). That is thin evidence for a timid first step; raise the bar (two failed steps) if
     real tastings show it switching profiles too early. It applies to bitter cups too, by symmetry.
   - Chips the table doesn't act on: astringent, flat, thin (ambiguous: under-development,
     over-extraction, or the curve's shape), and the wishes sweeter, brighter and more body.
     Flat and thin wait for curve edits; the others need evidence from real tastings of what
     moves them.
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
   plain-language account of what it does to the roast.
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
  tasting scores). It would reverse "personal use only, no web UI" (accounts, shared database, a
  front end), so it needs the roaster's go-ahead and Kaffelogic's permission first. Don't build
  toward it; just keep choices compatible: whole profile files per version with parent links,
  per-roast keys stripped from anything that leaves a user's database, stock profiles never
  shareable unmodified.
- **Kaleido M1** through its own adapter.
- **Per-profile curve-to-roast thermal dose offset** (measured thermal doses run 6-12.5% above the curve's
  prediction). Worth modelling once there are more logs; see the open questions in
  [research.md](research.md).

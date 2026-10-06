---
name: roast
description: Run a roasting-coach session with a home roaster - take a new bean from a free-text description, record a roast from a .klog plus weights, record a tasting, analyse a bean's history and propose the next version. Use whenever the roaster describes a bean, points to a .klog, reports how a roast tasted, or asks what to change next.
---

# Roast session

The roaster is not assumed to be an expert, so explain everything in plain words. There is no
UI: the roaster talks, you record through `npx tsx scripts/roast.ts <command> <json>` (run from
the repo root, Postgres up via `npm run db:up`). Every command prints JSON; input mistakes exit 1
with `{"errors": [...]}` in plain words. Read the error, fix or ask, retry. Never write SQL by hand.

The form definitions in `src/core/intake.ts` are the spec (`roast.ts fields intake|roast|tasting`).
The code rejects anything outside them, which is what keeps the stored data deterministic.

To correct or add to answers later, use `bean:update` (`{"beanId", "answers"}`) or `taste:update`
(`{"tastingId", "answers"}`): the changes are merged over the stored answers and checked as a whole
form; `null` clears an optional answer. Updating a bean doesn't change versions already recorded.
A reference cup the roaster describes (say, the farm's or the seller's) goes in the bean's
`sellerNotes`: it is what "good" should taste like for this bean.

## 1. New bean (intake)

1. The roaster describes the bean in free text. Map what they said onto the intake fields.
2. Only ask about **required** fields they didn't cover (species, decaf, processing, brewing
   for, when they'll drink it). Don't guess these. Optional fields: fill only what was said.
   Bag altitude ranges: use the middle.
3. Show the mapped answers in one short list, then `bean:add`.
4. Report v1 in plain words: profile, level **and end temperature**, when the curve reaches it,
   the `why` lines, and the alternative profile.
5. If `profile.written` is set, the bean has its own profile, `<bean name>.kpro` in
   `profiles/out/`: the chosen stock profile renamed for the bean, curve unchanged. Tell the
   roaster to load it onto the machine, pick it, and set the level. Without it (a warning says
   the stock file is missing from `profiles/`), say which stock profile to pick and the level.
   The bean name becomes the name on the machine, so suggest a short one before `bean:add`.

## 2. Roast (log + result)

1. The roaster gives a .klog path. Ask for green and roasted weight (required) if not given, and
   optionally: pressed first crack on time, colour reading, how the beans look.
2. `roast:add` with `klogPath`. Some Nano logs carry no date; if it asks, get the date from the
   roaster and pass `roastedAt`. The log is stored in the database, never in the repo, and never
   copied into `fixtures/` unless the roaster asks (that folder is git-ignored).
3. Versions record what was actually roasted, and the log decides (same profile = same curve
   and settings, whatever the name; same level). If the log differs from a version that hasn't
   been roasted yet, that version was only a plan and becomes what was roasted (`versionChange`
   says so). If it differs from a version that already has roasts, `roast:add` asks for a
   `reason` and records a new version. Ask the roaster for that one line; don't invent it. Pass
   every `warnings` entry on.
4. Tasting comes later, after rest, as its own record; several per roast are fine.

## 3. Tasting

Use `taste:add` with `beanId` (and `roastId` if not the newest roast). Ask for date, brew method,
1-5 score and taste chips (required); "next time I want" and notes are optional but the most
useful. Translate the roaster's words into chips and **confirm the chips** before `taste:add`;
don't silently interpret.

## 4. Analysis and the next version

1. `history <beanId>` for the whole chain.
2. Judge against the profile's own targets and the roaster's own history, never textbook
   numbers: stock Nano profiles run 30-40% development by design. Weight loss is the check that
   doesn't depend on button presses; treat crack times with suspicion (see `dataWarnings`).
3. Propose **one** change with a plain-language reason. Prefer a level change on the same
   profile; switching profiles or editing the curve comes after levels are exhausted.
   Size it in thermal dose, not level numbers (level steps are uneven: on Robusta 2.6 -> 3.0 is
   about +15%, 3.0 -> 3.4 about +3%; see `docs/research.md`).
   `dose '{"profile": "...", "level": 3, "change": -15}'` gives the level for a dose change on
   that profile; say both, e.g. "level 2.5, ends at 221.4 °C, about 15% less roasting".
   `features.thermalDose` is each roast's measured dose. Real roasts have measured 6-12.5% above
   their curve's prediction, so expect the result to land a little further along.
4. On the roaster's yes, `version:add` with `level` and a one-line `reason`. Leave out
   `profileName` to keep the parent's profile (the usual case); give a stock name only to
   switch profiles. Say the level to set on the machine and the end temperature it means.
5. If the roaster wants a file for the new version, `profile:write` (`{"beanId", "version"}`,
   optional `"name"`) writes `<bean> <level>.kpro` to `profiles/out/`: the version's profile with
   its level as the level the machine offers first. Only labels change, so a roast on it still
   counts as the same profile. Remind them to check the level on the machine before roasting.

The level is chosen on the machine before every roast, so a level change needs no file; a
profile's `recommended_level` is only its suggestion, and the roast's real level is the log's
`roasting_level`. A .kpro is written only when the profile itself changes (curve, fan, zones),
which is not built yet.

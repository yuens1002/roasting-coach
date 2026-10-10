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
2. Only ask about **required** fields they didn't cover (species, decaf, processing, when they'll
   drink it). Don't ask how they will brew it: that doesn't change the roast. Don't guess these. Optional fields: fill only what was said.
   Bag altitude ranges: use the middle.
3. Show the mapped answers in one short list, then `bean:add`.
4. Report v1 in plain words: profile, level **and end temperature**, when the curve reaches it,
   the `why` lines, and the alternative profile.
5. If `profile.written` is set, the bean has its own profile, `<bean name>.kpro` in
   `profiles/out/` (or `KAFFELOGIC_OUT_DIR` when it is set): the chosen stock profile renamed for the bean, curve unchanged. Tell the
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
roast quality (1-5) and taste chips (required); notes are optional. Translate the roaster's words
into chips and **confirm the chips** before `taste:add`; don't silently interpret.

The cupping protocol is filter coffee only: pour over, French press / immersion or AeroPress, whatever
the bean is brewed for at home, so no cup is a different kind of brew from the others. Filter is a
baseline chosen because it is accessible (any roaster can make it with inexpensive equipment); it is not a
roast target, and the roast is never aimed at a brew method. The form
offers only those brews. If the roaster tasted it another way (an espresso shot), tell them the tasting
has to be of filter coffee to be compared; don't record it as another brew. `advise` asks for a
retaste as filter coffee when every tasting of the roast it is advising on was another brew (an older
recording, such as an espresso shot).

The quality is how well the roast came out, judged by defects, **not whether the roaster likes the
cup** (the tool doesn't ask that and doesn't use it). Offer the scale in these words (`roast.ts fields
tasting` has them): 1 a roast defect dominates the cup, 2 a defect is there but doesn't dominate,
3 clean with little character, 4 clean and expressive, 5 clean, expressive, balanced and sweet. A flat
cup with no defect is a 3 however little they like it. If the roaster gives a liking ("I'd give it a
1, it's dull"), ask the quality question again in these terms; don't convert it yourself. The engine
checks quality against the chips (a defect word means 1 or 2; none means 3 or more) and asks when
they disagree: relay that and fix whichever the roaster says is wrong with `taste:update`.

A tasting recorded before roast quality replaced the overall score holds an old liking, not a quality,
so `advise` leaves it out until it is rated (`taste:update` with a `quality` answer marks it rated). If
`advise` lists `unratedTastings` (ids only; `history` shows each one's date, brew and words), tell
the roaster those were left out, say which by date and brew, and offer to rate them; if it
refuses because every tasting is unrated, relay its message and ask for the ratings in the anchored terms.

## 3b. The roaster's own settings and taste words

Step sizes, the roast quality that counts as good enough, and what a taste word means to the rules are
personal; the defaults are in `docs/RULES.md` and the roaster's own values are in their database.
`calibration` shows every setting and word, its default and whether it is the roaster's own.
When the roaster says what they mean by a word ("my flat means under-roasted"), how big their
steps should be, or what roast quality they call good, work out the exact change, **say it back in one
line and wait for a yes**, then `calibration:set` (`{"settings": {"stepPct": 8}, "words": {"flat": "under"}}`;
a word is `under`, `over`, `good` or `none`; `null` puts one back to its default). Only change
these when the roaster asks. Never to make advice come out differently. A refusal lists the
allowed values in plain words: pass them on. `advise` lists the roaster's departures from the
defaults under `personal`; after relaying `say`, add one line naming them, so the answer can be
checked against `docs/RULES.md`.

## 4. Analysis and the next version

The advice comes from a rule engine, not from you. Your part is to run it, say what it returns,
and run the command it hands you if the roaster says yes.

1. `advise <beanId>`. It answers the most recently roasted roast that has a tasting and a measured
   thermal dose, using the bean's other tasted roasts as its record. If `basedOn.roastId` isn't the
   roast the roaster asked about, tell them which roast the advice is for. It returns `say` and, only when there is something to
   record, `onYes`.
2. Say `say` to the roaster as written, adding only the one `personal` line from 3b and, when `advise` lists `unratedTastings`, the one note from step 3 (it can be several lines: for a clean cup below the bar it lists
   the levers that change the roast, each with what it changes; relay every line). Don't add, drop, reword, round or second-guess any of it,
   and don't judge the roast yourself: textbook numbers don't apply to Nano profiles, and the
   rules already allow for that.
3. If there is an `onYes` and the roaster says yes, run its `command` with its `input` exactly as
   given (`version:add`). Then tell them the level to set on the machine and the end temperature
   (both are in `say`). Without an `onYes`, nothing is recorded.
4. If `say` asked the roaster something, or says no rule covers the tasting, wait for their answer.
   A wrong or missing chip is fixed with `taste:update` and `advise` is run again. A change they
   choose themselves is theirs, not the engine's: size it with `thermal-dose`
   (`thermal-dose '{"profile": "...", "level": 3, "change": -15}'`, change in %), record it with
   `version:add` and their own words as the `reason`, and say it was their choice. A switch to the
   other profile they choose (the ledger names it, with a level) is recorded the same way with
   `"profileName"` and the level the ledger gave, and it costs a roast. When `say` asks for a
   retaste as filter coffee, add that tasting with `taste:add` on the same roast and run
   `advise` again; nothing new is recorded until the tasting is.
5. If the roaster wants a file for the new version, `profile:write` (`{"beanId", "version"}`,
   optional `"name"`) writes `<bean> <level>.kpro` to `profiles/out/` (or `KAFFELOGIC_OUT_DIR` when it is set): the version's profile with
   its level as the level the machine offers first. Only labels change, so a roast on it still
   counts as the same profile. Remind them to check the level on the machine before roasting.

The level is chosen on the machine before every roast, so a level change needs no file; a
profile's `recommended_level` is only its suggestion, and the roast's real level is the log's
`roasting_level`. A new .kpro is needed only when the profile itself changes (curve, fan, zones),
which is not built yet.

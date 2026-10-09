# roasting-coach

Helps a home roaster reach the best roast a coffee can give, in as few roasts as possible, from the
machine's own log and their tasting notes. It coaches the roast, not the taste. Built first for the
Kaffelogic Nano 7; other roasters (the Kaleido M1 next) through their own adapters.

## The goal

Get a bean's roast right in **no more than three roasts**, by telling the roaster which lever to
push each time. "Right" is a **roast quality of 4 or better**.

Roast quality is how well the roast came out, judged by roast defects. It is not how much you like
the cup:

- **1:** a roast defect dominates the cup (sour or grassy from under-roasting; bitter or ashy from
  over-roasting).
- **3:** clean, with little character.
- **4:** clean and expressive.

The full five-point scale is in [docs/RULES.md](docs/RULES.md), section 3. A flat cup with no roast
defect is a 3 however little you like it, and getting it to a 4 is what the other levers are for.

Liking is deliberately not asked and not used. Two roasters can disagree about whether they like a
cup, but they should agree on whether the roast has a defect, so that is what the tool coaches on.
What *is* personal is how you perceive and name a cup (what "flat" means to you) and how big a step
you take. Those are kept in your own database, and the same rules use them. The reasoning, and what
was considered and set aside, is in [docs/ROADMAP.md](docs/ROADMAP.md).

## The problem

Some home roasters, the Kaffelogic Nano among them, don't let you steer a roast as it happens. You
choose a profile, set a level, press start, and the machine follows the profile. Everything depends
on the profile you loaded before the roast began.

So after you taste the cup, the real question is: **what should I change?** That is where it gets
hard.

- **The profile graph doesn't tell you what a change will do.** The editor draws a curve of
  temperature over time. It doesn't say what happens to the roast, or to the flavour in the cup, if
  you move a point on it. Without that link, changing a profile is guesswork, and it's easy to fall
  back on only touching the level.
- **The level is not the only lever.** A defect word (sour, ashy) tells you which way to move the
  level. Once a cup has no roast defect left, nothing tells you which way to go, so another step is
  only a probe. What can still change the roast is the profile and the curve (rest and brew change the
  cup, not the roast, so every tasting is of filter coffee), and it's easy to keep pushing the level because
  it's the one control you can see.

And the help you can find doesn't close the gap, because much of it is wrong for these machines:

- **Textbook targets don't fit.** The common rule of "15-25% development" would call most stock
  Nano roasts overdone: its profiles run 30-40% development by design.
- **The controls aren't what they look like.** A roast level is just a number, and its meaning
  differs between profiles. Even on one profile the steps are uneven: on the Robusta profile,
  going from level 2.6 to 3.0 adds about 15% more roasting chemistry, while 3.0 to 3.4 adds about
  3%.
- **Time and end temperature mislead.** A short, hot roast can do far more chemistry than a longer
  one ending at the same temperature.
- **The log isn't always right.** Colour change and first crack are button presses, often early,
  late or forgotten.
- **A general AI chat doesn't fix this.** Asked to read a log, it gives fluent textbook advice,
  forgets the previous roast, and has to pick numbers out of a 600-row table.

## How it works

Improving a bean is an iterative experiment: roast, taste, change one thing, roast again. A tool can
make that experiment reliable if it:

1. **Turns what you tasted into the next thing to change, and says what it will do.** For a cup with
   a roast defect, that is usually a change in roasting, in plain words and before you roast. It
   holds or asks instead when the roast may not be the cause: a sour cup tasted before its profile's
   rest is over, a tasting that was not of filter coffee, sour and bitter together, a roast quality that disagrees with
   the words, or earlier roasts that contradict this one. For a clean cup short of the bar, it lists
   every lever that changes the roast (level, profile, curve), what each one changes, and what your own
   roasts say about it. Every tasting is of filter coffee, so a difference between two cups is a
   difference in the roast and not in the brew.
2. **Gives deterministic, explained advice.** The same evidence always leads to the same
   suggestion, from tested rules. A model never reads raw curves and never judges the cup. Every
   rule, setting and taste word is written out in [docs/RULES.md](docs/RULES.md), with a worked
   example of the engine's exact words for each outcome. Tests check that page against the program
   (the rule list, the settings, the quality scale, the lever sentences and each example); the
   "when" and "what it does" prose is read beside the examples, not tested.
3. **Measures what matters, grounded in research and checked against real logs.** The roast's
   *thermal dose* (from Arrhenius reaction kinetics) says how far its chemistry went (heat exposure over the whole roast, nothing to do with the
   grams of coffee in an espresso basket, which is also called a dose), independent of button presses
   and fair across profiles and levels. It makes a change something you can reason about: "about 15%
   less roasting" means the same thing on any profile, and is then turned into a level for the
   profile at hand. See [docs/research.md](docs/research.md) for the sources, the computations and
   what held up.
4. **Records the journey.** Each bean is a project; each version is a profile plus the level that
   was actually roasted, with its log, the result, the tasting, and a one-line reason for the
   change. The log decides which version a roast belongs to, so the history can't drift from what
   really happened.
5. **Judges the roast by its defects, against the bean's own history.** The taste words say which
   way a defective roast went wrong; the roast quality says whether a change helped; the two have to
   agree, or the tool asks. Weight loss and development are recorded but not yet used by the rules
   (see [docs/RULES.md](docs/RULES.md), section 1).

## Where to read how and why

| If you want to know | Read |
|---|---|
| How every suggestion is decided, word for word, with worked examples | [docs/RULES.md](docs/RULES.md) |
| Why thermal dose, and what was validated against real logs | [docs/research.md](docs/research.md) |
| Where the project stands, what was decided and why, and what was considered and set aside | [docs/ROADMAP.md](docs/ROADMAP.md) |
| How the parser, the starting profiles and the forms were designed | [docs/thread1-notes.md](docs/thread1-notes.md) |
| What changed in each release | [CHANGELOG.md](CHANGELOG.md) |
| How a roasting session runs in Claude Code | [.claude/skills/roast/SKILL.md](.claude/skills/roast/SKILL.md) |

## Status

Alpha (0.1.x). What works, what is next and what is waiting on others is in
[docs/ROADMAP.md](docs/ROADMAP.md).

There is no app or web UI. It runs in a Claude Code session: the roaster describes the bean,
points to a log and says how the cup tasted and how good the roast was; Claude records it through
`scripts/roast.ts` (JSON in, JSON out, with every input checked against fixed form definitions) and
relays the engine's answer. The session flow is in
[.claude/skills/roast/SKILL.md](.claude/skills/roast/SKILL.md).

## Layout

- `src/core/` machine-independent: the `RoastLog` model, feature extraction (phases,
  development, rate of rise, thermal dose, data sanity checks), the form definitions and the
  roast-quality scale, the deterministic rule table (`rules.ts`), the lever ledger (`levers.ts`)
  and the per-roaster settings (`calibration.ts`).
- `src/adapters/kaffelogic/` reads `.kpro` and `.klog` files, maps them onto `RoastLog`, holds the
  stock-profile table, rebuilds and writes profiles, and computes a profile's thermal dose at each level.
- `src/db/` the roast-project store (bean, profile version, roast, tasting, and the roaster's own settings).
- `db/` Postgres schema and seed.
- `scripts/` the session commands (`roast.ts`), the research computations, and helpers for real
  files and the seed.
- `docs/` the rulebook, the research, the roadmap and the design notes (see "Where to read how and
  why" above). Tests check the rulebook against the code: its rule names, settings and their
  allowed ranges, taste words, quality scale, lever sentences, rest days, examples and step table.

## Running

```
npm install
npm test                                 # unit tests (synthetic data; real-file tests skip without files)
npx tsc                                  # typecheck
npm run research                         # reproduce the validation in docs/research.md
npm run rules:steps                      # the step table in docs/RULES.md, from your stock profiles
npm run analyze -- path/to/roast.klog    # features for one roast
npm run profiles -- path/to/profiles/    # numbers behind the starting-profile table
```

## Local database

```
npm run db:up        # Postgres 16 in Docker on port 54320
npm run db:migrate   # applies db/*.sql once each
psql postgres://roast:roast@localhost:54320/roast_copilot
```

Using a Postgres you already run instead? Copy `.env.example` to `.env` and point
`DATABASE_URL` at it. `npm run db:seed` regenerates the seed after changing the TypeScript table.

Upgrading from 0.1.5 or earlier: migration 005 renames the tasting's `score` to `quality` and marks
every existing tasting unrated, because those scores were an overall liking. The advice skips an
unrated tasting until you rate it by the new scale (see [CHANGELOG.md](CHANGELOG.md)).

## Your Kaffelogic files

Put your own `.kpro` profiles and `.klog` logs in `profiles/` (any names, any depth; git-ignored),
or point `KAFFELOGIC_DIR` at the folder your roaster writes to. Profiles roasting-coach writes go to
`profiles/out/`. Tests against real files run only when they are present (in `profiles/` or
`fixtures/private/`).

Kaffelogic's profiles and logs are not published under an open licence, so this repository never
includes them. It refers to stock profiles by name and stores only numbers derived from them.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md); in short, never commit Kaffelogic files or personal data.
Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md). Report security problems
privately as described in [SECURITY.md](SECURITY.md). Changes are listed in
[CHANGELOG.md](CHANGELOG.md).

## Licence

[GNU AGPL v3.0 only](LICENSE) (AGPL-3.0-only).

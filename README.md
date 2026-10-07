# roasting-coach

Helps a home roaster make each roast of a bean better than the last, from the machine's own log and
their tasting notes. Built first for the Kaffelogic Nano 7; other roasters (the Kaleido M1 next)
through their own adapters.

## The problem

Some home roasters, the Kaffelogic Nano among them, don't let you steer a roast as it happens. You
choose a profile, set a level, press start, and the machine follows the profile. Everything depends
on the profile you loaded before the roast began.

So after you taste the cup, the real question is: **what should I change on the profile?** That is
where it gets hard.

- **The profile graph doesn't tell you what a change will do.** The editor draws a curve of
  temperature over time. It doesn't say what happens to the roast, or to the flavour in the cup, if
  you move a point on it. Without that link, changing a profile is guesswork, and it's easy to fall
  back on only touching the level.

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

## The thesis

Roasts that are predictable, and matched to the cup you want. Improving a bean is an iterative
experiment: roast, taste, change one thing, roast again. A tool can make that experiment reliable
if it:

1. **Turns what you tasted into a change on the profile, and says what that change will do.** In
   plain words, before you roast: not "move this point", but what it will do to the roast and
   which way it should push the cup.
2. **Gives deterministic, explained advice.** The same evidence always leads to the same
   suggestion, from tested rules. A model never reads raw curves.
3. **Measures what matters, grounded in research and checked against real logs.** The roast's
   *thermal dose* (from Arrhenius reaction kinetics) says how far its chemistry went, independent
   of button presses and fair across profiles and levels. It makes a change something you can
   reason about: "about 15% less roasting" means the same thing on any profile, and is then turned
   into a level for the profile at hand. See [docs/research.md](docs/research.md) for the
   sources, the computations and what held up.
4. **Records the journey.** Each bean is a project; each version is a profile plus the level that
   was actually roasted, with its log, the result, the tasting, and a one-line reason for the
   change. The log decides which version a roast belongs to, so the history can't drift from what
   really happened.
5. **Judges a roast by the right yardstick.** The profile's own targets and the roaster's own
   history, with checks that don't depend on button presses (weight loss, thermal dose). The
   tasting decides.

## Status

Alpha (0.1.x). What works, what is next and what is waiting on others is in
[docs/ROADMAP.md](docs/ROADMAP.md).

There is no app or web UI. It runs in a Claude Code session: the roaster describes the bean,
points to a log and says how the cup tasted; Claude records it through `scripts/roast.ts` (JSON in,
JSON out, with every input checked against fixed form definitions) and explains the next step. The
session flow is in [.claude/skills/roast/SKILL.md](.claude/skills/roast/SKILL.md).

## Layout

- `src/core/` machine-independent: the `RoastLog` model, feature extraction (phases,
  development, rate of rise, thermal dose, data sanity checks), the form definitions and their
  validation.
- `src/adapters/kaffelogic/` reads `.kpro` and `.klog` files, maps them onto `RoastLog`, holds the
  stock-profile table, rebuilds and writes profiles, and computes a profile's dose at each level.
- `src/db/` the roast-project store (bean, profile version, roast, tasting).
- `db/` Postgres schema and seed.
- `scripts/` the session commands (`roast.ts`), the research computations, and helpers for real
  files and the seed.
- `docs/research.md` the research we rely on and how it was validated.
- `docs/ROADMAP.md` the project's state: what works, what is next, what is blocked.

## Running

```
npm install
npm test                                 # unit tests (synthetic data; real-file tests skip without files)
npx tsc                                  # typecheck
npm run research                         # reproduce the validation in docs/research.md
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

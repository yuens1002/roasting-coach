# Contributing to roasting-coach

Thanks for your interest. roasting-coach reads a home roaster's logs and tasting notes and
suggests what to change for the next roast, in plain words and deterministically where possible.
It is built first for the Kaffelogic Nano 7.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ground rules

- **Never commit Kaffelogic files** (`*.kpro`, `*.klog`), in any form: not as fixtures, not
  pasted into tests, docs or issues. We found no licence for them and Kaffelogic's terms forbid
  reproduction. Only profile names and numbers derived from them (facts) live in the code. Real
  files go in `fixtures/private/` or `profiles/`, both git-ignored; tests that need them pick
  them by content and skip when they're absent.
- **No personal data.** No real roast logs, tasting notes, names, emails, or absolute paths into
  anyone's home directory in code, tests, docs or commit messages. Use the made-up log in
  `test/syntheticLog.ts` for tests.
- **Cite sources.** Numbers or methods taken from a paper are cited where they are used (see the
  thermal dose in `src/core/features.ts`). Don't copy tables or text from papers you don't have
  the right to reproduce; derived constants with a citation are fine.
- **Advice stays deterministic and explained.** Suggestions come from tested rules, not from a
  model reading raw curves, and each comes with a plain-language reason.
- **Keep the machine-independent core separate.** `src/core` knows nothing about Kaffelogic;
  machine specifics live in `src/adapters/<machine>`.

## Development

```
npm install
npm run db:up        # Postgres 16 in Docker, port 54320
npm run db:migrate
npm test
npx tsc              # typecheck
```

Windows is a primary environment: don't spawn shell tools from tests, write files from Node
rather than shell redirection, and don't assume LF line endings.

### The dev station

`npm test` checks the parts. The station tries the whole build the way a roaster does, against a
throwaway database (`roast_station` on the same Docker server) and scratch folders in the system temp
folder, so your own database and `profiles/` are never touched. It needs `npm run db:up`.

```
npm run station           # replay a scripted session through scripts/roast.ts, checking each answer
npm run station:session   # reset, then print how to open a fresh Claude Code session on the station
npm run station:reset     # empty the station and nothing else
```

Run `npm run station` after changing a rule, a message, a form or the starting-profile choice: it stops at
the first answer that is not what the rulebook says. Edit the scenario in `scripts/station.ts` with the
change. Run `npm run station:session` when the `/roast` skill or what the session relays changes, and read the
session against the list it prints. Logs are made up (`scripts/stationKit.ts`); never a Kaffelogic file.

The station only drops a `roast_station` database that carries its own comment, and only empties a scratch
folder that is empty or holds its marker file, so a database or folder of the same name made by anyone else is
refused, not deleted. One made by an earlier version of the station has neither: drop it, or add the comment
and marker by hand, and run it again.

## Changes

- Open an issue first for anything larger than a small fix, so we can agree on the approach.
- Keep pull requests focused, with tests for new behaviour. `npm test` and `npx tsc` must pass.
- Form fields and database columns change together: a test fails if `src/core/intake.ts` and
  `db/` drift apart.

## Licence

roasting-coach is licensed under the [GNU AGPL v3.0 only](LICENSE). By contributing, you agree
that your contributions are licensed under the same terms.

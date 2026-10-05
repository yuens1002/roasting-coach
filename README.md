# roast-copilot

Helps a home roaster improve each roast from the machine's log plus their own tasting notes.
Kaffelogic Nano 7 first; Kaleido M1 later through a second adapter.

## Layout

- `src/core/` machine-independent: the `RoastLog` model, feature extraction (phases,
  development, rate of rise, data sanity checks) and the intake / result form definitions.
- `src/adapters/kaffelogic/` reads `.kpro` and `.klog` files, maps them onto `RoastLog`,
  and holds the stock-profile table used to pick a starting profile for a new bean.
- `db/` Postgres schema and seed for the stock-profile tables.
- `scripts/` command-line helpers for looking at real files and regenerating the seed.

## Running

```
npm install
npm test                                 # unit tests (synthetic data)
npm run analyze -- path/to/log0040.klog  # features for one roast
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

Tests against real Kaffelogic files run only when you copy them into `fixtures/private/`
(ignored by git). Kaffelogic's stock profiles are not published under an open licence, so
this repository refers to them by name and stores only numbers derived from them; users
load their own files.

## Licence

AGPL-3.0-only.

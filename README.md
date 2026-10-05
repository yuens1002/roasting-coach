# roast-copilot

Helps a home roaster improve each roast from the machine's log plus their own tasting notes.
Kaffelogic Nano 7 first; Kaleido M1 later through a second adapter.

## Layout

- `src/core/` machine-independent: the `RoastLog` model, feature extraction (phases,
  development, rate of rise, data sanity checks) and the intake / result form definitions.
- `src/adapters/kaffelogic/` reads `.kpro` and `.klog` files, maps them onto `RoastLog`,
  and holds the stock-profile table used to pick a starting profile for a new bean.
- `scripts/` command-line helpers for looking at real files.

## Running

```
npm install
npm test                                 # unit tests (synthetic data)
npm run analyze -- path/to/log0040.klog  # features for one roast
npm run profiles -- path/to/profiles/    # numbers behind the starting-profile table
```

Tests against real Kaffelogic files run only when you copy them into `fixtures/private/`
(ignored by git). Kaffelogic's stock profiles are not published under an open licence, so
this repository refers to them by name and stores only numbers derived from them; users
load their own files.

## Licence

AGPL-3.0-only.

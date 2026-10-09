# Thread 1: parser, starting profiles, forms

Working notes from the first build pass, 5 Oct 2026. Code is in `src/`, tests in `test/` (32 passing).

## 1. What the parser reads from log0040

```
Profile        1500-2000m RTD  (level 3.3, target end 219.9 °C)
Roast date     2025-06-25T14:21:55Z   ambient 25.2 °C   batch 120 g
Total time     10:23   drop 219.7 °C
Colour change  –      (ignored, see warning)
First crack    6:20 at 202.9 °C
Development    4:02  (38.9%, +16.9 °C after crack)
Time to temp   100°C 1:13  150°C 3:06  170°C 4:17  190°C 5:32  200°C 6:11
RoR (°C/min)   at crack 14.1, at end 1.8, change across crack -7.6, shape declining
Tracking       mean 2.1 °C, max 5.8 °C off the profile
WARNING        Colour change is marked at 201.4 °C, outside the usual 140–190 °C,
               so the press is not used.
```

Our development figure matches the machine's own `!development_percent` (38.9%).

### File-format facts we confirmed

- **Roast levels count from 0.** `roast_levels` holds the end temperature for levels 0–6 and
  fractional levels interpolate. Level 3.3 on this profile is 219.9 °C; the roast ended at 219.7 °C.
  KL Washed's level 0.8 works out to first crack + 5.4 °C, matching its own "+5 to 7 °C" guidance.
- **Curves are Bezier nodes**, six numbers each: point, incoming handle, outgoing handle.
- **Past the last node the Nano keeps going in a straight line** along the last handle. The log's
  profile column rises at exactly that slope (3.88 °C/min) after the curve ends. So a level whose
  temperature is above the curve's last point still has a well-defined end time.
- **Event markers are written a few seconds late**; their value is the time, not their position.
- Colour change and first crack are both button presses on the Nano, so they are only as good
  as the press. The parser sanity-checks them and says so in plain words.
- **A `.klog` header embeds the full profile**: every `.kpro` key with the same value (numbers
  written to 6 significant figures), plus per-roast keys (`LOG_ONLY_KEYS`: model code, mains
  voltage, motor hours...), minus `profile_description`. Verified on log0046 against its `.kpro`,
  so any log rebuilds the profile it was roasted on.
- Some logs have no `roast_date` line (log0046); `addRoast` then asks for the date.

## 2. The finding that matters most for advice

Generic roasting advice says to aim for roughly 15–25% development. **On the Nano's stock
profiles that rule would be wrong.** If first crack reads around 203 °C (as in log0040), the
stock profiles at their own medium levels give 30–40% development by design. Kaffelogic's
process profiles expect first crack at 209–213 °C, which would make your crack press about
6 °C early, or your probe reads lower. Even taking first crack at 209 °C (6:56 in this log),
development is still 33%.

So the rules must judge a roast against **the profile's own expectations and the user's own
history**, and lean on temperature rise after crack and weight loss, not on a textbook
development percentage. Weight loss is the one development check that doesn't depend on
pressing a button at the right moment, which is why it is required in the result form.

## 3. Starting profile for a new bean

Picked in this order (code: `selectStartingProfile`):

1. Robusta → **Robusta** (higher-fan variant if chaffy).
2. Decaf → **Decaf**.
3. Washed or natural → **KL Washed / KL Natural**, altitude profile as the alternative.
4. Everything else → **altitude band × RTD/Rest**.
   Unknown altitude uses 1500–2000 m. The start is the level the profile's own file recommends; how the bean will be brewed is not asked
   (changed 2026-10-09; the first version of this list chose by a "brewing for" goal).

| Profile | Filter level → end | Espresso level → end | Darker level → end | Profile's own targets |
|---|---|---|---|---|
| 0-1200m RTD | 2.2 → 218.3 °C @ 9:31 | 3.0 → 221.0 °C @ 10:07 | 4.6 → 225.6 °C @ 11:10 | |
| 0-1200m Rest | 2.2 → 221.2 °C @ 11:31 | 3.0 → 227.8 °C @ 12:27 | 5.0 → 235.0 °C @ 13:27 | |
| 1200-1500m RTD | 2.2 → 218.4 °C @ 9:39 | 3.0 → 221.8 °C @ 10:22 | 4.6 → 225.8 °C @ 11:13 | |
| 1200-1500m Rest | 2.2 → 219.8 °C @ 8:55 | 3.0 → 226.0 °C @ 9:52 | 4.6 → 230.9 °C @ 10:36 | |
| 1500-2000m RTD | 2.4 → 216.0 °C @ 9:32 | 3.1 → 219.3 °C @ 10:19 | 4.3 → 222.6 °C @ 11:10 | |
| 1500-2000m Rest | 2.5 → 220.1 °C @ 8:41 | 3.2 → 222.4 °C @ 9:17 | 4.3 → 224.9 °C @ 9:59 | |
| 2000-2700m RTD | 2.5 → 216.5 °C @ 9:36 | 3.2 → 219.6 °C @ 10:24 | 4.5 → 223.0 °C @ 11:16 | |
| 2000-2700m Rest | 2.0 → 217.1 °C @ 7:55 | 3.2 → 220.1 °C @ 8:40 | 4.6 → 223.4 °C @ 9:34 | |
| KL Washed | 1.0 → 216.5 °C @ 6:55 | 1.2 → 217.6 °C @ 7:06 | | crack +5–8.5 °C filter, +7–12 °C espresso; dev 10–18% / 15.5–26% |
| KL Natural | 1.0 → 216.5 °C @ 8:17 | 1.3 → 218.2 °C @ 8:44 | | crack +5–7.5 °C filter, +7–10 °C espresso; dev 10–20% / 20–30% |
| Cupping | 2.0 → 212.0 °C @ 8:20 (cupping) | | | dev 18–19% |
| Decaf | 2.1 → 218.8 °C @ 8:21 | 3.0 → 221.3 °C @ 8:59 | 4.0 → 222.5 °C @ 9:19 | dev 19.8% / 25% / 28% |
| Robusta | 2.2 → 220.1 °C @ 9:47 | 3.0 → 223.4 °C @ 10:36 | 4.8 → 227.1 °C @ 11:28 | dev 25–27% |

RTD means "ready to drink": those profiles suit coffee drunk within a day or two. The Rest
profiles assume 3 to 5 days of resting before brewing.

"@ m:ss" is when the profile curve reaches that end temperature. Levels are the light/medium/dark
levels each profile's description suggests. KL Classic is left out of selection: it is the Nano's
original built-in profile, and the others are newer and more specific.

Note that the Rest profiles reach much higher end temperatures at the same level number than the
RTD ones (0-1200m Rest level 3.0 ends at 227.8 °C, RTD at 221.0 °C). **Level numbers are not
comparable across profiles**, so the app should always show the end temperature alongside the level.

## 4. Forms

Defined as data in `src/core/intake.ts`, so the CLI prompts from them (no web UI: personal use only). The log supplies profile,
level, ambient temperature and every time and temperature, so none of that is asked.

**Bean intake (once per bean).** Required: name, species, decaf, processing, when
you'll drink it. Optional: altitude, origin, variety, harvest/arrival date, moisture, density,
chaff, seller's tasting notes.

**Right after the roast.** Required: green weight, roasted weight. Optional: "I pressed first
crack when I heard it" (untick to stop trusting development time), colour reading, how the beans
look (even, uneven, dark tips, oily, chaff).

**Tasting (after rest).** Required: date (gives days rested), brew method, roast quality (1–5,
anchored to roast defects, see `docs/RULES.md` section 3), taste chips (sweet, bright, balanced,
sour, grassy, bready, astringent, flat, bitter, roasty, ashy, thin). Optional: notes.

An earlier design asked for an overall 1–5 score and optional "next time I want" chips (same,
sweeter, brighter, less sour, less bitter, more body, lighter, darker), to give the rules a direction
straight from the person. Both were dropped on 2026-10-08: the tool coaches the roast, not the
taste, so it asks for the roast's quality and never how much the roaster likes the cup.

## 5. Kaffelogic's files and an open-source repo

We found no licence for Kaffelogic's profile files on their site, and its terms of service forbid reproducing any
portion of the service without written permission. So the repo commits **no Kaffelogic files**:
`.gitignore` excludes `*.kpro`, `*.klog` and `fixtures/private/`. The table above stores names and
numbers derived from the files, which are facts. Prose from the descriptions is not copied.
Tests on the real files run only when someone has them locally. Asking terms@kaffelogic.com
for permission would let us ship them as test fixtures, but nothing depends on that.

## 6. The table in Postgres

`db/001_stock_profiles.sql` creates three tables and one function:

- `machine`: one row per roaster model (`kaffelogic-nano7` today; the M1 joins later).
- `stock_profile`: one row per stock profile, with what it is meant for (altitude band,
  drink soon or rest, process, robusta, decaf), its seven level end temperatures, the first-crack
  temperature it expects when it states one, and `selectable` (false for KL Classic and the
  high-fan Robusta, which we recognise in logs but don't suggest).
- `stock_profile_level`: one row per profile and goal (filter, espresso, dark, cupping) with the
  level, end temperature, when the curve reaches it, and any development or rise-after-crack
  target the profile states.
- `level_to_temp(levels, level)`: turns any level, including one a user typed, into an end temperature.

`db/002_stock_profiles_seed.sql` is generated from the TypeScript table (`npm run db:seed`), and a
test fails if the two ever differ. The tests load both files into an in-memory Postgres (PGlite)
and check counts, constraints, that every stored end temperature agrees with its level, and a
plain-SQL lookup (1850 m, drink soon, espresso → 1500-2000m RTD at level 3.1, 219.3 °C, 10:19).

Only names and numbers are stored: no profile files, curves or description text. The selection
order (robusta, decaf, cupping, process, altitude) stays in `selectStartingProfile`, where it is
tested; the database holds the data it reads.

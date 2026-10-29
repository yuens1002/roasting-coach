# Thermal dose as a roast-degree measure: an implementation and a first check on a home roaster

*Draft, 2026-10-11. Not yet reviewed by anyone but the maintainer. Numbers are reproducible with `npm run research` and
`npm run research:sensitivity` (below); every claim names the data under it and what the data cannot show.*

## Summary

- **What it is.** One number per roast, the *thermal dose*: the minutes at a constant 200 °C that would do the same
  heat-driven chemistry as the whole bean-temperature curve, using the Arrhenius law with Ea = 105 kJ/mol. It is computed
  by plain code from a roast log (`thermalDose` in `src/core/features.ts`). It is not read from a model's output and no
  language model touches the curve.
- **Where it comes from.** The framing and the scale of the activation energy come from Bruno et al. 2026 (Sci Rep
  16:15857), a 13-compound kinetic model fitted to four coffees on one industrial drum roaster. We use none of that
  paper's per-compound predictions. The construction itself, equivalent minutes at a reference temperature, is the one known from thermal food
  processing (the F-value); that is background knowledge, not a source we cite.
- **What we claim.** An open-source, tested implementation, and a first check of it on 75 roasts from one home hot-air
  roaster (Kaffelogic Nano 7). The check shows the measure is arithmetically right, separates roasts that end temperature and
  total time do not, repeats on the machine to within a few percent (largest spread 7.1% in 11 groups), and ranks roasts
  almost identically whichever activation energy from 90 to 140 kJ/mol or constant probe offset is used.
- **What we do not claim.** That the thermal dose predicts the cup. Cup evidence is two coffees, one roaster, unblinded.
  We have not found a published check of this kind on home-roaster logs, but we did not do a systematic literature search,
  so read that as "we haven't found one", not "none exists".

## 1. The problem

A roaster who wants a defect-free cup needs to know how far a roast went. The usual numbers are poor witnesses:

- **End temperature** describes one instant. Two roasts that end at 210 °C can differ by 80% in how much chemistry
  happened (Debona et al. 2021, IKAWA Pro profiles: 5.13 against 2.83 in thermal dose).
- **Total time** is no better. The longest of Debona's three roasts was not the most developed.
- **Level numbers** on the Nano are an uneven ruler: on the Robusta profile, level 2.6 to 3.0 adds about 15% thermal dose
  and 3.0 to 3.4 adds about 3% (`docs/research.md`, validation 4).
- **Button presses** (colour change, first crack) are made by a person and are often wrong.

The thermal dose uses the whole curve and no button.

## 2. The measure

For a bean temperature trace T(t) in °C:

    thermal dose = ( ∫ exp(−Ea / R·T(t)) dt ) / exp(−Ea / R·T_ref)      T in kelvin, T_ref = 200 °C, result in minutes

with Ea = 105 kJ/mol and a trapezoid integral over the logged samples. A roast that sat at exactly 200 °C for five minutes
has a thermal dose of 5.0. Because the rate rises exponentially with temperature, *how fast* a roast gets hot counts as
much as where it ends, which is why two roasts with the same end temperature differ.

**Provenance, stated narrowly.** Bruno et al. fitted activation energies for 15 reactions in a 13-compound model (most
between 90 and 140 kJ/mol, around 100-110). The paper calls its model preliminary. Its fits look weakly identified: two
coffees came out with activation energies of 109.92 and 109.94, and many fits sit on round numbers, which suggests the
optimiser barely moved from its starting guesses with only end-of-roast measurements. We take the scale (about 105) and
the Arrhenius framing, not the model. Some online summaries credit the paper with model predictive control, core
temperature tracking and first-crack prediction; the paper contains none of these.

So the claim is not "we implemented the paper". It is "we used the paper's kinetics to define a single, cheap, checkable
roast-degree number, and then tested that number".

## 3. Implementation

- `src/core/features.ts`: `thermalDose` and the constants `THERMAL_DOSE`. Machine-independent: it takes (seconds, °C) points.
- `src/adapters/kaffelogic/thermalDose.ts`: the same measure applied to a *profile's curve* ended at a level's end
  temperature, so a level can be turned into a predicted thermal dose before roasting, and a wanted change (say −15%) into the
  level that makes it. This is the "level ladder".
- The rule engine (`src/core/rules.ts`) reads the measured thermal dose of the roasts a coffee has had, brackets the coffee
  between its uncooked and scorched cups, and sizes the next step in thermal dose. Advice is deterministic, so the same
  history always gives the same text (`docs/RULES.md`).
- Nothing here needs a model. A language model fills forms and relays the engine's text.

## 4. What we checked

The data: one Nano 7's complete log archive, 102 files. 75 are whole roasts (a trace of at least five minutes dropped at
180 °C or more). The other 27 were set aside: 19 are aborted or preheat-only, 3 have too few samples, 3 are not parseable
as a Kaffelogic log, 2 repeat another file's content. The archive covers 17 profile names, loads from 50 to 200 g, and an
unknown mix of coffees. The logs do not record the bean, the roasted weight or a tasting, so they can test properties of the
*measure* but say nothing about the cup. The logs are the roaster's own and are not in the repository
(no licence was found, and Kaffelogic's terms forbid reproducing any part of their service); this page carries derived numbers only.

### 4.1 The arithmetic is right

A synthetic log that follows its profile curve exactly matches the curve's predicted thermal dose within 1% (an always-on
test). This checks the code, not the science.

### 4.2 It separates roasts that the simple numbers do not

Across the 75 roasts, thermal dose correlates with drop temperature (rank correlation 0.88) and with total time (0.83), so it
is not a different quantity. But:

| Pairs of roasts | Pairs | Pairs whose thermal doses differ by more than 1.5× |
|---|---|---|
| Dropped within 1 °C of each other | 333 | 55 |
| Same total time (within 15 s) | 264 | 59 |

The measure does carry information that end temperature and time miss. This does not say the cups differ; that is what
section 5 is about.

### 4.3 Repeatability on the machine

Eleven groups of two to three roasts on the same profile body, level and load (roasts that dropped more than 5 °C from their
group's median were left out as stopped early):

| Spread (highest minus lowest, over the mean) | Groups |
|---|---|
| under 2% | 6 |
| 2% to 5% | 3 |
| over 5% | 2 (5.4% and 7.1%) |

Median 1.5%, largest 7.1%. With two or three roasts per group the true spread is wider than this shows, and the repeats were
not controlled (ambient temperature, which coffee, order in the day). What differs between repeat roasts? The logs record the room temperature, the mains voltage, the heater power the machine
found available and how many roasts had run back to back. Pooled over the 25 roasts in the 11 groups, none explains the spread:
the deviation of each roast's thermal dose from its group's mean correlates 0.2 to 0.3 with ambient temperature, available
heater power and mains voltage (higher went with a higher thermal dose), and −0.43 with the back-to-back count (a roast later
in a run came out lower). With 25 roasts and six conditions tried, that last figure is a hint, not a finding. The cause of
the spread is unexplained. The planned ±3% tolerance for curve edits
(`docs/ROADMAP.md`) is a band 6% wide: one group is wider than that (7.1%) and another (5.4%) nearly fills it, so a ±3% tolerance is at
the edge of what the machine repeats, and a measured tolerance should come from this table, not from a round number.

### 4.4 Sensitivity to the activation energy

The code fixes Ea at 105. Recomputing every roast at 90, 120 and 140 kJ/mol:

| Ea (kJ/mol) | Rank correlation with 105 | Two roasts on one profile body: ratio moves by median / 95th pct | Any two roasts: median / 95th pct | Order flips among roasts more than 2% apart |
|---|---|---|---|---|
| 90 | 0.998 | 1.5% / 5.0% | 4.0% / 14.0% | 10 of 2775 pairs (0 of 244 on one profile body) |
| 120 | 0.999 | 1.5% / 4.7% | 4.0% / 12.8% | 5 of 2775 (0 of 244) |
| 140 | 0.997 | 3.3% / 10.6% | 9.2% / 28.4% | 23 of 2775 (1 of 244) |

So the choice of Ea barely changes the *order* of roasts, and between 90 and 120 it moves the ratio of two roasts on the same
profile by about 1.5%. It moves the ratio of two roasts on different profiles by more (median 4%, and 9% at 140), and at 140
by a lot (up to 59% for the most different pair). The existing wording "ratios between roasts barely change across that
range" (`src/core/features.ts`, `docs/research.md`) holds for roasts on one profile in the 90-120 range and is too strong
otherwise. The engine compares roasts of one bean, mostly on one profile, which is the safe case.

### 4.5 Sensitivity to a probe offset

Adding a constant to every bean temperature:

| Offset | Every thermal dose is multiplied by | Rank correlation | Ratio between two roasts moves by (median / largest) |
|---|---|---|---|
| −5 °C | 0.74 to 0.77 | 0.9999 | 0.6% / 3.6% |
| −2 °C | 0.89 to 0.90 | 1.0000 | 0.2% / 1.5% |
| +2 °C | 1.11 to 1.12 | 1.0000 | 0.2% / 1.5% |
| +5 °C | 1.29 to 1.34 | 0.9999 | 0.6% / 3.7% |

An offset rescales every thermal dose (+5 °C is about a third more; −5 °C about a quarter less) but leaves their order almost alone
(rank correlation 0.9999 at ±5 °C) and moves ratios by under 4%. This is why absolute values cannot be compared across machines but comparisons on one machine
are safe against a constant calibration error. It does not cover an error that grows with temperature (a probe's gain or
lag), which we did not test.

### 4.6 Predicted against measured

A profile's curve predicts a thermal dose before the roast. The log also records the temperature the profile asked for, second by
second, so we can compare what the machine delivered with what it was asked for over the same seconds. Across the 75 roasts the
measured thermal dose ran from 17.3% below to 22.9% above the requested one (median +4.6%), and **the sign depends on the
profile**:

| Profile | Roasts | Median | Range |
|---|---|---|---|
| KL Washed | 16 | +3.8% | −4.7% to +7.5% |
| Robusta | 10 | +6.1% | +3.0% to +9.7% |
| 0-1200m RTD | 6 | +4.0% | −3.3% to +7.5% |
| 1200-1500m RTD | 6 | +4.6% | +3.4% to +7.6% |
| 1500-2000m RTD | 6 | +15.4% | +8.3% to +17.2% |
| 2000-2700m RTD | 3 | +8.7% | +8.7% to +17.6% |
| K-logic classic | 4 | +13.7% | +4.1% to +22.9% |
| 1500-2000m Rest | 4 | +13.9% | −11.1% to +14.5% |
| KL Natural | 3 | +3.9% | +2.0% to +4.7% |
| Cupping | 3 | +8.8% | +4.3% to +13.5% |
| Profiles not in this repo's stock list (6 names) | 13 | −3.9% | −17.3% to +4.9% |

(The last row groups the profiles that this repository's stock list does not include; most of them ran below what they asked
for. One stock profile with a single roast, Robusta_inc_fan at +4.8%, is left out of the table.)

Two things follow. First, the "5.3% to 18.5% above" in `docs/research.md` (nine roasts, three profiles) is true for those nine
and should not be read as a property of the machine: other profiles ran at or below their curve. Second, within the 34 roasts
with a first-crack press, the gap tracks the overshoot in development, the mean of bean temperature minus profile temperature
from first crack to the end (rank correlation 0.96). That is close to a restatement: both come from the same temperature
difference, so it shows the gap is made in development, not why the machine overshoots on some profiles and not others.

The practical reading is the one the engine already uses: the curve is good for ranking levels and sizing a step between
neighbours, and each profile has its own offset, which the tool measures from the roaster's own logs.

## 5. Does the thermal dose predict the cup?

This is the part that is **not** shown. What exists:

- **Debona et al. 2021** (two arabicas, three IKAWA programs ending near 210 °C, SCA scores): the best cup for the
  high-altitude coffee came from the *lowest* thermal dose, and score differences were at most 1.25 points, near cuppers' own
  variability. It says thermal dose alone is not the whole story; curve shape matters too. It does not say the thermal dose
  is useless.
- **Two coffees tasted on the Nano**, one roaster, one brew, unblinded, scored by defects (1 a defect dominates, 3 clean with
  little character). Only the numbers are given here, not the cups:

| Coffee | Level | Measured thermal dose | Weight loss | Roast quality |
|---|---|---|---|---|
| A | 3.0 | 11.58 | 16.1% | 1 and 2 (two tastings of this roast) |
| | 2.7 | 10.43 | 17.5% | 2 |
| | 2.4 | 9.27 | 15.7% | 3 |
| | 2.1 | 8.46 | 19.7% | 3 |
| B | 2.0 | 5.82 | 13.1% | 3 |
| | 1.7 | 5.00 | 13.0% | not yet tasted |
| | 2.5 | 7.97 | 14.5% | not yet tasted |

On coffee A the roast quality improves steadily as the thermal dose falls: four roasts, one coffee, one taster who knew the level.
Two cautions are in the table itself. Two tastings of the same roast scored 1 and 2, so the scoring repeats only within a point. And weight loss, the other machine-independent check, does not follow the thermal dose here: the
lowest-thermal-dose roast lost the most weight (19.7%). We have not explained that; a weighing slip or a moisture difference
would both do it, and either is a reminder that two witnesses disagreeing is information.

With two coffees this is a starting point. A rank correlation across beans between where the clean cup begins and any bean
property needs roughly 14 beans to see a strong relation (0.7) and about 85 for a weak one (0.3) (`docs/research.md`).

## 6. What the thermal dose does not account for

- **Cup quality.** See section 5.
- **Probe placement.** Absolute values are tied to where the machine's probe sits; compare on one machine only. Section 4.5
  covers a constant offset, not a probe whose error depends on temperature.
- **Activation energy.** One value for all reactions, fixed at 105. Section 4.4 bounds how much the choice matters for
  ordering, not whether any single reaction behaves this way.
- **Moisture, density, age, crop.** Stored for each coffee and not used. Heat transfer theory says they change how fast the
  bean heats for a given input, not the thermal dose a given bean temperature curve adds up to, so they should matter for
  *predicting* a roast's thermal dose and for editing a curve (`docs/research.md`, heat transfer). Untested here.
- **A different machine.** The Kaleido M1 and any drum roaster would need their own check.
- **A single roaster.** One person's palate and one tasting brew.

## 7. The experiment that could falsify it

The central hypothesis is that, for one coffee on one machine, roasts with the same thermal dose give cups that cannot be
told apart, whatever the curve shape. Debona's result already leans against the strong form of this. The test, which the
curve-editing work in the roadmap makes possible:

1. Pick one coffee and two profiles that shape the roast differently (a faster, hotter first half against a slower one).
2. Use the `thermal-dose` command to choose levels that give the same *predicted* thermal dose on each, roast both, and keep
   the pair only if the *measured* thermal doses agree within the repeatability in 4.3.
3. Taste blind in a triangle test, repeated over several sessions and, if possible, by more than one taster.
4. Repeat for several coffees.

Reading the result: with 12 triangles, 8 correct identifications give a one-sided p of 0.019 against chance (one in three),
with 18 triangles 10 are needed, and with 24, 13. A failure to detect a difference is weak evidence of "no difference" with so
few triangles, so the pairs matched in thermal dose should be set beside a pair with deliberately different thermal doses, to
show the test can tell them apart at all.

Also worth running, in rising cost: repeat the same recipe several times and record the cup each time (this measures the
noise in the whole chain, which section 4.3 measures only for the machine); roast one coffee at 100 g and 150 g at the same
recipe; and roast the same coffee fresh and aged.

## 8. Reproducing this

- `npm run research`: the published-data sections (Bruno et al., Debona et al.) recomputed from the papers' own tables, plus
  the checks that need real logs.
- `KAFFELOGIC_DIR=<folder of .klog files> npm run research:sensitivity`: sections 4.2 to 4.6 on your own logs. It reads only,
  needs no roasted weight or bean name, and copies nothing. The logs in this write-up cannot be published; the script is how
  someone else checks the numbers on theirs.
- Tests: the arithmetic check (`test/thermalDose.test.ts`) and the engine's rules run in `npm test` with no real files.

## 9. What this changes in our own notes

Found while writing this; none is changed yet:

- `docs/research.md`, "Where 105 kJ/mol comes from": "ratios between roasts barely change across that range" should say
  it holds for roasts on one profile between 90 and 120, with the numbers from 4.4. The same sentence is in the comment
  on `THERMAL_DOSE` in `src/core/features.ts`.
- `docs/research.md`, validation 3, and the header comment of `src/adapters/kaffelogic/thermalDose.ts`: "5.3-18.5% above" is for
  nine roasts on three profiles. The offset is profile-specific and can be negative (4.6).
- `docs/research.md`, "Limits": "A 5 °C probe offset at 200 °C changes the thermal dose by about a third" is right for +5 °C
  (×1.29 to ×1.34) and about a quarter for −5 °C (×0.74 to ×0.77); it leaves the order of roasts unchanged.

## Sources

- Bruno M.J. et al. *A preliminary model to establish a digital twin for coffee roasting.* Sci Rep 16:15857 (2026).
  doi:10.1038/s41598-026-43923-9
- Debona D.G. et al. *Sensory analysis and mid-infrared spectroscopy for discriminating roasted specialty coffees.* Coffee
  Science 16:e161878 (2021). doi:10.25186/.v16i.1878
- The remaining sources are listed in `docs/research.md`.

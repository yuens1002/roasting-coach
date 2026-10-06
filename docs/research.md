# Research and validation

roasting-coach's advice is meant to be deterministic and explainable. That means every measure it
relies on should be grounded in published science and checked against real roast logs, not taken
on trust. This page records which research we use, what we computed from it, what held up, and
what didn't.

Every computation below is reproducible: `npm run research` (`scripts/research.ts`) recomputes the
published-data sections from the papers' own tables, and the sections that need real logs from
whatever Kaffelogic files are in your local library (`profiles/`, never committed).

## Thermal dose: the measure we adopted

**Definition.** Reaction rates in roasting follow the Arrhenius law, k = A·exp(−Ea/RT). A
reaction's progress over a roast is therefore proportional to the integral of exp(−Ea/RT(t)) over
the bean temperature curve. We express it as the number of **minutes at a constant 200 °C** that
would do the same chemistry, with Ea = 105 kJ/mol (`thermalDose` in `src/core/features.ts`).

**Why it matters.** End temperature and total time each describe one point of a roast; the dose
accounts for the whole curve. Because rates rise exponentially with temperature, *how fast* a roast
gets hot changes the chemistry as much as where it ends. The dose doesn't depend on button presses,
and it compares fairly across profiles and levels on one machine.

**Where 105 kJ/mol comes from.** Bruno et al. 2026 (below) fitted activation energies for 15
roasting reactions (caramelisation, Maillard, chlorogenic acid and trigonelline loss, and others);
most fall between 90 and 140 kJ/mol, around 100-110. Ratios between roasts barely change across
that range, so one value is enough to rank and compare roasts.

**Limits.** Absolute values depend on where the machine's probe sits, so compare roasts on one
machine, not across machines. A 5 °C probe offset at 200 °C changes the dose by about a third.

## Sources

### Bruno et al. 2026: the kinetic model (used)

Bruno M.J., Egidi N., Fatone L., Giacomini J., Maponi P., Sagratini G., Santanatoglia A.,
Trebović E. *A preliminary model to establish a digital twin for coffee roasting.* Scientific
Reports 16:15857 (2026). [doi:10.1038/s41598-026-43923-9](https://doi.org/10.1038/s41598-026-43923-9)
(open access, CC BY 4.0).

- **What it is:** a chemistry model of 13 compounds driven by the measured bean temperature curve,
  each reaction following the Arrhenius law. Calibrated against end-of-roast lab analyses of four
  coffees (two arabica, two robusta) from one industrial drum roaster.
- **What we use:** the Arrhenius framing and the scale of the fitted activation energies.
- **What we don't:** its per-compound predictions. The fits are weakly identified: two coffees came
  out with almost identical activation energies (109.92 vs 109.94, 104.96 vs 104.98...), many on
  round numbers, which suggests the optimiser barely moved from its starting guesses with only
  end-of-roast data. The authors call the model preliminary and plan measurements during the roast.
- **Note:** some online summaries of this paper describe model predictive control, core-temperature
  tracking and first-crack prediction. The paper contains none of these.

### Debona et al. 2021: fluid-bed roast profiles with cup scores (used for validation)

Debona D.G., Oliveira E.C.S., ten Caten C.S., Guarçoni R.C., Moreira T.R., Moreli A.P., Pereira
L.L. *Sensory analysis and mid-infrared spectroscopy for discriminating roasted specialty coffees.*
Coffee Science 16:e161878 (2021). [doi:10.25186/.v16i.1878](https://doi.org/10.25186/.v16i.1878)
(open access, CC BY 4.0).

Three temperature programs on an IKAWA Pro (a 50 g fluid-bed roaster, the same class as the
Kaffelogic Nano), all ending near 210 °C, with SCA cup scores for two arabicas. The closest
published analogue to the Nano we have found.

### Volatile-compound studies (direction only, full text not yet available)

- Debona D.G. et al. *Comprehensive evaluation of volatile compounds and sensory profiles of coffee
  throughout the roasting process.* Food Chemistry 478:143586 (2025).
  [doi:10.1016/j.foodchem.2025.143586](https://doi.org/10.1016/j.foodchem.2025.143586).
  Arabica and robusta sampled every minute through a commercial roast. From the abstract:
  aldehydes, anhydrides, ketones and furans went with good cup scores, alcohols and xanthines with
  poor ones; aldehydes are a *potential* indicator of the optimal roast point.
- Guo X., Cao B. *Unraveling the dynamic impact of roasting degree on the evolution of coffee aroma
  profiles.* Food Chemistry 517:149463 (2026).
  [doi:10.1016/j.foodchem.2026.149463](https://doi.org/10.1016/j.foodchem.2026.149463).
  From the abstract: as roasts get darker, fruity esters fall and roasty heterocyclic compounds
  rise; their panel scored the darkest roast highest, which is one panel's preference.

Both are paywalled. We use only their direction (darker: fewer fruity esters, more roasty
compounds), which fits the tasting chips: "brighter" or "fruitier" points to less dose, "more body"
or "roastier" to more. If the per-minute data and the roast curves become available, the plan is to
express their aroma peaks on the dose scale, which would transfer across roasters where "minute 9"
does not.

## Validation

### 1. A Nano roast against industrial roasts

A Robusta roast on the Nano at level 3 (10.6 min, drop 224.8 °C) has a dose of 11.6. Bruno et
al.'s two industrial robusta roasts (15 min, drop 228-230 °C) have 9.9 and 10.8: the Nano roast
did 6-19% *more* chemistry while being 4-5 minutes shorter and ending lower, because it heats much
faster early. Total time and drop temperature alone would have ranked these roasts the wrong way.
(The cross-machine comparison is rough; see the probe caveat above.)

### 2. Same end temperature, very different chemistry

| IKAWA profile (Debona 2021) | Time | End | Dose | SCA, 750 m | SCA, 1050 m |
|---|---|---|---|---|---|
| High temperature, short | 6:30 | 210 °C | 5.13 | 78.82 | 86.23 |
| Medium, medium | 8:00 | 210 °C | 2.83 | 77.81 | 86.62 |
| Low temperature, long | 10:00 | 208 °C | 3.44 | 78.84 | 85.37 |

The shortest roast did 80% more chemistry than the 8-minute one at the same end temperature, and
the longest wasn't the most developed. **Time is a poor measure of roast degree.** But the best cup
for the high-altitude coffee came from the *lowest* dose, so dose alone doesn't predict quality:
curve shape (time to 150 °C, Maillard and development times) matters too, and the best answer
depends on the bean. The score differences (at most 1.25 points) are close to cuppers' own
variability, so these are hypotheses, not rules.

### 3. Does a profile's curve predict the roast?

Comparing each real log with the profile it was roasted on, measured doses came out **6-12.5%
above** what the profile curve predicts:

| Roast | Measured | Curve predicts | Difference |
|---|---|---|---|
| Robusta, level 3.0 | 11.58 | 10.87 | +6.4% |
| 1500-2000m RTD, level 1.9 | 5.81 | 5.23 | +11.1% |
| 1500-2000m RTD, level 3.3 | 10.05 | 8.93 | +12.5% |

Good enough to rank levels and size a step. All three are above, and the two RTD roasts sit
together well above the Robusta one, so the offset may be per profile rather than one constant;
worth modelling once there are more logs. A synthetic log that tracks a curve exactly
matches its prediction to within 1% (an always-on test).

### 4. Level numbers are an uneven ruler

Computed from each stock profile's own curve, the chemistry added by a 0.4 level step varies a lot.
On most profiles, levels 3 to 4 are bunched in end temperature: on Robusta, 2.6 -> 3.0 adds about
15% dose but 3.0 -> 3.4 only about 3%; on 0-1200m Rest, 22% then 3.5%. The high-altitude RTD
profiles and the KL process profiles climb more evenly. So "one level step" means very different
things by profile and by position. roasting-coach decides a change in dose and converts it to a
level for the profile at hand (`dose` command; `levelForDose` in `src/adapters/kaffelogic/dose.ts`):
15% less than level 3.0 is level 2.5 on Robusta but 2.7 on 0-1200m Rest.

### 5. Development ratio matches the machine

Our development ratio, computed from the temperature trace and the first-crack press, matches the
Nano's own `development_percent` to three decimals on every real log checked (25.550 vs 25.5503;
36.722 vs 36.7216; 38.916 vs 38.916). A test checks this on every local log that carries the machine's figure.

## What this means for the rules

- Measure **how far** a roast went with the thermal dose, and **how** with curve-shape features;
  neither alone predicts the cup.
- Size changes in dose, then convert to a level for the specific profile.
- Learn per bean: the same change suits different beans differently (Debona 2021's altitude result).
- Tasting decides. Published panel preferences (Guo and Cao's darkest-roast preference) are
  context, not targets.
- Treat weight loss, a colour reading and the tasting as the independent checks. Anything computed
  from the same temperature log is another view of the same curve, not a second witness.

## Open questions

- Is the 6-12.5% curve-to-roast offset a property of each profile (the two RTD roasts agree), and
  how does it vary with batch size and ambient temperature?
- Where on the dose scale do aroma markers (aldehydes, esters) peak, across species and roasters?
  Needs the per-minute data from the volatile studies.
- Which curve-shape features, beyond dose, separate good cups from bad on the Nano?

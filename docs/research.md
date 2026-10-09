# Research and validation

roasting-coach's advice is meant to be deterministic and explainable. That means every measure it
relies on should be grounded in published science and checked against real roast logs, not taken
on trust. This page records which research we use, what we computed from it, what held up, and
what didn't.

Every computation below is reproducible: `npm run research` (`scripts/research.ts`) recomputes the
published-data sections from the papers' own tables, and the sections that need real logs from
whatever Kaffelogic files are in your local library (`profiles/`, never committed).

## Thermal dose: the measure we adopted

*Not the espresso dose.* In coffee, "dose" usually means the grams of ground coffee in the basket.
Here it means heat exposure over a roast, so this project always writes **thermal dose** in full
and never the bare word.

**Definition.** Reaction rates in roasting follow the Arrhenius law, k = A·exp(−Ea/RT). A
reaction's progress over a roast is therefore proportional to the integral of exp(−Ea/RT(t)) over
the bean temperature curve. We express it as the number of **minutes at a constant 200 °C** that
would do the same chemistry, with Ea = 105 kJ/mol (`thermalDose` in `src/core/features.ts`).

**Why it matters.** End temperature and total time each describe one point of a roast; the thermal dose
accounts for the whole curve. Because rates rise exponentially with temperature, *how fast* a roast
gets hot changes the chemistry as much as where it ends. The thermal dose doesn't depend on button presses,
and it compares fairly across profiles and levels on one machine.

**Where 105 kJ/mol comes from.** Bruno et al. 2026 (below) fitted activation energies for 15
roasting reactions (caramelisation, Maillard, chlorogenic acid and trigonelline loss, and others);
most fall between 90 and 140 kJ/mol, around 100-110. Ratios between roasts barely change across
that range, so one value is enough to rank and compare roasts.

**Limits.** Absolute values depend on where the machine's probe sits, so compare roasts on one
machine, not across machines. A 5 °C probe offset at 200 °C changes the thermal dose by about a third.

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
- **Also:** it takes the measured bean temperature curve as given, so it says nothing about how
  moisture or density shape that curve (see "Heat transfer" below).
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
compounds), which fits the tasting chips: "brighter" or "fruitier" points to less thermal dose, "more body"
or "roastier" to more. If the per-minute data and the roast curves become available, the plan is to
express their aroma peaks on the thermal dose scale, which would transfer across roasters where "minute 9"
does not.

## Heat transfer: how moisture and density shape the bean temperature

Added 2026-10-09 as groundwork for the curve-editing phase (`docs/ROADMAP.md`, Next, 3). The question:
what does the science say about green-bean moisture and density, and how do they bear on the
thermal dose a roast reaches? Sources were read in full where open access allowed; what could not be
read is listed at the end, so nothing below is quoted from a source we did not see.

**Short answer.** Moisture and density change how fast a bean heats for a given heat input. They do not
change the thermal dose that a given bean temperature curve adds up to: the thermal dose is computed from
the measured curve, so the effect of both is already inside it. They would matter for *predicting* a
roast's thermal dose from a profile before roasting, and for editing a curve, because they set how much
heat the early part of the roast must deliver.

### The energy balance (Bustos-Vanegas et al. 2025, used for its structure)

Bustos-Vanegas J.D., Martins M.A., Corrêa P.C., Baptestini F.M., de Oliveira G.H.H. *Modeling and
simulation of coffee bean heating during roasting: effect of heat generation.* Frontiers in Food
Science and Technology 5:1603783 (2025).
[doi:10.3389/frfst.2025.1603783](https://doi.org/10.3389/frfst.2025.1603783) (open access).

A lumped model of one arabica bean (no gradients inside the bean) fitted to measured temperatures for
hot air at 200, 220, 240, 260 and 280 °C over 10 minutes, with R² from 0.973 to 0.994. The bean's
temperature Tb follows

    rho V Cp dTb/dt = -h A (Tb - Ta)  -  rho V L dX/dt  +  rho V Qr

that is, heat from the air at Ta (through the coefficient h over the surface area A) goes into
(1) warming the bean, (2) evaporating water, where X is the moisture on a dry basis and L the latent
heat, and (3) the heat Qr the roasting reactions release. Moisture appears three times: in Cp, in the
evaporation term and in the drying rate; the drying rate is written
-dX/dt = 4.32e9 X² / dp² · exp(-9889 / (Tb + 273.2)), with dp the bean diameter. Density appears in
rho V, the bean's thermal mass. For a bean of fixed volume that is a plain consequence of the equation: more
mass takes more heat per degree. No paper below measured it.

- Starting moisture in the fit: 0.1296 kg/kg dry matter. Thermal conductivity used: 0.11 W/m/K.
- The authors report that leaving out the evaporation term overestimates the bean temperature once
  reactions start (from about 150 °C), and leaving out the reaction heat underestimates it.
- Property and kinetic constants (heat capacity, drying rate, reaction heat 232 kJ/kg dry matter,
  Ha/R = 5500 K) are taken from Schwartzberg (2002), which we have not read.

### Experiments on moisture

- **Vosloo J. *Heat and mass transfer model for a coffee roasting process.*** MEng thesis, North-West
  University (2017). [hdl:10394/26094](https://repository.nwu.ac.za/handle/10394/26094) (open access).
  Compares three published heat and mass models against drum-roaster runs, including beans wetted to
  higher moisture. From the abstract: first crack came at about 175 to 180 °C and second crack above
  200 °C, "consistently", so the roast degree could be roughly predicted from the temperature reached.
  All three models overestimated moisture loss, and two overestimated the roast profile more as the
  initial moisture rose. In the body, higher initial moisture gave a lower heating rate at the same
  start temperature, which it attributes to the extra heat needed to evaporate the water. One
  extraction of its tables gave 960 s versus 900 s to second crack for 12.7% versus 9.1% moisture at a
  170 °C start; we could not confirm that table verbatim, so treat the figures as unverified. Beans
  wetted for the experiments also swelled, and the larger surface heated them faster, which works
  against the evaporation cost.
- **Schenker S. (2000), ETH Zurich dissertation on hot-air roasting**, as cited by the 2025 paper
  above: low initial moisture gave a faster bean temperature rise, because less energy goes to
  evaporation. Not read directly.
- **Baggenstoss J. et al. *Roasting and aroma formation: effect of initial moisture content and steam
  treatment.*** J. Agric. Food Chem. 56:5847 (2008).
  [doi:10.1021/jf8003288](https://doi.org/10.1021/jf8003288). Green coffee at 5.10, 10.04 and 14.70 g
  water per 100 g was roasted light and dark in a 100 g fluid-bed roaster. From the abstract: colour,
  density, organic roast loss and odorant concentrations differed more between moistures at the light
  roast than at the dark one. Paywalled; the abstract does not say whether the heating program was
  held fixed, so it cannot separate a heat-transfer effect from a chemistry effect.

### Experiments and models on density

- Single-bean CFD (Chimia 67:291, 2013,
  [doi:10.2533/chimia.2013.291](https://doi.org/10.2533/chimia.2013.291), open access) models heat and
  mass transfer inside one bean in hot air and shows temperature and moisture varying through it. Its
  fit to a single bean's measured temperature is good, and it states that it ignores bean swelling and
  the moisture of the roasting air. A probe reads the bed, not the core, so the core can lag it; the
  paper's design implies that, but the abstract does not quantify it.
- A particle-tracking study in a pilot drum roaster
  ([Food Res. Int. 2022](https://doi.org/10.1016/j.foodres.2022.112253)) found bean density changes how
  the bean bed moves, so drum speed could tune conductive heat transfer for different densities. That
  is a drum roaster; the Nano is hot-air.
- The idea that dense, high-altitude beans need more energy early appears in industry write-ups
  (Kaffelogic's altitude profile bands assume it). We found no peer-reviewed measurement of it.

### Numbers worth keeping (computed here from the quoted equations)

- **Specific heat rises with moisture.** Schwartzberg's equation as quoted in Vosloo,
  Cp = (1.099 + 0.0070 (T − 273.15) + 5.0 X) / (1 + X) kJ/kg/K, gives 1.47 at X = 0.05, 1.72 at 0.13
  and 1.91 at 0.20 (at 28 °C).
- **Published conductivities disagree.** 0.11 W/m/K (2025 paper) against Hernandez (2002) as quoted in
  Vosloo, 0.356 + 0.139 X, which is 0.37 at X = 0.13. About a factor of three. The units of X in that
  correlation are not stated in what we read.
- **Different processes, different activation energies.** The drying rate above implies about
  82 kJ/mol; the reaction-heat term about 46 kJ/mol (Ha/R = 5500 K). Our thermal dose uses 105 kJ/mol
  for the roasting chemistry (Bruno et al. above). They describe different quantities.
- **Thermal dose is built at the hot end.** With Ea = 105 kJ/mol, one minute at 100 °C counts as 0.0008
  minutes at 200 °C, at 150 °C as 0.043, at 180 °C as 0.31, at 220 °C as 2.95. By the time the bean is hot
  enough to add much thermal dose, most of its water has gone (in the cited experiment moisture fell
  from 11.2% to about 1.0%, wet basis, over 300 s in air at 200 to 250 °C). Edits to the early curve
  therefore change timing and the length of the drying phase far more than they change the total.
- Bruno et al. take the measured bean temperature curve as given; they say nothing about how moisture
  or density shape that curve.

### What this means for curve editing (hypotheses, not rules)

1. **Wetter beans need more early heat to follow the same curve.** The energy balance and Vosloo agree
   on direction. How much, for a Nano, is not known; the machine's controller may absorb it, which
   would show as a difference between the curve it was asked for and the one it achieved.
2. **Holding total thermal dose fixed while moving it between phases (the idea in the roadmap) mostly
   means changing the hot end.** The early phase adds almost none, so an early-curve edit changes time
   and drying, not the thermal dose.
3. **The measurable link is the curve-to-roast gap.** Real roasts measured 6 to 12.5% above their
   profile's predicted thermal dose (validation 3 below). Moisture and density readings are candidate
   explanations. The intake already takes optional `moisturePct` and `densityGL`. After several beans
   with readings, the per-bean gap can be compared with them, along with drying time; one bean cannot.
4. **No density or moisture rule yet.** The direction for moisture is supported; for density it is not.
   Anything we ship should come from the roaster's own logs, not from this section.

### Not read, or not verifiable

- Baggenstoss 2008 and Hernández et al., *Analysis of the heat and mass transfer during coffee batch
  roasting*, J. Food Eng. 78:1141 (2007): paywalled or not tried; known here only from abstracts and
  citations.
- Schwartzberg (2002), the origin of the constants above; Fabbri et al. (2011) and Putranto and Chen
  (2012), which Vosloo cites for conductivity, density and heat capacity; Schenker (2000). Read these
  first when the curve-editing work starts.
- The 960 s versus 900 s figure from Vosloo's tables (see above).
- Trade-press claims about water activity and the Maillard reaction (rate said to peak near water
  activity 0.70) were not checked against a coffee measurement and are not used.

## Validation

### 1. A Nano roast against industrial roasts

A Robusta roast on the Nano at level 3 (10.6 min, drop 224.8 °C) has a thermal dose of 11.6. Bruno et
al.'s two industrial robusta roasts (15 min, drop 228-230 °C) have 9.9 and 10.8: the Nano roast
did 6-19% *more* chemistry while being 4-5 minutes shorter and ending lower, because it heats much
faster early. Total time and drop temperature alone would have ranked these roasts the wrong way.
(The cross-machine comparison is rough; see the probe caveat above.)

### 2. Same end temperature, very different chemistry

| IKAWA profile (Debona 2021) | Time | End | Thermal dose | SCA, 750 m | SCA, 1050 m |
|---|---|---|---|---|---|
| High temperature, short | 6:30 | 210 °C | 5.13 | 78.82 | 86.23 |
| Medium, medium | 8:00 | 210 °C | 2.83 | 77.81 | 86.62 |
| Low temperature, long | 10:00 | 208 °C | 3.44 | 78.84 | 85.37 |

The shortest roast did 80% more chemistry than the 8-minute one at the same end temperature, and
the longest wasn't the most developed. **Time is a poor measure of roast degree.** But the best cup
for the high-altitude coffee came from the *lowest* thermal dose, so thermal dose alone doesn't predict quality:
curve shape (time to 150 °C, Maillard and development times) matters too, and the best answer
depends on the bean. The score differences (at most 1.25 points) are close to cuppers' own
variability, so these are hypotheses, not rules.

### 3. Does a profile's curve predict the roast?

Comparing each real log with the profile it was roasted on, measured thermal doses came out **6-12.5%
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
15% thermal dose but 3.0 -> 3.4 only about 3%; on 0-1200m Rest, 22% then 3.5%. The high-altitude RTD
profiles and the KL process profiles climb more evenly. So "one level step" means very different
things by profile and by position. roasting-coach decides a change in thermal dose and converts it to a
level for the profile at hand (`thermal-dose` command; `levelForThermalDose` in `src/adapters/kaffelogic/thermalDose.ts`):
15% less than level 3.0 is level 2.5 on Robusta but 2.7 on 0-1200m Rest.

### 5. Development ratio matches the machine

Our development ratio, computed from the temperature trace and the first-crack press, matches the
Nano's own `development_percent` to three decimals on every real log checked (25.550 vs 25.5503;
36.722 vs 36.7216; 38.916 vs 38.916). A test checks this on every local log that carries the machine's figure.

## What this means for the rules

- Measure **how far** a roast went with the thermal dose, and **how** with curve-shape features;
  neither alone predicts the cup.
- Size changes in thermal dose, then convert to a level for the specific profile.
- Learn per bean: the same change suits different beans differently (Debona 2021's altitude result).
- Tasting decides. Published panel preferences (Guo and Cao's darkest-roast preference) are
  context, not targets.
- Treat weight loss, a colour reading and the tasting as the independent checks. Anything computed
  from the same temperature log is another view of the same curve, not a second witness.

## Open questions

- Is the 6-12.5% curve-to-roast offset a property of each profile (the two RTD roasts agree), and
  how does it vary with batch size and ambient temperature?
- Where on the thermal dose scale do aroma markers (aldehydes, esters) peak, across species and roasters?
  Needs the per-minute data from the volatile studies.
- Which curve-shape features, beyond thermal dose, separate good cups from bad on the Nano?
- Does the curve-to-roast gap track green-bean moisture or density, and does the Nano's controller
  absorb their effect on early heating? Needs several beans with readings ("Heat transfer" above).

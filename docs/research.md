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

### Alstrup et al. 2020: development time at one colour, with cup descriptions (direction only; abstract and summary read, not the full text)

Alstrup J., Petersen M.A., Larsen F.H., Münchow M. *The Effect of Roast Development Time Modulations on the Sensory Profile and Chemical
Composition of the Coffee Brew as Measured by NMR and DHS-GC–MS.* Beverages 6(4):70 (2020).
[doi:10.3390/beverages6040070](https://doi.org/10.3390/beverages6040070) (open access, CC BY). Read 2026-10-25 from the publisher's page:
the abstract and a machine-made summary of the results. **The full text has not been read**, so the figures below are as that summary gave them
and are not quoted from the paper's tables.

- **Design (summary):** one coffee roasted on four profiles that differ in development time, 90 s (fast), 143 s (medium), 266 s (slow) and
  390 s (baked), on a Probat Probatino 1 kg drum roaster, with roast colour held at Agtron 76 ± 1 (light). End temperatures fell as development
  lengthened, 204.1, 201.2, 198.4 and 191.1 °C. Sensory descriptive analysis, GC–MS and NMR. The summary's note that first crack came at about
  570 s was not checked and looks odd for a 1 kg drum roast; do not use it.
- **Finding (abstract, quoted):** "a short development time increases the fruity, sweet and acidic characteristics of the coffee, whereas a
  longer development time shifts the balance towards a more roasty, nutty, and bitter profile." The abstract does not mention chocolate; the
  summary lists "nutty+chocolate" among the long-development descriptors, which is unconfirmed until the full text is read.
- **Reach for this project:** light roast colour (Agtron 76), a drum roaster and one coffee. The Nano is hot air, and the bean here is roasted at
  Agtron 42 to 47. Development times of 255 to 265 s in bean 4's roasts are close to the paper's "slow" 266 s, but the colour and the machine differ, so
  the size of the effect on a Nano is not known. Its use is the direction: development time moves the cup along fruity and sweet, then nutty and
  roasty, then bitter, at one colour.
- **Companion paper, not read:** Münchow M., Alstrup J., Steen I., Giacalone D. *Roasting Conditions and Coffee Flavor: A Multi-Study Empirical
  Investigation.* Beverages 6(2):29 (2020), [doi:10.3390/beverages6020029](https://doi.org/10.3390/beverages6020029), listed in this paper's references.
- **Other development-time sources, not read:** Rao S., *The Coffee Roaster's Companion* (2014), whose blog post
  ([scottrao.com](https://www.scottrao.com/blog/2016/8/25/development-time-ratio), read) gives a development time ratio of 20 to 25% "for most roast levels", a rule of thumb that "can be broken", for medium and light-medium roasts, and says burner capacity against batch size can lower it; and Hoos R., *Modulating the Flavor Profile of Coffee* (2015), known here
  only from a review and forum posts. Neither is evidence for a Nano, and the roadmap's rule stands: no preset without a cited source for each number.

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

- Starting moisture in the fit: 0.1296 kg/kg dry matter. Thermal conductivity used: 0.11 W/m/K (taken from Fabbri et al. 2011).
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

- Single-bean CFD (*Modeling and Validation of Heat and Mass Transfer in Individual Coffee Beans during
  the Coffee Roasting Process Using Computational Fluid Dynamics (CFD)*, Chimia 67:291, 2013,
  [doi:10.2533/chimia.2013.291](https://doi.org/10.2533/chimia.2013.291), open access; body read via
  extraction) models heat and mass transfer inside one bean in hot air and shows temperature and moisture
  varying through it. Its fit to a single bean's measured temperature is good, and its limitations section
  says it ignores bean swelling and the moisture of the roasting air. A probe reads the bed, not the core, so the core can lag it; the
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
- **Published conductivities disagree.** 0.11 W/m/K (used by the 2025 paper, from Fabbri et al. 2011) against Hernandez (2002) as quoted in
  Vosloo, 0.356 + 0.139 X, which is 0.37 at X = 0.13. About a factor of three. The units of X in that
  correlation are not stated in what we read.
- **Different processes, different activation energies.** The drying rate above implies about
  82 kJ/mol; the reaction-heat term about 46 kJ/mol (Ha/R = 5500 K). Our thermal dose uses 105 kJ/mol
  for the roasting chemistry (Bruno et al. above). They describe different quantities.
- **Thermal dose is built at the hot end.** With Ea = 105 kJ/mol, one minute at 100 °C counts as 0.0008
  minutes at 200 °C, at 150 °C as 0.043, at 180 °C as 0.31, at 220 °C as 2.95. By the time the bean is hot
  enough to add much thermal dose, most of its water has gone (the single-bean CFD paper's table
  compares its simulation with Schenker's measurements for air at 200 to 250 °C: moisture fell from 11.2 to
  1.0 g per 100 g, wet basis, over 300 s measured, and to 2.0 simulated; read from an extraction of the PDF). Edits to the early curve
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
3. **The measurable link is the curve-to-roast gap.** Real roasts measured 5.3 to 18.5% above their
   profile's predicted thermal dose (validation 3 below). Moisture and density readings are candidate
   explanations. The intake already takes optional `moisturePct` and `densityGL`. After several beans
   with readings, the per-bean gap can be compared with them, along with drying time; one bean cannot.
4. **No density or moisture rule yet.** The direction for moisture is supported; for density it is not.
   Anything we ship should come from the roaster's own logs, not from this section.

### Using bean properties in the thermal dose target (design sketch, not built)

Thermal dose is computed from the bean-temperature curve alone (`thermalDose` in `src/core/features.ts`: time at each
temperature weighted by an Arrhenius factor, 105 kJ/mol, referenced to 200 °C). Moisture, density and altitude are not in it. If
they change the thermal dose a coffee needs to be clean, or how far a roast runs above its curve's prediction, the correction
belongs in one place: the target the level search aims at, as a separate adjustment, not in the thermal dose calculation.

```
target = reference × (1 + k_density × % denser than the reference bean + k_moisture × % wetter)
level  = levelForThermalDose(profile, target)      (built)
```

A worked example. The predicted thermal doses are real, from the stock 1500-2000m RTD file (level, end temperature, predicted
thermal dose: 3.0, 219.0 °C, 8.29; 3.1, 219.3 °C, 8.50; 3.2, 219.6 °C, 8.71; 3.3, 219.9 °C, 8.93; 3.4, 220.2 °C, 9.18). The bean
values and the coefficient are invented. Reference bean A: 720 g/L, first clean roast at level 3.1 (8.50). New bean B: 778 g/L,
8% denser. With k_density = 0.5 (each +1% density needs +0.5% more thermal dose), the target is 8.50 × (1 + 0.5 × 8%) = 8.84, and
the nearest level is 3.3 (predicted 8.93, about 1% above the target, inside the 3% tolerance) instead of the 3.1 the colour target alone
gives. With k = 0 the target is 8.50 and nothing changes.

What it would take, and what is missing:

- **Data.** The predicted thermal dose of each bean's first clean roast (roast quality 3 or more and no under or over word in the tasting; a stored tasting where the two disagree is left out), beside its properties. One bean is
  recorded so far, with moisture and no density or altitude, so no coefficient can be fitted. Beans needed to see a link at 80%
  power and p < 0.05: about 10 for a correlation of 0.8, 14 for 0.7, 30 for 0.5 and 85 for 0.3 (`n = ((1.96 + 0.84) / atanh r)² + 3`;
  a calculation, not a measurement).
- **Meters.** Altitude is on the bag. Moisture and density need a moisture meter and a way to weigh a known volume.
- **Research.** The published support is thin: Debona et al. 2021 (two coffees, the high-altitude one's best cup came from the
  lowest thermal dose of three programs, a difference within cuppers' variability) and industry write-ups that dense,
  high-altitude beans need more energy early, which Kaffelogic's altitude bands assume and which has no peer-reviewed measurement
  that we found. The hypotheses above (moisture changes drying timing far more than the total; density is weaker) are structure,
  not numbers for a Nano.
- **One roaster, one machine.** Thermal dose is fair across profiles and levels on one machine, never across machines, so a
  fitted coefficient would belong to one roaster's roasts on one machine.

If a link shows, the coefficient is data of the same kind as the step sizes (the roaster's calibration, shown and changeable), off
until the roaster's beans support it. The properties could also move a phase boundary in a curve edit (how long drying lasts),
which is not total heat and cannot be sketched until edits exist.

### What the curve nodes do, from two real logs (roadmap Next, 3, step 1; measured 2026-10-25)

Logs `log0105` (level 3) and `log0106` (level 2.6), both on `[KL] Classic` (the body of `1200-1500m RTD`), bean 4. Made with a throwaway script
over `parseKlog`/`evalCurve`; nothing is shipped.

- **The curve is seven Bezier nodes** of requested bean temperature against time (the node values are Kaffelogic's profile and are not
  copied here). The last node's out-handle is zero and `evalCurve` continues in a straight line past it, so from 300 s (199 °C) the
  request is one slope, 5.92 °C/min. **The level does not change the curve: it only picks the end temperature (`roast_levels`) where
  the roast stops**, 227 °C at level 3 and 225 °C at 2.6. Everything after first crack is that one straight climb to the end temperature.
- **The machine follows it.** Bean temperature runs 5 to 13 °C below the request in the first two minutes (the charge), is within 4 °C
  from 150 s, and between −0.5 and +2.7 °C of it from 210 s to the end, in both logs. First crack came at 201.4 °C (298 s) and 200.8 °C
  (298.5 s), the same temperature at two levels, as the curve before it is the same.
- **The achieved rate of rise after first crack is noisy (2 to 9 °C/min) around the requested 5.9**; the average over the stretch is
  what matters, and it matched.
- **Development is the climb from first crack to the end temperature.** On this curve it is set by two numbers, the slope after first
  crack and the end temperature: 4.4 min at 5.9 °C/min over 25 °C. Not read: what `roast_end_by_time_ratio` (0.333 in these logs) and
  `roast_end_reason` (0) do; the fan curve (14,700 falling to about 13,200 rpm); the zones (all zero here).
- **A held-thermal-dose family on this curve, computed from the curve's own prediction (a calculation, not a roast).** Replace the straight
  climb after 300 s by another slope and find the end temperature whose predicted thermal dose equals that of the stock curve at level 2.6
  (10.80; the roasts measured 8% above: 11.72). Pre-crack nodes and the time of first crack are unchanged. Slope (°C/min), end temperature
  (°C), first crack to end (s), roast time (s): 8 / 229.6 / 221 / 530; 6 (stock) / 225.0 / 255 / 564; 5 / 222.7 / 276 / 585; 4 / 219.8 / 303 /
  612; 3 / 216.3 / 338 / 647. The same shape holds at the thermal dose of levels 2.8 and 3.0. A flatter climb holds the thermal dose with a lower end
  temperature and a longer development; a steeper one with a higher end temperature and a shorter one. **Open, and the first
  question for a real roast: whether roast colour follows the end temperature (as Kaffelogic's levels do) or the thermal dose.** The two
  readings (42.5 at 227 °C, 47.2 at 225 °C, a 2 °C difference giving 4.7 Agtron) cannot tell.
- The early nodes (before 300 s) move time without moving the thermal dose (above: the thermal dose is built at the hot end), so lengthening the
  Maillard stretch is a second, nearly free, edit at held thermal dose. Not computed here.

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

Comparing each real log with the profile it was roasted on, measured thermal doses came out **5.3-18.5%
above** what the profile curve predicts (nine real logs, three profiles, 2026-10-11):

| Roast | Measured | Curve predicts | Difference | Mean overshoot in development |
|---|---|---|---|---|
| Robusta, level 3.0 | 11.58 | 10.87 | +6.4% | +1.2 °C |
| Robusta, level 2.7 | 10.43 | 9.79 | +6.5% | +1.2 °C |
| Robusta, level 2.4 | 9.27 | 8.81 | +5.3% | +1.0 °C |
| Robusta, level 2.1 | 8.46 | 7.91 | +7.0% | +1.3 °C |
| 1500-2000m RTD, level 1.9 | 5.81 | 5.23 | +11.1% | +3.5 °C |
| 1500-2000m RTD, level 3.3 | 10.05 | 8.93 | +12.5% | +3.3 °C |
| 2000-2700m RTD, level 1.7 | 5.00 | 4.58 | +9.1% | +1.9 °C |
| 2000-2700m RTD, level 2.0 | 5.82 | 5.33 | +9.3% | +2.0 °C |
| 2000-2700m RTD, level 2.5 | 7.97 | 6.73 | +18.5% | +3.3 °C |

The overshoot is the mean of the bean temperature minus the profile's, from first crack to the end of the roast. Every roast ran
above its profile in development (92-100% of the samples) and, after the first minute, a little below it before first crack (a mean
of 0.5-1.3 °C), at batch sizes of 100, 110, 120 and 150 g. The offsets were larger where the machine ran further above the profile:
ranked by overshoot, the nine roasts rank almost as they do by offset (rank correlation about 0.95). One roast breaks the pattern:
the 1500-2000m RTD level 1.9 roast had the largest overshoot (+3.5 °C) and a middle offset (+11.1%). Within Robusta the four
overshoots differ by 0.24 °C, which is the probe's resolution (0.25 °C steps), so those four say nothing about a relation inside
one profile. The offset also differs by profile: 3.3 °C of overshoot gave +12.5% on 1500-2000m RTD and +18.5% on 2000-2700m RTD.
Each batch size comes with one profile in these logs (150 g Robusta, 110 and 120 g 1500-2000m RTD, 100 g 2000-2700m RTD), so they
cannot say whether batch size changes how large the overshoot is.

Good enough to rank levels and size a step between neighbouring levels: on 2000-2700m RTD a step from level 2.0 to 1.7 was
predicted at -14% and measured at -14%. It is not good enough across a wider step: from level 2.0 to 2.5 the curve predicts +26%
and the roasts measured +37%, where the longer development also ran further above the profile. A synthetic log that tracks a curve
exactly matches its prediction to within 1% (an always-on test).

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

## Roast colour bands

The roast colour wording (docs/RULES.md, "The first level to try") reads the Agtron scale as bands of ten, each named by its
darker edge (medium 55 to 65, dark 35 to 45), after a roast-level chart credited to LeBrew's lab ("The above data results are
from LEBREW lab"): one lab's readings on one meter, with a column of common names and a column of traditional roast names. No
URL or date was kept with the image the maintainer shared; add them here when found. Other meters read a little differently, and
nothing here ties a Kaffelogic level to an Agtron number: that tie is our reading of the words in the profile files.

## Open questions

- Is the 5.3-18.5% curve-to-roast offset a property of each profile, or of the overshoot in development (which was larger in
  longer developments and differs by profile)? Batch size (100, 120 and 150 g) is tied to the profile in the logs so far, so
  how it varies with batch size, and with ambient temperature, is not separated.
- Where on the thermal dose scale do aroma markers (aldehydes, esters) peak, across species and roasters?
  Needs the per-minute data from the volatile studies.
- Which curve-shape features, beyond thermal dose, separate good cups from bad on the Nano?
- Does the curve-to-roast gap track green-bean moisture or density, and does the Nano's controller
  absorb their effect on early heating? Needs several beans with readings ("Heat transfer" above).

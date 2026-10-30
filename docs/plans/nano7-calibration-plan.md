# Nano 7 calibration: dial-in formula from measured roasts: Plan

Branch: `feat/nano7-calibration`
Source: [ROADMAP.md](../ROADMAP.md), Next item 6 (planned 2026-10-30)
ACs: [nano7-calibration-ACs.md](nano7-calibration-ACs.md)

> **Status of this document:** a draft for the roaster's approval (Phase 1). Every number marked *proposed* in "Acceptance
> thresholds" is a decision for the roaster, not a finding. This repo has not opted into `/agentic-workflow` (no
> `verification-status.json`, no gate scripts), so the plan and ACs use the shared format for structure only and Gate 1
> is checked by hand (AC-COV-1).
>
> **Public repo rule:** this plan names beans by slot (B1 to B9), never by name, lot, invoice or log file. The map from
> slot to bean lives in `fixtures/private/` (git-ignored). Results enter the repo as derived numbers only.

## Summary

Build, from this roaster's own Nano 7 roasts, the production knowledge for one machine: for every bean the store offers, a **bean
card** that names the reference profile (a stock profile or an edited curve), the gold-standard level, and the exact step to dial for each of
the four levels sold; and a formula that makes the card cheap to produce for the next bean. This is production work on a given machine,
not research: the outputs are cards and a procedure, and the formula exists only to produce them with fewer roasts. **The aim is one profile file per
bean for every batch size** (the 50.4 g sample and the 151.2 g bag), the sizes differing only in the level dialled in. Whether one profile can hold both sizes within the
colour band is not known; Stage 1b tests it first (T14) and the plan says what happens if it cannot. The four things the store sells: a customer picks one of four
roast levels (City 75, City+ 65, Full City 55, Full City+ 45 on the Agtron scale), and each bean has one gold-standard
level (the one that cups best) used as the reference for quality control of the other three. The formula is a
data-built production tool for one machine, not a fit of any theory (thermal dose is a candidate input, kept only if it
earns its place).

**A new bean costs one roast day and one cupping session** (G9). Once the machine is calibrated, the best way to roast a given bean is decided from one
session: no second tasting to settle a tie, to try a curve edit or to re-check a level. What makes that one session trustworthy is paid for once, in the machine layer.

## Two layers: the machine, then the bean

The calibration is two things done at different times, and the plan keeps them apart so that a new bean never pays for the machine again.

| Layer | What it answers | Stages | Result | Done when | Redone |
|-------|-----------------|--------|--------|-----------|--------|
| **Machine** (with its instruments: the colour meter and the roaster's cupping) | How closely does this machine, meter and palate repeat; how does it follow one profile at 50.4 g and at 151.2 g; how big is the colour band | 0 (meter), 1a (spread, scoring noise), 1b (size bridge), and the shared size step if T6 holds | The **machine card**: tracking by size, **B**, **N**, meter spread, whether one profile holds both sizes (T14), the size step | T2, T3, T4 and T14 pass (Day 4), and T6 says whether the size step belongs to the machine or to each bean | On a schedule and after service, with a control bean (T15) |
| **Bean** | What profile, gold level and steps does this bean need | 2, 2c, 3, 3b, 3c, 4, 5, then the production recipe | The **bean card** (P1 to P8) | Its ladder roasted on one day and cupped in one session (G9), then its first production batches read by colour | Per bean; again if its green changes a lot |

The machine layer decides what the bean layer may assume. If T14 fails, the bean layer runs with sibling profiles; if T6 fails, the size step is a bean-layer number
and not a machine constant. Stages 2 to 5 use beans partly to find out which of those it is, which is why the machine card is issued twice: a first time at the Day 4
gate, and finally after Stage 3 (T6).

Because a bean gets one cupping session, the machine layer must carry what a second session would otherwise check: that the 50.4 g cup predicts the bag (T13),
that the size step holds across beans (T6), and the scoring noise **N** that decides when two levels really differ (T4). The bean layer spends none of that again; it reads it.

## Current State

What exists and is reused, not rebuilt:

- `selectStartingProfile` and `levelForAgtron` ([startingProfiles.ts](../../src/adapters/kaffelogic/startingProfiles.ts)): the
  profile pick is by species, decaf, process and altitude band; the level for an Agtron target comes from the roaster's
  colour readings on that profile (`fitColourLine`, [roastColour.ts](../../src/core/roastColour.ts)) or from the profile's
  labelled levels. **Neither knows the batch size.** A reading from a 50 g roast and one from a 150 g roast are fitted as the
  same line.
- Roast quality 1 to 5 anchored to defects (`QUALITY_ANCHORS`, [intake.ts](../../src/core/intake.ts)), the clean-zone report,
  the colour reading and its method (`meter` or `card`), batch size in the log (`batchGrams`), moisture and density as optional
  intake answers that no rule reads.
- The roaster's own rule settings and taste words ([core/calibration.ts](../../src/core/calibration.ts)). **That file is about
  rule settings.** New code in this plan is named `dialIn*` so `calibration` keeps one meaning.
- Measured so far (derived numbers, from the roaster's logs): the machine scales fan and power by one multiplier of the batch size
  (1.0 at 120 g; 0.7744 at 50 g; 1.0701 at 150 g); the offset of measured thermal dose from the curve's prediction depends
  mostly on the profile (about -22% to +36% across profiles) and by up to about 8 points on batch size on some; the earlier
  repeat spread (11 groups, median 1.5%, worst 7.1%) was not controlled. These are why the plan measures before it builds.
- Measured 2026-10-30 from 92 of the roaster's logs (derived numbers): the bean temperature follows the profile curve (from 150 s to the peak) within a mean
  2.0 to 2.5 °C at 50 to 160 g, with the 95th percentile at 4 to 5.5 °C, and within 4.1 °C at 200 g (6 logs); it sits on average 2.0 °C below the curve at 50 to 60 g
  and 0.6 to 1.0 °C below at 70 to 160 g. For the same profile and level the time to the peak agreed within about 6% across sizes in most pairs, with exceptions. So the
  machine does hold one curve across sizes to first order, as the roaster expects; whether that is tight enough is a question of tolerance, below.

## What good means

Every roast, level and formula is judged against these definitions. Nothing here is a taste preference: a defect-free roast
at the colour asked for, whose cup matches what the importer says that origin should taste like.

| # | Term | Definition |
|---|------|------------|
| G1 | **Hit** | The colour reading (ground coffee, one meter, one method) is within the band **B** of the level's target (75, 65, 55 or 45). |
| G2 | **Clean** | Roast quality 3 or better with no under or over taste word: the definition the clean-zone report already uses. |
| G3 | **Good roast** | Hit and Clean. |
| G4 | **Flavour** | A 1 to 5 score for how closely the cup matches the importer's flavour map for that origin, the mean of the 3 cups of one roast, tasted after 1 day of rest. Separate from roast quality; no rule reads it; not a liking score. The roaster does not score on the SCA protocol; an importer's cupping score for a lot may be stored as a reference value with its source, never as the roaster's score. |
| G5 | **Reference (gold) level** | Per bean, among the levels that are Good roasts, the one with the highest flavour. If the top two are closer than the scoring noise **N**, there is no unique reference and the roaster chooses between those two in the same session, and the record says `basis: roaster` (no re-cup: a second tasting is a second session, G9). |
| G6 | **Sellable level** | A Good roast whose flavour is at least the floor **F**. Below it, the bean is not offered at that level. |
| G7 | **QC pass** (any production roast at a level) | Good roast, and flavour no more than **N** above the reference's: a level that outscores the gold standard means the reference was wrong and is re-picked, not passed. |
| G8 | **Formula good** | See "Acceptance thresholds" T6 to T9: it predicts the dial-in of a bean it has not seen, closer than the method in the code today. |
| G9 | **One session** | The best way to roast a given bean is decided from exactly one cupping session: the ladder is roasted on one day so every roast rests the same time, and every cup behind the bean's gold level is tasted on one date (24 hours plus or minus 6 after roasting; a Rest profile once, on its rest day). A tie, a missed level or an edit that would need another tasting is not settled by one: it is recorded on the card as an extra session, so the cost is measured and not hidden. |

### What good means once this ships (production)

These are the claims the feature makes, each measured before it ships (the ACs say how) and checked again by every production batch after it.

| # | After ship, this is true | Measured by |
|---|--------------------------|-------------|
| P1 | **Every bean offered has a bean card**: its reference profile (the stock profile, or the edited curve if an edit beat it, as a profile file name), its gold level, and for each of the four sold levels the level to dial, the step from the gold level, the end temperature, the expected colour and **B**. The card is derived from the records (like the clean-zone report), not typed. | D12 `card`; AC-RUN-15 |
| P2 | **The card is honest about its basis**: each level says whether it was measured at 151.2 g or translated from 50.4 g, and whether a production batch has confirmed it. | The card; AC-FN-21 |
| P3 | **Roasting any bean on its reference profile at a card level is a Good roast the first time** (colour within **B** of 75, 65, 55 or 45, and Clean). For a new bean the formula gives a first prediction; the card is what the ladder and one cupping turn it into. | T7, T8; first production batch |
| P4 | **The step is exact enough to use**: the step from the gold level is quoted at a resolution whose colour effect is at most half of **B** on that profile (T10), and the card states that resolution. | AC-FN-23; AC-RUN-15 |
| P5 | **The gold standard is the benchmark**: a production roast at any level is checked against the bean's reference roast (G7), and two misses on the same side in a row re-fit that bean's step. | D19; `card` shows production batches read and hits |
| P6 | **A new bean costs a known number of roasts**: measure, the formula's prediction, a ladder of 5 roasts at 50.4 g on one day, one cupping session the next day, then the first production batch per level confirms by colour. The card records the roasts and the cupping sessions it took, and shows any session beyond the first as extra. | D19; AC-DOC-3 |
| P7 | **The sample is the bag in small**: a 50.4 g sample roast and a 151.2 g bag roast of the same bean and level are the same colour (within **B**) and cup the same (within **N**), so a customer who likes the sample gets what they tasted. The sample card is direct (the ladder is roasted at 50.4 g); the bag card is the translated and confirmed one. | T13; AC-RUN-17 |
| P8 | **One profile, both sizes, if the tolerance allows**: when Stage 1b shows one profile can hold both sizes (T14), the card names exactly one profile file and the sample and the bag are roasted from it, differing only in the level to dial (the translation), shown on the card; where the difference is within the step resolution (T10) the card says "same level at both sizes". When it cannot, the card names two sibling profiles, a sample profile and a bag profile with the same parent, says why, and each is calibrated on its own size. An edited reference profile is accepted only after it has been shown at the sizes the card serves. | T12, T13, T14; AC-FN-21, AC-FN-24, AC-RUN-9, AC-RUN-16, AC-RUN-18 |
| P9 | **The machine is current**: a machine card exists (tracking by batch size, **B**, **N**, meter spread, T14, the size step, its date), and a control-bean re-check on a schedule or after service shows the machine still sits within the card (T15); if not, bean cards that depend on it are flagged, not silently used. | T15; AC-FN-27, AC-FN-28, AC-DOC-7 |
| P10 | **One session decides a bean**: from its first ladder roast to its card a bean costs one roast day and one cupping session (G9). Flavour at full size is not tasted again per bean, because the machine layer showed once that the sample cups like the bag (T13) and that the size step holds (T6). A profile edit is an opt-in extra session, never needed to finish a card. | T16; AC-FN-29, AC-RUN-19, AC-DOC-3 |

### Acceptance thresholds (*proposed*; the roaster approves or changes each at plan approval)

Thresholds are data in one module (`dialInSpec.ts`), not literals in the functions that use them.

| # | Threshold | Proposed value | If it fails |
|---|-----------|----------------|-------------|
| T1 | Colour band **B** | Provisionally ±3 Agtron; final = 2 x the SD of colour across the Stage 1a repeats, kept between ±2 and ±4 (targets are 10 apart, so ±4 leaves a 2-point gap) | n/a (it is set by T3) |
| T2 | Meter repeatability | SD of 5 readings of one ground sample at most 1.0 | The meter or grind, not the machine, limits the ladder: fix the method first |
| T3 | Machine spread | SD of colour across 6 identical 50.4 g roasts at most 2.0 | **Stop.** The machine varies more than the ladder's resolution; re-plan (wider spacing, or find the cause) before Stage 2 |
| T4 | Scoring noise **N** | SD of flavour across the same 6 roasts, cupped blind, at most 0.5 | Flavour cannot separate levels: every reference is the roaster's decision (`basis: roaster`), and G5 says so |
| T5 | Floor **F** | Flavour 3 | n/a (a decision, not a measurement) |
| T6 | Translation | Full-size (151.2 g) reference-level roast within **B** of the colour predicted from its 50.4 g ladder for at least 6 of the 8 calibration beans | The 50 g to full-batch step is per bean, not shared: Stage 3 data becomes each bean's own and the formula says so |
| T7 | Beats the code today | Leave-one-bean-out mean absolute colour error of the new ladder is lower than `levelForAgtron` as it is now, on the same roasts | The change is not shipped |
| T8 | Held-out bean | At 151.2 g, at least 3 of 4 levels are Good roasts predicted from its measurements before roasting, none misses by more than 2 x **B**, and the flavour is at least **F** at each level offered (4 roasts: a smoke test, not a statistic; T7 carries the statistics) | The formula is not relied on; the report says which part missed |
| T9 | Profile choice from density and moisture | Ships as code only if it picks the profile that cupped better on every bean compared (3 of 3) and the roaster approves; otherwise the altitude and process rule stays and the density and moisture are kept for a later round (the earlier sample-size estimate: about 14 beans for a strong link) | The finding "no evidence yet" is a valid result |
| T10 | Step resolution | The step quoted on the card changes the predicted colour by at most B/2 on that profile and level. On the stock profiles' labelled levels (an approximation, not a measurement) 10 Agtron points are only 0.3 to 0.5 level apart at the light end and 0.9 to 1.7 in the middle, so one fixed step in level numbers (such as 0.5) is wider than the whole 75 to 65 gap on most profiles; the card quotes level to the machine's 0.1 grid and the end temperature, and says the resolution it holds | A level or two cannot be told apart on that profile: the card says "not resolvable at this spacing" instead of a step |
| T11 | Gold level by default | A default gold level (by process or density) ships only if it matches the cupped gold level for at least 7 of 8 calibration beans, or is within one adjacent level on all of them; otherwise gold is found per bean by one cupping (the ladder's four roasts) | The procedure keeps one cupping per new bean; the finding "gold varies by bean" is a result |
| T12 | Edited curve as reference | An edited curve replaces the unedited profile for a bean only if both edited repeats are Good roasts, the edited flavour beats the unedited gold roast's by more than **N**, and all four levels stay reachable, **and the edit's reference level roasted at 151.2 g is a Good roast whose flavour is within N of its 50.4 g roast** (one profile serves both sizes) | The unedited profile stays and the edit is recorded as tried |
| T13 | Sample matches bag | For the reference level of each of two beans, a 50.4 g roast and a 151.2 g roast made the same day at the card's settings differ in colour by at most **B** and in blind flavour by at most **N** | The sample is not representative of the bag: the card says so, and the sample is roasted to the translated bag-equivalent colour instead, or the sample's claim is dropped from the store |
| T14 | One profile can hold both sizes | From Stage 1b (one bean, the profile's three levels near 75, 60 and 45, at each size): after the best single constant shift of end temperature between the sizes, the two sizes' colour-against-end-temperature lines differ by at most **B**/2 at every target colour from 75 to 45 | **Stop before Stage 2.** One profile cannot serve both sizes within **B**. The roaster chooses (open decision 11): first, sibling profiles (a sample profile made from the bag profile by a fan or heat edit, re-tested on three 50.4 g roasts); then a different sample size or a wider **B** for the sample |
| T15 | Machine drift | A control bean (a reserved lot, stored sealed, its green moisture noted each time) is roasted at the card's reference setting, 3 roasts at 50.4 g and 1 at 151.2 g, after any service or cleaning and every 4 weeks. The check flags drift when the mean colour moves from the card's by more than **B**/2, or the spread of the 3 exceeds the T3 limit | The machine card is stale: bean cards that rest on it are marked unconfirmed until the machine is recalibrated (Stages 0, 1a and 1b again) |
| T16 | One session per bean | For at least 7 of the 8 calibration beans, the Stage 2 ladder (5 roasts at 50.4 g on one day) and one cupping session of its levels give a bean card with a gold level (G5) and its sold levels (G6), with no second tasting; the held-out bean's card rests on its single Stage 4 session | The recipe needs a second session for too many beans: the ladder (roasts per day, the correction roast, the colour prediction) or the scoring noise is the cause, and the report says which before the recipe is shipped as one session |

## Approach

The four formulas, and how each is decided:

1. **Which default profile for a bean (density and moisture).** Today the pick is by altitude band, process and species.
   Stage 0 measures density and moisture of every bean; Stage 2c roasts the reference level on a second candidate profile for three
   beans and cups both. T9 decides whether density and moisture add anything. Expected honest outcome with 9 beans: a recorded
   hypothesis, not a rule. The plan does not assume otherwise.
2. **The reference profile, edited or not.** The reference profile of a bean is the profile its gold roast is made on. Steps:
   (R1) start on the profile today's rule picks (or the T9 rule if it shipped) and roast the four-level ladder at 50.4 g; (R2) cup, pick the gold
   level (G5); (R3) the unedited profile is the reference when its gold roast is a Good roast, its flavour is at least **F**, all four sold
   levels are reachable on it (the KL profiles, for instance, name no level as dark as 55 or 45, so a bean on one starts on an altitude profile
   instead, as the code already does), and the roaster does not ask for an edit; (R4) otherwise the roaster chooses one edit with `profile:edit`
   (slope after first crack, `reach` retime or `through`), the tool previews it at the thermal dose held within 3%, writes it (never overwriting)
   and records it as a version with the unedited one as its parent and the reason; (R5) load the file in Studio and compare with its base before
   roasting; (R6) roast the edit twice at the level whose predicted thermal dose matches the gold roast's, plus the unedited gold roast again the
   same day, all at 50.4 g, and cup the three blind; (R7) T12 decides whether the edit becomes the reference; (R8) if it does, the ladder is
   roasted again on the edited profile (the edit moves the colour-to-level map) and gold is re-picked; (R9) the card is issued. At most 3 edits are
   tried per bean. The tool never chooses the direction of an edit (no evidence yet, a decision already made); it applies the T12 rule to whichever
   edit the roaster made and records every edit, adopted or not, as an experiment. An edited curve has never been roasted on this machine,
   which is why Stage 5 proves the procedure on two beans before it is promised for all. **R4 onward is a second tasting by construction** (an edit is chosen after the gold level
   is cupped), so it is outside the one-session budget (G9): it is opt-in per bean, shown on the card as an extra session, and no card needs it to be finished. R1 to R3 are the whole of the default path.
3. **The 4-level ladder per bean and the 50 g to 151.2 g translation.** Per bean, find the level of each of the four colour
   targets at 50.4 g (about 5 roasts); translate to the full batch with a step fitted from Stages 1 to 3 (shared across beans if T6
   holds, per bean if not); confirm by the first production roast at each level. The card quotes each level's step from the gold level at the
   resolution T10 allows (the machine's 0.1 grid, with the end temperature), not a fixed half-level. The roaster's reading, which the logs support to first order, is the leading hypothesis (H1): a profile is a bean-temperature curve, the machine closes the loop and
   supplies the heat to hold it, so the fan speed at each point is already accounted for and a profile should work at any batch size the machine allows. What could
   still break it is tolerance. On the stock profiles' labelled levels (an approximation) 10 Agtron points are as little as 1.5 °C of end temperature apart at the light end,
   so a bias of 1 to 2 °C between sizes (the 50 to 60 g logs run about 1 °C lower against the curve than the others) or a different lag of the probe in a small batch could
   be 3 to 6 Agtron points, the size of the colour band. Whether one profile file can serve both sizes is **tested first** (T14, Stage 1b): the machine's own scaling of fan and
   power by batch size may not be enough to keep the colour-against-level line parallel across sizes. In the roaster's logs the fan and power multipliers are always the same number
   (one multiplier scales the whole fan curve and the heat together, never the fan alone), the first fan reading of a log equals the profile's start speed times that
   multiplier, and the same dialled size carries different multipliers in different logs (100 g reads 0.942, 0.953 and 1.000), so the scaling actually applied is
   not fixed by the dialled size. A fan curve of its own per level is not something the profile file can hold (levels only set end temperatures). If it holds, a bean whose curve works at 50.4 g but gives
   no Good roast at any level at 151.2 g is a finding about the curve, handled by the reference-profile steps below. If it does not hold, the card carries two sibling
   profiles (the fan curve, which the machine scales with batch size, is the first lever to try: D23). A consequence for the advice
   engine: a version is a profile plus a level, so the same profile at the two sizes is two versions with different levels; the engine must not count that
   difference as a level change or compare roasts of different batch sizes (D16). That a 50 g roast predicts a
   full batch is **a hypothesis this plan tests, not an assumption**: the machine scales fan and power by the batch size, but 50 g is its lowest setting and below
   the range where that scaling was seen to be about linear (above about 80 g), the colour reached at one level moved with batch size in the earlier logs
   (level 2.6 at 100 g looked like 2.8 at 50 g), and the offset of measured thermal dose from the curve moved by up to about 8 points with batch size on some profiles.
4. **What to do per bean in production** (`docs/bean-onboarding.md`), in one roast day and one cupping session (G9): (a) measure and read the formula's prediction
   (no roast, no cup); (b) roast the ladder on one day at 50.4 g, the four levels then one correction roast for a level that missed its colour, so every roast rests the
   same time; (c) cup them all in one session, 4 levels x 3 cups, blind, and pick the gold level (G5), a tie going to the roaster in that session; the card is issued;
   (d) the first production batch at each level at 151.2 g is read by colour and, if outside **B**, corrected once by the measured error and recorded. It is not cupped
   again for flavour at full size: that the sample cups like the bag is shown once, for the machine, by T13 and T6. A level whose colour is still missed after the
   correction is not cupped; the card says it was not reached, and reaching it is an extra session.

Layering (SDK = shape, platform = data, store = presentation, here: core = machine-independent, adapter = Nano 7): batch
translation and the ladder are Nano 7 adapter code (they read levels, end temperatures and the log's batch size); scoring statistics,
the reference pick and QC are core code (a roast, a colour and a score, no machine). The coefficients are **fitted from the
roaster's own roasts at run time, not shipped as constants**: they describe one machine, and another Nano owner would fit
their own. Shipped defaults stay the approximation already in `levelForAgtron`. See open decision 5.

## Build order

| Step | Deliverables | Why here |
|------|--------------|----------|
| 1 | D1, D2, D3, D4 | Nothing can be recorded until the flavour score, bean measurements and importer reference have a place to go; no beans needed. |
| 2 | D5, D6, D7, D8, D9, D10, D11, D21, D23, D25 | The pure functions can be written and proven on synthetic data before a single calibration roast; the runs then use them. |
| 3 | D12, D13 | The report and the completeness check turn raw roasts into the stage results and tell whether each stage was actually carried out. |
| 4 | D14, D15, D22 | The runs. Needs Steps 1 to 3 and the beans. The held-out validation needs the frozen prediction from D14's data; the edit trial needs a gold roast and the larger lots. |
| 5 | D16, D17, D18, D19, D20, D24 | Ship only what Step 4 passed: the formula in the code path, the rulebook, an end-to-end scenario, the per-bean recipe, and the glue docs. |

### Step 1: Capture

**Depends on:** nothing outside the repo.

| ID | Deliverable | Kind | Owning role |
|----|-------------|------|-------------|
| D1 | `docs/calibration-protocol.md` — what to measure, how to roast, read colour and cup, the tasting sheet (roast quality 1 to 5, flavour 1 to 5) and the cupping procedure (standard cupping ratio and method, not SCA scoring) | doc | `/project-manager` |
| D2 | `db/011_bean_measurements_and_flavour.sql` — bean density, moisture and the date measured; a roast's flavour score with its cups; the importer's reference score and its source | migration | `/backend-architect` |
| D3 | `src/core/intake.ts`, `src/core/validate.ts`, `scripts/roast.ts` — a `flavour` answer (1 to 5, with anchors) on the tasting form, measurement answers, an optional importer score with source; checked in code; no rule reads flavour | server-action | `/backend-architect` |
| D4 | `test/flavour.test.ts` and additions to the existing intake/validate tests — the new answers are accepted and rejected by the spec | test | `/test-engineer` |

### Step 2: Pure functions

**Depends on:** Step 1 (the shapes they read).

| ID | Deliverable | Kind | Owning role |
|----|-------------|------|-------------|
| D5 | `src/core/dialInSpec.ts` — T1 to T16 values and the four targets as data | resolver | `/backend-architect` |
| D6 | `src/core/cuppingStats.ts` — mean flavour per roast, scoring noise from repeat roasts, whether two levels are apart by more than **N** | resolver | `/backend-architect` |
| D7 | `src/core/referenceRoast.ts` — `pickReference` (G5) and `checkLevel` (G7), with plain-words reasons | resolver | `/backend-architect` |
| D8 | `src/adapters/kaffelogic/batchTranslation.ts` — fit a level or end-temperature step between batch sizes from roast pairs; translate a level from one size to another **on the same profile** (a level offset and end temperature; it never changes the curve or picks another profile); keys roasts by the load multiplier the log recorded, not by the dialled size alone; says when it has too few pairs, or when no level on the profile reaches the colour at that size | resolver | `/backend-architect` |
| D9 | `src/adapters/kaffelogic/colourLadder.ts` — the four levels, end temperatures and expected colour for a profile and batch size, from readings of the same size, or from another size through D8; extends `levelForAgtron` without changing its no-batch behaviour; also returns the step resolution (T10) | resolver | `/backend-architect` |
| D10 | `test/dialInCore.test.ts` — invariants of D5 to D7, D21 and D25 | test | `/test-engineer` |
| D11 | `test/dialInAdapter.test.ts` — invariants of D8, D9 and D23, plus a real-file replay that skips when the files are absent | test | `/test-engineer` |
| D21 | `src/core/referenceProfile.ts` — `chooseReferenceProfile`: given the unedited gold roast and one or more edited repeats, applies T12 and says in plain words whether the edit is adopted, kept as tried, or why the evidence is not enough (no edit is chosen here) | resolver | `/backend-architect` |
| D23 | *Conditional: built only if Stage 1b fails T14, or the roaster picks fan as an edit family.* `src/adapters/kaffelogic/editFan.ts` and a `profile:edit` option — change the fan curve (speed against time) of a profile, previewed, written without overwriting, recorded as a version with the original as parent; refuses a speed outside the range the stock profiles use unless the roaster names a limit | resolver | `/backend-architect` |
| D25 | `src/core/machineCheck.ts` — `checkMachineDrift`: the machine card against a control-bean re-check; says in plain words whether the machine is current, drifted by how much, or has too few roasts to say (T15) | resolver | `/backend-architect` |

### Step 3: Report and check

**Depends on:** Step 2.

| ID | Deliverable | Kind | Owning role |
|----|-------------|------|-------------|
| D12 | `scripts/dialin.ts` and `npm run dialin:*` — `report` (consistency, meter repeatability, scoring noise, ladders, translation, leave-one-bean-out against the code today), `check <stage>` (every planned roast, reading and cupping is present, and the stage's gate is met), `predict` (writes a time-stamped prediction before a held-out roast), `bean` (what to roast next for a bean), `card` (the bean card, P1 and P2: derived from the records, writes nothing), `machine` (the machine card and the control-bean re-check, P9) | job | `/backend-architect` |
| D13 | `test/dialInReport.test.ts` — the report and the check on synthetic data with known answers | test | `/test-engineer` |

### Step 4: The runs

**Depends on:** Steps 1 to 3; the beans arriving (see the schedule); the roaster's colour meter and moisture and density measurements; for D22, the larger lots on order.

| ID | Deliverable | Kind | Owning role |
|----|-------------|------|-------------|
| D14 | `docs/calibration-results.md` — Stages 0 to 3 as derived numbers (no bean, lot or log names): meter repeatability, machine spread and **B**, scoring noise **N**, ladders and the translation per T6, leave-one-bean-out per T7, the profile comparison for T9, and the sample-matches-bag pair for T13 | doc | `/test-engineer` |
| D15 | `docs/calibration-results.md`, Stage 4 section — the prediction made before the held-out roasts, the four full-size roasts, T8 and T9 outcomes, the bean cards of all nine beans, and what the data do not show | doc | `/test-engineer` |
| D22 | `docs/calibration-results.md`, Stage 5 section — the reference-profile edit trial on two beans (R4 to R8): the edit, its predicted thermal dose held, whether Studio and the machine took the file, the T12 outcome | doc | `/test-engineer` |

### Step 5: Ship

**Depends on:** D14 and D15 meeting T6 to T8 (otherwise only D19 and D20 ship, as a plan of what failed). D22 is not a ship gate: an edit that fails T12 leaves the unedited profile as the reference, and the card says so.

| ID | Deliverable | Kind | Owning role |
|----|-------------|------|-------------|
| D16 | `src/adapters/kaffelogic/dialIn.ts` — `dialIn(bean, target, batchGrams)`: profile (rule from T9 only if it passed), level, end temperature, expected colour and **B**, used by `selectStartingProfile`, `placeColour` and `level-for` when the batch size is known | resolver | `/backend-architect` |
| D17 | `docs/RULES.md` — the changed section 6 (colour placement with batch size), that the same profile at two batch sizes is not a level change, the reference and QC, flavour as a recorded, unused score; `npm run rules:steps` regenerated | doc | `/backend-architect` |
| D18 | `scripts/station.ts` scenario and `test/dialIn.test.ts` — a bean from measurements to ladder to reference to QC end to end on made-up logs | test | `/test-engineer` |
| D19 | `docs/bean-onboarding.md` — the per-bean production recipe (formula 4 above) | doc | `/project-manager` |
| D20 | `docs/ROADMAP.md`, `CHANGELOG.md`, `package.json`, `package-lock.json`, `README.md` — status, version, and the one-line pointers (glue; AC-COV rows) | doc | `/project-manager` |
| D24 | `docs/machine-calibration.md` — what to run when a machine is new, serviced or due: the control bean, the roasts, the card, and what a drift verdict means for the bean cards | doc | `/project-manager` |

### Files to Create

| File | Purpose |
|------|---------|
| `docs/calibration-protocol.md`, `docs/calibration-results.md`, `docs/bean-onboarding.md` | The protocol, the derived-number results, the per-bean recipe |
| `db/011_bean_measurements_and_flavour.sql` | Storage for measurements, flavour and the importer reference |
| `src/core/dialInSpec.ts`, `cuppingStats.ts`, `referenceRoast.ts`, `referenceProfile.ts` | Thresholds as data; scoring statistics; reference pick and QC; the rule for an edited reference profile |
| `src/adapters/kaffelogic/batchTranslation.ts`, `colourLadder.ts`, `dialIn.ts` | The Nano 7 formula |
| `scripts/dialin.ts` | Report, check, predict, bean |
| `test/flavour.test.ts`, `dialInCore.test.ts`, `dialInAdapter.test.ts`, `dialInReport.test.ts`, `dialIn.test.ts` | The tests |

### Files to Edit

| File | Change |
|------|--------|
| `src/core/intake.ts`, `src/core/validate.ts`, `scripts/roast.ts` | Flavour, measurement and importer-score answers (D3) |
| `src/adapters/kaffelogic/startingProfiles.ts` | `ColourReading` carries `batchGrams`; `levelForAgtron` stays as is for callers without a batch size (D9, D16) |
| `docs/RULES.md`, `docs/ROADMAP.md`, `CHANGELOG.md`, `README.md`, `package.json`, `package-lock.json` | D17, D20 |
| `.claude/skills/roast/SKILL.md` | The session flow for the flavour answer and `dialin:bean` (D3, D19) |
| `package.json` | `dialin:*` scripts (D12) |

## Bean and tasting schedule

### The beans (slots, not names)

Nine slots from the stock on hand and the lots on order. The slot-to-bean map is in `fixtures/private/` and is fixed at the end of Stage 0.

| Slot | Role | Rule for the slot |
|------|------|-------------------|
| B1 | Stage 1a bean (6 repeats at 50.4 g), then calibration bean | needs at least 706 g after the delivery (302.4 + 403.2); also a Stage 2c bean |
| B2 | Stage 1b bean: the size bridge (T14), 8 roasts, 907.2 g; its calibration stages wait for its larger lot | needs at least 907.2 g now and a larger lot later (907.2 + 403.2 g in all); also a Stage 2c bean |
| B3 to B8 | Calibration beans | at least 403.2 g each (the minimum: 5 x 50.4 g + 151.2 g); the third Stage 2c bean is the one of these with the most green (it needs 453.6 g) |
| B9 | **Held-out bean** | chosen after Stage 0 and before any Stage 2 roast: not B1 or B2, at least 605 g (4 x 151.2 g), and among those the one whose density and moisture are nearest the median of the nine. Roasted only in Stage 4. |

Two of B3 to B8 with at least 1 kg get the full four-level ladder at 151.2 g in Stage 3b. **Mix wanted**: both washed and natural,
and at least three altitude bands, so the nine are not one kind of bean (the T9 comparison and T6 depend on it).

### Green budget (the plan, not a result)

| Stage | Roasts | Green |
|-------|-------:|------:|
| 0 measure | 0 | 0 g (measurements are not destructive) |
| 1a 6 x 50.4 g | 6 | 302.4 g |
| 1b size bridge: 3 levels x 2 sizes, plus 2 more full-size roasts at the middle level (3 x 50.4 g and 5 x 151.2 g) | 8 | 907.2 g |
| 1d only if T14 fails: the sample profile re-tested, 3 x 50.4 g | up to 3 | up to 151.2 g |
| 2 ladders, 8 beans x 5 x 50.4 g | 40 | 2,016.0 g |
| 2c profile comparison, 3 beans x 1 x 50.4 g | 3 | 151.2 g |
| 3 reference level at 151.2 g, 8 beans | 8 | 1,209.6 g |
| 3b four levels at 151.2 g on 2 beans (3 extra each) | 6 | 907.2 g |
| 4 held-out, 4 x 151.2 g | 4 | 604.8 g |
| 3c paired sample for T13: the reference level at 50.4 g on the day of each of the two 3b full-size roasts | 2 | 100.8 g |
| 5 reference-profile edit trial: 2 beans x (2 edited + 1 unedited repeat) at 50.4 g | 6 | 302.4 g |
| 5 if an edit is adopted: the ladder again, 5 x 50.4 g per bean (at most 2 beans) | up to 10 | up to 504.0 g |
| 5 if an edit is adopted: its reference level at 151.2 g, per bean (one profile, both sizes) | up to 2 | up to 302.4 g |
| Re-roasts for a failed level (contingency, about 10%) | about 7 | about 350 g |
| **Total** | **about 90, at most 105** | **about 6.9 kg, at most 7.8 kg** |

### Day plan

Day 0 is the day the lots on order first arrive. Dates are fixed then; days are working days with a roast, a cupping or both.
**One bean per roast day (5 roasts, about 100 minutes with cool-down) and the previous bean cupped the same day (about 45 minutes).**

| Day | Roast | Measure, read, cup | Gate before the next row |
|-----|-------|--------------------|--------------------------|
| 0 | none | Receive and record lots. Stage 0: density, moisture, altitude, process for every bean; meter repeatability (T2); fix the slot map, choose B9 | T2 met |
| 1 | 1a roasts 1 to 3 (50.4 g; roast 1 from a cold start) | Colour reading of each, ground | |
| 2 | 1a roasts 4 to 6 (roast 4 from a cold start) | Colour readings; cup 1a roasts 1 to 3 blind | |
| 3 | 1b: the three levels at 50.4 g and the three at 151.2 g on one bean (B2), 6 roasts | Colour readings; cup 1a roasts 4 to 6 blind | |
| 4 | 1b: two more full-size roasts at the middle level (repeat spread) | Colour readings; `dialin:report`: **B** (T1), machine spread (T3), **N** (T4), **F** confirmed, **one profile for both sizes (T14)** | **T3 and T14 met, or stop** |
| 5 | Stage 2 B1 (5 roasts at 50.4 g: the four levels, then one correction) | Colour readings | |
| 6 to 12 | Stage 2 B2 to B8, one per day | Colour readings; cup the previous day's bean (4 levels x 3 cups, blind, randomised positions) | |
| 13 | Stage 2c (3 roasts, reference level of three beans on a second candidate profile) | Cup B8 | |
| 14 | none | Cup 2c; `dialin:report`: ladders, gold levels (G5), leave-one-bean-out (T7); `dialin:predict` the Stage 3 colours (frozen before roasting) | |
| 15 to 16 | Stage 3: 4 full-size reference-level roasts a day | Colour readings | |
| 17 | none | Cup the 8 full-size roasts; T6 | **T6 met, or the translation is per bean** |
| 18 to 20 | Stage 3b (needs the larger lots): 3 extra levels at 151.2 g on each of two beans; on the day each bean's reference level is roasted full size, the same level at 50.4 g too (Stage 3c) | Colour readings; cup | |
| 21 | none | Cup the paired 50.4 g and 151.2 g roasts blind (T13); `dialin:predict` for B9: profile, four levels, expected colour, **B**; frozen | |
| 22 | Stage 4: B9, 4 x 151.2 g | Colour readings | |
| 23 | none | Cup B9; `dialin:report`: T8, T9, T10, T11, the bean cards | **Ship or not** (Step 5) |
| 24 | Stage 5 (needs the larger lots): load check of the edited file in Studio; then for bean E1, 2 edited roasts and the unedited gold roast again (50.4 g) | Colour readings | The file loads and shows the curve it was drawn as, or the trial stops |
| 25 | Stage 5 for bean E2, the same | Cup E1 blind (3 roasts); colour readings | |
| 26 | If an edit is adopted: its ladder, 5 roasts | Cup E2 blind; `chooseReferenceProfile` | T12 recorded |
| 27 | If the second edit is adopted: its ladder, 5 roasts | Cup the first ladder | |
| 28 | For each adopted edit: its reference level at 151.2 g, with the 50.4 g roast of the same level the same day | Colour readings; cup the pair blind | T12's full-size condition; bean cards reissued |

About 6 to 7 weeks at 4 to 5 days a week. Stage 3b and Stage 5 wait for the larger lots on order, which have no arrival date yet (Stage 5 beans need about 800 g
more than a pound-only bean has left); every other stage can run on the lots arriving first, so a late delivery delays only those stages and B9 if B9 is one of those lots.

The 28 days are the one-off calibration. A bean after it costs one roast day and one cupping session (G9): Stage 2's rows are that recipe rehearsed on eight beans,
which is also how T16 is measured. Stage 3b and Stage 5 are not on a bean's path (Stage 5 is not a ship gate).

### Cupping procedure (every session)

Standard cupping ratio and method (not SCA scoring), after 1 day of rest (24 hours, plus or minus 6; the day is recorded), the same brew
for every roast of a coffee, 3 cups per roast, blind (a second person or a labelled code by lot, positions randomised), score 1 to 5 for flavour (G4)
and roast quality 1 to 5 (the existing anchors) per roast, ground-coffee colour read once from the same grind. A bean is cupped in one session (G9): all the roasts of its ladder rest the same time and are
tasted on one date. Profiles with a rest period (`Rest`) are cupped once, on their rest day. See open decision 2.

Sample budget at 50.4 g green: about 43 g roasted (assuming about 15% weight loss), which is 3 cups at 8.25 g (24.75 g)
and about 18 g for the colour reading and spare; the meter's sample mass decides whether that is enough (open decision 6).

## Test strategy (the codified functions)

Principles: invariants, not literals (the ACs' Pass-condition rule); handwritten seeded random cases for properties (no new dependency);
synthetic data generated from a *known* model so a fit can be checked against the truth that made it; real-file tests that read the
roaster's own logs skip when absent, as the repo's others do; every new test is shown to fail when its logic is broken (the repo's
practice, recorded in the QC column).

| Function | Invariants tested |
|----------|-------------------|
| `cuppingStats` | Order of roasts and cups does not change the result; adding a cup equal to the mean leaves the mean and does not raise the SD; with all scores equal, noise is 0; a level pair "apart" iff the gap exceeds **N** |
| `pickReference` | Only Good roasts are eligible; the result is the same for any permutation of the input; a gap under **N** gives "tie", never a silent pick; no Good roast gives "none" with the reason; `basis` is `roaster` only when set by the roaster |
| `checkLevel` | Each failing reason (colour outside **B**, a defect, flavour under **F**, flavour more than **N** above the reference) is reported on its own and all together; a pass has no reasons |
| `batchTranslation` | Translating from a size to the same size is the identity; a round trip a to b to a returns the level within the 0.1 grid; with fewer pairs than the minimum it returns "not enough", not a guess; fitted on synthetic roasts built from a known step plus noise, it recovers the step within the noise-implied tolerance |
| `colourLadder` | Four levels, strictly increasing end temperature as the target gets darker; all within the profile's ladder, or flagged `reach`; with no batch size it equals `levelForAgtron` for the same inputs (no regression); readings of another size are used only through the translation; the returned resolution times the local colour slope is at most B/2, and a spacing it cannot resolve is reported as such (T10) |
| `chooseReferenceProfile` | Adopts an edit only when every T12 condition holds, and each failing condition is reported on its own; the same answer for any order of repeats; with fewer than two edited repeats it says the evidence is not enough, never adopts; it never produces an edit, only judges one |
| `card` | Derived only from the records: the same records give the same card; every level states its basis (measured at 151.2 g, translated, or confirmed by a production batch); a bean with no gold level yet gets a card that says what is missing; the number of cupping sessions it rests on is the number of distinct tasting dates among the cups behind its gold level, and more than one is shown as extra; a tie says "roaster decides", never "re-cup" |
| `dialIn` | A bean with measurements and no readings degrades to today's answer and says so; the profile is today's pick unless the T9 rule exists; every answer carries **B** and its basis |
| `dialin` report | On synthetic data from a known model: reports the true spread, picks the known gold level, ranks the new ladder against the baseline correctly, and `check` fails when a planned roast, reading or cupping is missing |
| Real-file replay | Leave-one-bean-out over the roaster's own roasts: the T7 comparison reproduces the report's number (skips when the files are absent) |
| Docs | `rulesDoc`, `terminology` and `voice` tests pass; no bean, lot or log names in any committed file (AC-DOC) |

What tests cannot show, and the runs must: that the machine follows the translation, that the cup holds, and that the formula predicts a bean it has not
seen. Those are T3, T6, T7, T8, measured, not asserted.

## Acceptance Criteria

See [nano7-calibration-ACs.md](nano7-calibration-ACs.md). Rows are grouped by the same `Step N` headings; each carries a Plan ref (D1 to D25, or
`cross-cutting`) and an owning role. Status is derived there, not here.

## Commit Schedule

1. Plan commit: `docs: add plan and ACs for the Nano 7 calibration` (this document, on the open docs PR; after plan approval).
2. Step 1: `feat(capture): flavour score, bean measurements and the importer reference`
3. Step 2: `feat(dial-in): cupping statistics, reference roast, batch translation and colour ladder`
4. Step 3: `feat(dial-in): dialin report, check, predict and bean`
5. Step 4: `docs(calibration): Stage 0 to 3 results` then `docs(calibration): held-out validation` (derived numbers only)
6. Step 5: `feat(dial-in): the formula in the level placement` with `docs/RULES.md` in the same commit
7. Glue: `docs: roadmap, changelog, version` per merged PR (patch or minor bump each)

Each step is its own PR; nothing goes to main directly.

## Dependencies

- The beans: five lots are due on 2026-10-30; the larger lots have no date. Stage 3b and a held-out bean from those wait on them.
- A colour meter (and its sample mass), and a way to measure moisture and density. Not confirmed (open decision 6).
- A second person or a labelling method for blind cupping. Not confirmed.
- The importer's flavour map for each origin (the 1 to 5 flavour score is against it): the axes or description used must be recorded in the protocol (D1) before the first cupping.

## Out of Scope

- A rule that chooses the direction of a curve edit (no evidence yet; the roaster makes the edit, the tool judges it by T12). Curve edits themselves are in scope, as the reference-profile procedure.
- Sharing or shipping the roaster's fitted coefficients, and any other machine (Kaleido M1).
- SCA scoring by the roaster; any liking or preference score.
- Reading raw curves with a model.
- Changing existing advice rules for a defect (`rules.ts` steps), except the colour placement in D16/D17.
- Research findings for their own sake: the outputs are the cards, the procedure and the formula that makes the next card cheaper.
- A web UI or interactive prompts (the interface stays a Claude Code session).

## Open decisions (for discussion)

1. **Thresholds T1 to T16** and the schedule above are proposed; approve or change.
2. **Profile family.** The Rest profiles want 3 to 5 days before brewing; one session per bean means one date. Calibrate on the RTD profiles (the plan's default), or cup a Rest-profile bean once, on its rest day (the plan's rule if one is used; the earlier "day 1 and the rest day" is dropped)?
3. **Resolved 2026-10-30:** the reference profile is "edited or not", so curve edits are in scope as a procedure (approach item 2, Stage 5, T12). Which edit to try on the two Stage 5 beans is the roaster's choice at that point.
4. **Resolved 2026-10-30: samples are 50 g, not 80 g.** The store's sample size is set outside this repo (the store/platform data); that change is the roaster's to make. With a 50.4 g sample, the sample roast is the ladder's own size, so no 80 g check is needed, and a pound makes nine samples. The price of it is T13: the sample must be shown to match the bag.
5. **Fit per roaster, ship the procedure.** The coefficients are fitted from each roaster's data, not shipped; defaults stay the approximation. Agree, or ship this machine's numbers as labelled defaults.
6. **Equipment.** The colour meter model and sample mass (a 43 g roast may not leave enough), moisture and density measurement method.
7. **Importer reference.** Store the importer's cupping score per lot in this tool, or only in the store/platform data (the source of truth for lots).
8. **Held-out choice.** The rule picks B9 from beans that have 605 g or more; with the current stock that is two or three beans. Accept the rule, or buy one more pound so the choice is wider.
9. **Step resolution.** "Exact step (such as 0.5)" cannot be one fixed level step: on the stock profiles' labelled levels (approximation) 10 Agtron points are 0.3 to 0.5 level apart at the light end and up to 1.7 in the middle, so half a level is wider than the whole 75 to 65 gap on most profiles. The plan quotes each level on the 0.1 grid with its end temperature, and states the resolution (T10). Agree, or say what 0.5 should mean (for example, the unit the roaster dials in at the machine).
10. **Gold by default.** If gold turns out the same for most beans (T11), a default gold would save the cupping for a new bean. The plan keeps one cupping per new bean unless the data say otherwise.
11. **If one profile cannot hold both sizes (T14 fails).** Choose a fallback, in this order of least change: sibling profiles (a fan curve edit, D23, then heat), a different sample size, or a wider colour band for the sample. Setting the machine's load multiplier per roast is not available to the roaster (decision 12). The plan does not choose it in advance; it stops at the gate. It also does not assume the fan can be moved far: the range allowed is the one the stock profiles use unless the roaster names a limit.
12. **Resolved 2026-10-30: the roaster dials only the batch size (g); the machine sets the fan multiplier.** In the logs the multiplier differs for the same dialled size (for example 100 g reads 0.942, 0.953 and 1.000; 120 g reads 0.995, 1.000 and 1.049), always equal for fan and power. The plan therefore cannot fix it; it records the multiplier of every roast and keys the fits to it, and asks what the machine bases it on (open question for Kaffelogic's documentation or the roaster's knowledge of the machine).
13. **Control bean.** The machine re-check (T15) needs a reserved lot of about 1 kg that is not sold, stored sealed, with its green moisture noted at each check (green coffee ages, so a drift in colour could be the bean, not the machine). Which lot, and whether a pound is enough for the checks you want (each uses about 300 g)?
14. **One session leans on T13.** With one cupping session per bean, T13 (two beans, two pairs of 50.4 g and 151.2 g roasts) and T6 (eight beans) are the only evidence that a 50.4 g cup predicts the bag, for every future bean. Keep two pairs, or raise T13 to three beans (about 100 g more green and one more cupping, in Stage 3c)? Recommended: three.

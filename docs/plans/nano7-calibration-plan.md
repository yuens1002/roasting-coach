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

Build, from this roaster's own Nano 7 roasts, a formula that says what to dial in for a given bean, roast level and batch
size, and prove it before it is relied on. The aim is the same four things the store sells: a customer picks one of four
roast levels (City 75, City+ 65, Full City 55, Full City+ 45 on the Agtron scale), and each bean has one gold-standard
level (the one that cups best) used as the reference for quality control of the other three. The formula is a
data-built production tool for one machine, not a fit of any theory (thermal dose is a candidate input, kept only if it
earns its place).

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

## What good means

Every roast, level and formula is judged against these definitions. Nothing here is a taste preference: a defect-free roast
at the colour asked for, whose cup matches what the importer says that origin should taste like.

| # | Term | Definition |
|---|------|------------|
| G1 | **Hit** | The colour reading (ground coffee, one meter, one method) is within the band **B** of the level's target (75, 65, 55 or 45). |
| G2 | **Clean** | Roast quality 3 or better with no under or over taste word: the definition the clean-zone report already uses. |
| G3 | **Good roast** | Hit and Clean. |
| G4 | **Flavour** | A 1 to 5 score for how closely the cup matches the importer's flavour map for that origin, the mean of the 3 cups of one roast, tasted after 1 day of rest. Separate from roast quality; no rule reads it; not a liking score. The roaster does not score on the SCA protocol; an importer's cupping score for a lot may be stored as a reference value with its source, never as the roaster's score. |
| G5 | **Reference (gold) level** | Per bean, among the levels that are Good roasts, the one with the highest flavour. If the top two are closer than the scoring noise **N**, there is no unique reference: the two are re-cupped from a second roast each, and if still tied the roaster chooses and the record says `basis: roaster`. |
| G6 | **Sellable level** | A Good roast whose flavour is at least the floor **F**. Below it, the bean is not offered at that level. |
| G7 | **QC pass** (any production roast at a level) | Good roast, and flavour no more than **N** above the reference's: a level that outscores the gold standard means the reference was wrong and is re-picked, not passed. |
| G8 | **Formula good** | See "Acceptance thresholds" T6 to T9: it predicts the dial-in of a bean it has not seen, closer than the method in the code today. |

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

## Approach

The four formulas, and how each is decided:

1. **Which default profile for a bean (density and moisture).** Today the pick is by altitude band, process and species.
   Stage 0 measures density and moisture of every bean; Stage 2c roasts the reference level on a second candidate profile for three
   beans and cups both. T9 decides whether density and moisture add anything. Expected honest outcome with 9 beans: a recorded
   hypothesis, not a rule. The plan does not assume otherwise.
2. **How to change the profile to reach the gold standard.** Read as: the level (and, where the data show it, the batch-size
   correction) on the chosen stock profile that lands each target colour. Choosing a curve edit to lift the flavour score is
   out of scope (no rule chooses a curve change; `profile:edit` stays roaster-directed). See open decision 3.
3. **The 4-level ladder per bean and the 50 g to 151.2 g translation.** Per bean, find the level of each of the four colour
   targets at 50.4 g (about 5 roasts); translate to the full batch with a step fitted from Stages 1 to 3 (shared across beans if T6
   holds, per bean if not); confirm by the first production roast at each level.
4. **What to do per bean in production** (`docs/bean-onboarding.md`): measure, read the formula's prediction, roast the ladder at
   50.4 g, cup after 1 day, pick the gold level (G5), then the first production batch at each level is read and, if outside **B**, corrected
   once by the measured error and recorded.

Layering (SDK = shape, platform = data, store = presentation, here: core = machine-independent, adapter = Nano 7): batch
translation and the ladder are Nano 7 adapter code (they read levels, end temperatures and the log's batch size); scoring statistics,
the reference pick and QC are core code (a roast, a colour and a score, no machine). The coefficients are **fitted from the
roaster's own roasts at run time, not shipped as constants**: they describe one machine, and another Nano owner would fit
their own. Shipped defaults stay the approximation already in `levelForAgtron`. See open decision 5.

## Build order

| Step | Deliverables | Why here |
|------|--------------|----------|
| 1 | D1, D2, D3, D4 | Nothing can be recorded until the flavour score, bean measurements and importer reference have a place to go; no beans needed. |
| 2 | D5, D6, D7, D8, D9, D10, D11 | The pure functions can be written and proven on synthetic data before a single calibration roast; the runs then use them. |
| 3 | D12, D13 | The report and the completeness check turn raw roasts into the stage results and tell whether each stage was actually carried out. |
| 4 | D14, D15 | The runs. Needs Steps 1 to 3 and the beans. The held-out validation needs the frozen prediction from D14's data. |
| 5 | D16, D17, D18, D19, D20 | Ship only what Step 4 passed: the formula in the code path, the rulebook, an end-to-end scenario, the per-bean recipe, and the glue docs. |

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
| D5 | `src/core/dialInSpec.ts` — T1 to T9 values and the four targets as data | resolver | `/backend-architect` |
| D6 | `src/core/cuppingStats.ts` — mean flavour per roast, scoring noise from repeat roasts, whether two levels are apart by more than **N** | resolver | `/backend-architect` |
| D7 | `src/core/referenceRoast.ts` — `pickReference` (G5) and `checkLevel` (G7), with plain-words reasons | resolver | `/backend-architect` |
| D8 | `src/adapters/kaffelogic/batchTranslation.ts` — fit a level or end-temperature step between batch sizes from roast pairs; translate a level from one size to another; says when it has too few pairs | resolver | `/backend-architect` |
| D9 | `src/adapters/kaffelogic/colourLadder.ts` — the four levels, end temperatures and expected colour for a profile and batch size, from readings of the same size, or from another size through D8; extends `levelForAgtron` without changing its no-batch behaviour | resolver | `/backend-architect` |
| D10 | `test/dialInCore.test.ts` — invariants of D5 to D7 | test | `/test-engineer` |
| D11 | `test/dialInAdapter.test.ts` — invariants of D8 and D9, plus a real-file replay that skips when the files are absent | test | `/test-engineer` |

### Step 3: Report and check

**Depends on:** Step 2.

| ID | Deliverable | Kind | Owning role |
|----|-------------|------|-------------|
| D12 | `scripts/dialin.ts` and `npm run dialin:*` — `report` (consistency, meter repeatability, scoring noise, ladders, translation, leave-one-bean-out against the code today), `check <stage>` (every planned roast, reading and cupping is present, and the stage's gate is met), `predict` (writes a time-stamped prediction before a held-out roast), `bean` (what to roast next for a bean) | job | `/backend-architect` |
| D13 | `test/dialInReport.test.ts` — the report and the check on synthetic data with known answers | test | `/test-engineer` |

### Step 4: The runs

**Depends on:** Steps 1 to 3; the beans arriving (see the schedule); the roaster's colour meter and moisture and density measurements.

| ID | Deliverable | Kind | Owning role |
|----|-------------|------|-------------|
| D14 | `docs/calibration-results.md` — Stages 0 to 3 as derived numbers (no bean, lot or log names): meter repeatability, machine spread and **B**, scoring noise **N**, ladders and the translation per T6, leave-one-bean-out per T7, and the profile comparison for T9 | doc | `/test-engineer` |
| D15 | `docs/calibration-results.md`, Stage 4 section — the prediction made before the held-out roasts, the four full-size roasts, T8 and T9 outcomes, and what the data do not show | doc | `/test-engineer` |

### Step 5: Ship

**Depends on:** D14 and D15 meeting T6 to T8 (otherwise only D19 and D20 ship, as a plan of what failed).

| ID | Deliverable | Kind | Owning role |
|----|-------------|------|-------------|
| D16 | `src/adapters/kaffelogic/dialIn.ts` — `dialIn(bean, target, batchGrams)`: profile (rule from T9 only if it passed), level, end temperature, expected colour and **B**, used by `selectStartingProfile`, `placeColour` and `level-for` when the batch size is known | resolver | `/backend-architect` |
| D17 | `docs/RULES.md` — the changed section 6 (colour placement with batch size), the reference and QC, flavour as a recorded, unused score; `npm run rules:steps` regenerated | doc | `/backend-architect` |
| D18 | `scripts/station.ts` scenario and `test/dialIn.test.ts` — a bean from measurements to ladder to reference to QC end to end on made-up logs | test | `/test-engineer` |
| D19 | `docs/bean-onboarding.md` — the per-bean production recipe (formula 4 above) | doc | `/project-manager` |
| D20 | `docs/ROADMAP.md`, `CHANGELOG.md`, `package.json`, `package-lock.json`, `README.md` — status, version, and the one-line pointers (glue; AC-COV rows) | doc | `/project-manager` |

### Files to Create

| File | Purpose |
|------|---------|
| `docs/calibration-protocol.md`, `docs/calibration-results.md`, `docs/bean-onboarding.md` | The protocol, the derived-number results, the per-bean recipe |
| `db/011_bean_measurements_and_flavour.sql` | Storage for measurements, flavour and the importer reference |
| `src/core/dialInSpec.ts`, `cuppingStats.ts`, `referenceRoast.ts` | Thresholds as data; scoring statistics; reference pick and QC |
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
| B2 | Stage 1b bean (3 repeats at 151.2 g), then calibration bean | needs at least 857 g (453.6 + 403.2); also a Stage 2c bean |
| B3 to B8 | Calibration beans | at least 403.2 g each (the minimum: 5 x 50.4 g + 151.2 g); the third Stage 2c bean is the one of these with the most green (it needs 453.6 g) |
| B9 | **Held-out bean** | chosen after Stage 0 and before any Stage 2 roast: not B1 or B2, at least 605 g (4 x 151.2 g), and among those the one whose density and moisture are nearest the median of the nine. Roasted only in Stage 4. |

Two of B3 to B8 with at least 1 kg get the full four-level ladder at 151.2 g in Stage 3b. **Mix wanted**: both washed and natural,
and at least three altitude bands, so the nine are not one kind of bean (the T9 comparison and T6 depend on it).

### Green budget (the plan, not a result)

| Stage | Roasts | Green |
|-------|-------:|------:|
| 0 measure | 0 | 0 g (measurements are not destructive) |
| 1a 6 x 50.4 g | 6 | 302.4 g |
| 1b 3 x 151.2 g | 3 | 453.6 g |
| 2 ladders, 8 beans x 5 x 50.4 g | 40 | 2,016.0 g |
| 2c profile comparison, 3 beans x 1 x 50.4 g | 3 | 151.2 g |
| 3 reference level at 151.2 g, 8 beans | 8 | 1,209.6 g |
| 3b four levels at 151.2 g on 2 beans (3 extra each) | 6 | 907.2 g |
| 4 held-out, 4 x 151.2 g | 4 | 604.8 g |
| Re-roasts for a failed level (contingency, about 10%) | about 7 | about 350 g |
| **Total** | **about 77** | **about 6.0 kg** |

### Day plan

Day 0 is the day the lots on order first arrive. Dates are fixed then; days are working days with a roast, a cupping or both.
**One bean per roast day (5 roasts, about 100 minutes with cool-down) and the previous bean cupped the same day (about 45 minutes).**

| Day | Roast | Measure, read, cup | Gate before the next row |
|-----|-------|--------------------|--------------------------|
| 0 | none | Receive and record lots. Stage 0: density, moisture, altitude, process for every bean; meter repeatability (T2); fix the slot map, choose B9 | T2 met |
| 1 | 1a roasts 1 to 3 (50.4 g; roast 1 from a cold start) | Colour reading of each, ground | |
| 2 | 1a roasts 4 to 6 (roast 4 from a cold start) | Colour readings; cup 1a roasts 1 to 3 blind | |
| 3 | 1b roasts 1 to 3 (151.2 g, same profile and level) | Colour readings; cup 1a roasts 4 to 6 blind | |
| 4 | none | `dialin:report`: **B** (T1), machine spread (T3), **N** (T4), **F** confirmed | **T3 met or stop** |
| 5 | Stage 2 B1 (5 roasts at 50.4 g: the four levels, then one correction) | Colour readings | |
| 6 to 12 | Stage 2 B2 to B8, one per day | Colour readings; cup the previous day's bean (4 levels x 3 cups, blind, randomised positions) | |
| 13 | Stage 2c (3 roasts, reference level of three beans on a second candidate profile) | Cup B8 | |
| 14 | none | Cup 2c; `dialin:report`: ladders, gold levels (G5), leave-one-bean-out (T7); `dialin:predict` the Stage 3 colours (frozen before roasting) | |
| 15 to 16 | Stage 3: 4 full-size reference-level roasts a day | Colour readings | |
| 17 | none | Cup the 8 full-size roasts; T6 | **T6 met, or the translation is per bean** |
| 18 to 20 | Stage 3b (needs the larger lots): 3 extra levels at 151.2 g on each of two beans | Colour readings; cup | |
| 21 | none | `dialin:predict` for B9: profile, four levels, expected colour, **B**; frozen | |
| 22 | Stage 4: B9, 4 x 151.2 g | Colour readings | |
| 23 | none | Cup B9; `dialin:report`: T8, T9, final results | **Ship or not** (Step 5) |

About 5 to 6 weeks at 4 to 5 days a week. Stage 3b waits for the larger lots on order, which have no arrival date yet; every other stage
can run on the 5 lb-or-smaller lots, so a late delivery delays only that stage and B9 if B9 is one of those lots.

### Cupping procedure (every session)

Standard cupping ratio and method (not SCA scoring), after 1 day of rest (24 hours, plus or minus 6; the day is recorded), the same brew
for every roast of a coffee, 3 cups per roast, blind (a second person or a labelled code by lot, positions randomised), score 1 to 5 for flavour (G4)
and roast quality 1 to 5 (the existing anchors) per roast, ground-coffee colour read once from the same grind. Profiles with a rest period
(`Rest`) are cupped on day 1 for comparison and again on their rest day; both are recorded. See open decision 2.

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
| `colourLadder` | Four levels, strictly increasing end temperature as the target gets darker; all within the profile's ladder, or flagged `reach`; with no batch size it equals `levelForAgtron` for the same inputs (no regression); readings of another size are used only through the translation |
| `dialIn` | A bean with measurements and no readings degrades to today's answer and says so; the profile is today's pick unless the T9 rule exists; every answer carries **B** and its basis |
| `dialin` report | On synthetic data from a known model: reports the true spread, picks the known gold level, ranks the new ladder against the baseline correctly, and `check` fails when a planned roast, reading or cupping is missing |
| Real-file replay | Leave-one-bean-out over the roaster's own roasts: the T7 comparison reproduces the report's number (skips when the files are absent) |
| Docs | `rulesDoc`, `terminology` and `voice` tests pass; no bean, lot or log names in any committed file (AC-DOC) |

What tests cannot show, and the runs must: that the machine follows the translation, that the cup holds, and that the formula predicts a bean it has not
seen. Those are T3, T6, T7, T8, measured, not asserted.

## Acceptance Criteria

See [nano7-calibration-ACs.md](nano7-calibration-ACs.md). Rows are grouped by the same `Step N` headings; each carries a Plan ref (D1 to D20, or
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

- A rule that chooses a curve change, or a flavour-driven curve edit (stays roaster-directed).
- Sharing or shipping the roaster's fitted coefficients, and any other machine (Kaleido M1).
- SCA scoring by the roaster; any liking or preference score.
- Reading raw curves with a model.
- Changing existing advice rules for a defect (`rules.ts` steps), except the colour placement in D16/D17.
- A web UI or interactive prompts (the interface stays a Claude Code session).

## Open decisions (for discussion)

1. **Thresholds T1 to T9** and the schedule above are proposed; approve or change.
2. **Profile family.** The Rest profiles want 3 to 5 days before brewing; the cupping is after 1 day. Calibrate on the RTD profiles (the plan's default), or cup Rest profiles on their rest day?
3. **"Change the profile to reach the gold standard"** is read as the level and batch correction on a stock profile. If a curve edit is meant, it is a separate experiment (an edited-profile roast has never been made) and cannot be validated in this plan.
4. **Sample size.** The store offers an 80 g green sample and a 151.2 g bag. If samples are roasted at 80 g, 80 g needs its own check (2 beans, reference level); if they are cut from a larger roast, nothing changes.
5. **Fit per roaster, ship the procedure.** The coefficients are fitted from each roaster's data, not shipped; defaults stay the approximation. Agree, or ship this machine's numbers as labelled defaults.
6. **Equipment.** The colour meter model and sample mass (a 43 g roast may not leave enough), moisture and density measurement method.
7. **Importer reference.** Store the importer's cupping score per lot in this tool, or only in the store/platform data (the source of truth for lots).
8. **Held-out choice.** The rule picks B9 from beans that have 605 g or more; with the current stock that is two or three beans. Accept the rule, or buy one more pound so the choice is wider.

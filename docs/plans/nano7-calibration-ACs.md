# Nano 7 calibration: dial-in formula from measured roasts: Acceptance Criteria

**Branch:** `feat/nano7-calibration`
**Plan:** [nano7-calibration-plan.md](nano7-calibration-plan.md)

---

## Context

Production knowledge for one machine, built from this roaster's own Nano 7 roasts: for every bean offered, a bean card (reference profile, edited or not; gold
level; the step to dial for each of the four levels sold, Agtron 75, 65, 55, 45), and a formula that makes the next card cheaper. The plan defines "good" (G1 to G8), what is true once it ships (P1 to P6) and the acceptance thresholds (T1 to T12, *proposed*); these
ACs test them. Steps 1 to 3 and 5 are code and docs proved by tests; Step 4 is the runs, proved by measured results that
`npm run dialin:check` confirms are complete and that the report evaluates against the thresholds.

---

## Column Definitions

| Column | Filled by | When |
|--------|-----------|------|
| **Plan ref** | Author of the ACs | At authoring: a plan deliverable ID (D1 to D23) or `cross-cutting` |
| **Role** | Author of the ACs | At authoring: the deliverable's owning role |
| **Agent** | Verifier (a sub-agent, or the main thread when run ad hoc) | PASS/FAIL with brief evidence |
| **QC** | Main thread | Confirms or overrides; for a test AC, records that the test was shown to fail when its logic was broken |
| **Reviewer** | Human | Final approval per AC |

---

## Pass-condition rule

Pass is an invariant, not a literal. A test that pins a number the producer also hardcodes passes vacuously: tests build their input from a known model and assert the
relation (a fit recovers the model that generated the data; a permutation does not change a result; translating to the same size is the identity). Thresholds are
read from `dialInSpec.ts`, never retyped in a test, so changing a threshold changes both sides. A zero-hit grep names the text that may legitimately match.

A check that cannot fail is not a check: each `AC-TST` row's QC cell records which line was broken to make the test go red.

---

## Status

> **Derived, never typed.** Computed from the verdict columns below. All steps are currently unstarted (no verdicts).

| Step | Deliverables | State |
|------|--------------|-------|
| [1](#step-1-capture) | [D1, D2, D3, D4](nano7-calibration-plan.md#step-1-capture) | 0 of 7 criteria carry a verdict |
| [2](#step-2-pure-functions) | [D5, D6, D7, D8, D9, D10, D11, D21, D23](nano7-calibration-plan.md#step-2-pure-functions) | 0 of 19 criteria carry a verdict |
| [3](#step-3-report-and-check) | [D12, D13](nano7-calibration-plan.md#step-3-report-and-check) | 0 of 6 criteria carry a verdict |
| [4](#step-4-the-runs) | [D14, D15, D22](nano7-calibration-plan.md#step-4-the-runs) | 0 of 18 criteria carry a verdict |
| [5](#step-5-ship) | [D16, D17, D18, D19, D20](nano7-calibration-plan.md#step-5-ship) | 0 of 10 criteria carry a verdict |

---

## Step 1: Capture

Builds D1, D2, D3, D4, defined in [the plan](nano7-calibration-plan.md#step-1-capture).

| AC | Plan ref | Role | What | How | Pass | Agent | QC | Reviewer |
|----|----------|------|------|-----|------|-------|----|----------|
| AC-DOC-1 | D1 | `/project-manager` | `docs/calibration-protocol.md` | Code review, then a walkthrough: follow only the protocol through Stage 0 on one bean | Has a numbered procedure for each of measuring, roasting, reading colour, cupping and recording; its tasting sheet quotes the flavour and roast quality anchors exactly as the code does (AC-TST-1 reads both); names the cupping ratio and method and the rest time; says which importer flavour map is the reference; the walkthrough completes with no step needing outside knowledge | | | |
| AC-MIG-1 | D2 | `/backend-architect` | `db/011_bean_measurements_and_flavour.sql` | Test run: `npm test -- test/db.test.ts`; inspect the migration | Applies once after 010 through `db:migrate`; every row that existed before is unchanged (counts and contents equal); a flavour outside 1 to 5, a density outside the intake bounds, a moisture outside the intake bounds, an importer score without a source, and a second row for the same bean and date are rejected by the schema | | | |
| AC-FN-1 | D3 | `/backend-architect` | The `flavour` answer on the tasting form | Test run: `npm test -- test/flavour.test.ts`; `rg -n flavour src/core/rules.ts src/core/features.ts` | A tasting without it is still valid (additive); a value that is not a whole number from 1 to 5 is rejected with a plain reason; the anchors for 1 to 5 are one exported constant the form and the protocol both use; the search finds no hit in the rule or feature code (no rule reads flavour) | | | |
| AC-FN-2 | D3 | `/backend-architect` | Bean density and moisture answers, with the date measured | Test run: `npm test -- test/flavour.test.ts` | Values outside the intake bounds are rejected; a new measurement of the same bean adds a row and the earlier one is kept (history, not overwrite); a measurement without its date is rejected | | | |
| AC-FN-3 | D3 | `/backend-architect` | The importer's reference score | Test run: `npm test -- test/flavour.test.ts` | A score without its source (or a source without a score) is rejected, as a colour reading without its method is; it is stored on the bean/lot and never in the tasting's own flavour answer, so the roaster's score and the importer's cannot be confused | | | |
| AC-FN-4 | D3 | `/backend-architect` | The session flow can record the new answers | Code review: `.claude/skills/roast/SKILL.md`, `scripts/roast.ts` | A session can record a flavour score, a measurement and an importer score through `scripts/roast.ts` alone (no prompts, no web form); the skill text describes each in the engine's own words | | | |
| AC-TST-1 | D4 | `/test-engineer` | The intake/validate additions | Test run: `npm test -- test/flavour.test.ts test/kaffelogic.test.ts` | `test/flavour.test.ts` asserts the invariants of AC-FN-1 to AC-FN-3 from the spec (the accepted set equals the integers 1 to 5; a measurement round-trips through the store); the protocol's anchors equal the code's constants; no literal pin against form copy | | | |

## Step 2: Pure functions

Builds D5, D6, D7, D8, D9, D10, D11, D21, D23, defined in [the plan](nano7-calibration-plan.md#step-2-pure-functions).

| AC | Plan ref | Role | What | How | Pass | Agent | QC | Reviewer |
|----|----------|------|------|-----|------|-------|----|----------|
| AC-FN-5 | D5 | `/backend-architect` | `dialInSpec.ts` | Code review: the file and its importers | Holds T1 to T12 and the four targets as data with their units and allowed ranges, each with a one-line plain meaning (like `SETTING_SPECS`); the functions of D6 to D9 and D12 take their thresholds from it | | | |
| AC-FN-6 | D6 | `/backend-architect` | `cuppingStats.ts` | Test run: `npm test -- test/dialInCore.test.ts` | Mean per roast, scoring noise across repeat roasts and "apart by more than **N**" are pure functions of the scores; a single cup, an empty set and a missing score give a plain reason, not NaN | | | |
| AC-FN-7 | D7 | `/backend-architect` | `pickReference` | Test run: `npm test -- test/dialInCore.test.ts` | Only Good roasts (G3) are eligible; the top level wins only when it is ahead of the next by more than **N**; otherwise the answer is a tie naming the levels; with no eligible roast it is "none" with the reason; the answer carries `basis` (`scored` or `roaster`) | | | |
| AC-FN-8 | D7 | `/backend-architect` | `checkLevel` | Test run: `npm test -- test/dialInCore.test.ts` | Reports each failure on its own (colour outside **B**, a defect, flavour under **F**, flavour more than **N** above the reference) and none when it passes; the reasons are finished plain text (the engine returns text, a model interprets nothing) | | | |
| AC-FN-9 | D8 | `/backend-architect` | `batchTranslation.ts` | Test run: `npm test -- test/dialInAdapter.test.ts` | Fits a step between two batch sizes from roast pairs and translates a level or end temperature; with fewer pairs than the minimum in the spec it returns "not enough roasts" and a number nobody should use is never produced; it reads the batch size and the load multiplier from the log's own fields, and two roasts with the same dialled size but different recorded multipliers are never pooled as one size | | | |
| AC-FN-24 | D8 | `/backend-architect` | One profile for both sizes | Test run: `npm test -- test/dialInAdapter.test.ts` | A translation is only a level offset (and end temperature) on the profile it was asked about: the profile body in the answer equals the one given (`sameProfileBody`), for any input; when no level on that profile reaches the colour at the other size it says so in plain words and offers no other profile | | | |
| AC-FN-10 | D9 | `/backend-architect` | `colourLadder.ts` | Test run: `npm test -- test/dialInAdapter.test.ts` | Returns the four targets' level, end temperature and expected colour; darker target means a higher end temperature; the levels stay inside the profile's ladder or carry `reach`; readings of another batch size are used only through D8 | | | |
| AC-FN-11 | D9 | `/backend-architect` | No change for callers without a batch size | Test run: `npm test -- test/startingProfiles.test.ts test/dialInAdapter.test.ts` | For any profile, target and readings and no batch size, the ladder equals `levelForAgtron` for each target (compared against the function itself over a grid, not a recorded answer); every existing startingProfiles test passes unedited | | | |
| AC-FN-22 | D21 | `/backend-architect` | `chooseReferenceProfile` | Test run: `npm test -- test/dialInCore.test.ts` | Adopts an edit only when T12 holds in full (both edited repeats are Good roasts, the edited flavour beats the unedited gold roast's by more than **N**, all four levels stay reachable); each failing condition is reported on its own in plain text; with fewer than two edited repeats it says the evidence is not enough; it judges an edit and never produces or ranks one | | | |
| AC-FN-26 | D23 | `/backend-architect` | Fan-curve edit (conditional) | Test run: `npm test -- test/dialInAdapter.test.ts` | If built: the edited file parses, differs from the original only in `fan_profile`, never overwrites a file, records the original as parent, keeps the curve a valid series of nodes in time order, and refuses a speed outside the stock profiles' range unless the roaster names a limit; if not built, the plan's Step 2 records D23 as not needed and why | | | |
| AC-TST-11 | D11 | `/test-engineer` | Fan-edit properties (if D23 is built) | Test run: `npm test -- test/dialInAdapter.test.ts` | Over every stock profile: an edit with no change returns an equal body; any edit leaves every header key except `fan_profile` equal (`sameProfileBody` differs only by the fan); a refusal names the limit it hit | | | |
| AC-FN-23 | D9 | `/backend-architect` | The step resolution on a ladder | Test run: `npm test -- test/dialInAdapter.test.ts` | Each ladder level carries the step from the gold level on the machine's 0.1 grid with its end temperature, and the resolution at which that step is quoted; resolution times the local colour slope is at most B/2 (T10); where two targets are closer than the resolution it says "not resolvable at this spacing" rather than a step | | | |
| AC-TST-2 | D10 | `/test-engineer` | Core invariants | Test run: `npm test -- test/dialInCore.test.ts` | Asserts: result unchanged under any permutation of roasts and cups; adding a cup at the mean leaves the mean; equal scores give noise 0; a tie is never resolved silently; each `checkLevel` reason fires alone | | | |
| AC-TST-3 | D10 | `/test-engineer` | Thresholds are data | Test run: `npm test -- test/dialInCore.test.ts` | A test changes one spec value (**N**, **F**, **B**) and shows the dependent function's answer changes with it; no threshold is retyped in a test | | | |
| AC-TST-10 | D10 | `/test-engineer` | `chooseReferenceProfile` properties | Test run: `npm test -- test/dialInCore.test.ts` | The answer is the same for any order of the repeats; raising the edited flavour across the T12 margin flips the answer from kept-as-tried to adopted and nothing else; lowering one repeat to a defect flips it back; every threshold is read from the spec | | | |
| AC-TST-4 | D11 | `/test-engineer` | Translation properties | Test run: `npm test -- test/dialInAdapter.test.ts` | Same size to same size is the identity; a round trip a to b to a returns the original within the 0.1 level grid; fitted on synthetic roasts made from a known step plus seeded noise, the step is recovered within the tolerance the noise implies (the relation between the data's noise and the error, not a pinned number) | | | |
| AC-TST-5 | D11 | `/test-engineer` | Ladder properties | Test run: `npm test -- test/dialInAdapter.test.ts` | Over every selectable stock profile and the four targets: strictly increasing end temperature as the target darkens (or `reach` where the ladder ends); monotone in the batch-size step when D8 is supplied | | | |
| AC-TST-6 | D11 | `/test-engineer` | Real-file replay | Test run: `npm test -- test/dialInAdapter.test.ts` (with and without the private files present) | With the roaster's logs present, leave-one-bean-out reproduces the number `dialin:report` prints; with them absent the test skips and the suite passes; the test prints no bean, lot or log name | | | |
| AC-TST-7 | D11 | `/test-engineer` | Each new test fails when its logic is broken | Mutation check by hand: break the logic each test guards, run it, restore | QC cell of each of AC-TST-2 to AC-TST-6 and AC-TST-10 names the line broken and the red test; none stays green | | | |

## Step 3: Report and check

Builds D12, D13, defined in [the plan](nano7-calibration-plan.md#step-3-report-and-check).

| AC | Plan ref | Role | What | How | Pass | Agent | QC | Reviewer |
|----|----------|------|------|-----|------|-------|----|----------|
| AC-FN-12 | D12 | `/backend-architect` | `dialin:report` | Test run: `npm test -- test/dialInReport.test.ts`; run it on the roaster's data | Prints meter repeatability, machine spread and **B**, scoring noise **N**, ladders, gold levels, translation, and leave-one-bean-out error for the new ladder against `levelForAgtron`; every number is tagged with the threshold it is judged by and prints PASS or FAIL; beans appear as slot ids, never names; read-only, writes nothing | | | |
| AC-FN-13 | D12 | `/backend-architect` | `dialin:check <stage>` | Test run: `npm test -- test/dialInReport.test.ts` | Exits non-zero naming each missing item (a roast, a colour reading, a cupping, a measurement) and each unmet gate for that stage; zero only when the stage's plan counts are all present and its gate is met | | | |
| AC-FN-14 | D12 | `/backend-architect` | `dialin:predict` | Test run: `npm test -- test/dialInReport.test.ts` | Writes the predicted profile, levels and colours with an ISO timestamp to the private folder, refuses to overwrite a prediction, and `check` fails a stage whose first roast is dated before its prediction | | | |
| AC-FN-15 | D12 | `/backend-architect` | `dialin:bean` | Test run: `npm test -- test/dialInReport.test.ts` | For a bean it prints the next roast to make (profile, level, batch size, why) and what is still missing, from the state of its records; run twice with no new record it prints the same | | | |
| AC-FN-21 | D12 | `/backend-architect` | `dialin:card` (the bean card) | Test run: `npm test -- test/dialInReport.test.ts`; run it on a Stage 2 bean | Prints the reference profile (file name), exactly one for all batch sizes when T14 passed and otherwise two sibling profiles with the size each serves and the reason, the sizes' levels and their difference (or "same level at both sizes" when within the resolution), the gold level with its basis, and for each of the four levels the level, step from gold, end temperature, expected colour, **B** and resolution; each level states whether it was measured at 151.2 g, translated from 50.4 g, or confirmed by a production batch, and the number of production batches read and hits; derived from the records only, writes nothing, the same records give the same card; a bean without a gold level gets a card that says what is missing | | | |
| AC-TST-8 | D13 | `/test-engineer` | The report and check on data with known answers | Test run: `npm test -- test/dialInReport.test.ts` | On synthetic roasts built from a known model: the reported spread equals the generating spread within sampling error, the known gold level is picked, the new ladder beats the baseline only when the model says it should, `check` fails when any planned roast, reading or cupping is removed, `card` states the right basis for each level, and a swap of two beans' slot ids changes nothing but the ids | | | |

## Step 4: The runs

Builds D14, D15, D22, defined in [the plan](nano7-calibration-plan.md#step-4-the-runs). Each row is verified by `npm run dialin:check <stage>` and the report, and its measured value is copied into `docs/calibration-results.md` as a derived number.

| AC | Plan ref | Role | What | How | Pass | Agent | QC | Reviewer |
|----|----------|------|------|-----|------|-------|----|----------|
| AC-RUN-1 | D14 | `/test-engineer` | Stage 0: measurements | `npm run dialin:check 0` | Every bean has density, moisture and their dates and altitude and process; the meter's SD over 5 readings of one ground sample is at most the T2 value; the slot map and B9 are fixed and B9 meets the plan's rule | | | |
| AC-RUN-2 | D14 | `/test-engineer` | Stage 1a: machine spread | `npm run dialin:check 1a` | 6 roasts, same profile, level, batch weight and recorded load multiplier, over 2 days with 2 cold starts, each with a colour reading; spread ≤ T3, else the record says STOP and Step 4 halts here; **B** is set between ±2 and ±4 | | | |
| AC-RUN-3 | D14 | `/test-engineer` | Stage 1a cupped blind: scoring noise | `npm run dialin:check 1a` | All 6 roasts have a blind 3-cup flavour score and roast quality; **N** is computed; if above T4, the results state that every reference is `basis: roaster` | | | |
| AC-RUN-4 | D14 | `/test-engineer` | Stage 1b: the size bridge | `npm run dialin:check 1b` | One bean, one profile, 3 levels near Agtron 75, 60 and 45 at 50.4 g and at 151.2 g with one recorded load multiplier per size, plus two more full-size roasts at the middle level, each with a colour reading; the full-size repeat spread is reported beside the 50.4 g spread; the colour-against-end-temperature line at each size is fitted and reported | | | |
| AC-RUN-18 | D14 | `/test-engineer` | Gate: one profile for both sizes (T14) | `npm run dialin:report` | After the best constant shift of end temperature between the sizes, the two lines differ by at most **B**/2 at every colour from 75 to 45, or the record says T14 FAILED, Stage 2 does not start, and the roaster's choice among the fallbacks (open decision 11) is written down before any further roast | | | |
| AC-RUN-5 | D14 | `/test-engineer` | Stage 2: ladders | `npm run dialin:check 2` | Each of the 8 calibration beans has roasts that reach each of the four targets (a Hit, G1) at 50.4 g with colour readings, a blind 3-cup flavour score and roast quality for each, with the cupping at 24 hours plus or minus 6 recorded | | | |
| AC-RUN-6 | D14 | `/test-engineer` | Stage 2: gold levels | `npm run dialin:report` | Every bean has a reference level from G5 with its basis, or a recorded tie with the roaster's decision; a bean with a level below **F** says "not offered at that level" | | | |
| AC-RUN-7 | D14 | `/test-engineer` | Stage 2c: profile comparison | `npm run dialin:check 2c` | Three beans each have the reference level roasted on two profiles and cupped; the comparison table is in the results; the T9 decision (rule or "no evidence yet") is recorded with the reason | | | |
| AC-RUN-8 | D14 | `/test-engineer` | T7 before Stage 3 | `npm run dialin:report` then `npm run dialin:predict` | The new ladder's leave-one-bean-out colour error at full size is lower than the baseline's; the Stage 3 prediction is time-stamped before the first Stage 3 roast. If not lower, the results say what to do and Step 5 does not ship the ladder | | | |
| AC-RUN-9 | D14 | `/test-engineer` | Stage 3: translation | `npm run dialin:check 3` | 8 full-size reference-level roasts with readings, each, when T14 passed, made on a profile whose body equals its bean's 50.4 g ladder profile (`sameProfileBody`: only the level and the batch size differ); T6 evaluated (at least 6 of 8 within **B**); the results state whether the step is shared across beans or per bean | | | |
| AC-RUN-10 | D14 | `/test-engineer` | Stage 3b: full ladders at 151.2 g | `npm run dialin:check 3b` | Two beans have all four levels at 151.2 g, each judged by G3 and G7; any level that fails is shown with its measured error | | | |
| AC-RUN-11 | D14 | `/test-engineer` | The results document | Code review: `docs/calibration-results.md` | Each of T1 to T12 has its measured value, PASS or FAIL and the date; derived numbers only, with beans as slots; a failed gate is written as a result, not removed | | | |
| AC-RUN-12 | D15 | `/test-engineer` | Stage 4: held-out bean | `npm run dialin:check 4` | The prediction (profile, four levels, expected colours, **B**) is time-stamped before the first of the 4 roasts at 151.2 g; T8 is evaluated exactly as defined, including each miss; the roasts are cupped and G6 applied | | | |
| AC-RUN-13 | D15 | `/test-engineer` | What the data do not show | Code review: the Stage 4 section | States the limits plainly: one held-out bean and four roasts are a smoke test; a single taster; one machine; the profile families and altitude bands not covered; T9's sample size | | | |
| AC-RUN-17 | D14 | `/test-engineer` | Stage 3c: the sample matches the bag (T13) | `npm run dialin:check 3c`; `npm run dialin:report` | For each of two beans, a 50.4 g and a 151.2 g roast of the reference level on one day at the card's settings, each with a colour reading and a blind 3-cup flavour score and quality, cupped together; the colour difference and the flavour difference are reported against **B** and **N**; a miss is recorded with its size and the card's sample line says the sample is not representative until fixed | | | |
| AC-RUN-14 | D14 | `/test-engineer` | Gold level by default (T11) | `npm run dialin:report` | The table of each bean's cupped gold level against its measurements (process, altitude, density, moisture) is in the results; T11 is evaluated as defined; the outcome (a default gold, or one cupping per new bean) is recorded with the numbers it rests on | | | |
| AC-RUN-15 | D15 | `/test-engineer` | Bean cards for all nine beans | `npm run dialin:card` for each slot | Each of the nine has a card with every field of P1 and the basis of P2; the cards for the three beans measured at 151.2 g on all four levels say so, the others show translated levels as translated; each level's resolution meets T10 or says it is not resolvable | | | |
| AC-RUN-16 | D22 | `/test-engineer` | Stage 5: the reference-profile edit trial | `npm run dialin:check 5` | Two beans each have the edited file loaded in Studio and compared with its base, 2 edited roasts and the unedited gold roast again on one day at 50.4 g, all cupped blind; `chooseReferenceProfile` is run on them and its answer recorded; an adopted edit has its ladder, a re-picked gold and its reference level roasted at 151.2 g beside a 50.4 g roast the same day (the full-size condition of T12; the card keeps one profile for both sizes); a refused edit is recorded as tried with the failing condition; whether the machine followed the edited curve is stated (tracking against the requested curve, as in the earlier protocol) | | | |

## Step 5: Ship

Builds D16, D17, D18, D19, D20, defined in [the plan](nano7-calibration-plan.md#step-5-ship). Ships only if AC-RUN-8, AC-RUN-9 and AC-RUN-12 pass.

| AC | Plan ref | Role | What | How | Pass | Agent | QC | Reviewer |
|----|----------|------|------|-----|------|-------|----|----------|
| AC-FN-16 | D16 | `/backend-architect` | `dialIn.ts` | Test run: `npm test -- test/dialIn.test.ts` | Given a bean, a target and a batch size it returns profile, level, end temperature, expected colour, **B** and the basis it rests on (readings of that size, translation, or the approximation); with measurements but no readings it degrades to today's answer and says so | | | |
| AC-FN-17 | D16 | `/backend-architect` | Used by level placement | Test run: `npm test -- test/startingProfiles.test.ts test/dialIn.test.ts` | `placeColour`, `selectStartingProfile` and `level-for` use it only when a batch size is known; without one their output is identical to before (compared with the old functions over a grid) | | | |
| AC-FN-25 | D16 | `/backend-architect` | Batch size is not a level change | Test run: `npm test -- test/dialIn.test.ts test/rules.test.ts` | Two versions of one profile that differ only in the level offset between the sample and the bag size do not count toward the three level changes and are never compared as if one were advice for the other; advice for a bean reads roasts of one batch size; every existing rules test passes unedited | | | |
| AC-FN-18 | D16 | `/backend-architect` | The profile rule from density and moisture | Test run: `npm test -- test/dialIn.test.ts` | The rule exists in code only if AC-RUN-7 recorded a pass; otherwise a test asserts the profile equals today's `selectStartingProfile` pick for every combination of density and moisture | | | |
| AC-DOC-2 | D17 | `/backend-architect` | `docs/RULES.md` | Test run: `npm test -- test/rulesDoc.test.ts test/voice.test.ts test/terminology.test.ts`; `npm run rules:steps` | The tests pass; the changed section 6, the reference and QC text, and "flavour is recorded and no rule reads it" are present; the regenerated step table has no diff | | | |
| AC-TST-9 | D18 | `/test-engineer` | End-to-end scenario | Test run: `npm test -- test/dialIn.test.ts`; `npm run station:check` | From a bean's measurements through its ladder, a reference pick and a QC of a production roast, on made-up logs, each step's `say` is finished text and each `onYes` is a runnable command; `station:check` needs its stale temporary folder moved aside first (not deleted) | | | |
| AC-DOC-3 | D19 | `/project-manager` | `docs/bean-onboarding.md` | Walkthrough: follow it on one Stage 2 bean | Each step names its command and its pass condition; following it reproduces that bean's recorded ladder and reference; the first production batch at each level is read and, outside **B**, corrected once by the measured error and recorded; two misses in a row on the same side re-fit that bean's step; the QC against the reference uses G7; the reference-profile steps R1 to R9 are there, including the cap of 3 edits per bean and that the tool judges an edit but never chooses one; it states how many roasts the bean took (P6) | | | |
| AC-COV-2 | D20 | `/project-manager` | Roadmap, changelog, version, README | Code review | ROADMAP item 6 links the plan and states the status; CHANGELOG has one entry per merged PR; `package.json` and `package-lock.json` versions match; README (and any other doc that restates the feature) points to the same facts; every count, threshold and command in the plan and ACs was re-grepped against shipped code and docs (a renamed function or a changed count is fixed in all places) | | | |
| AC-DOC-4 | D20 | `/project-manager` | Plan and ACs match what shipped | Grep each function name, command, file path and threshold value in both docs against the code | Every one matches the shipped code exactly; a changed one is updated in the docs, not reverted in code | | | |
| AC-DOC-5 | D20 | `/project-manager` | Review additions have their own rows | Code review: the plan's deliverables table | Any change a review round forced beyond D1 to D23 has its own deliverable ID and AC (Agent cell names the review round), and the coverage check was re-run | | | |

## Cross-cutting

| AC | Plan ref | Role | What | How | Pass | Agent | QC | Reviewer |
|----|----------|------|------|-----|------|-------|----|----------|
| AC-COV-1 | cross-cutting | `/project-manager` | Plan and ACs cover each other (Gate 1 by hand: this repo has no validator) | Run the check in the ACs' footer (a script that lists D-ids in the plan and in the Plan ref column) | Every deliverable D1 to D23 has at least one AC; every AC names a Plan ref in D1 to D23 or `cross-cutting` and a Role that is not empty or a dash | | | |
| AC-REG-1 | cross-cutting | `/test-engineer` | The existing suite | Test run: `npm test` | 0 failures; the number of passing tests is at least the number at branch start plus the new tests; no existing test edited except D17's | | | |
| AC-REG-2 | cross-cutting | `/devops` | Types | Test run: `npx tsc` | 0 errors | | | |
| AC-DOC-6 | cross-cutting | `/project-manager` | No names in the public repo | `/oss-doc-review`; a search of every changed file for each name in the git-ignored slot map | Zero findings; zero hits for any bean, lot, invoice or log name in a committed file (a hit is a defect, including in a test's output or a commit message); the map itself is not committed | | | |
| AC-FN-19 | cross-cutting | `/backend-architect` | Layering | Code review: imports | Nothing under `src/core` imports from `src/adapters`; machine specifics (levels, end temperatures, batch multipliers, the log's fields) live in `src/adapters/kaffelogic`; no fitted coefficient is a constant in the code | | | |

---

## Gate 1 check (by hand)

This repo has no coverage validator. The check is: list the `D<n>` ids that open a row of the plan's deliverables tables, list the `AC-*` rows
here with their Plan ref and Role, and confirm every deliverable appears as some AC's Plan ref, every Plan ref is a listed deliverable or `cross-cutting`, no
Role is empty or a dash, and no AC id repeats. Run when this document was written: 23 deliverables, 65 ACs, none uncovered, none orphaned, no duplicate ids.
Re-run it after any change to either document (AC-COV-1).

## Agent Notes

*Verification sub-agent writes here.*

## QC Notes

*Main thread writes here.*

## Reviewer Feedback

*Human fills this section during review.*

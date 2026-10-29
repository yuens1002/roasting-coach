# Hypotheses and rule boundaries from one bean's roasts (2026-10-28)

Draft for review. Nothing here changes a rule. It records what six roasts of one bean can and cannot say
about the theory behind the thermal dose, and where the current rules stop. The evidence is one bean, one
Nano 7, one taster and unblinded cups, so each statement below is a hypothesis with the result that would
count against it, not a finding. This follows `docs/thermal-dose-writeup.md`, which already says that
thermal dose is not claimed to predict the cup.

## What was run

One washed bean, one pour-over brew, every cup tasted on the roast day. Roasts 1 to 3 are 100 g batches;
roasts 4 to 6 are 50 g batches (roast 6 is 51 g). Colour is the Agtron meter's reading.

| Roast | Curve | Level | Thermal dose | Colour | Reads as | Quality |
|---|---|---|---|---|---|---|
| 1 | K-logic classic | 3.0 | 13.15 | 42.5 | scorched | 2 |
| 2 | K-logic classic | 2.6 | 11.72 | 47.2 | clean | 3 |
| 3 | classic with a steeper climb after 5:00 | 2.6 | 9.78 | 47.5 | scorched | 2 |
| 4 | K-logic classic | 2.8 | 11.53 | 47.3 | clean | 3 |
| 5 | classic lowered 1.0 to 2.0 °C from 2:55 | 2.8 | 11.28 | 48.5 | clean | 3 |
| 6 | same curve as roast 5 | 2.4 | 10.27 | 52 | clean | 3 |

Roasts 4 and 5 were stopped at the start of second crack; roast 6 was meant to stop before it, but no second
crack was timed. Roasts 1 to 5 were coloured on whole beans (roasts 1 to 3 as the mean of three or
five readings); roast 6 on ground coffee.

## How much noise there is

| Measure | Rough size | Basis |
|---|---|---|
| Agtron, whole beans | 3 or more | spreads of 2.5, 6.2 and 7.5 inside one sample |
| Agtron, ground | about 1 | spreads of 0.1 (roast 6) and 1.7 (roast 5) |
| First-crack time | 15 to 25 s run to run | roasts 5 and 6 ran the same curve and cracked at 358 s and 330 s; roast 4 cracked at 334 s |
| Weight loss | about 0.3 points | 0.1 g scale step on about 8.6 g lost, plus the green weighing |
| Cup note | not known | one unblinded tasting each, day 0 |

**Measurement check.** Ground readings of roasts 4 and 5 (48.2, and 47.8 and 49.5) sat within 1 point of their
whole-bean means (47.3 and 48.5). On this meter and coffee the two methods agreed inside the noise, and ground
readings scattered less, so ground (two readings per roast) is the method from here. The tool stores only
"meter" or "roast colour card", so it cannot record which a reading was.

## Facts the roasts support

- A level is an end temperature on the profile's curve (classic: level 1 is 215 °C, 2 is 222 °C, 2.4 is
  224 °C, 2.8 is 226 °C, 3.5 is 229 °C). Colour follows the temperature the roast ends at, within a profile.
  It is not a direct colour setting: level 2.6 on 100 g and level 2.8 on 50 g gave the same colour, because
  the beans lagged the curve differently.
- On one profile, thermal dose rises steadily with level, about 3 per level step, but is not proportional to
  it. Classic's predicted thermal dose is 5.70, 8.97, 10.15, 11.45 and 13.70 at levels 1.0, 2.0, 2.4, 2.8 and
  3.5; thermal dose divided by level falls from 5.70 to 3.91. The same level gave different measured values
  of thermal dose (level 2.6: 11.72 and 9.78; level 2.8: 11.53 and 11.28).

## Hypotheses, and what would count against each

| # | Hypothesis | What the roasts show | Would count against it |
|---|---|---|---|
| H1 | Thermal dose orders roasts by degree of roast, whatever the curve. | Roasts 1, 2, 4, 5 and 6 lie on one line, about 3.3 Agtron points lighter per unit of thermal dose. Roast 3 reads about 6 points darker than that line gives at its thermal dose (one roast, a whole-bean reading). | Two roasts at about the same thermal dose on different curves whose ground colours differ by more than about 2 points. Roast 3 is one candidate, not yet repeated. |
| H2 | A coffee's clean cups lie in a window of thermal dose, uncooked below it and scorched above. | Clean from 10.27 to 11.72; scorched at 13.15 (fits). Scorched at 9.78, below the window, where H2 expects an uncooked cup. | A repeat of roast 3's curve that tastes clean, or a classic-shaped roast below 10.27 that tastes scorched. A classic-shaped roast near 9.8 that tastes uncooked would support H2. |
| H3 | The profile and level predict the measured thermal dose. | Roasts on a 50 g load landed within 1.4%; roasts on a 100 g load ran 8% to 8.5% above on classic and 2% above on the steeper curve. | A 50 g roast on a known profile and level more than about 3% from its prediction. |
| H4 | The level sets the end temperature, and colour follows it. | Logged drop temperatures of 224.6, 225.2 and 222.9 °C (roasts 4 to 6) came with ground colours of 48.2, 48.7 and 52. | Two roasts that drop at the same temperature and read different colours by more than the ground spread. |

## Boundaries in the current rules

1. **The bracket assumes the cup is ordered by thermal dose.** After roast 6 the tool's summary says every
   defect was scorched "from thermal dose 9.78" and that the roast that clears it "lies with less roasting".
   Four clean cups lie above 9.78 and the other defect lies above them at 13.15. A scorched cup at a low
   thermal dose breaks the ordering the bracket relies on, and the engine has no way to say so.
2. **Equal quality, different cups.** Roasts 2, 4, 5 and 6 are all clean at quality 3. The engine holds
   ("keep this roast as it is") and the table names roast 2 the best because it came first. The differences
   the taster noted live only in the notes, which no rule reads.
3. **A curve edit is a new profile.** Roast 5 was recorded as a version on a different profile, so the
   engine does not know it is classic with one edited curve. The advice text says an edited curve is something
   the tool "can't choose or make yet"; this one was made by hand. After roast 6, the count of level changes
   moved to 1 of 3, because that roast changed only the level from roast 5.
4. **Batch size and a warm start are not recorded.** Overshoot and offset differ by batch size (offset +8%
   and +8.5% at 100 g, +0.7%, -1.4% and +1% at 50 g). Roast 5 ran straight after roast 4 (back-to-back count 1,
   start reference near 32 °C against about 24 °C); the engine reads neither.
5. **The level is not the end point.** The roast ends when the profile curve reaches the level's end
   temperature, and the beans can lag the curve at that moment, so one level gave the same logged end
   temperature on two batch sizes.
6. **Colour method is not recorded** beyond "meter" or "card" (see the measurement check above).
7. **A same-day cup is accepted.** The profile family has no rest days in `docs/RULES.md`, so no rule asked
   for a retaste of cups tasted at 0 days.
8. **Second crack is not recorded.** The log marks first crack only and the roast form has no field for second
   crack, though roasts 4 and 5 were stopped at its start and roast 6 was stopped before it.
9. **Smells during the roast have nowhere to go.** No field takes a smell or its time, so what was noticed
   after first crack on roast 6 (first crack at 5:30) was not recorded.
10. **First-crack marks vary.** Roast 3's first crack is at 261 s and 196.5 °C; the other five are between
    298 s and 358 s and between 200.7 and 203.1 °C. Roast 3's development share (50.6%) rests on that mark.
    Open: whether the engine flags a mark that far from the bean's other roasts.

## Tests worth running (green stock is zero until the next lot is received, due 2026-10-30)

- Roast the steeper-climb curve again at 50 g with the colour read on ground coffee (H1, H2).
- Roast two curves to the same thermal dose of about 11.3 (H1).
- Retaste roasts 4, 5 and 6 after 3 to 5 days and record each as a new tasting on the same roast.
- Roast the roast 5 curve again from a cold machine, to measure first-crack scatter.
- Taste roasts 4 and 5 blind in a triangle test.

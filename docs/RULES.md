# How the advice is decided

This is the rulebook behind every suggestion roasting-coach makes, written in roasting terms so an
experienced roaster can check it without reading any code. If a rule below is wrong, or a choice
we made doesn't match how you'd roast, that is exactly what this page is for: open an issue and
quote the rule and the roast.

The advice is deterministic: the same tasting, roast and history always give the same answer,
word for word. No model judges a curve or a cup. If no rule covers a tasting, the answer is "no
rule covers this", never a guess. The answers state what your roasts and tastings show and what a
rule does about it; they do not give the tool's opinion of the coffee, and a test checks the worked
examples below and further cases for first-person opinion and hedged belief.

**⚠ marks a first guess or an assumption that still needs checking.** There is no research number for
those; they are starting values, kept in one place so they are easy to change.

This page is checked against the code by tests. Rule names, settings, tasting words, rest days, the
worked examples and the step table fail the test suite if they stop matching the program. The
"When" and "What it does" prose is not compared with the code, so read it with the worked examples
beside it; a separate test scans every line of this page outside the worked examples for stance wording
(section 8 lists exactly what is checked).

## 1. What the engine looks at

For the roast just tasted (the most recent roast that has a tasting and a measured thermal dose,
using its newest tasting in the coffee's tasting brew (rule 1); a newer roast without a measured thermal dose
is skipped):

- **The cup:** the taste words, the roast quality (1-5, section 3), how it was brewed, and the
  date it was tasted. How much the roaster likes the cup is not asked and not used: the tool coaches
  the roast, judged by its defects, not a taste. Every tasting of a coffee is of the one brew its roaster chose
  at intake (rule 1), because brew and rest change the cup, not the roast.
- **The roast:** its thermal dose measured from the temperature log (see section 2), the profile
  it ran on, and the calendar days between roasting and tasting.
- **The bean's own history:** every other roast of the same bean that has a tasting in the coffee's
  tasting brew, each judged by its newest tasting in it. Only roasts with a measured thermal dose count. The answer
  says how many earlier roasts were left out for having no tasting in that brew.
- **Facts about the machine's profiles:** which stock profiles must rest before they are judged,
  and which other profile is suggested for this bean.

**Not used yet:** weight loss, development time ratio, first-crack time or temperature, rate of
rise, colour readings, how the beans looked, ambient temperature, batch size, grind or brew recipe.
Several of these are button presses or have no validated ranges for the Nano, so the rules leave
them out (section 7).

## 2. Thermal dose, in roasting terms

Every step in the rules is a percentage of **thermal dose**. (In coffee, an espresso "dose" means
the grams of ground coffee in the basket. Here it means heat exposure over the roast, so it is
always written "thermal dose".)

**What it is.** How much of the roast's heat-driven chemistry (caramelisation, Maillard
reactions, chlorogenic acid breakdown) has happened. For every second of the roast, the bean
temperature is turned into a reaction rate with the Arrhenius law (activation energy 105 kJ/mol,
the typical fit for those reactions in Bruno et al., Sci Rep 16:15857, 2026), and the rates are
added up. The unit is **equivalent minutes at 200 °C**: a roast with a thermal dose of 10 did as
much as holding 200 °C for ten minutes. Ten degrees hotter does about 74% more chemistry per
minute, so a short, hot roast can do more than a longer one that ends at the same temperature.

**Why not development time ratio (DTR).** DTR needs the first-crack press, which on the Nano is a
button you press, so it carries the timing error of a button press. The altitude profiles measured 30 to 40% DTR on the logs
recorded so far, and other stock profiles state their own targets, so a single textbook "15 to 25%" target
doesn't fit them. Thermal dose comes from the whole temperature trace and needs no button.

**How a percentage becomes a level.** The engine takes the profile's own curve, ends it at the
level you roasted, and measures its thermal dose. It changes that by the step, then finds the level
(in the machine's 0.1 steps) whose curve gives the new figure. Level numbers are an uneven ruler
(section 6 shows how uneven), which is why steps are decided in thermal dose first. When the
nearest level gives a different change than the step (rounded to a whole percent), the engine says
so, for example "The nearest level on this profile gives about 6% less roasting, not 10%".

⚠ **Check this:** real roasts measured 6 to 12.5% *above* what their profile's curve predicts (three
logs). The engine assumes a step on the curve is the same proportion on the real roast. This is
an assumption, checked only against those three logs.

## 3. How tasting words are read

These are the defaults; section 4 says how to give a word your own meaning.

| Reads as | Taste words |
|---|---|
| under | `sour`, `grassy`, `bready` |
| over | `bitter`, `roasty`, `ashy` |
| good | `sweet`, `bright`, `balanced` |

In roasting terms: under means under-roasted (underdeveloped): sharp acidity, green or raw-bread
notes. Over means over-roasted (overdeveloped): bitterness, smoke, ash. Good means nothing wrong.

**Not acted on:** `astringent`, `flat`, `thin`. Each can mean under-development, over-extraction
in the cup, or the shape of the curve (a baked or stalled roast tastes flat), so no rule moves the
roast on them. They count as clean, so a cup with only these words is a 3 or better, and when it is
below the bar the answer is `clean-below-bar` (rule 7).

**Roast quality.** The tasting asks for the quality of the roast, not whether you like the cup. It is
judged by defects, so it can be checked against the words: a cup with a roast defect (an under or an
over word) is a 1 or 2, and a clean cup is a 3 or better. Tastings recorded before this scale existed
held an overall score instead; they are marked unrated and the advice skips them until you rate them
by this scale (`taste:update` with a `quality`).

| Quality | Meaning |
|---|---|
| 1 | a roast defect dominates the cup |
| 2 | a roast defect is there, but doesn't dominate |
| 3 | clean, with little character |
| 4 | clean and expressive |
| 5 | clean, expressive, balanced and sweet |

A flat, thin or monotone cup with no roast defect is a 3, however little you like it. Getting a clean
cup to a 4 is what the levers in rule 7 (level, profile, curve) are for.

⚠ **Check this:** `bitter` can also be over-extraction, and `sour` can be under-extraction, so a cup
can be misread by the brew rather than the roast. Every tasting of a coffee is of one brew (rule 1), so no roast
is tasted as another kind of brew, but the rules do not know your recipe or grind (section 7).
`bready` and `grassy` are treated as equal in weight to `sour`. `bready` can
also come from a baked or stalled roast, which is a curve problem that more roasting does not fix.
A roaster who does not want the rules to act on it can set it to none for their copy
(`calibration:set`, section 4).

## 4. The settings

| Setting | Value | Allowed | Meaning |
|---|---|---|---|
| `stepPct` | 10 | 1 to 50 | ⚠ Thermal dose change when one taste word points the way, as % of the tasted roast's. |
| `strongStepPct` | 15 | 1 to 50 | ⚠ The same when two or more words agree. |
| `strongChipCount` | 2 | 1 to 6 | ⚠ How many agreeing words make the step "strong". |
| `noisePct` | 3 | 0 to 10 | ⚠ Roasts within this % of each other's thermal dose count as the same roasting (batch-to-batch variation). |
| `noResponsePct` | 7 | 1 to 50 | ⚠ A move of at least this % in thermal dose, with the cup unchanged, means the level isn't helping. (The 10% step less the 3% noise.) |
| `plateauSteps` | 2 | 1 to 6 | ⚠ Steps of `noResponsePct` or more, the same way on one profile, at the end of the run without the roast quality improving, before the level counts as tried out. |
| `profileTestRoasts` | 2 | 1 to 6 | ⚠ Tasted roasts on the bean's other profile that make switching to it a fair test. |
| `holdMinQuality` | 4 | 1 to 5 | ⚠ A cup of at least this roast quality, with nothing wrong and at least one good word, is left alone. A clean cup below it gets the list of what else can raise it. |

**Your own values.** The values above and the taste-word table in section 3 are the defaults. They
are first guesses, and how a roaster perceives and names a cup is their own (one roaster's "flat" is
another's "baked"). So each copy of the tool keeps its owner's own values in their own database, and
the rules use those. This is about reading the cup and sizing the method, never about what the
roaster likes. `calibration` shows every setting and word with its
default and whether it is yours; `calibration:set` changes them (a Claude session runs it when you
say, for example, "my steps should be 8%" or "when I say flat I mean under-roasted"). A value is
checked before it is stored: it must be inside the allowed range, `strongStepPct` can't be smaller
than `stepPct`, `noResponsePct` can't be bigger than `stepPct` (or the tool's own steps would not count
as real moves), `noisePct` must be smaller than `noResponsePct` (or noise would count as a move), and a taste word can be set to under, over, good or none (the rules don't act on
it). Setting a value back to the default, or to null, removes your override. Every answer from
`advise` lists your departures from this page under `personal`, so you can see why it differs.
Not personal yet: the rest days and the profile facts.

**Rest days.** Kaffelogic's "Rest" profiles are written for resting before brewing; the "RTD"
(ready to drink) profiles are built to be drunk within a day or two and have no rest to wait for.

| Profile | Rest before brewing (days) |
|---|---|
| `0-1200m Rest` | 3 to 5 |
| `1200-1500m Rest` | 3 to 5 |
| `1500-2000m Rest` | 3 to 5 |
| `2000-2700m Rest` | 3 to 5 |

A profile you edited or copied (for example one named after your bean) uses the rest days of the
stock profile it was built from.

## 5. The rules, in the order they are tried

The first rule that applies gives the answer; the rest are not looked at. Every possible answer is
listed here:

| Order | Answer | In short |
|---|---|---|
| 1 | `tasted-in-other-brew` | The roast was not tasted in the coffee's tasting brew: ask for a retaste in it. |
| 2 | `quality-vs-words` | The roast quality and the taste words disagree about a defect: ask which is right. |
| 3 | `mixed-signals` | Sour and bitter together: ask, change nothing. |
| 4 | `tasted-too-soon` | Sour cup tasted before a Rest profile's rest is over: hold, retaste. |
| 5 | `under-roasted` | Under-roasted cup, nothing earlier to learn from: step more roasting. |
| 5 | `under-roasted-bracketed` | An earlier roast tasted over-roasted with more roasting: go halfway. |
| 5 | `under-roasted-contradicted` | An earlier roast contradicts this one: ask. |
| 6 | `over-roasted` | Over-roasted cup, nothing earlier to learn from: step less roasting. |
| 6 | `over-roasted-bracketed` | An earlier roast tasted under-roasted with less roasting: go halfway. |
| 6 | `over-roasted-contradicted` | An earlier roast contradicts this one: ask. |
| 5, 6 | `level-not-helping` | The level moved and the cup didn't: try the other profile, or ask. |
| 7 | `clean-below-bar` | A clean cup below the bar: nothing for the level to fix, so list what else can raise the quality. |
| 8 | `keep-as-is` | A clean cup of good quality that tasted good: hold. |
| 9 | `no-rule` | Nothing above applies: say so and ask. |

Each worked example below is the engine's own wording for the evidence described.

### 1. `tasted-in-other-brew`

**When:** the roast has no tasting in the coffee's tasting brew: every tasting of it was of another brew.
The tasting brew is the one the roaster names at intake, whatever it is: their own usual brew. Every
tasting of the coffee is of that one brew. The roaster can name a different one at any time; the tastings
already recorded stay as they were.
**What it does:** asks; changes nothing. A roast counts by its newest tasting in the tasting brew whenever it
has one, so a retaste in that brew answers the question. Earlier roasts with no tasting in it are left out of
the comparison, and the answer says how many. A tasting left without a brew is recorded in the tasting brew.
**Why:** rest and brew change the cup, not the roast. A filter cup and an espresso shot of
the same roast differ for reasons that are not the roast, so every roast of a coffee is tasted the same way. This is why
rest and brew are not levers in rule 7: the tool coaches the roast, and it holds these two steady instead of
advising on them. Which brew is the roaster's to say: what a roaster brews at home differs from one roaster to the
next, and the tool does not aim the roast at it. A roaster with no usual brew is pointed to filter coffee, the easiest cup to make
the same way each time with inexpensive equipment. The roast is coached toward the best result for the bean's own
properties, whatever the brew.

> Example: sour, tasted as pour over, when espresso is the coffee's tasting brew. "This roast was tasted brewed as pour over. Roasts of this coffee are tasted as espresso, so that a difference in the cup is not a difference between kinds of brew. Taste this roast brewed as espresso and record that tasting, then ask again."

⚠ **Check this:** the rules hold the brew the same from roast to roast; they do not correct for what a brew does to
the cup. A roaster whose brew changes what one of the taste words means for them can set that word's meaning for
their copy (section 3). Days of rest still differ between
tastings: rule 4 holds an early sour cup, and rule 7 says when the tastings of a run were on different
days of rest.

### 2. `quality-vs-words`

**When:** the roast quality and the words disagree about whether the cup has a roast defect: an under
or over word (as read in section 3, your own meanings included) with a quality of 3 or more, or no
such word with a quality of 1 or 2.
**What it does:** asks which is right; changes nothing. It comes right after the brew check, ahead of every
rule that reads the taste words, because advice built on a contradiction would be wrong whichever half was the mistake.
**Why:** quality is judged by defects (section 3), so the two answers describe the same thing. When
they disagree, one was entered wrongly, or the quality was given for how the cup tasted to the
roaster, which this tool doesn't use.

> Example: ashy, rated roast quality 4. "You rated the roast quality 4 (clean and expressive), but the cup tasted ashy, which is a roast defect. A cup with a roast defect is a 1 or 2; a clean cup is a 3 or better. Which is right? Correct whichever is wrong and I'll go on from there."

### 3. `mixed-signals`

**When:** the cup has at least one under word and at least one over word.
**What it does:** asks; changes nothing.
**Why:** sharp and burnt together means the roast was uneven: scorched outside with an underdeveloped
inside, or some beans taken too far while others weren't, which a level change does not address.
The curve is what changes how evenly the heat is applied.

> Example: tasted sour and bitter. "The cup tasted both sour (under-roasted) and bitter (over-roasted). That is the pattern of an uneven roast, which a level change does not address: some beans went too far while others didn't go far enough. Check how the beans looked after the roast (uneven colour, dark tips) before changing anything; the curve is what changes how evenly the heat is applied."

✔ **Settled by the roaster:** sour and bitter can't come from one good roast, so a cup that tastes
both is a roasting fault, not a brewing one. Uneven extraction (channelling) is deliberately not
considered here; the message addresses the roast.

### 4. `tasted-too-soon`

**When:** the cup has under words and no over words; the roast used a Rest profile (section 4); and
it was tasted fewer calendar days after roasting than the profile's minimum rest. Day 3 counts as
ready for a 3-day profile.
**What it does:** holds. No new version; retaste on the first day of the rest window.
**Why:** a Rest profile is written for several days of rest. A cup tasted before then is not a
reading of the roast the profile describes, so a change made from it would rest on a cup the profile
has not finished.

> Example: sour, on 1500-2000m Rest, tasted 1 day after roasting. "The cup tasted sour, but this roast's profile (1500-2000m Rest) is written for 3 to 5 days of resting before brewing, and it was tasted 1 day after roasting. The rest the profile asks for is not over. Taste it again on day 3 or later before changing anything. No new version is needed."

⚠ **Check this:** only sour-side cups are held (rest doesn't explain bitter or ashy). The rule
treats sourness as what an early taste shows. It has no way to know that a coffee needs longer than
the profile's window. RTD profiles are never held, even for a day-0 tasting.

### 5 and 6. `under-roasted` and `over-roasted`

**When:** the cup has words on one side and none on the other, and rules 1 to 4 didn't apply. The
two sides are mirror images: under-roasted moves toward more roasting, over-roasted toward less.
Within a side, the first of these that applies wins:

1. **Contradicted** (`…-contradicted`): an earlier tasted roast of this bean tasted the *other*
   side, but it had the same roasting (within `noisePct`) or was on the wrong side of this one (for
   example less roasting yet more roasted-tasting). Asks, changes nothing.
2. **Bracketed** (`…-bracketed`): an earlier roast tasted the other side, with more roasting
   than this one (for under-roasted; less for over-roasted), beyond the noise. The step goes
   halfway to it in thermal dose. Uses the nearest such roast.
3. **Level not helping** (`level-not-helping`, below).
4. **A plain step** (`under-roasted`, `over-roasted`): `stepPct` for one word, `strongStepPct` for two
   or more words on that side.

> Example, under-roasted step: sour and grassy, no earlier roasts. "The cup tasted sour and grassy, which means the beans were under-roasted. Roast about 15% more. That is level 3.3 (ends at 224.6 °C), up from level 3 (223.4 °C). Shall I record it as the next version?"

> Example, over-roasted step: ashy, no earlier roasts. "The cup tasted ashy, which means the beans were over-roasted. Roast about 10% less. That is level 2.7 (ends at 222.2 °C), down from level 3 (223.4 °C). Shall I record it as the next version?"

> Example, bracketed: grassy; an earlier roast with 20% more roasting tasted bitter. "The cup tasted grassy (under-roasted), while an earlier roast with 20% more roasting tasted bitter (over-roasted). Halving the gap between them: about 10% more roasting. That is level 3.3 (ends at 224.6 °C), up from level 3 (223.4 °C). Shall I record it as the next version?"

> Example, bracketed (other side): bitter; an earlier roast with 20% less roasting tasted sour. "The cup tasted bitter (over-roasted), while an earlier roast with 20% less roasting tasted sour (under-roasted). Halving the gap between them: about 10% less roasting. That is level 2.7 (ends at 222.2 °C), down from level 3 (223.4 °C). Shall I record it as the next version?"

> Example, contradicted: grassy; an earlier roast with 20% less roasting tasted bitter. "This cup tasted grassy (under-roasted), but an earlier roast with 20% less roasting tasted bitter (over-roasted). That runs against the expected direction: the roast with less roasting should not taste more roasted. So something other than the roast differs between them: the days of rest or the batch. Find out which before changing the roast."

> Example, contradicted (other side): bitter; an earlier roast with 20% more roasting tasted sour. "This cup tasted bitter (over-roasted), but an earlier roast with 20% more roasting tasted sour (under-roasted). That runs against the expected direction: the roast with more roasting should not taste less roasted. So something other than the roast differs between them: the days of rest or the batch. Find out which before changing the roast."

⚠ **Check this:** the step sizes (10% and 15%) are starting values, and one word is weighed the same as
another. Section 6 shows how many levels each step moves on every stock profile.
The roast quality isn't used to size a step. The halfway rule assumes the roast that clears both defects lies between a sour
roast and a bitter one; both were tasted in the coffee's tasting brew (rule 1), but their days of rest can differ.

### `level-not-helping` (inside rules 5 and 6)

**When:** the cup is on one side, no earlier roast of this bean tasted the other side, and an earlier roast
of this bean **on the same profile** (same curve and settings, compared by content; an edited copy
of a stock profile is a different profile, and where the content isn't known the names are compared)
tasted the same side with at least `noResponsePct` less roasting
(for under-roasted; more for over-roasted). The level has moved the roast and the cup has stayed on the same side.
**What it does:** suggests the bean's other profile (the alternative worked out from the bean's
process and altitude as they are recorded now), at the level the tool starts that profile at. The comparison is with the first earlier roast on this profile that qualifies, not necessarily
the one just before. It won't send you back to a profile that already has a tasted roast with a
measured thermal dose for this bean (an untasted roast isn't counted, so check the history yourself);
if there isn't an alternative, or you've used it, it asks instead and says the next lever is the
curve, which this tool can't edit yet.
**Why:** one lever at a time. The level has been moved a real distance and the cup stayed on the same side,
so the next lever the rule names is the profile's shape (how fast heat goes in and how long the beans
develop), which the level does not change. The rule does not rule out a difference in rest or batch
between the two roasts.

> Example: sour on KL Washed after a roast with 10% less roasting also tasted sour; 1500-2000m Rest is the alternative. "The cup tasted sour (under-roasted) even after the roasting went 10% more than an earlier roast on this profile, which tasted sour too. The level moved the roast and the cup stayed on the same side. Next, try 1500-2000m Rest instead: pick it on the Nano and set level 3.2 (ends at 222.4 °C). Shall I record that as the next version?"

⚠ **Check this:** this is judged from **one** unsuccessful step. A small first step is thin
evidence, so the switch can come earlier than two steps would give. Requiring two unsuccessful steps
would mean counting a run of them on the same profile. The same logic is applied to bitter cups (less roasting, still bitter),
which is an extension of the rule as first written. The alternative profile is started at its own suggested level, not matched
to the thermal dose of the roast it replaces.

### 7. `clean-below-bar`

**When:** the cup has no under or over word (rules 1 to 6 didn't apply) and the roast quality is below
`holdMinQuality`. Because of rule 2 the quality is then 3 or more: the cup is clean but short of the bar.
**What it does:** asks; changes nothing. The level can only fix a defect, and a defect word is what shows
which way to move it; a clean cup gives it no direction. So the answer lists every lever that changes the
roast, each with what it changes and what the recorded roasts say about it. The level is in the list,
with the steps it has taken on this profile and whether the last ones raised the quality. Rest and brew
are not in it: they change the cup, not the roast, and rule 1 keeps the brew the same between roasts.
**Why:** this is the cup the other rules had no answer for: nothing wrong with the roast, and a roast quality
below the bar. Saying "no rule covers this" would give the roaster nothing to act on, so the answer says what can
be tried and what each try costs.

Each lever is in one of five states, read from the roasts and tastings, never guessed:

| State | Meaning |
|---|---|
| moving | changing it improved the roast quality |
| exhausted | tried in a fair test with no gain |
| unclear | tried, but too small a test to rule it out |
| untested | not tried yet |
| unavailable | out of this tool's reach |

What each lever changes (these sentences are what the answer says):

| Lever | What it changes |
|---|---|
| `level` | Moves the end temperature, so the whole roast goes further or less far, by a measured amount of thermal dose; the shape of the curve stays as it is. |
| `profile` | Changes the curve's shape (how fast heat goes in and how long the beans develop), not only where the roast stops. |
| `curve` | The same as a profile change, made by editing the curve yourself. |

How each is judged:

- **Level.** The run of real steps (each a move of `noResponsePct` or more in thermal dose, the same way, on
  the latest roast's profile: same curve and settings, as above) ending at this roast. The level is *moving*
  if the last step raised the quality; *exhausted* if the last `plateauSteps` steps did not and the quality is
  below the bar; *unclear* if fewer steps than that did not; *untested* with no step yet. Only the steps at
  the end count, so a defect removed early in the run doesn't hide a stall since. The same level roasted
  again (a move inside the band) counts once, by its later roast, and is walked past: re-roasting a version
  doesn't erase the steps before it. The run goes one way only, so the answer says which way it was tried.
- **Profile** is *untested* while the bean's other profile hasn't been roasted, *unavailable* when there is
  none to suggest. A renamed copy of it (the same curve and settings, judged by content) counts as a
  roast on it, not as the other profile. Once it has been roasted it is *moving* if its best roast beat the best on the other
  profile, *exhausted* if it has at least `profileTestRoasts` tasted roasts, there is a roast on the other
  profile to compare with, and none beat it, and *unclear* otherwise (too few roasts, or nothing on the
  other profile to compare with). The verdict below stays open until the profile is exhausted or unavailable.
- **Curve** is always *unavailable*: this tool can't edit it yet.

**The verdict.** While any lever the tool can reach is still to try, the answer says so ("Still to try before the coffee can be named as the limit"). Only when every one is exhausted or unavailable does it say what is left: the curve, or the
coffee itself, which a ladder of levels can't tell apart (and it says the level was tried in the direction it
went). It never says the coffee can't do better. If the
roaster has given a reference for the coffee (the supplier's or producer's description, or their own cup),
the answer quotes it and says to compare the cup against it; with none, it says nothing about one.

```
"The cup is clean: no roast defect, so there is nothing for the level to fix. The roast quality is 3 (clean, with little character), below the bar of 4. What can raise it:
- level (exhausted): Moves the end temperature, so the whole roast goes further or less far, by a measured amount of thermal dose; the shape of the curve stays as it is. 3 steps less roasting on this profile (thermal dose 12 to 8.7, about 27% less); the roast quality was 2, 3, 3 and 3. The last 2 steps did not raise it.
- profile (unavailable): Changes the curve's shape (how fast heat goes in and how long the beans develop), not only where the roast stops. No other stock profile is suggested for this bean.
- curve (unavailable): The same as a profile change, made by editing the curve yourself. This tool can't edit a curve yet. If you edit one in Kaffelogic Studio, tell me and I'll record the roast as a new version.
Everything this tool can move has had a fair test, the level in the direction it was tried. What is left is the curve, which the tool can't edit yet, or the coffee itself; a ladder of levels can't tell those two apart. Your reference for this coffee is "Lively and fruit-forward". Compare the cup against it."
```

Example: flat, clean, roast quality 3, the day after roasting, pour over, after three steps of about 10% less roasting (the first roast was ashy, quality 2; then 3, 3, 3); a reference of lively, fruit-forward; no other profile to suggest.

⚠ **Check this:** two steps (`plateauSteps`) is a first guess for "a fair try". The tastings in a run can be
on different days of rest, which can blur the comparison; the answer says when they were. A clean cup gives the level no direction, so a further step is only a probe for the
edge of the clean zone (where a defect word first appears); it costs a roast and the answer says so.

### 8. `keep-as-is`

**When:** no under or over words, at least one good word, and a roast quality of `holdMinQuality` or more.
**What it does:** holds; no new version.

> Example: sweet and balanced, roast quality 4. "The cup tasted sweet and balanced and the roast quality is 4 (clean and expressive). Keep this roast as it is. No new version is needed."

### 9. `no-rule`

**When:** none of the above applies. With the rules above, that is a clean cup at or above the bar whose
words include no good word (for example only `thin` or `flat` with a quality of 4).
**What it does:** says no rule covers it, names what isn't covered, and asks the roaster what to test next.
It never fills the gap with a guess. If no word can be named at all, it says "Nothing in this tasting points
to a change a rule can make" instead.

> Example: thin, roast quality 4. "No rule covers thin yet, and nothing else in this tasting points to a change. Ask the roaster what to test next."

## 6. What a step means on each stock profile

The steps are percentages of thermal dose, but you set a level on the machine. A step moves a different number of
levels depending on where you stand on the level scale, so this table gives a range for each profile, not one
number: for every level a bean can start at on that profile before the roaster has any colour readings (from the lightest to the
darkest colour on the Agtron scale, below), how many levels a 10% or 15% step in either direction moves, the fewest to the most.
It is measured from the stock profile files, not estimated. It does not predict a change in the cup: the steps are
starting values, and your cup judges whether one was right. A start at the very lightest or darkest end of a profile, where a
step would run past level 0 or level 6 (the advice would stop at that level), is left out of the range rather than counted as a
step of no levels.

It names no single starting level on purpose. The colour you are shooting for can change from bean to bean and from
roast to roast, and the level you are at comes from your own cups, not from the first roast. The engine steps from the
level of the roast you tasted, not from any row here. Colour readings move where on a profile a colour lands, not the
profile's level scale, so a roaster who starts from a level outside the range gets the same arithmetic, which this
table does not list.

How to read it: the level scale is uneven. On the same profile, a step can be a tenth of a level at one place on the scale and
more than a full level at another; on some profiles several levels differ by only a degree. Check the end temperature the
machine shows for the level you choose. Where two levels give the same thermal dose to within the 0.1 level grid, a step
cannot tell them apart.

<!-- steps:start -->
| Profile | Starting levels | −15% | −10% | +10% | +15% |
|---|---|---|---|---|---|
| 0-1200m RTD | 0.3 to 5.5 | 0.2 to 1.2 | 0.1 to 1.0 | 0.1 to 0.9 | 0.2 to 1.1 |
| 0-1200m Rest | 0.0 to 6.0 | 0.3 to 1.2 | 0.2 to 1.0 | 0.2 to 1.0 | 0.2 to 1.2 |
| 1200-1500m RTD | 0.0 to 5.5 | 0.2 to 1.2 | 0.1 to 1.1 | 0.1 to 1.0 | 0.2 to 1.2 |
| 1200-1500m Rest | 0.0 to 6.0 | 0.2 to 1.1 | 0.1 to 0.9 | 0.1 to 0.8 | 0.1 to 1.1 |
| 1500-2000m RTD | 0.4 to 6.0 | 0.3 to 1.1 | 0.2 to 0.7 | 0.2 to 0.7 | 0.2 to 0.9 |
| 1500-2000m Rest | 0.7 to 5.1 | 0.1 to 1.1 | 0.1 to 0.9 | 0.1 to 0.8 | 0.1 to 1.1 |
| 2000-2700m RTD | 0.6 to 6.0 | 0.3 to 1.1 | 0.2 to 0.7 | 0.2 to 0.7 | 0.2 to 1.0 |
| 2000-2700m Rest | 0.3 to 5.3 | 0.1 to 1.1 | 0.1 to 0.9 | 0.1 to 0.8 | 0.1 to 1.1 |
| KL Washed | 0.7 to 1.2 | 0.2 to 0.3 | 0.1 to 0.2 | 0.1 to 0.2 | 0.1 to 0.3 |
| KL Natural | 0.5 to 1.3 | 0.1 to 0.3 | 0.1 to 0.2 | 0.1 to 0.2 | 0.1 to 0.2 |
| Decaf | 0.0 to 5.1 | 0.2 to 1.3 | 0.1 to 0.9 | 0.1 to 0.8 | 0.1 to 1.2 |
| Robusta | 0.3 to 5.5 | 0.2 to 1.3 | 0.1 to 1.1 | 0.1 to 1.1 | 0.2 to 1.2 |
<!-- steps:end -->

The Cupping profile has no row: it labels one level only, so there is nothing to place a colour between, and the tool never starts a bean on it.

Regenerate with `npm run rules:steps` (it needs the stock profile files in your own library, which
this repository never contains).

⚠ **Check this:** does a 10% or 15% step look like a change worth tasting on a profile you know well? Where the
range reaches a full level or more, check the end temperature the machine shows for the level you set. If a step looks
too small or too large, step sizes can be changed for your copy (`calibration:set`, section 4).


### The first level to try

A new bean's first level comes from the roast colour the roaster is shooting for, on the SCA / Agtron scale, where a
higher number is lighter: 95 very light, 85 light, 75 moderately light, 65 light-medium, 55 medium, 45 medium-dark,
35 dark, 25 extremely dark. Any number from 25 to 95 can be given, a colour-meter reading as it is, and a word is
taken as its tile. The colour is the roaster's aim, not a measurement, and they can restate it at any time. It names no
brew method.

Kaffelogic's levels are end temperatures, and Kaffelogic publishes no table from a level to an Agtron number, so the
tool ties the two in one of two ways, and the answer says which:

- **An approximation, until the roaster has readings.** The three levels a profile's file labels (Kaffelogic's
  filter, espresso and dark levels, read only as three points on the profile's own ladder) are taken as Agtron 65, 55
  and 45. The basis is the Robusta file, which calls them Light/Medium, Medium and Medium Dark; the other profiles are
  assumed to name theirs alike. This is not measured. The level for any other number is found along the ladder, between
  those points and beyond them. A profile whose labelled levels reach no darker than Agtron 55 (KL Washed, KL Natural)
  hands a darker target to the altitude profile. A colour beyond the profile's lightest or darkest level gets that
  level, and the answer says so.
- **The roaster's own readings.** The roast form takes an Agtron reading. With two readings on a profile at end
  temperatures at least 3 °C apart, a later bean's level on that profile is read off the least-squares line through all
  of the roaster's readings on it, across their beans. A line that gets lighter as the end gets hotter is not used.

After the first roast the defects in the cup decide every step, whatever the colour was. The colour is used again only
when the roaster restates it and asks for a level to try (`level-for`), and the level it gives is theirs to accept: it
is recorded as a version only when they say so, with their own words as the reason.

## 7. What the engine does not know

- It doesn't look at the temperature curve itself, only the total thermal dose. Two roasts with the same
  thermal dose but different shapes (fast then slow, or slow then fast) look the same to it.
- It doesn't use weight loss, DTR, first-crack timing, rate of rise, crack-to-end temperature rise,
  or how the beans looked. Some of those (the first-crack press) are button
  presses; none has a validated range for the Nano yet. A colour reading is used only to place a bean's first level
  for a roast colour (section 6), not to judge a roast: a roast that read lighter or darker than its target says nothing to the rules.
- It doesn't know your brew recipe or grind, so it can't tell an under-extracted cup from an
  under-roasted roast. Every tasting of a coffee is of one brew (rule 1) so that the brew is at least the same
  from roast to roast.
- It doesn't know the bean's density, moisture or age beyond what the first profile choice used.
- It can only change the level, or switch to another stock profile. It can't edit a curve yet.
- It treats a bean's earlier roasts as comparable. A different green lot, batch size or ambient
  temperature between roasts isn't accounted for.
- It is built for the Kaffelogic Nano 7. Another roaster would need its own facts (section 4) and
  its own check of these rules.

## 8. Keeping this page right

The rules live in `src/core/rules.ts` and the Nano's facts (rest days, alternatives) in
`src/adapters/kaffelogic/`. Whoever changes a rule, a setting, a taste word, a rest day or a
message updates this page in the same change. `npm test` fails when this page and the program
disagree about: the list of answers, every setting and the range it may be set to, the taste words, the roast quality scale, what each lever changes, the rest days, each
worked example's exact wording, and (where the stock profile files are present) the step table. A separate
test (`test/voice.test.ts`) reads the worked examples, further engine replies, the starting-profile reasons,
the colour-change warnings and every line of this page outside its worked examples, for first-person
opinion, hedged belief and judgments of the coffee. It cannot catch a claim about the world worded neutrally.

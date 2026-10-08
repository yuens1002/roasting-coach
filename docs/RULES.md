# How the advice is decided

This is the rulebook behind every suggestion roasting-coach makes, written in roasting terms so an
experienced roaster can check it without reading any code. If a rule below is wrong, or a choice
we made doesn't match how you'd roast, that is exactly what this page is for: open an issue and
quote the rule and the roast.

The advice is deterministic: the same tasting, roast and history always give the same answer,
word for word. No model judges a curve or a cup. If no rule covers a tasting, the answer is "no
rule covers this", never a guess.

**⚠ marks a first guess or an assumption we'd like checked.** There is no research number for
those; they are our best starting point, kept in one place so they are easy to change.

This page is checked against the code by tests. Rule names, settings, tasting words, rest days, the
worked examples and the step table fail the test suite if they stop matching the program. The
"When" and "What it does" prose is not tested, so read it with the worked examples beside it
(section 8 lists exactly what is checked).

## 1. What the engine looks at

For the roast just tasted (the most recent roast that has a tasting and a measured thermal dose,
using its newest tasting; a newer roast without a measured thermal dose is skipped):

- **The cup:** the taste words, the roast quality (1-5, section 3), how it was brewed, and the
  date it was tasted. How much the roaster likes the cup is not asked and not used: the tool coaches
  toward the best the coffee can do as a roast, not toward a taste.
- **The roast:** its thermal dose measured from the temperature log (see section 2), the profile
  it ran on, and the calendar days between roasting and tasting.
- **The bean's own history:** every other roast of the same bean that has a tasting, each judged
  by its newest tasting. Only roasts with a measured thermal dose count.
- **Facts about the machine's profiles:** which stock profiles must rest before they are judged,
  and which other profile is worth trying for this bean.

**Not used yet:** weight loss, development time ratio, first-crack time or temperature, rate of
rise, colour readings, how the beans looked, ambient temperature, batch size, grind or brew recipe.
Several of these are button presses or have no validated ranges for the Nano, so the rules leave
them out rather than pretend (section 7).

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
button you press, often early or late. The altitude profiles measured 30 to 40% DTR on the logs we
have, and other stock profiles state their own targets, so a single textbook "15 to 25%" target
doesn't fit them. Thermal dose comes from the whole temperature trace and needs no button.

**How a percentage becomes a level.** The engine takes the profile's own curve, ends it at the
level you roasted, and measures its thermal dose. It changes that by the step, then finds the level
(in the machine's 0.1 steps) whose curve gives the new figure. Level numbers are an uneven ruler
(section 6 shows how uneven), which is why steps are decided in thermal dose first. When the
nearest level gives a different change than the step (rounded to a whole percent), the engine says
so, for example "The nearest level on this profile gives about 6% less roasting, not 10%".

⚠ **Check this:** real roasts measured 6 to 12.5% *above* what their profile's curve predicts (three
logs). The engine assumes a step on the curve is the same proportion on the real roast. That is
reasonable for ranking and sizing a step, but it is an assumption.

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
over word) is a 1 or 2, and a clean cup is a 3 or better.

| Quality | Meaning |
|---|---|
| 1 | a roast defect dominates the cup |
| 2 | a roast defect is there, but doesn't dominate |
| 3 | clean, with little character |
| 4 | clean and expressive |
| 5 | clean, expressive, balanced and sweet |

A flat, thin or monotone cup with no roast defect is a 3, however little you like it. Getting a clean
cup to a 4 is what the other levers (rest, brew, profile, curve) are for.

⚠ **Check this:** `bitter` can also be over-extraction, and `sour` can be under-extraction, so a cup
can be misread by the brew rather than the roast. The rules only partly allow for that (espresso,
section 5, rule 4). `bready` and `grassy` are treated as equal in weight to `sour`. `bready` is the
one to look at first: a baked or stalled roast also tastes bready, and that is a problem with the
curve, where more roasting could make it worse. If you'd rather not act on it, set it to none for
your copy (`calibration:set`, section 4).

## 4. The settings

| Setting | Value | Allowed | Meaning |
|---|---|---|---|
| `stepPct` | 10 | 1 to 50 | ⚠ Thermal dose change when one taste word points the way, as % of the tasted roast's. |
| `strongStepPct` | 15 | 1 to 50 | ⚠ The same when two or more words agree. |
| `strongChipCount` | 2 | 1 to 6 | ⚠ How many agreeing words make the step "strong". |
| `noisePct` | 3 | 0 to 10 | ⚠ Roasts within this % of each other's thermal dose count as the same roasting (batch-to-batch variation). |
| `noResponsePct` | 7 | 1 to 50 | ⚠ A move of at least this % in thermal dose, with the cup unchanged, means the level isn't helping. (The 10% step less the 3% noise.) |
| `plateauSteps` | 2 | 1 to 6 | ⚠ Steps of `noResponsePct` or more, the same way on one profile, at the end of the run without the roast quality improving, before the level counts as tried out. |
| `restTestDays` | 3 | 1 to 14 | ⚠ Days between the first and last tasting of one roast that make resting a fair test. (Kaffelogic's Rest profiles start at 3.) |
| `brewTestCount` | 3 | 2 to 6 | ⚠ Different brews of one roast that make changing the brew a fair test. |
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
| 1 | `quality-vs-words` | The roast quality and the taste words disagree about a defect: ask which is right. |
| 2 | `mixed-signals` | Sour and bitter together: ask, change nothing. |
| 3 | `tasted-too-soon` | Sour cup tasted before a Rest profile's rest is over: hold, retaste. |
| 4 | `espresso-sour-only` | Only sour, brewed as espresso: hold, check the shot first. |
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

### 1. `quality-vs-words`

**When:** the roast quality and the words disagree about whether the cup has a roast defect: an under
or over word (as read in section 3, your own meanings included) with a quality of 3 or more, or no
such word with a quality of 1 or 2.
**What it does:** asks which is right; changes nothing. It is tried first, because advice built on a
contradiction would be wrong whichever half was the mistake.
**Why:** quality is judged by defects (section 3), so the two answers describe the same thing. When
they disagree, one was entered wrongly, or the quality was given for how the cup tasted to the
roaster, which this tool doesn't use.

> Example: ashy, rated roast quality 4. "You rated the roast quality 4 (clean and expressive), but the cup tasted ashy, which is a roast defect. A cup with a roast defect is a 1 or 2; a clean cup is a 3 or better. Which is right? Correct whichever is wrong and I'll go on from there."

### 2. `mixed-signals`

**When:** the cup has at least one under word and at least one over word.
**What it does:** asks; changes nothing.
**Why:** sharp and burnt together means the roast was uneven: scorched outside with an underdeveloped
inside, or some beans taken too far while others weren't, which no level change can fix. The cure
is in the curve.

> Example: tasted sour and bitter. "The cup tasted both sour (under-roasted) and bitter (over-roasted). That usually means an uneven roast, which a level change can't fix: some beans went too far while others didn't go far enough. Check how the beans looked after the roast (uneven colour, dark tips) before changing anything; the cure is probably in the profile's curve."

✔ **Settled by the roaster:** sour and bitter can't come from one good roast, so a cup that tastes
both is a roasting fault, not a brewing one. Uneven extraction (channelling) is deliberately not
considered here; the message blames the roast.

### 3. `tasted-too-soon`

**When:** the cup has under words and no over words; the roast used a Rest profile (section 4); and
it was tasted fewer calendar days after roasting than the profile's minimum rest. Day 3 counts as
ready for a 3-day profile.
**What it does:** holds. No new version; retaste on the first day of the rest window.
**Why:** a Rest profile is written for several days of rest. A cup on day 1 may just not be ready,
and changing the roast for it would chase the wrong thing.

> Example: sour, on 1500-2000m Rest, tasted 1 day after roasting. "The cup tasted sour, but this roast's profile (1500-2000m Rest) is written for 3 to 5 days of resting before brewing, and it was tasted 1 day after roasting. It may simply not be ready. Taste it again on day 3 or later before changing anything. No new version is needed."

⚠ **Check this:** only sour-side cups are held (rest doesn't explain bitter or ashy). The rule
assumes sourness is what an early taste shows; it doesn't know your espresso might need longer than
the profile's window. RTD profiles are never held, even for a day-0 tasting.

### 4. `espresso-sour-only`

**When:** brewed as espresso, and the only under word is `sour` (no over words).
**What it does:** holds; the message says to adjust the grind or the shot first, and to roast further
if it is still sour or the next cup also tastes grassy or bready.
**Why:** a shot that runs too fast tastes sour from any roast. The tasting form says as much:
espresso exaggerates sourness.

> Example: only sour, brewed as espresso. "Sour is the one taste espresso can fake: a shot that runs too fast tastes sour from any roast. Adjust the grind or the shot first. If it's still sour, or the next cup tastes grassy or bready too, then roast further. No new version is needed."

⚠ **Check this:** this costs one extra shot if the roast really is under-roasted.

### 5 and 6. `under-roasted` and `over-roasted`

**When:** the cup has words on one side and none on the other, and rules 1 to 4 didn't apply. The
two sides are mirror images: under-roasted moves toward more roasting, over-roasted toward less.
Within a side, the first of these that applies wins:

1. **Contradicted** (`…-contradicted`): an earlier tasted roast of this bean tasted the *other*
   side, but it had the same roasting (within `noisePct`) or was on the wrong side of this one (for
   example less roasting yet more roasted-tasting). Asks, changes nothing.
2. **Bracketed** (`…-bracketed`): an earlier roast tasted the other side, with more roasting
   than this one (for under-roasted; less for over-roasted), beyond the noise. The best roast is
   between them, so go halfway in thermal dose. Uses the nearest such roast.
3. **Level not helping** (`level-not-helping`, below).
4. **A plain step** (`under-roasted`, `over-roasted`): `stepPct` for one word, `strongStepPct` for two
   or more words on that side.

> Example, under-roasted step: sour and grassy, no earlier roasts. "The cup tasted sour and grassy, which means the beans were under-roasted. Roast about 15% more. That is level 3.3 (ends at 224.6 °C), up from level 3 (223.4 °C). Shall I record it as the next version?"

> Example, over-roasted step: ashy, no earlier roasts. "The cup tasted ashy, which means the beans were over-roasted. Roast about 10% less. That is level 2.7 (ends at 222.2 °C), down from level 3 (223.4 °C). Shall I record it as the next version?"

> Example, bracketed: grassy; an earlier roast with 20% more roasting tasted bitter. "The cup tasted grassy (under-roasted), while an earlier roast with 20% more roasting tasted bitter (over-roasted). The best roast is between them, so go halfway: about 10% more roasting. That is level 3.3 (ends at 224.6 °C), up from level 3 (223.4 °C). Shall I record it as the next version?"

> Example, bracketed (other side): bitter; an earlier roast with 20% less roasting tasted sour. "The cup tasted bitter (over-roasted), while an earlier roast with 20% less roasting tasted sour (under-roasted). The best roast is between them, so go halfway: about 10% less roasting. That is level 2.7 (ends at 222.2 °C), down from level 3 (223.4 °C). Shall I record it as the next version?"

> Example, contradicted: grassy; an earlier roast with 20% less roasting tasted bitter. "This cup tasted grassy (under-roasted), but an earlier roast with 20% less roasting tasted bitter (over-roasted). That's backwards: the roast with less roasting shouldn't taste more roasted. So something other than the roast is varying: the brew, the days of rest, or the batch. Worth finding out before changing the roast."

> Example, contradicted (other side): bitter; an earlier roast with 20% more roasting tasted sour. "This cup tasted bitter (over-roasted), but an earlier roast with 20% more roasting tasted sour (under-roasted). That's backwards: the roast with more roasting shouldn't taste less roasted. So something other than the roast is varying: the brew, the days of rest, or the batch. Worth finding out before changing the roast."

⚠ **Check this:** the step sizes (10% and 15%) are first guesses, and one word is weighed the same as
another. Section 6 shows what each step means in level and end temperature on every stock profile.
The roast quality isn't used to size a step. The halfway rule assumes the best roast lies between a sour
roast and a bitter one; it doesn't allow for a different brew having been used for each.

### `level-not-helping` (inside rules 5 and 6)

**When:** the cup is on one side, no earlier roast of this bean tasted the other side, and an earlier roast
of this bean **on the same profile** (same curve and settings, compared by content; an edited copy
of a stock profile is a different profile, and where the content isn't known the names are compared)
tasted the same side with at least `noResponsePct` less roasting
(for under-roasted; more for over-roasted). The level has moved the roast and the cup hasn't changed.
**What it does:** suggests the bean's other profile (the alternative worked out from the bean's
process and altitude as they are recorded now), at the level that profile suggests for the bean's
goal. The comparison is with the first earlier roast on this profile that qualifies, not necessarily
the one just before. It won't send you back to a profile that already has a tasted roast with a
measured thermal dose for this bean (an untasted roast isn't counted, so check the history yourself);
if there isn't an alternative, or you've used it, it asks instead and says the next lever is the
curve, which this tool can't edit yet.
**Why:** one lever at a time. When the level has had a fair chance to fix the cup and hasn't, the
trouble is likely the profile's shape (heat going in too fast or slow for this bean), not where it
stops.

> Example: sour on 1500-2000m Rest after a roast with 10% less roasting also tasted sour; KL Washed is the alternative. "The cup tasted sour (under-roasted) even after the roasting went 10% more than an earlier roast on this profile, which tasted sour too. The level isn't what's wrong, so another step along it probably won't help. Next, try KL Washed instead: pick it on the Nano and set level 1.2 (ends at 217.6 °C). Shall I record that as the next version?"

⚠ **Check this:** this is judged from **one** unsuccessful step. For a timid first step that is thin
evidence; it may switch profiles too early. Requiring two unsuccessful steps is a one-line change if
real tastings suggest it. The same logic is applied to bitter cups (less roasting, still bitter),
which is our extension. The alternative profile is started at its own suggested level, not matched
to the thermal dose of the roast it replaces.

### 7. `clean-below-bar`

**When:** the cup has no under or over word (rules 1 to 6 didn't apply) and the roast quality is below
`holdMinQuality`. Because of rule 1 the quality is then 3 or more: the cup is clean but short of the bar.
**What it does:** asks; changes nothing. The level can only fix a defect, and a defect word is what shows
which way to move it; a clean cup gives it no direction. So the answer lists every lever that can raise the
quality, cheapest first, each with what it changes and what the recorded roasts say about it. The level is
in the list, with the steps it has taken on this profile and whether the last ones raised the quality.
**Why:** this is the cup the other rules had no answer for: nothing wrong with the roast, nothing great
about it either. Saying "no rule covers this" would leave the roaster guessing, so the answer says what can
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
| `rest` | Changes how the roast has settled by the time you taste it; the roast itself stays as it is. Kaffelogic's Rest profiles are written for 3 to 5 days. |
| `brew` | Changes how much of the roast reaches the cup; the roast itself stays as it is. The tasting form's own note: espresso exaggerates sourness and filter exaggerates flatness. |
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
- **Rest and brew** cost no roast, so they come first. Rest is judged from a roast tasted on more than one
  day, and only between tastings of the same brew; brew from a roast brewed more than one way, and only
  between tastings on the same day. So one pair of tastings can't credit both, and when a roast differs in
  both at once the answer says the difference could be either (*unclear*). A test is fair at `restTestDays`
  days apart or `brewTestCount` different brews: *moving* if the quality was higher (rest counts the best
  later day, brew the best each brew reached), *exhausted* if not although the test was fair, *unclear* if
  the test was small, *untested* if no roast was tasted a second way.
- **Profile** is *untested* while the bean's other profile hasn't been roasted, *unavailable* when there is
  none to suggest, and *moving* or *unclear* once it has been roasted (one roast is too few to rule it out,
  so the profile is never *exhausted*, and the verdict below stays open while an alternative exists).
- **Curve** is always *unavailable*: this tool can't edit it yet.

**The verdict.** While any lever the tool can reach is still to try, the answer says so: "I wouldn't blame
the coffee yet". Only when every one is exhausted or unavailable does it say what is left: the curve, or the
coffee itself, which a ladder of levels can't tell apart (and it says the level was tried in the direction it
went). It never says the coffee can't do better. If the
roaster has given a reference for the coffee (the supplier's or producer's description, or their own cup),
the answer quotes it and says not to write the coffee off; with none, it says nothing about one.

```
"The cup is clean: no roast defect, so there is nothing for the level to fix. The roast quality is 3 (clean, with little character), below the 4 this tool aims for. What can raise it:
- rest (untested): Changes how the roast has settled by the time you taste it; the roast itself stays as it is. Kaffelogic's Rest profiles are written for 3 to 5 days. Every tasting so far was on day 1 after roasting; no roast has been tasted again on another day. Taste the newest roast again after more days of rest (it costs no roast).
- brew (untested): Changes how much of the roast reaches the cup; the roast itself stays as it is. The tasting form's own note: espresso exaggerates sourness and filter exaggerates flatness. Every tasting so far was brewed as pour over; no roast has been brewed another way. Taste the newest roast brewed another way (it costs no roast).
- level (exhausted): Moves the end temperature, so the whole roast goes further or less far, by a measured amount of thermal dose; the shape of the curve stays as it is. 3 steps less roasting on this profile (thermal dose 12 to 8.7, about 27% less); the roast quality was 2, 3, 3 and 3. The last 2 steps did not raise it.
- profile (unavailable): Changes the curve's shape (how fast heat goes in and how long the beans develop), not only where the roast stops. There's no other stock profile I'd suggest for this bean.
- curve (unavailable): The same as a profile change, made by editing the curve yourself. This tool can't edit a curve yet. If you edit one in Kaffelogic Studio, tell me and I'll record the roast as a new version.
I wouldn't blame the coffee yet: rest and brew are still to try. Your reference for this coffee is "Lively and fruit-forward". It says what the coffee can be, so don't write it off; compare the cup against it."
```

Example: flat, clean, roast quality 3, the day after roasting, pour over, after three steps of about 10% less roasting (the first roast was ashy, quality 2; then 3, 3, 3); a reference of lively, fruit-forward; no other profile to suggest.

⚠ **Check this:** two steps (`plateauSteps`) is a first guess for "a fair try", and the rest and brew tests
assume that a quality which didn't improve over a few days, or a few brews, means that lever isn't the
problem. The tastings in a run can be on different days of rest, which can blur the comparison; the answer
says when they were. A clean cup gives the level no direction, so a further step is only a probe for the
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

> Example: thin, roast quality 4. "No rule covers thin yet, and nothing else in this tasting points to a change. Ask the roaster what to test next rather than guessing."

## 6. What a step means on each stock profile

The steps are percentages of thermal dose, but you set a level on the machine. This table shows,
for each stock profile at its suggested filter and espresso levels, where a 10% or 15% step in
either direction lands: the level, the temperature it ends at, and when the profile's curve gets
there. It is measured from the stock profile files, not estimated.

How to read it: the level scale is uneven. On the same profile, a step can be a third of a level or
more than a full one; on some profiles several levels differ by only a degree. Where two columns
show the same level, the machine's 0.1 level grid can't tell those steps apart.

<!-- steps:start -->
| Profile | For | Starts at (level · end · time) | −15% | −10% | +10% | +15% |
|---|---|---|---|---|---|---|
| 0-1200m RTD | filter | 2.2 · 218.3 °C · 9:31 | 1.5 · 216.5 °C · 9:08 | 1.8 · 217.2 °C · 9:16 | 2.5 · 219.3 °C · 9:44 | 2.7 · 220.0 °C · 9:53 |
| 0-1200m RTD | espresso | 3.0 · 221.0 °C · 10:07 | 2.4 · 219.0 °C · 9:40 | 2.6 · 219.6 °C · 9:49 | 3.9 · 222.2 °C · 10:23 | 4.1 · 222.9 °C · 10:32 |
| 0-1200m Rest | filter | 2.2 · 221.2 °C · 11:31 | 1.9 · 218.8 °C · 11:11 | 2.0 · 219.5 °C · 11:17 | 2.4 · 222.8 °C · 11:45 | 2.5 · 223.7 °C · 11:52 |
| 0-1200m Rest | espresso | 3.0 · 227.8 °C · 12:27 | 2.7 · 225.3 °C · 12:06 | 2.8 · 226.1 °C · 12:13 | 4.0 · 229.3 °C · 12:39 | 4.2 · 230.4 °C · 12:49 |
| 1200-1500m RTD | filter | 2.2 · 218.4 °C · 9:39 | 1.5 · 216.5 °C · 9:16 | 1.8 · 217.2 °C · 9:24 | 2.5 · 219.7 °C · 9:55 | 2.6 · 220.1 °C · 10:01 |
| 1200-1500m RTD | espresso | 3.0 · 221.8 °C · 10:22 | 2.5 · 219.7 °C · 9:55 | 2.7 · 220.5 °C · 10:06 | 4.0 · 222.9 °C · 10:36 | 4.2 · 223.9 °C · 10:48 |
| 1200-1500m Rest | filter | 2.2 · 219.8 °C · 8:55 | 1.5 · 217.4 °C · 8:33 | 2.0 · 218.2 °C · 8:41 | 2.4 · 221.3 °C · 9:09 | 2.5 · 222.1 °C · 9:16 |
| 1200-1500m Rest | espresso | 3.0 · 226.0 °C · 9:52 | 2.7 · 223.7 °C · 9:30 | 2.8 · 224.4 °C · 9:37 | 3.8 · 227.6 °C · 10:06 | 4.1 · 228.5 °C · 10:14 |
| 1500-2000m RTD | filter | 2.4 · 216.0 °C · 9:32 | 2.0 · 214.0 °C · 9:06 | 2.1 · 214.5 °C · 9:13 | 2.6 · 217.0 °C · 9:46 | 2.7 · 217.5 °C · 9:52 |
| 1500-2000m RTD | espresso | 3.1 · 219.3 °C · 10:19 | 2.7 · 217.5 °C · 9:52 | 2.8 · 218.0 °C · 9:59 | 3.5 · 220.5 °C · 10:38 | 3.7 · 221.1 °C · 10:47 |
| 1500-2000m Rest | filter | 2.5 · 220.2 °C · 8:41 | 2.1 · 218.6 °C · 8:19 | 2.2 · 219.0 °C · 8:24 | 2.8 · 221.3 °C · 9:00 | 2.9 · 221.7 °C · 9:06 |
| 1500-2000m Rest | espresso | 3.2 · 222.4 °C · 9:17 | 2.6 · 220.5 °C · 8:47 | 2.8 · 221.3 °C · 9:00 | 3.9 · 223.4 °C · 9:34 | 4.1 · 224.0 °C · 9:44 |
| 2000-2700m RTD | filter | 2.5 · 216.5 °C · 9:36 | 2.1 · 214.5 °C · 9:07 | 2.3 · 215.5 °C · 9:22 | 2.7 · 217.5 °C · 9:51 | 2.8 · 218.0 °C · 9:59 |
| 2000-2700m RTD | espresso | 3.2 · 219.6 °C · 10:24 | 2.7 · 217.5 °C · 9:51 | 2.9 · 218.5 °C · 10:07 | 3.6 · 220.8 °C · 10:42 | 3.8 · 221.4 °C · 10:52 |
| 2000-2700m Rest | filter | 2.0 · 217.1 °C · 7:55 | 1.0 · 216.1 °C · 7:41 | 1.1 · 216.2 °C · 7:43 | 2.3 · 217.9 °C · 8:07 | 2.5 · 218.5 °C · 8:15 |
| 2000-2700m Rest | espresso | 3.2 · 220.1 °C · 8:40 | 2.5 · 218.5 °C · 8:15 | 2.7 · 219.1 °C · 8:23 | 4.0 · 221.0 °C · 8:54 | 4.1 · 221.4 °C · 9:01 |
| KL Washed | filter | 1.0 · 216.5 °C · 6:55 | 0.8 · 214.4 °C · 6:34 | 0.9 · 215.4 °C · 6:44 | 1.2 · 217.6 °C · 7:06 | 1.3 · 218.2 °C · 7:12 |
| KL Washed | espresso | 1.2 · 217.6 °C · 7:06 | 0.9 · 215.4 °C · 6:44 | 1.0 · 216.5 °C · 6:55 | 1.4 · 218.7 °C · 7:19 | 1.5 · 219.3 °C · 7:25 |
| KL Natural | filter | 1.0 · 216.5 °C · 8:17 | 0.9 · 215.4 °C · 8:01 | 0.9 · 215.4 °C · 8:01 | 1.2 · 217.6 °C · 8:35 | 1.2 · 217.6 °C · 8:35 |
| KL Natural | espresso | 1.3 · 218.2 °C · 8:44 | 1.0 · 216.5 °C · 8:17 | 1.1 · 217.1 °C · 8:25 | 1.4 · 218.7 °C · 8:55 | 1.5 · 219.3 °C · 9:06 |
| Decaf | filter | 2.1 · 218.8 °C · 8:21 | 1.0 · 217.1 °C · 7:59 | 1.4 · 217.7 °C · 8:06 | 2.5 · 219.9 °C · 8:38 | 2.6 · 220.2 °C · 8:42 |
| Decaf | espresso | 3.0 · 221.3 °C · 8:59 | 2.4 · 219.6 °C · 8:33 | 2.6 · 220.2 °C · 8:42 | 3.8 · 222.3 °C · 9:15 | 4.2 · 222.8 °C · 9:24 |
| Robusta | filter | 2.2 · 220.1 °C · 9:47 | 1.8 · 218.5 °C · 9:23 | 1.9 · 218.9 °C · 9:29 | 2.5 · 221.4 °C · 10:05 | 2.6 · 221.8 °C · 10:11 |
| Robusta | espresso | 3.0 · 223.4 °C · 10:36 | 2.5 · 221.4 °C · 10:05 | 2.7 · 222.2 °C · 10:17 | 4.1 · 224.7 °C · 10:56 | 4.2 · 225.1 °C · 11:01 |
<!-- steps:end -->

Regenerate with `npm run rules:steps` (it needs the stock profile files in your own library, which
this repository never contains).

⚠ **Check this:** do the end temperatures and times look like a 10% or 15% change in roasting to you?
If a step looks too small or too large on a profile you know well, that is the most useful thing
you can tell us.

## 7. What the engine does not know

- It doesn't look at the temperature curve itself, only the total thermal dose. Two roasts with the same
  thermal dose but different shapes (fast then slow, or slow then fast) look the same to it.
- It doesn't use weight loss, DTR, first-crack timing, rate of rise, crack-to-end temperature rise,
  colour readings or how the beans looked. Some of those (the first-crack press) are button
  presses; none has a validated range for the Nano yet.
- It doesn't know your brew recipe or grind, so it can't tell an under-extracted shot from an
  under-roasted roast, except for the one espresso case in rule 4.
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
worked example's exact wording, and (where the stock profile files are present) the step table.

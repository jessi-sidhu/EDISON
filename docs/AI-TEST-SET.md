# AI test set: 16 prompts

These are the prompts we send to Edison's AI to check that it builds circuits that work and are wired cleanly. The focus is the op-amp, and parts are combined wherever a real lab would combine them. Aarmen chose them on 2026-10-03.

**Parts in play:** capacitor, resistor, bench supply, function generator (sine), diode, LED, TL072 op-amp, push button, multimeter and jumper wires.

**Status:** coded (#202). The cases are `BANK-01`…`BANK-16` (tag `bank`) in `Plugged/scripts/ai-eval-cases.js`; the wiring and logic checks are in `Plugged/scripts/ai-eval.js`, on the bank cases only (`lab: { wires }`), so the older cases grade as before. Run with `npm run ai-eval -- --only bank` (48 calls, about 50 cents).

**Baseline, 2026-10-03** (DeepSeek `deepseek-flash`, with #197–#199, 3 runs each): **11 of 48 runs pass**.
- Pass 3/3: 01, 13, 14. Pass 2/3: 08 (one dangling wire).
- Fail 3/3: 02, 03, 05, 06, 07, 09, 10, 11 (TL072 pins mixed up: + and − inputs swapped, probes on the wrong column, a wire across the feedback resistor; idle legs and dangling wires), 04 (built without the TL072 or the supply), 12 (LED current outside 5–20 mA), 15 and 16 (logic).
**Reasoning on (#205), deepseek-flash, `DEEPSEEK_THINKING=1`, 2026-10-03: 24/48 runs pass** (11/48 with reasoning off). Median 36.6 s per build (8–195 s); about 0.6¢ a build.

| Case | Off | On | Seconds | What failed (reasoning on) |
|---|---|---|---|---|
| 01 | 3/3 | 3/3 | 9–29 | |
| 02 | 0/3 | **3/3** | 30–76 | |
| 03 | 0/3 | **3/3** | 18–25 | |
| 04 | 0/3 | 2/3 | 29–65 | one run: LED never on, an idle leg |
| 05 | 0/3 | 1/3 | 48–71 | one run built no op-amp; one wrong at the trough |
| 06 | 0/3 | 0/3 | ~70 | no build at all: reasoning used the whole `max_tokens` (16000), reply "(no response)" |
| 07 | 0/3 | 0/3 | 61–101 | the diode's output wrong; the checker's false positive too |
| 08 | 2/3 | 3/3 | 25–28 | |
| 09 | 0/3 | 2/3 | 40–43 | |
| 10 | 0/3 | 1/3 | 39–195 | meter reading wrong |
| 11 | 0/3 | 0/3 | 14–26 | amplifier right (−4.98 V, meter agrees) but FG1 set to DC 0.5 V, not a sine: our guide's "offset = DC in" |
| 12 | 0/3 | 0/3 | 10–18 | works, LED at 4.9 mA vs the 5 mA floor |
| 13 | 3/3 | 3/3 | 15–19 | |
| 14 | 3/3 | 3/3 | 8–11 | |
| 15 | 0/3 | 0/3 | 45–164 | second LED never lit at the trough; one run failed only on the checker's false positive |
| 16 | 0/3 | 0/3 | ~76 | no build at all (as 06) |

Next steps are in `docs/TODO.md` (tasks 1–3).

- Known grader limits: 05, 06 and 10 need a stiff divider at these tolerances. (The circuit checker's Heads up on correct builds of 07 and 15, a false positive in the run above, is fixed in #3; `test/prompt-bank.test.js` pins that no clean build is flagged.)

## How a case is graded

1. **Build.** Each case starts from an empty board. It sends the prompt and applies the AI's build exactly as the app would.
2. **Set up.** The grader then does what a student would: it presses buttons (`set_control` on `SW1`–`SW3`), and it sets the function generator to **1 Hz** whatever the AI chose.
3. **Read.** Cases with a sine are read at two moments: the **peak** (t = 0.25 s) and the **trough** (t = 0.75 s). The grader solves one moment at a time, so it can't follow a capacitor charging over time.
4. **Repeat.** Each case runs **3 times**, and passes only if all 3 builds pass. 16 cases is 48 AI calls, about 50 cents on DeepSeek.

### Bench rules the cases assume (from #197 and #198)
- One bench supply, wired the lab way. "±12 V" means CH1 and CH2 in series with the middle grounded.
- One function generator, and at most two multimeters. Every instrument sits in its own spot.
- An op-amp's input comes from the function generator, a potentiometer or a divider, never from a second supply.

### Wiring checks (every case)
The old grader only looked at the readings, so a build full of junk wires still passed. Every case now also fails if any of these fail:

| Check | Fails when |
|---|---|
| No dangling wires | A wire end lands in a strip with nothing else in it. |
| No duplicate wires | Two wires join the same two points. |
| Wire budget | The build uses more than the clean build's wire count plus 2. |
| No idle parts | A placed part has a leg that connects to nothing. The TL072's unused second half is allowed when the recipe ties it off. |
| Op-amp powered | A TL072's V+ isn't on the positive supply, or its V− isn't on the negative supply or ground. |
| No short | The simulator reports a short or a status other than ok. |
| No warning | The reply carries "Heads up, this build has a problem". |

## The cases

### Op-amp

| # | Prompt | Parts | Pass |
|---|---|---|---|
| 1 | Build an inverting amplifier with a gain of −2 driven by a 1 V sine from the function generator. | TL072, supply ±12 V, generator, 2 resistors | Output about −2.0 V at the peak and +2.0 V at the trough (±3 %), linear. |
| 2 | Build a non-inverting amplifier with a gain of 3, driven by a 1 V sine from the function generator. | TL072, supply, generator, 2 resistors | About +3.0 V at the peak and −3.0 V at the trough (±3 %), linear. |
| 3 | Divide the 12 V supply with two 10 kΩ resistors, buffer it with a TL072 follower, and measure the output with the multimeter. | TL072, supply, 2 resistors, multimeter | The meter reads 5.9–6.1 V in V mode. |
| 4 | Build a comparator that lights an LED only while I hold the push button. | TL072, supply, button, LED, resistors | Released: LED off. Pressed: LED on. |
| 5 | Build an inverting summing amplifier that adds a 1 V sine from the function generator and 1 V from a divider. | TL072, supply, generator, resistors | About −2.0 V at the peak and about 0 V at the trough (within 0.1 V). |
| 6 | Build a difference amplifier with all 10 kΩ resistors that outputs V2 − V1, with V2 a 1 V sine from the function generator and V1 2 V from a divider. | TL072, supply, generator, resistors | About −1.0 V at the peak and −3.0 V at the trough (±3 %). |
| 7 | Build a precision half-wave rectifier with the TL072 and a diode, fed by a 1 V sine from the function generator. | TL072, supply, generator, diode, resistors | About +1.0 V at the peak (±5 %) and about 0 V at the trough (within 0.1 V). |
| 8 | Use the TL072 as a buffer between a 5 V sine from the function generator and an LED so the LED blinks. | TL072, supply, generator, LED, resistor | LED lit at the peak, dark at the trough. |
| 9 | Use both halves of the TL072: the first inverts with a gain of −2, the second inverts that again with a gain of −1. Drive it with a 1 V sine. | TL072, supply, generator, 4 resistors | Second output (`vout2`) about +2.0 V at the peak and −2.0 V at the trough (±3 %). Both halves linear. |
| 10 | Build an inverting amplifier with a gain of −5. Its input is 1 V from a divider off the supply. Show the output on the multimeter. | TL072, supply, resistors, multimeter | The meter reads −5.1 to −4.9 V in V mode, and U1 is linear. |
| 11 | ENSC 220 Lab 2: an inverting amplifier with a gain of −10 on ±12 V, fed by a 0.5 V sine from the function generator, with the multimeter on the output. | TL072, supply, generator, 2 resistors, multimeter | About −5.0 V at the peak and +5.0 V at the trough (±3 %), linear. The meter agrees at the peak. |

### Mixed

| # | Prompt | Parts | Pass |
|---|---|---|---|
| 12 | Make an LED that turns on with a push button, with a 1N4001 for reverse-polarity protection, on the 5 V bench supply. | supply, button, diode, LED, resistor | Released: LED off. Pressed: LED on at 5–20 mA, with current through the diode. |
| 13 | Charge a 100 µF capacitor through 10 kΩ from 9 V while the button is held, with the multimeter across the capacitor. | supply or battery, button, capacitor, resistor, multimeter | Pressed: the meter reads 8.8–9.1 V. |
| 14 | Build a half-wave rectifier: a 5 V sine from the function generator, then a 1N4148, then a 1 kΩ load, with an LED showing when current flows. | generator, diode, resistor, LED | LED lit at the peak, dark at the trough. |
| 15 | Put two LEDs back to back on a 5 V sine from the function generator, through one resistor, so they take turns. | generator, 2 LEDs, resistor | Exactly one LED lit at the peak, and the other one at the trough. |
| 16 | Build a circuit with 3 LEDs and 3 push buttons. Pressing any two buttons together lights one LED, and each pair lights a different LED. | 3 buttons, 3 LEDs, diodes, resistors, supply | See below. |

### Case 16: the logic case

It's graded in 7 button states:

| Buttons held | Pass |
|---|---|
| none | all 3 LEDs off |
| SW1 only, SW2 only, SW3 only | all 3 LEDs off |
| SW1 + SW2 | exactly one LED on |
| SW2 + SW3 | exactly one LED on, a different one |
| SW1 + SW3 | exactly one LED on, different from the other two |

- "On" means at least 1 mA, so a faint leak doesn't count.
- It doesn't matter which LED goes with which pair, only that the three pairs light three different LEDs.
- All three buttons held at once isn't graded.

**Why it's hard:** plain buttons can't do it, because each button is shared by two pairs. Buttons wired in series leave stray paths: one button lights an LED by itself, or a pair lights two LEDs. A working build uses diodes as AND gates:
- each button pulls its own line up,
- each LED has two diodes, one to each of its two buttons' lines,
- the LED lights only when both of those lines are up.

**New grader check:** "exactly one LED on, and a different one for each pair". The current checks can't express it.

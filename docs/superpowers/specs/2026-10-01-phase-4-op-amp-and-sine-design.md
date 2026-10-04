# Phase 4: the op-amp, a sine function generator, and a mini scope (design)

*Status: design approved by Aarmen in chat, 2026-10-01. Aarmen decides the physics (AGENTS.md). Author: Aarmen with Claude Code.*

## Goal
A student can build and simulate real op-amp circuits on the breadboard: an inverting amplifier, a follower, a comparator. They can see the output clip at the rails and hit its current limit. They can drive a circuit with a sine wave from a function generator and watch the input and output on a small live scope. The AI can build all of it. This is the part that makes TAs take us seriously.

**Scope:**
- The op-amp, the function generator (sine only) and the mini scope.
- The transistor (2N3904) and MOSFET from the old Phase 4 list are **scrapped** (Aarmen, 2026-10-01).
- The op-amp chain is built first. Whatever isn't done by the event (Fri Oct 3) waits for the track drop.

**Success:**
- The TL072 places from the sidebar and from the AI, and simulates to the hand-calculated answers below.
- The function generator drives a circuit, and the mini scope shows its sine and a probed hole live.
- "Lab 2: inverting amplifier" (driven by the generator) loads from the ENSC 220 Labs menu.
- The demo prompt stays inside `DEMO_BUDGET`, and its golden file is unchanged.
- `npm test`, `npm run check`, CI and `npm run ai-eval` stay green.

## The model

### The `E` element (simulator core)
`E` is already in `docs/API-CONTRACT.md` but not built (#44 was cut). This spec builds it, extended for the op-amp. The extension is additive:

| Field | Meaning |
|---|---|
| `out:[+,−]` | the output port |
| `ctrl:[+,−]` | the sensed input pair |
| `gain` | A |
| `rout?` | output resistance in Ω (default 0, i.e. ideal) |
| `rails?:[vneg, vpos]` | pins whose voltages bound the output |
| `headroom?` | volts the output stays inside each rail (default 0) |
| `ilim?` | output current limit in A |

- Without `rails`/`ilim`, `E` is a plain linear VCVS (Thévenin form: `A·(V+ − V−)` behind `rout`).
- With them, it's a **mode block** in the existing `settleModes` loop:

| Mode | Output | Consistent when |
|---|---|---|
| `linear` | `A·vd` behind `rout` | `V(vneg)+headroom ≤ A·vd ≤ V(vpos)−headroom`, and `|Iout| ≤ ilim` |
| `high` | `V(vpos) − headroom` behind `rout` | `A·vd ≥` that level, and `|Iout| ≤ ilim` |
| `low` | `V(vneg) + headroom` behind `rout` | `A·vd ≤` that level, and `|Iout| ≤ ilim` |
| `isrc+` / `isrc−` | a current source of ±`ilim` out of the output | the output voltage it produces is not past what the linear/clipped drive asks for, in the same direction |

- **Comparator behaviour isn't a feature.** With no feedback, `A = 200 000` sends the output to `high` or `low`.
- **The failure mode stays the same:** if the loop doesn't settle, the status is `'unsettled'`, never wrong numbers.
- **A `G` element** (VCCS) is the same family, but it isn't needed here and stays unbuilt.

### The TL072 part (`parts/tl072.js`)
- **Package:** dual op-amp, DIP-8, straddling the centre gap like the 7-segment display (`place: { kind: 'footprint', straddle: true }`). Datasheet pinout:
  - 1 OUT1, 2 IN1−, 3 IN1+, 4 V−
  - 5 IN2+, 6 IN2−, 7 OUT2, 8 V+
- **Elements:** two `E`s, one per op-amp. `ctrl` is IN+/IN−, `out` is OUTn to V− (the reference), and `rails: [V−, V+]`.
- **Values** (Aarmen, from the TL072 datasheet's typical figures):
  - gain A = 200 000
  - `rout` = 50 Ω
  - `headroom` = 1.5 V, so ±13.5 V on ±15 V and ±10.5 V on the bench supply's default ±12 V
  - `ilim` = 20 mA
  - The inputs draw no current: JFET inputs, modelled as infinite input resistance.
- **No supply:** if V+ or V− isn't connected to a source, both outputs are left open. The part warns "the op-amp has no supply: wire V+ (pin 8) and V− (pin 4)".
- **Measure, line and hover card** per op-amp: Vout, the mode, and Iout.
  - The `high`/`low` modes read as "clipped at +10.5 V (the rail)".
  - The `isrc±` modes read as "current-limited at 20 mA".
- **Mistakes** (`Readings.problems()`):
  - `no-supply`
  - an output tied straight to a rail or to the other output: `output-shorted`
  - a clipped output: `info` only, never an error, because a comparator clips on purpose.
- **3D:** a black DIP-8 body with a pin-1 notch and dot, and "TL072" on top.

### AI
- The op-amp joins the part packs (#76). Its tool, guide line and recipe are sent only when a request is about op-amps, amplifiers or comparators. **The demo request is unchanged:** the golden `demo-led.txt` and `DEMO_BUDGET` hold, and a test pins it.
- **Recipe:** the inverting amplifier on the bench supply's ± rails, gain −10 (R_in 10 kΩ, R_f 100 kΩ, IN+ to COM). The guide line names every pin by number.
- **New `ai-eval` cases**, graded by our simulator. All three must be 3/3 before shipping:
  - "Build an inverting amplifier with a gain of −10"
  - "Build a comparator that lights an LED when the input is above 5 V"
  - "Build a voltage follower"

### The sine source (simulator core)
- The `V` element gains an optional `wave: { kind: 'sine', amp, freq, offset }` (volts, Hz, volts).
  - In a plain solve (no time), it is the DC `offset`.
  - With `analyze(components, wires, { dt, state, t })`, it is `offset + amp·sin(2π·freq·t)` at that step's time `t`.
- **When the clock runs:** the page's clock (#103) runs whenever the board has a `C` **or** a wave source.
- **Step size:** `Sim.pickDt` also takes the highest wave frequency. `dt = min(τmin/50, 1/(50·fmax))`, clamped to 10 µs–10 ms as before, so every cycle gets at least 50 points.
- **No sine, no change:** a board without a wave source or `C` still takes today's single-solve path.

### The function generator part (`parts/function_generator.js`)
- An off-board instrument like the bench supply, with two terminals: OUT and COM.
- **Elements:** one `V` with a sine `wave`, behind 50 Ω (a real generator's output resistance).
- **Values:**

  | Value | Range | Default |
  |---|---|---|
  | `amplitude` (peak) | 0–10 V | 1 V |
  | `frequency` | 0.1–100 Hz | 1 Hz |
  | `offset` | −10 to +10 V | 0 |

- **The panel** shows "SINE 1.00 Vp · 1.0 Hz", and the inspector edits the three values.
- **Line and hover card:** the present output voltage, and "sine 1.00 Vp at 1.0 Hz".
- **AI:** the AI can place it through a part pack, sent only when a request mentions a sine, signal, wave or function generator. Recipe: the generator into a 470 Ω resistor and an LED, so the LED "breathes" at 1 Hz with a 5 Vp sine and 2.5 V offset.

### The mini scope (`tools/scope.js`)
- A small 2-channel live graph in the bottom-right corner. It shows while the clock runs, and the scope toggle hides it.
- **CH1** is the first function generator's OUT, automatically. **CH2** is a probe: click "Probe", then any hole, and Esc cancels.
- **Recording:** each `plugged:sim` frame records `readings.voltage(...)` for both channels with the step's `t`.
  - The window is the last 2 periods of the generator's frequency, or the last 5 s when there's no generator.
  - Vertical scale: auto, symmetric around 0, from the larger channel's peak.
- **Readouts:** Vpp and the measured frequency for each channel. A 2D canvas, no library. It clears on Stop.

### Lab 2 (ENSC 220 Labs menu)
- **The circuit:** bench supply ±12 V powers the TL072. The function generator (1 Vp, 1 Hz) drives R_in 10 kΩ into IN1−, R_f 100 kΩ runs from OUT1 to IN1−, and IN1+ goes to COM. The scope's CH2 probes OUT1.
- **What the student sees:** the output is the input upside down and ×10, so 10 Vp. Raising the amplitude past about 1.05 Vp makes the output clip at ±10.5 V on the scope.
- **Expected readings:** computed with the real simulator when the task is built, and confirmed by Aarmen before the QA row is written.

## Contract change
In `docs/API-CONTRACT.md`, the `E` row gains `rout?`, `rails?`, `headroom?` and `ilim?`, plus the mode table above. The `V` row gains `wave?`, `analyze`'s time options gain `t`, and `Sim.pickDt` takes the wave frequency. All of it is additive. The TL072 and the function generator follow the part-file contract.

## Tasks, in order (two machines; they don't share files until task 7)
| Machine A: op-amp | Machine B: sine |
|---|---|
| 1. **`E` element** (the pure half of `simulate.js`, plus the contract) | 4. **Sine source**: `V` `wave`, `t`, the clock running for wave sources, and `pickDt` with frequency. Lands after 1, because both edit `simulate.js`; rebase on it. |
| 2. **The TL072 part** | 5. **The function generator part**, with its AI pack, recipe and ai-eval case |
| 3. **Op-amp AI recipe and ai-eval cases** | 6. **Mini scope** |
| | 7. **Lab 2**, after 2 and 5 |

1. **`E` element.** Unit tests against hand calculations:
   - an ideal VCVS
   - a non-inverting amplifier of gain 11
   - clipping at `V(vpos)−headroom`
   - the current limit into 100 Ω
   - an unsettled-safe case
   - every existing simulator test unchanged
2. **The TL072 part** (`parts/tl072.js`, registration, 3D, the mistakes, QA rows). Unit tests:
   - follower: Vout = Vin
   - inverting −10: 0.50 V in gives −5.00 V out
   - comparator: 6 V against 5 V gives +10.5 V on ±12 V
   - the output shorted to ground gives 20 mA, `isrc`
   - no supply gives the warning
   Plus 1–2 browser specs.
3. **Op-amp AI.** The recipe, the pin-numbered guide line, and three ai-eval cases (inverting −10, comparator with an LED, follower) at 3/3. The golden demo prompt is unchanged.
4. **Sine source.** Unit tests:
   - The value at t = 0 and t = 1/(4f).
   - A 1 Hz, 5 Vp sine into an RC (1 kΩ, 1000 µF) matches the closed-form steady-state amplitude within 2 %.
   - No wave and no `C` gives today's path.
   - `pickDt` respects 50 points per cycle.
5. **The function generator part**, with its AI pack, recipe and one ai-eval case ("Make an LED fade in and out with a function generator"). The golden demo prompt is unchanged.
6. **Mini scope.**
   - Unit-test the pure recorder and window maths (Vpp and frequency from samples).
   - 1–2 browser specs: the scope appears on Run with a generator, CH1 shows about 2 Vp-p at 1 Hz, CH2 probes a hole, and Stop clears it.
7. **Lab 2.** It loads, and the scope shows the inverted ×10 output, plus clipping at a higher amplitude. QA row CF-09.
8. **Follow-up, not Phase-4-specific:** let the AI place the multimeter and the capacitor (drop `ai: false`, add packs and recipes). The golden demo prompt is unchanged.

## Risks
| Risk | Mitigation |
|---|---|
| A new mode block destabilises the solver that the demo depends on | A board with no `E` takes today's path unchanged; every existing simulator and golden test must pass. |
| `settleModes` cycling with five modes | Anti-cycling already exists. Add tests for the follower and comparator edge cases, where A·vd sits right at a rail. |
| The AI mis-wires an 8-pin chip | A pin-numbered guide line, the repair loop (#83), and three ai-eval cases at 3/3. |
| Prompt budget | Part packs keep the op-amp and the generator out of the demo request; a golden test pins that. |
| The clock running for a sine costs frame rate | It's the same capped stepping as the capacitor (#103): at most 200 steps per frame, `(slowed)` shown when it can't keep up, and render on demand (#109). The scope draws once per frame. |
| Both machines editing `simulate.js` | Task 4 lands after task 1 and rebases on it; tasks 2/3 and 5/6 touch separate files. |

## Out of scope
- The transistor and MOSFET (scrapped)
- Square, triangle and other waveforms; frequencies above 100 Hz
- A full oscilloscope: triggers, time/div and volts/div controls, more than 2 channels (Phases 5–6)
- `G` and `L`
- Op-amp slew rate, offset voltage and bandwidth: the op-amp responds instantly in the time loop
- A single-supply op-amp

# Phase 3: "See the circuit" (design)

*Status: approved by Aarmen, 2026-09-30. Thandi checks the physics before the matching issues land: the ¼ W resistor rating, the multimeter model (10 MΩ V mode, 0.1 Ω A mode, the FUSE limit, Ω mode's test current) and what the mistake checker flags. Author: Aarmen with Claude Code.*

*Amended 2026-09-30 by Aarmen: the capacitor and time-stepping (features #11–#13) move into Phase 3. Thandi also checks the capacitor's physics: the backward-Euler model, the step size, the electrolytic's polarity and voltage-rating rules, and the RC expected values in `docs/QA.md`.*

*Issues: #89–#104 ("Phase 3 (n/16)"), filed 2026-09-30. The capacitor is #102–#104.*

## Goal
Make circuits visible and measurable, so Plugged is a teacher and not just a builder. A student should be able to see KVL and KCL on their own board, measure anything the way they would in the lab, and find out why a circuit doesn't work, without leaving the page.

**Success:** every feature below works on the real simulator, and each has a `docs/QA.md` case. The first five (the "wow" ones) are on `main` before the event (Fri Oct 3). `npm test`, `npm run check` and `npm run e2e` stay green, and the demo prompt stays inside `DEMO_BUDGET`.

**Roadmap after Phase 3 (not in this spec):** Phase 4 is the op-amp (it needs the `E` element, #44). Then the SFU course API and ENSC 220 labs, then ElevenLabs voice mode, then photo → circuit with Gemini. Each gets its own spec.

## Features, in build order (wow first)
| # | Feature | What the student sees | Est. |
|---|---|---|---|
| 1 | **Voltage colouring + hover card** | While simulating, each connected net is tinted on a blue → red scale by its voltage, so KVL shows at a glance. Hover a hole for its voltage. Hover a part for V, I and P = VI, plus "over its ¼ W rating" when it is (this includes "power per part"). | 0.5–1 d |
| 2 | **Show the equations** | Click a node to get its KCL with the real numbers filled in, e.g. `I(R1) − I(LED1) − I(R2) = 7.3 − 4.2 − 3.1 = 0 mA`. Click a two-lead part to get Ohm's law filled in, e.g. `V = IR → 7.0 V = 14.9 mA × 470 Ω`. | 1 d |
| 3 | **Thévenin / Norton finder** | Pick two holes to get Vth, Rth and In, drawn as a small equivalent-circuit card. | 0.75 d |
| 4 | **Connection highlight** | Hover a hole or wire and every hole and lead electrically joined to it glows. It works while editing, not only while simulating. | 0.25–0.5 d |
| 5 | **Mistake checker** | A panel listing shorts, LEDs with no resistor, backwards parts, open circuits and parts over their rating, each with a plain-English "why", and the part highlighted on the board when clicked. | 0.5 d |
| 6 | **Multimeter** (a part) | Red and black probes go in holes, with a V / A / Ω dial. V mode is a 10 MΩ load. A mode is 0.1 Ω, so an ammeter in parallel really shorts the circuit: the meter shows "FUSE" and the smoke from #8 appears. Ω mode reads only with the power off and injects a small test current (the `I` element from #38). | 1.5 d |
| 7 | **Lab starter circuits** | An "ENSC 220 Labs" menu that loads a ready-made circuit per lab, starting with Lab 1. The later SFU course step fills in the rest. | 0.5 d |
| 8 | **Overload smoke** | A part past its rating puffs smoke and stays scorched until the circuit is fixed. Visual only; the simulator is unchanged. | 0.5 d |
| 9 | **Current-flow dots** | Dots move along the wires in the direction of the current, faster with more current. | 1–1.5 d |
| 10 | **CSV export** | One button exports every part's V, I and P, and every node voltage, for lab reports. | 0.25 d |
| 11 | **Time-stepping solver** (no UI) | Nothing yet. The simulator learns a `C` element and can step through time, so a capacitor charges instead of acting as a gap. Boards with no capacitor solve exactly as today. | 1–1.5 d |
| 12 | **Time runs while simulating** | A board with a capacitor keeps simulating: a clock (`t = 1.23 s`) counts up in the results panel, and the readings, colouring and multimeter update as it runs. Pressing or releasing a button mid-run keeps the capacitor's charge, so an LED fades out after the button is released. Stop resets time to 0 and discharges every capacitor. | 0.5–0.75 d |
| 13 | **Capacitor** (a part) | A polarised electrolytic capacitor from the sidebar, 1 µF to 4700 µF, rated 25 V. Its hover card shows V, the charging current, and the stored energy ½CV². Wiring it backwards or past 25 V is a mistake (feature #5) and makes it smoke (feature #8). | 0.5–1 d |

## Architecture: a shared readings layer
```
Sim.analyze(parts, wires) ──► result ─┐
App.holeMap() ─────────────────────────┼─► Readings.from(result, board)
                                       │     ├─ netOf(hole)            → { id, holes[], pins[] }
                                       │     ├─ voltage(hole | net)    → volts, or null when floating
                                       │     ├─ part(label)            → { V, I, P, rating, over }
                                       │     ├─ kcl(net)               → [{ label, pin, amps }]  (sums to ≈ 0)
                                       │     ├─ thevenin(holeA, holeB) → { Vth, Rth, In } or { why }
                                       │     └─ problems()             → [{ kind, labels[], why }]
                                       └─► tools (thin UI, one issue each)
Multimeter = a registry part (probes in holes; a V / A / Ω control)
```
- **`Plugged/circuit3d/js/readings.js`** is a plain module that loads in Node, like `simulate.js`. It never changes the solver. It reads the result that `Sim.analyze` already returns (`status`, `nodeVoltages`, `currents`, `voltageAt`, and `parts[label] = { r, m, warnings }`, including `pinMax`) and the hole map.
- **Nets** are the same union-find the simulator uses: holes in one column-half, rails, and wires. They are exposed as "which holes are joined". Connection highlight works from the board alone, with no solve needed.
- **`part(label)`**: V is the voltage across the part's outer pins, I is its current from its `PartResult`, and P = V·I. `rating` comes from the part's own values where it has one (e.g. an LED's `maxCurrent`, the Zener's 0.5 W). Resistors are rated **¼ W**, the value on a student kit's resistors, as a constant in `readings.js`. A part with no rating shows none.
- **`kcl(net)`** lists each element current into the net, signed. The test is that it sums to 0 within 1 µA.
- **`thevenin(a, b)`** runs two extra solves on copies of the board: open-circuit for Vth, then with a 0 Ω wire between a and b for Isc. Rth = Vth ÷ Isc, and In = Isc. If there is no source, or a and b are the same net, it returns `{ why }` and no numbers.
- **`problems()`** is built from the simulation result (modes, warnings, `status`, `shorted`, open circuits and floating pins). It is not a copy of the server's `findCircuitProblems`, which judges AI actions before they are applied. Wording should match the server's where the two overlap.
- **The tools only read `Readings`.** Each is its own small module and issue, so the two lanes rarely touch the same file.
  - The modules live in `Plugged/circuit3d/js/tools/`, one file per tool, loaded after `simulate.js` in `index.html`. Their styles go in `Plugged/circuit3d/css/tools.css`.
  - The page tells them when there's something to read. After every solve, `simulate.js` dispatches a `plugged:sim` event on `document` with `detail: { result, readings }`, and on Stop it dispatches `plugged:sim-stop`.
  - A tool never calls the solver itself. The one exception is `thevenin()`, which solves copies of the board.
- **The multimeter** is a registry part (`parts/multimeter.js`): two probe pins, a `mode` control, and elements that depend on the mode (V: R 10 MΩ; A: R 0.1 Ω, with an over-current "FUSE" state above about 10 A; Ω: power-off only, a small `I` test current, reading V/I). It stays **out of the AI's tools** (hand-placed only), so it adds nothing to the prompt budget (see Risks).

## Time and the capacitor
- **The model: backward Euler.** At each step of length `h`, a `C` element between a and b is replaced by its companion model: a conductance `G = C/h` in parallel with a current source `G·v_prev`, where `v_prev` is its voltage at the previous step. Each step is then an ordinary DC solve with the existing `R` and `I` stamps, and the existing mode loop (`settleModes`) runs every step, so diodes and LEDs switch as the capacitor charges. It is unconditionally stable, and its error is about 1 % at `h = τ/50`.
- **`analyze` gains optional time arguments, additively.** `analyze(components, wires, { dt, state })` treats each `C` with its voltage from `state` (0 V when missing, i.e. discharged), and returns `result.state`, the capacitor voltages after the step. Called as today, without the third argument, on a board with no `C` elements, it behaves exactly as today: same code path, same results, and the goldens are unchanged. Without `dt`, a `C` element is an open circuit (the DC steady state).
- **The step size and the clock.** The page picks `h = τmin / 50`, where τmin is the smallest `R·C` it can estimate (fall back to 1 ms), clamped to 10 µs–10 ms. It runs up to 200 steps per animation frame. Simulated time runs at 1× real time when that fits; when it doesn't, the clock slows and shows `(slowed)`. An RC of 1 kΩ × 1000 µF (τ = 1 s) is watchable in real time.
- **Control changes mid-run keep the state.** Pressing a button or flipping a switch changes the board, not the capacitor voltages, so a capacitor discharges through whatever path is left. **Stop** clears the state.
- **Readings read the latest step.** Every tool reads `Readings.from(latestResult, board)`, recomputed at most once per animation frame. `part(label)` for a capacitor adds `energy` (½CV², in µJ).
- **The capacitor stays out of the AI's tools** (`ai: false`, like the multimeter), so it costs no prompt budget. Letting the AI place capacitors comes after the part packs (#76) and is not in Phase 3.

## Contract change
Add a **"Readings"** section to `docs/API-CONTRACT.md` with the interface above (function names, return shapes, units: volts, mA and watts, the same as the results panel). It is additive: no existing interface changes. The multimeter follows the existing part-file contract. If it needs a registry flag to stay out of the AI's tools (e.g. `ai: false`), that one flag goes in the same contract edit.

The capacitor adds a second, still additive, change in the same edit: the `C` element moves out of "Reserved" (`pins:[a,b], farads`, plus `vmax` and `polarised` for the mistake checker), `analyze` takes the optional `{ dt, state }` and returns `state`, and `part(label)` gains `energy` for capacitors. `L` stays reserved.

## Build order and lanes
1. **Foundation, alone first:** the contract section, then `readings.js` with nets, voltage, `part` (with P) and `kcl`, fully unit-tested. `thevenin` and `problems` can land with their features.
2. **Then two lanes in parallel:**

| Lane 1 | Lane 2 |
|---|---|
| Colouring + hover card (#1) | Connection highlight (#4) |
| Equations (#2) | Mistake checker (#5) |
| Thévenin finder (#3) | Overload smoke (#8) |
| Multimeter part (#6) | Current-flow dots (#9) |
| Lab 1 starter (#7) | CSV export (#10) |
| | Time-stepping solver (#11), after #5 |
| | Time runs while simulating (#12) |
| | Capacitor part (#13) |

   Lane 2 takes the capacitor because it is the lighter lane. The solver (#11) touches `simulate.js`, the demo path's core, so it waits until #1–#5 are promoted.
3. **Checkpoints:** `/promote` after #1–#5, then `/promote` after #13 (an RC circuit charges on `main`), then a `/qa-pass` and `/promote` at the end.

## Testing
- **`readings.js`, Vitest on the real simulator with hand-computed answers:**
  - a voltage divider (node voltages, P per resistor);
  - KCL summing to 0 at every node of a two-LED parallel circuit;
  - KVL around a loop;
  - the Thévenin equivalent of a divider (Vth = V·R2/(R1+R2), Rth = R1∥R2);
  - a no-source board and a same-net pair giving `{ why }`;
  - nets across rails and wires;
  - floating pins reading null.
- **Multimeter, Vitest:** V mode barely changes a divider (10 MΩ load); an A-mode meter in series reads the loop current; an A-mode meter in parallel with a source shorts it and shows FUSE; Ω mode reads a resistor with the power off and refuses with the power on.
- **Time-stepping, Vitest against the closed-form answer:** 9 V through 1 kΩ into 1000 µF (τ = 1 s) gives V_C within 2 % of 9(1 − e^(−t/τ)) at t = τ (≈ 5.69 V) and t = 5τ (≈ 8.94 V); a charged capacitor discharging through a resistor follows e^(−t/τ); a capacitor-LED-button circuit keeps the LED lit for a while after the button opens, then it goes off; every existing simulator test passes unchanged; and without `dt` a `C` is open.
- **Each UI tool:** 1–2 Playwright specs for what only a page can show (hover, click, colours, animation running), plus a `docs/QA.md` row.
- **Nothing in Phase 3 changes the AI prompt**, so the goldens stay unchanged. The multimeter is kept out of the tools, and tests pin that.

## Risks
| Risk | Mitigation |
|---|---|
| The prompt budget (demo ~16,900 of 17,175) | The multimeter stays out of the AI's tools; no other Phase 3 feature touches the prompt. #76 remains the real fix, before Phase 4 adds parts. |
| Colouring and dots cost frame rate on the laptop | Colours update once per solve, not per frame; the dots use one instanced mesh; both can be turned off. |
| The Thévenin extra solves are slow on big boards | They run only on the user's click, on a copy of the board. |
| Two lanes editing shared UI files (the results panel, the sidebar) | Each tool gets its own module; shared files take one-line hooks only; rebase conflicts stay small, as in Phase 2. |
| The time-stepping solver breaks today's DC results, which the demo rests on | No `C`, no change: a board without capacitors takes today's code path, and every existing simulator test and golden must pass unchanged. It lands after #1–#5 are promoted. |
| Stepping costs frame rate on big boards | At most 200 steps per frame, with the clock slowing (and saying so) rather than the page stuttering. Readings and colours update once per frame, not per step. |
| Adding the capacitor puts the Oct 3 date at risk | It comes after #1–#5 in lane 2, so the "wow" set is promoted first whatever happens to the capacitor. |
| Machine load causing false e2e timeouts | One browser job at a time; re-run failing specs alone before calling a failure real. |

## Out of scope
- New simulator elements beyond what the multimeter and the capacitor need, including `E`/`G` (Phase 4) and the inductor `L`.
- AC sources, frequency sweeps and the oscilloscope (Phases 5–6). Phase 3's time-stepping covers DC step responses only (RC charge and discharge).
- A non-polarised (ceramic) capacitor, and the AI placing capacitors (after #76).
- The SFU course API, voice and photos (later specs).
- Letting the AI use the multimeter.

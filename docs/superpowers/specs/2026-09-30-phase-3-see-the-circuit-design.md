# Phase 3: "See the circuit" (design)

*Status: approved by Aarmen, 2026-09-30. Thandi checks the physics before the matching issues land: the ¼ W resistor rating, the multimeter model (10 MΩ V mode, 0.1 Ω A mode, the FUSE limit, Ω mode's test current) and what the mistake checker flags. Author: Aarmen with Claude Code.*

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
- **The multimeter** is a registry part (`parts/multimeter.js`): two probe pins, a `mode` control, and elements that depend on the mode (V: R 10 MΩ; A: R 0.1 Ω, with an over-current "FUSE" state above about 10 A; Ω: power-off only, a small `I` test current, reading V/I). It stays **out of the AI's tools** (hand-placed only), so it adds nothing to the prompt budget (see Risks).

## Contract change
Add a **"Readings"** section to `docs/API-CONTRACT.md` with the interface above (function names, return shapes, units: volts, mA and watts, the same as the results panel). It is additive: no existing interface changes. The multimeter follows the existing part-file contract. If it needs a registry flag to stay out of the AI's tools (e.g. `ai: false`), that one flag goes in the same contract edit.

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

3. **Checkpoints:** `/promote` after #1–#5, then a `/qa-pass` and `/promote` at the end.

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
- **Each UI tool:** 1–2 Playwright specs for what only a page can show (hover, click, colours, animation running), plus a `docs/QA.md` row.
- **Nothing in Phase 3 changes the AI prompt**, so the goldens stay unchanged. The multimeter is kept out of the tools, and tests pin that.

## Risks
| Risk | Mitigation |
|---|---|
| The prompt budget (demo ~16,900 of 17,175) | The multimeter stays out of the AI's tools; no other Phase 3 feature touches the prompt. #76 remains the real fix, before Phase 4 adds parts. |
| Colouring and dots cost frame rate on the laptop | Colours update once per solve, not per frame; the dots use one instanced mesh; both can be turned off. |
| The Thévenin extra solves are slow on big boards | They run only on the user's click, on a copy of the board. |
| Two lanes editing shared UI files (the results panel, the sidebar) | Each tool gets its own module; shared files take one-line hooks only; rebase conflicts stay small, as in Phase 2. |
| Machine load causing false e2e timeouts | One browser job at a time; re-run failing specs alone before calling a failure real. |

## Out of scope
- New simulator elements beyond what the multimeter needs, including `E`/`G` (Phase 4).
- AC or time-based behaviour, including the oscilloscope (Phases 5–6).
- The SFU course API, voice and photos (later specs).
- Letting the AI use the multimeter.

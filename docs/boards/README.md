# Reference boards for the photo samples

Boards for the hard-coded photo samples (`Plugged/circuit3d/samples/samples.js`, a `board:` per sample). Saved 2026-10-04 for the photo-samples work (#15, #16). Open one in the editor with File → Open, or load it with `App.loadCircuitData`.

## `photo11-ensc-lab-bench.sparky`: photo 11, `ensc-lab` (#16)

This is Aarmen's own rebuild of his ENSC 220 bench, 1:1 with the photo. The yellow wires on the real board are drawn green. It was saved from his browser at 07:28 on 2026-10-04: 6 parts and 16 wires.

- **U1:** a TL072 at f57. Pin 8 goes to +12 V (d57 → tp_58) and pin 4 to −12 V (j60 → bn_60).
- **PS1:** series ±12 V. **FG1:** a 5 V peak sine at 1 Hz, through R3 (470 Ω, g55–g59) into pin 3.
- **Pin 2:** held at about 0.54 V by R1 (10 kΩ, d29–d34) and R2 (470 Ω, h29–h33), a divider off +12 V.
- **Pin 1 (the output, f57):** nothing on it but the scope probe (i57).

As built, it is a comparator. The output is a ±10.5 V square wave, high whenever the sine is above 0.54 V. Check it against the board in #16's comment before hard-coding.

## `photoexample-op-amp-blinker.sparky`: the photoexample sketch

This is the "solved solution" sketch: an op-amp relaxation oscillator that blinks an LED, on a 30-column board with a 9 V battery. Thandi will build the real board with one wire missing.

**What the sketch shows:**
- **Pin 8 (+9 V):** tp_13 → a14.
- **Op-amp 2 parked:** b15–b16 ties out2 to in2−, and tn_18 → a17 grounds in2+.
- **The timing:** the output (col 14) runs h14 → h9, through RV1 (f9–f11, wiper tied to f11 by g10–g11) and R1 (1 kΩ, i11–i15), into pin 2 and C1 (+ on g15, − on g13, which is grounded by j13 → bn_14).
- **The thresholds on pin 3:** g16 → g20 feeds three 10 kΩ resistors: R2 (e20–f20, to +9 V via tp_21 → a20), R4 (i18–i20, to ground via j18 → bn_19) and R3 (h20–h24, positive feedback from the output via j14 → j24).
- **The LED:** the output feeds R5 (1 kΩ, g24–g27) and LED1 (anode h27, cathode h28), then j28 → bn_27 to ground.
- **The rails:** tp_30 → bp_30 and tn_29 → bn_29.

**Three things to settle before hard-coding:**
1. **Pin 4 (V−, f17) has no wire in the sketch.** As sketched, the simulator flags "U1 no supply" and the LED never lights. This file adds j17 → bn_17. It is also a natural candidate for the wire Thandi leaves out.
2. **R4 (i18–i20) spans 2 columns.** A build (`place_resistor`) refuses that: "a resistor's leads must be 3–5 columns apart". The `.sparky` loads it anyway, but the samples' `board:` list can't. An equivalent that builds: R4 at i20–i23, with the ground wire j23 → bn_23 instead of j18 → bn_19.
3. **The sketch shows no values for C1 and RV1.** This file guesses 100 µF and 10 kΩ. Use the real parts' values.

**The simulator can't run this oscillator yet.** The output goes high, the LED lights at about 5 mA, and C1 charges. But about 0.5 s in, the op-amp model drops into an in-between state where both inputs sit at about 3.5 V and the output flickers. Real parts can't rest there, but the solver accepts it as a solution of a circuit with positive feedback (a Schmitt trigger). It's a simulator bug to fix separately.

**The board as a samples.js `board:` list.** It is tested through the photo-build path (`SparkyChat.applyBuild`). Everything places except R4 (item 2); with R4 moved, all 10 parts and 16 wires build.

```js
board: [
  { tool: 'place_battery' },
  { tool: 'place_tl072', hole: 'f14', direction: 'right' },
  { tool: 'place_potentiometer', hole: 'f9', direction: 'right', resistance: 10000 },
  { tool: 'place_capacitor', holeA: 'g15', holeB: 'g13', capacitance: '100µF' },   // holeA the + lead; the stripe (−) on g13
  { tool: 'place_resistor', holeA: 'i11', holeB: 'i15', resistance: 1000 },
  { tool: 'place_resistor', holeA: 'e20', holeB: 'f20', resistance: 10000 },
  { tool: 'place_resistor', holeA: 'h20', holeB: 'h24', resistance: 10000 },
  { tool: 'place_resistor', holeA: 'i18', holeB: 'i20', resistance: 10000 },     // refused (span 2): see item 2
  { tool: 'place_resistor', holeA: 'g24', holeB: 'g27', resistance: 1000 },
  { tool: 'place_led', holeA: 'h28', holeB: 'h27', color: 'red' },                // holeA the cathode (the flat edge)
  { tool: 'add_wire', from: 'BAT1.0', to: 'tp_1', color: 'red' },
  { tool: 'add_wire', from: 'BAT1.1', to: 'tn_2', color: 'black' },
  { tool: 'add_wire', from: 'tp_13', to: 'a14', color: 'red' },
  { tool: 'add_wire', from: 'tn_18', to: 'a17', color: 'black' },
  { tool: 'add_wire', from: 'tp_21', to: 'a20', color: 'red' },
  { tool: 'add_wire', from: 'b15', to: 'b16', color: 'green' },
  { tool: 'add_wire', from: 'tp_30', to: 'bp_30', color: 'red' },
  { tool: 'add_wire', from: 'tn_29', to: 'bn_29', color: 'black' },
  { tool: 'add_wire', from: 'g10', to: 'g11', color: 'green' },
  { tool: 'add_wire', from: 'h9', to: 'h14', color: 'blue' },
  { tool: 'add_wire', from: 'g16', to: 'g20' },
  { tool: 'add_wire', from: 'j14', to: 'j24', color: 'blue' },
  { tool: 'add_wire', from: 'j13', to: 'bn_14', color: 'black' },
  { tool: 'add_wire', from: 'j18', to: 'bn_19', color: 'black' },
  { tool: 'add_wire', from: 'j28', to: 'bn_27', color: 'black' },
  { tool: 'add_wire', from: 'j17', to: 'bn_17', color: 'black' },                // not in the sketch: pin 4 to ground (item 1)
],
```

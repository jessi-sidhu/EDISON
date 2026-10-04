// The AI test set's 16 lab prompts, issue #202 (docs/AI-TEST-SET.md): the
// BANK-01…BANK-16 cases in scripts/ai-eval-cases.js, graded by
// scripts/ai-eval.js with the bank's own set-up (every generator at 1 Hz,
// sines read at the peak t = 0.25 s and the trough t = 0.75 s, buttons
// pressed with set_control) and the wiring checks (`lab`), plus case 16's
// logic check.
//
// Run with:  npm test
//
// No network and no AI: each case is graded against a hand-built clean
// build (an Example turned into actions, as test/tl072-ai.test.js does),
// which must pass, and against wrong builds, which must fail on the check
// that names their mistake. The clean builds follow the bench rules (#198):
// one bench supply wired a post at a time (±12 V: + to tp, COM and COM2 to
// tn, − to bn), one function generator (FG1.1 on COM). Their wire counts
// are the cases' wire budgets (lab.wires; a build may use 2 more).
// Every expected number is hand-computed in the comment above its build.

const assert = require('node:assert');
process.env.AI_PROVIDER = 'fixture';
process.env.RECORD_FIXTURES = '0';     // never write ask fixtures from here

const Server = require('../backend/server.js');
const Board  = require('../circuit3d/js/board-model.js');
const Sim    = require('../circuit3d/js/simulate.js');
const Eval   = require('../scripts/ai-eval.js');
const CASES  = require('../scripts/ai-eval-cases.js');
const { recipeActions } = require('./fixtures/recipe-steps.js');
const N = require('../circuit3d/js/board-geometry.js').COLS;

const BANK = CASES.filter(c => (c.tags || []).includes('bank'));
const IDS  = Array.from({ length: 16 }, (_, i) => `BANK-${String(i + 1).padStart(2, '0')}`);
const caseById = id => {
  const c = CASES.find(x => x.id === id);
  assert.ok(c, `scripts/ai-eval-cases.js has no ${id}`);
  return c;
};
const reply = (actions, text = 'Built it.') => ({ reply: text, actions });
const grade = (id, actions, text) => Eval.grade(caseById(id), reply(actions, text));

// ── Parts and wiring, as Examples ──────────────────────────────────────────
// The chip at f30 facing right: OUT1 f30, IN1− f31, IN1+ f32, V− f33 (the
// bottom strips 30–33), IN2+ e33, IN2− e32, OUT2 e31, V+ e30 (the top ones).
const CHIP = ['f30', 'f31', 'f32', 'f33', 'e33', 'e32', 'e31', 'e30'];
const PS1  = volts => ({ type: 'bench_supply', label: 'PS1', values: { voltage: volts } });
const FG1  = (amp, frequency = 1) => ({ type: 'function_generator', label: 'FG1', values: { amplitude: amp, offset: 0, frequency } });
const U1   = { type: 'tl072', label: 'U1', holes: CHIP };
const MM1  = (mode = 'V') => ({ type: 'multimeter', label: 'MM1', values: { mode } });
const R    = (label, holes, ohms) => ({ type: 'resistor', label, holes, values: { resistance: ohms } });
const LED  = (label, holes) => ({ type: 'led', label, holes, values: { color: 'red' } });          // [cathode, anode]
const D    = (label, holes, model = '1N4148') => ({ type: 'diode', label, holes, values: { model } });   // [cathode, anode]
const SW   = (label, holes) => ({ type: 'button', label, holes });
const DUAL   = [['PS1.0', `tp_${N}`], ['PS1.1', `tn_${N}`], ['PS1.3', `tn_${N - 1}`], ['PS1.2', `bn_${N}`],
                ['tp_30', 'a30'], ['bn_33', 'j33']];                                       // V+ +12, V− −12
const SINGLE = [['PS1.0', `tp_${N}`], ['PS1.1', `tn_${N}`], ['tp_30', 'a30'], ['j33', 'tn_33']];   // V+ +12, V− COM
const ONE_RAIL = [['PS1.0', `tp_${N}`], ['PS1.1', `tn_${N}`]];
const FG_COM = ['FG1.1', `tn_${N - 2}`];
const FG_RAILS = [['FG1.0', `tp_${N}`], ['FG1.1', `tn_${N}`]];
const build = (parts, wires) => recipeActions({ name: 'bank', parts, wires, expect: {} });
const wire = (from, to) => ({ tool: 'add_wire', from, to });

// 1. Inverting −2 on ±12 V: FG1.0 → h27, Rin 10 kΩ g27–g31 (IN1−), Rf h31–h35,
//    i35 → i30 (OUT1), IN1+ j32 → COM. −20k/(10k + 50 Ω) × 1 V = −1.990 V at
//    the peak, +1.990 V at the trough. `rf` 10 kΩ is a gain of −1 (−0.995 V).
const inverting = ({ rf = 20000, frequency = 1 } = {}) => build(
  [PS1(12), FG1(1, frequency), U1, R('R1', ['g27', 'g31'], 10000), R('R2', ['h31', 'h35'], rf)],
  [...DUAL, FG_COM, ['FG1.0', 'h27'], ['i35', 'i30'], ['j32', 'tn_32']]);

// 2. Non-inverting ×3: FG1.0 → j32 (IN1+), Rg 10 kΩ g27–g31 with j27 → COM,
//    Rf 20 kΩ h31–h35, i35 → i30. 1 + 20k/10k = 3: ±3.000 V (IN1+ draws no
//    current, so the 50 Ω drops nothing). `rf` 10 kΩ is a gain of 2 (2.000 V).
const nonInverting = ({ rf = 20000 } = {}) => build(
  [PS1(12), FG1(1), U1, R('R1', ['g27', 'g31'], 10000), R('R2', ['h31', 'h35'], rf)],
  [...DUAL, FG_COM, ['FG1.0', 'j32'], ['i35', 'i30'], ['j27', 'tn_27']]);

// 3. One 12 V rail: 10k b40–b44 from tp (tp_40 → a40), 10k c44–c48 to COM
//    (a48 → tn_48): 6.000 V on d44 → j32 (IN1+); g30 → g31 the follower;
//    the meter red on h30 (OUT1), black on COM: 6.000 V. `swapProbes` reads
//    −6.000 V.
const follower = ({ swapProbes = false } = {}) => build(
  [PS1(12), U1, R('R1', ['b40', 'b44'], 10000), R('R2', ['c44', 'c48'], 10000), MM1()],
  [...SINGLE, ['tp_40', 'a40'], ['a48', 'tn_48'], ['d44', 'j32'], ['g30', 'g31'],
   swapProbes ? ['MM1.1', 'h30'] : ['MM1.0', 'h30'], swapProbes ? ['MM1.0', 'tn_50'] : ['MM1.1', 'tn_50']]);

// 4. A comparator on one 12 V rail: IN1− (g31) at 6.000 V from the 10k/10k
//    divider; IN1+ (bot 32) held at COM by 10 kΩ h32–h36 (j36 → COM), the
//    button i32–i35 to +12 (j35 → tp_35). OUT1 → 1 kΩ h26–h30 → red LED
//    i26 (anode) / i24 → COM. Pressed: OUT1 high, 10.5 V behind 50 Ω:
//    (10.5 − 2.0)/(1000 + 50 + 0.1) = 8.09 mA, lit. Released: OUT1 low at
//    1.5 V, under the LED's 2.0 V: dark. `fromRail`: the 1 kΩ fed from +12
//    (h26–h29, j29 → tp_29), not OUT1: lit pressed or not.
const comparator = ({ fromRail = false } = {}) => build(
  [PS1(12), U1, R('R1', ['b40', 'b44'], 10000), R('R2', ['c44', 'c48'], 10000), R('R3', ['h32', 'h36'], 10000),
   SW('SW1', ['i32', 'i35']), R('R4', fromRail ? ['h26', 'h29'] : ['h26', 'h30'], 1000), LED('LED1', ['i24', 'i26'])],
  [...SINGLE, ['tp_40', 'a40'], ['a48', 'tn_48'], ['d44', 'g31'], ['j36', 'tn_36'], ['j35', 'tp_35'], ['j24', 'tn_24'],
   ...(fromRail ? [['j29', 'tp_29']] : [])]);

// 5. Summing on ±12 V, 100 kΩ all round: FG1.0 → h27, R1 g27–g31; the 1 V
//    divider 11k b40–b44 / 1k c44–c48 (tp_40 → a40, a48 → tn_48), d44 → g34,
//    R3 j31–j34; Rf h31–h35, i35 → i30; IN1+ j32 → COM. The sine reaches
//    IN1−'s resistor as 1 × 100k/100.05k = 0.9995 V; the divider, 917 Ω
//    behind its 1.000 V, as 100k/100.917k = 0.9909 V. Peak −(0.9995 +
//    0.9909) = −1.990 V; trough −(−0.9995 + 0.9909) = +0.009 V. `rf`
//    200 kΩ doubles both: −3.98 V.
const summing = ({ rf = 100000 } = {}) => build(
  [PS1(12), FG1(1), U1, R('R1', ['g27', 'g31'], 100000), R('R2', ['h31', 'h35'], rf), R('R3', ['j31', 'j34'], 100000),
   R('R4', ['b40', 'b44'], 11000), R('R5', ['c44', 'c48'], 1000)],
  [...DUAL, FG_COM, ['FG1.0', 'h27'], ['i35', 'i30'], ['j32', 'tn_32'], ['tp_40', 'a40'], ['a48', 'tn_48'], ['d44', 'g34']]);

// 6. Difference on ±12 V, 10 kΩ all four: V1 → R1 g27–g31 (IN1−), Rf h31–h35
//    with i35 → i30, V2 = FG1.0 → j36 → R3 i32–i36 (IN1+), R4 j28–j32 with
//    i28 → COM. V1: a 500/100 Ω divider (b40–b44, c44–c48), 2.000 V with
//    83.3 Ω behind it, d44 → h27. V+ = ±1 × 10k/20.05k = ±0.4988 V; V1 at
//    R1 = (2 × 10k + V+ × 83.3)/10083.3. Vout = 2·V+ − V1: peak 0.9975 −
//    1.9876 = −0.990 V; trough −0.9975 − 1.9794 = −2.977 V. `soft` is a
//    10k/2k divider (1667 Ω behind it): V1 sags to 1.786 V, −0.79 V at the peak.
const difference = ({ soft = false } = {}) => build(
  [PS1(12), FG1(1), U1, R('R1', ['g27', 'g31'], 10000), R('R2', ['h31', 'h35'], 10000), R('R3', ['i32', 'i36'], 10000),
   R('R4', ['j28', 'j32'], 10000), R('R5', ['b40', 'b44'], soft ? 10000 : 500), R('R6', ['c44', 'c48'], soft ? 2000 : 100)],
  [...DUAL, FG_COM, ['tp_40', 'a40'], ['a48', 'tn_48'], ['d44', 'h27'], ['i35', 'i30'], ['FG1.0', 'j36'], ['i28', 'tn_28']]);

// 7. The superdiode on ±12 V: FG1.0 → j32 (IN1+); D1 1N4148 anode h30 (OUT1),
//    cathode h26, the output: 10 kΩ i22–i26 to COM (j22 → tn_22) and fed back
//    g26 → g31 (IN1−). Peak: the cathode follows IN1+, 1.000 V (OUT1 1.65 V);
//    trough: OUT1 at the − rail (−10.5 V), D1 off, the cathode 0 V. `plain`
//    feeds back from OUT1 (g30 → g31) instead: a follower then a diode, the
//    output 1 − 0.65 = 0.35 V at the peak.
const rectifier = ({ plain = false } = {}) => build(
  [PS1(12), FG1(1), U1, D('D1', ['h26', 'h30']), R('R1', ['i22', 'i26'], 10000)],
  [...DUAL, FG_COM, ['FG1.0', 'j32'], plain ? ['g30', 'g31'] : ['g26', 'g31'], ['j22', 'tn_22']]);

// 8. A follower on ±12 V (FG1.0 → j32, g30 → g31) at 5 Vp into 470 Ω h26–h30
//    and a red LED i26 (anode) / i24 → COM: (5 − 2.0)/470.1 = 6.38 mA lit
//    at the peak; −5 V at the trough, dark. `backwards` never lights.
const buffer = ({ backwards = false } = {}) => build(
  [PS1(12), FG1(5), U1, R('R1', ['h26', 'h30'], 470), LED('LED1', backwards ? ['i26', 'i24'] : ['i24', 'i26'])],
  [...DUAL, FG_COM, ['FG1.0', 'j32'], ['g30', 'g31'], ['j24', 'tn_24']]);

// 9. Both halves on ±12 V: op-amp 1 the inverting −2 of build 1 (vout1
//    −1.990 V at the peak); OUT1 (j30) → b36, R3 10 kΩ c32–c36 into IN2−
//    (top 32), R4 b28–b32 back to OUT2 (a28 → a31), IN2+ a33 → COM:
//    vout2 = −(R4/R3)·vout1 = +1.990 V at the peak, −1.990 V at the trough.
//    `r4` 20 kΩ makes the second gain −2: +3.98 V.
const twoHalves = ({ r4 = 10000 } = {}) => build(
  [PS1(12), FG1(1), U1, R('R1', ['g27', 'g31'], 10000), R('R2', ['h31', 'h35'], 20000),
   R('R3', ['c32', 'c36'], 10000), R('R4', ['b28', 'b32'], r4)],
  [...DUAL, FG_COM, ['FG1.0', 'h27'], ['i35', 'i30'], ['j32', 'tn_32'], ['j30', 'b36'], ['a28', 'a31'], ['a33', 'tn_33']]);

// 10. Inverting −5 on ±12 V, no generator: the 11k/1k divider (1.000 V, 917 Ω
//     behind it) d44 → h27, Rin 100 kΩ g27–g31, Rf 500 kΩ h31–h35, i35 → i30,
//     IN1+ j32 → COM; the meter red g30 (OUT1), black COM. Vin at Rin =
//     100k/100.917k = 0.9909 V: −4.955 V. Rin 10 kΩ / Rf 50 kΩ loads the
//     divider to 1k‖10k = 909 Ω: 12 × 909/11909 = 0.916 V, −4.58 V.
const gainFive = ({ rin = 100000, rf = 500000 } = {}) => build(
  [PS1(12), U1, R('R1', ['g27', 'g31'], rin), R('R2', ['h31', 'h35'], rf),
   R('R3', ['b40', 'b44'], 11000), R('R4', ['c44', 'c48'], 1000), MM1()],
  [...DUAL, ['i35', 'i30'], ['j32', 'tn_32'], ['tp_40', 'a40'], ['a48', 'tn_48'], ['d44', 'h27'], ['MM1.0', 'g30'], ['MM1.1', 'tn_50']]);

// 11. Lab 2: the TL072 recipe (−10) at 0.5 Vp, the meter red g30 (OUT1):
//     −100k/10.05k × 0.5 = −4.975 V at the peak (meter too), +4.975 V at the
//     trough. `meterOnInput`: red on i27, the generator's side of Rin:
//     0.5 × 10k/10.05k = 0.498 V.
const lab2 = ({ meterOnInput = false } = {}) => build(
  [PS1(12), FG1(0.5), U1, R('R1', ['g27', 'g31'], 10000), R('R2', ['h31', 'h35'], 100000), MM1()],
  [...DUAL, FG_COM, ['FG1.0', 'h27'], ['i35', 'i30'], ['j32', 'tn_32'], ['MM1.0', meterOnInput ? 'i27' : 'g30'], ['MM1.1', 'tn_50']]);

// 12. 5 V, one rail: tp_2 → a2, 1N4001 anode b2 / cathode b6, the button
//     c6–c9, 150 Ω b9–b13, red LED c13 (anode) / c15, a15 → COM. Pressed:
//     (5 − 0.7 − 2.0)/(150 + 0.2) = 15.3 mA through both; released: dark.
//     `diodeBackwards` blocks it: never lit.
const buttonLed = ({ diodeBackwards = false } = {}) => build(
  [PS1(5), D('D1', diodeBackwards ? ['b2', 'b6'] : ['b6', 'b2'], '1N4001'), SW('SW1', ['c6', 'c9']),
   R('R1', ['b9', 'b13'], 150), LED('LED1', ['c15', 'c13'])],
  [...ONE_RAIL, ['tp_2', 'a2'], ['a15', 'tn_15']]);

// 13. 9 V: tp_2 → a2, the button b2–b5, 10 kΩ c5–c9, 100 µF + d9 / − d12
//     (a12 → COM), the meter across it (e9, e12). Pressed, a plain solve
//     (the capacitor open: charged): 9 × 10M/(10M + 10k) = 8.991 V.
//     `battery` swaps the bench supply for a 9 V battery; `mode` 'A' puts
//     the meter on its current range.
const charge = ({ battery = false, mode = 'V' } = {}) => build(
  [battery ? { type: 'battery', label: 'BAT1' } : PS1(9), SW('SW1', ['b2', 'b5']), R('R1', ['c5', 'c9'], 10000),
   { type: 'capacitor', label: 'C1', holes: ['d9', 'd12'], values: { capacitance: '100µF' } }, MM1(mode)],
  [...(battery ? [['BAT1.0', `tp_${N}`], ['BAT1.1', `tn_${N}`]] : ONE_RAIL),
   ['tp_2', 'a2'], ['a12', 'tn_12'], ['MM1.0', 'e9'], ['MM1.1', 'e12']]);

// 14. 5 Vp on the rails (FG1.0 → tp, COM → tn): tp_2 → a2, 1N4148 anode b2 /
//     cathode b6, 1 kΩ c6–c10, red LED d10 (anode) / d12, a12 → COM. Peak:
//     (5 − 0.65 − 2.0)/(1000 + 50 + 0.2) = 2.24 mA, lit; trough: blocked.
//     `diodeBackwards` passes only the trough, where the LED is reversed: dark.
const halfWave = ({ diodeBackwards = false } = {}) => build(
  [FG1(5), D('D1', diodeBackwards ? ['b2', 'b6'] : ['b6', 'b2']), R('R1', ['c6', 'c10'], 1000), LED('LED1', ['d12', 'd10'])],
  [...FG_RAILS, ['tp_2', 'a2'], ['a12', 'tn_12']]);

// 15. 5 Vp on the rails: tp_2 → a2, 220 Ω b2–b6, LED1 anode c6 / c8, LED2
//     anode d8 / d6 (the other way), a8 → COM. (5 − 2.0)/(220 + 50 + 0.1) =
//     11.1 mA: LED1 at the peak, LED2 at the trough. `sameWay` turns LED2
//     round: both at the peak, neither at the trough.
const backToBack = ({ sameWay = false } = {}) => build(
  [FG1(5), R('R1', ['b2', 'b6'], 220), LED('LED1', ['c8', 'c6']), LED('LED2', sameWay ? ['d8', 'd6'] : ['d6', 'd8'])],
  [...FG_RAILS, ['tp_2', 'a2'], ['a8', 'tn_8']]);

// 16. Diode AND gates on 5 V, all in the top strips: lines L1 (col 10, and
//     col 34 by d10 → c34), L2 (18), L3 (26), each pulled up by its button
//     from tp (SW1 b7–b10, SW2 c18–c21, SW3 c26–c29) and down by 150 Ω to
//     COM; AND nodes N12 (14), N23 (22), N13 (30), each 1 kΩ up from tp, a
//     red LED to COM and a 1N4148 (anode on the node) to each of its lines.
//     Both lines up: (5 − 2.0)/1000.1 = 3.0 mA. A line down sinks two nodes'
//     current through 150 Ω: at most 1.0 V, so a node sits at most 1.65 V,
//     under the LED's 2.0 V. Pressed, a line's 150 Ω takes 33 mA (0.17 W).
const AND_GATES = [
  D('D1', ['a10', 'a14']), D('D2', ['b18', 'b14']), D('D3', ['a18', 'a22']),
  D('D4', ['b26', 'b22']), D('D5', ['a26', 'a30']), D('D6', ['b34', 'b30']),
  SW('SW1', ['b7', 'b10']), SW('SW2', ['c18', 'c21']), SW('SW3', ['c26', 'c29']),
  R('R1', ['c6', 'c10'], 150), R('R2', ['d15', 'd18'], 150), R('R3', ['d23', 'd26'], 150),
  R('R4', ['c11', 'c14'], 1000), R('R5', ['c22', 'c25'], 1000), R('R6', ['c30', 'c33'], 1000)];
const AND_WIRES = [...ONE_RAIL, ['a7', 'tp_7'], ['a21', 'tp_21'], ['a29', 'tp_29'],   // buttons up
  ['a11', 'tp_11'], ['a25', 'tp_25'], ['a33', 'tp_33'],                                   // 1 kΩ up
  ['a6', 'tn_6'], ['a15', 'tn_15'], ['a23', 'tn_23'],                                     // 150 Ω down
  ['d10', 'c34']];                                                                        // L1 to col 34
const andGates = () => build(
  [PS1(5), ...AND_GATES, LED('LED1', ['d12', 'd14']), LED('LED2', ['d24', 'd22']), LED('LED3', ['d32', 'd30'])],
  [...AND_WIRES, ['e12', 'tn_12'], ['a24', 'tn_24'], ['a32', 'tn_32']]);
// Wrong: a button per LED (tp → button → 220 Ω → LED → COM, three times):
// one button lights an LED by itself, and a pair lights two.
const oneEach = () => build(
  [PS1(5), SW('SW1', ['b2', 'b5']), R('R1', ['c5', 'c9'], 220), LED('LED1', ['d11', 'd9']),
   SW('SW2', ['b14', 'b17']), R('R2', ['c17', 'c21'], 220), LED('LED2', ['d23', 'd21']),
   SW('SW3', ['b26', 'b29']), R('R3', ['c29', 'c33'], 220), LED('LED3', ['d35', 'd33'])],
  [...ONE_RAIL, ['tp_2', 'a2'], ['a11', 'tn_11'], ['tp_14', 'a14'], ['a23', 'tn_23'], ['tp_26', 'a26'], ['a35', 'tn_35']]);
// Wrong: the same AND gates OR-ed into one LED (1N4148s e14/e22/e30 down to
// bot 14/22/30, joined g14 → g22, h22 → h30; LED1 anode i14, cathode i12 →
// COM): any pair lights LED1 at (5 − 0.65 − 2.0)/1000 = 2.35 mA, so every
// pair lights the same LED. LED2 and LED3 sit reversed from that node to
// COM, wired but never lit.
const majority = () => build(
  [PS1(5), ...AND_GATES, D('D7', ['f14', 'e14']), D('D8', ['f22', 'e22']), D('D9', ['f30', 'e30']),
   LED('LED1', ['i12', 'i14']), LED('LED2', ['h14', 'h12']), LED('LED3', ['i22', 'i20'])],
  [...AND_WIRES, ['g14', 'g22'], ['h22', 'h30'], ['j12', 'tn_12'], ['j20', 'tn_20']]);

const CLEAN = {
  'BANK-01': inverting, 'BANK-02': nonInverting, 'BANK-03': follower, 'BANK-04': comparator,
  'BANK-05': summing,   'BANK-06': difference,   'BANK-07': rectifier, 'BANK-08': buffer,
  'BANK-09': twoHalves, 'BANK-10': gainFive,     'BANK-11': lab2,      'BANK-12': buttonLed,
  'BANK-13': charge,    'BANK-14': halfWave,     'BANK-15': backToBack, 'BANK-16': andGates,
};
const wiresIn = actions => actions.filter(a => a.tool === 'add_wire').length;

// An op-amp build with V+ (pin 8, e30) fed through 100 Ω b26–b30 from tp_26
// instead of the tp_30 → a30 wire. V+ still reads 12 V (the model's rails
// draw no current), so the readings pass and only the op-amp-powered check
// sees it.
const vplusThroughResistor = actions => [
  ...actions.filter(a => !(a.tool === 'add_wire' && a.from === 'tp_30' && a.to === 'a30')),
  { tool: 'place_resistor', holeA: 'b26', holeB: 'b30', resistance: 100 }, wire('tp_26', 'a26')];

// ── The cases ─────────────────────────────────────────────────────────────

test('the bank: BANK-01…BANK-16 in order, tagged bank (not demo or opamp), each a lab case with no Heads up', () => {
  assert.deepStrictEqual(BANK.map(c => c.id), IDS);
  for (const c of BANK) {
    assert.ok(!(c.tags || []).includes('demo') && !(c.tags || []).includes('opamp'), `${c.id} tags ${JSON.stringify(c.tags)}`);
    assert.ok(c.lab && Number.isInteger(c.lab.wires), `${c.id}: lab.wires is the clean build's wire count`);
    assert.strictEqual(c.checks.noHeadsUp, true, `${c.id}: noHeadsUp`);
    assert.strictEqual(c.checks.status, 'ok', `${c.id}: status ok`);
  }
});

test('only the bank sets lab or logic: every other case grades exactly as before', () => {
  const others = CASES.filter(c => !(c.tags || []).includes('bank') && (c.lab || c.logic));
  assert.deepStrictEqual(others.map(c => c.id), []);
});

test('sine cases read the peak (t = 0.25 s) and the trough (t = 0.75 s); button cases press SW1', () => {
  const sine = ['BANK-01', 'BANK-02', 'BANK-05', 'BANK-06', 'BANK-07', 'BANK-08', 'BANK-09', 'BANK-11', 'BANK-14'];
  for (const id of sine) {
    const c = caseById(id);
    assert.strictEqual(c.t, 0.25, `${id}: the main checks at the peak`);
    assert.deepStrictEqual((c.states || []).map(s => [s.name, s.t]), [['trough', 0.75]], `${id}: one trough state`);
  }
  for (const id of ['BANK-04', 'BANK-12', 'BANK-13']) {
    assert.deepStrictEqual(caseById(id).after, [{ tool: 'set_control', part: 'SW1', pressed: true }], `${id}: pressed`);
  }
});

// ── Each case passes its clean build ──────────────────────────────────────

test('every bank case passes its hand-built clean build, whose wire count is the case\'s budget base (lab.wires)', () => {
  const bad = [];
  for (const id of IDS) {
    const actions = CLEAN[id]();
    const got = grade(id, actions);
    if (!got.pass) bad.push(`${id}: ${JSON.stringify(got.failed)}`);
    if (wiresIn(actions) !== caseById(id).lab.wires) bad.push(`${id}: the clean build has ${wiresIn(actions)} wires, lab.wires ${caseById(id).lab.wires}`);
  }
  assert.deepStrictEqual(bad, []);
});

// Actions → one solve: plain, or at t seconds (1 ms step), with the buttons
// in `down` pressed and the rest released.
function solve(actions, { t, down } = {}) {
  const applied = Board.apply(Board.empty(), actions);
  assert.deepStrictEqual(applied.errors, [], 'every action applies');
  let board = applied.board;
  if (down) {
    board = Board.apply(board, board.parts.filter(p => p.type === 'button')
      .map(p => ({ tool: 'set_control', part: p.label, pressed: down.includes(p.label) }))).board;
  }
  const { components, wires } = Board.toSim(board);
  const r = Number.isFinite(t) ? Sim.analyze(components, wires, { dt: 1e-3, state: {}, t }) : Sim.analyze(components, wires);
  assert.strictEqual(r.status, 'ok');
  return r;
}
const near = (got, want, tol, what) =>
  assert.ok(typeof got === 'number' && Math.abs(got - want) <= tol, `${what}: expected ${want} (±${tol}), got ${got}`);
const PEAK = { t: 0.25 }, TROUGH = { t: 0.75 };

test('sanity: the clean builds give the hand-computed numbers (finite gain moves an op-amp output under 1 mV)', () => {
  const at = (make, when, label, field) => {
    const r = solve(make(), when);
    return field.startsWith('pin:') ? r.parts[label].r.pins[field.slice(4)] : r.parts[label].m[field];
  };
  const rows = [
    ['BANK-01 peak',    inverting,    PEAK,                     'U1',   'vout1',       -1.9900, 0.001],
    ['BANK-01 trough',  inverting,    TROUGH,                   'U1',   'vout1',        1.9900, 0.001],
    ['BANK-02 peak',    nonInverting, PEAK,                     'U1',   'vout1',        3,      0.001],
    ['BANK-02 trough',  nonInverting, TROUGH,                   'U1',   'vout1',       -3,      0.001],
    ['BANK-03',         follower,     {},                       'MM1',  'reading',      6.0000, 0.001],
    ['BANK-04 pressed', comparator,   { down: ['SW1'] },        'LED1', 'current',      8.0945, 0.001],
    ['BANK-05 peak',    summing,      PEAK,                     'U1',   'vout1',       -1.9904, 0.001],
    ['BANK-05 trough',  summing,      TROUGH,                   'U1',   'vout1',        0.0086, 0.001],
    ['BANK-06 peak',    difference,   PEAK,                     'U1',   'vout1',       -0.9901, 0.001],
    ['BANK-06 trough',  difference,   TROUGH,                   'U1',   'vout1',       -2.9769, 0.001],
    ['BANK-07 peak',    rectifier,    PEAK,                     'D1',   'pin:cathode',  1,      0.001],
    ['BANK-07 trough',  rectifier,    TROUGH,                   'D1',   'pin:cathode',  0,      0.001],
    ['BANK-08 peak',    buffer,       PEAK,                     'LED1', 'current',      6.3816, 0.001],
    ['BANK-09 peak',    twoHalves,    PEAK,                     'U1',   'vout2',        1.9900, 0.001],
    ['BANK-10',         gainFive,     {},                       'MM1',  'reading',     -4.9546, 0.001],
    ['BANK-11 peak',    lab2,         PEAK,                     'MM1',  'reading',     -4.9751, 0.001],
    ['BANK-12 pressed', buttonLed,    { down: ['SW1'] },        'LED1', 'current',     15.3128, 0.001],
    ['BANK-13 pressed', charge,       { down: ['SW1'] },        'MM1',  'reading',      8.9910, 0.001],
    ['BANK-14 peak',    halfWave,     PEAK,                     'LED1', 'current',      2.2377, 0.001],
    ['BANK-15 peak',    backToBack,   PEAK,                     'LED1', 'current',     11.1070, 0.001],
    ['BANK-15 trough',  backToBack,   TROUGH,                   'LED2', 'current',     11.1070, 0.001],
    ['BANK-16 SW1+SW2', andGates,     { down: ['SW1', 'SW2'] }, 'LED1', 'current',      2.9997, 0.001],
  ];
  for (const [what, make, when, label, field, want, tol] of rows) near(at(make, when, label, field), want, tol, what);
  // The worst "off" node in the AND gates: two nodes into one low line (SW1 + SW2 held, L3 low).
  const r = solve(andGates(), { down: ['SW1', 'SW2'] });
  assert.ok(r.parts.D4.r.pins.anode < 1.7, `N23 with L3 low sits at ${r.parts.D4.r.pins.anode} V, under the LED's 2.0 V`);
});

// The server's checker (findCircuitProblems; the eval's Heads up) passes the
// clean builds, bar two it can't yet read: BANK-07's diode inside the
// op-amp's loop (it calls it backwards) and BANK-15's second LED, which only
// the generator's trough forward-biases. A Heads up fails noHeadsUp, so
// those two cases can't pass live until the checker learns them; when it
// does, this test says so (drop the note in ai-eval-cases.js).
test('pin: the server checker finds nothing in the clean builds except BANK-07 and BANK-15 (its known false positives)', () => {
  const flagged = IDS.filter(id => Server.findCircuitProblems(CLEAN[id]().map(a => ({ ...a }))).length);
  assert.deepStrictEqual(flagged, ['BANK-07', 'BANK-15']);
});

// ── Set-up: every generator at 1 Hz ───────────────────────────────────────

test('a lab case runs every generator at 1 Hz whatever the AI set: BANK-01 at 7 Hz still passes, though t = 0.25 s at 7 Hz is a trough', () => {
  const fast = inverting({ frequency: 7 });
  near(solve(fast, PEAK).parts.U1.m.vout1, 1.99, 0.01, 'at 7 Hz, t = 0.25 s is sin(3.5π) = −1: the trough');
  const got = grade('BANK-01', fast);
  assert.ok(got.pass, `BANK-01 at 7 Hz: ${JSON.stringify(got.failed)}`);
  const unforced = { ...caseById('BANK-01'), lab: undefined };
  assert.ok(!Eval.grade(unforced, reply(fast)).pass, 'without lab, the 7 Hz build reads the wrong moments');
});

test('BANK-13 takes the 9 V battery as well as the bench supply (supply or battery, one of them)', () => {
  const got = grade('BANK-13', charge({ battery: true }));
  assert.ok(got.pass, JSON.stringify(got.failed));
});

// ── Wrong builds fail on the right check ──────────────────────────────────

// A failure, with or without a state prefix ('trough.expect.U1.vout1').
const named = (failed, re) => failed.some(f => re.test(f));

const WRONG = [
  // [case, what's wrong, build, the check that must fail]
  ['BANK-01', 'a gain of −1 (Rf 10 kΩ)',                          () => inverting({ rf: 10000 }),    /^expect\.U1\.vout1$/],
  ['BANK-02', 'a gain of 2 (Rf 10 kΩ)',                           () => nonInverting({ rf: 10000 }), /^expect\.U1\.vout1$/],
  ['BANK-03', 'the meter\'s probes swapped (−6 V)',              () => follower({ swapProbes: true }), /^expect\.MM1\.reading$/],
  ['BANK-04', 'the LED fed from +12 V, not OUT1 (always lit)',    () => comparator({ fromRail: true }), /^released\.expectAll\.led\.on$/],
  ['BANK-05', 'Rf 200 kΩ: each input doubled (−3.98 V)',          () => summing({ rf: 200000 }),     /^expect\.U1\.vout1$/],
  ['BANK-06', 'a soft 10k/2k divider for V1 (sags, −0.79 V)',     () => difference({ soft: true }),  /^expect\.U1\.vout1$/],
  ['BANK-07', 'feedback from OUT1, not the cathode (0.35 V)',     () => rectifier({ plain: true }),  /^pins\.D1\.cathode$/],
  ['BANK-08', 'the LED backwards',                                 () => buffer({ backwards: true }), /^expectAll\.led\.on$/],
  ['BANK-09', 'a second gain of −2 (R4 20 kΩ, +3.98 V)',          () => twoHalves({ r4: 20000 }),    /^expect\.U1\.vout2$/],
  ['BANK-10', 'Rin 10 kΩ loading the divider (−4.58 V)',          () => gainFive({ rin: 10000, rf: 50000 }), /^expect\.MM1\.reading$/],
  ['BANK-11', 'the meter on the input side of Rin (0.50 V)',      () => lab2({ meterOnInput: true }), /^expect\.MM1\.reading$/],
  ['BANK-12', 'the 1N4001 backwards (never lit)',                 () => buttonLed({ diodeBackwards: true }), /^expectAll\.led\.on$/],
  ['BANK-13', 'the meter on its current range',                   () => charge({ mode: 'A' }),       /^expect\.MM1\.mode$/],
  ['BANK-14', 'the 1N4148 backwards (never lit)',                 () => halfWave({ diodeBackwards: true }), /^expectAll\.led\.on$/],
  ['BANK-15', 'both LEDs the same way (both at the peak)',        () => backToBack({ sameWay: true }), /^logic\.(peak|trough)$/],
  ['BANK-16', 'a button per LED (one button lights one)',         oneEach,                           /^logic\.SW1$/],
];

test('each bank case fails a plausible wrong build, naming the right check', () => {
  const bad = [];
  for (const [id, what, make, re] of WRONG) {
    const got = grade(id, make());
    if (got.pass) bad.push(`${id} passes ${what}`);
    else if (!named(got.failed, re)) bad.push(`${id} on ${what}: no ${re} among ${JSON.stringify(got.failed)}`);
  }
  assert.deepStrictEqual(bad, []);
});

// Each wiring check on its own: the clean build plus one mistake fails that
// check and nothing else.
const WIRING = [
  // [case, what's wrong, build, exactly these failures]
  ['BANK-01', 'a wire from tp to an empty strip (a10)',
   () => [...inverting(), wire('tp_10', 'a10')], ['wiring.dangling']],
  ['BANK-01', 'a second wire from tp to V+ (tp_29 → b30)',
   () => [...inverting(), wire('tp_29', 'b30')], ['wiring.duplicate']],
  ['BANK-12', '3 wires past the clean build\'s 4 (+2 allowed): a loop tp → a20, b20 → g20, h20 → tp',
   () => [...buttonLed(), wire('tp_20', 'a20'), wire('b20', 'g20'), wire('h20', 'tp_25')], ['wiring.budget']],
  ['BANK-12', 'a resistor with one leg in an empty strip (d15–d19)',
   () => [...buttonLed(), { tool: 'place_resistor', holeA: 'd15', holeB: 'd19' }], ['wiring.idle']],
  ['BANK-01', 'a multimeter with one probe wired (MM1.0 → j30)',
   () => [...inverting(), { tool: 'place_multimeter' }, wire('MM1.0', 'j30')], ['wiring.idle']],
  ['BANK-01', 'op-amp 2 half-wired: IN2− to COM, IN2+ and OUT2 touching nothing',
   () => [...inverting(), wire('a32', 'tn_31')], ['wiring.idle']],
  ['BANK-01', 'V+ fed through 100 Ω, not from the + rail',
   () => vplusThroughResistor(inverting()), ['wiring.opamp']],
];

test('each wiring check fails its own mistake, and only that check (the readings still pass)', () => {
  const bad = [];
  for (const [id, what, make, want] of WIRING) {
    const got = grade(id, make());
    if (JSON.stringify(got.failed) !== JSON.stringify(want)) bad.push(`${id} on ${what}: failed ${JSON.stringify(got.failed)}, want ${JSON.stringify(want)}`);
  }
  assert.deepStrictEqual(bad, []);
});

test('the TL072\'s unused second half is allowed: the clean op-amp builds leave IN2+, IN2− and OUT2 touching nothing', () => {
  const board = Board.apply(Board.empty(), inverting()).board;
  assert.strictEqual(solve(inverting()).parts.U1.m.unused2, true, 'op-amp 2 unused');
  assert.deepStrictEqual(Eval.wiringProblems(board, caseById('BANK-01').lab), []);
});

test('no short and no warning: a + to COM wire fails "shorted", a Heads up in the reply fails noHeadsUp', () => {
  const shorted = grade('BANK-12', [...buttonLed(), wire('tp_30', 'tn_30')]);
  assert.ok(shorted.failed.includes('shorted'), JSON.stringify(shorted.failed));
  const warned = grade('BANK-01', inverting(), 'Built it.\n\nHeads up, this build has a problem:\n- something');
  assert.deepStrictEqual(warned.failed, ['noHeadsUp']);
});

// ── The logic check (case 16, and case 15's take-turns) ────────────────────

test('BANK-16 logic: a button per LED fails every single-button state and every pair (two LEDs lit)', () => {
  const logic = grade('BANK-16', oneEach()).failed.filter(f => f.startsWith('logic.'));
  assert.deepStrictEqual(logic, ['logic.SW1', 'logic.SW2', 'logic.SW3', 'logic.SW1+SW2', 'logic.SW2+SW3', 'logic.SW1+SW3']);
});

test('BANK-16 logic: AND gates OR-ed into one LED light exactly one LED per pair, but the same one: logic.distinct only', () => {
  const r = solve(majority(), { down: ['SW1', 'SW2'] });
  near(r.parts.LED1.m.current, 2.35, 0.01, 'LED1 lit by a pair');
  const got = grade('BANK-16', majority());
  assert.deepStrictEqual(got.failed, ['logic.distinct']);
});

test('logicProblems: none-states lit, one-states with 0 or 2 lit, a repeat, and a state that never solved', () => {
  const at = (...lit) => ({ board: { parts: ['LED1', 'LED2', 'LED3'].map(label => ({ type: 'led', label })) },
                            r: { parts: Object.fromEntries(['LED1', 'LED2', 'LED3'].map(l => [l, { m: { current: lit.includes(l) ? 3 : 0.5 } }])) } });
  const logic = { type: 'led', mA: 1, none: ['n'], one: ['a', 'b', 'c'] };
  assert.deepStrictEqual(Eval.logicProblems(logic, { n: at(), a: at('LED1'), b: at('LED2'), c: at('LED3') }), []);
  assert.deepStrictEqual(Eval.logicProblems(logic, { n: at('LED2'), a: at(), b: at('LED1', 'LED2'), c: at('LED3') }), ['n', 'a', 'b']);
  assert.deepStrictEqual(Eval.logicProblems(logic, { n: at(), a: at('LED1'), b: at('LED1'), c: at('LED3') }), ['distinct']);
  assert.deepStrictEqual(Eval.logicProblems(logic, { n: at(), a: at('LED1'), b: { board: { parts: [] }, r: null }, c: at('LED3') }), ['b']);
});

test('stripOf: a body hole\'s half-column, a rail as a whole, nothing for a pin', () => {
  assert.deepStrictEqual(['a5', 'e5', 'f5', 'J5', 'tp_1', 'tp_63', 'bn_9', 'PS1.0', 'MM1.red'].map(Eval.stripOf),
    ['top_5', 'top_5', 'bot_5', 'bot_5', 'tp', 'tp', 'bn', null, null]);
});

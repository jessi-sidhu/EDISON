// The server's circuit checker (findCircuitProblems) on the standard bench
// (issue #9): a bench supply and a function generator sharing the ground
// rail. A backwards LED on the supply is still named, whatever the
// generator beside it does; the clean builds still give [].
//
// Run with:  npm test
//
// What these tests hold the checker to (the issue's rule): a diode is
// backwards when, for some single source pair, its cathode is on that
// pair's + side and its anode on that pair's − side, and no single pair
// (including a crossing generator's reversed pair, #3) has it forward. One
// source's + is never mixed with another source's − (the bench supply's
// own pairs, pos → com → neg in series, still make a load across the full
// ± span forward: test/bench-supply-ai.test.js's #77 pins). Every message
// keeps today's wording, word for word.
//
// No network and no AI: real builds (an Example turned into actions, as
// test/checker-sine.test.js does) through the real checker and simulator.
// Every expected number is hand-computed in the comment above its build.

const assert = require('node:assert');
process.env.AI_PROVIDER = 'fixture';
process.env.RECORD_FIXTURES = '0';     // never write ask fixtures from here

const Server = require('../backend/server.js');
const Board  = require('../circuit3d/js/board-model.js');
const Sim    = require('../circuit3d/js/simulate.js');
const { recipeActions } = require('./fixtures/recipe-steps.js');
const N = require('../circuit3d/js/board-geometry.js').COLS;

const problems = actions => Server.findCircuitProblems(actions.map(a => ({ ...a })));

// ── Parts and wiring, as Examples (test/checker-sine.test.js's) ────────────
// The chip at f30 facing right: OUT1 f30, IN1− f31, IN1+ f32, V− f33 (the
// bottom strips 30–33), IN2+ e33, IN2− e32, OUT2 e31, V+ e30 (the top ones).
const CHIP = ['f30', 'f31', 'f32', 'f33', 'e33', 'e32', 'e31', 'e30'];
const PS1  = volts => ({ type: 'bench_supply', label: 'PS1', values: { voltage: volts } });
const FG1  = (amplitude, { frequency = 1, offset = 0 } = {}) =>
  ({ type: 'function_generator', label: 'FG1', values: { amplitude, offset, frequency } });
const U1   = { type: 'tl072', label: 'U1', holes: CHIP };
const R    = (label, holes, ohms) => ({ type: 'resistor', label, holes, values: { resistance: ohms } });
const LED  = (label, holes) => ({ type: 'led', label, holes, values: { color: 'red' } });          // [cathode, anode]
const D    = (label, holes, model = '1N4148') => ({ type: 'diode', label, holes, values: { model } });   // [cathode, anode]
const SUPPLY   = [['PS1.0', `tp_${N}`], ['PS1.1', `tn_${N}`]];                              // + → tp, COM → tn
const DUAL     = [...SUPPLY, ['PS1.3', `tn_${N - 1}`], ['PS1.2', `bn_${N}`],
                  ['tp_30', 'a30'], ['bn_33', 'j33']];                                       // V+ +12, V− −12
const FG_COM   = ['FG1.1', `tn_${N - 2}`];
const FG_RAILS = [['FG1.0', `tp_${N}`], ['FG1.1', `tn_${N}`]];
const build = (parts, wires) => recipeActions({ name: 'checker', parts, wires, expect: {} });

// Today's message, word for word.
const BACKWARDS = (part, cathode, anode) => `The ${part} at ${cathode}/${anode} is backwards: its cathode ${cathode} is on the power side and its anode ${anode} is on the ground side. Swap holeA and holeB.`;

// ── The builds ─────────────────────────────────────────────────────────────

// Case 1, the standard bench: PS1 at 5 V (+ → tp, COM → tn) and FG1 (COM →
// tn too). On the supply:
//   LED1, the right way round: tp_13 → a12, 470 Ω b12–b16, anode c16 /
//     cathode c18, a18 → tn_18. (5 − 2.0)/(470 + 0.1) = 6.38 mA.
//   LED2, backwards: tp_3 → a2, 470 Ω b2–b6, cathode c6 / anode c8, a8 →
//     tn_8. No current, so its cathode sits at tp, 5.000 V, and its anode
//     at tn, 0 V: reversed by 5 V, far past REVERSE_VOLTS (0.5 V).
// On the generator: FG1.0 → a40, 220 Ω b40–b44, LED3 anode c44 / cathode
//   c48, a48 → tn_48. At 5 Vp: (5 − 2.0)/(220 + 50 + 0.1) = 11.1 mA at the
//   peak.
// Today the generator's − growth from COM walks tn → LED1 (cathode to
// anode) → tp → c6, so LED2's cathode lands on the − side while the
// supply's COM-as-+ pair has its anode on the + side: mixed together, LED2
// reads as forward and nothing is said.
// `backwards: false` leaves LED2's branch out: one correct LED on the
// supply beside the generator.
const sharedGround = ({ offset = 0, backwards = true } = {}) => build(
  [PS1(5), FG1(5, { offset }),
   R('R1', ['b12', 'b16'], 470), LED('LED1', ['c18', 'c16']),
   ...(backwards ? [R('R2', ['b2', 'b6'], 470), LED('LED2', ['c6', 'c8'])] : []),
   R('R3', ['b40', 'b44'], 220), LED('LED3', ['c48', 'c44'])],
  [...SUPPLY, FG_COM,
   ['tp_13', 'a12'], ['a18', 'tn_18'],
   ...(backwards ? [['tp_3', 'a2'], ['a8', 'tn_8']] : []),
   ['FG1.0', 'a40'], ['a48', 'tn_48']]);

// Case 2: the generator's OUT reaches tp through a resistor, with no
// resistive path back to its COM. PS1 at 5 V on tp/tn; LED1 on the supply
// (tp_3 → a2, 470 Ω b2–b6, LED1 at c6/c8, a8 → tn_8); FG1 at 5 Vp on a 0 V
// offset, COM → tn, FG1.0 → a40, 1 kΩ b40–b44, a44 → tp_44.
// The supply holds tp at 5 V, so the 1 kΩ only carries the generator's
// own current, (5 − v)/(1000 + 50): 0 at the peak (+5 V), 10/1050 =
// 9.5 mA at the trough (−5 V). LED1 backwards (cathode c6, anode c8):
// cathode 5 V, anode 0 V at every moment, reversed by 5 V.
// Today #3's reversed pair (COM as +, OUT as −) grows + from COM through
// tn to c8 and − from OUT through the 1 kΩ and tp to c6, so it reads LED1
// as forward and nothing is said.
// `backwards: false` turns LED1 the right way round (cathode c8, anode c6).
const outToTp = ({ backwards = true } = {}) => build(
  [PS1(5), R('R1', ['b2', 'b6'], 470), LED('LED1', backwards ? ['c6', 'c8'] : ['c8', 'c6']),
   FG1(5), R('R2', ['b40', 'b44'], 1000)],
  [...SUPPLY, FG_COM, ['tp_3', 'a2'], ['a8', 'tn_8'], ['FG1.0', 'a40'], ['a44', 'tp_44']]);

// BANK-07 and BANK-15, test/checker-sine.test.js's builds.
// BANK-07, the superdiode on ±12 V: FG1.0 → j32 (IN1+); D1 1N4148 anode h30
// (OUT1), cathode h26, the output: 10 kΩ i22–i26 to COM (j22 → tn_22) and
// fed back g26 → g31 (IN1−). D1 forward at the peak (cathode 1.000 V,
// anode 1.65 V), reverse-biased on the trough, as it should be.
const superdiode = () => build(
  [PS1(12), FG1(1), U1, D('D1', ['h26', 'h30']), R('R1', ['i22', 'i26'], 10000)],
  [...DUAL, FG_COM, ['FG1.0', 'j32'], ['g26', 'g31'], ['j22', 'tn_22']]);

// BANK-15, 5 Vp on the rails (FG1.0 → tp, COM → tn): tp_2 → a2, 220 Ω
// b2–b6, LED1 anode c6 / cathode c8, LED2 anode d8 / cathode d6 (the other
// way), a8 → COM. LED1 lights on the peak, LED2 on the trough:
// (5 − 2.0)/(220 + 50) = 11.1 mA each.
const backToBack = () => build(
  [FG1(5), R('R1', ['b2', 'b6'], 220), LED('LED1', ['c8', 'c6']), LED('LED2', ['d6', 'd8'])],
  [...FG_RAILS, ['tp_2', 'a2'], ['a8', 'tn_8']]);

// #3's reviewer's repro (test/checker-sine.test.js): a battery on tp/tn
// with a correct LED (tp_13 → a12, b12–b16, LED anode c16 / cathode c18,
// a18 → tn_18) and a backwards one (tp_3 → a2, b2–b6, LED cathode c6 /
// anode c8, a8 → tn_8), beside a ±5 V sine into its own LED (FG1.0 → a40,
// b40–b44, LED anode c44 / cathode c48, a48 → tn_48, COM → tn). Only the
// battery's LED is backwards.
const batteryBackwardsBesideSine = [
  { tool: 'delete_all' },
  { tool: 'place_battery' },
  { tool: 'add_wire', from: 'BAT1.0', to: `tp_${N}` },
  { tool: 'add_wire', from: 'BAT1.1', to: `tn_${N}` },
  { tool: 'add_wire', from: 'tp_13', to: 'a12' },
  { tool: 'place_resistor', holeA: 'b12', holeB: 'b16' },
  { tool: 'place_led', holeA: 'c18', holeB: 'c16' },
  { tool: 'add_wire', from: 'a18', to: 'tn_18' },
  { tool: 'add_wire', from: 'tp_3', to: 'a2' },
  { tool: 'place_resistor', holeA: 'b2', holeB: 'b6' },
  { tool: 'place_led', holeA: 'c6', holeB: 'c8' },
  { tool: 'add_wire', from: 'a8', to: 'tn_8' },
  { tool: 'place_function_generator', amplitude: 5, offset: 0, frequency: 1 },
  { tool: 'add_wire', from: 'FG1.0', to: 'a40' },
  { tool: 'place_resistor', holeA: 'b40', holeB: 'b44' },
  { tool: 'place_led', holeA: 'c48', holeB: 'c44' },
  { tool: 'add_wire', from: 'a48', to: 'tn_48' },
  { tool: 'add_wire', from: 'FG1.1', to: `tn_${N - 2}` },
];

// ── 1. A backwards LED on the supply is named beside a generator ───────────

test('case 1: a backwards LED on the bench supply, beside a correct one and a 5 Vp sine (0 V offset) on the shared tn, is named', () => {
  assert.deepStrictEqual(problems(sharedGround()), [BACKWARDS('LED', 'c6', 'c8')]);
});

// The generator on a 5 V offset (0–10 V) never crosses 0 V, so it has no
// reversed pair: its forward growth alone hides LED2 today.
test('case 1 with the generator on a 5 V offset (0–10 V, never crosses 0 V): the backwards LED on the supply is named', () => {
  assert.deepStrictEqual(problems(sharedGround({ offset: 5 })), [BACKWARDS('LED', 'c6', 'c8')]);
});

test('case 2: a backwards LED on the bench supply, beside a 5 Vp sine whose OUT reaches tp through 1 kΩ (no resistive path back to its COM), is named', () => {
  assert.deepStrictEqual(problems(outToTp()), [BACKWARDS('LED', 'c6', 'c8')]);
});

// ── 2. Pins: what passes today keeps passing ───────────────────────────────

test('pin: the clean BANK-07 superdiode and BANK-15 back-to-back LEDs still have no problems', () => {
  assert.deepStrictEqual(problems(superdiode()), [], 'BANK-07');
  assert.deepStrictEqual(problems(backToBack()), [], 'BANK-15');
});

test('pin: an LED backwards on a battery, beside a correct one and a sine that crosses 0 V into its own LED, is still named', () => {
  assert.deepStrictEqual(problems(batteryBackwardsBesideSine), [BACKWARDS('LED', 'c6', 'c8')]);
});

// Per-pair judging must not turn a correct LED into a backwards one: each
// is forward for the supply's own pair, whatever the generator's pairs say.
test('pin: a correct LED on the bench supply beside a generator on the shared tn gives no problem', () => {
  const bad = [];
  for (const [what, actions] of [
    ['the generator at 5 Vp, 0 V offset, into its own LED',  sharedGround({ backwards: false })],
    ['the generator at 5 Vp, 5 V offset, into its own LED',  sharedGround({ offset: 5, backwards: false })],
    ['the generator\'s OUT into tp through 1 kΩ',              outToTp({ backwards: false })],
  ]) {
    const got = problems(actions);
    if (got.length) bad.push(`${what}: ${JSON.stringify(got)}`);
  }
  assert.deepStrictEqual(bad, []);
});

// ── Sanity: the simulator agrees the supply's LED is backwards ─────────────

// t undefined: a plain solve (the wave at its offset).
function solveAt(actions, t) {
  const applied = Board.apply(Board.empty(), actions);
  assert.deepStrictEqual(applied.errors, [], 'every action applies');
  const { components, wires } = Board.toSim(applied.board);
  const r = t === undefined ? Sim.analyze(components, wires) : Sim.analyze(components, wires, { dt: 1e-3, state: {}, t });
  assert.strictEqual(r.status, 'ok');
  return r;
}
const near = (got, want, tol, what) =>
  assert.ok(typeof got === 'number' && Math.abs(got - want) <= tol, `${what}: expected ${want} (±${tol}), got ${got}`);

test('sanity: the supply\'s backwards LED is reversed by 5 V (cathode 5 V, anode 0 V) in case 1, and in case 2 at the plain solve, the peak and the trough', () => {
  for (const [what, actions, label, moments] of [
    ['case 1',                  sharedGround(),             'LED2', [undefined]],
    ['case 1, 5 V offset',      sharedGround({ offset: 5 }), 'LED2', [undefined]],
    ['case 2',                  outToTp(),                  'LED1', [undefined, 0.25, 0.75]],
  ]) {
    for (const t of moments) {
      const pins = solveAt(actions, t).parts[label].r.pins;
      const when = t === undefined ? 'plain solve' : `t = ${t} s`;
      near(pins.cathode, 5, 0.01, `${what}, ${when}: ${label} cathode`);
      near(pins.anode, 0, 0.01, `${what}, ${when}: ${label} anode`);
    }
  }
});

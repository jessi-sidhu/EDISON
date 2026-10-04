// The server's circuit checker (findCircuitProblems) on a sine (issue #3,
// docs/TODO.md task 4): it stops calling the clean BANK-07 superdiode and
// BANK-15 back-to-back LEDs wrong, and still catches what it catches today.
//
// Run with:  npm test
//
// Shapes these tests assume (the issue's design), stated so the builder
// matches them:
// - A function generator whose output crosses 0 V (amplitude > |offset|,
//   from its place_function_generator action's own keys, else the part's
//   defaults) is a two-way source: its terminal pair is grown both ways
//   (OUT as +, and COM as +). One that never crosses (offset 5, amplitude
//   5: 0–10 V) stays one-way, as today.
// - A diode at an op-amp output (the atOutput branch), when the build has a
//   generator that crosses 0 V, is solved at the wave's peak and trough,
//   Sim.analyze(components, wires, { dt: 1e-3, state: {}, t }) at
//   t = 1/(4f) and 3/(4f), f the generator's frequency, and is backwards
//   only if reverse-biased by more than REVERSE_VOLTS (0.5 V) at both.
//   Without such a generator, today's plain solve stands.
// - Every message keeps today's wording, word for word.
//
// No network and no AI: real builds (an Example turned into actions, as
// test/prompt-bank.test.js does) through the real checker and simulator.
// Every expected number is hand-computed in the comment above its build.

const assert = require('node:assert');
process.env.AI_PROVIDER = 'fixture';
process.env.RECORD_FIXTURES = '0';     // never write ask fixtures from here

const Server  = require('../backend/server.js');
const Board   = require('../circuit3d/js/board-model.js');
const Sim     = require('../circuit3d/js/simulate.js');
const Parts   = require('../circuit3d/js/parts');
const Recipes = require('./fixtures/recipes.js');
const { recipeActions } = require('./fixtures/recipe-steps.js');
const N = require('../circuit3d/js/board-geometry.js').COLS;

const problems = actions => Server.findCircuitProblems(actions.map(a => ({ ...a })));

// ── Parts and wiring, as Examples (test/prompt-bank.test.js's) ─────────────
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
const DUAL   = [['PS1.0', `tp_${N}`], ['PS1.1', `tn_${N}`], ['PS1.3', `tn_${N - 1}`], ['PS1.2', `bn_${N}`],
                ['tp_30', 'a30'], ['bn_33', 'j33']];                                       // V+ +12, V− −12
const FG_COM   = ['FG1.1', `tn_${N - 2}`];
const FG_RAILS = [['FG1.0', `tp_${N}`], ['FG1.1', `tn_${N}`]];
const build = (parts, wires) => recipeActions({ name: 'checker', parts, wires, expect: {} });

// Today's messages, word for word.
const BACKWARDS     = (part, cathode, anode) => `The ${part} at ${cathode}/${anode} is backwards: its cathode ${cathode} is on the power side and its anode ${anode} is on the ground side. Swap holeA and holeB.`;
const NOT_CONNECTED = (part, at) => `The ${part} at ${at} is not connected between power and ground, so no current flows through it.`;

// BANK-07, the superdiode on ±12 V: FG1.0 → j32 (IN1+); D1 1N4148 anode h30
// (OUT1), cathode h26, the output: 10 kΩ i22–i26 to COM (j22 → tn_22) and
// fed back g26 → g31 (IN1−). Peak (t = 1/(4f)): the cathode follows IN1+,
// 1.000 V, OUT1 one diode drop above, 1.65 V: D1 forward. Trough
// (t = 3/(4f)): OUT1 at its low clip, −10.5 V, the cathode 0 V through the
// 10 kΩ: D1 reverse-biased by 10.5 V, as it should be on that half. A plain
// solve reads the generator's 0 V offset: the trough's picture.
const superdiode = ({ frequency = 1 } = {}) => build(
  [PS1(12), FG1(1, { frequency }), U1, D('D1', ['h26', 'h30']), R('R1', ['i22', 'i26'], 10000)],
  [...DUAL, FG_COM, ['FG1.0', 'j32'], ['g26', 'g31'], ['j22', 'tn_22']]);

// The same superdiode fed DC, no generator: an 11k/1k divider b40–b44 /
// c44–c48 (a48 → tn_48) off `rail`, d44 → j32. IN1+ draws nothing:
// ±12 × 1k/12k = ±1.000 V. tp_40 gives +1 V (D1 forward); bn_40 −1 V
// (OUT1 at its low clip, D1 reverse-biased in the plain solve).
const dcSuperdiode = rail => build(
  [PS1(12), U1, D('D1', ['h26', 'h30']), R('R1', ['i22', 'i26'], 10000),
   R('R2', ['b40', 'b44'], 11000), R('R3', ['c44', 'c48'], 1000)],
  [...DUAL, [rail, 'a40'], ['a48', 'tn_48'], ['d44', 'j32'], ['g26', 'g31'], ['j22', 'tn_22']]);

// BANK-15, 5 Vp on the rails (FG1.0 → tp, COM → tn): tp_2 → a2, 220 Ω
// b2–b6, LED1 anode c6 / cathode c8, LED2 anode d8 / cathode d6 (the other
// way), a8 → COM. LED1 lights on the peak, LED2 on the trough:
// (5 − 2.0)/(220 + 50) = 11.1 mA each. With a 2 V offset the output swings
// −3…+7 V: LED2 still lights on the trough, (3 − 2.0)/270 = 3.7 mA.
// `ground: false` leaves out the a8 → tn_8 wire: column 8 goes nowhere.
const backToBack = ({ offset = 0, ground = true } = {}) => build(
  [FG1(5, { offset }), R('R1', ['b2', 'b6'], 220), LED('LED1', ['c8', 'c6']), LED('LED2', ['d6', 'd8'])],
  [...FG_RAILS, ['tp_2', 'a2'], ...(ground ? [['a8', 'tn_8']] : [])]);

// The superdiode with the generator left at the part's defaults: a bare
// place_function_generator, no amplitude, offset or frequency keys.
const atDefaults = actions => actions.map(a => (a.tool === 'place_function_generator' ? { tool: a.tool } : a));

// ── 1. The clean builds give [] ────────────────────────────────────────────

test('BANK-07: the clean superdiode on a ±1 V sine has no problems (D1 is reverse-biased only on the trough)', () => {
  assert.deepStrictEqual(problems(superdiode()), []);
});

test('BANK-15: two LEDs back to back on a ±5 V sine have no problems (LED2 conducts on the trough)', () => {
  assert.deepStrictEqual(problems(backToBack()), []);
});

// The generator's own values decide. At 50 Hz the peak and trough are
// t = 1/(4·50) = 5 ms and 3/(4·50) = 15 ms (t = 0.25 s and 0.75 s land on
// sin(25π) = sin(75π) = 0, the plain solve's picture, where D1 is reversed
// both times). A bare place_function_generator takes the part's defaults,
// which cross 0 V. A 2 V offset under 5 Vp still crosses (5 > 2).
test('a sine that crosses 0 V, read from the generator\'s own action or its defaults: clean builds have no problems', () => {
  const V = Parts.get('function_generator').values;
  assert.ok(V.amplitude.default > Math.abs(V.offset.default),
    `the defaults cross 0 V: amplitude ${V.amplitude.default}, offset ${V.offset.default}`);
  const bad = [];
  for (const [what, actions] of [
    ['the superdiode at 50 Hz',                                  superdiode({ frequency: 50 })],
    ['the superdiode with the generator at its defaults',        atDefaults(superdiode())],
    ['the back-to-back LEDs at 5 Vp on a 2 V offset (−3…+7 V)',  backToBack({ offset: 2 })],
  ]) {
    const got = problems(actions);
    if (got.length) bad.push(`${what}: ${JSON.stringify(got)}`);
  }
  assert.deepStrictEqual(bad, []);
});

// ── 2. Still flagged, each with today's message ────────────────────────────

// A 5 V bench supply, + → tp, COM → tn: tp_3 → a2, 470 Ω b2–b6, the LED
// turned round (cathode c6 toward +, anode c8 toward COM), a8 → tn_8.
const SUPPLY_LED_BACKWARDS = [
  { tool: 'delete_all' },
  { tool: 'place_bench_supply', voltage: 5 },
  { tool: 'add_wire', from: 'PS1.0', to: `tp_${N}` },
  { tool: 'add_wire', from: 'PS1.1', to: `tn_${N}` },
  { tool: 'place_resistor', holeA: 'b2', holeB: 'b6', resistance: 470 },
  { tool: 'place_led', holeA: 'c6', holeB: 'c8' },
  { tool: 'add_wire', from: 'tp_3', to: 'a2' },
  { tool: 'add_wire', from: 'a8', to: 'tn_8' },
];
const batteryLed = Recipes.ONE_LED;   // tp_3 → a2, R b2–b6, LED cathode c8 / anode c6, a8 → tn_8

// The generator's breathing LED (parts/function_generator.js's recipe):
// 5 Vp on a 5 V offset, 0–10 V, never below 0 V. The LED turned round
// (cathode c6 toward OUT): a plain solve at the 5 V offset reverse-biases it
// by about 5 V.
const breathingBackwards = build(
  [FG1(5, { offset: 5 }), R('R1', ['b2', 'b6'], 470), LED('LED1', ['c6', 'c8'])],
  [...FG_RAILS, ['tp_3', 'a2'], ['a8', 'tn_8']]);

// A follower on ±12 V (FG1.0 → j32, g30 → g31) at ±1 V, and an LED with
// its anode on OUT1 (i30) and its cathode i26 through 1 kΩ h22–h26 to
// +12 V (j22 → tp_22): no current, so the cathode sits at 12.0 V. Reverse-
// biased by 12 − 1 = 11 V at the peak and 12 + 1 = 13 V at the trough: both.
const followerLedBackwards = build(
  [PS1(12), FG1(1), U1, R('R1', ['h22', 'h26'], 1000), LED('LED1', ['i26', 'i30'])],
  [...DUAL, FG_COM, ['FG1.0', 'j32'], ['g30', 'g31'], ['j22', 'tp_22']]);

// The supply's backwards LED beside a ±5 V sine into 1 kΩ (FG1.0 → a40,
// b40–b44, a44 → tn_44) whose COM shares tn: a sine elsewhere doesn't turn
// the checks off. Its load joins OUT to COM through 1 kΩ (one resistive
// group), so growing the sine the other way adds nothing here; the battery
// builds below are the ones that catch a leak from that growth.
const supplyBackwardsBesideSine = [
  ...SUPPLY_LED_BACKWARDS,
  { tool: 'place_function_generator', amplitude: 5, offset: 0, frequency: 1 },
  { tool: 'add_wire', from: 'FG1.0', to: 'a40' },
  { tool: 'add_wire', from: 'FG1.1', to: `tn_${N - 2}` },
  { tool: 'place_resistor', holeA: 'b40', holeB: 'b44', resistance: 1000 },
  { tool: 'add_wire', from: 'a44', to: 'tn_44' },
];

// The reviewer's repro on #3: a battery on tp/tn with a correct LED (tp_13
// → a12, b12–b16, LED anode c16 / cathode c18, a18 → tn_18) and a
// backwards one (tp_3 → a2, b2–b6, LED cathode c6 / anode c8, a8 → tn_8),
// beside a ±5 V sine whose own LED sits after a resistor (FG1.0 → a40,
// b40–b44, LED anode c44 / cathode c48, a48 → tn_48, COM → tn). Its load is
// a diode, not a resistor, so OUT and COM are separate groups. Growing the
// sine with COM as + reaches tn, then c8 → c6 through the backwards LED and
// on to tp: the + side then holds the backwards LED's anode, and its cathode
// is already on the − side (COM → tn → the correct LED → tp → c6), so a
// union of the two growths hides it. Only the battery's LED is backwards.
// `pair` adds a second LED the other way across the sine's (anode d48 /
// cathode d44), back to back: still only the battery's LED. (Dev also
// says the pair's d44/d48 "has no forward path": the false positive #3
// removes.)
const batteryBackwardsBesideSine = ({ pair = false } = {}) => [
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
  ...(pair ? [{ tool: 'place_led', holeA: 'd44', holeB: 'd48' }] : []),
  { tool: 'add_wire', from: 'a48', to: 'tn_48' },
  { tool: 'add_wire', from: 'FG1.1', to: `tn_${N - 2}` },
];

// Every row but the last passes on dev (its pair is dev's false positive).
test('still flagged with today\'s message: backwards LEDs on a battery, the bench supply, a 0–10 V sine, at a follower\'s output and beside a sine that crosses 0 V, and LEDs with no path to ground', () => {
  const bad = [];
  for (const [what, actions, want] of [
    ['an LED backwards on a battery',
     batteryLed.map(a => (a.tool === 'place_led' ? { ...a, holeA: 'c6', holeB: 'c8' } : a)),
     [BACKWARDS('LED', 'c6', 'c8')]],
    ['an LED backwards on the bench supply', SUPPLY_LED_BACKWARDS, [BACKWARDS('LED', 'c6', 'c8')]],
    ['an LED with no path to ground (the battery\'s a8 → tn_8 wire missing)',
     batteryLed.filter(a => !(a.tool === 'add_wire' && a.from === 'a8')),
     [NOT_CONNECTED('resistor', 'b2/b6'), NOT_CONNECTED('LED', 'c8/c6')]],
    ['an LED backwards on a generator that never crosses 0 V (5 V offset, 5 Vp)', breathingBackwards,
     [BACKWARDS('LED', 'c6', 'c8')]],
    ['the back-to-back LEDs on a sine that crosses 0 V, with no path to ground (a8 → tn_8 missing)', backToBack({ ground: false }),
     [NOT_CONNECTED('resistor', 'b2/b6'), NOT_CONNECTED('LED', 'c8/c6'), NOT_CONNECTED('LED', 'd6/d8')]],
    ['an LED backwards on the bench supply, beside a sine that crosses 0 V on the same COM', supplyBackwardsBesideSine,
     [BACKWARDS('LED', 'c6', 'c8')]],
    ['an LED at a follower\'s output on a ±1 V sine, reverse-biased at the peak and the trough', followerLedBackwards,
     [BACKWARDS('LED', 'i26', 'i30')]],
    ['an LED backwards on a battery, beside a correct one and a sine that crosses 0 V into its own LED',
     batteryBackwardsBesideSine(), [BACKWARDS('LED', 'c6', 'c8')]],
    ['the same, the sine into a back-to-back LED pair', batteryBackwardsBesideSine({ pair: true }),
     [BACKWARDS('LED', 'c6', 'c8')]],
  ]) {
    const got = problems(actions);
    if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${what}:\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`);
  }
  assert.deepStrictEqual(bad, []);
});

// Real mistakes on a sine that crosses 0 V: no half of the wave ever lights
// them, so each part is still named ("backwards" or "no forward path").
// - LED1 anode c6 / cathode c8, LED2 anode d10 / cathode d8 (cathode to
//   cathode, a10 → COM): the peak stops at LED2, the trough at LED1.
// - BANK-14's wrong build: the 1N4148 turned round (cathode b2 on OUT,
//   anode b6), 1 kΩ c6–c10, the LED anode d10 / cathode d12 → COM: the
//   diode passes only the trough, where the LED is reversed.
test('pin: on a sine that crosses 0 V, parts that never conduct on either half are still named', () => {
  const bad = [];
  for (const [what, actions, parts] of [
    ['two LEDs cathode to cathode',
     build([FG1(5), R('R1', ['b2', 'b6'], 220), LED('LED1', ['c8', 'c6']), LED('LED2', ['d8', 'd10'])],
           [...FG_RAILS, ['tp_2', 'a2'], ['a10', 'tn_10']]),
     ['LED at c8/c6', 'LED at d8/d10']],
    ['BANK-14 with its 1N4148 turned round',
     build([FG1(5), D('D1', ['b2', 'b6']), R('R1', ['c6', 'c10'], 1000), LED('LED1', ['d12', 'd10'])],
           [...FG_RAILS, ['tp_2', 'a2'], ['a12', 'tn_12']]),
     ['diode at b2/b6', 'LED at d12/d10']],
  ]) {
    const got = problems(actions);
    for (const part of parts) {
      if (!got.some(p => p.startsWith(`The ${part} `) && /is backwards|has no forward path/.test(p))) {
        bad.push(`${what}: nothing says the ${part} is backwards or has no forward path: ${JSON.stringify(got)}`);
      }
    }
  }
  assert.deepStrictEqual(bad, []);
});

// ── 3. Without a generator that crosses 0 V, the plain solve stands ────────

test('pin: the superdiode fed DC from a divider keeps today\'s plain-solve verdict (+1 V: nothing; −1 V: D1 backwards)', () => {
  assert.deepStrictEqual(problems(dcSuperdiode('tp_40')), [], '+1 V on IN1+');
  assert.deepStrictEqual(problems(dcSuperdiode('bn_40')), [BACKWARDS('diode', 'h26', 'h30')], '−1 V on IN1+');
});

// ── Sanity: the simulator reads the moments the checker solves ─────────────

function solveAt(actions, t) {
  const applied = Board.apply(Board.empty(), actions);
  assert.deepStrictEqual(applied.errors, [], 'every action applies');
  const { components, wires } = Board.toSim(applied.board);
  const r = Sim.analyze(components, wires, { dt: 1e-3, state: {}, t });
  assert.strictEqual(r.status, 'ok');
  return r;
}
const near = (got, want, tol, what) =>
  assert.ok(typeof got === 'number' && Math.abs(got - want) <= tol, `${what}: expected ${want} (±${tol}), got ${got}`);

test('sanity: at t = 1/(4f) the superdiode\'s D1 is forward (cathode 1.000 V, anode 1.65 V); at 3/(4f) reversed 10.5 V; the follower\'s LED is reversed at both', () => {
  for (const f of [1, 50]) {
    const peak = solveAt(superdiode({ frequency: f }), 1 / (4 * f)).parts.D1.r.pins;
    const trough = solveAt(superdiode({ frequency: f }), 3 / (4 * f)).parts.D1.r.pins;
    near(peak.cathode, 1, 0.001, `${f} Hz peak: D1 cathode`);
    near(peak.anode, 1.65, 0.001, `${f} Hz peak: D1 anode (OUT1)`);
    near(trough.cathode, 0, 0.001, `${f} Hz trough: D1 cathode`);
    near(trough.anode, -10.5, 0.001, `${f} Hz trough: D1 anode (OUT1 at its low clip)`);
  }
  const peak = solveAt(followerLedBackwards, 0.25).parts.LED1.r.pins;
  const trough = solveAt(followerLedBackwards, 0.75).parts.LED1.r.pins;
  near(peak.cathode - peak.anode, 11, 0.001, 'the follower\'s LED reversed at the peak');
  near(trough.cathode - trough.anode, 13, 0.001, 'the follower\'s LED reversed at the trough');
});

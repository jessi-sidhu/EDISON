// An LED on a sine that crosses 0 V (bug, issue #2). On the sine's negative
// half a correctly placed LED is dark and reverse-biased, which is normal:
// it gets an info line ("LED1 dark: the sine reverses it on this half."),
// not the mistake "LED is backwards…", and the trough doesn't say
// "Circuit open". DC boards, and a sine that never crosses 0 V, keep the
// backwards warning. The page's half (Run, the panel through a trough) is
// e2e/led-on-a-sine.spec.js.
//
// Run with:  npm test
//
// Shapes these tests assume (stated so the builder matches them):
// - PartResult gains `swings: true` (docs/API-CONTRACT.md → PartResult) on
//   every part's result when the board holds a V element whose sine crosses
//   0 V (amplitude > |offset|); absent otherwise.
// - parts/led.js line(r, m): while on, today's generic ON line
//   "  💡 LED ON  (x.x mA)" (sim-on); with r.swings, dark and reverse-biased
//   by ≥ Vf, "  <label> dark: the sine reverses it on this half." (sim-info);
//   otherwise null. warnings() drops "backwards" when r.swings.
//
// Every board is solved by the real simulator at a step's t (1 ms step, no
// capacitor), as test/prompt-bank.test.js solves the bank's sines. The
// generator runs at 1 Hz with its 50 Ω output: t = 0.25 s is the peak, +5 V,
// and t = 0.75 s the trough, −5 V.

const assert = require('node:assert');

const Board    = require('../circuit3d/js/board-model.js');
const Parts    = require('../circuit3d/js/parts');
const Readings = require('../circuit3d/js/readings.js');
const Sim      = require('../circuit3d/js/simulate.js');

const BACKWARDS = 'LED is backwards. Current cannot flow from cathode to anode. Flip it around.';
const dark  = label => `  ${label} dark: the sine reverses it on this half.`;
const PEAK = 0.25, TROUGH = 0.75;

// An Example → one solve at t seconds (a plain solve without t).
function solve(ex, t) {
  const { components, wires } = Board.toSim(Board.fromExample(ex));
  const r = Number.isFinite(t) ? Sim.analyze(components, wires, { dt: 1e-3, state: {}, t }) : Sim.analyze(components, wires);
  assert.strictEqual(r.status, 'ok', `status: ${r.status}`);
  return { r, board: { components, wires } };
}

const texts   = r => r.lines.map(l => l.text);
const has     = (r, text, cls) => r.lines.some(l => l.text === text && l.cls === cls);
const show    = r => JSON.stringify(r.lines.map(l => [l.text, l.cls]));
const swingsOf = r => Object.fromEntries(Object.entries(r.parts).map(([label, p]) => [label, 'swings' in p.r ? p.r.swings : 'absent']));

// FG1 (OUT → tp_63, COM → tn_63), R1 from tp (tp_2 → a2, R1 b2–b6), the
// LEDs between column 6 and column 8, a8 → COM (tn_8). LED holes are
// [cathode, anode].
const FG1  = (amplitude, offset = 0) => ({ type: 'function_generator', label: 'FG1', values: { amplitude, offset, frequency: 1 } });
const R1   = ohms => ({ type: 'resistor', label: 'R1', holes: ['b2', 'b6'], values: { resistance: ohms } });
const LED  = (label, holes) => ({ type: 'led', label, holes, values: { color: 'red' } });
const WIRES = [['FG1.0', 'tp_63'], ['FG1.1', 'tn_63'], ['tp_2', 'a2'], ['a8', 'tn_8']];

// BANK-15's clean build: LED1 anode c6 / cathode c8, LED2 anode d8 /
// cathode d6, so one conducts on each half. The lit one carries
// (5 − 2.0) / (50 + 220 + 0.1) = 11.1 mA, and its 2.0 V reverse-biases the
// other by exactly Vf.
const backToBack = { name: 'back-to-back', parts: [FG1(5), R1(220), LED('LED1', ['c8', 'c6']), LED('LED2', ['d6', 'd8'])], wires: WIRES };

// One LED behind 470 Ω: at the trough nothing flows, the anode sits at
// −5 V and the cathode at 0 V, reverse-biased by 5 V.
const oneLed = (amplitude = 5, offset = 0) =>
  ({ name: 'one LED', parts: [FG1(amplitude, offset), R1(470), LED('LED1', ['c8', 'c6'])], wires: WIRES });

// ── The bug: a correctly placed LED on a sine that crosses 0 V ─────────────

test.each([
  // t        lit      dark
  [PEAK,      'LED1',  'LED2'],
  [TROUGH,    'LED2',  'LED1'],
])('back-to-back pair on a 5 Vp sine at t = %s s: no LED warning; %s\'s ON line (11.1 mA) and %s\'s "dark" info line; every result swings', (t, lit, off) => {
  const { r } = solve(backToBack, t);
  assert.strictEqual(r.parts[lit].m.on, true, `setup: ${lit} conducts at t = ${t}`);
  assert.strictEqual(r.parts[off].m.on, false, `setup: ${off} is dark at t = ${t}`);

  assert.deepStrictEqual({ LED1: r.parts.LED1.warnings, LED2: r.parts.LED2.warnings }, { LED1: [], LED2: [] },
    'neither LED warns: the dark one is reversed by the sine, not put in backwards');
  assert.ok(!texts(r).some(x => /backwards/i.test(x)), `no "backwards" line; got ${show(r)}`);
  assert.ok(has(r, '  💡 LED ON  (11.1 mA)', 'sim-on'), `the lit LED's ON line, as today; got ${show(r)}`);
  assert.ok(has(r, dark(off), 'sim-info'), `"${dark(off).trim()}" (sim-info); got ${show(r)}`);
  assert.deepStrictEqual(swingsOf(r), { FG1: true, R1: true, LED1: true, LED2: true },
    'every PartResult says swings: true (the generator\'s 5 Vp sine with 0 V offset crosses 0 V)');
});

test('one LED behind 470 Ω on a 5 Vp sine at the trough (t = 0.75 s): no warning, the "dark" info line, no "Circuit open", no mistake for the checker', () => {
  const { r, board } = solve(oneLed(), TROUGH);
  assert.strictEqual(r.parts.LED1.m.on, false, 'setup: the LED is dark at the trough');

  assert.deepStrictEqual(r.parts.LED1.warnings, [], 'LED1 does not warn');
  assert.ok(!texts(r).some(x => /backwards/i.test(x)), `no "backwards" line; got ${show(r)}`);
  assert.ok(!texts(r).some(x => x.includes('Circuit open')), `no "Circuit open" line at the trough; got ${show(r)}`);
  assert.ok(has(r, dark('LED1'), 'sim-info'), `"${dark('LED1').trim()}" (sim-info); got ${show(r)}`);
  // The mistake checker (Edison's HUD callouts) reads the same warnings.
  const kinds = Readings.from(r, board).problems().map(p => p.kind);
  assert.deepStrictEqual(kinds, [], `the mistake checker finds nothing; got ${JSON.stringify(kinds)}`);
});

// `swings` follows amplitude > |offset| (one LED behind 470 Ω, read at the
// peak). The 'absent' rows are pins (they pass today): a sine that only
// touches 0 V, or stays on one side, keeps the backwards warning.
test.each([
  // amplitude  offset  swings      why
  [5,           0,      true,       'centred on 0 V: ±5 V'],
  [5,           3,      true,       '−2…8 V'],
  [5,           -3,     true,       '−8…2 V: a negative offset still crosses'],
  [5,           5,      'absent',   '0…10 V touches 0 V, never below (the breathing LED)'],
  [5,           -5,     'absent',   '−10…0 V touches 0 V, never above'],
  [2,           -6,     'absent',   '−8…−4 V, all below 0 V'],
])('a %s Vp sine with a %s V offset: swings %s (%s)', (amplitude, offset, want) => {
  const { r } = solve(oneLed(amplitude, offset), PEAK);
  assert.deepStrictEqual(swingsOf(r), { FG1: want, R1: want, LED1: want }, `swings on every result: ${want}`);
});

// ── Pins: what keeps today's backwards warning ─────────────────────────────

test('pin: the breathing LED (5 Vp, 5 V offset, never below 0 V) put in backwards still warns "LED is backwards" at t = 0.25 s, with no swings', () => {
  const recipe = JSON.parse(JSON.stringify(Parts.get('function_generator').ai.recipe));
  const fg = recipe.parts.find(p => p.type === 'function_generator');
  assert.deepStrictEqual([fg.values.amplitude, fg.values.offset], [5, 5], 'setup: the recipe is 5 Vp on a 5 V offset');
  const led = recipe.parts.find(p => p.type === 'led');
  led.holes.reverse();   // cathode toward OUT: truly backwards

  const { r } = solve(recipe, PEAK);
  assert.deepStrictEqual(r.parts[led.label].warnings, [BACKWARDS]);
  assert.ok(has(r, '  ' + BACKWARDS, 'sim-warn'), `the backwards line; got ${show(r)}`);
  assert.deepStrictEqual(swingsOf(r), { FG1: 'absent', R1: 'absent', LED1: 'absent' }, 'no swings: the sine never crosses 0 V');
});

test('pin: led.js example "Put in backwards, the LED stays dark" (9 V DC) warns as today, its lines unchanged, with no swings', () => {
  const ex = Parts.get('led').examples.find(e => e.name === 'Put in backwards, the LED stays dark');
  assert.ok(ex, 'led.js keeps the example "Put in backwards, the LED stays dark"');
  const { r } = solve(ex);
  assert.deepStrictEqual(r.parts.LED1.warnings, [BACKWARDS]);
  assert.deepStrictEqual(r.lines.map(l => ({ text: l.text, cls: l.cls })), [
    { text: 'Battery 1: 9V', cls: 'sim-info' },
    { text: '  ' + BACKWARDS, cls: 'sim-warn' },
  ]);
  assert.deepStrictEqual(swingsOf(r), { BAT1: 'absent', R1: 'absent', LED1: 'absent' }, 'no swings on a DC board');
});

// Tests for the pure half of issue #103 (time runs while simulating): the
// step size the page picks, and the results lines while a capacitor
// discharges with the battery cut off. The page's time loop itself (the
// clock, Stop, control clicks) is checked in e2e/time-run.spec.js.
//
// Run with:  npm test
//
// Seams these tests assume (stated so the builder matches them):
// - Sim.pickDt(tauMin) is exported by simulate.js (module.exports in Node,
//   window.Sim in the page): tauMin / 50 seconds, clamped to 10 µs–10 ms;
//   1 ms when tauMin is not a positive finite number (τ can't be estimated).
//   Spec: "Time and the capacitor" → "The step size and the clock".
// - analyze(components, wires, { dt, state }) as in test/transient.test.js.
//
// The capacitor is the test-only stand-in test/fixtures/parts/test_capacitor.js
// (ai: false), until #104's part lands.

const assert = require('node:assert');

const Parts = require('../circuit3d/js/parts');
const Sim   = require('../circuit3d/js/simulate.js');
const testCapacitor = require('./fixtures/parts/test_capacitor.js');

beforeAll(() => { if (!Parts.get('test_capacitor')) Parts.define(testCapacitor()); });

// ── 1. Step size ──────────────────────────────────────────────

describe('pickDt(tauMin): τ/50, clamped to 10 µs–10 ms, 1 ms when unknown', () => {
  test('Sim.pickDt is exported', () => {
    assert.equal(typeof Sim.pickDt, 'function', 'simulate.js must export pickDt(tauMin) on module.exports / window.Sim');
  });

  test.each([
    // tauMin (s)   dt (s)    why
    [0.1,           0.002,    '0.1 / 50'],
    [0.01,          0.0002,   '0.01 / 50'],
    [5e-4,          1e-5,     '5e-4 / 50 is exactly the 10 µs floor'],
    [1,             0.01,     '1 / 50 = 20 ms, clamped down to 10 ms'],
    [100,           0.01,     'a slow RC still steps at most 10 ms'],
    [1e-4,          1e-5,     '1e-4 / 50 = 2 µs, clamped up to 10 µs'],
    [1e-9,          1e-5,     'a tiny RC still steps at least 10 µs'],
    [undefined,     1e-3,     'no estimate: 1 ms'],
    [null,          1e-3,     'no estimate: 1 ms'],
    [Number.NaN,    1e-3,     'no estimate: 1 ms'],
    [Infinity,      1e-3,     'no estimate: 1 ms'],
    [0,             1e-3,     'no estimate: 1 ms'],
    [-1,            1e-3,     'no estimate: 1 ms'],
  ])('pickDt(%s) = %s s (%s)', (tau, want) => {
    assert.equal(typeof Sim.pickDt, 'function', 'Sim.pickDt is not exported');
    const got = Sim.pickDt(tau);
    assert.ok(Math.abs(got - want) <= want * 1e-9, `pickDt(${tau}): expected ${want} s, got ${got}`);
  });
});

// ── 2. Discharging with the battery cut off ───────────────────
// 9 V → SW1 (button, released) → column 8. CT1 1000 µF from column 8 to −,
// R2 1 kΩ from column 8 to −. CT1 starts at 9 V: with the button open the
// battery supplies nothing, but CT1 discharges through R2 at about
// 9 mA, so "Circuit open — no complete path." would be wrong.

function pins(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: 0, y: 0, z: 0 });
  return out;
}
function comp(type, label, holes, extra) {
  return Object.assign({ type, label, pins: pins(holes.length), holeRefs: holes }, extra || {});
}
function h(col, row) { return { col, row }; }
function wire(a, b)  { return { startHole: a, endHole: b }; }

function dischargeBoard() {
  const components = [
    comp('battery', 'BAT1', [h(1, 'tp'), h(1, 'tn')]),
    comp('button', 'SW1', [h(5, 'a'), h(8, 'a')], { controls: { pressed: false } }),
    comp('test_capacitor', 'CT1', [h(8, 'b'), h(12, 'a')], { values: { farads: 1e-3 } }),
    comp('resistor', 'R2', [h(8, 'c'), h(15, 'a')], { values: { resistance: 1000 } }),
  ];
  const wires = [wire(h(2, 'tp'), h(5, 'b')), wire(h(12, 'b'), h(2, 'tn')), wire(h(15, 'b'), h(3, 'tn'))];
  return { components, wires };
}

const texts = r => r.lines.map(l => l.text).join(' | ');

test('a capacitor discharging through a resistor, battery cut off: no "Circuit open" line', () => {
  const { components, wires } = dischargeBoard();
  const r = Sim.analyze(components, wires, { dt: 0.02, state: { 'CT1.c': 9 } });
  assert.equal(r.status, 'ok', `status: ${r.status}`);
  const ic = r.parts.CT1 && r.parts.CT1.r.current.c;
  assert.ok(Math.abs(ic) > 5, `CT1 should be discharging at several mA; got ${ic} mA`);
  assert.ok(!/Circuit open/.test(texts(r)), `current flows out of CT1 (${ic.toFixed(2)} mA), yet the lines say: ${texts(r)}`);
});

// Pin: the same board with CT1 empty really is open (nothing flows), so the
// line must stay. Guards against dropping the line outright.
test('pin: the same board with the capacitor at 0 V still says "Circuit open"', () => {
  const { components, wires } = dischargeBoard();
  const r = Sim.analyze(components, wires, { dt: 0.02, state: { 'CT1.c': 0 } });
  assert.equal(r.status, 'ok', `status: ${r.status}`);
  assert.ok(/Circuit open/.test(texts(r)), `nothing flows, so the open line stays; got: ${texts(r)}`);
});

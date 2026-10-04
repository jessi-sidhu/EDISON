// Tests for time stepping in simulate.js (issue #102): a C element charges
// and discharges, and a board with no capacitor solves exactly as before.
//
// Run with:  npm test
//
// Contract these tests assume (docs/API-CONTRACT.md → Elements, C):
// - analyze(components, wires) with no third argument: a C is open (DC
//   steady state).
// - analyze(components, wires, { dt, state }): each C is the backward-Euler
//   companion G = C/dt between a and b, plus a current source G·v_prev,
//   v = V(a) − V(b), v_prev = state[key] or 0.
// - key = `${label}.${elementId}` ('CT1.c'), so two capacitors never share one.
// - result.state = { [key]: new v in volts }. The capacitor's current is
//   parts[label].r.current[elementId] in mA, G·(v_new − v_prev)·1000, + from
//   a to b (charging).
//
// Expected values are the closed-form RC answers. Backward Euler with
// dt = τ/50 is within about 1 % of them, so each check allows 2 %.
//
// There is no capacitor part yet (#104), so this file registers a test-only
// one, ai: false. Vitest gives each test file its own module registry, so
// it never shows up in another file's Parts.all().

const assert = require('node:assert');

const Parts = require('../circuit3d/js/parts');
const Sim   = require('../circuit3d/js/simulate.js');

// ── The test-only capacitor ───────────────────────────────────
// One C element, id 'c', pins a → b. Registered in beforeAll so a
// registry that still rejects C fails each test with define's own reason.

const testCapacitor = () => ({
  type:     'test_capacitor',
  name:     'Test capacitor',
  sub:      '2 leads · test only',
  category: 'Passives',
  icon:     '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 12h8M14 12h8M10 5v14M14 5v14"/></svg>',
  prefix:   'CT',
  pins:     ['a', 'b'],
  place:    { kind: 'span', span: { min: 2, max: 5, default: 3 }, rotations: ['h', 'v'] },
  values:   { farads: { unit: 'F', default: 1e-3, min: 1e-12, max: 10 } },
  elements: v => [{ kind: 'C', id: 'c', pins: ['a', 'b'], farads: v.farads }],
  measure:  r => ({ current: (r && r.current && r.current.c) || 0 }),
  report:   (r, m) => `capacitor, ${((m && m.current) || 0).toFixed(1)} mA`,
  ai:       false,
  view:     { build: () => ({ group: null, pinPositions: [] }) },
  examples: [{
    name:  'test capacitor on 9 V through 1 kΩ',
    parts: [{ type: 'battery', label: 'BAT1' },
            { type: 'resistor', label: 'R1', holes: ['a2', 'a6'], values: { resistance: 1000 } },
            { type: 'test_capacitor', label: 'CT1', holes: ['a6', 'a9'] }],
    wires: [['BAT1.0', 'tp_2'], ['BAT1.1', 'tn_9'], ['tp_2', 'b2'], ['b9', 'tn_9']],
    expect: { CT1: { current: [-0.1, 0.1] } },
  }],
});

let defineError = null;
beforeAll(() => {
  try { if (!Parts.get('test_capacitor')) Parts.define(testCapacitor()); } catch (e) { defineError = e; }
});

function needCapacitor() {
  assert.ok(!defineError, 'Parts.define must accept a part with a C element: ' + (defineError && defineError.message));
}

// ── Fixture helpers (as in simulate.test.js) ──────────────────

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

// Battery pins straight on the rails: + on tp, − on tn.
const battery = () => comp('battery', 'BAT1', [h(1, 'tp'), h(1, 'tn')]);
const cap = (label, a, b, farads) => comp('test_capacitor', label, [a, b], { values: { farads } });
const resistor = (label, a, b, ohms) => comp('resistor', label, [a, b], { values: { resistance: ohms } });

const near = (got, want, pct) => Math.abs(got - want) <= Math.abs(want) * pct / 100;
const within2 = (got, want, what) =>
  assert.ok(near(got, want, 2), `${what}: expected ${want} within 2 %, got ${got}`);

// n steps of dt from `state`. Returns the last result and its state.
function step(components, wires, dt, n, state) {
  let r = null;
  let s = state || {};
  for (let k = 0; k < n; k++) {
    r = Sim.analyze(components, wires, { dt, state: s });
    assert.equal(r.status, 'ok', `step ${k + 1}: status ${r.status}`);
    assert.ok(r.state && typeof r.state === 'object', `step ${k + 1}: analyze with { dt, state } must return result.state`);
    s = r.state;
  }
  return { r, state: s };
}

// ── The RC board: 9 V → R1 1 kΩ → CT1 1000 µF → 0 V, τ = 1 s ──
// CT1.a is column 10 (between R1 and CT1), CT1.b is column 15 (on −).
function rcBoard(farads) {
  const components = [battery(),
    resistor('R1', h(5, 'a'), h(10, 'a'), 1000),
    cap('CT1', h(10, 'b'), h(15, 'a'), farads || 1e-3)];
  const wires = [wire(h(2, 'tp'), h(5, 'b')), wire(h(15, 'b'), h(2, 'tn'))];
  return { components, wires };
}

const DT = 0.02;

// ── 1. Charging ───────────────────────────────────────────────
// V_C(t) = 9 (1 − e^(−t/τ)), τ = RC = 1 s:
//   t = 1 s → 9 (1 − e^−1) = 5.689 V;  t = 5 s → 9 (1 − e^−5) = 8.939 V.

test('charging: 9 V through 1 kΩ into 1000 µF reads 5.69 V at 1 s and 8.94 V at 5 s', () => {
  needCapacitor();
  const { components, wires } = rcBoard();
  const at1 = step(components, wires, DT, 50);
  within2(at1.state['CT1.c'], 5.689, 'V_C at 1 s');
  const at5 = step(components, wires, DT, 200, at1.state);
  within2(at5.state['CT1.c'], 8.939, 'V_C at 5 s');
});

// The first step from 0 V: G = C/dt = 0.05 S, so (9 − v)/1000 = 0.05 v,
// v = 0.17647 V and the capacitor takes 0.05 × 0.17647 = 8.824 mA, + (a → b),
// the same current as R1 (KCL at column 10).
test('charging: the capacitor current is G·Δv in mA, + a → b, and equals the resistor current', () => {
  needCapacitor();
  const { components, wires } = rcBoard();
  const { r, state } = step(components, wires, DT, 1);
  assert.ok(Math.abs(state['CT1.c'] - 0.17647) < 1e-4, `V_C after one step: expected 0.17647, got ${state['CT1.c']}`);
  const ic = r.parts.CT1 && r.parts.CT1.r.current.c;
  assert.ok(Math.abs(ic - 8.824) < 0.01, `CT1 current after one step: expected 8.824 mA, got ${ic}`);
  const ir = r.currents[1] * 1000;
  assert.ok(Math.abs(ic - ir) < 0.01, `KCL: CT1 ${ic} mA vs R1 ${ir} mA`);
});

// ── 2. Discharge ──────────────────────────────────────────────
// CT1 starts at 9 V with R1 1 kΩ straight across it. Only the battery's −
// touches the loop (it grounds it, no current flows from +).
// V_C(1 s) = 9 e^−1 = 3.311 V, and the current is − (b → a inside CT1).

test('discharge: 1000 µF from 9 V across 1 kΩ reads 3.31 V at 1 s, current negative', () => {
  needCapacitor();
  const components = [battery(),
    resistor('R1', h(10, 'a'), h(15, 'a'), 1000),
    cap('CT1', h(10, 'b'), h(15, 'b'), 1e-3)];
  const wires = [wire(h(15, 'c'), h(2, 'tn'))];
  const { r, state } = step(components, wires, DT, 50, { 'CT1.c': 9 });
  within2(state['CT1.c'], 3.311, 'V_C at 1 s');
  const ic = r.parts.CT1.r.current.c;
  assert.ok(ic < 0, `a discharging capacitor's current is negative (b → a); got ${ic} mA`);
  // KCL: the same current leaves through R1, V_C / 1 kΩ.
  assert.ok(Math.abs(Math.abs(ic) - state['CT1.c']) < 0.05, `|I_C| ${ic} mA should be V_C / 1 kΩ = ${state['CT1.c']} mA`);
});

// ── 3. Capacitor, button and LED ──────────────────────────────
// 9 V → SW1 (button) → column 8. CT1 1000 µF from column 8 to −, and
// R1 1 kΩ → LED1 (red, vf 2.0) → − also from column 8.
// Button closed: CT1 charges to 9 V in one step (through 1 mΩ), LED at
// (9 − 2)/1000 = 7 mA. Button open: CT1 feeds the LED through R1, so the
// LED current is (V_C − 2)/1000 with V_C − 2 = 7 e^(−t/τ), τ = 1 s:
// 2.58 mA at 1 s (lit), below the 1 mA threshold after ln 7 = 1.95 s.

test('capacitor, button and LED: the LED stays lit after the button opens, then goes dark', () => {
  needCapacitor();
  const button = comp('button', 'SW1', [h(5, 'a'), h(8, 'a')], { controls: { pressed: true } });
  const components = [battery(), button,
    cap('CT1', h(8, 'b'), h(12, 'a'), 1e-3),
    resistor('R1', h(8, 'c'), h(15, 'a'), 1000),
    comp('led', 'LED1', [h(20, 'a'), h(15, 'b')])];   // cathode col 20, anode col 15
  const wires = [wire(h(2, 'tp'), h(5, 'b')), wire(h(12, 'b'), h(2, 'tn')), wire(h(20, 'b'), h(3, 'tn'))];

  let { r, state } = step(components, wires, DT, 5);
  assert.ok(Math.abs(state['CT1.c'] - 9) < 0.01, `charged with the button down: expected 9 V, got ${state['CT1.c']}`);
  assert.equal(r.parts.LED1.m.on, true, 'LED lit while the button is down');

  button.controls.pressed = false;
  ({ r, state } = step(components, wires, DT, 1, state));
  assert.equal(r.parts.LED1.m.on, true, `LED still lit one step after the button opens (${r.parts.LED1.m.current} mA)`);

  ({ r, state } = step(components, wires, DT, 49, state));
  assert.equal(r.parts.LED1.m.on, true, 'LED still lit 1 s after the button opens');
  within2(r.parts.LED1.m.current, 7 * Math.exp(-1), 'LED current 1 s after opening (mA)');

  ({ r, state } = step(components, wires, DT, 100, state));
  assert.equal(r.parts.LED1.m.on, false, `LED dark 3 s after the button opens (${r.parts.LED1.m.current} mA)`);
});

// ── 4. No dt: a capacitor is open ─────────────────────────────
// DC steady state: no current through R1 or CT1, so R1 drops nothing and
// the full 9 V sits across the capacitor (column 10 at 9 V, column 15 at 0).

test('without dt a capacitor is open: no current, the full 9 V across it', () => {
  needCapacitor();
  const { components, wires } = rcBoard();
  const r = Sim.analyze(components, wires);
  assert.equal(r.status, 'ok');
  assert.ok(Math.abs(r.currents[1] * 1000) < 1e-6, `R1 current: expected 0 mA, got ${r.currents[1] * 1000}`);
  assert.ok(Math.abs(r.parts.CT1.r.current.c) < 1e-6, `CT1 current: expected 0 mA, got ${r.parts.CT1.r.current.c}`);
  const va = r.voltageAt(h(10, 'b')), vb = r.voltageAt(h(15, 'a'));
  assert.ok(Math.abs(va - 9) < 1e-6, `V(CT1.a): expected 9 V, got ${va}`);
  assert.ok(Math.abs(vb) < 1e-6, `V(CT1.b): expected 0 V, got ${vb}`);
});

// ── 5. No capacitor: today's path (pin) ───────────────────────
// PIN (passes today): passing { dt, state } must not change a board with
// no C at all. 9 V → 470 Ω → red LED, and an open button beside it.

test('pin: a board with no capacitor solves the same with and without { dt, state }', () => {
  const components = [battery(),
    resistor('R1', h(5, 'a'), h(10, 'a'), 470),
    comp('led', 'LED1', [h(15, 'a'), h(10, 'b')]),
    comp('button', 'SW1', [h(20, 'a'), h(23, 'a')])];
  const wires = [wire(h(2, 'tp'), h(5, 'b')), wire(h(15, 'b'), h(2, 'tn')), wire(h(20, 'b'), h(4, 'tp'))];
  const pick = r => JSON.stringify({ status: r.status, shorted: r.shorted, nodeVoltages: r.nodeVoltages,
    currents: r.currents, parts: r.parts, lines: r.lines });
  const plain = Sim.analyze(components, wires);
  const timed = Sim.analyze(components, wires, { dt: DT, state: { 'X1.c': 5 } });
  assert.equal(pick(timed), pick(plain));
});

// ── 6. Two capacitors keep their own state ────────────────────
// Two RC branches off one 9 V: R1 1 kΩ + CT1 1000 µF (τ = 1 s) and
// R2 1 kΩ + CT2 2000 µF (τ = 2 s). At 1 s:
//   CT1 = 9 (1 − e^−1) = 5.689 V;  CT2 = 9 (1 − e^−0.5) = 3.541 V.

test('two capacitors keep separate state keys, label.element', () => {
  needCapacitor();
  const components = [battery(),
    resistor('R1', h(5, 'a'), h(10, 'a'), 1000),
    cap('CT1', h(10, 'b'), h(15, 'a'), 1e-3),
    resistor('R2', h(25, 'a'), h(30, 'a'), 1000),
    cap('CT2', h(30, 'b'), h(35, 'a'), 2e-3)];
  const wires = [wire(h(2, 'tp'), h(5, 'b')), wire(h(15, 'b'), h(2, 'tn')),
                 wire(h(22, 'tp'), h(25, 'b')), wire(h(35, 'b'), h(22, 'tn'))];
  const { state } = step(components, wires, DT, 50);
  assert.deepEqual(Object.keys(state).sort(), ['CT1.c', 'CT2.c']);
  within2(state['CT1.c'], 5.689, 'CT1 at 1 s');
  within2(state['CT2.c'], 3.541, 'CT2 at 1 s');
});

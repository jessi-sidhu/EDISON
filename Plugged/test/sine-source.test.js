// Tests for the sine source in simulate.js (issue #119): a V element with a
// `wave`, stepped by the clock, and pickDt taking the wave's frequency. The
// page's half (Run starts the clock for a wave-only board) is checked in
// e2e/sine-run.spec.js.
//
// Run with:  npm test
//
// Seams these tests assume (spec: docs/superpowers/specs/
// 2026-10-01-phase-4-op-amp-and-sine-design.md → "The sine source"):
// - A V element may carry wave: { kind: 'sine', amp, freq, offset }.
//   - analyze(components, wires) with no third argument: it is `offset`.
//   - analyze(components, wires, { dt, state, t }): it is
//     offset + amp·sin(2π·freq·t), with t the step's time in seconds.
//   - Either way the wave wins over `volts` (the stub's volts is 0).
// - Sim.pickDt(tauMin, fmax) = min(tauMin/50, 1/(50·fmax)), clamped to
//   10 µs–10 ms; with fmax missing it is exactly today's pickDt(tauMin).
//
// The source is the test-only stand-in test/fixtures/parts/test_wave_source.js
// (ai: false, 1 Hz, amp and offset as values), until #120's generator lands.
// The capacitor is test/fixtures/parts/test_capacitor.js: the real part is
// polarised, and a sine with offset 0 reverses it every half cycle.

const assert = require('node:assert');

const Parts = require('../circuit3d/js/parts');
const Sim   = require('../circuit3d/js/simulate.js');
const testWaveSource = require('./fixtures/parts/test_wave_source.js');
const testCapacitor  = require('./fixtures/parts/test_capacitor.js');

const FREQ = testWaveSource.FREQ;

beforeAll(() => {
  if (!Parts.get('test_wave_source')) Parts.define(testWaveSource());
  if (!Parts.get('test_capacitor')) Parts.define(testCapacitor());
});

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

function near(got, want, tol, what) {
  assert.ok(typeof got === 'number' && Math.abs(got - want) <= tol,
    `${what}: expected ${want} (±${tol}), got ${got}`);
}

// TW1 (plus a2, minus a5, the ref) with R1 1 kΩ straight across it (b2–b5).
// The plus node is column 2, read at c2.
function loadBoard(values) {
  const components = [
    comp('test_wave_source', 'TW1', [h(2, 'a'), h(5, 'a')], { values }),
    comp('resistor', 'R1', [h(2, 'b'), h(5, 'b')], { values: { resistance: 1000 } }),
  ];
  return { components, wires: [] };
}

// ── 1. The wave's value ───────────────────────────────────────
// amp 3 V, offset 2 V, 1 Hz: 2 V at t = 0, 5 V at a quarter period.

describe('a V with a wave: offset in a plain solve, offset + amp·sin(2πft) at a step\'s t', () => {
  const values = { amp: 3, offset: 2 };

  test('plain analyze (no third argument): the source reads its offset, 2 V', () => {
    const { components, wires } = loadBoard(values);
    const r = Sim.analyze(components, wires);
    assert.equal(r.status, 'ok', `status: ${r.status}`);
    near(r.voltageAt(h(2, 'c')), 2, 1e-3, 'plus node in a plain solve');
  });

  test('{ dt, state, t: 0 }: sin(0) = 0, so it reads the offset, 2 V', () => {
    const { components, wires } = loadBoard(values);
    const r = Sim.analyze(components, wires, { dt: 0.001, state: {}, t: 0 });
    assert.equal(r.status, 'ok', `status: ${r.status}`);
    near(r.voltageAt(h(2, 'c')), 2, 1e-3, 'plus node at t = 0');
  });

  test('{ dt, state, t: 1/(4f) }: the peak, offset + amp = 5 V', () => {
    const { components, wires } = loadBoard(values);
    const r = Sim.analyze(components, wires, { dt: 0.001, state: {}, t: 1 / (4 * FREQ) });
    assert.equal(r.status, 'ok', `status: ${r.status}`);
    near(r.voltageAt(h(2, 'c')), 5, 1e-3, 'plus node at t = 1/(4f)');
  });

  test('{ dt, state, t: 3/(4f) }: the trough, offset − amp = −1 V', () => {
    const { components, wires } = loadBoard(values);
    const r = Sim.analyze(components, wires, { dt: 0.001, state: {}, t: 3 / (4 * FREQ) });
    assert.equal(r.status, 'ok', `status: ${r.status}`);
    near(r.voltageAt(h(2, 'c')), -1, 1e-3, 'plus node at t = 3/(4f)');
  });
});

// ── 2. RC low-pass in steady state ────────────────────────────
// 5 Vp, 1 Hz, offset 0 → R1 1 kΩ → CT1 1000 µF → ground. τ = 1 s, ωτ = 2π.
// Steady-state |V_C| = 5 / √(1 + (2π)²) ≈ 0.786 V. Run 10 s (10 τ), then
// take the peak over the last full cycle.

test('a 5 Vp, 1 Hz sine through 1 kΩ into 1000 µF: V_C peak within 2 % of 5/√(1+(2π)²) after 5τ', () => {
  assert.equal(typeof Sim.pickDt, 'function', 'Sim.pickDt is not exported');
  const components = [
    comp('test_wave_source', 'TW1', [h(2, 'a'), h(5, 'a')], { values: { amp: 5, offset: 0 } }),
    comp('resistor', 'R1', [h(2, 'b'), h(8, 'a')], { values: { resistance: 1000 } }),
    comp('test_capacitor', 'CT1', [h(8, 'b'), h(12, 'a')], { values: { farads: 1e-3 } }),
  ];
  const wires = [wire(h(12, 'b'), h(5, 'b'))];

  const dt = Sim.pickDt(1, FREQ);
  const steps = Math.round(10 / dt);
  const lastCycle = Math.round(1 / FREQ / dt);
  let state = {};
  let peak = 0;
  for (let k = 0; k < steps; k++) {
    const r = Sim.analyze(components, wires, { dt, state, t: k * dt });
    assert.equal(r.status, 'ok', `step ${k}: status ${r.status}`);
    state = r.state;
    if (k >= steps - lastCycle) peak = Math.max(peak, Math.abs(state['CT1.c']));
  }
  const want = 5 / Math.sqrt(1 + (2 * Math.PI) ** 2);
  near(peak, want, want * 0.02, `V_C peak over the last cycle (dt = ${dt} s)`);
});

// ── 3. pickDt with the wave's frequency ───────────────────────

describe('pickDt(tauMin, fmax): min(τ/50, 1/(50·fmax)), clamped to 10 µs–10 ms', () => {
  test.each([
    // tauMin     fmax        at most     why
    [1,           1,          0.02,       'pin (the 10 ms clamp already gives it): ≥ 50 points per 1 Hz cycle'],
    [1,           100,        0.0002,     '≥ 50 points per 100 Hz cycle, though τ alone allows 10 ms'],
    [undefined,   100,        0.0002,     'a wave-only board (no C, τ unknown) still gets ≥ 50 points per cycle'],
  ])('pickDt(%s, %s) ≤ %s s (%s)', (tau, f, max) => {
    assert.equal(typeof Sim.pickDt, 'function', 'Sim.pickDt is not exported');
    const got = Sim.pickDt(tau, f);
    assert.ok(got <= max * (1 + 1e-9), `pickDt(${tau}, ${f}): expected at most ${max} s, got ${got}`);
    assert.ok(got >= 1e-5 * (1 - 1e-9), `pickDt(${tau}, ${f}): expected at least the 10 µs floor, got ${got}`);
  });

  // Pin (passes today): the floor still holds with fmax given.
  test('pin: pickDt(1e-9, 1) is clamped up to 10 µs', () => {
    near(Sim.pickDt(1e-9, 1), 1e-5, 1e-14, 'pickDt(1e-9, 1)');
  });

  // Pin (passes today): one argument is today's value.
  test('pin: pickDt(0.5) with no fmax is today\'s 0.01 s', () => {
    near(Sim.pickDt(0.5), 0.01, 1e-12, 'pickDt(0.5)');
  });
});

// ── 4. No wave, no C: today's path ────────────────────────────
// Pin (passes today): a plain V ignores t. 9 V battery across R1 1 kΩ.

test('pin: a battery and a resistor read 9 V, plain or with { dt, state, t } (a V with no wave ignores t)', () => {
  const components = [
    comp('battery', 'BAT1', [h(1, 'tp'), h(1, 'tn')]),
    comp('resistor', 'R1', [h(5, 'a'), h(9, 'a')], { values: { resistance: 1000 } }),
  ];
  const wires = [wire(h(2, 'tp'), h(5, 'b')), wire(h(9, 'b'), h(2, 'tn'))];
  const plain = Sim.analyze(components, wires);
  assert.equal(plain.status, 'ok', `status: ${plain.status}`);
  near(plain.voltageAt(h(5, 'c')), 9, 1e-6, 'R1 at the + end, plain solve');
  const stepped = Sim.analyze(components, wires, { dt: 0.01, state: {}, t: 0.37 });
  assert.equal(stepped.status, 'ok', `status: ${stepped.status}`);
  near(stepped.voltageAt(h(5, 'c')), 9, 1e-6, 'R1 at the + end, t = 0.37 s');
});

// ── 5. Coverage pins (reviewer, issue #119) ───────────────────
// These pin code that already exists (Sim.estimateFreqMax, sourceVolts'
// fallback), so they pass as written. Each inline part is the fixture with
// its type, prefix and elements swapped; ai: false, test-only.

function defineInline(type, prefix, el) {
  if (Parts.get(type)) return;
  Parts.define(Object.assign(testWaveSource(), { type, prefix, name: `Test ${prefix}`, elements: () => [el] }));
}

describe('pin: estimateFreqMax(components) is the board\'s highest wave frequency', () => {
  const FAST = 100;   // Hz, the second source's frequency
  beforeAll(() => {
    defineInline('test_wave_fast', 'TWF', { kind: 'V', id: 'v', pins: ['plus', 'minus'], volts: 0,
                                            wave: { kind: 'sine', amp: 1, freq: FAST, offset: 0 } });
  });

  test('a battery and a resistor (no wave): undefined', () => {
    const components = [
      comp('battery', 'BAT1', [h(1, 'tp'), h(1, 'tn')]),
      comp('resistor', 'R1', [h(5, 'a'), h(9, 'a')], { values: { resistance: 1000 } }),
    ];
    assert.equal(Sim.estimateFreqMax(components), undefined);
  });

  test('one TW1 stub: its frequency', () => {
    const { components } = loadBoard({ amp: 3, offset: 2 });
    assert.equal(Sim.estimateFreqMax(components), FREQ);
  });

  test('two wave sources (1 Hz and 100 Hz): the larger, whichever comes first', () => {
    const fast = comp('test_wave_fast', 'TWF1', [h(10, 'a'), h(13, 'a')]);
    const slow = comp('test_wave_source', 'TW1', [h(2, 'a'), h(5, 'a')], { values: { amp: 3, offset: 2 } });
    assert.equal(Sim.estimateFreqMax([slow, fast]), Math.max(FREQ, FAST));
    assert.equal(Sim.estimateFreqMax([fast, slow]), Math.max(FREQ, FAST));
  });
});

// A V with volts 3 and a malformed wave (amp NaN) reads its volts, 3 V, never
// NaN or the offset (0 V). An unknown kind ('square') is malformed too.
describe('pin: a malformed wave falls back to `volts`', () => {
  const CASES = [
    ['sine',   'test_wave_bad_sine',   'TWN'],
    ['square', 'test_wave_bad_square', 'TWQ'],
  ];
  beforeAll(() => {
    CASES.forEach(([kind, type, prefix]) => defineInline(type, prefix,
      { kind: 'V', id: 'v', pins: ['plus', 'minus'], volts: 3, wave: { kind, amp: NaN, freq: 1, offset: 0 } }));
  });

  test.each(CASES)('kind %s, amp NaN: 3 V plain and at t = 0.25 s', (kind, type, prefix) => {
    const components = [
      comp(type, `${prefix}1`, [h(2, 'a'), h(5, 'a')]),
      comp('resistor', 'R1', [h(2, 'b'), h(5, 'b')], { values: { resistance: 1000 } }),
    ];
    const plain = Sim.analyze(components, []);
    assert.equal(plain.status, 'ok', `status: ${plain.status}`);
    near(plain.voltageAt(h(2, 'c')), 3, 1e-6, `${kind}: plus node, plain solve`);
    const stepped = Sim.analyze(components, [], { dt: 0.001, state: {}, t: 0.25 });
    assert.equal(stepped.status, 'ok', `status: ${stepped.status}`);
    near(stepped.voltageAt(h(2, 'c')), 3, 1e-6, `${kind}: plus node, t = 0.25 s`);
  });
});

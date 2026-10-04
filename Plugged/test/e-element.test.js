// Tests for the E element in simulate.js (issue #116): a voltage-controlled
// voltage source that amplifies, clips inside its rails and limits its
// output current. A board with no E solves exactly as before.
//
// Run with:  npm test
//
// Contract these tests assume (docs/API-CONTRACT.md → Elements, E, and
// docs/superpowers/specs/2026-10-01-phase-4-op-amp-and-sine-design.md):
// - { kind: 'E', id, out: [+, −], ctrl: [+, −], gain, rout?, rails?: [vneg, vpos],
//   headroom?, ilim? }. rails name part pins; their node voltages bound the
//   output.
// - Without rails/ilim: a plain linear VCVS, gain·(V(ctrl+) − V(ctrl−))
//   behind rout (default 0).
// - With them: a mode block in settleModes. r.modes[id] is one of
//     linear  gain·vd behind rout
//     high    V(vpos) − headroom behind rout
//     low     V(vneg) + headroom behind rout
//     isrc+   +ilim out of the output
//     isrc−   −ilim (ilim into the output)
// - r.current[id] is the output current in mA, + when the E sources current
//   out of its out+ pin into the circuit (so isrc+ reads +ilim·1000).
// - A mode loop that never settles gives status 'unsettled' and no readings.
//
// Every expected number below is hand-computed in the comment above it.
//
// There is no op-amp part yet (TL072 is the next task), so this file
// registers two test-only parts, ai: false. Vitest gives each test file its
// own module registry, so they never show up in another file's Parts.all().
// In both, out− is the part's 'gnd' pin, wired to the supply's COM, so the
// output is measured against ground and "V(vpos) − headroom" is the same
// level whether the builder reads it as a node voltage or against out−.

const assert = require('node:assert');

const Parts = require('../circuit3d/js/parts');
const Sim   = require('../circuit3d/js/simulate.js');

// ── The test-only parts ───────────────────────────────────────

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 4v16l14-8z"/></svg>';
const GAIN_OPAMP = 200000;
const GAIN_VCVS  = 10;

const shared = {
  category: 'Semiconductors',
  icon:     ICON,
  place:    { kind: 'offboard' },
  measure:  r => ({ current: (r && r.current && r.current.e) || 0 }),
  report:   (r, m) => `test E, ${((m && m.current) || 0).toFixed(1)} mA`,
  ai:       false,
  view:     { build: () => ({ group: null, pinPositions: [] }) },
};

// A plain VCVS: gain 10, rout a value. No rails, no ilim, no modes.
const testVcvs = () => Object.assign({}, shared, {
  type:     'test_vcvs',
  name:     'Test VCVS',
  sub:      'gain 10 · test only',
  prefix:   'EV',
  pins:     ['inp', 'inn', 'out', 'gnd'],
  values:   { rout: { unit: 'Ω', default: 0, min: 0, max: 1000 } },
  elements: v => [{ kind: 'E', id: 'e', out: ['out', 'gnd'], ctrl: ['inp', 'inn'], gain: GAIN_VCVS, rout: v.rout }],
  examples: [{ name: 'test VCVS', parts: [{ type: 'test_vcvs', label: 'EV1' }], wires: [], expect: {} }],
});

// An op-amp-shaped E: gain 200 000, rails [vneg, vpos], headroom, ilim, rout.
const testOpamp = () => Object.assign({}, shared, {
  type:     'test_opamp',
  name:     'Test op-amp',
  sub:      'gain 200000 · test only',
  prefix:   'OA',
  pins:     ['inp', 'inn', 'out', 'vneg', 'vpos', 'gnd'],
  values:   {
    rout:     { unit: 'Ω', default: 0,    min: 0,     max: 1000 },
    headroom: { unit: 'V', default: 1.5,  min: 0,     max: 5 },
    ilim:     { unit: 'A', default: 0.02, min: 0.001, max: 1 },
  },
  elements: v => [{ kind: 'E', id: 'e', out: ['out', 'gnd'], ctrl: ['inp', 'inn'], gain: GAIN_OPAMP,
                    rout: v.rout, rails: ['vneg', 'vpos'], headroom: v.headroom, ilim: v.ilim }],
  examples: [{ name: 'test op-amp', parts: [{ type: 'test_opamp', label: 'OA1' }], wires: [], expect: {} }],
});

let defineError = null;
beforeAll(() => {
  try {
    if (!Parts.get('test_vcvs'))  Parts.define(testVcvs());
    if (!Parts.get('test_opamp')) Parts.define(testOpamp());
  } catch (e) { defineError = e; }
});

function needParts() {
  assert.ok(!defineError, 'Parts.define must accept a part with an E element: ' + (defineError && defineError.message));
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

// Rails: tp = +12 V, tn = COM (ground), bn = −12 V, from PS1 (placed first,
// so its COM grounds the board).
const supply = volts => comp('bench_supply', 'PS1', [h(1, 'tp'), h(1, 'tn'), h(1, 'bn')], { values: { voltage: volts } });
// A signal source: a second bench supply, + on column `col`, COM on ground,
// − on a spare column `spare` that nothing else touches.
const vin = (label, col, volts, spare) =>
  comp('bench_supply', label, [h(col, 'a'), h(2, 'tn'), h(spare, 'a')], { values: { voltage: volts } });
const resistor = (label, a, b, ohms) => comp('resistor', label, [a, b], { values: { resistance: ohms } });
// The op-amp: + input, − input, output on columns; rails on ±12 V; gnd on COM.
const opamp = (label, inp, inn, out, values) =>
  comp('test_opamp', label, [h(inp, 'b'), h(inn, 'a'), h(out, 'a'), h(3, 'bn'), h(3, 'tp'), h(4, 'tn')], { values });

const OPAMP = { rout: 50, headroom: 1.5, ilim: 0.02 };    // the TL072's numbers
const IDEAL = { rout: 0,  headroom: 1.5, ilim: 0.02 };

function solve(components, wires) {
  const r = Sim.analyze(components, wires || []);
  assert.equal(r.status, 'ok', `status: expected ok, got ${r.status}`);
  return r;
}
const res = (r, label) => {
  assert.ok(r.parts[label], `no result for ${label}`);
  return r.parts[label].r;
};
const close = (got, want, tol, what) =>
  assert.ok(Number.isFinite(got) && Math.abs(got - want) <= tol, `${what}: expected ${want} ± ${tol}, got ${got}`);

// ── Boards ────────────────────────────────────────────────────

// Non-inverting amp: Vin on column 10 = IN+; IN− on column 20; output on
// column 30. R1 1 kΩ from IN− to ground, R2 10 kΩ from the output to IN−.
function nonInverting(volts, values) {
  return [supply(12), vin('PS2', 10, volts, 60),
    opamp('OA1', 10, 20, 30, values),
    resistor('R1', h(20, 'b'), h(5, 'tn'), 1000),
    resistor('R2', h(30, 'b'), h(20, 'c'), 10000)];
}

// Follower: IN− and the output share column 30; a load from 30 to ground.
function follower(volts, loadOhms, values) {
  return [supply(12), vin('PS2', 10, volts, 60),
    opamp('OA1', 10, 30, 30, values),
    resistor('RL', h(30, 'b'), h(5, 'tn'), loadOhms)];
}

// Comparator (open loop): IN+ from PS2, IN− from PS3, 10 kΩ load to ground.
function comparator(plus, minus) {
  return [supply(12), vin('PS2', 10, plus, 60), vin('PS3', 20, minus, 61),
    opamp('OA1', 10, 20, 30, IDEAL),
    resistor('RL', h(30, 'b'), h(5, 'tn'), 10000)];
}

// ── 1. A plain VCVS ───────────────────────────────────────────
// PS1 at 0.3 V: IN+ on + (0.3 V), IN− on COM. Out = 10 × 0.3 = 3.000 V into
// 10 kΩ: 0.300 mA out of the output.
// With rout 100 Ω into 900 Ω: 3.0 × 900 / 1000 = 2.700 V, 3.0 / 1000 = 3.000 mA.

function vcvsBoard(rout, loadOhms) {
  return [supply(0.3),
    comp('test_vcvs', 'EV1', [h(3, 'tp'), h(3, 'tn'), h(30, 'a'), h(4, 'tn')], { values: { rout } }),
    resistor('RL', h(30, 'b'), h(5, 'tn'), loadOhms)];
}

test('VCVS gain 10: 0.3 V across ctrl gives 3.000 V out, 0.3 mA into 10 kΩ', () => {
  needParts();
  const r = res(solve(vcvsBoard(0, 10000)), 'EV1');
  close(r.pins.out, 3.0, 1e-4, 'EV1 out');
  close(r.current.e, 0.3, 1e-4, 'EV1 output current (mA)');
});

test('VCVS gain 10 behind rout 100 Ω into 900 Ω: 2.700 V out, 3.000 mA', () => {
  needParts();
  const r = res(solve(vcvsBoard(100, 900)), 'EV1');
  close(r.pins.out, 2.7, 1e-4, 'EV1 out');
  close(r.current.e, 3.0, 1e-4, 'EV1 output current (mA)');
});

// ── 2. Non-inverting amp, gain 11 ─────────────────────────────
// Ve = A(0.5 − Vout/11), Vout = Ve − 50·Vout/11000
//  → Vout = 5.5 / (1 + 11·(1 + 50/11000)/200000) = 5.5 / 1.00005525 = 5.49970 V.
// Iout = Vout / 11 kΩ = 0.49997 mA. Inside ±10.5 V and under 20 mA: linear.

test('non-inverting amp 1 kΩ / 10 kΩ, A 200000, 0.5 V in: 5.50 V out within 1 mV, linear', () => {
  needParts();
  const r = res(solve(nonInverting(0.5, OPAMP)), 'OA1');
  close(r.pins.out, 5.50, 1e-3, 'Vout');
  close(r.pins.out, 5.49970, 1e-4, 'Vout (hand calc with rout 50 Ω)');
  assert.equal(r.modes.e, 'linear');
  close(r.current.e, 0.49997, 1e-4, 'Iout (mA)');
});

// ── 3. Clipping at V(vpos) − headroom ─────────────────────────
// 2 V in asks for 22 V; the output stops at 12 − 1.5 = 10.50 V: high.
// rout 0: Vout = 10.500 V, Iout = 10.5 / 11 kΩ = 0.95455 mA.
// rout 50 Ω: 10.5 behind 50 Ω into 11 kΩ: 10.5 × 11000 / 11050 = 10.45249 V.

test('clipping: 2 V into the gain-11 amp on ±12 V, headroom 1.5, gives 10.50 V, mode high', () => {
  needParts();
  const r = res(solve(nonInverting(2, IDEAL)), 'OA1');
  close(r.pins.out, 10.50, 1e-3, 'Vout clipped');
  assert.equal(r.modes.e, 'high');
  close(r.current.e, 0.95455, 1e-4, 'Iout (mA)');

  const loaded = res(solve(nonInverting(2, OPAMP)), 'OA1');
  close(loaded.pins.out, 10.45249, 1e-4, 'Vout clipped behind rout 50 Ω');
  assert.equal(loaded.modes.e, 'high');
});

// The low side: a follower with IN+ on the −12 V rail asks for −12 V; it
// stops at −12 + 1.5 = −10.50 V into 10 kΩ: low, Iout = −1.05 mA (sinking).
test('clipping low: a follower with IN+ on −12 V stops at −10.50 V, mode low, sinking 1.05 mA', () => {
  needParts();
  const components = [supply(12),
    comp('test_opamp', 'OA1', [h(6, 'bn'), h(30, 'a'), h(30, 'b'), h(3, 'bn'), h(3, 'tp'), h(4, 'tn')], { values: IDEAL }),
    resistor('RL', h(30, 'c'), h(5, 'tn'), 10000)];
  const r = res(solve(components), 'OA1');
  close(r.pins.out, -10.50, 1e-3, 'Vout clipped low');
  assert.equal(r.modes.e, 'low');
  close(r.current.e, -1.05, 1e-4, 'Iout (mA)');
});

// ── 4. Current limit ──────────────────────────────────────────
// Follower at 5 V into 100 Ω would need 5 / 100 = 50 mA > 20 mA: isrc+.
// The output sources 20.000 mA, so Vout = 0.020 × 100 = 2.000 V.

test('current limit: a follower at 5 V into 100 Ω gives isrc+, 20 mA, Vout 2.00 V', () => {
  needParts();
  const r = res(solve(follower(5, 100, OPAMP)), 'OA1');
  assert.equal(r.modes.e, 'isrc+');
  close(r.current.e, 20.0, 1e-3, 'Iout (mA)');
  close(r.pins.out, 2.00, 1e-3, 'Vout');
});

// Under the limit the same follower is linear: 5 V into 1 kΩ is 5 mA.
// Vout = 5 / (1 + (1 + 50/1000)/200000) = 4.99997 V, Iout 5.0000 mA.
test('current limit: the same follower into 1 kΩ (5 mA) stays linear at 5.00 V', () => {
  needParts();
  const r = res(solve(follower(5, 1000, OPAMP)), 'OA1');
  assert.equal(r.modes.e, 'linear');
  close(r.pins.out, 4.99997, 1e-4, 'Vout');
  close(r.current.e, 5.0, 1e-3, 'Iout (mA)');
});

// A comparator (6 V vs 5 V, rout 50 Ω) straight into a red LED (vf 2.0,
// ron 0.1 Ω) to COM, no resistor: high would push (10.5 − 2.0) / 50 = 170 mA,
// so it limits: isrc+, 20 mA through the LED, Vout = 2.0 + 0.1 × 0.02 = 2.002 V.
// The LED's open voltage (every D off) is what the output can reach with no
// load: at most V(vpos) − headroom = 10.5 V, never a current pushed into a
// node nothing else holds.
test('current limit: a comparator straight into an LED limits at 20 mA and the LED open voltage stays ≤ 10.5 V', () => {
  needParts();
  const components = [supply(12), vin('PS2', 10, 6, 60), vin('PS3', 20, 5, 61),
    opamp('OA1', 10, 20, 30, OPAMP),
    comp('led', 'LED1', [h(5, 'tn'), h(30, 'b')])];   // cathode on COM, anode on the output
  const r = solve(components);
  const oa = res(r, 'OA1');
  const led = res(r, 'LED1');
  assert.equal(oa.modes.e, 'isrc+');
  close(oa.current.e, 20.0, 1e-3, 'Iout (mA)');
  close(led.current.d, 20.0, 1e-3, 'LED current (mA)');
  close(oa.pins.out, 2.002, 1e-3, 'Vout');
  assert.ok(Number.isFinite(led.open.d) && led.open.d <= 10.5 + 1e-3,
    `LED1 open voltage: expected finite and ≤ 10.5 V, got ${led.open.d}`);
});

// ── 5. Comparator (open loop) ─────────────────────────────────
// 6 V vs 5 V: A·vd = 200 000 V → high, 12 − 1.5 = 10.50 V (rout 0), 1.05 mA.
// 4 V vs 5 V: A·vd = −200 000 V → low, −12 + 1.5 = −10.50 V, −1.05 mA.

test('comparator: 6 V against 5 V goes high at 10.50 V; 4 V against 5 V goes low at −10.50 V', () => {
  needParts();
  const up = res(solve(comparator(6, 5)), 'OA1');
  assert.equal(up.modes.e, 'high');
  close(up.pins.out, 10.50, 1e-3, 'Vout high');

  const down = res(solve(comparator(4, 5)), 'OA1');
  assert.equal(down.modes.e, 'low');
  close(down.pins.out, -10.50, 1e-3, 'Vout low');
  close(down.current.e, -1.05, 1e-4, 'Iout low (mA)');
});

// ── Two E blocks settle together ──────────────────────────────
// OA1 compares 6 V with 5 V: high, 10.50 V on column 30. OA2 is an inverting
// −10 amp (IN+ on ground, Rin 10 kΩ 30 → 40 = IN−, Rf 100 kΩ 40 → 50 = out):
// it asks for −105 V, so it clips low at −10.50 V.
// Its IN− then sits at (10.5·100k + (−10.5)·10k) / 110k = 8.59091 V.

test('two op-amps in a chain: a high comparator into an inverting ×10 clips the second one low', () => {
  needParts();
  const components = comparator(6, 5).concat([
    comp('test_opamp', 'OA2', [h(7, 'tn'), h(40, 'a'), h(50, 'a'), h(3, 'bn'), h(3, 'tp'), h(4, 'tn')], { values: IDEAL }),
    resistor('RIN', h(30, 'c'), h(40, 'b'), 10000),
    resistor('RF',  h(40, 'c'), h(50, 'b'), 100000)]);
  const r = solve(components);
  assert.equal(res(r, 'OA1').modes.e, 'high');
  close(res(r, 'OA1').pins.out, 10.50, 1e-3, 'OA1 Vout');
  assert.equal(res(r, 'OA2').modes.e, 'low');
  close(res(r, 'OA2').pins.out, -10.50, 1e-3, 'OA2 Vout');
  close(res(r, 'OA2').pins.inn, 8.59091, 1e-4, 'OA2 IN−');
});

// ── 6. Never wrong numbers ────────────────────────────────────
// No board built from these parts is known to leave the loop unsettled
// (a DC piecewise-linear op-amp always has a consistent mode here), so this
// checks the rule from both sides on every board above plus a Schmitt-style
// positive-feedback one (several consistent answers: any one will do):
// - 'unsettled' (or 'unsolvable') must come with no readings (parts {});
// - 'ok' must report, for each op-amp, a mode that is consistent with its
//   own pin voltages and current, per the mode table.

function checkConsistent(r, label, v) {
  const tol = 1e-4;
  const { pins: p, current, modes } = r;
  const vd = p.inp - p.inn;
  const drive = GAIN_OPAMP * vd;
  const hi = p.vpos - v.headroom;
  const lo = p.vneg + v.headroom;
  const amps = current.e / 1000;
  const vout = p.out - p.gnd;
  const want = Math.min(hi, Math.max(lo, drive));
  const at = `${label} (${modes.e}, vout ${vout}, drive ${drive}, I ${amps} A)`;
  switch (modes.e) {
    case 'linear':
      assert.ok(drive >= lo - tol && drive <= hi + tol, `${at}: linear needs drive inside the rails`);
      assert.ok(Math.abs(amps) <= v.ilim + 1e-9, `${at}: linear needs |I| ≤ ilim`);
      close(vout, drive - v.rout * amps, tol, `${at}: linear output`);
      break;
    case 'high':
      assert.ok(drive >= hi - tol, `${at}: high needs drive ≥ V(vpos) − headroom`);
      assert.ok(Math.abs(amps) <= v.ilim + 1e-9, `${at}: high needs |I| ≤ ilim`);
      close(vout, hi - v.rout * amps, tol, `${at}: high output`);
      break;
    case 'low':
      assert.ok(drive <= lo + tol, `${at}: low needs drive ≤ V(vneg) + headroom`);
      assert.ok(Math.abs(amps) <= v.ilim + 1e-9, `${at}: low needs |I| ≤ ilim`);
      close(vout, lo - v.rout * amps, tol, `${at}: low output`);
      break;
    case 'isrc+':
      close(amps, v.ilim, 1e-9, `${at}: isrc+ current`);
      assert.ok(vout <= want + tol, `${at}: isrc+ output must not pass the drive`);
      break;
    case 'isrc−':
      close(amps, -v.ilim, 1e-9, `${at}: isrc− current`);
      assert.ok(vout >= want - tol, `${at}: isrc− output must not pass the drive`);
      break;
    default:
      assert.fail(`${at}: mode must be linear, high, low, isrc+ or isrc−; got ${modes.e}`);
  }
}

test('never wrong numbers: each op-amp result is unsettled with no readings, or its mode is consistent', () => {
  needParts();
  // Schmitt-style: OUT → 10 kΩ → IN+ → 10 kΩ → ground, IN− at 5 V.
  const schmitt = [supply(12), vin('PS3', 20, 5, 61),
    opamp('OA1', 10, 20, 30, OPAMP),
    resistor('RA', h(30, 'b'), h(10, 'c'), 10000),
    resistor('RB', h(10, 'd'), h(5, 'tn'), 10000)];
  const boards = [
    ['non-inverting', nonInverting(0.5, OPAMP), OPAMP],
    ['clipped', nonInverting(2, OPAMP), OPAMP],
    ['follower 100 Ω', follower(5, 100, OPAMP), OPAMP],
    ['follower 1 kΩ', follower(5, 1000, OPAMP), OPAMP],
    ['comparator high', comparator(6, 5), IDEAL],
    ['comparator low', comparator(4, 5), IDEAL],
    ['schmitt', schmitt, OPAMP],
  ];
  for (const [name, components, values] of boards) {
    const r = Sim.analyze(components, []);
    if (r.status === 'unsettled' || r.status === 'unsolvable') {
      assert.deepEqual(r.parts, {}, `${name}: ${r.status} must carry no readings`);
      continue;
    }
    assert.equal(r.status, 'ok', `${name}: status`);
    checkConsistent(res(r, 'OA1'), `${name} OA1`, values);
  }
});

// ── 7. No E: the board solves as before ───────────────────────
// PIN (passes today): a supply, a resistor and a diode (a D mode block) with
// no E anywhere. E joins the same settle loop as D, so this guards that the
// D path is untouched.
// 12 V → R1 1 kΩ → D1 (vf 0.65, ron 0.1 Ω) → COM:
//   I = (12 − 0.65) / 1000.1 = 11.34887 mA; anode = 0.65 + 0.1·I = 0.651135 V.

test('PIN: a board with no E (supply, resistor, diode) gives the hand-computed numbers', () => {
  const components = [supply(12),
    resistor('R1', h(2, 'tp'), h(10, 'a'), 1000),
    comp('diode', 'D1', [h(14, 'a'), h(10, 'b')])];   // cathode, anode
  const wires = [wire(h(14, 'b'), h(3, 'tn'))];
  const r = solve(components, wires);
  assert.equal(r.parts.D1.r.modes.d, 'on');
  close(r.parts.D1.r.current.d, 11.34887, 1e-4, 'D1 current (mA)');
  close(r.parts.D1.r.pins.anode, 0.651135, 1e-5, 'D1 anode');
});

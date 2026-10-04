// Overload smoke (issue #99): which parts smoke and scorch on a solve, and the
// puff cap, as pure logic on real solves (Board.toSim → Sim.analyze →
// Readings.from), no mocks. The browser side (puffs rising, the body going
// dark, Stop clearing it) is e2e/smoke.spec.js.
//
// API these tests are written against (tools/smoke.js, UMD like
// tools/colouring.js, DOM/THREE wiring only when `document` exists):
//   scorchList(readings, labels)  the labels, in the order given, whose
//                                 readings.part(label).over is true; [] for
//                                 null readings; a label with no reading
//                                 (null part) is left out.
//   MAX_PUFFS                     the most puffs alive at once, a small
//                                 positive integer.
//
// Every value below is hand-computed and was checked against the real simulator.

const assert = require('node:assert');

const Sim      = require('../circuit3d/js/simulate.js');
const Board    = require('../circuit3d/js/board-model.js');
const Readings = require('../circuit3d/js/readings.js');

// Loaded per test, so a module that can't load in Node fails each test by name.
const Smoke = () => require('../circuit3d/js/tools/smoke.js');

// ── Helpers (as readings.test.js) ─────────────────────────────

const wiresOf = pairs => pairs.map(([from, to], i) => ({ id: 'W' + (i + 1), from, to }));
const BAT   = { type: 'battery', label: 'BAT1' };                   // 9 V
const POWER = [['BAT1.0', 'tp_1'], ['BAT1.1', 'tn_1']];             // + rail, − rail
const res   = (label, holes, ohms) => ({ type: 'resistor', label, holes, values: { resistance: ohms } });
// LED holes are [cathode, anode].
const led   = (label, holes) => ({ type: 'led', label, holes, values: { color: 'red' } });

function solve(parts, pairs) {
  const board = Board.toSim({ parts, wires: wiresOf(pairs) });
  const result = Sim.analyze(board.components, board.wires);
  return Readings.from(result, board);
}
const labelsOf = parts => parts.filter(p => p.label !== 'BAT1').map(p => p.label);

// tp → c10, R1 a10–a14, second part b14–b18, c18 → tn.
const LOOP_WIRES = [...POWER, ['tp_10', 'c10'], ['c18', 'tn_18']];

// ── scorchList on real circuits ────────────────────────────────

test('scorchList: exactly the over-rated parts scorch, in series, parallel and straight across the battery', () => {
  const cases = [
    // tp_14 → a14, LED1 anode b14 / cathode b18, a18 → tn_18: 70 A through
    // LED1 (0.1 Ω model), over its 20 mA. The issue's Done-when circuit.
    { what: 'LED straight across 9 V', parts: [BAT, led('LED1', ['b18', 'b14'])],
      wires: [...POWER, ['tp_14', 'a14'], ['a18', 'tn_18']], want: ['LED1'] },
    // (9 − 2.0) / 470 = 14.89 mA (LED under 20 mA); R1 7.0 V × 14.89 mA = 0.104 W (under ¼ W).
    { what: 'the same LED behind 470 Ω (the fix)', parts: [BAT, res('R1', ['a10', 'a14'], 470), led('LED1', ['b18', 'b14'])],
      wires: LOOP_WIRES, want: [] },
    // (9 − 2.0) / 100.1 = 69.93 mA: LED1 over 20 mA; R1 6.99 V × 69.93 mA = 0.49 W over ¼ W.
    { what: 'LED behind 100 Ω: both over', parts: [BAT, res('R1', ['a10', 'a14'], 100), led('LED1', ['b18', 'b14'])],
      wires: LOOP_WIRES, want: ['R1', 'LED1'] },
    // Parallel across 9 V: R1 100 Ω 81/100 W = 0.81 W over; R2 1 kΩ 0.081 W under.
    { what: '100 Ω and 1 kΩ in parallel across 9 V', parts: [BAT, res('R1', ['a10', 'a14'], 100), res('R2', ['a20', 'a24'], 1000)],
      wires: [...POWER, ['tp_10', 'c10'], ['c14', 'tn_14'], ['tp_20', 'c20'], ['c24', 'tn_24']], want: ['R1'] },
    // Series 9 V divider 1 kΩ / 2 kΩ: 3 mA, 0.009 W and 0.018 W, neither over.
    { what: '1 kΩ / 2 kΩ divider', parts: [BAT, res('R1', ['a10', 'a14'], 1000), res('R2', ['b14', 'b18'], 2000)],
      wires: LOOP_WIRES, want: [] },
  ];
  for (const c of cases) {
    const readings = solve(c.parts, c.wires);
    // The solver agrees with the expectation, so the case tests smoke.js, not the hand numbers.
    const over = labelsOf(c.parts).filter(l => readings.part(l) && readings.part(l).over);
    assert.deepStrictEqual(over, c.want, `${c.what}: the solver's own over flags`);
    assert.deepStrictEqual(Smoke().scorchList(readings, labelsOf(c.parts)), c.want, c.what);
  }
});

test('scorchList: no readings scorch nothing; a label with no reading is left out', () => {
  assert.deepStrictEqual(Smoke().scorchList(null, ['LED1', 'R1']), []);
  const readings = solve([BAT, led('LED1', ['b18', 'b14'])], [...POWER, ['tp_14', 'a14'], ['a18', 'tn_18']]);
  assert.deepStrictEqual(Smoke().scorchList(readings, ['NOPE', 'LED1']), ['LED1']);
});

test('MAX_PUFFS is a small positive integer', () => {
  const max = Smoke().MAX_PUFFS;
  assert.ok(Number.isInteger(max) && max >= 1 && max <= 32, `MAX_PUFFS should be a small positive integer; got ${max}`);
});

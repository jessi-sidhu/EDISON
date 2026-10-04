// The hover card's text and the colouring's tint plan (issue #91), as pure
// helpers on real solves (Board.toSim → Sim.analyze → Readings.from), no mocks.
//
// API these tests are written against (both files UMD like readings.js,
// DOM wiring only when `document` exists):
// - tools/hover-card.js
//   formatPower(W)          '9.5 mW' below 10 mW (1 dp), '104 mW' from 10 mW
//                           to under 1 W (0 dp), '1.72 W' from 1 W (2 dp).
//   cardLines(label, part)  [label, '|V| V · |I| mA · formatPower(|P|)'] (V, I
//                           1 dp), plus 'over its ¼ W rating' / '½ W' /
//                           '20 mA' when part.over; null for a null part.
//   holeLines(hole, volts)  [hole, '9.0 V'] (signed, 1 dp), or [hole, 'floating'].
// - tools/colouring.js
//   tintPlan(readings, holeNames)  [{ hole, t }], t 0 at the board's lowest
//                           live voltage to 1 at its highest; floating holes
//                           left out; t = 0.5 everywhere when all are equal.
//
// Every value below was checked against the real simulator.

const assert = require('node:assert');

const Sim      = require('../circuit3d/js/simulate.js');
const Board    = require('../circuit3d/js/board-model.js');
const Readings = require('../circuit3d/js/readings.js');

// Loaded per test, so a module that can't load in Node fails each test by name.
const HoverCard = () => require('../circuit3d/js/tools/hover-card.js');
const Colouring = () => require('../circuit3d/js/tools/colouring.js');

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
  return { board, readings: Readings.from(result, board) };
}

const allHoles = board => Readings.nets(board).flatMap(n => n.holes);

// tp → c10, R1 a10–a14, second part b14–b18, c18 → tn.
const LOOP_WIRES = [...POWER, ['tp_10', 'c10'], ['c18', 'tn_18']];
// tp → c10, R1 a10–a14, c14 → tn.
const ACROSS_WIRES = [...POWER, ['tp_10', 'c10'], ['c14', 'tn_14']];

// ── cardLines on real circuits ─────────────────────────────────

test('cardLines: the demo loop (9 V, 470 Ω, red LED) reads R1 as 7.0 V · 14.9 mA · 104 mW, no rating line', () => {
  // R1 6.9985 V, 14.890 mA, 0.10421 W, under ¼ W.
  const { readings } = solve([BAT, res('R1', ['a10', 'a14'], 470), led('LED1', ['b18', 'b14'])], LOOP_WIRES);
  assert.deepStrictEqual(HoverCard().cardLines('R1', readings.part('R1')), ['R1', '7.0 V · 14.9 mA · 104 mW']);
});

test('cardLines: over-rated parts get an "over its … rating" line (¼ W, ½ W, 20 mA), values as magnitudes', () => {
  const cases = [
    // 9 / 100 = 90 mA, 0.81 W
    { what: '100 Ω across 9 V', label: 'R1', parts: [BAT, res('R1', ['a10', 'a14'], 100)], wires: ACROSS_WIRES,
      want: ['R1', '9.0 V · 90.0 mA · 810 mW', 'over its ¼ W rating'] },
    // 9 / 47 = 191.49 mA, 1.7234 W
    { what: '47 Ω across 9 V', label: 'R1', parts: [BAT, res('R1', ['a10', 'a14'], 47)], wires: ACROSS_WIRES,
      want: ['R1', '9.0 V · 191.5 mA · 1.72 W', 'over its ¼ W rating'] },
    // LED V −2.0070, I −69.930 mA, P 0.14035 W
    { what: 'red LED behind 100 Ω', label: 'LED1', parts: [BAT, res('R1', ['a10', 'a14'], 100), led('LED1', ['b18', 'b14'])],
      wires: LOOP_WIRES, want: ['LED1', '2.0 V · 69.9 mA · 140 mW', 'over its 20 mA rating'] },
    // Zener 5.1 V behind 33 Ω: 5.1118 V, 117.82 mA, 0.6023 W
    { what: '5.1 V Zener behind 33 Ω', label: 'ZD1',
      parts: [BAT, res('R1', ['a10', 'a14'], 33), { type: 'zener', label: 'ZD1', holes: ['b14', 'b18'] }],
      wires: LOOP_WIRES, want: ['ZD1', '5.1 V · 117.8 mA · 602 mW', 'over its ½ W rating'] },
  ];
  for (const c of cases) {
    const part = solve(c.parts, c.wires).readings.part(c.label);
    assert.strictEqual(part && part.over, true, `${c.what}: the solver says ${c.label} is over`);
    assert.deepStrictEqual(HoverCard().cardLines(c.label, part), c.want, c.what);
  }
});

test('cardLines: a null part gives null', () => {
  assert.strictEqual(HoverCard().cardLines('R9', null), null);
});

// ── formatPower ───────────────────────────────────────────────

test('formatPower: 1 dp below 10 mW, whole mW to under 1 W, W with 2 dp from 1 W', () => {
  const { formatPower } = HoverCard();
  const table = [
    [0.0095,  '9.5 mW'],
    [0.01,    '10 mW'],
    [0.10421, '104 mW'],
    [0.999,   '999 mW'],
    [1,       '1.00 W'],
    [1.7234,  '1.72 W'],
  ];
  for (const [W, want] of table) assert.strictEqual(formatPower(W), want, `formatPower(${W})`);
});

// ── holeLines ─────────────────────────────────────────────────

test('holeLines: a live hole reads its signed voltage to 1 dp; a floating one reads "floating"', () => {
  const { holeLines } = HoverCard();
  const { readings } = solve([BAT, res('R1', ['a10', 'a14'], 1000), res('R2', ['b14', 'b18'], 2000)], LOOP_WIRES);
  assert.deepStrictEqual(holeLines('tp_1', readings.voltage('tp_1')), ['tp_1', '9.0 V']);
  assert.deepStrictEqual(holeLines('e14', readings.voltage('e14')), ['e14', '6.0 V']);
  assert.deepStrictEqual(holeLines('a5', -1.234), ['a5', '-1.2 V']);
  assert.strictEqual(readings.voltage('a55'), null, 'a55 is an empty column');
  assert.deepStrictEqual(holeLines('a55', readings.voltage('a55')), ['a55', 'floating']);
});

// ── tintPlan ──────────────────────────────────────────────────

test('tintPlan: the 9 V divider (9 / 6 / 0 V) maps tp to 1, tn to 0, the 6 V net to 2/3, and leaves floating holes out', () => {
  const { tintPlan } = Colouring();
  // R1 1 kΩ a10–a14, R2 2 kΩ b14–b18: column 14 at 6 V.
  const { board, readings } = solve([BAT, res('R1', ['a10', 'a14'], 1000), res('R2', ['b14', 'b18'], 2000)], LOOP_WIRES);
  const plan = tintPlan(readings, allHoles(board));
  assert.ok(Array.isArray(plan), `tintPlan should return an array; got ${JSON.stringify(plan)}`);
  const t = new Map(plan.map(e => [e.hole, e.t]));
  assert.strictEqual(t.get('tp_1'), 1, '+ rail, the highest voltage');
  assert.strictEqual(t.get('tn_1'), 0, '− rail, the lowest voltage');
  assert.ok(Math.abs(t.get('e14') - 2 / 3) < 1e-6, `e14 at 6 V: expected 0.667, got ${t.get('e14')}`);
  assert.ok(!t.has('a55'), 'a55 floats and is left out');
  assert.ok(plan.every(e => e.t >= 0 && e.t <= 1), 't stays within 0..1');
});

test('tintPlan: when every live net has the same voltage, each live hole gets t = 0.5', () => {
  const { tintPlan } = Colouring();
  // Only BAT1's − pin is wired: the − rail and column 5 are live at 0 V, the rest floats.
  const { board, readings } = solve([BAT], [['BAT1.1', 'tn_1'], ['tn_5', 'a5']]);
  const plan = tintPlan(readings, allHoles(board));
  const t = new Map(plan.map(e => [e.hole, e.t]));
  assert.strictEqual(t.get('tn_1'), 0.5, 'tn_1');
  assert.strictEqual(t.get('e5'), 0.5, 'e5, joined to the rail by a wire');
  assert.ok(!t.has('tp_1'), 'the + rail floats');
  assert.ok(plan.every(e => e.t === 0.5), `every entry is 0.5; got ${JSON.stringify([...new Set(plan.map(e => e.t))])}`);
});

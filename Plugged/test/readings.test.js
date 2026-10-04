// Readings (issue #90): what every Phase 3 tool reads from a solve.
//
// Contract these tests are written against (docs/API-CONTRACT.md →
// "Readings", circuit3d/js/readings.js, UMD like simulate.js):
// - Readings.from(result, board), board = { components, wires } as given
//   to Sim.analyze. Units V, mA, W.
// - netOf(hole) → { id, holes[], pins[] }; null for a hole not on the board.
// - voltage(hole | net) → volts, null when floating.
// - part(label) → { V, I, P, rating, over }; null for an unknown label.
//   V = V(first pin) − V(last pin), signed. I = the part's first element
//   current in mA, signed pin 0 → pin 1 (as simulate.js's partAmps, so a
//   lit LED's I is negative). P = V × I ÷ 1000 in W, so a resistor or LED
//   that absorbs power has P > 0.
//   Ratings: resistor ¼ W, LED its maxCurrent (20 mA), Zener 0.5 W;
//   over when P or |I| passes the rating.
// - kcl(net) → [{ label, pin, amps }]: each element current into the net,
//   in mA, signed; sums to 0 within 1 µA (0.001 mA).
// - Readings.nets(board) needs no solve.
// - Never throws.
//
// Assumptions where the contract leaves the shape open:
// - A hole is its board address string ("b14", "tp_50"), as in the hole
//   map and the board model; holes[] holds the same strings.
// - A net passed to voltage()/kcl() is the object netOf() returned.
// - Readings.nets(board) returns the nets, each { id, holes, pins }, as an
//   array (an object keyed by id is accepted too).
// - A resistor's rating is 0.25 (W), either the number itself or a
//   { W | watts } field. LED / Zener rating shapes are not asserted, only
//   `over`.
//
// Every expected value is hand-computed and was checked against the real
// simulator (Board.toSim → Sim.analyze); no mocks.

const assert = require('node:assert');

const Sim   = require('../circuit3d/js/simulate.js');
const Board = require('../circuit3d/js/board-model.js');

const Readings = require('../circuit3d/js/readings.js');

// ── Helpers ───────────────────────────────────────────────────

const wiresOf = pairs => pairs.map(([from, to], i) => ({ id: 'W' + (i + 1), from, to }));
const BAT  = { type: 'battery', label: 'BAT1' };                    // 9 V
const POWER = [['BAT1.0', 'tp_1'], ['BAT1.1', 'tn_1']];             // + rail, − rail
const res  = (label, holes, ohms) => ({ type: 'resistor', label, holes, values: { resistance: ohms } });
// LED holes are [cathode, anode].
const led  = (label, holes, color) => ({ type: 'led', label, holes, values: { color: color || 'red' } });

// Board → { result, board, readings }.
function solve(parts, pairs) {
  const board = Board.toSim({ parts, wires: wiresOf(pairs) });
  const result = Sim.analyze(board.components, board.wires);
  return { result, board, readings: Readings.from(result, board) };
}

function near(got, want, tol, what) {
  assert.ok(typeof got === 'number' && Math.abs(got - want) <= tol,
    `${what}: expected ${want} ± ${tol}, got ${got}`);
}

const sum = list => list.reduce((s, e) => s + e.amps, 0);
const ampsOf = (list, label) => {
  const e = list.find(x => x.label === label);
  assert.ok(e, `kcl has no entry for ${label}; got ${JSON.stringify(list)}`);
  return e.amps;
};

const ratingWatts = r => (typeof r === 'number' ? r : r && (r.W !== undefined ? r.W : r.watts));

const netList = nets => (Array.isArray(nets) ? nets : Object.values(nets || {}));
const netWith = (nets, hole) => netList(nets).find(n => n && Array.isArray(n.holes) && n.holes.includes(hole));

// ── 1. 9 V divider, 1 kΩ over 2 kΩ ─────────────────────────────
// I = 9 / 3000 = 3 mA. Top node 9 V, middle 9 − 3 = 6 V, bottom 0 V.
// P(1k) = 3 V × 3 mA = 0.009 W; P(2k) = 6 V × 3 mA = 0.018 W.
// R1 a10–a14, R2 b14–b18; tp → c10, c18 → tn.

const DIVIDER_PARTS = [BAT, res('R1', ['a10', 'a14'], 1000), res('R2', ['b14', 'b18'], 2000)];
const DIVIDER_WIRES = [...POWER, ['tp_10', 'c10'], ['c18', 'tn_18']];

test('9 V divider (1k/2k): node voltages 9 V, 6 V and 0 V', () => {
  const { readings } = solve(DIVIDER_PARTS, DIVIDER_WIRES);
  near(readings.voltage('e10'), 9, 1e-6, 'V(e10), top');
  near(readings.voltage('e14'), 6, 1e-6, 'V(e14), middle');
  near(readings.voltage('e18'), 0, 1e-6, 'V(e18), ground');
  near(readings.voltage(readings.netOf('d14')), 6, 1e-6, 'voltage(net of d14)');
});

test('9 V divider (1k/2k): 3 mA, 0.009 W and 0.018 W, neither over ¼ W', () => {
  const { readings } = solve(DIVIDER_PARTS, DIVIDER_WIRES);
  const r1 = readings.part('R1'), r2 = readings.part('R2');
  assert.ok(r1 && r2, `part() should read R1 and R2; got ${JSON.stringify({ r1, r2 })}`);
  near(r1.V, 3, 1e-6, 'R1.V');
  near(r2.V, 6, 1e-6, 'R2.V');
  near(r1.I, 3, 1e-6, 'R1.I (mA)');
  near(r2.I, 3, 1e-6, 'R2.I (mA)');
  near(r1.P, 0.009, 1e-6, 'R1.P (W)');
  near(r2.P, 0.018, 1e-6, 'R2.P (W)');
  assert.strictEqual(ratingWatts(r1.rating), 0.25, `R1.rating: ${JSON.stringify(r1.rating)}`);
  assert.strictEqual(r1.over, false);
  assert.strictEqual(r2.over, false);
});

// ── 2. KCL: two LEDs in parallel, each with its own resistor ─────
// tp → c10 → R1 470 Ω (a10–a14) → LED1 red (anode b14, cathode b18) → tn
// tp → c30 → R2 1 kΩ (a30–a34) → LED2 green (anode b34, cathode b38) → tn
// I1 = (9 − 2.0) / 470.1 = 14.890 mA, I2 = (9 − 2.2) / 1000.1 = 6.799 mA,
// battery 21.690 mA (RON = 0.1 Ω in each LED).

const PARALLEL_PARTS = [BAT, res('R1', ['a10', 'a14'], 470), led('LED1', ['b18', 'b14'], 'red'),
                        res('R2', ['a30', 'a34'], 1000), led('LED2', ['b38', 'b34'], 'green')];
const PARALLEL_WIRES = [...POWER, ['tp_10', 'c10'], ['tp_30', 'c30'], ['c18', 'tn_18'], ['c38', 'tn_38']];

test('two parallel LEDs: kcl sums to 0 within 1 µA at every net with a part pin', () => {
  const { readings } = solve(PARALLEL_PARTS, PARALLEL_WIRES);
  const holes = ['tp_1', 'tn_1', ...PARALLEL_PARTS.flatMap(p => p.holes || [])];
  const seen = new Set();
  for (const hole of holes) {
    const net = readings.netOf(hole);
    assert.ok(net, `netOf(${hole}) should be a net`);
    if (seen.has(net.id)) continue;
    seen.add(net.id);
    const list = readings.kcl(net);
    assert.ok(Array.isArray(list) && list.length >= 2, `kcl(net of ${hole}) should list its parts; got ${JSON.stringify(list)}`);
    assert.ok(Math.abs(sum(list)) <= 0.001, `kcl(net of ${hole}) sums to ${sum(list)} mA, not 0`);
  }
  // + rail, − rail, columns 14, 34 (top halves of 10/18/30/38 join the rails by wire).
  assert.strictEqual(seen.size, 4, `expected 4 distinct nets, got ${seen.size}`);
});

test('two parallel LEDs: kcl gives each current into the net, signed, in mA', () => {
  const { readings } = solve(PARALLEL_PARTS, PARALLEL_WIRES);
  const plus = readings.kcl(readings.netOf('tp_1'));
  near(ampsOf(plus, 'BAT1'), 21.690, 0.01, '+ rail: BAT1 into the net');
  near(ampsOf(plus, 'R1'), -14.890, 0.01, '+ rail: R1 (out of the net)');
  near(ampsOf(plus, 'R2'), -6.799, 0.01, '+ rail: R2 (out of the net)');
  const minus = readings.kcl(readings.netOf('tn_1'));
  near(ampsOf(minus, 'BAT1'), -21.690, 0.01, '− rail: BAT1 (out of the net)');
  near(ampsOf(minus, 'LED1'), 14.890, 0.01, '− rail: LED1 cathode into the net');
  near(ampsOf(minus, 'LED2'), 6.799, 0.01, '− rail: LED2 cathode into the net');
  const mid = readings.kcl(readings.netOf('e14'));
  near(ampsOf(mid, 'R1'), 14.890, 0.01, 'column 14: R1 into the net');
  near(ampsOf(mid, 'LED1'), -14.890, 0.01, 'column 14: LED1 anode out of the net');
});

// ── 3. KVL around battery → 470 Ω → red LED → battery ───────────
// Loop: tn → BAT1 (pin 1 → pin 0) → tp → R1 (lead1 → lead2) → LED1
// (anode = pin 1 → cathode = pin 0) → tn. A part crossed pin 0 → pin 1
// drops +V, crossed pin 1 → pin 0 drops −V:
//   −V(BAT1) + V(R1) − V(LED1) = −9 + 6.999 − (−2.001) = 0.

const LOOP_PARTS = [BAT, res('R1', ['a10', 'a14'], 470), led('LED1', ['b18', 'b14'], 'red')];
const LOOP_WIRES = [...POWER, ['tp_10', 'c10'], ['c18', 'tn_18']];

test('KVL: the signed part voltages around a loop sum to 0', () => {
  const { readings } = solve(LOOP_PARTS, LOOP_WIRES);
  const bat = readings.part('BAT1'), r1 = readings.part('R1'), d1 = readings.part('LED1');
  assert.ok(bat && r1 && d1, 'part() should read BAT1, R1 and LED1');
  near(bat.V, 9, 1e-6, 'BAT1.V');
  near(r1.V, 6.9985, 0.001, 'R1.V');
  near(d1.V, -2.0015, 0.001, 'LED1.V = V(cathode) − V(anode)');
  near(-bat.V + r1.V - d1.V, 0, 1e-6, 'KVL sum');
});

test('a lit LED reads I < 0 (cathode → anode is pin 0 → pin 1) and P > 0', () => {
  const { readings } = solve(LOOP_PARTS, LOOP_WIRES);
  const d1 = readings.part('LED1');
  near(d1.I, -14.890, 0.01, 'LED1.I (mA)');
  near(d1.P, 2.0015 * 14.890 / 1000, 1e-4, 'LED1.P (W)');
  assert.strictEqual(d1.over, false, '14.9 mA is under the 20 mA rating');
});

// ── 4. Nets across rails and wires ─────────────────────────────
// Divider board plus a lone wire c40 → h50 with nothing else on it.

const NET_WIRES = [...DIVIDER_WIRES, ['c40', 'h50']];

test('nets: a wire joins holes, a rail joins every column, e and f halves stay apart', () => {
  const { readings } = solve(DIVIDER_PARTS, NET_WIRES);
  const id = h => { const n = readings.netOf(h); assert.ok(n, `netOf(${h}) should be a net`); return n.id; };
  assert.strictEqual(id('a40'), id('j50'), 'a40 and j50 are joined only by the wire c40–h50');
  assert.strictEqual(id('tn_2'), id('tn_63'), 'one rail, far-apart columns');
  assert.strictEqual(id('tp_63'), id('e10'), 'the + rail reaches column 10 through the wire');
  assert.notStrictEqual(id('e14'), id('f14'), 'rows e and f of a column are different nets');
  assert.notStrictEqual(id('tp_5'), id('bp_5'), 'top and bottom + rails are different nets');

  const mid = readings.netOf('e14');
  assert.ok(mid.holes.includes('a14') && mid.holes.includes('e14'), `holes: ${JSON.stringify(mid.holes)}`);
  assert.ok(!mid.holes.includes('f14'), 'f14 is across the centre gap');
  assert.strictEqual(mid.pins.length, 2, `column 14 holds R1's lead2 and R2's lead1; got ${JSON.stringify(mid.pins)}`);
});

test('Readings.nets(board) joins holes with no solve', () => {
  const board = Board.toSim({ parts: DIVIDER_PARTS, wires: wiresOf(NET_WIRES) });
  const nets = Readings.nets(board);
  const wired = netWith(nets, 'a40');
  assert.ok(wired, `nets() should have a net holding a40; got ${JSON.stringify(nets).slice(0, 300)}`);
  assert.ok(wired.holes.includes('j50'), 'a40 and j50 are one net');
  const rail = netWith(nets, 'tn_2');
  assert.ok(rail && rail.holes.includes('tn_63') && rail.holes.includes('e18'), 'the − rail reaches column 18');
  assert.ok(!netWith(nets, 'e14').holes.includes('f14'), 'e14 and f14 are different nets');
});

// ── 5. Floating pins read null ─────────────────────────────────
// simulate.js groundCircuits: a node is live only when wires and
// conducting elements join it to a source's ref pin; an off diode joins
// nothing. So:
// - R3 (a40–a44) touches nothing: no source, both ends float.
// - LED3 cathode d10 (9 V), anode d7 in an empty column: reverse biased,
//   off, so column 7 is cut off from the battery and floats (bug #73).
// - a55: an empty column.

const FLOAT_PARTS = [...DIVIDER_PARTS, res('R3', ['a40', 'a44'], 470), led('LED3', ['d10', 'd7'])];

test('floating holes and nets read null', () => {
  const { readings } = solve(FLOAT_PARTS, DIVIDER_WIRES);
  assert.strictEqual(readings.voltage('a40'), null, 'R3 lead1, no source');
  assert.strictEqual(readings.voltage('e44'), null, 'R3 lead2, no source');
  assert.strictEqual(readings.voltage(readings.netOf('a40')), null, 'R3 lead1 net');
  assert.strictEqual(readings.voltage('a7'), null, 'behind an off LED');
  assert.strictEqual(readings.voltage('a55'), null, 'empty column');
  near(readings.voltage('a10'), 9, 1e-6, 'the live side of LED3 still reads');
});

// ── 6. 100 Ω across 9 V ────────────────────────────────────────
// I = 9 / 100 = 90 mA, P = 9 × 0.09 = 0.81 W > ¼ W.

test('100 Ω across 9 V: 90 mA, 0.81 W, over its ¼ W rating', () => {
  const { readings } = solve([BAT, res('R1', ['a10', 'a14'], 100)],
                             [...POWER, ['tp_10', 'c10'], ['c14', 'tn_14']]);
  const r1 = readings.part('R1');
  assert.ok(r1, 'part(R1)');
  near(r1.V, 9, 1e-6, 'R1.V');
  near(r1.I, 90, 1e-6, 'R1.I (mA)');
  near(r1.P, 0.81, 1e-6, 'R1.P (W)');
  assert.strictEqual(ratingWatts(r1.rating), 0.25, `R1.rating: ${JSON.stringify(r1.rating)}`);
  assert.strictEqual(r1.over, true);
});

// ── Ratings from the part's own values ─────────────────────────
// LED maxCurrent 0.020 A = 20 mA: red LED behind 100 Ω, (9 − 2) / 100.1 =
// 69.93 mA, over (its I is −69.93, so the check must use the magnitude).
// Zener 5.1 V, 0.5 W: behind 33 Ω, (9 − 5.1) / 33.1 = 117.8 mA at
// 5.112 V → 0.602 W, over; behind 1 kΩ, 3.9 mA → 0.020 W, not over.

test('an LED over its 20 mA maxCurrent is over', () => {
  const { readings } = solve([BAT, res('R1', ['a10', 'a14'], 100), led('LED1', ['b18', 'b14'])], LOOP_WIRES);
  const d1 = readings.part('LED1');
  near(d1.I, -69.93, 0.01, 'LED1.I (mA)');
  assert.strictEqual(d1.over, true);
});

test('a Zener over 0.5 W is over; one well under is not', () => {
  const zener = ohms => solve([BAT, res('R1', ['a10', 'a14'], ohms), { type: 'zener', label: 'ZD1', holes: ['b14', 'b18'] }],
                               LOOP_WIRES).readings.part('ZD1');
  const hot = zener(33), cool = zener(1000);
  near(hot.V, 5.1118, 0.001, 'ZD1.V = V(cathode) − V(anode)');
  near(hot.I, 117.82, 0.01, 'ZD1.I (mA), cathode → anode');
  near(hot.P, 0.6023, 0.001, 'ZD1.P (W)');
  assert.strictEqual(hot.over, true);
  near(cool.P, 0.0199, 0.001, 'ZD1.P (W) behind 1 kΩ');
  assert.strictEqual(cool.over, false);
});

// ── 7. Never throws ────────────────────────────────────────────

test('unknown label and holes off the board give null', () => {
  const { readings } = solve(DIVIDER_PARTS, DIVIDER_WIRES);
  assert.strictEqual(readings.part('NOPE'), null);
  for (const hole of ['a64', 'a0', 'k5', 'tp_64', 'nowhere']) {
    assert.strictEqual(readings.netOf(hole), null, `netOf(${hole})`);
  }
});

test('a result with no readings (empty board, wire across the battery) never throws', () => {
  const cases = [
    { name: 'empty board', parts: [], wires: [] },
    { name: 'wire across the battery', parts: [BAT, res('R1', ['a10', 'a14'], 470)],
      wires: [...POWER, ['tp_5', 'tn_5'], ['tp_10', 'c10'], ['c14', 'tn_14']] },
  ];
  for (const c of cases) {
    const { result, readings } = solve(c.parts, c.wires);
    assert.deepStrictEqual(result.parts, {}, `${c.name}: analyze gives no part readings`);
    assert.strictEqual(readings.part('R1'), null, `${c.name}: part(R1)`);
    assert.strictEqual(readings.voltage('b10'), null, `${c.name}: voltage(b10)`);
    assert.deepStrictEqual(readings.kcl(readings.netOf('b10')), [], `${c.name}: kcl(net of b10)`);
  }
});

test('voltage() and kcl() given something that is not a net give null and [] on a solved board', () => {
  const { readings } = solve(DIVIDER_PARTS, DIVIDER_WIRES);
  // { col: 13, row: 'e' } is e14 in the simulator's own shape, which is not a hole address or a net.
  for (const [name, bad] of [['{}', {}], ["{ col: 13, row: 'e' }", { col: 13, row: 'e' }]]) {
    let v, list;
    assert.doesNotThrow(() => { v = readings.voltage(bad); }, `voltage(${name}) threw`);
    assert.strictEqual(v, null, `voltage(${name})`);
    assert.doesNotThrow(() => { list = readings.kcl(bad); }, `kcl(${name}) threw`);
    assert.deepStrictEqual(list, [], `kcl(${name})`);
  }
});

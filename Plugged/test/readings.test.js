// Readings (issue #90): what every tool (js/tools/) reads from a solve.
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

// ── 8. problems(): the mistake checker (issue #95) ─────────────
// problems() → [{ kind, labels[], why }], never throws, `why` plain English.
// Kinds: 'short', 'no-resistor', 'backwards', 'open', 'over'.
// - short:       result.shorted (a wire straight across the source, which
//                solves nothing, or a source shorted through a part), except
//                when the short is through an LED with a 'no-resistor' row.
// - no-resistor: the LED's own warning (parts/led.js) for an LED straight
//                across the battery, over 1 A; an LED that is only over its
//                20 mA (behind 100 Ω) is 'over', not 'no-resistor'.
// - backwards:   the LED's own "backwards" warning, so an LED dark only
//                because an off diode cuts off its anode is not (#73).
// - open:        a source, not shorted, every source under 0.001 mA, and no
//                open switch/button or backwards part to explain it. Its
//                labels include the battery.
// - over:        one row per part whose part(label).over is true.
// Where a kind overlaps server.js findCircuitProblems, `why` carries the
// server's key phrase: "short circuit", "backwards", "not connected".
// Every circuit was checked against the real simulator first.

// #95's five, the op-amp kinds (docs/API-CONTRACT.md → Readings problems()),
// and 'floating-input' (#8, section 11).
const KINDS = ['short', 'no-resistor', 'backwards', 'open', 'over', 'no-supply', 'output-shorted', 'clipped', 'floating-input'];

// problems() for a board, each row checked for its shape.
function problemsOf(readings) {
  assert.strictEqual(typeof readings.problems, 'function', 'Readings.from(...).problems should be a function');
  let list;
  assert.doesNotThrow(() => { list = readings.problems(); }, 'problems() threw');
  assert.ok(Array.isArray(list), `problems() should be an array; got ${JSON.stringify(list)}`);
  for (const p of list) {
    assert.ok(KINDS.includes(p.kind), `kind "${p.kind}" is not one of ${KINDS.join(', ')}`);
    assert.ok(Array.isArray(p.labels) && p.labels.length && p.labels.every(l => typeof l === 'string'),
      `${p.kind}: labels should be part labels; got ${JSON.stringify(p.labels)}`);
    assert.ok(typeof p.why === 'string' && p.why.trim() && !/undefined|NaN|null|\[object/.test(p.why),
      `${p.kind}: why should be plain English; got ${JSON.stringify(p.why)}`);
  }
  return list;
}
const problemsOn = (parts, pairs) => problemsOf(solve(parts, pairs).readings);
const kindsOf = list => list.map(p => p.kind).sort();
const rowsOf  = (list, kind) => list.filter(p => p.kind === kind);
const showP   = list => JSON.stringify(list);

test('problems: a wire straight across the battery is a short naming BAT1, why says "short circuit"', () => {
  // The no-readings case: analyze returns parts {}, shorted true.
  const list = problemsOn([BAT, res('R1', ['a10', 'a14'], 470)],
                          [...POWER, ['tp_5', 'tn_5'], ['tp_10', 'c10'], ['c14', 'tn_14']]);
  assert.deepStrictEqual(kindsOf(list), ['short'], showP(list));
  assert.ok(list[0].labels.includes('BAT1'), `the short names the battery: ${showP(list)}`);
  assert.match(list[0].why, /short circuit/i);
});

test('problems: an LED straight across 9 V is no-resistor and over, with no separate short row', () => {
  // tp_14 → a14, LED1 anode b14 / cathode b18, a18 → tn_18. LED1 carries
  // (9 − 2) / 0.1 Ω = 70 A, so analyze says shorted and led.js warns
  // "…with no current-limiting resistor". The short is through LED1, whose
  // no-resistor row already says so: one mistake, so no 'short' row too.
  const list = problemsOn([BAT, led('LED1', ['b18', 'b14'])], [...POWER, ['tp_14', 'a14'], ['a18', 'tn_18']]);
  assert.deepStrictEqual(kindsOf(list), ['no-resistor', 'over'], showP(list));
  const nr = rowsOf(list, 'no-resistor')[0], over = rowsOf(list, 'over')[0];
  assert.deepStrictEqual(nr.labels, ['LED1'], showP(list));
  assert.match(nr.why, /resistor/i);
  assert.deepStrictEqual(over.labels, ['LED1'], showP(list));
});

test('problems: an LED behind 100 Ω is over (LED1 and R1, one row each) but not no-resistor', () => {
  // (9 − 2) / 100.1 = 69.93 mA: LED1 over 20 mA; R1 6.99 V × 69.93 mA = 0.49 W over ¼ W.
  const list = problemsOn([BAT, res('R1', ['a10', 'a14'], 100), led('LED1', ['b18', 'b14'])], LOOP_WIRES);
  assert.deepStrictEqual(kindsOf(list), ['over', 'over'], showP(list));
  assert.deepStrictEqual(rowsOf(list, 'over').map(p => p.labels).sort(), [['LED1'], ['R1']], showP(list));
});

test('problems: a reversed LED behind 470 Ω is backwards (LED1), not open', () => {
  // R1 a10–a14, LED1 cathode b14 (≈ 9 V) / anode b18 (0 V): off, no current.
  const list = problemsOn([BAT, res('R1', ['a10', 'a14'], 470), led('LED1', ['b14', 'b18'])], LOOP_WIRES);
  assert.deepStrictEqual(kindsOf(list), ['backwards'], showP(list));
  assert.ok(list[0].labels.includes('LED1'), showP(list));
  assert.match(list[0].why, /backwards/i);
});

test('problems: an LED dark only because an off diode cuts off its anode is not backwards (#73)', () => {
  // tp_2 → a2; D1 cathode b2 (+9 V), anode b6 (blocks); LED1 anode d6, cathode d10; a10 → tp_10.
  const list = problemsOn([BAT, { type: 'diode', label: 'D1', holes: ['b2', 'b6'] }, led('LED1', ['d10', 'd6'])],
                          [...POWER, ['tp_2', 'a2'], ['a10', 'tp_10']]);
  assert.deepStrictEqual(rowsOf(list, 'backwards'), [], showP(list));
});

test('problems: battery, 470 Ω and LED with the ground wire missing is open, naming BAT1, why says "not connected"', () => {
  // The KVL loop without c18 → tn_18: the battery carries under 0.001 mA.
  const list = problemsOn([BAT, res('R1', ['a10', 'a14'], 470), led('LED1', ['b18', 'b14'])], [...POWER, ['tp_10', 'c10']]);
  assert.deepStrictEqual(kindsOf(list), ['open'], showP(list));
  assert.ok(list[0].labels.includes('BAT1'), `the open circuit names the battery: ${showP(list)}`);
  assert.match(list[0].why, /not connected/i);
});

// 'open' needs a broken path, not just zero current: it is reported only
// when no path joins a source's + to its − through the board's elements
// with every switch treated as closed. A complete loop that carries ~0 mA
// for another reason is not open.

test('problems: a fully wired loop on 1 V (below the red LED\'s 2 V) carries ~0 mA but is not open', () => {
  // BAT1 1 V, R1 a10–a14 470 Ω, LED1 anode b14 / cathode b18: LED off, battery ~2e-9 mA.
  const list = problemsOn([{ type: 'battery', label: 'BAT1', values: { voltage: 1 } },
                           res('R1', ['a10', 'a14'], 470), led('LED1', ['b18', 'b14'])], LOOP_WIRES);
  assert.deepStrictEqual(rowsOf(list, 'open'), [], showP(list));
});

test('problems: a plain diode reversed in a complete loop is not open', () => {
  // R1 a10–a14 470 Ω, D1 cathode b14 (≈ 9 V) / anode b18 (0 V): off, battery ~2e-8 mA.
  const list = problemsOn([BAT, res('R1', ['a10', 'a14'], 470), { type: 'diode', label: 'D1', holes: ['b14', 'b18'] }],
                          LOOP_WIRES);
  assert.deepStrictEqual(rowsOf(list, 'open'), [], showP(list));
});

test('problems: the missing-ground board is still open with an unwired slide switch elsewhere on it', () => {
  // As above, plus SS1 (a a30, common a31, b a32) wired to nothing: a loose
  // switch does not explain a broken loop it is not in.
  const list = problemsOn([BAT, res('R1', ['a10', 'a14'], 470), led('LED1', ['b18', 'b14']),
                           { type: 'slide_switch', label: 'SS1', holes: ['a30', 'a31', 'a32'] }],
                          [...POWER, ['tp_10', 'c10']]);
  assert.deepStrictEqual(kindsOf(list), ['open'], showP(list));
});

// The "Try it out" demo (demo.sparky): BAT1 → tp_4, BAT1.1 → tn_16,
// tp_3 → a3, R1 470 Ω b3–b7, LED1 cathode c9 / anode c7, a9 → a12,
// SW1 b12–b15, a15 → tn_15. Pressed: 14.9 mA. Released: no current, but an
// open button is normal use, not a mistake.
const DEMO_PARTS = pressed => [BAT, res('R1', ['b3', 'b7'], 470), led('LED1', ['c9', 'c7']),
  { type: 'button', label: 'SW1', holes: ['b12', 'b15'], controls: { pressed } }];
const DEMO_WIRES = [['BAT1.0', 'tp_4'], ['BAT1.1', 'tn_16'], ['tp_3', 'a3'], ['a9', 'a12'], ['a15', 'tn_15']];

test('problems: the "Try it out" demo has none, button pressed or released', () => {
  for (const pressed of [true, false]) {
    const { readings } = solve(DEMO_PARTS(pressed), DEMO_WIRES);
    assert.deepStrictEqual(problemsOf(readings), [], `demo with SW1 ${pressed ? 'pressed' : 'released'}`);
  }
});

test('problems: an empty board, a blank result or no arguments give [] without throwing', () => {
  assert.deepStrictEqual(problemsOf(solve([], []).readings), [], 'empty board');
  assert.deepStrictEqual(problemsOf(Readings.from({}, { components: [], wires: [] })), [], 'blank result');
  assert.deepStrictEqual(problemsOf(Readings.from()), [], 'Readings.from() with nothing');
});

// ── 9. thevenin(a, b): the equivalent circuit between two holes (issue #93) ──
// readings.thevenin(a, b), holes as strings → { Vth, Rth, In }: Vth in V
// = V(a) − V(b), signed; Rth in Ω; In in mA = Vth / Rth × 1000 (Norton),
// so In's sign follows Vth. Or { why }, a non-empty string, when there is
// no source on the board, a and b are one net, a or b floats, Rth is not
// finite or ≤ 0, or a solve fails. Never throws.
// Method (the builder's, not asserted): Vth from this solve; Rth from a
// copy of the board with a 1 mA ideal current source b → a appended last,
// Rth = ((V'(a) − V'(b)) − Vth) / 1 mA. Every number below was checked
// against the real simulator with that 1 mA source placed on the board as
// a current_source part.

function theveninOf(readings, a, b) {
  assert.strictEqual(typeof readings.thevenin, 'function', 'Readings.from(...).thevenin should be a function');
  let out;
  assert.doesNotThrow(() => { out = readings.thevenin(a, b); }, `thevenin(${a}, ${b}) threw`);
  assert.ok(out && typeof out === 'object', `thevenin(${a}, ${b}) should return an object; got ${JSON.stringify(out)}`);
  return out;
}

function assertWhy(out, what) {
  assert.ok(typeof out.why === 'string' && out.why.trim(), `${what}: expected { why }, got ${JSON.stringify(out)}`);
  assert.ok(typeof out.Vth !== 'number', `${what}: a { why } has no Vth; got ${JSON.stringify(out)}`);
}

test('thevenin across R2 of the 9 V divider (1k/2k): Vth 6.00 V, Rth 666.7 Ω, In 9.00 mA', () => {
  // Vth = 9 × 2k / 3k = 6 V; Rth = 1k ∥ 2k = 666.67 Ω; In = 9 V / 1k = 9 mA.
  const { readings } = solve(DIVIDER_PARTS, DIVIDER_WIRES);
  const th = theveninOf(readings, 'e14', 'e18');
  near(th.Vth, 6, 0.005, 'Vth (V)');
  near(th.Rth, 666.667, 0.1, 'Rth (Ω)');
  near(th.In, 9, 0.01, 'In (mA)');
});

test('thevenin with a and b swapped: Vth and In change sign, Rth does not', () => {
  const { readings } = solve(DIVIDER_PARTS, DIVIDER_WIRES);
  const th = theveninOf(readings, 'e18', 'e14');
  near(th.Vth, -6, 0.005, 'Vth (V) = V(e18) − V(e14)');
  near(th.Rth, 666.667, 0.1, 'Rth (Ω)');
  near(th.In, -9, 0.01, 'In (mA)');
});

test('thevenin on other pairs: across R1 (b not ground) and behind a 2 kΩ series resistor', () => {
  // Across R1 of the divider: Vth = 9 − 6 = 3 V, Rth = 1k ∥ 2k (the ideal
  // battery is a short) = 666.67 Ω, In = 3 / 666.67 = 4.5 mA.
  const across = theveninOf(solve(DIVIDER_PARTS, DIVIDER_WIRES).readings, 'e10', 'e14');
  near(across.Vth, 3, 0.005, 'across R1: Vth (V)');
  near(across.Rth, 666.667, 0.1, 'across R1: Rth (Ω)');
  near(across.In, 4.5, 0.01, 'across R1: In (mA)');

  // tp → b20, R1 1 kΩ a20–a24 to node X (column 24), R2 1 kΩ b24–b28,
  // d28 → tn; R3 2 kΩ c24–c30 from X to column 30, which nothing else
  // touches. Between e30 and the − rail: Vth = V(X) = 9 × 1k / 2k = 4.5 V
  // (no current in R3), Rth = 1k ∥ 1k + 2k = 2500 Ω, In = 4.5 / 2500 = 1.8 mA.
  const parts = [BAT, res('R1', ['a20', 'a24'], 1000), res('R2', ['b24', 'b28'], 1000), res('R3', ['c24', 'c30'], 2000)];
  const pairs = [...POWER, ['tp_20', 'b20'], ['d28', 'tn_28']];
  const behind = theveninOf(solve(parts, pairs).readings, 'e30', 'tn_5');
  near(behind.Vth, 4.5, 0.005, 'behind R3: Vth (V)');
  near(behind.Rth, 2500, 0.1, 'behind R3: Rth (Ω)');
  near(behind.In, 1.8, 0.01, 'behind R3: In (mA)');
});

test('thevenin on a board with no source gives { why }', () => {
  const { readings } = solve([res('R1', ['a10', 'a14'], 1000), res('R2', ['b14', 'b18'], 2000)],
                             [['tp_10', 'c10'], ['c18', 'tn_18']]);
  assertWhy(theveninOf(readings, 'e14', 'e18'), 'no source');
});

test('thevenin between two holes of one net gives { why }', () => {
  const { readings } = solve(DIVIDER_PARTS, DIVIDER_WIRES);
  assertWhy(theveninOf(readings, 'a14', 'e14'), 'a14 and e14, one column');
  assertWhy(theveninOf(readings, 'e18', 'tn_40'), 'e18 and the − rail, joined by wire');
});

test('thevenin with a floating hole, or something that is not a hole, gives { why }', () => {
  const { readings } = solve(DIVIDER_PARTS, DIVIDER_WIRES);
  assertWhy(theveninOf(readings, 'a55', 'e18'), 'a = a55, an empty column');
  assertWhy(theveninOf(readings, 'e14', 'a55'), 'b = a55, an empty column');
  assertWhy(theveninOf(readings, 'nowhere', 'e18'), 'a = "nowhere"');
  assertWhy(theveninOf(readings, undefined, undefined), 'no holes');
});

test('thevenin leaves the board and this solve\'s readings as they were', () => {
  const { board, readings } = solve(DIVIDER_PARTS, DIVIDER_WIRES);
  const before = JSON.stringify(board);
  theveninOf(readings, 'e14', 'e18');
  assert.strictEqual(JSON.stringify(board), before, 'the board given to Readings.from is unchanged');
  near(readings.voltage('e14'), 6, 1e-6, 'V(e14) after thevenin');
  const r1 = readings.part('R1');
  near(r1.V, 3, 1e-6, 'R1.V after thevenin');
  near(r1.I, 3, 1e-6, 'R1.I (mA) after thevenin');
  assert.strictEqual(readings.part('IS1'), null, 'no current source is left in this solve');
});

// ── 10. part(label).opamps: why a half is open (issue #1) ──────
// Each opamps entry gains `floating`: true when the simulator opened the
// half because an input touches nothing (its PartResult's r.floatingInputs
// names the half's E id); false otherwise (a half that drives, or a chip with
// no supply). The hover card words an open half from it.
// PS1 at 12 V (+ on tp, COM on tn), the TL072 at f30 facing right: OUT1 f30,
// IN1− f31, IN1+ f32, V− f33, IN2+ e33, IN2− e32, OUT2 e31, V+ e30.

const PS1    = { type: 'bench_supply', label: 'PS1', values: { voltage: 12 } };
const TL072  = { type: 'tl072', label: 'U1', holes: ['f30', 'f31', 'f32', 'f33', 'e33', 'e32', 'e31', 'e30'] };
const SUPPLY = [['PS1.0', 'tp_63'], ['PS1.1', 'tn_63']];
const VPOS = ['tp_30', 'a30'], VNEG = ['j33', 'tn_33'];   // V+ (pin 8) +12 V, V− (pin 4) 0 V
const OUT2_HIGH = ['a31', 'tp_31'];
// OUT2 on +12 V with every input floating, and the supply wired as `rails` says.
const UNPOWERED = [['no rails', []], ['V+ only', [VPOS]], ['V− only', [VNEG]]];

function opampsOf(pairs) {
  const { result, readings } = solve([PS1, TL072], pairs);
  const part = readings.part('U1');
  assert.ok(part && Array.isArray(part.opamps), `readings.part(U1).opamps is missing (status ${result.status}); got ${JSON.stringify(part)}`);
  return part.opamps;
}
const without = (o, key) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key));

test('opamps (#1): repro A (rails wired, OUT2 on +12 V, IN2± floating) — op-amp 2 is open with floating: true; the unused op-amp 1 has floating: false', () => {
  const [op1, op2] = opampsOf([...SUPPLY, VPOS, VNEG, OUT2_HIGH]);
  assert.strictEqual(op2.mode, 'open', `op-amp 2: ${JSON.stringify(op2)}`);
  assert.strictEqual(op2.floating, true, `op-amp 2 was opened because its inputs float: ${JSON.stringify(op2)}`);
  assert.strictEqual(op1.mode, 'low', `op-amp 1, an unused half: ${JSON.stringify(op1)}`);
  assert.strictEqual(op1.floating, false, `op-amp 1 drives (low), so it isn't floating: ${JSON.stringify(op1)}`);
});

test('opamps (#1): an unpowered chip (no rails, V+ only, V− only) has floating: false on both halves', () => {
  for (const [what, rails] of UNPOWERED) {
    const ops = opampsOf([...SUPPLY, ...rails, OUT2_HIGH]);
    assert.deepStrictEqual(ops.map(o => o.floating), [false, false], `${what}: ${JSON.stringify(ops)}`);
  }
});

test('pin (#1): an unpowered chip\'s opamps entries keep today\'s other fields (both open, 0 mA, 20 mA limit, unused)', () => {
  for (const [what, rails] of UNPOWERED) {
    const ops = opampsOf([...SUPPLY, ...rails, OUT2_HIGH]);
    assert.deepStrictEqual(ops.map(o => without(o, 'floating')), [
      { pin: 'out1', vout: null, mode: 'open', iout: 0, ilim: 20, unused: true },
      { pin: 'out2', vout: 12,   mode: 'open', iout: 0, ilim: 20, unused: true },
    ], what);
  }
});

// ── 11. problems(): an op-amp input that connects to nothing (issue #8) ──
// Since #1 the simulator opens an op-amp half whose input touches nothing
// (r.floatingInputs, opamps[].floating) and the TL072 warns, e.g. "U1: IN2+
// and IN2− connect to nothing, so OUT2 drives nothing. …". The results panel
// shows that warning; problems() gains a row for it so the mistakes panel
// and Edison's callouts (lines()) agree:
// - kind 'floating-input', one row per chip with any floating half, never
//   info; labels [chip]; why the chip's own floating-input warning (it already
//   starts "U1: "), each of them when both halves float.
// - lines(): a 'fault' for that chip, title "Input not connected".
// - An unpowered chip keeps 'no-supply' only; a board with no floating half
//   gives exactly today's problems().
// Boards as #1's (test/opamp-floating-input.test.js): PS1 12 V on tp/tn, the
// chip with pin 1 at f<col> facing right, rails V+ tp → a<col>, V− j<col+3> → tn.
// Every row below was checked against the real simulator.

const chipAt = (label, col) => ({ type: 'tl072', label,
  holes: [0, 1, 2, 3].map(k => 'f' + (col + k)).concat([3, 2, 1, 0].map(k => 'e' + (col + k))) });
const RAILS_AT = col => [['tp_' + col, 'a' + col], ['j' + (col + 3), 'tn_' + (col + 3)]];

// The chip's warnings, from the solve (#1 owns their wording); every one of
// them is a floating-input warning on these boards.
function floatingWarnings(result, label) {
  const u = result.parts[label];
  assert.ok(u, `analyze().parts has no ${label} (status ${result.status}); got ${JSON.stringify(Object.keys(result.parts || {}))}`);
  assert.ok(u.warnings.length && u.warnings.every(w => w.startsWith(label + ':') && /to nothing/.test(w)),
    `${label}'s warnings are its floating-input ones (#1): ${JSON.stringify(u.warnings)}`);
  return u.warnings;
}

const FLOATING = [
  { id: 'A', what: 'OUT2 on +12 V, IN2± floating',            label: 'U1', wires: [['a31', 'tp_31']] },
  { id: 'B', what: 'OUT2 on 0 V, IN2± floating, labelled U2', label: 'U2', wires: [['a31', 'tn_31']] },
  { id: 'G', what: 'IN1− on OUT1, OUT1 on +12 V, IN1+ floating', label: 'U1', wires: [['g30', 'g31'], ['j30', 'tp_29']] },
];
const floatingBoard = c => solve([PS1, chipAt(c.label, 30)], [...SUPPLY, ...RAILS_AT(30), ...c.wires]);

for (const c of FLOATING) {
  test(`problems (#8): repro ${c.id} (${c.what}) gives exactly one 'floating-input' row for ${c.label}, why its own warning`, () => {
    const { result, readings } = floatingBoard(c);
    const [warning, ...more] = floatingWarnings(result, c.label);
    assert.deepStrictEqual(more, [], `one floating half, one warning: ${JSON.stringify(result.parts[c.label].warnings)}`);
    const list = problemsOf(readings);
    assert.deepStrictEqual(list, [{ kind: 'floating-input', labels: [c.label], why: warning }], showP(list));
  });
}

test('lines (#8): repro A — U1\'s callout is a fault titled "Input not connected" that says OUT2\'s inputs connect to nothing, shown before PS1\'s', () => {
  const { readings } = floatingBoard(FLOATING[0]);
  const all = readings.lines();
  const u1 = all.filter(l => l.label === 'U1');
  assert.strictEqual(u1.length, 1, `one line for U1: ${JSON.stringify(all)}`);
  assert.strictEqual(u1[0].level, 'fault', `U1's level: ${JSON.stringify(u1[0])}`);
  assert.strictEqual(u1[0].title, 'Input not connected', `U1's title: ${JSON.stringify(u1[0])}`);
  const sub = u1[0].sub.join(' ');
  assert.ok(/connect to nothing/.test(sub) && sub.includes('OUT2'), `U1's sublines say OUT2's inputs connect to nothing: ${JSON.stringify(u1[0].sub)}`);
  assert.strictEqual(all[0].label, 'U1', `faults come first: ${JSON.stringify(all.map(l => [l.label, l.level]))}`);
});

// Both halves floating: one row whose why leads with "U1: " once, then each
// warning's text after its own "U1: ", so the callout never reads "… U1.".
const BOTH_FLOATING = [...SUPPLY, VPOS, VNEG, ['j30', 'tp_29'], ['a31', 'tn_31']];

test('problems (#8): both halves floating (OUT1 on +12 V, OUT2 on 0 V) is still one row for U1: why says "U1: " once, then both warnings\' text', () => {
  const { result, readings } = solve([PS1, TL072], BOTH_FLOATING);
  const warnings = floatingWarnings(result, 'U1');
  assert.strictEqual(warnings.length, 2, `one warning per half (#1): ${JSON.stringify(warnings)}`);
  const list = problemsOf(readings);
  assert.deepStrictEqual(kindsOf(list), ['floating-input'], showP(list));
  assert.deepStrictEqual(list[0].labels, ['U1'], showP(list));
  const why = list[0].why;
  assert.ok(why.startsWith('U1: '), `why leads with "U1: ": ${JSON.stringify(why)}`);
  assert.strictEqual(why.split('U1: ').length - 1, 1, `"U1: " appears once, not once per warning: ${JSON.stringify(why)}`);
  for (const w of warnings.map(t => t.replace(/^U1:\s*/, ''))) {
    assert.ok(why.includes(w), `why carries "${w}": ${JSON.stringify(why)}`);
  }
});

test('lines (#8): both halves floating — U1\'s callout is a fault titled "Input not connected", names OUT1 and OUT2, and no subline is a stray "U1"', () => {
  const { readings } = solve([PS1, TL072], BOTH_FLOATING);
  const all = readings.lines();
  const u1 = all.filter(l => l.label === 'U1');
  assert.strictEqual(u1.length, 1, `one line for U1: ${JSON.stringify(all)}`);
  assert.deepStrictEqual([u1[0].level, u1[0].title], ['fault', 'Input not connected'], JSON.stringify(u1[0]));
  const stray = u1[0].sub.filter(s => /(^|\s)U1\.?$/.test(s.trim()));
  assert.deepStrictEqual(stray, [], `no subline ends in or is a bare "U1": ${JSON.stringify(u1[0].sub)}`);
  const sub = u1[0].sub.join(' ');
  for (const out of ['OUT1', 'OUT2']) assert.ok(sub.includes(out), `the sublines name ${out}: ${JSON.stringify(u1[0].sub)}`);
});

test('problems (#8): two chips, U1 with OUT2 floating and U2 with OUT1 floating, give one row each, each its own warning', () => {
  // U1 at f30: OUT2 a31 → tp_31. U2 at f40, rails wired: OUT1 j40 → tp_39, IN1± floating.
  const { result, readings } = solve([PS1, chipAt('U1', 30), chipAt('U2', 40)],
    [...SUPPLY, ...RAILS_AT(30), ['a31', 'tp_31'], ...RAILS_AT(40), ['j40', 'tp_39']]);
  const list = problemsOf(readings);
  assert.deepStrictEqual(kindsOf(list), ['floating-input', 'floating-input'], showP(list));
  for (const label of ['U1', 'U2']) {
    const rows = list.filter(p => p.labels.includes(label));
    assert.deepStrictEqual(rows, [{ kind: 'floating-input', labels: [label], why: floatingWarnings(result, label)[0] }], `${label}: ${showP(list)}`);
  }
});

test('problems (#8): a floating U1 beside an unpowered U2 — U1 floating-input, U2 no-supply only; both callouts are faults', () => {
  // U1 at f30 as repro A. U2 at f40, rails unwired, OUT2 a41 → tp_41, every input floating.
  const { result, readings } = solve([PS1, chipAt('U1', 30), chipAt('U2', 40)],
    [...SUPPLY, ...RAILS_AT(30), ['a31', 'tp_31'], ['a41', 'tp_41']]);
  const list = problemsOf(readings);
  assert.deepStrictEqual(kindsOf(list), ['floating-input', 'no-supply'], showP(list));
  assert.deepStrictEqual(rowsOf(list, 'floating-input'), [{ kind: 'floating-input', labels: ['U1'], why: floatingWarnings(result, 'U1')[0] }], showP(list));
  assert.deepStrictEqual(rowsOf(list, 'no-supply').map(p => p.labels), [['U2']], showP(list));
  const at = Object.fromEntries(readings.lines().map(l => [l.label, [l.level, l.title]]));
  assert.deepStrictEqual([at.U1, at.U2], [['fault', 'Input not connected'], ['fault', 'No supply']], JSON.stringify(at));
});

// Pins: captured from today's code (they pass before #8 and must after).
const OPEN_ROW = { kind: 'open', labels: ['PS1'],
  why: 'No current flows: the circuit is not connected all the way from the battery + terminal back to the − terminal. ' +
       'Check for a missing wire, often the one to ground.' };
const NO_SUPPLY_ROW = { kind: 'no-supply', labels: ['U1'], why: 'U1: the op-amp has no supply: wire V+ (pin 8) and V− (pin 4)' };
const SHORTED_ROW = { kind: 'output-shorted', labels: ['U1'],
  why: 'U1\'s output (out2) is at its 20 mA current limit: it is tied straight to ground, a rail or the other output, ' +
       'or its load takes too much current. Use a bigger resistor.' };

test('pin (#8): boards with no floating half give exactly today\'s problems(): an unpowered chip keeps no-supply only; repros C and I, which solve first time', () => {
  const boards = [
    // An unpowered chip, OUT2 on +12 V, every input floating (#1's pin).
    ['unpowered, no rails', [PS1, TL072], [...SUPPLY, OUT2_HIGH], [OPEN_ROW, NO_SUPPLY_ROW]],
    ['unpowered, V+ only',  [PS1, TL072], [...SUPPLY, VPOS, OUT2_HIGH], [OPEN_ROW, NO_SUPPLY_ROW]],
    ['unpowered, V− only',  [PS1, TL072], [...SUPPLY, VNEG, OUT2_HIGH], [NO_SUPPLY_ROW]],
    // Repro C: op-amp 2 a follower of 0 V with OUT2 on +12 V, at its 20 mA limit.
    ['repro C', [PS1, TL072], [...SUPPLY, VPOS, VNEG, OUT2_HIGH, ['a32', 'b31'], ['a33', 'tn_34']], [SHORTED_ROW]],
    // Repro I: R1 1 kΩ from OUT1 to COM, every input floating: both halves unused.
    ['repro I', [PS1, TL072, res('R1', ['h26', 'h30'], 1000)], [...SUPPLY, VPOS, VNEG, ['j26', 'tn_26']], []],
  ];
  for (const [what, parts, pairs, want] of boards) {
    const { readings } = solve(parts, pairs);
    assert.deepStrictEqual(problemsOf(readings), want, what);
    const u1 = readings.lines().find(l => l.label === 'U1');
    assert.notStrictEqual(u1 && u1.title, 'Input not connected', `${what}: U1's callout: ${JSON.stringify(u1)}`);
  }
});

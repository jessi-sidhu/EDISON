// CSV export (issue #101): toCSV(readings, board) → the text of
// <circuit name>-readings.csv, from the latest solve.
//
// Contract these tests are written against (circuit3d/js/tools/csv-export.js,
// UMD like tools/equations.js, so Node can require it):
// - toCSV(readings, board), readings = Readings.from(result, board),
//   board = { components, wires } as given to Sim.analyze.
// - Lines end in "\n" (no "\r").
// - Part section: header "Label,Type,V (V),I (mA),P (mW)", then one row per
//   labelled part with non-null readings: label, type, |V| 2 dp, |I| 2 dp,
//   |P| × 1000 2 dp (magnitudes, so no signs).
// - Then a blank line, the net header "Net,Holes,V (V)", and one row per net
//   in Readings.nets(board): net id, its holes joined with single spaces,
//   voltage 2 dp, or empty when the net floats.
// - RFC 4180: a field holding a comma, quote or newline is quoted, inner
//   quotes doubled.
//
// Every expected value is hand-computed and was checked against the real
// simulator (Board.toSim → Sim.analyze → Readings.from); no mocks.

const assert = require('node:assert');

const Sim      = require('../circuit3d/js/simulate.js');
const Board    = require('../circuit3d/js/board-model.js');
const Readings = require('../circuit3d/js/readings.js');

const { toCSV } = require('../circuit3d/js/tools/csv-export.js');

// ── Helpers ───────────────────────────────────────────────────

const wiresOf = pairs => pairs.map(([from, to], i) => ({ id: 'W' + (i + 1), from, to }));
const BAT   = { type: 'battery', label: 'BAT1' };                   // 9 V
const POWER = [['BAT1.0', 'tp_1'], ['BAT1.1', 'tn_1']];             // + rail, − rail
const res   = (label, holes, ohms) => ({ type: 'resistor', label, holes, values: { resistance: ohms } });

// 9 V divider, 1 kΩ over 2 kΩ. I = 9 / 3000 = 3 mA.
// V(R1) = 3 V, P = 3 × 3 = 9 mW; V(R2) = 6 V, P = 6 × 3 = 18 mW;
// battery 9 V, 3 mA, 27 mW. Nodes: + rail 9 V, column 14 6 V, − rail 0 V.
const DIVIDER_PARTS = [BAT, res('R1', ['a10', 'a14'], 1000), res('R2', ['b14', 'b18'], 2000)];
const DIVIDER_WIRES = [...POWER, ['tp_10', 'c10'], ['c18', 'tn_18']];

function solve(parts, pairs) {
  const board = Board.toSim({ parts, wires: wiresOf(pairs) });
  const result = Sim.analyze(board.components, board.wires);
  return { board, readings: Readings.from(result, board) };
}

// toCSV's text split into its two sections, trailing newline ignored.
function csvOf(parts, pairs) {
  const { board, readings } = solve(parts, pairs);
  const text = toCSV(readings, board);
  assert.strictEqual(typeof text, 'string', `toCSV should return a string; got ${typeof text}`);
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const gap = lines.indexOf('');
  assert.ok(gap > 0, `expected a blank line between the part and net sections; got:\n${text.slice(0, 400)}`);
  return { text, board, readings, partLines: lines.slice(0, gap), netLines: lines.slice(gap + 1) };
}

const netWith = (board, hole) => Readings.nets(board).find(n => n.holes.includes(hole));

// ── Part section ───────────────────────────────────────────────

test('toCSV on the 1k/2k divider: R1 3.00 V 3.00 mA 9.00 mW, R2 6.00 V 3.00 mA 18.00 mW', () => {
  const { partLines } = csvOf(DIVIDER_PARTS, DIVIDER_WIRES);
  assert.strictEqual(partLines[0], 'Label,Type,V (V),I (mA),P (mW)');
  assert.ok(partLines.includes('R1,resistor,3.00,3.00,9.00'), `no R1 row in:\n${partLines.join('\n')}`);
  assert.ok(partLines.includes('R2,resistor,6.00,3.00,18.00'), `no R2 row in:\n${partLines.join('\n')}`);
});

test('toCSV: the battery row reads magnitudes (its readings I and P are negative): 9.00 V 3.00 mA 27.00 mW', () => {
  const { partLines, readings } = csvOf(DIVIDER_PARTS, DIVIDER_WIRES);
  assert.ok(readings.part('BAT1').I < 0, 'premise: the battery reads I < 0');
  assert.ok(partLines.includes('BAT1,battery,9.00,3.00,27.00'), `no sign-free BAT1 row in:\n${partLines.join('\n')}`);
  assert.ok(!partLines.slice(1).some(l => l.includes('-')), `no part row has a minus sign:\n${partLines.join('\n')}`);
});

test('toCSV: exactly one part row per labelled part with readings', () => {
  const { partLines, readings, board } = csvOf(DIVIDER_PARTS, DIVIDER_WIRES);
  const labelled = board.components.filter(c => c.label && readings.part(c.label)).map(c => c.label);
  assert.deepStrictEqual(partLines.slice(1).map(l => l.split(',')[0]).sort(), labelled.sort());
});

test('toCSV: lines end in \\n, never \\r\\n', () => {
  const { text } = csvOf(DIVIDER_PARTS, DIVIDER_WIRES);
  assert.ok(!text.includes('\r'), 'the CSV holds a \\r');
});

// ── Net section ────────────────────────────────────────────────

test('toCSV: the net section has its header and one row per net, in Readings.nets order', () => {
  const { netLines, board } = csvOf(DIVIDER_PARTS, DIVIDER_WIRES);
  assert.strictEqual(netLines[0], 'Net,Holes,V (V)');
  const ids = Readings.nets(board).map(n => String(n.id));
  assert.deepStrictEqual(netLines.slice(1).map(l => l.split(',')[0]), ids);
});

test('toCSV: a net row is its id, its holes joined with spaces, and its voltage (6.00 at column 14, 9.00 and 0.00 on the rails)', () => {
  const { netLines, board } = csvOf(DIVIDER_PARTS, DIVIDER_WIRES);
  for (const [hole, volts] of [['e14', '6.00'], ['tp_1', '9.00'], ['tn_1', '0.00']]) {
    const net = netWith(board, hole);
    const want = `${net.id},${net.holes.join(' ')},${volts}`;
    assert.ok(netLines.includes(want), `no row "${want.slice(0, 80)}…" for the net of ${hole}`);
  }
  // Column 14's top half by name, so the hole format is pinned too.
  const mid = netWith(board, 'e14');
  assert.ok(netLines.includes(`${mid.id},a14 b14 c14 d14 e14,6.00`), `column 14 row in:\n${netLines.slice(0, 5).join('\n')}`);
});

test('toCSV: a floating net has an empty voltage', () => {
  const { netLines, board } = csvOf(DIVIDER_PARTS, DIVIDER_WIRES);
  const empty = netWith(board, 'a40');                               // nothing in column 40
  assert.ok(netLines.includes(`${empty.id},a40 b40 c40 d40 e40,`), `column 40 row should end in an empty voltage`);
});

// ── Quoting ────────────────────────────────────────────────────

test('toCSV: a label with a comma and a quote is quoted, its quote doubled (RFC 4180)', () => {
  const label = 'R1, "top"';
  const { partLines } = csvOf([BAT, res(label, ['a10', 'a14'], 1000), res('R2', ['b14', 'b18'], 2000)], DIVIDER_WIRES);
  assert.ok(partLines.includes('"R1, ""top""",resistor,3.00,3.00,9.00'), `quoted R1 row in:\n${partLines.join('\n')}`);
});

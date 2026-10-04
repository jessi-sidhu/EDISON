// Lab 1, the first "ENSC 220 Labs" starter circuit (issue #98).
//
// The circuit, decided by Aarmen (issue #98 comment):
//   bench supply PS1 at +10 V (PS1.pos → COM; the − rail unused)
//   → R1 1 kΩ → node A → R2 2.2 kΩ ∥ R3 3.3 kΩ → COM.
//
// Hand-computed: R2 ∥ R3 = 2.2·3.3 / 5.5 = 1.32 kΩ, total 2.32 kΩ.
//   I(R1) = 10 / 2320       = 4.3103 mA   V(R1) = 4.3103 V
//   V(A)  = 10 · 1320/2320  = 5.6897 V
//   I(R2) = 5.6897 / 2200   = 2.5862 mA   I(R3) = 5.6897 / 3300 = 1.7241 mA
//   KCL at A: 4.3103 = 2.5862 + 1.7241. KVL: 4.3103 + 5.6897 = 10.
//
// The file is circuit3d/labs/lab1.sparky, in the saved-file shape of
// demo.sparky (what the page's Save writes), so it is read here the way
// app.js's rebuildBoard reads it: holes through loadHoleRefs (by pin name),
// wire ends on a part's pin by name (pinIndex), then the real simulator.
// No mocks. Lab layout (which holes) is the builder's; only the circuit
// and its readings are asserted.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const Sim      = require('../circuit3d/js/simulate.js');
const IO       = require('../circuit3d/js/board-io.js');
const Parts    = require('../circuit3d/js/parts');
const Readings = require('../circuit3d/js/readings.js');

const LAB1 = path.join(__dirname, '..', 'circuit3d', 'labs', 'lab1.sparky');

function readLab1() {
  assert.ok(fs.existsSync(LAB1), `Lab 1's starter circuit should be at ${path.relative(path.join(__dirname, '..'), LAB1)}`);
  return JSON.parse(fs.readFileSync(LAB1, 'utf8'));
}

// The saved file as the simulator's { components, wires }, the way
// rebuildBoard places each record and redraws each wire.
function load(file) {
  const components = IO.rebuildComponents(file.components, rec => {
    const def = Parts.get(rec.type);
    if (!def) return null;
    const offboard = def.place.kind === 'offboard';
    const holeRefs = offboard ? null : IO.loadHoleRefs(rec);
    const comp = { type: rec.type, label: rec.label, values: rec.values || {}, holeRefs,
                   pins: def.pins.map(() => ({ x: 0, y: 0, z: 0 })) };
    if (rec.controls) comp.controls = Object.assign({}, rec.controls);
    return comp;
  }, t => !!Parts.get(t));
  const end = (hole, ci, name, pi) => {
    const comp = !hole && ci >= 0 ? components[ci] : null;
    return { hole: hole ? { col: hole.col, row: hole.row } : null, comp, idx: comp ? IO.pinIndex(comp, name, pi) : -1 };
  };
  const wires = (file.wires || []).map(w => {
    const a = end(w.startHole, w.startCompIdx, w.startPin, w.startPinIdx);
    const b = end(w.endHole,   w.endCompIdx,   w.endPin,   w.endPinIdx);
    return { startHole: a.hole, endHole: b.hole, startComp: a.comp, startPinIdx: a.idx,
             endComp: b.comp, endPinIdx: b.idx };
  });
  return { components, wires };
}

function solveLab1() {
  const board = load(readLab1());
  const result = Sim.analyze(board.components, board.wires);
  return { board, result, readings: Readings.from(result, board) };
}

const near = (got, want, tol, what) =>
  assert.ok(typeof got === 'number' && Math.abs(got - want) <= tol, `${what}: expected ${want} ± ${tol}, got ${got}`);

// The net that R1, R2 and R3 all touch: node A.
function nodeA(board) {
  const nets = Readings.nets(board);
  const touches = (net, label) => net.pins.some(p => p.label === label);
  const found = nets.filter(n => touches(n, 'R1') && touches(n, 'R2') && touches(n, 'R3'));
  assert.equal(found.length, 1, `exactly one net joins R1, R2 and R3 (node A); found ${found.length}`);
  return found[0];
}

test('lab1.sparky holds the Lab 1 parts: PS1 at 10 V, R1 1 kΩ, R2 2.2 kΩ, R3 3.3 kΩ', () => {
  const file = readLab1();
  const byLabel = Object.fromEntries((file.components || []).map(c => [c.label, c]));
  assert.deepStrictEqual(Object.keys(byLabel).sort(), ['PS1', 'R1', 'R2', 'R3'], 'the four parts, labelled');
  assert.equal(byLabel.PS1.type, 'bench_supply');
  assert.equal(Number(byLabel.PS1.values && byLabel.PS1.values.voltage), 10, 'PS1 is set to 10 V');
  for (const [label, ohms] of [['R1', 1000], ['R2', 2200], ['R3', 3300]]) {
    assert.equal(byLabel[label].type, 'resistor', `${label} is a resistor`);
    assert.equal(Number(byLabel[label].values && byLabel[label].values.resistance), ohms, `${label} is ${ohms} Ω`);
  }
  const { components, wires } = load(file);
  assert.deepStrictEqual(IO.flagPlacements(components, wires), [], 'every part sits where the placement rules allow');
});

test('Lab 1 simulates: I(R1) 4.31 mA, V(R1) 4.31 V, V(A) 5.69 V, I(R2) 2.59 mA, I(R3) 1.72 mA', () => {
  const { board, result, readings } = solveLab1();
  assert.equal(result.status, 'ok', `status; lines: ${(result.lines || []).map(l => l.text).join(' | ')}`);
  assert.equal(result.shorted, false, 'not a short');

  const R1 = readings.part('R1'), R2 = readings.part('R2'), R3 = readings.part('R3');
  assert.ok(R1 && R2 && R3, 'readings for R1, R2 and R3');
  near(Math.abs(R1.I), 4.3103, 0.01, 'I(R1) mA');
  near(Math.abs(R1.V), 4.3103, 0.01, 'V(R1) V');
  near(Math.abs(R2.I), 2.5862, 0.01, 'I(R2) mA');
  near(Math.abs(R3.I), 1.7241, 0.01, 'I(R3) mA');
  near(readings.voltage(nodeA(board)), 5.6897, 0.01, 'V(A), node A to COM, V');

  // KVL round the loop: V(R1) + V(A) = the supply's 10 V.
  near(Math.abs(R1.V) + readings.voltage(nodeA(board)), 10, 0.001, 'V(R1) + V(A)');
  // Only the + rail is used.
  near(result.parts.PS1.m.posAmps, 4.3103, 0.01, 'PS1 + rail mA');
  near(result.parts.PS1.m.negAmps, 0, 0.001, 'PS1 − rail mA (unused)');
});

test('Lab 1: KCL at node A, I(R1) = I(R2) + I(R3) within 1 µA', () => {
  const { board, readings } = solveLab1();
  const i = label => Math.abs(readings.part(label).I);
  near(i('R1'), i('R2') + i('R3'), 0.001, 'I(R1) vs I(R2) + I(R3), mA');
  const into = readings.kcl(nodeA(board));
  assert.equal(into.length, 3, `three currents meet at A; got ${JSON.stringify(into)}`);
  near(into.reduce((s, x) => s + x.amps, 0), 0, 0.001, 'currents into node A sum to 0 mA');
});

test('Lab 1 runs clean: no warnings and no mistakes flagged', () => {
  const { result, readings } = solveLab1();
  for (const label of ['PS1', 'R1', 'R2', 'R3']) {
    assert.deepStrictEqual(result.parts[label].warnings, [], `${label} warnings`);
  }
  assert.deepStrictEqual(readings.problems(), [], 'the mistake checker finds nothing');
});

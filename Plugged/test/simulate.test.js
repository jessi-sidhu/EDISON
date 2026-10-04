// Golden tests for the simulate.js solver.
//
// Run with:  npm test
// Expected values are worked out by hand from Ohm's and Kirchhoff's laws.

const assert = require('node:assert');

const Sim = require('../circuit3d/js/simulate.js');

// ── Fixture helpers ───────────────────────────────────────────
// A component only needs type, pins (for arity) and holeRefs for the
// solver. The 3D group and meshes are presentation and never touched.

function pins(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: 0, y: 0, z: 0 });
  return out;
}

function comp(type, holes, extra) {
  return Object.assign({ type, pins: pins(holes.length), holeRefs: holes }, extra || {});
}

function h(col, row) { return { col, row }; }
function wire(a, b)  { return { startHole: a, endHole: b }; }

// Battery pins sit straight on the rails here. On the real board it is
// off-board and wired to them, which resolves to the same two nodes.
function battery() { return comp('battery', [h(1, 'tp'), h(1, 'tn')]); }

const mA = i => i * 1000;

function texts(result) { return result.lines.map(l => l.text); }
function hasLine(result, substr) { return texts(result).some(t => t.includes(substr)); }


// Forward current through an LED: pin 1 (anode) to pin 0 (cathode).
// currents[] is positive from pin 0 to pin 1 inside a part, so negate it.
const ledI = (r, i) => -r.currents[i];

// ── Series: 9V - 470R - LED ───────────────────────────────────
// I = (9 - 2) / 470 = 14.894 mA

test('series battery, resistor, LED: (9-2)/470', () => {
  const bat = battery();
  const res = comp('resistor', [h(5, 'a'), h(10, 'a')]);
  const led = comp('led',      [h(15, 'a'), h(10, 'a')]); // pin0 cathode, pin1 anode
  const wires = [wire(h(2, 'tp'), h(5, 'a')), wire(h(15, 'a'), h(2, 'tn'))];

  const r = Sim.analyze([bat, res, led], wires);

  assert.equal(r.status, 'ok');
  assert.ok(Math.abs(mA(ledI(r, 2)) - 14.894) < 0.01, `got ${mA(ledI(r, 2))}`);
  assert.equal(r.ledsOn.length, 1);
  assert.ok(hasLine(r, 'LED ON  (14.9 mA)'), texts(r).join(' | '));
});

// ── Parallel: two LEDs behind one 470R (#8) ───────────────────
// 14.894 mA through the resistor, split 7.447 mA per LED.

test.skip('parallel LEDs behind one resistor split its current (#8)', () => {
  const bat  = battery();
  const res  = comp('resistor', [h(5, 'a'), h(10, 'a')]);
  const led1 = comp('led', [h(1, 'tn'), h(10, 'a')]);
  const led2 = comp('led', [h(3, 'tn'), h(10, 'a')]);
  const r = Sim.analyze([bat, res, led1, led2], [wire(h(2, 'tp'), h(5, 'a'))]);

  assert.ok(Math.abs(mA(r.currents[1]) - 14.894) < 0.01, `resistor ${mA(r.currents[1])}`);
  assert.ok(Math.abs(mA(ledI(r, 2)) - 7.447) < 0.01, `led1 ${mA(ledI(r, 2))}`);
  assert.ok(Math.abs(mA(ledI(r, 3)) - 7.447) < 0.01, `led2 ${mA(ledI(r, 3))}`);
  assert.equal(r.ledsOn.length, 2);
});

// ── Voltage divider: 9V - 470R - X - 470R - GND (#9) ──────────
// V(X) = 4.5 V, loop current 9 / 940 = 9.574 mA.

test('voltage divider: V(midpoint) = 4.5 V (#9)', () => {
  const bat = battery();
  const r1  = comp('resistor', [h(5, 'a'),  h(10, 'a')]);
  const r2  = comp('resistor', [h(10, 'a'), h(15, 'a')]);
  const wires = [wire(h(2, 'tp'), h(5, 'a')), wire(h(15, 'a'), h(2, 'tn'))];
  const r = Sim.analyze([bat, r1, r2], wires);

  assert.ok(r.nodeVoltages, 'solver should report node voltages');
  assert.ok(Math.abs(r.nodeVoltages.bb_top_10 - 4.5) < 1e-6, `got ${r.nodeVoltages.bb_top_10}`);
  assert.ok(r.currents, 'solver should report the current through each part');
  assert.ok(Math.abs(mA(r.currents[1]) - 9.574) < 0.01);
});

// ── Reverse LED (#10) ─────────────────────────────────────────

test('reversed LED: stays dark and says so (#10)', () => {
  const bat = battery();
  const res = comp('resistor', [h(5, 'a'), h(10, 'a')]);
  const led = comp('led',      [h(10, 'a'), h(15, 'a')]); // cathode toward the resistor
  const wires = [wire(h(2, 'tp'), h(5, 'a')), wire(h(15, 'a'), h(2, 'tn'))];
  const r = Sim.analyze([bat, res, led], wires);

  assert.equal(r.ledsOn.length, 0);
  assert.ok(hasLine(r, 'backwards'), texts(r).join(' | '));
});

// ── Shorts ────────────────────────────────────────────────────

test.skip('LED across the battery with no resistor is reported as a short', () => {
  const bat = battery();
  const led = comp('led', [h(1, 'tn'), h(1, 'tp')]); // cathode on -, anode on +
  const r = Sim.analyze([bat, led], []);

  assert.equal(r.shorted, true);
  assert.equal(r.ledsOn.length, 0);
  assert.ok(hasLine(r, 'Short circuit'), texts(r).join(' | '));
});

test.skip('a wire straight across the battery is a short', () => {
  const r = Sim.analyze([battery()], [wire(h(4, 'tp'), h(4, 'tn'))]);

  assert.equal(r.shorted, true);
  assert.ok(hasLine(r, 'Short circuit'), texts(r).join(' | '));
});

// ── Open circuit ──────────────────────────────────────────────

test('resistor and LED not wired to the battery leave the circuit open', () => {
  const bat = battery();
  const res = comp('resistor', [h(5, 'a'), h(10, 'a')]);
  const led = comp('led',      [h(15, 'a'), h(10, 'a')]);
  const r = Sim.analyze([bat, res, led], []);

  assert.equal(r.status, 'ok');
  assert.equal(r.ledsOn.length, 0);
  assert.ok(hasLine(r, 'Circuit open'), texts(r).join(' | '));
  assert.ok(hasLine(r, 'Battery terminals not connected'), texts(r).join(' | '));
});

// ── Two batteries in series (#11) ─────────────────────────────
// 18 V drives (18 - 2) / 470 = 34.043 mA.

test.skip('two 9V batteries in series add up (#11)', () => {
  const batA = comp('battery', [h(1, 'tp'),  h(20, 'a')]);
  const batB = comp('battery', [h(20, 'a'), h(1, 'tn')]);
  const res  = comp('resistor', [h(5, 'a'), h(10, 'a')]);
  const led  = comp('led',      [h(15, 'a'), h(10, 'a')]);
  const wires = [wire(h(2, 'tp'), h(5, 'a')), wire(h(15, 'a'), h(2, 'tn'))];
  const r = Sim.analyze([batA, batB, res, led], wires);

  assert.ok(Math.abs(mA(ledI(r, 3)) - 34.043) < 0.01, `got ${mA(ledI(r, 3))}`);
});

// ── Mixed LEDs, floating parts, buttons ───────────────────────

test.skip('red and green LEDs in parallel: only the lower-Vf red one lights', () => {
  const bat   = battery();
  const res   = comp('resistor', [h(5, 'a'), h(10, 'a')]);
  const red   = comp('led', [h(1, 'tn'), h(10, 'a')]);
  const green = comp('led', [h(3, 'tn'), h(10, 'a')],
    { values: { color: 'green', forwardVoltage: 2.2, thresholdCurrent: 0.001, maxCurrent: 0.020 } });
  const r = Sim.analyze([bat, res, red, green], [wire(h(2, 'tp'), h(5, 'a'))]);

  assert.deepEqual(r.ledsOn, [red]);
});

test.skip('a floating resistor does not disturb the circuit', () => {
  const bat   = battery();
  const res   = comp('resistor', [h(5, 'a'), h(10, 'a')]);
  const led   = comp('led',      [h(15, 'a'), h(10, 'a')]);
  const loose = comp('resistor', [h(30, 'f'), h(34, 'f')]);
  const wires = [wire(h(2, 'tp'), h(5, 'a')), wire(h(15, 'a'), h(2, 'tn'))];
  const r = Sim.analyze([bat, res, led, loose], wires);

  assert.equal(r.status, 'ok');
  assert.ok(Math.abs(mA(ledI(r, 2)) - 14.894) < 0.01);
});

test('a push button opens and closes the circuit', () => {
  const build = pressed => {
    const bat = battery();
    const btn = comp('button', [h(3, 'a'), h(6, 'a')], { pressed });
    const res = comp('resistor', [h(6, 'a'), h(10, 'a')]);
    const led = comp('led', [h(15, 'a'), h(10, 'a')]);
    const wires = [wire(h(2, 'tp'), h(3, 'a')), wire(h(15, 'a'), h(2, 'tn'))];
    return Sim.analyze([bat, btn, res, led], wires);
  };
  assert.equal(build(false).ledsOn.length, 0);
  assert.equal(build(true).ledsOn.length, 1);
});

test.skip('batteries wired straight together are unsolvable, not a crash', () => {
  const a = battery();
  const b = comp('battery', [h(9, 'tp'), h(9, 'tn')], { values: { voltage: 6 } });
  const r = Sim.analyze([a, b], []);

  assert.equal(r.status, 'unsolvable');
  assert.ok(hasLine(r, 'cannot be solved'), texts(r).join(' | '));
});

// ── Linear solver ─────────────────────────────────────────────

test('solveLinear solves a 2x2 system and reports a singular one as null', () => {
  // 2x + y = 3, x + 3y = 5  ->  x = 0.8, y = 1.4
  const x = Sim.solveLinear([[2, 1], [1, 3]], [3, 5]);
  assert.ok(Math.abs(x[0] - 0.8) < 1e-12 && Math.abs(x[1] - 1.4) < 1e-12, `got ${x}`);
  assert.equal(Sim.solveLinear([[1, 2], [2, 4]], [1, 2]), null);
});

// ── Degenerate inputs ─────────────────────────────────────────

test('empty board and battery-less board report their own status', () => {
  assert.equal(Sim.analyze([], []).status, 'empty');
  const noBat = Sim.analyze([comp('resistor', [h(5, 'a'), h(10, 'a')])], []);
  assert.equal(noBat.status, 'no-battery');
  assert.ok(hasLine(noBat, 'No battery in circuit.'));
});

// ── Node extraction ───────────────────────────────────────────

test('buildGraph merges columns, rails and wired holes into one node each', () => {
  const res = comp('resistor', [h(5, 'a'), h(5, 'e')]);   // same column, same half
  const led = comp('led',      [h(5, 'f'), h(9, 'a')]);   // other half of column 5
  const bat = comp('battery',  [h(30, 'tp'), h(1, 'tn')]);
  const graph = Sim.buildGraph([res, led, bat], [wire(h(9, 'a'), h(2, 'tp'))]);

  assert.equal(graph[0].nodes[0], graph[0].nodes[1], 'a-e of a column are one node');
  assert.notEqual(graph[0].nodes[0], graph[1].nodes[0], 'the two halves are separate nodes');
  assert.equal(graph[1].nodes[1], graph[2].nodes[0], 'the wire merged col 9 into the + rail');
  assert.equal(Sim.bbNodeId(5, 'c'), 'bb_top_5');
  assert.equal(Sim.bbNodeId(5, 'h'), 'bb_bot_5');
  assert.equal(Sim.bbNodeId(5, 'tp'), 'bb_rail_tp');
});

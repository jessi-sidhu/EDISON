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

test('parallel LEDs behind one resistor split its current (#8)', () => {
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

test('LED across the battery with no resistor is reported as a short', () => {
  const bat = battery();
  const led = comp('led', [h(1, 'tn'), h(1, 'tp')]); // cathode on -, anode on +
  const r = Sim.analyze([bat, led], []);

  assert.equal(r.shorted, true);
  assert.equal(r.ledsOn.length, 0);
  assert.ok(hasLine(r, 'Short circuit'), texts(r).join(' | '));
});

test('a wire straight across the battery is a short', () => {
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

test('two 9V batteries in series add up (#11)', () => {
  const batA = comp('battery', [h(1, 'tp'),  h(20, 'a')]);
  const batB = comp('battery', [h(20, 'a'), h(1, 'tn')]);
  const res  = comp('resistor', [h(5, 'a'), h(10, 'a')]);
  const led  = comp('led',      [h(15, 'a'), h(10, 'a')]);
  const wires = [wire(h(2, 'tp'), h(5, 'a')), wire(h(15, 'a'), h(2, 'tn'))];
  const r = Sim.analyze([batA, batB, res, led], wires);

  assert.ok(Math.abs(mA(ledI(r, 3)) - 34.043) < 0.01, `got ${mA(ledI(r, 3))}`);
});

// ── Mixed LEDs, floating parts, buttons ───────────────────────

// 150R shared by two red LEDs: ~23 mA each, over the 20 mA rating. Each LED
// on its own would need (9 - 2) / 20 mA = 350 ohm, so the advice must point
// above the 150R already there, never below it.
test('over-current advice for parallel LEDs never suggests a smaller resistor', () => {
  const bat  = battery();
  const res  = comp('resistor', [h(5, 'a'), h(10, 'a')], { values: { resistance: 150 } });
  const led1 = comp('led', [h(1, 'tn'), h(10, 'a')]);
  const led2 = comp('led', [h(3, 'tn'), h(10, 'a')]);
  const r = Sim.analyze([bat, res, led1, led2], [wire(h(2, 'tp'), h(5, 'a'))]);

  assert.ok(hasLine(r, 'Needs at least 350 ohm in series, so use 470 ohm'), texts(r).join(' | '));
});

test('red and green LEDs in parallel: only the lower-Vf red one lights', () => {
  const bat   = battery();
  const res   = comp('resistor', [h(5, 'a'), h(10, 'a')]);
  const red   = comp('led', [h(1, 'tn'), h(10, 'a')]);
  const green = comp('led', [h(3, 'tn'), h(10, 'a')],
    { values: { color: 'green', forwardVoltage: 2.2, thresholdCurrent: 0.001, maxCurrent: 0.020 } });
  const r = Sim.analyze([bat, res, red, green], [wire(h(2, 'tp'), h(5, 'a'))]);

  assert.deepEqual(r.ledsOn, [red]);
});

test('a floating resistor does not disturb the circuit', () => {
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

// The demo circuit: the button is on the ground side, so releasing it leaves
// the LED's cathode connected to nothing.
test('an LED whose return path is broken by a released button just reports an open circuit', () => {
  const bat = battery();
  const res = comp('resistor', [h(1, 'tp'), h(6, 'a')]);
  const led = comp('led', [h(11, 'a'), h(6, 'a')]);
  const btn = comp('button', [h(11, 'a'), h(1, 'tn')], { pressed: false });
  const r = Sim.analyze([bat, res, led, btn], []);

  assert.equal(r.ledsOn.length, 0);
  assert.ok(hasLine(r, 'Circuit open'), texts(r).join(' | '));
  assert.ok(!hasLine(r, 'current too low'), texts(r).join(' | '));
});

test('batteries wired straight together are unsolvable, not a crash', () => {
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

// ── The prompt's recipe builds, issue #10 ─────────────────────
// test/fixtures/recipes.js holds the example builds the system prompt
// copies (C = 2), as AI actions. Run through the solver with the defaults
// (9 V, 470R, red LED Vf 2.0 V, R_ON 0.1 ohm).

const Recipes = require('./fixtures/recipes.js');

function simulate(actions) {
  const { components, wires } = Recipes.toCircuit(actions);
  return { components, r: Sim.analyze(components, wires), graph: Sim.buildGraph(components, wires) };
}
const ledIdx = comps => comps.map((c, i) => c.type === 'led' ? i : -1).filter(i => i >= 0);

// I = (9 - 2) / (470 + 0.1) = 14.890 mA
test('one-LED recipe: the LED lights at (9-2)/470 (#10)', () => {
  const { components, r } = simulate(Recipes.ONE_LED);
  const [led] = ledIdx(components);

  assert.equal(r.status, 'ok');
  assert.equal(r.ledsOn.length, 1, texts(r).join(' | '));
  assert.ok(Math.abs(mA(ledI(r, led)) - 14.89) < 0.05, `got ${mA(ledI(r, led))}`);
});

// Both LEDs across columns 6 and 8: 14.89 mA through the resistor, split
// (9 - 2) / (470 + 0.05) / 2 = 7.446 mA each.
test('parallel recipe: both LEDs lit, sharing both nodes and the current (#10)', () => {
  const { components, r, graph } = simulate(Recipes.PARALLEL_2);
  const [a, b] = ledIdx(components);

  assert.equal(graph[a].nodes[1], graph[b].nodes[1], 'the anodes share a node');
  assert.equal(graph[a].nodes[0], graph[b].nodes[0], 'the cathodes share a node');
  assert.equal(r.status, 'ok');
  assert.equal(r.ledsOn.length, 2, texts(r).join(' | '));
  assert.ok(Math.abs(mA(ledI(r, a)) - 7.45) < 0.2, `LED1 ${mA(ledI(r, a))}`);
  assert.ok(Math.abs(mA(ledI(r, b)) - 7.45) < 0.2, `LED2 ${mA(ledI(r, b))}`);
});

// A chain: I = (9 - 2 - 2) / (470 + 0.2) = 10.634 mA through both LEDs.
test('series recipe: both LEDs lit with equal current (9-4)/470 (#10)', () => {
  const { components, r, graph } = simulate(Recipes.SERIES_2);
  const [a, b] = ledIdx(components);

  assert.equal(graph[a].nodes[0], graph[b].nodes[1], "LED1's cathode is LED2's anode");
  assert.equal(r.status, 'ok');
  assert.equal(r.ledsOn.length, 2, texts(r).join(' | '));
  assert.ok(Math.abs(mA(ledI(r, a)) - mA(ledI(r, b))) < 1e-6, `LED1 ${mA(ledI(r, a))}, LED2 ${mA(ledI(r, b))}`);
  assert.ok(Math.abs(mA(ledI(r, a)) - 10.63) < 0.05, `got ${mA(ledI(r, a))}`);
});

// ── Voltage at any hole, issue #4 ─────────────────────────────
// analyze() returns voltageAt({ col, row }): volts relative to the first
// battery's −, or null when the hole's node is floating or nothing was
// solved. Built on the series 9V - 470R - LED layout above: the anode sits
// at column 10 top, about Vf = 2.0 V above ground.

function seriesLedCircuit(extraWires) {
  const components = [
    battery(),
    comp('resistor', [h(5, 'a'), h(10, 'a')]),
    comp('led',      [h(15, 'a'), h(10, 'a')]), // pin0 cathode, pin1 anode
  ];
  const wires = [wire(h(2, 'tp'), h(5, 'a')), wire(h(15, 'a'), h(2, 'tn'))].concat(extraWires || []);
  return { components, wires };
}

// Reads a hole's voltage, failing on an assertion (not a TypeError) while
// voltageAt does not exist yet.
function vAt(r, hole) {
  assert.equal(typeof r.voltageAt, 'function', 'analyze() should return voltageAt(hole)');
  return r.voltageAt(hole);
}

const nearV = (got, want, why) =>
  assert.ok(typeof got === 'number' && Math.abs(got - want) < 1e-3, `${why}: expected ${want} V, got ${got}`);

test('an empty hole in the LED anode column reads the anode voltage (#4)', () => {
  const { components, wires } = seriesLedCircuit();
  const r = Sim.analyze(components, wires);
  const anode = r.nodeVoltages[Sim.buildGraph(components, wires)[2].nodes[1]];

  assert.ok(anode > 1.5 && anode < 2.5, `anode should sit near Vf, got ${anode}`);
  nearV(vAt(r, h(10, 'e')), anode, 'h(10, e)');
  nearV(vAt(r, h(10, 'a')), anode, 'the anode hole itself');
});

test('holes on the + rail, or wired only to it, read 9 V; the − rail reads 0 V (#4)', () => {
  const { components, wires } = seriesLedCircuit([wire(h(30, 'tp'), h(30, 'a'))]);
  const r = Sim.analyze(components, wires);

  nearV(vAt(r, h(30, 'c')),  9, 'column 30, wired only to the + rail');
  nearV(vAt(r, h(40, 'tp')), 9, 'an empty + rail hole');
  nearV(vAt(r, h(40, 'tn')), 0, 'an empty − rail hole');
  nearV(vAt(r, h(5, 'd')),   9, 'the resistor top column, wired to +');
});

test('an empty column, the other half of a used column and an unwired rail read null (#4)', () => {
  const { components, wires } = seriesLedCircuit();
  const r = Sim.analyze(components, wires);

  assert.strictEqual(vAt(r, h(25, 'c')),  null, 'empty column 25');
  assert.strictEqual(vAt(r, h(10, 'g')),  null, 'bottom half of column 10, across the channel');
  assert.strictEqual(vAt(r, h(12, 'bp')), null, 'bottom rail, wired to nothing');
});

test('a column wired only to another floating column reads null (#4)', () => {
  const { components, wires } = seriesLedCircuit([wire(h(30, 'a'), h(35, 'a'))]);
  const r = Sim.analyze(components, wires);

  assert.strictEqual(vAt(r, h(30, 'c')), null, 'column 30');
  assert.strictEqual(vAt(r, h(35, 'e')), null, 'column 35');
});

test('voltageAt exists and returns null when analyze returns early (#4)', () => {
  const early = {
    empty:       Sim.analyze([], []),
    'no-battery': Sim.analyze([comp('resistor', [h(5, 'a'), h(10, 'a')])], []),
    'wire short': Sim.analyze([battery()], [wire(h(4, 'tp'), h(4, 'tn'))]),
    unsolvable:  Sim.analyze([battery(), comp('battery', [h(9, 'tp'), h(9, 'tn')], { values: { voltage: 6 } })], []),
  };
  for (const [name, r] of Object.entries(early)) {
    assert.strictEqual(vAt(r, h(5, 'a')),  null, `${name}: h(5, a)`);
    assert.strictEqual(vAt(r, h(1, 'tp')), null, `${name}: h(1, tp)`);
  }
});

test('analyze keeps its existing result fields and adds voltageAt (#4)', () => {
  const { components, wires } = seriesLedCircuit();
  const r = Sim.analyze(components, wires);

  assert.deepEqual(Object.keys(r).sort(),
    ['buzzersOn', 'currents', 'ledsOn', 'lines', 'nodeVoltages', 'shorted', 'status', 'voltageAt']);
  assert.equal(r.status, 'ok');
  assert.equal(r.ledsOn.length, 1);
  assert.equal(r.shorted, false);
});

// ── Parts not connected to the solved circuit read null (#4 review) ──
// The solver leaks every node to ground through GMIN, so a floating part's
// nodes come out near 0 V (or ±4.5 V for a lone battery). voltageAt must
// report those as floating, not as a real reading.

test('a resistor not connected to the battery reads null, the main circuit is unchanged (#4)', () => {
  const { components, wires } = seriesLedCircuit();
  components.push(comp('resistor', [h(20, 'a'), h(25, 'a')]));
  const r = Sim.analyze(components, wires);
  const anode = r.nodeVoltages[Sim.buildGraph(components, wires)[2].nodes[1]];

  assert.strictEqual(vAt(r, h(20, 'c')), null, 'column 20, one end of the loose resistor');
  assert.strictEqual(vAt(r, h(25, 'c')), null, 'column 25, the other end');
  assert.ok(anode > 1.5 && anode < 2.5, `anode should sit near Vf, got ${anode}`);
  nearV(vAt(r, h(10, 'e')), anode, 'the LED anode column');
  nearV(vAt(r, h(5, 'd')),  9,     'the resistor top column, wired to +');
});

test('an LED whose leads sit in unwired columns reads null (#4)', () => {
  const { components, wires } = seriesLedCircuit();
  components.push(comp('led', [h(35, 'a'), h(30, 'a')])); // pin0 cathode, pin1 anode
  const r = Sim.analyze(components, wires);

  assert.strictEqual(vAt(r, h(30, 'c')), null, 'column 30, the loose LED anode');
  assert.strictEqual(vAt(r, h(35, 'c')), null, 'column 35, the loose LED cathode');
  nearV(vAt(r, h(5, 'd')), 9, 'the main circuit still reads');
});

test('a second battery wired to nothing reads null, not ±4.5 V (#4)', () => {
  const { components, wires } = seriesLedCircuit();
  components.push(comp('battery', [h(40, 'a'), h(45, 'a')])); // pin0 +, pin1 −
  const r = Sim.analyze(components, wires);

  assert.equal(r.status, 'ok');
  assert.strictEqual(vAt(r, h(40, 'c')), null, 'column 40, the loose battery +');
  assert.strictEqual(vAt(r, h(45, 'c')), null, 'column 45, the loose battery −');
  nearV(vAt(r, h(5, 'd')), 9, 'the main circuit still reads');
});

test('the column behind a released button reads null, and 9 V once pressed (#4)', () => {
  const build = pressed => {
    const { components, wires } = seriesLedCircuit();
    components.push(comp('button', [h(5, 'b'), h(40, 'b')], { pressed })); // col 5 sits at 9 V
    return Sim.analyze(components, wires);
  };

  assert.strictEqual(vAt(build(false), h(40, 'd')), null, 'column 40, behind the open button');
  nearV(vAt(build(true), h(40, 'd')), 9, 'column 40, through the pressed button');
});

test('a second battery in series is reached through the first and reads 18 V (#4)', () => {
  const { components, wires } = seriesLedCircuit();
  components.push(comp('battery', [h(20, 'a'), h(3, 'tp')])); // + on column 20, − on the + rail
  const r = Sim.analyze(components, wires);

  nearV(vAt(r, h(20, 'c')), 18, 'column 20, the top of the stacked battery');
  nearV(vAt(r, h(5, 'd')),   9, 'the + rail column');
});

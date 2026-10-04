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

// How many LEDs the results panel says are lit. analyze() no longer returns
// ledsOn / buzzersOn (#26): the page reads parts[label].m, and a lit LED
// has its "💡 LED ON" line.
const litLEDs = r => texts(r).filter(t => t.startsWith('  💡 LED ON')).length;


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
  assert.equal(litLEDs(r), 1);
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
  assert.equal(litLEDs(r), 2);
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

  assert.equal(litLEDs(r), 0);
  assert.ok(hasLine(r, 'backwards'), texts(r).join(' | '));
});

// ── Shorts ────────────────────────────────────────────────────

test('LED across the battery with no resistor is reported as a short', () => {
  const bat = battery();
  const led = comp('led', [h(1, 'tn'), h(1, 'tp')]); // cathode on -, anode on +
  const r = Sim.analyze([bat, led], []);

  assert.equal(r.shorted, true);
  assert.equal(litLEDs(r), 0);
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
  assert.equal(litLEDs(r), 0);
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
  const red   = comp('led', [h(1, 'tn'), h(10, 'a')], { label: 'LED1' });
  const green = comp('led', [h(3, 'tn'), h(10, 'a')],
    { label: 'LED2', values: { color: 'green', forwardVoltage: 2.2, thresholdCurrent: 0.001, maxCurrent: 0.020 } });
  const r = Sim.analyze([bat, res, red, green], [wire(h(2, 'tp'), h(5, 'a'))]);

  // Was r.ledsOn === [red]; ledsOn is gone (#26), so read parts[label].m.
  assert.deepEqual(Object.keys(r.parts).filter(l => r.parts[l].m.on), ['LED1']);
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
    const btn = comp('button', [h(3, 'a'), h(6, 'a')], { controls: { pressed } });
    const res = comp('resistor', [h(6, 'a'), h(10, 'a')]);
    const led = comp('led', [h(15, 'a'), h(10, 'a')]);
    const wires = [wire(h(2, 'tp'), h(3, 'a')), wire(h(15, 'a'), h(2, 'tn'))];
    return Sim.analyze([bat, btn, res, led], wires);
  };
  assert.equal(litLEDs(build(false)), 0);
  assert.equal(litLEDs(build(true)), 1);
});

// The demo circuit: the button is on the ground side, so releasing it leaves
// the LED's cathode connected to nothing.
test('an LED whose return path is broken by a released button just reports an open circuit', () => {
  const bat = battery();
  const res = comp('resistor', [h(1, 'tp'), h(6, 'a')]);
  const led = comp('led', [h(11, 'a'), h(6, 'a')]);
  const btn = comp('button', [h(11, 'a'), h(1, 'tn')], { controls: { pressed: false } });
  const r = Sim.analyze([bat, res, led, btn], []);

  assert.equal(litLEDs(r), 0);
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
  assert.equal(noBat.status, 'no-source', "#26: 'no-source' replaces 'no-battery'");
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
  assert.equal(litLEDs(r), 1, texts(r).join(' | '));
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
  assert.equal(litLEDs(r), 2, texts(r).join(' | '));
  assert.ok(Math.abs(mA(ledI(r, a)) - 7.45) < 0.2, `LED1 ${mA(ledI(r, a))}`);
  assert.ok(Math.abs(mA(ledI(r, b)) - 7.45) < 0.2, `LED2 ${mA(ledI(r, b))}`);
});

// A chain: I = (9 - 2 - 2) / (470 + 0.2) = 10.634 mA through both LEDs.
test('series recipe: both LEDs lit with equal current (9-4)/470 (#10)', () => {
  const { components, r, graph } = simulate(Recipes.SERIES_2);
  const [a, b] = ledIdx(components);

  assert.equal(graph[a].nodes[0], graph[b].nodes[1], "LED1's cathode is LED2's anode");
  assert.equal(r.status, 'ok');
  assert.equal(litLEDs(r), 2, texts(r).join(' | '));
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
    'no-source':  Sim.analyze([comp('resistor', [h(5, 'a'), h(10, 'a')])], []),
    'wire short': Sim.analyze([battery()], [wire(h(4, 'tp'), h(4, 'tn'))]),
    unsolvable:  Sim.analyze([battery(), comp('battery', [h(9, 'tp'), h(9, 'tn')], { values: { voltage: 6 } })], []),
  };
  for (const [name, r] of Object.entries(early)) {
    assert.strictEqual(vAt(r, h(5, 'a')),  null, `${name}: h(5, a)`);
    assert.strictEqual(vAt(r, h(1, 'tp')), null, `${name}: h(1, tp)`);
  }
});

test('analyze keeps its result fields, adds voltageAt (#4) and parts (#23), and drops ledsOn / buzzersOn (#26)', () => {
  const { components, wires } = seriesLedCircuit();
  const r = Sim.analyze(components, wires);

  assert.deepEqual(Object.keys(r).sort(),
    ['currents', 'lines', 'nodeVoltages', 'parts', 'shorted', 'status', 'voltageAt']);
  assert.equal(r.status, 'ok');
  assert.equal(litLEDs(r), 1);
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

// #26 (contract `ref` row, decision 4): a lone battery is a connected circuit
// with a source (its V joins + and −), so it gets its own ground at its −
// pin. It reads 9 V / 0 V from that ground, never ±4.5 V (the GMIN float) or
// a value tied to BAT1's circuit.
test('a second battery wired to nothing reads 9 V / 0 V from its own ground, not ±4.5 V (#4, #26)', () => {
  const { components, wires } = seriesLedCircuit();
  components.push(comp('battery', [h(40, 'a'), h(45, 'a')])); // pin0 +, pin1 −
  const r = Sim.analyze(components, wires);

  assert.equal(r.status, 'ok');
  nearV(vAt(r, h(40, 'c')), 9, 'column 40, the loose battery +, from its own ground');
  nearV(vAt(r, h(45, 'c')), 0, 'column 45, the loose battery −, its own ground');
  nearV(vAt(r, h(5, 'd')), 9, 'the main circuit still reads');
  nearV(vAt(r, h(40, 'tn')), 0, 'the main circuit keeps its own ground');
});

test('the column behind a released button reads null, and 9 V once pressed (#4)', () => {
  const build = pressed => {
    const { components, wires } = seriesLedCircuit();
    components.push(comp('button', [h(5, 'b'), h(40, 'b')], { controls: { pressed } })); // col 5 sits at 9 V
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

// ── Simulation summary for the AI, issue #5 ───────────────────
// simulationSummary(components, wires, labelOf) runs analyze() and returns
// markdown lines (strings) the AI reads under "## Simulation": the status,
// each part's pin voltages, each part's current, LEDs lit or dark, buzzers
// on or off, and the analysis messages. Voltages to 2 decimals, currents to
// 0.1 mA. Board pins are named by hole exactly as the app writes them
// (col is 0-based, so h(10, 'a') is "a11" and h(1, 'tp') is "tp_2"); the
// off-board battery's pins use the label form BAT1.0 / BAT1.1.

// App.componentId in miniature: the label, else "<type>_<n>" per type.
const labelOf = (comps, c) => c.label || `${c.type}_${comps.filter(x => x.type === c.type).indexOf(c)}`;

// Fails on an assertion (not a TypeError) while simulationSummary is missing.
function summary(components, wires) {
  assert.equal(typeof Sim.simulationSummary, 'function', 'simulate.js should export simulationSummary');
  const lines = Sim.simulationSummary(components, wires || [], labelOf);
  assert.ok(Array.isArray(lines), `simulationSummary should return an array of lines, got ${typeof lines}`);
  lines.forEach(l => assert.equal(typeof l, 'string', `every line should be a string, got ${JSON.stringify(l)}`));
  return lines;
}

const show = lines => '\n' + lines.join('\n');
const lineWith = (lines, re) => lines.find(l => re.test(l));
function assertLine(lines, re, why) {
  assert.ok(lineWith(lines, re), `${why}: no line matches ${re}${show(lines)}`);
}

// The real board: the battery is off-board (holeRefs null) and wired from
// its pins to the rails, as App.placeBattery + finishWire leave it.
function offBoardBattery(label, values) {
  return Object.assign({ type: 'battery', label, pins: pins(2), holeRefs: null }, values ? { values } : {});
}
function batWire(bat, k, hole) { return { startComp: bat, startPinIdx: k, endHole: hole }; }

// The line-44 series circuit with labels: 9 V - 470R - red LED.
// R1 a6-a11, LED1 cathode a16, anode a11. I = (9 - 2) / 470 = 14.9 mA.
function labelledSeries(opts) {
  const bat = offBoardBattery(opts && opts.unlabelled ? undefined : 'BAT1');
  if (opts && opts.unlabelled) delete bat.label;
  const components = [
    bat,
    comp('resistor', [h(5, 'a'),  h(10, 'a')], { label: 'R1' }),
    comp('led',      [h(15, 'a'), h(10, 'a')], { label: 'LED1' }), // pin0 cathode, pin1 anode
  ];
  const wires = [
    batWire(bat, 0, h(1, 'tp')), batWire(bat, 1, h(1, 'tn')),
    wire(h(2, 'tp'), h(5, 'a')), wire(h(15, 'a'), h(2, 'tn')),
  ];
  return { components, wires };
}

test('summary of the series circuit: LED1 ON at 14.9 mA, anode about 2.0 V (#5)', () => {
  const { components, wires } = labelledSeries();
  const lines = summary(components, wires);

  assertLine(lines, /\bLED1\b.*(\bON\b|\blit\b)/, 'LED1 should be reported ON');
  assertLine(lines, /\bLED1\b.*\b14\.9 mA\b/, 'LED1 current');
  assertLine(lines, /\bR1\b.*\b14\.9 mA\b/, 'R1 current');
  assertLine(lines, /LED1 pin 1 \(a11\b[^)]*\): 2\.0\d V/, 'LED1 anode voltage on a11');
  assertLine(lines, /LED1 pin 0 \(a16\b[^)]*\): 0\.00 V/, 'LED1 cathode voltage on a16');
  assertLine(lines, /R1 pin 0 \(a6\b[^)]*\): 9\.00 V/, 'R1 top voltage on a6');
  assertLine(lines, /\bBAT1\.0\b.*\b9\.00 V/, 'battery + pin in label form');
  assertLine(lines, /\bBAT1\.1\b.*\b0\.00 V/, 'battery − pin in label form');
  assert.ok(!/-\s*14\.9 mA/.test(lines.join('\n')), `LED current should be positive${show(lines)}`);
});

test('summary of an empty board is one line saying so (#5)', () => {
  const lines = summary([], []);
  assert.equal(lines.length, 1, `expected one line${show(lines)}`);
  assert.match(lines[0], /empty|no components|nothing on the board|no parts/i);
});

test('summary of a board with no battery is one line: No battery on the board. (#5)', () => {
  const lines = summary([comp('resistor', [h(5, 'a'), h(10, 'a')], { label: 'R1' })], []);
  assert.equal(lines.length, 1, `expected one line${show(lines)}`);
  assert.match(lines[0], /No battery on the board\./);
});

test('summary of an unsolvable circuit says so and reports no pin readings (#5)', () => {
  const a = comp('battery', [h(1, 'tp'), h(1, 'tn')], { label: 'BAT1' });
  const b = comp('battery', [h(9, 'tp'), h(9, 'tn')], { label: 'BAT2', values: { voltage: 6 } });
  const lines = summary([a, b], []);

  assertLine(lines, /unsolvable|cannot be solved|can't be solved|could not be solved/i, 'unsolvable');
  assert.ok(!lineWith(lines, /pin \d.*:\s*(-?\d+\.\d+ V|floating)/i), `nothing was solved, so no pin readings${show(lines)}`);
});

test('summary rounds voltages to 2 decimals and currents to 0.1 mA (#5)', () => {
  const { components, wires } = labelledSeries();
  const lines = summary(components, wires);
  const text = lines.join('\n');

  // Readings are "<number> V" / "<number> mA". analyze's own "Battery 1: 9V"
  // message has no space and is not a reading.
  const volts = [...text.matchAll(/(-?\d+(?:\.\d+)?) V\b/g)].map(m => m[1]);
  const amps  = [...text.matchAll(/(-?\d+(?:\.\d+)?) mA\b/g)].map(m => m[1]);
  assert.ok(volts.length >= 6, `expected a voltage per pin${show(lines)}`);
  assert.ok(amps.length >= 2, `expected a current per part${show(lines)}`);
  volts.forEach(v => assert.match(v, /^-?\d+\.\d{2}$/, `voltage ${v} should have 2 decimals${show(lines)}`));
  amps.forEach(i => assert.match(i, /^-?\d+\.\d$/, `current ${i} should have 1 decimal${show(lines)}`));
  assert.ok(!/\d\.\d{3,}/.test(text), `no long floats${show(lines)}`);
});

test('summary reports a loose resistor’s pins as floating, not 0 V (#5)', () => {
  const { components, wires } = labelledSeries();
  components.push(comp('resistor', [h(20, 'a'), h(25, 'a')], { label: 'R2' }));
  const lines = summary(components, wires);

  for (const re of [/R2 pin 0 \(a21\b/, /R2 pin 1 \(a26\b/]) {
    const line = lineWith(lines, re);
    assert.ok(line, `no line for ${re}${show(lines)}`);
    assert.match(line, /floating/i, `loose pin should read floating${show(lines)}`);
    assert.doesNotMatch(line, /\d+\.\d+ V/, `loose pin should not read a voltage${show(lines)}`);
  }
  assertLine(lines, /\bLED1\b.*\b14\.9 mA\b/, 'the main circuit is unchanged');
});

test('summary uses the button’s pressed state: released → LED dark, pressed → LED ON (#5)', () => {
  const build = pressed => {
    const bat = offBoardBattery('BAT1');
    const components = [
      bat,
      comp('button',   [h(3, 'a'),  h(6, 'a')],  { label: 'SW1', controls: { pressed } }),
      comp('resistor', [h(6, 'a'),  h(10, 'a')], { label: 'R1' }),
      comp('led',      [h(15, 'a'), h(10, 'a')], { label: 'LED1' }),
    ];
    const wires = [
      batWire(bat, 0, h(1, 'tp')), batWire(bat, 1, h(1, 'tn')),
      wire(h(2, 'tp'), h(3, 'a')), wire(h(15, 'a'), h(2, 'tn')),
    ];
    return summary(components, wires);
  };

  // A part's state lines: lines naming it that are not "pin k" readings.
  const stateOf = (lines, label) => lines.filter(l => new RegExp(`\\b${label}\\b`).test(l) && !/\bpin \d/.test(l));
  const isOn  = l => /\bON\b|\blit\b/.test(l) && !/not lit/.test(l);
  const isOff = l => /\bOFF\b|\bdark\b|not lit/i.test(l);

  const released = build(false);
  assert.ok(stateOf(released, 'SW1').some(l => /released|\bopen\b|not pressed/i.test(l)),
    `SW1 should read released/open${show(released)}`);
  assert.ok(stateOf(released, 'LED1').some(isOff), `LED1 should read dark/OFF with the button released${show(released)}`);
  assert.ok(!stateOf(released, 'LED1').some(isOn), `LED1 must not read ON with the button released${show(released)}`);

  const pressed = build(true);
  assert.ok(stateOf(pressed, 'SW1').some(l => /pressed|closed/i.test(l) && !/not pressed|released|\bopen\b/i.test(l)),
    `SW1 should read pressed/closed${show(pressed)}`);
  assert.ok(stateOf(pressed, 'LED1').some(isOn), `LED1 should read ON with the button pressed${show(pressed)}`);
  assert.ok(!/NaN|undefined|null/.test(pressed.join('\n')), `no NaN/null${show(pressed)}`);
  // #26: a pressed button is a closed SW (1 mΩ) and reports its real current.
  assertLine(pressed, /^- SW1: button pressed \(closed\), 14\.9 mA$/, 'a pressed button reports its current (#26)');
  assertLine(released, /^- SW1: button released \(open\), 0\.0 mA$/, 'a released button reports 0.0 mA');
});

test('summary carries the analysis messages: open circuit and short circuit (#5)', () => {
  const bat = offBoardBattery('BAT1');
  const open = summary([
    bat,
    comp('resistor', [h(5, 'a'),  h(10, 'a')], { label: 'R1' }),
    comp('led',      [h(15, 'a'), h(10, 'a')], { label: 'LED1' }),
  ], [batWire(bat, 0, h(1, 'tp')), batWire(bat, 1, h(1, 'tn'))]);
  assertLine(open, /Circuit open/i, 'open-circuit warning');

  const short = summary([
    comp('battery', [h(1, 'tp'), h(1, 'tn')], { label: 'BAT1' }),
    comp('led',     [h(1, 'tn'), h(1, 'tp')], { label: 'LED1' }),
  ], []);
  assertLine(short, /Short circuit/i, 'short-circuit warning');
});

test('summary never names a pin in the old _pin form, labelled or not (#5)', () => {
  for (const unlabelled of [false, true]) {
    const { components, wires } = labelledSeries({ unlabelled });
    const lines = summary(components, wires);
    assert.ok(lines.length > 1, `expected a full summary${show(lines)}`);
    assert.ok(!/_pin/.test(lines.join('\n')), `no "_pin" in the summary${show(lines)}`);
  }
});

test('summary is pure: same input, same lines, and the parts are not changed (#5)', () => {
  const { components, wires } = labelledSeries();
  const before = JSON.stringify(components.map(c => ({ ...c, pins: c.pins.length })));
  const first  = summary(components, wires);
  const second = summary(components, wires);
  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(components.map(c => ({ ...c, pins: c.pins.length }))), before);
});

// ── No absurd currents when shorted, issue #20 ───────────────────
//  A short solves to tens of amps (70000.0 mA), which is not a reading the
//  AI should see. When shorted, the summary keeps the status, each part's
//  state and the short-circuit message, but drops every per-part current.
//  Pin voltages may stay.

// Every "<n> mA" reading in the summary, as numbers.
const readingsMA = lines => [...lines.join('\n').matchAll(/(-?\d+(?:\.\d+)?) mA\b/g)].map(m => +m[1]);
function assertNoAbsurdCurrent(lines) {
  readingsMA(lines).forEach(n =>
    assert.ok(Math.abs(n) <= 1000, `a ${n} mA reading is not a real current; drop currents when shorted${show(lines)}`));
}

// The real board's battery, wired to the rails at column 2 (tp_2 / tn_2).
function wiredBattery() {
  const bat = offBoardBattery('BAT1');
  return { bat, wires: [batWire(bat, 0, h(1, 'tp')), batWire(bat, 1, h(1, 'tn'))] };
}

test('shorted by a wire straight across the battery: "short circuit", no reading above 1000 mA (#20)', () => {
  const { bat, wires } = wiredBattery();
  const lines = summary([bat], wires.concat([wire(h(4, 'tp'), h(4, 'tn'))]));

  assertLine(lines, /short circuit/i, 'short-circuit status or message');
  assertNoAbsurdCurrent(lines);
});

test('an LED straight across the battery: "short circuit", no reading above 1000 mA (#20)', () => {
  const { bat, wires } = wiredBattery();
  const led = comp('led', [h(3, 'a'), h(1, 'a')], { label: 'LED1' }); // cathode a4, anode a2
  const lines = summary([bat, led], wires.concat([wire(h(2, 'tp'), h(1, 'a')), wire(h(3, 'a'), h(2, 'tn'))]));

  assertLine(lines, /^Status: short circuit\b/i, 'status line');
  assertLine(lines, /Short circuit\. The LED sits straight across the battery/, 'short-circuit message');
  assertNoAbsurdCurrent(lines);
});

// #26: with no readings, each part's line is `- <label>: <lower-case name>`
// (the part's report needs readings), so "- LED1: led" and "- BAT1: battery".
test('when shorted, each part still has its state line, just without a current (#20, #26)', () => {
  const { bat, wires } = wiredBattery();
  const led = comp('led', [h(3, 'a'), h(1, 'a')], { label: 'LED1' });
  const lines = summary([bat, led], wires.concat([wire(h(2, 'tp'), h(1, 'a')), wire(h(3, 'a'), h(2, 'tn'))]));
  const nameOf = type => {
    const d = Parts().get(type);
    assert.ok(d, `Parts.get('${type}') is null`);
    return d.name.toLowerCase();
  };

  assertLine(lines, new RegExp(`^- LED1: ${nameOf('led')}$`), 'LED1 state line');
  assertLine(lines, new RegExp(`^- BAT1: ${nameOf('battery')}$`), 'BAT1 state line');
  for (const label of ['LED1', 'BAT1']) {
    const state = lines.filter(l => new RegExp(`\\b${label}:`).test(l));
    state.forEach(l => assert.doesNotMatch(l, /\d mA\b/, `${label}'s state line should carry no current when shorted${show(lines)}`));
  }
  assertLine(lines, /LED1 pin 1 \(a2\b[^)]*\): \d+\.\d\d V/, 'pin voltages may stay');
});

test('not shorted, the series summary still gives each part its current (#20 guard)', () => {
  const { components, wires } = labelledSeries();
  const lines = summary(components, wires);
  assertLine(lines, /^Status: solved\b/, 'status line');
  assertLine(lines, /- LED1: LED ON \(lit\), 14\.9 mA$/, 'LED1 current');
  assertLine(lines, /- R1: 470 ohm resistor, 14\.9 mA$/, 'R1 current');
  assertLine(lines, /- BAT1: 9\.00 V battery, supplying 14\.9 mA$/, 'BAT1 current');
});

// ── Registry parts in the simulator, issue #23 ───────────────────
//  The resistor is the first registry part: the simulator stamps its
//  elements() (one R, ohms = resistance) instead of the old per-type code,
//  and analyze() adds parts: { [label]: { r: PartResult, m, warnings } } for
//  registry parts. Every test above runs unchanged on the registry resistor.
//
//  Keying: parts is keyed by comp.label. A registry part with no label is
//  simulated as usual but left out of parts (never an "undefined" key).
//  The LED joins in issue #25, and the battery, buzzer and button in #26
//  (tests at the end of this file), so every labelled part is in parts.

const Parts = () => require('../circuit3d/js/parts');
const partsOf = r => {
  assert.ok(r.parts && typeof r.parts === 'object' && !Array.isArray(r.parts),
    `analyze() should return parts as an object keyed by label; got ${JSON.stringify(r.parts)}`);
  return r.parts;
};

test('the series circuit on the registry resistor: LED ON 14.9 mA, parts.R1 reads 14.9 mA with no warnings (#23)', () => {
  const { components, wires } = labelledSeries();
  const r = Sim.analyze(components, wires);

  assert.equal(r.status, 'ok');
  assert.ok(hasLine(r, 'LED ON  (14.9 mA)'), texts(r).join(' | '));
  assert.ok(Math.abs(mA(r.currents[1]) - 14.894) < 0.01, `currents[] stays in amps: ${r.currents[1]}`);

  const R1 = partsOf(r).R1;
  assert.ok(R1, `parts should have R1; got ${JSON.stringify(Object.keys(r.parts))}`);
  assert.ok(Math.abs(R1.m.current - 14.894) < 0.01, `parts.R1.m.current: ${R1.m.current}`);
  assert.deepStrictEqual(R1.warnings, []);
});

test('parts.R1.r is the PartResult: label, values, pin volts by name, element current in mA (#23)', () => {
  const { components, wires } = labelledSeries();
  const { r } = partsOf(Sim.analyze(components, wires)).R1 || {};
  assert.ok(r, 'parts.R1.r');
  const [top, bottom] = Parts().get('resistor').pins;

  assert.equal(r.label, 'R1');
  assert.equal(r.values.resistance, 470);
  nearV(r.pins[top], 9, `R1.${top} (a6, wired to +)`);
  assert.ok(Math.abs(r.pins[bottom] - 2.0) < 0.01, `R1.${bottom} (a11, the LED anode): ${r.pins[bottom]}`);
  const I = Object.values(r.current);
  assert.equal(I.length, 1, `one element current; got ${JSON.stringify(r.current)}`);
  assert.ok(Math.abs(I[0] - 14.894) < 0.01, `+ from pin 0 to pin 1, in mA: ${I[0]}`);
});

test("a registry resistor's own value is what the simulator stamps: 1 kΩ gives (9-2)/1000 = 7.0 mA (#23)", () => {
  const { components, wires } = labelledSeries();
  components[1].values = { resistance: 1000 };
  const r = Sim.analyze(components, wires);

  assert.ok(hasLine(r, 'LED ON  (7.0 mA)'), texts(r).join(' | '));
  const R1 = partsOf(r).R1;
  assert.ok(R1, 'parts.R1');
  assert.equal(R1.r.values.resistance, 1000);
  assert.ok(Math.abs(R1.m.current - 6.999) < 0.01, `parts.R1.m.current: ${R1.m.current}`);
});

test('parts holds registry parts only, each under its label (#23)', () => {
  const { components, wires } = labelledSeries();
  components.push(comp('resistor', [h(20, 'a'), h(25, 'a')], { label: 'R2' }));
  const parts = partsOf(Sim.analyze(components, wires));

  assert.ok(parts.R1 && parts.R2, `R1 and R2; got ${JSON.stringify(Object.keys(parts))}`);
  for (const label of Object.keys(parts)) {
    const c = components.find(x => x.label === label);
    assert.ok(c, `parts.${label} names no component`);
    assert.ok(Parts().get(c.type), `parts.${label} is a ${c.type}, which is not a registry part`);
  }
});

test('a loose registry resistor: floating pins read null, no current (#23)', () => {
  const { components, wires } = labelledSeries();
  components.push(comp('resistor', [h(20, 'a'), h(25, 'a')], { label: 'R2' }));
  const R2 = partsOf(Sim.analyze(components, wires)).R2;
  assert.ok(R2, 'parts.R2');

  assert.deepStrictEqual(Object.values(R2.r.pins), [null, null], `floating pins: ${JSON.stringify(R2.r.pins)}`);
  assert.ok(Math.abs(R2.m.current) < 0.001, `no current: ${R2.m.current}`);
  assert.ok(Math.abs(partsOf(Sim.analyze(components, wires)).R1.m.current - 14.894) < 0.01, 'R1 unchanged');
});

test('an unlabelled registry part simulates but gets no "undefined" key in parts (#23)', () => {
  const { components, wires } = seriesLedCircuit();   // no labels
  const r = Sim.analyze(components, wires);
  assert.equal(litLEDs(r), 1);
  assert.ok(!Object.keys(partsOf(r)).includes('undefined'), JSON.stringify(Object.keys(r.parts)));
});

test('parts is {} when analyze returns before solving (#23)', () => {
  const R1 = () => comp('resistor', [h(5, 'a'), h(10, 'a')], { label: 'R1' });
  const early = {
    empty:        Sim.analyze([], []),
    'no-source':  Sim.analyze([R1()], []),
    'wire short': Sim.analyze([battery(), R1()], [wire(h(4, 'tp'), h(4, 'tn'))]),
    unsolvable:   Sim.analyze([battery(), comp('battery', [h(9, 'tp'), h(9, 'tn')], { values: { voltage: 6 } }), R1()], []),
  };
  for (const [name, r] of Object.entries(early)) {
    assert.deepStrictEqual(r.parts, {}, `${name}: parts`);
  }
});

// simulate.js loads the parts registry itself under Node (as it loads
// ids.js), so the server and any test that requires only simulate.js see
// the registry resistor. Checked in a fresh Node process.
test('under Node, requiring simulate.js alone is enough for registry parts (#23)', () => {
  const { execFileSync } = require('node:child_process');
  const code = `
    const Sim = require('./circuit3d/js/simulate.js');
    const bat = { type: 'battery', label: 'BAT1', pins: [{}, {}], holeRefs: [{ col: 1, row: 'tp' }, { col: 1, row: 'tn' }] };
    const res = { type: 'resistor', label: 'R1', pins: [{}, {}], holeRefs: [{ col: 5, row: 'a' }, { col: 9, row: 'a' }] };
    const w = (a, b) => ({ startHole: a, endHole: b });
    const r = Sim.analyze([bat, res], [w({ col: 2, row: 'tp' }, { col: 5, row: 'b' }), w({ col: 9, row: 'b' }, { col: 2, row: 'tn' })]);
    process.stdout.write(JSON.stringify(r.parts && r.parts.R1 ? r.parts.R1.m : null));`;
  const out = execFileSync(process.execPath, ['-e', code], { cwd: require('node:path').join(__dirname, '..') }).toString();
  const m = JSON.parse(out);
  assert.ok(m, 'require("simulate.js") alone gives no parts.R1: simulate.js must require ./parts under Node');
  assert.ok(Math.abs(m.current - 19.149) < 0.01, `9 V across 470 Ω: ${m.current}`);
});

// ── The LED in the registry, one generic mode loop, issue #25 ────────────
//  The LED is a registry part (parts/led.js) with one D element; the solver
//  stamps D blocks (off / on) and settles them with one generic loop. Every
//  LED number and message above is unchanged. The results panel's LED lines
//  now come from the part through one rule in simulate.js:
//    m.on === true      → '  💡 LED ON  (<mA>.toFixed(1) mA)'   sim-on
//    each warning       → '  ' + text; sim-err if m.on, else sim-warn
//    battery shorted through the LED's D (> 1 A): the LED's warnings replace
//    the generic short line, the first sim-err, the rest sim-info.
//  parts.LED1 = { r, m: { on, current }, warnings }, with r.modes[id]
//  'on' / 'off', r.current[id] in mA + anode → cathode, and r.open[id] the
//  volts across the D (anode − cathode) with every mode block off.
//  currents[i] keeps its sign (+ from pin 0 to pin 1, so a lit LED is < 0).

const BACKWARDS_LINE = '  LED is backwards. Current cannot flow from cathode to anode. Flip it around.';
const SHORT_LINES = [
  'Short circuit. The LED sits straight across the battery with no current-limiting resistor.',
  'Put a resistor in series: at least 350 ohm, so use a 470 ohm.',
];

function ledDef() {
  const def = Parts().get('led');
  assert.ok(def, "Parts.get('led') is null: parts/led.js must be registered (parts/index.js)");
  return def;
}
// The key the LED's D is reported under in r.current / r.modes / r.open.
function dId() {
  const els = ledDef().elements({ color: 'red', vf: 2.0, maxCurrent: 0.02, thresholdCurrent: 0.001 }, {});
  const k = els.findIndex(e => e.kind === 'D');
  assert.ok(k >= 0, 'the LED has a D element');
  return els[k].id !== undefined ? els[k].id : k;
}
function led1(r) {
  const p = partsOf(r).LED1;
  assert.ok(p, `analyze().parts should have LED1; got ${JSON.stringify(Object.keys(r.parts))}`);
  assert.ok(p.r && p.r.open && typeof p.r.open === 'object', `parts.LED1.r.open should hold the open-circuit volts per mode block; got ${JSON.stringify(p.r && p.r.open)}`);
  return p;
}
const plainLines = r => r.lines.map(l => ({ text: l.text, cls: l.cls }));

// The series circuit with one labelled LED of the given values.
function seriesWith(ledValues, ohms) {
  const { components, wires } = labelledSeries();
  if (ledValues) components[2].values = ledValues;
  if (ohms) components[1].values = { resistance: ohms };
  return { components, wires };
}

test('series: parts.LED1 is lit at 14.9 mA, D on, + anode → cathode, open 9 V, no warnings (#25)', () => {
  const { components, wires } = labelledSeries();
  const r = Sim.analyze(components, wires);
  const L = led1(r);
  const id = dId();

  assert.equal(L.m.on, true);
  assert.ok(Math.abs(L.m.current - 14.894) < 0.01, `m.current ${L.m.current}`);
  assert.equal(L.r.modes[id], 'on', `r.modes: ${JSON.stringify(L.r.modes)}`);
  assert.ok(Math.abs(L.r.current[id] - 14.894) < 0.01, `r.current is + anode → cathode, in mA: ${L.r.current[id]}`);
  nearV(L.r.open[id], 9, 'r.open: the LED alone would see the whole 9 V');
  assert.ok(Math.abs(L.r.pins.anode - 2.0) < 0.01, `anode ${L.r.pins.anode}`);
  nearV(L.r.pins.cathode, 0, 'cathode');
  assert.deepStrictEqual(L.warnings, []);
  assert.ok(Math.abs(r.currents[2] + 0.014894) < 1e-5, `currents[] keeps its sign: a lit LED is negative, got ${r.currents[2]}`);
  assert.equal(litLEDs(r), 1, 'one lit LED');
  assert.deepStrictEqual(plainLines(r), [
    { text: 'Battery 1: 9V', cls: 'sim-info' },
    { text: '  💡 LED ON  (14.9 mA)', cls: 'sim-on' },
  ]);
});

// Today's numbers, 9 V through 470 Ω, from components.js LED_TYPES.
const TODAY_MA = { red: 14.8904, yellow: 14.6777, green: 14.4650, blue: 12.3378, white: 11.9124 };
const TODAY_VF = { red: 2.0, yellow: 2.1, green: 2.2, blue: 3.2, white: 3.4 };

test("each colour lights at today's current, from a record that saves only its colour (#25)", () => {
  for (const [color, want] of Object.entries(TODAY_MA)) {
    const { components, wires } = seriesWith({ color });
    const r = Sim.analyze(components, wires);
    const got = mA(ledI(r, 2));
    assert.ok(Math.abs(got - want) < 0.01, `${color}: expected ${want} mA, got ${got}; ${texts(r).join(' | ')}`);
    assert.ok(hasLine(r, `LED ON  (${want.toFixed(1)} mA)`), `${color}: ${texts(r).join(' | ')}`);
    const L = led1(r);
    assert.equal(L.r.values.color, color);
    assert.equal(L.r.values.vf, TODAY_VF[color], `${color}: r.values.vf`);
    assert.ok(Math.abs(L.m.current - want) < 0.01, `${color}: m.current ${L.m.current}`);
  }
});

test('backwards: parts.LED1 is off with the backwards warning, one sim-warn line (#25)', () => {
  const bat = offBoardBattery('BAT1');
  const components = [
    bat,
    comp('resistor', [h(5, 'a'),  h(10, 'a')], { label: 'R1' }),
    comp('led',      [h(10, 'a'), h(15, 'a')], { label: 'LED1' }),   // cathode toward the resistor
  ];
  const wires = [batWire(bat, 0, h(1, 'tp')), batWire(bat, 1, h(1, 'tn')),
                 wire(h(2, 'tp'), h(5, 'a')), wire(h(15, 'a'), h(2, 'tn'))];
  const r = Sim.analyze(components, wires);
  const L = led1(r);

  assert.equal(L.m.on, false);
  assert.equal(L.r.modes[dId()], 'off');
  nearV(L.r.open[dId()], -9, 'r.open is anode − cathode: the anode is on ground, the cathode at 9 V');
  assert.deepStrictEqual(L.warnings, [BACKWARDS_LINE.trim()]);
  assert.equal(litLEDs(r), 0);
  assert.deepStrictEqual(plainLines(r), [
    { text: 'Battery 1: 9V', cls: 'sim-info' },
    { text: BACKWARDS_LINE, cls: 'sim-warn' },
  ]);
});

test('over-current: the ON line, then the rating line in sim-err, the same text in parts.LED1.warnings (#25)', () => {
  const { components, wires } = seriesWith(null, 150);
  const r = Sim.analyze(components, wires);
  const L = led1(r);
  const over = 'LED is over its 20 mA rating at 46.6 mA. Needs at least 350 ohm in series, so use 470 ohm.';

  assert.equal(L.m.on, true);
  assert.ok(Math.abs(L.m.current - 46.636) < 0.01, `m.current ${L.m.current}`);
  nearV(L.r.open[dId()], 9, 'r.open with every diode off');
  assert.deepStrictEqual(L.warnings, [over]);
  assert.deepStrictEqual(plainLines(r), [
    { text: 'Battery 1: 9V', cls: 'sim-info' },
    { text: '  💡 LED ON  (46.6 mA)', cls: 'sim-on' },
    { text: '  ' + over, cls: 'sim-err' },
  ]);
});

test("parallel LEDs over their rating: each LED's advice uses its own open voltage, 350 → 470 (#25)", () => {
  const bat  = comp('battery', [h(1, 'tp'), h(1, 'tn')], { label: 'BAT1' });   // #26: headlines name parts by label
  const res  = comp('resistor', [h(5, 'a'), h(10, 'a')], { label: 'R1', values: { resistance: 150 } });
  const a    = comp('led', [h(1, 'tn'), h(10, 'a')], { label: 'LED1' });
  const b    = comp('led', [h(3, 'tn'), h(10, 'a')], { label: 'LED2' });
  const r = Sim.analyze([bat, res, a, b], [wire(h(2, 'tp'), h(5, 'a'))]);
  const over = 'LED is over its 20 mA rating at 23.3 mA. Needs at least 350 ohm in series, so use 470 ohm.';

  for (const label of ['LED1', 'LED2']) {
    const L = partsOf(r)[label];
    assert.ok(L, `parts.${label}`);
    nearV(L.r.open[dId()], 9, `${label} r.open: every diode off, not the other LED pinning the node`);
    assert.deepStrictEqual(L.warnings, [over], label);
  }
  assert.deepStrictEqual(plainLines(r).slice(1), [
    { text: '  💡 LED ON  (23.3 mA)', cls: 'sim-on' },
    { text: '  ' + over, cls: 'sim-err' },
    { text: '  💡 LED ON  (23.3 mA)', cls: 'sim-on' },
    { text: '  ' + over, cls: 'sim-err' },
  ]);
});

test("short: the LED's two lines replace the generic one, sim-err then sim-info, from parts.LED1.warnings (#25)", () => {
  const bat = comp('battery', [h(1, 'tp'), h(1, 'tn')], { label: 'BAT1' });
  const led = comp('led', [h(1, 'tn'), h(1, 'tp')], { label: 'LED1' });   // cathode on −, anode on +
  const r = Sim.analyze([bat, led], []);

  assert.equal(r.shorted, true);
  assert.equal(litLEDs(r), 0);
  assert.deepStrictEqual(plainLines(r), [
    { text: 'Battery 1: 9V', cls: 'sim-info' },
    { text: '  ' + SHORT_LINES[0], cls: 'sim-err' },
    { text: '  ' + SHORT_LINES[1], cls: 'sim-info' },
  ]);
  assert.ok(!hasLine(r, 'no resistance in path'), 'not the generic wire-short line');
  assert.deepStrictEqual(led1(r).warnings, SHORT_LINES);
});

test('current too low: 10 kΩ holds the LED at 0.7 mA, not lit, "LED: current too low." in sim-warn (#25)', () => {
  const { components, wires } = seriesWith(null, 10000);
  const r = Sim.analyze(components, wires);
  const L = led1(r);

  assert.equal(L.m.on, false);
  assert.deepStrictEqual(L.warnings, ['LED: current too low.']);
  assert.equal(litLEDs(r), 0);
  assert.deepStrictEqual(plainLines(r), [
    { text: 'Battery 1: 9V', cls: 'sim-info' },
    { text: '  LED: current too low.', cls: 'sim-warn' },
    { text: '  No output components in circuit path.', cls: 'sim-info' },
  ]);
});

test('a backwards LED and a lit one: each its own line, in board order (#25)', () => {
  const bat = comp('battery', [h(1, 'tp'), h(1, 'tn')], { label: 'BAT1' });   // #26: "Battery 1" comes from the label
  const components = [
    bat,
    comp('resistor', [h(5, 'a'),  h(10, 'a')], { label: 'R1' }),
    comp('led',      [h(10, 'a'), h(15, 'a')], { label: 'LED1' }),   // backwards
    comp('led',      [h(20, 'a'), h(10, 'a')], { label: 'LED2' }),   // lit
  ];
  const wires = [wire(h(2, 'tp'), h(5, 'a')), wire(h(15, 'a'), h(2, 'tn')), wire(h(20, 'a'), h(2, 'tn'))];
  const r = Sim.analyze(components, wires);

  assert.deepStrictEqual(plainLines(r), [
    { text: 'Battery 1: 9V', cls: 'sim-info' },
    { text: BACKWARDS_LINE, cls: 'sim-warn' },
    { text: '  💡 LED ON  (14.9 mA)', cls: 'sim-on' },
  ]);
  const { LED1, LED2 } = partsOf(r);
  assert.ok(LED1 && LED2, `parts should have LED1 and LED2; got ${JSON.stringify(Object.keys(r.parts))}`);
  assert.equal(LED1.m.on, false, 'LED1 backwards');
  assert.equal(LED2.m.on, true, 'LED2 lit');
  assert.equal(litLEDs(r), 1);
});

test('a loose LED reads floating pins, off, no warnings (#25)', () => {
  const { components, wires } = labelledSeries();
  components.push(comp('led', [h(35, 'a'), h(33, 'a')], { label: 'LED2' }));
  const L2 = partsOf(Sim.analyze(components, wires)).LED2;
  assert.ok(L2, 'parts.LED2');
  assert.deepStrictEqual(L2.r.pins, { cathode: null, anode: null });
  assert.equal(L2.m.on, false);
  assert.deepStrictEqual(L2.warnings, []);
});

// ── settleModes: the generic mode loop, issue #25 ─────────────────────────
//  settleModes(blocks, solveFor) → { modes, sol, settled } | null
//    blocks[i]   = { initial: 'off', check(sol, mode) → null | { by, to } }
//                  check says whether block i is consistent with a solve in
//                  that mode: null if it is, else how far past its switching
//                  point it is (by > 0, e.g. volts) and the mode to flip to.
//    solveFor(modes) → sol, or null when the circuit can't be solved (then
//                  settleModes returns null). modes[i] is block i's mode.
//  Each round: solve; if every block is consistent, return settled: true;
//  else flip the block with the largest `by`. If a set of modes repeats,
//  flip the lowest-index inconsistent block instead (anti-cycling). After
//  4·n + 10 rounds, return settled: false. `sol` is always the solve for the
//  returned `modes`.

function needSettle() {
  assert.equal(typeof Sim.settleModes, 'function', 'simulate.js should export settleModes(blocks, solveFor)');
  return Sim.settleModes;
}

// A fake solver: the "solution" just records the modes it was solved with,
// so a block's check can read the other blocks. Throws past a hard limit so
// a loop that never ends fails the test instead of hanging it.
function fakeSolver(limit = 500) {
  const calls = [];
  const solveFor = modes => {
    calls.push(modes.slice());
    if (calls.length > limit) throw new Error(`settleModes called solveFor ${calls.length} times; it never stops`);
    return { modes: modes.slice() };
  };
  return { solveFor, calls };
}

const flipOf = mode => (mode === 'on' ? 'off' : 'on');
// A block that wants `want(sol)` ('on' / 'off'), `by` volts away.
const wants = (want, by = 1) => ({
  initial: 'off',
  check: (sol, mode) => (mode === want(sol) ? null : { by: typeof by === 'function' ? by(sol) : by, to: flipOf(mode) }),
});
const CAP = n => 4 * n + 10;

test('settleModes with no blocks solves once and is settled (#25)', () => {
  const settle = needSettle();
  const { solveFor, calls } = fakeSolver();
  const out = settle([], solveFor);
  assert.equal(out.settled, true);
  assert.deepStrictEqual(out.modes, []);
  assert.equal(calls.length, 1);
});

test('settleModes flips the most inconsistent block first and stops when all are consistent (#25)', () => {
  const settle = needSettle();
  const { solveFor, calls } = fakeSolver();
  // Block 0 wants on (by 1), block 1 wants on (by 5): flip 1, then 0.
  const blocks = [wants(() => 'on', 1), wants(() => 'on', 5)];
  const out = settle(blocks, solveFor);
  assert.equal(out.settled, true);
  assert.deepStrictEqual(out.modes, ['on', 'on']);
  assert.deepStrictEqual(calls, [['off', 'off'], ['off', 'on'], ['on', 'on']], 'most inconsistent first');
  assert.deepStrictEqual(out.sol.modes, out.modes, 'sol is the solve for the returned modes');
});

test('settleModes returns null when the circuit cannot be solved (#25)', () => {
  const settle = needSettle();
  assert.strictEqual(settle([wants(() => 'on')], () => null), null);
});

// Six diodes set up so "flip the most inconsistent" cycles: block 2 is
// always inconsistent (by 3) while block 0 is off, so plain greedy flips
// block 2 on and off forever. Block 0 (by 1) wants on; with it on, block 2
// is happy off and block 1 wants on. The only consistent modes are
// on, on, off, off, off, off. Anti-cycling (on a repeat, flip the
// lowest-index inconsistent block) must find them within 4·6 + 10 rounds.
test('six diodes that make greedy flipping cycle: anti-cycling settles them consistently within 4·6+10 (#25)', () => {
  const settle = needSettle();
  const { solveFor, calls } = fakeSolver();
  const blocks = [
    wants(() => 'on', 1),                                                  // 0: wants on
    wants(sol => sol.modes[0], 1),                                         // 1: follows block 0
    { initial: 'off', check: (sol, mode) =>                                // 2: restless while 0 is off
      sol.modes[0] === 'off' ? { by: 3, to: flipOf(mode) } : (mode === 'off' ? null : { by: 3, to: 'off' }) },
    wants(() => 'off'), wants(() => 'off'), wants(() => 'off'),            // 3–5: happy off
  ];
  const out = settle(blocks, solveFor);

  assert.ok(calls.length <= CAP(6) + 1, `at most ${CAP(6)} rounds (+1 final solve); solveFor ran ${calls.length} times`);
  assert.equal(out.settled, true, `anti-cycling should settle this; ended at ${JSON.stringify(out.modes)} after ${calls.length} solves`);
  assert.deepStrictEqual(out.modes, ['on', 'on', 'off', 'off', 'off', 'off']);
  blocks.forEach((b, i) => assert.strictEqual(b.check(out.sol, out.modes[i]), null, `block ${i} is consistent in the settled result`));
});

// Six diodes in a frustrated ring: each wants the next one's mode, but the
// last wants the opposite of the first. No set of modes satisfies them all,
// so the loop must give up as unsettled within the cap, not run forever and
// not claim to be settled.
test('six diodes that can never all be consistent end "unsettled" within 4·6+10 rounds (#25)', () => {
  const settle = needSettle();
  const { solveFor, calls } = fakeSolver();
  const blocks = [0, 1, 2, 3, 4, 5].map(i => wants(
    sol => (i < 5 ? sol.modes[i + 1] : flipOf(sol.modes[0])),
    sol => 1 + i / 10 + sol.modes.filter(m => m === 'on').length / 100,
  ));
  const out = settle(blocks, solveFor);

  assert.ok(out, 'a solvable circuit returns a result');
  assert.equal(out.settled, false);
  assert.equal(out.modes.length, 6);
  assert.ok(calls.length <= CAP(6) + 1, `at most ${CAP(6)} rounds (+1 final solve); solveFor ran ${calls.length} times`);
  assert.deepStrictEqual(out.sol.modes, out.modes, 'sol is the solve for the returned modes');
});

// The same LED circuits through analyze(): six real LEDs in a ladder settle,
// and whatever the loop reports is consistent: every lit LED carries forward
// current, and no dark LED is forward-biased past its Vf.
test('six LEDs in a ladder settle through analyze(), with no inconsistent LED (#25)', () => {
  const bat = battery();
  const components = [bat, comp('resistor', [h(5, 'a'), h(10, 'a')], { label: 'R1' })];
  // LED k: anode on column 10 + 2k, cathode on column 12 + 2k; the last cathode wired to −.
  for (let k = 0; k < 3; k++) components.push(comp('led', [h(12 + 2 * k, 'a'), h(10 + 2 * k, 'a')], { label: `LED${k + 1}` }));
  // Three more straight from column 10 to −, one of each colour.
  ['red', 'green', 'blue'].forEach((color, k) =>
    components.push(comp('led', [h(30 + k, 'tn'), h(10, 'b')], { label: `LED${k + 4}`, values: { color } })));
  const wires = [wire(h(2, 'tp'), h(5, 'a')), wire(h(16, 'a'), h(2, 'tn'))];
  const r = Sim.analyze(components, wires);

  assert.equal(r.status, 'ok', texts(r).join(' | '));
  assert.ok(!hasLine(r, 'settle'), texts(r).join(' | '));
  const id = dId();
  for (const label of ['LED1', 'LED2', 'LED3', 'LED4', 'LED5', 'LED6']) {
    const L = partsOf(r)[label];
    assert.ok(L, `parts.${label}`);
    const vd = L.r.pins.anode - L.r.pins.cathode;
    if (L.r.modes[id] === 'on') assert.ok(L.r.current[id] > -1e-6, `${label} on with reverse current ${L.r.current[id]}`);
    else assert.ok(vd <= L.r.values.vf + 1e-6, `${label} off but forward-biased ${vd} V past vf ${L.r.values.vf}`);
  }
  // Red (2.0 V) clamps column 10, so only it lights: (9 − 2) / 470.
  assert.deepStrictEqual(Object.keys(r.parts).filter(l => r.parts[l].m.on), ['LED4']);
});

// ── Battery, buzzer and button in the registry, issue #26 ────────────────
//  The last three parts join the registry (parts/battery.js, buzzer.js,
//  button.js) and simulate.js loses its per-type code: PROPS, the button
//  union-find, the per-type branches, ledsOn / buzzersOn. What changes that
//  a user can see:
//  - A pressed button is a closed SW of 1 mΩ, pressed through the record's
//    controls ({ controls: { pressed: true } }), and carries a real current:
//    currents[i] is a number, never null.
//  - Each connected circuit is grounded at the ref pin ('1', the −) of its
//    earliest-placed source (lowest index). A circuit with no source reads
//    null. No source on the board at all: status 'no-source', with the line
//    "No battery in circuit." as before.
//  - The results panel's top lines come from each part's headline(r, m), in
//    board order with sources (parts with a ref) after the others, so today's
//    order holds: buttons, then batteries. N comes from the label.
//  - A part's line(r, m) replaces the generic ON line: the buzzer's
//    "  🔔 BUZZER ON  (x.x mA)".
//  - simulationSummary is generic: `- <label>: <report>`, and a `, <pin>`
//    role after the hole for every part with non-numeric pin names.

const PRESSED_LINES = [
  { text: 'Button 1: 🟢 CLOSED (current flowing)', cls: 'sim-on' },
  { text: 'Battery 1: 9V', cls: 'sim-info' },
  { text: '  💡 LED ON  (14.9 mA)', cls: 'sim-on' },
];
const RELEASED_LINES = [
  { text: 'Button 1: ⭕ OPEN — click to press', cls: 'sim-info' },
  { text: 'Battery 1: 9V', cls: 'sim-info' },
  { text: '  Circuit open — no complete path.', cls: 'sim-warn' },
];

// BAT1 (off-board) → tp → b4 SW1 b7 → R1 a7–a11 → LED1 anode a11, cathode
// a16 → tn. The button is listed last, after the battery, so its headline
// coming first shows the sources-after-the-others order.
function buttonSeries(pressed) {
  const bat = offBoardBattery('BAT1');
  const components = [
    bat,
    comp('resistor', [h(6, 'a'),  h(10, 'a')], { label: 'R1' }),
    comp('led',      [h(15, 'a'), h(10, 'a')], { label: 'LED1' }),   // pin0 cathode, pin1 anode
    comp('button',   [h(3, 'b'),  h(6, 'b')],  { label: 'SW1', controls: { pressed } }),
  ];
  const wires = [
    batWire(bat, 0, h(1, 'tp')), batWire(bat, 1, h(1, 'tn')),
    wire(h(2, 'tp'), h(3, 'a')), wire(h(15, 'b'), h(2, 'tn')),
  ];
  return { components, wires };
}

// BAT1 → tp → R1 a5–a9 → BZ1 b9–b11 → tn: I = 9 / (470 + 42) = 17.578 mA.
function buzzerSeries(opts) {
  const bat = offBoardBattery('BAT1');
  const components = [
    bat,
    comp('resistor', [h(4, 'a'), h(8, 'a')],  { label: 'R1' }),
    comp('buzzer',   [h(8, 'b'), h(10, 'b')], { label: 'BZ1' }),
  ];
  const wires = [batWire(bat, 0, h(0, 'tp')), batWire(bat, 1, h(0, 'tn')), wire(h(1, 'tp'), h(4, 'b'))];
  if (!(opts && opts.open)) wires.push(wire(h(10, 'a'), h(1, 'tn')));
  return { components, wires };
}

function part(r, label) {
  const p = partsOf(r)[label];
  assert.ok(p, `analyze().parts should have ${label}; got ${JSON.stringify(Object.keys(r.parts))}`);
  return p;
}

test('a pressed button carries a real current: currents[] 14.9 mA through SW1, the LED lit; released, 0 (#26)', () => {
  const down = Sim.analyze(...Object.values(buttonSeries(true)));
  assert.equal(down.status, 'ok', texts(down).join(' | '));
  assert.equal(typeof down.currents[3], 'number', `a pressed button's current is a number, got ${down.currents[3]}`);
  assert.ok(Math.abs(mA(down.currents[3]) - 14.894) < 0.01, `+ from lead1 to lead2: ${mA(down.currents[3])} mA`);
  const SW1 = part(down, 'SW1');
  const I = Object.values(SW1.r.current);
  assert.equal(I.length, 1, `one element current; got ${JSON.stringify(SW1.r.current)}`);
  assert.ok(Math.abs(Math.abs(I[0]) - 14.894) < 0.01, `parts.SW1.r.current in mA: ${I[0]}`);
  assert.equal(SW1.r.controls.pressed, true, 'r.controls carries the record\'s controls');
  assert.equal(part(down, 'LED1').m.on, true);

  const up = Sim.analyze(...Object.values(buttonSeries(false)));
  assert.equal(typeof up.currents[3], 'number');
  assert.ok(Math.abs(up.currents[3]) < 1e-12, `a released button carries nothing: ${up.currents[3]}`);
  assert.equal(part(up, 'SW1').r.controls.pressed, false);
  assert.equal(part(up, 'LED1').m.on, false);
});

test('a pressed button is a closed SW of 1 mΩ, never an ideal short: its leads stay two nodes, I × 1 mΩ apart (#26)', () => {
  const { components, wires } = buttonSeries(true);
  const graph = Sim.buildGraph(components, wires);
  assert.notEqual(graph[3].nodes[0], graph[3].nodes[1], 'no union-find merge: lead1 and lead2 are separate nodes');
  const { pins } = part(Sim.analyze(components, wires), 'SW1').r;
  const drop = pins.lead1 - pins.lead2;
  assert.ok(Math.abs(drop - 14.8904e-3 * 1e-3) < 1e-7, `1 mΩ × 14.89 mA ≈ 1.49e-5 V across the switch; got ${drop}`);
});

test('headlines: "Button 1: 🟢 CLOSED" / "⭕ OPEN" first, then "Battery 1: 9V", though the battery is placed first (#26)', () => {
  assert.deepStrictEqual(plainLines(Sim.analyze(...Object.values(buttonSeries(true)))), PRESSED_LINES);
  assert.deepStrictEqual(plainLines(Sim.analyze(...Object.values(buttonSeries(false)))), RELEASED_LINES);
});

test('headlines take N from the label and keep board order within each group: SW2, then BAT1, BAT2 (#26)', () => {
  const bat1 = offBoardBattery('BAT1');
  const bat2 = offBoardBattery('BAT2', { voltage: 6 });
  const sw2  = comp('button', [h(20, 'b'), h(23, 'b')], { label: 'SW2', controls: { pressed: false } });   // SW1 was deleted
  const r = Sim.analyze([bat1, sw2, bat2], []);
  assert.deepStrictEqual(plainLines(r).slice(0, 3), [
    { text: 'Button 2: ⭕ OPEN — click to press', cls: 'sim-info' },
    { text: 'Battery 1: 9V', cls: 'sim-info' },
    { text: 'Battery 2: 6V', cls: 'sim-info' },
  ], texts(r).join(' | '));
});

test('the buzzer through its registry part: 17.6 mA, sounding, and its own "🔔 BUZZER ON" line (#26)', () => {
  const { components, wires } = buzzerSeries();
  const r = Sim.analyze(components, wires);
  assert.equal(r.status, 'ok');
  const BZ1 = part(r, 'BZ1');
  assert.equal(BZ1.m.sounding, true, JSON.stringify(BZ1.m));
  assert.ok(Math.abs(BZ1.m.current - 17.578) < 0.01, `9 V / 512 Ω: ${BZ1.m.current}`);
  assert.ok(Math.abs(mA(r.currents[2]) - 17.578) < 0.01, `currents[] in amps, + lead1 → lead2: ${r.currents[2]}`);
  assert.deepStrictEqual(plainLines(r), [
    { text: 'Battery 1: 9V', cls: 'sim-info' },
    { text: '  🔔 BUZZER ON  (17.6 mA)', cls: 'sim-on' },
  ]);

  const open = Sim.analyze(...Object.values(buzzerSeries({ open: true })));
  assert.equal(part(open, 'BZ1').m.sounding, false);
  assert.ok(!hasLine(open, 'BUZZER ON'), texts(open).join(' | '));
});

// Circuit A on the top rails: BAT1, R1 470 Ω, a red LED1.
// Circuit B on the bottom rails, wired to nothing in A: BAT2, R2 1 kΩ, a green LED2.
// Circuit C: R3 on its own, no source.
function twoCircuits() {
  const bat1 = offBoardBattery('BAT1');
  const bat2 = offBoardBattery('BAT2');
  const components = [
    bat1,
    comp('resistor', [h(4, 'a'),  h(8, 'a')],  { label: 'R1' }),
    comp('led',      [h(10, 'a'), h(8, 'b')],  { label: 'LED1' }),                      // cathode a11, anode b9
    bat2,
    comp('resistor', [h(30, 'f'), h(34, 'f')], { label: 'R2', values: { resistance: 1000 } }),
    comp('led',      [h(36, 'f'), h(34, 'g')], { label: 'LED2', values: { color: 'green' } }),   // cathode f37, anode g35
    comp('resistor', [h(50, 'c'), h(54, 'c')], { label: 'R3' }),
  ];
  const wires = [
    batWire(bat1, 0, h(0, 'tp')),  batWire(bat1, 1, h(0, 'tn')),
    wire(h(1, 'tp'), h(4, 'b')),   wire(h(10, 'b'), h(1, 'tn')),
    batWire(bat2, 0, h(62, 'bp')), batWire(bat2, 1, h(62, 'bn')),
    wire(h(29, 'bp'), h(30, 'g')), wire(h(36, 'g'), h(29, 'bn')),
  ];
  return { components, wires };
}

test('two separate circuits, each with its own battery: both simulate, each grounded at its own battery − (#26)', () => {
  const { components, wires } = twoCircuits();
  const r = Sim.analyze(components, wires);

  assert.equal(r.status, 'ok', texts(r).join(' | '));
  assert.ok(Math.abs(part(r, 'LED1').m.current - 14.8904) < 0.01, `LED1 (9 − 2.0) / 470: ${part(r, 'LED1').m.current}`);
  assert.ok(Math.abs(part(r, 'LED2').m.current - 6.7993) < 0.01, `LED2 (9 − 2.2) / 1000: ${part(r, 'LED2').m.current}`);
  assert.ok(hasLine(r, 'LED ON  (14.9 mA)') && hasLine(r, 'LED ON  (6.8 mA)'), texts(r).join(' | '));

  // Circuit A: ground at BAT1.1.
  nearV(vAt(r, h(40, 'tn')), 0, 'circuit A: the − rail, BAT1.1');
  nearV(vAt(r, h(40, 'tp')), 9, 'circuit A: the + rail');
  // Circuit B: its own ground at BAT2.1, not floating around ±4.5 V.
  nearV(vAt(r, h(50, 'bn')), 0, 'circuit B: BAT2.1’s rail is its own ground');
  nearV(vAt(r, h(50, 'bp')), 9, 'circuit B: BAT2.0’s rail');
  const anode2 = vAt(r, h(34, 'j'));
  assert.ok(typeof anode2 === 'number' && Math.abs(anode2 - 2.2007) < 0.001, `circuit B: LED2 anode column ≈ 2.2 V, got ${anode2}`);
  nearV(part(r, 'BAT2').r.pins['1'], 0, 'parts.BAT2.r.pins["1"]');
  nearV(part(r, 'BAT2').r.pins['0'], 9, 'parts.BAT2.r.pins["0"]');
  nearV(part(r, 'LED2').r.pins.cathode, 0, 'parts.LED2 cathode');

  // Circuit C has no source: floating.
  assert.strictEqual(vAt(r, h(50, 'd')), null, 'circuit C: R3 lead1 column');
  assert.strictEqual(vAt(r, h(54, 'e')), null, 'circuit C: R3 lead2 column');
  assert.deepStrictEqual(part(r, 'R3').r.pins, { lead1: null, lead2: null });

  const lines = summary(components, wires);
  assertLine(lines, /^ {2}- BAT2\.0 \(off-board\): 9\.00 V$/, 'BAT2 + in the summary');
  assertLine(lines, /^ {2}- BAT2\.1 \(off-board\): 0\.00 V$/, 'BAT2 − in the summary');
  assertLine(lines, /^ {2}- LED2 pin 1 \(g35, anode\): 2\.20 V$/, 'LED2 anode in the summary');
  assertLine(lines, /^ {2}- R3 pin 0 \(c51, lead1\): floating/, 'R3 floating in the summary');
});

// Circuit B stacks two batteries: BAT2 from the bn rail up to column 40, and
// BAT3 from column 40 up to the bp rail, across R2 1 kΩ: 18 mA. Its ground
// is the − of whichever of the two is earlier in the component list.
function stackedCircuit(order) {
  const bat1 = offBoardBattery('BAT1');
  const bat2 = offBoardBattery('BAT2');
  const bat3 = offBoardBattery('BAT3');
  const parts = {
    bat1, bat2, bat3,
    r1: comp('resistor', [h(4, 'a'), h(8, 'a')], { label: 'R1' }),
    r2: comp('resistor', [h(30, 'f'), h(34, 'f')], { label: 'R2', values: { resistance: 1000 } }),
  };
  const wires = [
    batWire(bat1, 0, h(0, 'tp')),  batWire(bat1, 1, h(0, 'tn')),
    wire(h(1, 'tp'), h(4, 'b')),   wire(h(8, 'b'), h(1, 'tn')),
    batWire(bat2, 0, h(39, 'a')),  batWire(bat2, 1, h(62, 'bn')),
    batWire(bat3, 0, h(62, 'bp')), batWire(bat3, 1, h(39, 'b')),
    wire(h(29, 'bp'), h(30, 'g')), wire(h(34, 'g'), h(29, 'bn')),
  ];
  return { components: order.map(k => parts[k]), wires };
}

test('each circuit is grounded at the ref pin of its earliest-placed source (#26)', () => {
  // BAT2 placed before BAT3: ground at BAT2.1, the bn rail.
  let { components, wires } = stackedCircuit(['bat1', 'r1', 'bat2', 'r2', 'bat3']);
  let r = Sim.analyze(components, wires);
  assert.ok(Math.abs(part(r, 'R2').m.current - 18) < 0.01, `18 V across 1 kΩ: ${part(r, 'R2').m.current}`);
  nearV(vAt(r, h(20, 'tn')), 0,  'circuit A: BAT1.1');
  nearV(vAt(r, h(50, 'bn')), 0,  'BAT2 first: BAT2.1 (bn) is ground');
  nearV(vAt(r, h(39, 'c')),  9,  'BAT2 first: column 40');
  nearV(vAt(r, h(50, 'bp')), 18, 'BAT2 first: bp');

  // BAT3 placed before BAT2: ground moves to BAT3.1, column 40.
  ({ components, wires } = stackedCircuit(['bat1', 'r1', 'bat3', 'r2', 'bat2']));
  r = Sim.analyze(components, wires);
  assert.ok(Math.abs(part(r, 'R2').m.current - 18) < 0.01, `the same 18 mA: ${part(r, 'R2').m.current}`);
  nearV(vAt(r, h(20, 'tn')), 0,  'circuit A: BAT1.1');
  nearV(vAt(r, h(39, 'c')),  0,  'BAT3 first: BAT3.1 (column 40) is ground');
  nearV(vAt(r, h(50, 'bn')), -9, 'BAT3 first: bn');
  nearV(vAt(r, h(50, 'bp')), 9,  'BAT3 first: bp');

  // The summary names the earliest source's ref pin as the reference.
  ({ components, wires } = stackedCircuit(['bat2', 'r2', 'bat3', 'bat1', 'r1']));
  assertLine(summary(components, wires), /^Status: solved\. Voltages are measured from BAT2\.1\b/, 'status line');
});

test("no source on the board: status 'no-source', the one line \"No battery in circuit.\", no readings (#26)", () => {
  const r = Sim.analyze([
    comp('resistor', [h(4, 'a'),  h(8, 'a')],  { label: 'R1' }),
    comp('button',   [h(8, 'b'),  h(11, 'b')], { label: 'SW1', controls: { pressed: true } }),
    comp('buzzer',   [h(11, 'c'), h(13, 'c')], { label: 'BZ1' }),
  ], []);
  assert.equal(r.status, 'no-source');
  assert.deepStrictEqual(plainLines(r), [{ text: 'No battery in circuit.', cls: 'sim-warn' }]);
  assert.deepStrictEqual(r.parts, {});
  assert.strictEqual(vAt(r, h(4, 'b')), null);
  assert.deepStrictEqual(summary([comp('buzzer', [h(11, 'c'), h(13, 'c')], { label: 'BZ1' })], []), ['No battery on the board.']);
});

test('summary: every part line is `- <label>: <report>` and every named pin gets its role; the pressed button reports 14.9 mA (#26)', () => {
  const { components, wires } = buttonSeries(true);
  const lines = summary(components, wires);
  assert.match(lines[0], /^Status: solved\. Voltages are measured from BAT1\.1\b/, show(lines));
  assert.deepStrictEqual(lines.slice(1), [
    '- BAT1: 9.00 V battery, supplying 14.9 mA',
    '  - BAT1.0 (off-board): 9.00 V',
    '  - BAT1.1 (off-board): 0.00 V',
    '- R1: 470 ohm resistor, 14.9 mA',
    '  - R1 pin 0 (a7, lead1): 9.00 V',
    '  - R1 pin 1 (a11, lead2): 2.00 V',
    '- LED1: LED ON (lit), 14.9 mA',
    '  - LED1 pin 0 (a16, cathode): 0.00 V',
    '  - LED1 pin 1 (a11, anode): 2.00 V',
    '- SW1: button pressed (closed), 14.9 mA',
    '  - SW1 pin 0 (b4, lead1): 9.00 V',
    '  - SW1 pin 1 (b7, lead2): 9.00 V',
  ], show(lines));
});

test('summary: the buzzer reads "buzzer ON (sounding), 17.6 mA", its pins lead1 / lead2; a battery on the board gets no role (#26)', () => {
  const { components, wires } = buzzerSeries();
  const lines = summary(components, wires);
  assert.deepStrictEqual(lines.slice(1), [
    '- BAT1: 9.00 V battery, supplying 17.6 mA',
    '  - BAT1.0 (off-board): 9.00 V',
    '  - BAT1.1 (off-board): 0.00 V',
    '- R1: 470 ohm resistor, 17.6 mA',
    '  - R1 pin 0 (a5, lead1): 9.00 V',
    '  - R1 pin 1 (a9, lead2): 0.74 V',
    '- BZ1: buzzer ON (sounding), 17.6 mA',
    '  - BZ1 pin 0 (b9, lead1): 0.74 V',
    '  - BZ1 pin 1 (b11, lead2): 0.00 V',
  ], show(lines));

  const silent = summary(...Object.values(buzzerSeries({ open: true })));
  assertLine(silent, /^- BZ1: buzzer OFF \(silent\), 0\.0 mA$/, 'a silent buzzer');

  // A battery sitting on the rails (the fixture's battery()): pins '0' / '1', no role.
  const board = seriesLedCircuit();
  board.components[0].label = 'BAT1';
  board.components[1].label = 'R1';
  const onBoard = summary(board.components, board.wires);
  assertLine(onBoard, /^ {2}- BAT1 pin 0 \(tp_2\): 9\.00 V$/, 'battery + on the rail, no role');
  assertLine(onBoard, /^ {2}- BAT1 pin 1 \(tn_2\): 0\.00 V$/, 'battery − on the rail, no role');
  assertLine(onBoard, /^ {2}- R1 pin 0 \(a6, lead1\): 9\.00 V$/, 'resistor pin role');
});

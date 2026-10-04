// Board model in Node (issue #81): apply the AI's actions to a plain board
// and hand the result to the simulator.
//
// Contract these tests are written against (circuit3d/js/board-model.js,
// UMD like simulate.js):
// - Board.empty() → { parts: [], wires: [] }.
// - Board.fromExample(ex): parts copied ({ type, label, holes, values,
//   controls }); wires [from, to] become { id: 'W1', from, to }, W2… in order.
// - Board.apply(board, actions) → { board, errors }. Never mutates its input.
//   Unknown label / wire id / tool → errors.push({ index, tool, why }) and
//   the action is skipped; `index` is the action's 0-based index in
//   `actions`. No range or placement checks.
// - Board.toSim(board) → { components, wires } for Sim.analyze(components,
//   wires): today's toCircuit in test/parts-examples.test.js, moved in.
// - Board.ROTATION: the footprint direction → rotation map, the same object
//   shape as Chat.ROTATION.
//
// Labels follow ids.js's nextLabel rule: prefix + (highest number in use
// for that prefix + 1). So a deleted R2 is not reused while R3 exists, but
// deleting the highest (R3) frees R3 again. chat.js predictLabels predicts
// the AI's labels with the same rule, so the board model must match it.

const assert = require('node:assert');

const Parts = require('../circuit3d/js/parts');
const Sim   = require('../circuit3d/js/simulate.js');
const Chat  = require('../circuit3d/js/chat.js');
const { recipeActions } = require('./fixtures/recipe-steps.js');

const Board = require('../circuit3d/js/board-model.js');

const partOf = (board, label) => board.parts.find(p => p.label === label);
const labels = board => board.parts.map(p => p.label);
const wireIds = board => board.wires.map(w => w.id);

// Apply, and require no errors.
function applyOk(board, actions) {
  const { board: out, errors } = Board.apply(board, actions);
  assert.deepStrictEqual(errors, [], `unexpected errors: ${JSON.stringify(errors)}`);
  return out;
}

function simulate(board) {
  const { components, wires } = Board.toSim(board);
  return Sim.analyze(components, wires);
}

// The same expect check as test/parts-examples.test.js.
function checkExpect(name, expect, result) {
  for (const [label, fields] of Object.entries(expect)) {
    const part = result.parts && result.parts[label];
    assert.ok(part, `${name}: analyze().parts has no "${label}"; got ${JSON.stringify(Object.keys(result.parts || {}))}`);
    for (const [field, want] of Object.entries(fields)) {
      const got = part.m[field];
      if (Array.isArray(want)) {
        assert.ok(typeof got === 'number' && got >= want[0] && got <= want[1],
          `${name}: ${label}.${field} expected ${want[0]}–${want[1]}, got ${got}`);
      } else {
        assert.deepStrictEqual(got, want, `${name}: ${label}.${field} expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
      }
    }
  }
}

// ── empty and fromExample ───────────────────────────────────────────────

// docs/API-CONTRACT.md → "Example", the single-LED known answer.
const CONTRACT_LED = {
  name: 'LED on 9 V with 470 Ω lights at ~14.9 mA',
  parts: [{ type: 'battery', label: 'BAT1' },
          { type: 'resistor', label: 'R1', holes: ['a2', 'a6'] },
          { type: 'led', label: 'LED1', holes: ['b8', 'b6'], values: { color: 'red' } }],
  wires: [['BAT1.0', 'tp_50'], ['BAT1.1', 'tn_50'], ['tp_2', 'b2'], ['c8', 'tn_8']],
  expect: { LED1: { on: true, current: [14.0, 15.8] } },
};

test('Board.empty() is { parts: [], wires: [] }', () => {
  assert.deepStrictEqual(Board.empty(), { parts: [], wires: [] });
});

test('Board.fromExample numbers the wires W1…Wn in order and copies the parts', () => {
  const board = Board.fromExample(CONTRACT_LED);
  assert.deepStrictEqual(board.wires, [
    { id: 'W1', from: 'BAT1.0', to: 'tp_50' },
    { id: 'W2', from: 'BAT1.1', to: 'tn_50' },
    { id: 'W3', from: 'tp_2',   to: 'b2' },
    { id: 'W4', from: 'c8',     to: 'tn_8' },
  ]);
  assert.deepStrictEqual(labels(board), ['BAT1', 'R1', 'LED1']);
  CONTRACT_LED.parts.forEach((p, i) => {
    assert.notStrictEqual(board.parts[i], p, `${p.label} must be a copy, not the example's own object`);
    for (const key of ['type', 'label', 'holes', 'values', 'controls']) {
      if (p[key] !== undefined) assert.deepStrictEqual(board.parts[i][key], p[key], `${p.label}.${key}`);
    }
  });
});

test('toSim(fromExample(contract LED)) simulates the contract answer: LED1 on at 14.9 mA', () => {
  const r = simulate(Board.fromExample(CONTRACT_LED));
  assert.equal(r.status, 'ok', `status ${r.status}`);
  checkExpect(CONTRACT_LED.name, CONTRACT_LED.expect, r);
});

// ── Reference: today's parts-examples adapter (toCircuit before #81) ────
// toSim moves this into the module; every registered example must simulate
// exactly as it did through this adapter.

function parseHole(s) {
  const m = /^(?:([a-j])(\d+)|(tp|tn|bn|bp)_(\d+))$/.exec(String(s));
  if (!m) return null;
  return m[1] ? { col: Number(m[2]) - 1, row: m[1] } : { col: Number(m[4]) - 1, row: m[3] };
}

function refValues(p) {
  const def = Parts.get(p.type);
  const v = {};
  for (const [key, spec] of Object.entries(def.values || {})) {
    v[key] = spec.default;
    if (spec.choices && spec.choices[spec.default]) Object.assign(v, spec.choices[spec.default]);
  }
  for (const [key, val] of Object.entries(p.values || {})) {
    v[key] = val;
    const spec = def.values && def.values[key];
    if (spec && spec.choices && spec.choices[val]) Object.assign(v, spec.choices[val]);
  }
  return v;
}

function referenceCircuit(ex) {
  const byLabel = new Map();
  const components = ex.parts.map(p => {
    const def = Parts.get(p.type);
    const comp = { type: p.type, label: p.label, pins: def.pins.map(() => ({ x: 0, y: 0, z: 0 })),
                   holeRefs: p.holes ? p.holes.map(parseHole) : null, values: refValues(p) };
    if (p.controls) comp.controls = Object.assign({}, p.controls);
    byLabel.set(p.label, { comp, def });
    return comp;
  });
  const end = (s, side) => {
    const hole = parseHole(s);
    if (hole) return { [side + 'Hole']: hole };
    const [, label, pin] = /^([A-Za-z]+\d+)\.(\w+)$/.exec(String(s));
    const owner = byLabel.get(label);
    const idx = /^\d+$/.test(pin) ? Number(pin) : owner.def.pins.indexOf(pin);
    return { [side + 'Comp']: owner.comp, [side + 'PinIdx']: idx };
  };
  return { components, wires: ex.wires.map(([a, b]) => Object.assign({}, end(a, 'start'), end(b, 'end'))) };
}

// What a result says, without the solver's internals.
function summary(r) {
  const parts = {};
  for (const [label, p] of Object.entries(r.parts || {})) parts[label] = { m: p.m, warnings: p.warnings };
  return { status: r.status, shorted: r.shorted, parts, lines: (r.lines || []).map(l => l.text) };
}

test('toSim(fromExample(ex)) simulates every registered example exactly as the parts-examples adapter did', () => {
  const Bd = Board;
  let n = 0;
  for (const def of Parts.all()) {
    const cases = def.examples.concat(def.ai && def.ai.recipe ? [def.ai.recipe] : []);
    for (const ex of cases) {
      const ref = referenceCircuit(ex);
      const want = summary(Sim.analyze(ref.components, ref.wires));
      const sim = Bd.toSim(Bd.fromExample(ex));
      const got = summary(Sim.analyze(sim.components, sim.wires));
      assert.deepStrictEqual(got, want, `${def.type}: "${ex.name}" simulates differently through Board.toSim`);
      n++;
    }
  }
  assert.ok(n > 20, `expected every registered example to be compared; compared ${n}`);
});

// ── apply: each action kind ─────────────────────────────────────────────

test('delete_all empties the board', () => {
  const out = applyOk(Board.fromExample(CONTRACT_LED), [{ tool: 'delete_all' }]);
  assert.deepStrictEqual(out, { parts: [], wires: [] });
});

test('place_resistor and place_led: span parts get holes [holeA, holeB] and their value args', () => {
  const out = applyOk(Board.empty(), [
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6', resistance: 1000 },
    { tool: 'place_led', holeA: 'c8', holeB: 'c6', color: 'green' },
  ]);
  assert.deepStrictEqual(labels(out), ['R1', 'LED1']);
  const r1 = partOf(out, 'R1'), led = partOf(out, 'LED1');
  assert.equal(r1.type, 'resistor');
  assert.deepStrictEqual(r1.holes, ['b2', 'b6']);
  assert.equal(r1.values.resistance, 1000);
  assert.equal(led.type, 'led');
  assert.deepStrictEqual(led.holes, ['c8', 'c6']);   // cathode c8, anode c6
  assert.equal(led.values.color, 'green');
  for (const p of [r1, led]) {
    for (const arg of ['tool', 'holeA', 'holeB']) {
      assert.equal(p.values && p.values[arg], undefined, `${p.label}: "${arg}" is a tool arg, not a value`);
    }
  }
});

test('place_seven_segment: hole + direction give the registry footprint legs at that rotation', () => {
  const out = applyOk(Board.empty(), [{ tool: 'place_seven_segment', hole: 'f30', direction: 'right' }]);
  const ds = partOf(out, 'DS1');
  assert.ok(ds, `expected DS1; got ${JSON.stringify(labels(out))}`);
  assert.equal(ds.type, 'seven_segment');
  const legs = Parts.footprintLegs('seven_segment', 'f30', Chat.ROTATION.right).map(l => l.hole);
  assert.deepStrictEqual(ds.holes, legs);
  assert.deepStrictEqual(ds.holes, ['f30', 'f31', 'f32', 'f33', 'f34', 'e34', 'e33', 'e32', 'e31', 'e30']);

  const left = applyOk(Board.empty(), [{ tool: 'place_seven_segment', hole: 'e40', direction: 'left' }]);
  assert.deepStrictEqual(partOf(left, 'DS1').holes,
    Parts.footprintLegs('seven_segment', 'e40', Chat.ROTATION.left).map(l => l.hole));
});

test('place_potentiometer in each direction: legs are footprintLegs at Chat.ROTATION[direction]', () => {
  for (const direction of Object.keys(Chat.ROTATION)) {
    const out = applyOk(Board.empty(), [{ tool: 'place_potentiometer', hole: 'e20', direction, resistance: 10000 }]);
    const rv = partOf(out, 'RV1');
    assert.ok(rv, `${direction}: expected RV1; got ${JSON.stringify(labels(out))}`);
    const want = Parts.footprintLegs('potentiometer', 'e20', Chat.ROTATION[direction]).map(l => l.hole);
    assert.deepStrictEqual(rv.holes, want, `direction ${direction}`);
    assert.equal(rv.values.resistance, 10000);
    for (const arg of ['hole', 'direction']) {
      assert.equal(rv.values[arg], undefined, `"${arg}" is a tool arg, not a value`);
    }
  }
});

test("Board.ROTATION is Chat.ROTATION, so the two can't drift", () => {
  assert.deepStrictEqual(Board.ROTATION, Chat.ROTATION);
});

test('place_battery and place_bench_supply: off-board, no holes, value args kept', () => {
  const out = applyOk(Board.empty(), [
    { tool: 'place_battery' },
    { tool: 'place_bench_supply', voltage: 5, limit: 0.5 },
  ]);
  assert.deepStrictEqual(labels(out), ['BAT1', 'PS1']);
  for (const p of out.parts) {
    assert.deepStrictEqual(p.holes == null ? [] : p.holes, [], `${p.label} is off-board: no holes; got ${JSON.stringify(p.holes)}`);
  }
  assert.equal(partOf(out, 'BAT1').type, 'battery');
  assert.equal(partOf(out, 'PS1').type, 'bench_supply');
  assert.equal(partOf(out, 'PS1').values.voltage, 5);
  assert.equal(partOf(out, 'PS1').values.limit, 0.5);
});

test('add_wire appends { id: W<n>, from, to }', () => {
  const out = applyOk(Board.empty(), [
    { tool: 'place_battery' },
    { tool: 'add_wire', from: 'BAT1.0', to: 'tp_63' },
    { tool: 'add_wire', from: 'tp_3', to: 'a2' },
  ]);
  assert.deepStrictEqual(out.wires, [
    { id: 'W1', from: 'BAT1.0', to: 'tp_63' },
    { id: 'W2', from: 'tp_3', to: 'a2' },
  ]);
});

test('delete_part removes the part and every wire on one of its LABEL.k pins, and keeps the rest', () => {
  const start = Board.fromExample(CONTRACT_LED);   // W1 BAT1.0, W2 BAT1.1, W3 tp_2-b2, W4 c8-tn_8
  const out = applyOk(start, [{ tool: 'delete_part', part: 'BAT1' }]);
  assert.deepStrictEqual(labels(out), ['R1', 'LED1']);
  assert.deepStrictEqual(out.wires, [
    { id: 'W3', from: 'tp_2', to: 'b2' },
    { id: 'W4', from: 'c8', to: 'tn_8' },
  ]);

  // A part whose leads sit in holes has no LABEL.k wires: its hole wires stay.
  const noR = applyOk(start, [{ tool: 'delete_part', part: 'R1' }]);
  assert.deepStrictEqual(labels(noR), ['BAT1', 'LED1']);
  assert.deepStrictEqual(wireIds(noR), ['W1', 'W2', 'W3', 'W4']);
});

test('set_value merges into the part values; set_control merges into its controls', () => {
  const out = applyOk(Board.empty(), [
    { tool: 'place_potentiometer', hole: 'e20', direction: 'right', resistance: 10000 },
    { tool: 'place_led', holeA: 'c8', holeB: 'c6', color: 'red' },
    { tool: 'place_button', holeA: 'b12', holeB: 'b15' },
    { tool: 'set_value', part: 'LED1', color: 'blue' },
    { tool: 'set_control', part: 'RV1', position: 25 },
    { tool: 'set_control', part: 'SW1', pressed: true },
  ]);
  const rv = partOf(out, 'RV1');
  assert.equal(rv.values.resistance, 10000, 'set_control must not touch values');
  assert.equal(rv.controls.position, 25);
  assert.equal(partOf(out, 'LED1').values.color, 'blue');
  assert.equal(partOf(out, 'SW1').controls.pressed, true);

  // Merging: set_value on one key keeps the others.
  const both = applyOk(Board.empty(), [
    { tool: 'place_bench_supply', voltage: 5, limit: 0.5 },
    { tool: 'set_value', part: 'PS1', voltage: 12 },
  ]);
  assert.equal(partOf(both, 'PS1').values.voltage, 12);
  assert.equal(partOf(both, 'PS1').values.limit, 0.5, 'set_value must merge, not replace');
});

test('values are applied as given: no range check in apply', () => {
  const out = applyOk(Board.empty(), [
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6' },
    { tool: 'set_value', part: 'R1', resistance: 3 },   // not an E12 kit value; the server checks that
  ]);
  assert.equal(partOf(out, 'R1').values.resistance, 3);
});

test('placement legality is not checked: two parts on the same holes both land', () => {
  const out = applyOk(Board.empty(), [
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6' },
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6' },
  ]);
  assert.deepStrictEqual(labels(out), ['R1', 'R2']);
});

test('delete_wire removes that wire only', () => {
  const out = applyOk(Board.fromExample(CONTRACT_LED), [{ tool: 'delete_wire', wire: 'W3' }]);
  assert.deepStrictEqual(wireIds(out), ['W1', 'W2', 'W4']);
  assert.equal(out.parts.length, 3);
});

// ── apply never mutates its input ───────────────────────────────────────

test('apply does not mutate the board or the actions it is given', () => {
  const board = Board.fromExample(Object.assign({}, CONTRACT_LED, {
    parts: CONTRACT_LED.parts.concat({ type: 'button', label: 'SW1', holes: ['b12', 'b15'], controls: { pressed: false } }),
  }));
  const actions = [
    { tool: 'set_control', part: 'SW1', pressed: true },
    { tool: 'set_value', part: 'R1', resistance: 1000 },
    { tool: 'set_value', part: 'LED1', color: 'green' },
    { tool: 'add_wire', from: 'a3', to: 'a9' },
    { tool: 'delete_wire', wire: 'W1' },
    { tool: 'delete_part', part: 'BAT1' },
    { tool: 'place_resistor', holeA: 'd2', holeB: 'd6' },
  ];
  const boardBefore = structuredClone(board);
  const actionsBefore = structuredClone(actions);
  const { board: out } = Board.apply(board, actions);
  assert.deepStrictEqual(board, boardBefore, 'apply changed its input board');
  assert.deepStrictEqual(actions, actionsBefore, 'apply changed its actions');
  assert.notStrictEqual(out, board);
  assert.equal(partOf(out, 'R1').values.resistance, 1000);
  assert.equal(partOf(out, 'SW1').controls.pressed, true);

  // Even with no actions, the parts that come back share no objects with the input.
  const same = Board.apply(board, []).board;
  assert.deepStrictEqual(same, board);
  board.parts.forEach((p, i) => {
    for (const key of ['values', 'controls', 'holes']) {
      if (p[key]) assert.notStrictEqual(same.parts[i][key], p[key], `${p.label}.${key} is the input's own object`);
    }
    assert.notStrictEqual(same.parts[i], p, `${p.label} is the input's own object`);
  });

  const cleared = Board.apply(board, [{ tool: 'delete_all' }]);
  assert.deepStrictEqual(cleared.board, { parts: [], wires: [] });
  assert.deepStrictEqual(board, boardBefore, 'delete_all emptied the input board');
});

// ── Errors: skipped, reported, the rest still applied ───────────────────

test('unknown labels, wire ids and tools become { index, tool, why } errors and are skipped', () => {
  const { board, errors } = Board.apply(Board.fromExample(CONTRACT_LED), [
    { tool: 'set_value', part: 'R9', resistance: 100 },        // 0: no R9
    { tool: 'delete_part', part: 'R9' },                        // 1: no R9
    { tool: 'set_control', part: 'SW7', pressed: true },        // 2: no SW7
    { tool: 'delete_wire', wire: 'W9' },                        // 3: no W9
    { tool: 'launch_rocket' },                                  // 4: not a tool
    { tool: 'place_flux_capacitor', holeA: 'b2', holeB: 'b4' }, // 5: no such part
    { tool: 'add_wire', from: 'R9.0', to: 'tp_3' },             // 6: no R9
    { tool: 'add_wire', from: 'BAT1.7', to: 'tp_4' },           // 7: the battery has pins 0 and 1
    { tool: 'set_value', part: 'R1', resistance: 1000 },        // 8: applied
    { tool: 'add_wire', from: 'a3', to: 'a9' },                 // 9: applied → W5
  ]);
  assert.deepStrictEqual(errors.map(e => [e.index, e.tool]), [
    [0, 'set_value'], [1, 'delete_part'], [2, 'set_control'], [3, 'delete_wire'],
    [4, 'launch_rocket'], [5, 'place_flux_capacitor'], [6, 'add_wire'], [7, 'add_wire'],
  ]);
  for (const e of errors) assert.ok(typeof e.why === 'string' && e.why.length > 0, `error ${e.index} needs a why`);
  assert.deepStrictEqual(labels(board), ['BAT1', 'R1', 'LED1'], 'skipped actions must not add or remove parts');
  assert.equal(partOf(board, 'R1').values.resistance, 1000, 'a later valid action must still apply');
  assert.deepStrictEqual(wireIds(board), ['W1', 'W2', 'W3', 'W4', 'W5'], 'a skipped add_wire must not take an id');
  assert.doesNotThrow(() => Board.toSim(board), 'a board apply returned must go to toSim');
});

// The builder's own error cases. 0–4 and 6 are pins; 5 is a leg past the
// right edge (column 64 on a 63-column board), which footprintLegs still names.
test('malformed place and add_wire actions are errors and skipped: no holes, bad direction, legs off the board, no `to`', () => {
  const COLS = require('../circuit3d/js/board-geometry.js').COLS;   // 63
  const bad = [
    { tool: 'place_resistor', holeB: 'b6' },                                  // 0: no holeA
    { tool: 'place_led', holeA: 'c8' },                                       // 1: no holeB
    { tool: 'place_potentiometer', hole: 'e20', direction: 'sideways' },      // 2: not a direction
    { tool: 'place_potentiometer', hole: 'e2', direction: 'left' },           // 3: legs e1, e0, e-1
    { tool: 'place_potentiometer', hole: 'b20', direction: 'up' },            // 4: legs b, a, past a
    { tool: 'place_potentiometer', hole: `e${COLS - 1}`, direction: 'right' }, // 5: legs e62, e63, e64
    { tool: 'add_wire', from: 'a3' },                                         // 6: no `to`
  ];
  const { board, errors } = Board.apply(Board.empty(), bad.concat({ tool: 'place_resistor', holeA: 'b2', holeB: 'b6' }));
  assert.deepStrictEqual(errors.map(e => [e.index, e.tool]), bad.map((a, i) => [i, a.tool]),
    `each malformed action should be one error; got ${JSON.stringify(errors)}`);
  assert.deepStrictEqual(board.parts.map(p => [p.label, p.holes]), [['R1', ['b2', 'b6']]]);
  assert.deepStrictEqual(board.wires, []);
});

test('add_wire with an end that is neither a hole nor LABEL.k is an error and skipped', () => {
  const { board, errors } = Board.apply(Board.empty(), [
    { tool: 'place_battery' },                                  // 0
    { tool: 'add_wire', from: 'battery_0_pin0', to: 'tp_63' },  // 1: the old pin form
    { tool: 'add_wire', from: 'a2', to: 'nowhere' },            // 2: not an address at all
    { tool: 'add_wire', from: 'BAT1.0', to: 'tp_63' },          // 3: applied → W1
  ]);
  assert.deepStrictEqual(errors.map(e => [e.index, e.tool]), [[1, 'add_wire'], [2, 'add_wire']],
    `expected errors at 1 and 2; got ${JSON.stringify(errors)}`);
  assert.deepStrictEqual(board.wires, [{ id: 'W1', from: 'BAT1.0', to: 'tp_63' }]);
  assert.doesNotThrow(() => Board.toSim(board), 'toSim must accept the board apply returned');
});

// ── Wire ends name a part case-insensitively ───────────────────────────
// Ids.findByLabel ignores case, so apply accepts "bat1.0"; toSim must then
// find BAT1 too, not throw.

test('add_wire from "bat1.0" lands on BAT1 pin 0: no error, and toSim resolves it', () => {
  const board = applyOk(Board.empty(), [
    { tool: 'place_battery' },
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6' },
    { tool: 'add_wire', from: 'bat1.0', to: 'tp_3' },
    { tool: 'add_wire', from: 'Bat1.1', to: 'tn_7' },
    { tool: 'add_wire', from: 'tp_2', to: 'a2' },
    { tool: 'add_wire', from: 'a6', to: 'tn_6' },
  ]);
  let sim;
  assert.doesNotThrow(() => { sim = Board.toSim(board); });
  const bat = sim.components.find(c => c.label === 'BAT1');
  assert.strictEqual(sim.wires[0].startComp, bat);
  assert.equal(sim.wires[0].startPinIdx, 0);
  assert.strictEqual(sim.wires[1].startComp, bat);
  assert.equal(sim.wires[1].startPinIdx, 1);
  const r = Sim.analyze(sim.components, sim.wires);
  const i = r.parts.R1.m.current;   // 9 V / 470 Ω = 19.149 mA
  assert.ok(Math.abs(i - 19.149) < 0.01, `R1 expected 19.149 mA, got ${i}`);
});

// ── Hole names: any case in, lower case stored; junk refused ────────────

test('place_resistor at "B2"–"B6" stores holes b2, b6 and simulates', () => {
  const board = applyOk(Board.empty(), [{ tool: 'place_resistor', holeA: 'B2', holeB: 'B6' }]);
  assert.deepStrictEqual(partOf(board, 'R1').holes, ['b2', 'b6']);
  assert.doesNotThrow(() => Board.toSim(board), 'toSim must accept the board apply returned');
});

test('add_wire to "TP_3" is stored as tp_3', () => {
  const board = applyOk(Board.empty(), [
    { tool: 'place_battery' },
    { tool: 'add_wire', from: 'BAT1.0', to: 'TP_3' },
  ]);
  assert.deepStrictEqual(board.wires, [{ id: 'W1', from: 'BAT1.0', to: 'tp_3' }]);
  assert.doesNotThrow(() => Board.toSim(board), 'toSim must accept the board apply returned');
});

test('place_resistor with holeA "zz" is an error and places nothing', () => {
  const { board, errors } = Board.apply(Board.empty(), [
    { tool: 'place_battery' },                                  // 0
    { tool: 'place_resistor', holeA: 'zz', holeB: 'b6' },       // 1: not a hole
  ]);
  assert.deepStrictEqual(errors.map(e => [e.index, e.tool]), [[1, 'place_resistor']],
    `expected an error at 1; got ${JSON.stringify(errors)}`);
  assert.deepStrictEqual(labels(board), ['BAT1']);
});

// ── A null argument means "not given" ───────────────────────────────────

test('place_resistor with resistance: null keeps the default 470 Ω, not null', () => {
  const board = applyOk(Board.empty(), [
    { tool: 'place_battery' },
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6', resistance: null },
    { tool: 'add_wire', from: 'BAT1.0', to: 'tp_63' },
    { tool: 'add_wire', from: 'BAT1.1', to: 'tn_63' },
    { tool: 'add_wire', from: 'tp_2', to: 'a2' },
    { tool: 'add_wire', from: 'a6', to: 'tn_6' },
  ]);
  const values = partOf(board, 'R1').values || {};
  assert.ok(!Object.hasOwn(values, 'resistance'), `values.resistance should be absent; got ${JSON.stringify(values.resistance)}`);
  const r = simulate(board);
  const i = r.parts.R1.m.current;   // the default 470 Ω on 9 V: 19.149 mA
  assert.ok(Math.abs(i - 19.149) < 0.01, `R1 expected 19.149 mA at the default 470 Ω, got ${i}`);
});

test('set_value with voltage: null leaves the voltage as it was', () => {
  const board = applyOk(Board.empty(), [
    { tool: 'place_battery', voltage: 6 },
    { tool: 'set_value', part: 'BAT1', voltage: null },
  ]);
  assert.equal(partOf(board, 'BAT1').values.voltage, 6);
});

// ── Ids are stable ──────────────────────────────────────────────────────

test('wire ids are never renumbered: W1 and W3 survive W2, and the next wire is W4', () => {
  const out = applyOk(Board.empty(), [
    { tool: 'add_wire', from: 'a1', to: 'a5' },
    { tool: 'add_wire', from: 'b1', to: 'b5' },
    { tool: 'add_wire', from: 'c1', to: 'c5' },
    { tool: 'delete_wire', wire: 'W2' },
    { tool: 'add_wire', from: 'd1', to: 'd5' },
  ]);
  assert.deepStrictEqual(out.wires, [
    { id: 'W1', from: 'a1', to: 'a5' },
    { id: 'W3', from: 'c1', to: 'c5' },
    { id: 'W4', from: 'd1', to: 'd5' },
  ]);
});

test('after delete_all, the next wire is W1 and the next resistor R1', () => {
  const out = applyOk(Board.fromExample(CONTRACT_LED), [
    { tool: 'place_resistor', holeA: 'd10', holeB: 'd14' },    // R2
    { tool: 'add_wire', from: 'a10', to: 'a20' },               // W5
    { tool: 'delete_all' },
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6' },
    { tool: 'add_wire', from: 'tp_3', to: 'a2' },
  ]);
  assert.deepStrictEqual(labels(out), ['R1']);
  assert.deepStrictEqual(wireIds(out), ['W1']);
});

test("labels follow ids.js nextLabel: a deleted R2 isn't reused while R3 exists; the highest number frees up", () => {
  const place = { tool: 'place_resistor', holeA: 'b2', holeB: 'b6' };
  const out = applyOk(Board.empty(), [place, place, place, { tool: 'delete_part', part: 'R2' }, place]);
  assert.deepStrictEqual(labels(out), ['R1', 'R3', 'R4']);

  // Highest in use + 1: with R3 gone too, R2 and R3 are both free and R2 comes next.
  const top = applyOk(out, [{ tool: 'delete_part', part: 'R4' }, { tool: 'delete_part', part: 'R3' }, place]);
  assert.deepStrictEqual(labels(top), ['R1', 'R2']);

  // Numbering is per prefix: an LED after R1 and R2 is LED1.
  const mixed = applyOk(Board.empty(), [place, place, { tool: 'place_led', holeA: 'c8', holeB: 'c6' }]);
  assert.deepStrictEqual(labels(mixed), ['R1', 'R2', 'LED1']);
});

test('apply labels parts exactly as chat.js predictLabels predicts them', () => {
  const actions = [
    { tool: 'place_battery' },
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6' },
    { tool: 'place_resistor', holeA: 'b10', holeB: 'b14' },
    { tool: 'delete_part', part: 'R1' },
    { tool: 'place_resistor', holeA: 'b20', holeB: 'b24' },
    { tool: 'place_seven_segment', hole: 'f30', direction: 'right' },
    { tool: 'place_button', holeA: 'b40', holeB: 'b43' },
  ];
  const predicted = Chat.predictLabels(actions, []).filter(Boolean);   // ['BAT1', 'R1', 'R2', 'R3', 'DS1', 'SW1']
  const out = applyOk(Board.empty(), actions);
  const placed = predicted.filter(l => l !== 'R1');                     // R1 was deleted
  assert.deepStrictEqual(labels(out), placed);
});

// ── Known answers: every part's ai.recipe, built from its actions ───────
// recipeActions (test/fixtures/recipe-steps.js) turns the recipe Example
// into the AI tool calls it stands for; applied to an empty board and
// simulated, each must meet the recipe's own `expect`.

for (const def of Parts.all()) {
  if (!(def.ai && def.ai.recipe)) continue;
  const recipe = def.ai.recipe;
  test(`${def.type} ai.recipe built from actions meets its expect: ${recipe.name}`, () => {
    const board = applyOk(Board.empty(), recipeActions(recipe));
    assert.deepStrictEqual(labels(board), recipe.parts.map(p => p.label), 'labels must follow placement order');
    const r = simulate(board);
    assert.equal(r.status, 'ok', `status ${r.status}; ${(r.lines || []).map(l => l.text).join(' | ')}`);
    assert.equal(r.shorted, false, 'shorted');
    checkExpect(recipe.name, recipe.expect, r);
  });
}

// ── A mixed circuit, by hand ────────────────────────────────────────────
// The prompt's "ONE BUTTON SWITCHING SEPARATE BRANCHES" recipe at C=2: a 9 V
// battery on the rails, a push button from the + rail (column 2) to a feed
// column (5), and two branches from that column, each 470 Ω + red LED to
// the − rail. One lead per hole; rail wires land in row a.
//
// Hand calculation, button pressed. Ideal 9 V battery; each red LED is a D
// with vf = 2.0 V and ron = 0.1 Ω; the closed button is 1 mΩ.
//   Per branch: I = (9 − 2.0 − V_button) / (470 + 0.1)
//   V_button = 2·I · 0.001 Ω ≈ 30 µV, negligible.
//   I = 7 / 470.1 = 14.891 mA in each LED, the contract Example's 14.9 mA;
//   the button carries 2·I = 29.78 mA.
// Released: the button is open, nothing reaches column 5, both LEDs are dark.

const BUTTON_TWO_BRANCHES = [
  { tool: 'delete_all' },
  { tool: 'place_battery' },
  { tool: 'add_wire', from: 'BAT1.0', to: 'tp_63', color: 'red' },
  { tool: 'add_wire', from: 'BAT1.1', to: 'tn_63', color: 'black' },
  { tool: 'place_button', holeA: 'b2', holeB: 'b5' },
  { tool: 'add_wire', from: 'tp_3', to: 'a2', color: 'red' },       // + rail into the button
  { tool: 'add_wire', from: 'a5', to: 'a8' },                        // feed column 5 → branch 1
  { tool: 'place_resistor', holeA: 'b8', holeB: 'b12', resistance: 470 },
  { tool: 'place_led', holeA: 'c14', holeB: 'c12', color: 'red' },   // cathode c14, anode c12
  { tool: 'add_wire', from: 'a14', to: 'tn_14', color: 'black' },
  { tool: 'add_wire', from: 'c5', to: 'a16' },                       // feed column 5 → branch 2
  { tool: 'place_resistor', holeA: 'b16', holeB: 'b20', resistance: 470 },
  { tool: 'place_led', holeA: 'c22', holeB: 'c20', color: 'red' },
  { tool: 'add_wire', from: 'a22', to: 'tn_22', color: 'black' },
];
const BRANCH_MA = 7 / 470.1 * 1000;   // 14.891 mA

test('button + two parallel LED branches, released: both LEDs off at about 0 mA', () => {
  const board = applyOk(Board.empty(), BUTTON_TWO_BRANCHES);
  assert.deepStrictEqual(labels(board), ['BAT1', 'SW1', 'R1', 'LED1', 'R2', 'LED2']);
  const r = simulate(board);
  assert.equal(r.status, 'ok', `status ${r.status}`);
  for (const led of ['LED1', 'LED2']) {
    assert.equal(r.parts[led].m.on, false, `${led} should be off with the button released`);
    assert.ok(Math.abs(r.parts[led].m.current) < 0.01, `${led} expected ≈0 mA, got ${r.parts[led].m.current}`);
  }
  assert.ok(r.parts.SW1.m.current < 0.01, `SW1 expected ≈0 mA, got ${r.parts.SW1.m.current}`);
});

test('button + two parallel LED branches, pressed by set_control: each LED 14.9 mA, the button twice that', () => {
  const board = applyOk(Board.empty(), BUTTON_TWO_BRANCHES.concat({ tool: 'set_control', part: 'SW1', pressed: true }));
  const r = simulate(board);
  assert.equal(r.status, 'ok', `status ${r.status}`);
  assert.equal(r.shorted, false);
  for (const led of ['LED1', 'LED2']) {
    const i = r.parts[led].m.current;
    assert.equal(r.parts[led].m.on, true, `${led} should light with the button pressed`);
    assert.ok(i >= 14.0 && i <= 15.8, `${led} expected 14.0–15.8 mA (hand: ${BRANCH_MA.toFixed(3)}), got ${i}`);
    assert.ok(Math.abs(i - BRANCH_MA) < 0.01, `${led} expected ${BRANCH_MA.toFixed(3)} mA, got ${i}`);
  }
  const sw = r.parts.SW1.m.current;
  assert.ok(Math.abs(sw - 2 * BRANCH_MA) < 0.02, `SW1 expected ${(2 * BRANCH_MA).toFixed(3)} mA, got ${sw}`);
});

// ── Board.toActions: a board as the actions that rebuild it (issue #84) ──
// Contract (decided on the issue; the builder matches it):
// - Board.toActions(board) → { actions, labelMap }. Never mutates board.
//   actions = [delete_all, one place_* per part in board order (span:
//   holeA/holeB = holes; footprint: hole = holes[0] + the direction whose
//   footprintLegs are exactly `holes`; off-board: no holes), the part's
//   values as tool arguments; then add_wire { from, to } per wire, in
//   order; then set_control { part, ...controls } per part with controls].
// - Labels are re-predicted by placement order, so a board with gaps
//   (R1, R3) rebuilds as R1, R2. labelMap maps each old label to its new
//   one (an unchanged label may be left out), and every LABEL.k wire end is
//   rewritten through it (R3.0 → R2.0).
// - Property: Board.apply(Board.empty(), toActions(b).actions).board is b
//   up to the label map and wire ids, and simulates identically.

// The new label for `old`: labelMap[old], or old when the map leaves it out.
const renamed = (labelMap, old) => (labelMap && Object.hasOwn(labelMap, old) ? labelMap[old] : old);
const renameEnd = (labelMap, end) => {
  const m = /^([A-Za-z]+\d+)\.(\w+)$/.exec(String(end));
  return m ? `${renamed(labelMap, m[1])}.${m[2]}` : String(end).toLowerCase();
};

function toActions(board) {
  assert.equal(typeof Board.toActions, 'function', 'board-model.js exports no toActions(board)');
  const out = Board.toActions(board);
  assert.ok(out && Array.isArray(out.actions), `toActions must return { actions, labelMap }; got ${JSON.stringify(out)}`);
  assert.ok(out.labelMap && typeof out.labelMap === 'object', `toActions must return a labelMap object; got ${JSON.stringify(out.labelMap)}`);
  return out;
}

// Rebuilds `board` from its actions and checks it is the same board up to
// labels and wire ids: same parts in order (type, holes, values, controls),
// same wires in order with ends renamed, and the same simulation.
function roundTrip(name, board) {
  const { actions, labelMap } = toActions(board);
  assert.deepStrictEqual(actions[0], { tool: 'delete_all' }, `${name}: the rebuild starts with delete_all`);
  const rebuilt = applyOk(Board.empty(), actions);

  assert.deepStrictEqual(labels(rebuilt), board.parts.map(p => renamed(labelMap, p.label)), `${name}: labels through the labelMap`);
  board.parts.forEach((p, i) => {
    const q = rebuilt.parts[i];
    assert.equal(q.type, p.type, `${name}: part ${i} type`);
    assert.deepStrictEqual(q.holes || null, p.holes ? p.holes.map(h => h.toLowerCase()) : null, `${name}: ${p.label} holes`);
    assert.deepStrictEqual(q.values || {}, p.values || {}, `${name}: ${p.label} values`);
    assert.deepStrictEqual(q.controls || {}, p.controls || {}, `${name}: ${p.label} controls`);
  });
  assert.deepStrictEqual(rebuilt.wires.map(w => [w.from, w.to]),
    board.wires.map(w => [renameEnd(labelMap, w.from), renameEnd(labelMap, w.to)]), `${name}: wires, ends renamed`);

  const before = simulate(board), after = simulate(rebuilt);
  assert.equal(after.status, before.status, `${name}: status`);
  assert.equal(after.shorted, before.shorted, `${name}: shorted`);
  for (const p of board.parts) {
    const a = before.parts[p.label], b = after.parts[renamed(labelMap, p.label)];
    assert.deepStrictEqual(b && b.m, a && a.m, `${name}: ${p.label} simulates the same after the rebuild`);
  }
  return { actions, labelMap, rebuilt, before, after };
}

test('toActions(one-LED contract board): delete_all, the parts, the wires; the rebuild lights LED1 at 14.9 mA', () => {
  const board = Board.fromExample(CONTRACT_LED);
  const { actions, labelMap, after } = roundTrip('contract LED', board);
  assert.deepStrictEqual(actions, [
    { tool: 'delete_all' },
    { tool: 'place_battery' },
    { tool: 'place_resistor', holeA: 'a2', holeB: 'a6' },
    { tool: 'place_led', holeA: 'b8', holeB: 'b6', color: 'red' },
    { tool: 'add_wire', from: 'BAT1.0', to: 'tp_50' },
    { tool: 'add_wire', from: 'BAT1.1', to: 'tn_50' },
    { tool: 'add_wire', from: 'tp_2', to: 'b2' },
    { tool: 'add_wire', from: 'c8', to: 'tn_8' },
  ]);
  for (const l of ['BAT1', 'R1', 'LED1']) assert.equal(renamed(labelMap, l), l, `${l} keeps its label`);
  checkExpect(CONTRACT_LED.name, CONTRACT_LED.expect, after);
});

test('toActions does not mutate the board it is given', () => {
  const board = Board.fromExample(CONTRACT_LED);
  const copy = JSON.parse(JSON.stringify(board));
  toActions(board);
  assert.deepStrictEqual(board, copy);
});

// Label gaps: a lone battery BAT2, resistors R1 and R3, LEDs LED1 and LED2.
// Two branches off the 9 V rails:
//   R1 470 Ω b2–b6, LED1 anode c6 / cathode c8, tp_3 → a2, a8 → tn_8
//     I = (9 − 2.0) / (470 + 0.1) = 14.891 mA
//   R3 1 kΩ b10–b14, LED2 anode c14 / cathode c16, tp_11 → R3.0, a16 → tn_16
//     I = (9 − 2.0) / (1000 + 0.1) = 6.999 mA
// Placement order rebuilds BAT2 → BAT1 and R3 → R2, so the wires on BAT2.k
// and R3.0 are rewritten.
const GAPS = {
  parts: [
    { type: 'battery',  label: 'BAT2' },
    { type: 'resistor', label: 'R1', holes: ['b2', 'b6'], values: { resistance: 470 } },
    { type: 'led',      label: 'LED1', holes: ['c8', 'c6'], values: { color: 'red' } },
    { type: 'resistor', label: 'R3', holes: ['b10', 'b14'], values: { resistance: 1000 } },
    { type: 'led',      label: 'LED2', holes: ['c16', 'c14'], values: { color: 'red' } },
  ],
  wires: [
    { id: 'W2', from: 'BAT2.0', to: 'tp_63' },
    { id: 'W5', from: 'BAT2.1', to: 'tn_63' },
    { id: 'W6', from: 'tp_3',   to: 'a2' },
    { id: 'W7', from: 'a8',     to: 'tn_8' },
    { id: 'W9', from: 'tp_11',  to: 'R3.0' },
    { id: 'W10', from: 'a16',   to: 'tn_16' },
  ],
};

test('toActions on a board with label gaps (BAT2, R1, R3): labelMap BAT2 → BAT1, R3 → R2, and the wire ends follow', () => {
  const { actions, labelMap, before, after } = roundTrip('label gaps', GAPS);
  assert.equal(renamed(labelMap, 'BAT2'), 'BAT1');
  assert.equal(renamed(labelMap, 'R3'), 'R2');
  for (const l of ['R1', 'LED1', 'LED2']) assert.equal(renamed(labelMap, l), l, `${l} keeps its label`);

  const wires = actions.filter(a => a.tool === 'add_wire').map(a => [a.from, a.to]);
  assert.deepStrictEqual(wires, [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_3', 'a2'], ['a8', 'tn_8'], ['tp_11', 'R2.0'], ['a16', 'tn_16']]);
  assert.ok(!JSON.stringify(actions).includes('BAT2') && !JSON.stringify(actions).includes('R3'), `no old label left in ${JSON.stringify(actions)}`);

  // Hand-computed currents, before and after.
  for (const r of [before, after]) {
    assert.equal(r.status, 'ok');
    assert.ok(Math.abs(r.parts.LED1.m.current - 7 / 470.1 * 1000) < 0.01, `LED1 expected 14.891 mA, got ${r.parts.LED1.m.current}`);
    assert.ok(Math.abs(r.parts.LED2.m.current - 7 / 1000.1 * 1000) < 0.01, `LED2 expected 6.999 mA, got ${r.parts.LED2.m.current}`);
  }
});

// A footprint part and a bench supply, with gaps: PS2 at 9 V, the
// seven-segment recipe's display DS1 (hole f30, right) and its three 470 Ω
// resistors labelled R1, R5, R3. Rebuilt in order: PS2 → PS1, R5 → R2, R3
// stays R3 (R1 and R2 are taken by then). It still shows "7".
const MIXED = {
  parts: [
    { type: 'bench_supply',  label: 'PS2', values: { voltage: 9 } },
    { type: 'seven_segment', label: 'DS1', holes: ['f30', 'f31', 'f32', 'f33', 'f34', 'e34', 'e33', 'e32', 'e31', 'e30'] },
    { type: 'resistor',      label: 'R1', holes: ['b33', 'b37'], values: { resistance: 470 } },
    { type: 'resistor',      label: 'R5', holes: ['c34', 'c39'], values: { resistance: 470 } },
    { type: 'resistor',      label: 'R3', holes: ['h33', 'h37'], values: { resistance: 470 } },
  ],
  wires: [
    { id: 'W1', from: 'PS2.0', to: 'tp_63' },
    { id: 'W2', from: 'PS2.1', to: 'tn_63' },
    { id: 'W3', from: 'tp_37', to: 'a37' },
    { id: 'W4', from: 'tp_39', to: 'a39' },
    { id: 'W5', from: 'e37',   to: 'f37' },
    { id: 'W6', from: 'a32',   to: 'tn_32' },
  ],
};

test('toActions with a footprint part and a bench supply: hole + direction, PS2 → PS1, R5 → R2, and the display still shows 7', () => {
  const { actions, labelMap, after } = roundTrip('footprint + bench supply', MIXED);
  assert.deepStrictEqual(actions.find(a => a.tool === 'place_seven_segment'), { tool: 'place_seven_segment', hole: 'f30', direction: 'right' });
  assert.deepStrictEqual(actions.find(a => a.tool === 'place_bench_supply'), { tool: 'place_bench_supply', voltage: 9 });
  assert.equal(renamed(labelMap, 'PS2'), 'PS1');
  assert.equal(renamed(labelMap, 'R5'), 'R2');
  assert.equal(renamed(labelMap, 'R3'), 'R3');
  assert.deepStrictEqual(actions.filter(a => a.tool === 'add_wire').slice(0, 2).map(a => a.from), ['PS1.0', 'PS1.1']);
  assert.equal(after.parts.DS1.m.digit, '7');
});

test('toActions ends with one set_control per part that has controls', () => {
  const board = { parts: [
    { type: 'battery', label: 'BAT1' },
    { type: 'toggle_switch', label: 'S1', holes: ['b2', 'b4'], controls: { closed: true } },
    { type: 'button', label: 'SW1', holes: ['b12', 'b15'], controls: { pressed: true } },
  ], wires: [] };
  const { actions } = roundTrip('controls', board);
  assert.deepStrictEqual(actions.slice(-2), [
    { tool: 'set_control', part: 'S1', closed: true },
    { tool: 'set_control', part: 'SW1', pressed: true },
  ]);
});

// Every registered example and recipe (37 examples: every part type, span,
// footprint and off-board, with values and controls) survives the round trip.
for (const def of Parts.all()) {
  const cases = (def.examples || []).map((ex, i) => [`${def.type} examples[${i}]`, ex]);
  if (def.ai && def.ai.recipe) cases.push([`${def.type} ai.recipe`, def.ai.recipe]);
  for (const [name, ex] of cases) {
    test(`toActions round trip: ${name} rebuilds and simulates the same`, () => {
      roundTrip(name, Board.fromExample(ex));
    });
  }
}

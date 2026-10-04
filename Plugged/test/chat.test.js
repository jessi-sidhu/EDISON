// Tests for chat.js: turning the AI's actions into board changes.

const assert = require('node:assert');
const Chat = require('../circuit3d/js/chat.js');

// Where the fake board says an AI battery goes: off the right-hand end of a
// board BOARD_W wide, right behind the top rails (tp/tn midpoint, z = -3.15).
// chat.js never works this out itself; it asks the board (issue #6).
const spotFor = BOARD_W => ({ x: BOARD_W / 2 + 2.5, z: -3.15 });

// The real board's width, from circuit3d/js/board-geometry.js (issue #22).
// NaN while that file is missing, so only the test that checks the width
// fails for it; the others don't read the battery's x.
const boardWidth = () => {
  try { return require('../circuit3d/js/board-geometry.js').BOARD_W; } catch { return NaN; }
};

// Stands in for the 3D board. Records wires instead of drawing them.
// holeMap() is App.holeMap() (issue #24): an empty board unless a test gives
// one. note(text) shows a refusal in the chat; the fake keeps them in notes.
// Since #27 (D2) every part is placed through one method,
// placePart(type, where, values): `where` is the part's holes (getHole's
// objects, one per pin, in pin order) or, off the board, the { x, z }
// batterySpot() gave. There are no per-type place* methods any more.
function fakeBoard(parts) {
  const wires = [];
  const notes = [];
  return {
    wires,
    notes,
    note: text => notes.push(text),
    holeMap: () => new Map(),
    components: () => parts,
    batterySpot: () => spotFor(boardWidth()),   // the real board, 63 columns
    parseHole: s => {
      const m = /^([a-j])(\d+)$/.exec(s);
      if (!m) throw new Error('parseHole: unrecognised hole address: ' + s);
      return { row: m[1], col: +m[2] - 1 };
    },
    getHole: (col, row) => ({ col, row }),
    placePart: () => ({}), clearAll: () => {},
    addWire: (a, b) => { wires.push([a, b]); return true; },
  };
}

test('battery_0 resolves to the first battery even when it is not component 0', () => {
  const bat = { type: 'battery' };
  const board = fakeBoard([{ type: 'resistor' }, { type: 'led' }, bat]);
  assert.deepEqual(Chat.resolveEndpoint('battery_0_pin0', board), { comp: bat, pin: 0 });
});

test('a hole address resolves to that hole, and a bad one to null', () => {
  const board = fakeBoard([]);
  assert.deepEqual(Chat.resolveEndpoint('e14', board), { hole: { col: 13, row: 'e' } });
  assert.equal(Chat.resolveEndpoint('zz99', board), null);
});

test('unknown battery ref fails without throwing', () => {
  const board = fakeBoard([{ type: 'resistor' }]);
  const out = Chat.applyActions([{ tool: 'add_wire', from: 'battery_3_pin0', to: 'a5', color: 'red' }], board);
  assert.deepEqual(out, { applied: 0, failed: 1 });
  assert.equal(board.wires.length, 0);
});

test('accepting a build runs every action inside one board.batch, for one undo step', () => {
  const log = [];
  const board = Object.assign(fakeBoard([]), {
    batch: fn => { log.push('batch start'); const out = fn(); log.push('batch end'); return out; },
    clearAll: () => log.push('clear'),
    placePart: type => log.push(type),
  });
  const out = Chat.acceptBuild([{ tool: 'delete_all' }, { tool: 'place_battery' }], board);
  assert.deepEqual(out, { applied: 2, failed: 0 });
  assert.deepEqual(log, ['batch start', 'clear', 'battery', 'batch end']);
});

test('a full build places every part and passes the wire colour through', () => {
  const parts = [];
  const calls = [];
  const board = Object.assign(fakeBoard(parts), {
    clearAll:      () => { parts.length = 0; calls.push('clear'); },
    placePart:     (type, where) => {
      parts.push({ type });
      calls.push(Array.isArray(where)
        ? `${type} ${where.map(h => `${h.row}${h.col + 1}`).join('-')}`
        : type);
    },
    addWire:       (a, b, hex) => { calls.push(`wire ${hex.toString(16)}`); return true; },
  });

  const out = Chat.applyActions([
    { tool: 'delete_all' },
    { tool: 'place_battery' },
    { tool: 'add_wire', from: 'battery_0_pin0', to: 'a2', color: 'red' },
    { tool: 'place_resistor', holeA: 'a2', holeB: 'a6' },
    { tool: 'place_led', holeA: 'a8', holeB: 'a6' },
  ], board);

  assert.deepEqual(out, { applied: 5, failed: 0 });
  assert.deepEqual(calls, ['clear', 'battery', 'wire ef4444', 'resistor a2-a6', 'led a8-a6']);
});

test('op_amp_0_pin1 resolves to pin 1 of the first op amp', () => {
  const amp = { type: 'op_amp' };
  const board = fakeBoard([{ type: 'resistor' }, amp]);
  assert.deepEqual(Chat.resolveEndpoint('op_amp_0_pin1', board), { comp: amp, pin: 1 });
});

// ── Label form (R2.1, BAT1.0), issue #8 ────────────────────────────────────

const Ids = require('../circuit3d/js/ids.js');

// A board whose placePart labels parts the way App.placePart does.
function labellingBoard(parts) {
  const add = type => parts.push({ type, label: Ids.nextLabel(parts, type) });
  return Object.assign(fakeBoard(parts), {
    clearAll:      () => { parts.length = 0; },
    placePart:     type => add(type),
  });
}

test('with parts [R1, R2], after R1 is deleted, R2.1 finds pin 1 of R2', () => {
  const r1 = { type: 'resistor', label: 'R1' }, r2 = { type: 'resistor', label: 'R2' };
  const parts = [r1, r2];
  parts.splice(0, 1);                                  // R1 deleted
  const board = fakeBoard(parts);
  assert.deepEqual(Chat.resolveEndpoint('R2.1', board), { comp: r2, pin: 1 });
});

test('BAT1.0 is the same pin as battery_0_pin0', () => {
  const bat = { type: 'battery', label: 'BAT1' };
  const board = fakeBoard([{ type: 'resistor', label: 'R1' }, bat]);
  assert.deepEqual(Chat.resolveEndpoint('BAT1.0', board), { comp: bat, pin: 0 });
  assert.deepEqual(Chat.resolveEndpoint('BAT1.0', board), Chat.resolveEndpoint('battery_0_pin0', board));
  assert.deepEqual(Chat.resolveEndpoint('BAT1.1', board), Chat.resolveEndpoint('battery_0_pin1', board));
});

test('the old battery_0_pin0 form still resolves on a labelled board', () => {
  const bat = { type: 'battery', label: 'BAT1' };
  const board = fakeBoard([{ type: 'resistor', label: 'R1' }, bat]);
  assert.deepEqual(Chat.resolveEndpoint('battery_0_pin1', board), { comp: bat, pin: 1 });
});

test('a label no part has resolves to null', () => {
  const board = fakeBoard([{ type: 'resistor', label: 'R1' }]);
  assert.equal(Chat.resolveEndpoint('R9.0', board), null);
});

test('a label-form ref to a named pin like U1.OUT resolves to null', () => {
  const board = fakeBoard([{ type: 'op_amp', label: 'U1' }]);
  assert.equal(Chat.resolveEndpoint('U1.OUT', board), null);
});

test('accepting delete_all, place_battery, then a wire from BAT1.0 wires the new battery', () => {
  const parts = [{ type: 'battery', label: 'BAT1' }, { type: 'resistor', label: 'R1' }];
  const board = labellingBoard(parts);
  const out = Chat.applyActions([
    { tool: 'delete_all' },
    { tool: 'place_battery' },
    { tool: 'add_wire', from: 'BAT1.0', to: 'a2', color: 'red' },
  ], board);
  assert.deepEqual(out, { applied: 3, failed: 0 });
  assert.equal(board.wires.length, 1);
  assert.equal(board.wires[0][0].comp, parts[0]);     // the battery placed after delete_all
  assert.equal(board.wires[0][0].pin, 0);
});

// The preview draws parts that do not exist yet, so it has to predict the
// label each place_* action will give its part. predictLabels(actions,
// components) returns one entry per action: that label, or null.
test('the preview predicts BAT1 for a battery placed after delete_all, so a wire to BAT1.0 reaches it', () => {
  assert.equal(typeof Chat.predictLabels, 'function', 'chat.js must export predictLabels(actions, components)');
  const board = [{ type: 'battery', label: 'BAT1' }, { type: 'resistor', label: 'R1' }];
  const actions = [
    { tool: 'delete_all' },
    { tool: 'place_battery' },
    { tool: 'add_wire', from: 'BAT1.0', to: 'tp_2', color: 'red' },
  ];
  assert.deepEqual(Chat.predictLabels(actions, board), [null, 'BAT1', null]);
});

test('the preview predicts BAT1 on an empty board', () => {
  assert.equal(typeof Chat.predictLabels, 'function', 'chat.js must export predictLabels(actions, components)');
  const actions = [
    { tool: 'delete_all' },
    { tool: 'place_battery' },
    { tool: 'add_wire', from: 'BAT1.0', to: 'tp_2', color: 'red' },
    { tool: 'add_wire', from: 'BAT1.1', to: 'tn_8', color: 'black' },
  ];
  assert.deepEqual(Chat.predictLabels(actions, []), [null, 'BAT1', null, null]);
});

test('without delete_all, a battery added next to BAT1 is predicted as BAT2', () => {
  assert.equal(typeof Chat.predictLabels, 'function', 'chat.js must export predictLabels(actions, components)');
  const board = [{ type: 'battery', label: 'BAT1' }];
  const actions = [
    { tool: 'place_battery' },
    { tool: 'add_wire', from: 'BAT2.0', to: 'tp_2', color: 'red' },
  ];
  assert.deepEqual(Chat.predictLabels(actions, board), ['BAT2', null]);
});

test('predicted labels count each type separately and follow the board, gaps included', () => {
  assert.equal(typeof Chat.predictLabels, 'function', 'chat.js must export predictLabels(actions, components)');
  const board = [{ type: 'resistor', label: 'R2' }];     // R1 was deleted
  const actions = [
    { tool: 'place_resistor', holeA: 'a2',  holeB: 'a6' },
    { tool: 'place_led',      holeA: 'a8',  holeB: 'a6' },
    { tool: 'delete_all' },
    { tool: 'place_resistor', holeA: 'a10', holeB: 'a14' },
    { tool: 'place_battery' },
  ];
  assert.deepEqual(Chat.predictLabels(actions, board), ['R3', 'LED1', null, 'R1', 'BAT1']);
});

// ── Part values (1 kΩ, green, 5 V), issue #9 ───────────────────────────────

// A board that records the values object each placePart call receives: the
// third argument for parts on the breadboard and for the battery alike.
function valuesBoard() {
  const got = [];
  const board = Object.assign(fakeBoard([]), {
    placePart: (type, where, v) => got.push([type, v]),
  });
  board.got = got;
  return board;
}

test('place_resistor with resistance:1000 calls placePart("resistor", holes, { resistance: 1000 })', () => {
  const board = valuesBoard();
  const out = Chat.applyActions([{ tool: 'place_resistor', holeA: 'a2', holeB: 'a6', resistance: 1000 }], board);
  assert.deepEqual(out, { applied: 1, failed: 0 });
  assert.deepStrictEqual(board.got, [['resistor', { resistance: 1000 }]]);
});

test('place_led with color:"green" calls placePart("led", holes, { color: "green" })', () => {
  const board = valuesBoard();
  Chat.applyActions([{ tool: 'place_led', holeA: 'a8', holeB: 'a6', color: 'green' }], board);
  assert.deepStrictEqual(board.got, [['led', { color: 'green' }]]);
});

test('place_battery with voltage:5 calls placePart("battery", spot, { voltage: 5 })', () => {
  const board = valuesBoard();
  Chat.applyActions([{ tool: 'place_battery', voltage: 5 }], board);
  assert.deepStrictEqual(board.got, [['battery', { voltage: 5 }]]);
});

// Only the key that belongs to the part reaches the board: a resistor takes
// no colour, an LED no resistance, and anything unknown is left behind.
test('each part gets only its own value key, never another part\'s or an unknown one', () => {
  const board = valuesBoard();
  Chat.applyActions([
    { tool: 'place_resistor', holeA: 'a2', holeB: 'a6', resistance: 1000, color: 'green', voltage: 5, label: 'R9', junk: 1 },
    { tool: 'place_led',      holeA: 'a8', holeB: 'a6', color: 'blue', resistance: 1000, forwardVoltage: 9 },
    { tool: 'place_battery',  voltage: 5, resistance: 1000, holeA: 'a1' },
  ], board);
  assert.deepStrictEqual(board.got, [
    ['resistor', { resistance: 1000 }],
    ['led',      { color: 'blue' }],
    ['battery',  { voltage: 5 }],
  ]);
});

// Chosen shape: the third argument is always an object, and it is empty
// when the AI named no value, so App.componentValues fills in the defaults.
test('a part placed without a value gets an empty values object, so it keeps its defaults', () => {
  const board = valuesBoard();
  Chat.applyActions([
    { tool: 'place_battery' },
    { tool: 'place_resistor', holeA: 'a2', holeB: 'a6' },
    { tool: 'place_led',      holeA: 'a8', holeB: 'a6' },
  ], board);
  assert.deepStrictEqual(board.got, [['battery', {}], ['resistor', {}], ['led', {}]]);
});

test('buzzers and buttons get no values, even if the action carries some', () => {
  const board = valuesBoard();
  Chat.applyActions([
    { tool: 'place_buzzer', holeA: 'a2', holeB: 'a4', resistance: 1000, color: 'green', voltage: 5 },
    { tool: 'place_button', holeA: 'a6', holeB: 'a9', resistance: 1000, color: 'green', voltage: 5 },
  ], board);
  assert.deepStrictEqual(board.got, [['buzzer', {}], ['button', {}]]);
});

// ── Battery spot comes from the board, issue #6 ─────────────────

// A board that records where placePart was asked to put the battery.
function spotBoard(spot) {
  const got = [];
  const board = Object.assign(fakeBoard([]), {
    batterySpot:  () => spot,
    placePart:    (type, where) => got.push({ x: where.x, z: where.z }),
  });
  board.got = got;
  return board;
}

test('on a 63-column board the AI battery lands past the board end, behind the top rails', () => {
  assert.ok(Math.abs(boardWidth() - 26.6) < 1e-9, `expected the 63-column board 26.6 wide, got ${boardWidth()}`);
  const board = spotBoard(spotFor(boardWidth()));   // (63 - 1) * 0.40 + 2 * 0.90 = 26.6
  const out = Chat.applyActions([{ tool: 'place_battery' }], board);
  assert.deepEqual(out, { applied: 1, failed: 0 });
  assert.equal(board.got.length, 1);
  assert.ok(board.got[0].x > 13.3, `battery x ${board.got[0].x} is on the 63-column board, not past its end (13.3)`);
  assert.equal(board.got[0].z, -3.15);
});

test('the AI battery goes wherever the board says, with no spot of chat.js\'s own', () => {
  const board = spotBoard({ x: 99, z: -3.15 });
  Chat.acceptBuild([{ tool: 'delete_all' }, { tool: 'place_battery' }],
    Object.assign(board, { batch: fn => fn() }));
  assert.deepStrictEqual(board.got, [{ x: 99, z: -3.15 }]);
  assert.equal(Chat.BATTERY_SPOT, undefined, 'the hard-coded BATTERY_SPOT {x:13, z:0} must be gone');
});

// ── Placement checks on the AI apply path, issue #24 ────────────────────
// docs/API-CONTRACT.md → "Parts.checkPlacement". Accepting an AI build runs
// every registry part (the resistor today) through Parts.checkPlacement with
// board.holeMap() before placing it. A refused part is not placed, counts as
// failed (like an unresolved hole), and its reason is shown word for word
// through board.note(text) — in the page, a system message in the chat.
// The adapter methods this needs:
//   board.holeMap()   → App.holeMap(): Map<'a6', { label, pin } | { wire, end }>
//   board.note(text)  → shows text in the chat

const Parts = require('../circuit3d/js/parts');

// A board whose holeMap() returns the given entries, and which records what
// it was asked to place.
function mapBoard(entries, parts = []) {
  const placed = [];
  return Object.assign(fakeBoard(parts), {
    holeMap: () => new Map(entries),
    placePart: (type, where, v) => placed.push(Array.isArray(where) ? [type, where[0], where[1], v] : [type]),
    placed,
  });
}

// The registry's own reason for the same placement, so the note is checked
// word for word against it.
const reasonFor = (holes, entries) => {
  const legs = Parts.legsOf({ type: 'resistor', holeRefs: holes.map(s => ({ row: s[0], col: +s.slice(1) - 1 })) });
  return Parts.checkPlacement('resistor', legs, new Map(entries), null).reason;
};

test('the AI apply path refuses a resistor at a3 to a33: not placed, counted as failed, a note saying 3–5', () => {
  const board = mapBoard([]);
  const out = Chat.applyActions([{ tool: 'place_resistor', holeA: 'a3', holeB: 'a33' }], board);
  assert.deepEqual(out, { applied: 0, failed: 1 });
  assert.equal(board.placed.length, 0, 'placePart was not called');
  assert.equal(board.notes.length, 1, `one refusal note, got ${JSON.stringify(board.notes)}`);
  assert.ok(board.notes[0].includes('3–5'), `the note gives the allowed range: "${board.notes[0]}"`);
  assert.ok(board.notes[0].includes(reasonFor(['a3', 'a33'], [])), `the registry's reason, word for word: "${board.notes[0]}"`);
  assert.match(board.notes[0], /\bR1\b/, 'the note names the part it would have been');
});

test('the AI apply path refuses a resistor leg on a hole R1 already holds, naming R1\'s pin', () => {
  const taken = [['a6', { label: 'R1', pin: 'lead2' }]];
  const board = mapBoard(taken, [{ type: 'resistor', label: 'R1' }]);
  const out = Chat.applyActions([{ tool: 'place_resistor', holeA: 'a6', holeB: 'a10' }], board);
  assert.deepEqual(out, { applied: 0, failed: 1 });
  assert.equal(board.placed.length, 0, 'placePart was not called');
  assert.equal(board.notes.length, 1, `one refusal note, got ${JSON.stringify(board.notes)}`);
  assert.ok(board.notes[0].includes("a6 already holds R1's pin lead2"), `the note names the occupant: "${board.notes[0]}"`);
  assert.ok(board.notes[0].includes(reasonFor(['a6', 'a10'], taken)), `the registry's reason, word for word: "${board.notes[0]}"`);
});

test('a resistor leg on a wire end is refused too: wire ends count as occupants', () => {
  const board = mapBoard([['a10', { wire: 0, end: 'to' }]]);
  const out = Chat.applyActions([{ tool: 'place_resistor', holeA: 'a6', holeB: 'a10' }], board);
  assert.deepEqual(out, { applied: 0, failed: 1 });
  assert.ok(board.notes.length === 1 && board.notes[0].includes('a10 already holds the end of a wire'), JSON.stringify(board.notes));
});

test('a refused part fails alone: the rest of the build still applies, in one batch', () => {
  const board = Object.assign(mapBoard([]), { batch: fn => fn() });
  const out = Chat.acceptBuild([
    { tool: 'place_battery' },
    { tool: 'place_resistor', holeA: 'a3', holeB: 'a33' },
    { tool: 'place_resistor', holeA: 'a2', holeB: 'a6' },
  ], board);
  assert.deepEqual(out, { applied: 2, failed: 1 });
  assert.deepStrictEqual(board.placed.map(p => p[0] === 'resistor' ? `resistor ${p[1].row}${p[1].col + 1}-${p[2].row}${p[2].col + 1}` : p[0]),
    ['battery', 'resistor a2-a6']);
  assert.equal(board.notes.length, 1);
});

test('a resistor 3–5 columns apart on free holes is placed with no note', () => {
  const board = mapBoard([['a2', { label: 'LED1', pin: '1' }]]);
  const out = Chat.applyActions([{ tool: 'place_resistor', holeA: 'a3', holeB: 'a8' }], board);
  assert.deepEqual(out, { applied: 1, failed: 0 });
  assert.equal(board.placed.length, 1);
  assert.deepEqual(board.notes, []);
});

// ── One generic apply path, and set_value / set_control / delete_part (#27, D2) ──
// docs/API-CONTRACT.md → "AI tools". Shapes these tests assume (stated so the
// builder matches them):
// - chat.js keeps no PLACE or VALUE_KEY table and no per-type adapter
//   methods. Every place_<type> goes through board.placePart(type, where,
//   values), for any type Parts.get knows:
//     span / footprint parts: where = the holes, getHole's objects, one per pin
//     offboard parts:         where = board.batterySpot(), { x, z }
//   values = the action's keys the part has in its ValueSpecs, each checked
//   with Parts.checkValue. A refused value is left out (the part keeps its
//   default) and its reason goes to board.note, as the server does.
// - A place_<type> for a type the registry doesn't know places nothing,
//   counts as failed, and says so in a note naming the type.
// - The three edit actions find their part by label (Ids.findByLabel over
//   board.components()); every other key of the action is a value / control:
//     set_value   { part: 'R1', resistance: 1000 } → board.setValues(comp, { resistance: 1000 })
//     set_control { part: 'SW1', pressed: true }   → board.setControls(comp, { pressed: true })
//     delete_part { part: 'R1' }                   → board.deletePart(comp)
//   (in the page: the new model, e.g. the resistor's bands; the part and the
//   wires on its pins removed; each re-simulated if the simulation runs).
// - A refused edit changes nothing, counts as failed, and gives one
//   board.note naming the label:
//     unknown label, a value Parts.checkValue refuses (its reason word for
//     word), a key the part has no value for, a control the part doesn't
//     have (the note names the key).
// - Everything in one accepted build is one board.batch: one undo step.

const Sim     = require('../circuit3d/js/simulate.js');
const BoardIO = require('../circuit3d/js/board-io.js');
const Recipes = require('./fixtures/recipes.js');

const N = Recipes.HIGHEST_COL;

// "a2" → { col: 1, row: 'a' }; "tp_50" → { col: 49, row: 'tp' }; else null.
function holeRef(s) {
  const m = /^(?:([a-j])(\d+)|(tp|tn|bn|bp)_(\d+))$/.exec(String(s));
  if (!m) return null;
  return m[1] ? { col: Number(m[2]) - 1, row: m[1] } : { col: Number(m[4]) - 1, row: m[3] };
}

// A part's values the way App.componentValues fills them: the ValueSpec
// defaults, the given ones on top, then each choice's overrides (a green
// LED's vf).
function valuesFor(type, given) {
  const def = Parts.get(type);
  const v = {};
  for (const [key, spec] of Object.entries(def.values || {})) v[key] = spec.default;
  Object.assign(v, given || {});
  for (const [key, spec] of Object.entries(def.values || {})) {
    if (spec.choices && spec.choices[v[key]]) Object.assign(v, spec.choices[v[key]]);
  }
  return v;
}

function controlsFor(type) {
  const specs = Parts.get(type).controls;
  if (!specs) return undefined;
  const out = {};
  for (const [key, c] of Object.entries(specs)) out[key] = c.default;
  return out;
}

// A board that keeps real records, the way App leaves them, so
// Sim.analyze can solve it: each part { type, label, pins, holeRefs,
// values, controls? }, each wire { startHole | startComp + startPinIdx, end… }.
// batch(fn) records an undo step (a snapshot) and undo() goes back one, as
// App.history does. deletePart takes the wires on the part's pins with it,
// as App's delete does.
function simBoard() {
  let parts = [], wires = [];
  const steps = [];
  const notes = [];
  const calls = { batch: 0, placePart: [], setValues: [], setControls: [], deletePart: [] };

  const snap = () => JSON.stringify({
    parts: parts.map(p => ({ ...p, pins: p.pins.length })),
    wires: wires.map(w => ({ ...w, startComp: parts.indexOf(w.startComp), endComp: parts.indexOf(w.endComp) })),
  });
  const restore = s => {
    const d = JSON.parse(s);
    parts = d.parts.map(p => ({ ...p, pins: Array.from({ length: p.pins }, () => ({ x: 0, y: 0, z: 0 })) }));
    wires = d.wires.map(w => ({ ...w, startComp: parts[w.startComp] || null, endComp: parts[w.endComp] || null }));
  };
  const wireEnd = (e, side) => (e.hole
    ? { [side + 'Hole']: { col: e.hole.col, row: e.hole.row }, [side + 'Comp']: null, [side + 'PinIdx']: undefined }
    : { [side + 'Hole']: null, [side + 'Comp']: e.comp, [side + 'PinIdx']: e.pin });

  return {
    notes, calls,
    note: text => notes.push(text),
    components: () => parts,
    batterySpot: () => ({ x: 15.8, z: -3.15 }),
    parseHole: s => {
      const r = holeRef(s);
      if (!r) throw new Error('parseHole: unrecognised hole address: ' + s);
      return r;
    },
    getHole: (col, row) => ({ col, row }),
    holeMap: () => BoardIO.buildHoleMap(parts, wires),
    placePart(type, where, values) {
      calls.placePart.push([type, where, values]);
      const def = Parts.get(type);
      const rec = {
        type, label: Ids.nextLabel(parts, type),
        pins: def.pins.map(() => ({ x: 0, y: 0, z: 0 })),
        holeRefs: Array.isArray(where) ? where.map(h => ({ col: h.col, row: h.row })) : null,
        values: valuesFor(type, values),
      };
      const controls = controlsFor(type);
      if (controls) rec.controls = controls;
      parts.push(rec);
      return rec;
    },
    setValues(comp, values) {
      calls.setValues.push([comp.label, values]);
      comp.values = valuesFor(comp.type, Object.assign({}, comp.values, values));
    },
    setControls(comp, controls) {
      calls.setControls.push([comp.label, controls]);
      comp.controls = Object.assign({}, comp.controls, controls);
    },
    deletePart(comp) {
      calls.deletePart.push(comp.label);
      parts = parts.filter(c => c !== comp);
      wires = wires.filter(w => w.startComp !== comp && w.endComp !== comp);
    },
    clearAll() { parts = []; wires = []; },
    addWire(from, to) {
      wires.push(Object.assign({}, wireEnd(from, 'start'), wireEnd(to, 'end')));
      return true;
    },
    batch(fn) { calls.batch++; steps.push(snap()); return fn(); },
    undo() { assert.ok(steps.length, 'nothing to undo'); restore(steps.pop()); },
    // The board as plain data, for comparing two moments exactly.
    state: () => ({
      parts: parts.map(p => ({ type: p.type, label: p.label, holeRefs: p.holeRefs, values: p.values, controls: p.controls })),
      wires: wires.map(w => [w.startHole ? Ids.holeName(w.startHole) : `${w.startComp.label}.${w.startPinIdx}`,
                             w.endHole ? Ids.holeName(w.endHole) : `${w.endComp.label}.${w.endPinIdx}`]),
    }),
    solve: () => Sim.analyze(parts, wires),
  };
}

// One part's measure() from a solve, e.g. { on: true, current: 14.9 }.
function measured(board, label) {
  const r = board.solve();
  const part = r.parts && r.parts[label];
  assert.ok(part, `analyze().parts has no ${label}; status ${r.status}; parts ${JSON.stringify(Object.keys(r.parts || {}))}`);
  return part.m;
}

const near = (got, want, what) =>
  assert.ok(typeof got === 'number' && Math.abs(got - want) < 0.05, `${what}: expected ${want.toFixed(1)} mA, got ${got}`);

const wire = (from, to, color = 'green') => ({ tool: 'add_wire', from, to, color });

// The button example (parts/button.js): SW1 on b12–b15 closes the return of a
// 470 Ω LED circuit. Released: open. Pressed: 14.9 mA.
const BUTTON_LED = [
  { tool: 'delete_all' },
  { tool: 'place_battery' },
  wire('BAT1.0', `tp_${N}`, 'red'), wire('BAT1.1', `tn_${N}`, 'black'),
  { tool: 'place_resistor', holeA: 'b3', holeB: 'b7' },
  { tool: 'place_led', holeA: 'c9', holeB: 'c7' },
  { tool: 'place_button', holeA: 'b12', holeB: 'b15' },
  wire('tp_4', 'a3', 'red'), wire('a9', 'a12'), wire('a15', 'tn_15', 'black'),
];

// A mixed build: a battery, 2 resistors, 2 LEDs, a button and a buzzer.
//   branch 1 (the ONE_LED recipe): tp_3 → a2, R1 b2–b6, LED1 anode c6 / cathode c8, a8 → tn_8
//   branch 2: tp_12 → a12, SW1 b12–b15, BZ1 c15–c17, R2 d17–d21,
//             LED2 anode e21 / cathode e23, a23 → tn_23
// Labels in placing order: BAT1, R1, R2, LED1, LED2, SW1, BZ1.
const MIXED = [
  { tool: 'delete_all' },
  { tool: 'place_battery' },
  wire('BAT1.0', `tp_${N}`, 'red'), wire('BAT1.1', `tn_${N}`, 'black'),
  { tool: 'place_resistor', holeA: 'b2', holeB: 'b6' },
  { tool: 'place_resistor', holeA: 'd17', holeB: 'd21' },
  { tool: 'place_led', holeA: 'c8', holeB: 'c6' },
  { tool: 'place_led', holeA: 'e23', holeB: 'e21', color: 'green' },
  { tool: 'place_button', holeA: 'b12', holeB: 'b15' },
  { tool: 'place_buzzer', holeA: 'c15', holeB: 'c17' },
  wire('tp_3', 'a2', 'red'), wire('a8', 'tn_8', 'black'),
  wire('tp_12', 'a12', 'red'), wire('a23', 'tn_23', 'black'),
];

test('every registered part is placed through board.placePart: holes for board parts, the battery spot off the board', () => {
  for (const def of Parts.all()) {
    const board = simBoard();
    const tool = (def.ai && def.ai.tool) || 'place_' + def.type;
    let action;
    if (def.place.kind === 'offboard') action = { tool };
    else if (def.place.kind === 'span') action = { tool, holeA: 'b10', holeB: `b${10 + def.place.span.default}` };
    else continue;   // footprint parts arrive later
    const out = Chat.applyActions([action], board);
    assert.deepEqual(out, { applied: 1, failed: 0 }, `${tool}: ${JSON.stringify(board.notes)}`);
    assert.equal(board.calls.placePart.length, 1, `${tool} must call board.placePart once`);
    const [type, where, values] = board.calls.placePart[0];
    assert.equal(type, def.type);
    if (def.place.kind === 'offboard') {
      assert.deepEqual(where, { x: 15.8, z: -3.15 }, `${tool}: an off-board part goes where board.batterySpot() says`);
    } else {
      assert.deepEqual(where, [{ col: 9, row: 'b' }, { col: 9 + def.place.span.default, row: 'b' }], `${tool}: one hole per pin, in order`);
    }
    assert.deepStrictEqual(values, {}, `${tool}: no values named, so an empty values object`);
  }
});

test('a place_ value Parts.checkValue refuses is left out, with its reason in a note; the part is still placed', () => {
  const board = simBoard();
  const out = Chat.applyActions([{ tool: 'place_resistor', holeA: 'b2', holeB: 'b6', resistance: -5 }], board);
  assert.deepEqual(out, { applied: 1, failed: 0 });
  assert.equal(board.calls.placePart.length, 1);
  assert.deepStrictEqual(board.calls.placePart[0][2], {}, 'the refused resistance is not passed on');
  const reason = Parts.checkValue('resistor', 'resistance', -5).reason;
  assert.equal(board.notes.length, 1, `one note, got ${JSON.stringify(board.notes)}`);
  assert.ok(board.notes[0].includes(reason), `the note carries "${reason}": "${board.notes[0]}"`);
});

test('place_ with a part type the registry does not know places nothing, fails, and names the type in a note', () => {
  const board = simBoard();
  const out = Chat.applyActions([{ tool: 'place_flux_capacitor', holeA: 'b2', holeB: 'b6' }], board);
  assert.deepEqual(out, { applied: 0, failed: 1 });
  assert.equal(board.calls.placePart.length, 0, 'nothing placed');
  assert.equal(board.notes.length, 1, `one note, got ${JSON.stringify(board.notes)}`);
  assert.match(board.notes[0], /flux_capacitor/);
});

test('set_value R1 resistance 1000 in a lit series circuit: 14.9 mA becomes 7.0 mA', () => {
  const board = simBoard();
  assert.deepEqual(Chat.acceptBuild(Recipes.ONE_LED, board), { applied: 8, failed: 0 });
  near(measured(board, 'LED1').current, 14.9, 'LED1 with 470 Ω');

  const out = Chat.acceptBuild([{ tool: 'set_value', part: 'R1', resistance: 1000 }], board);
  assert.deepEqual(out, { applied: 1, failed: 0 }, JSON.stringify(board.notes));
  assert.deepEqual(board.calls.setValues, [['R1', { resistance: 1000 }]]);
  assert.equal(Ids.findByLabel(board.components(), 'R1').values.resistance, 1000);
  near(measured(board, 'LED1').current, 7.0, 'LED1 with 1 kΩ');   // (9 V − 2.0 V) / 1000 Ω
  assert.deepEqual(board.notes, []);
});

test('set_value on an LED\'s colour takes the new colour\'s forward voltage: green gives 6.8 mA at 1 kΩ', () => {
  const board = simBoard();
  Chat.acceptBuild(Recipes.ONE_LED, board);
  const out = Chat.acceptBuild([
    { tool: 'set_value', part: 'R1', resistance: 1000 },
    { tool: 'set_value', part: 'LED1', color: 'green' },
  ], board);
  assert.deepEqual(out, { applied: 2, failed: 0 }, JSON.stringify(board.notes));
  assert.equal(Ids.findByLabel(board.components(), 'LED1').values.color, 'green');
  near(measured(board, 'LED1').current, 6.8, 'green LED1 with 1 kΩ');   // (9 − 2.2) / 1000
});

test('set_control SW1 pressed:true closes the button circuit: LED1 goes from off to 14.9 mA', () => {
  const board = simBoard();
  assert.deepEqual(Chat.acceptBuild(BUTTON_LED, board), { applied: 10, failed: 0 });
  assert.equal(measured(board, 'LED1').on, false, 'released: open circuit');

  const out = Chat.acceptBuild([{ tool: 'set_control', part: 'SW1', pressed: true }], board);
  assert.deepEqual(out, { applied: 1, failed: 0 }, JSON.stringify(board.notes));
  assert.deepEqual(board.calls.setControls, [['SW1', { pressed: true }]]);
  const m = measured(board, 'LED1');
  assert.equal(m.on, true, 'pressed: LED1 lights');
  near(m.current, 14.9, 'LED1 through the pressed button');
});

test('delete_part R1, the middle of the series circuit, opens it: LED1 goes dark', () => {
  const board = simBoard();
  Chat.acceptBuild(Recipes.ONE_LED, board);
  assert.equal(measured(board, 'LED1').on, true);

  const out = Chat.acceptBuild([{ tool: 'delete_part', part: 'R1' }], board);
  assert.deepEqual(out, { applied: 1, failed: 0 }, JSON.stringify(board.notes));
  assert.deepEqual(board.calls.deletePart, ['R1']);
  assert.equal(Ids.findByLabel(board.components(), 'R1'), null, 'R1 is gone');
  const m = measured(board, 'LED1');
  assert.equal(m.on, false, 'no resistor, no path: LED1 is off');
  assert.ok(Math.abs(m.current) < 0.01, `expected 0 mA through LED1, got ${m.current}`);
});

test('a mixed build, then set_value R2 and delete_part LED1: two undo steps, and one undo restores the build exactly', () => {
  const board = simBoard();
  const first = Chat.acceptBuild(MIXED, board);
  assert.deepEqual(first, { applied: 14, failed: 0 }, JSON.stringify(board.notes));
  assert.deepEqual(board.components().map(c => c.label), ['BAT1', 'R1', 'R2', 'LED1', 'LED2', 'SW1', 'BZ1']);
  near(measured(board, 'LED1').current, 14.9, 'LED1 after the first build');
  assert.equal(measured(board, 'LED2').on, false, 'LED2 waits on the released button');
  const afterFirst = board.state();

  const second = Chat.acceptBuild([
    { tool: 'set_value',   part: 'R2',   resistance: 1000 },
    { tool: 'delete_part', part: 'LED1' },
  ], board);
  assert.deepEqual(second, { applied: 2, failed: 0 }, JSON.stringify(board.notes));
  assert.equal(board.calls.batch, 2, 'each accepted build is exactly one board.batch');
  assert.equal(Ids.findByLabel(board.components(), 'R2').values.resistance, 1000);
  assert.equal(Ids.findByLabel(board.components(), 'LED1'), null, 'LED1 is gone');
  assert.deepEqual(board.components().map(c => c.label), ['BAT1', 'R1', 'R2', 'LED2', 'SW1', 'BZ1']);
  assert.equal(board.state().wires.length, 6, 'LED1 had no wire on its pins, so every wire stays');

  board.undo();
  assert.deepStrictEqual(board.state(), afterFirst, 'one undo gives back the first build exactly');
  near(measured(board, 'LED1').current, 14.9, 'LED1 after the undo');
});

// ── Refusals ─────────────────────────────────────────────────────────────

function oneLedBoard() {
  const board = simBoard();
  Chat.acceptBuild(Recipes.ONE_LED, board);
  board.notes.length = 0;
  return board;
}

function refused(board, action, before) {
  const out = Chat.applyActions([action], board);
  assert.deepEqual(out, { applied: 0, failed: 1 }, `${JSON.stringify(action)} must be refused`);
  assert.deepStrictEqual(board.state(), before, 'a refused edit changes nothing');
  assert.equal(board.notes.length, 1, `one note, got ${JSON.stringify(board.notes)}`);
  return board.notes[0];
}

test('set_value with a resistance out of range is refused, with checkValue\'s reason word for word', () => {
  const board = oneLedBoard();
  const note = refused(board, { tool: 'set_value', part: 'R1', resistance: 1e9 }, board.state());
  const reason = Parts.checkValue('resistor', 'resistance', 1e9).reason;
  assert.ok(note.includes(reason), `the note carries "${reason}": "${note}"`);
  assert.match(note, /\bR1\b/, 'the note names the part');
  assert.equal(board.calls.setValues.length, 0);
  near(measured(board, 'LED1').current, 14.9, 'LED1 unchanged');
});

test('set_value with a key the part has no value for is refused (a resistor has no colour)', () => {
  const board = oneLedBoard();
  const note = refused(board, { tool: 'set_value', part: 'R1', color: 'green' }, board.state());
  assert.ok(note.includes(Parts.checkValue('resistor', 'color', 'green').reason), note);
  assert.equal(board.calls.setValues.length, 0);
});

test('set_value on a label no part has is refused, naming the label', () => {
  const board = oneLedBoard();
  const note = refused(board, { tool: 'set_value', part: 'R9', resistance: 1000 }, board.state());
  assert.match(note, /\bR9\b/);
  assert.equal(board.calls.setValues.length, 0);
});

test('delete_part on a label no part has is refused, naming the label, and deletes nothing', () => {
  const board = oneLedBoard();
  const note = refused(board, { tool: 'delete_part', part: 'LED7' }, board.state());
  assert.match(note, /\bLED7\b/);
  assert.equal(board.calls.deletePart.length, 0);
});

test('set_control on a label no part has is refused, naming the label', () => {
  const board = oneLedBoard();
  const note = refused(board, { tool: 'set_control', part: 'SW4', pressed: true }, board.state());
  assert.match(note, /\bSW4\b/);
  assert.equal(board.calls.setControls.length, 0);
});

test('set_control with a control the part does not have is refused, naming it', () => {
  const board = simBoard();
  Chat.acceptBuild(BUTTON_LED, board);
  board.notes.length = 0;
  const note = refused(board, { tool: 'set_control', part: 'SW1', closed: true }, board.state());
  assert.match(note, /\bclosed\b/);
  board.notes.length = 0;
  const note2 = refused(board, { tool: 'set_control', part: 'R1', pressed: true }, board.state());
  assert.match(note2, /\bR1\b/);
  assert.equal(board.calls.setControls.length, 0);
});

test('a refused edit fails alone: the rest of the build still applies, in one batch', () => {
  const board = oneLedBoard();
  const out = Chat.acceptBuild([
    { tool: 'set_value', part: 'R9', resistance: 1000 },
    { tool: 'set_value', part: 'R1', resistance: 1000 },
  ], board);
  assert.deepEqual(out, { applied: 1, failed: 1 });
  assert.equal(board.calls.batch, 2, 'the first build and this one: one batch each');
  near(measured(board, 'LED1').current, 7.0, 'R1 still changed');
});

// ── The preview's labels with the edit actions ─────────────────────────────

test('predicted labels: edits place nothing, and a deleted part frees its number', () => {
  const board = [{ type: 'resistor', label: 'R1' }, { type: 'resistor', label: 'R2' }, { type: 'button', label: 'SW1' }];
  const actions = [
    { tool: 'set_value',   part: 'R1', resistance: 1000 },
    { tool: 'set_control', part: 'SW1', pressed: true },
    { tool: 'delete_part', part: 'R2' },
    { tool: 'place_resistor', holeA: 'b20', holeB: 'b24' },
  ];
  assert.deepEqual(Chat.predictLabels(actions, board), [null, null, null, 'R2']);
});

// ── No per-type tables left ─────────────────────────────────────────────────

test('chat.js exports no per-type tables: PLACE and VALUE_KEY are gone', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../circuit3d/js/chat.js'), 'utf8');
  assert.doesNotMatch(src, /\bPLACE\b/, 'chat.js still has PLACE');
  assert.doesNotMatch(src, /\bVALUE_KEY\b/, 'chat.js still has VALUE_KEY');
  assert.doesNotMatch(src, /\bplace(Resistor|LED|Buzzer|Button|Battery)\b/, 'chat.js still has per-type adapter methods');
  assert.doesNotMatch(src, /['"`]place_(battery|buzzer|button|led|resistor)['"`]/, 'chat.js still lists place_<type> tools by name (the preview too)');
});

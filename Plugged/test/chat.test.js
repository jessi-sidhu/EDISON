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
    placeResistor: () => {}, placeLED: () => {}, placeBuzzer: () => {}, placeButton: () => {},
    placeBattery: () => {}, clearAll: () => {},
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
    placeBattery: () => log.push('battery'),
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
    placeBattery:  () => { parts.push({ type: 'battery' }); calls.push('battery'); },
    placeResistor: (a, b) => { parts.push({ type: 'resistor' }); calls.push(`resistor ${a.row}${a.col + 1}-${b.row}${b.col + 1}`); },
    placeLED:      (a, b) => { parts.push({ type: 'led' }); calls.push(`led ${a.row}${a.col + 1}-${b.row}${b.col + 1}`); },
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

// A board whose place* calls label parts the way App.place* does.
function labellingBoard(parts) {
  const add = type => parts.push({ type, label: Ids.nextLabel(parts, type) });
  return Object.assign(fakeBoard(parts), {
    clearAll:      () => { parts.length = 0; },
    placeBattery:  () => add('battery'),
    placeResistor: () => add('resistor'),
    placeLED:      () => add('led'),
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

// A board that records the values object each place* call receives: the
// third argument for parts on the breadboard and for the battery alike.
function valuesBoard() {
  const got = [];
  const board = Object.assign(fakeBoard([]), {
    placeResistor: (a, b, v) => got.push(['resistor', v]),
    placeLED:      (a, b, v) => got.push(['led', v]),
    placeBuzzer:   (a, b, v) => got.push(['buzzer', v]),
    placeButton:   (a, b, v) => got.push(['button', v]),
    placeBattery:  (x, z, v) => got.push(['battery', v]),
  });
  board.got = got;
  return board;
}

test('place_resistor with resistance:1000 calls placeResistor with { resistance: 1000 }', () => {
  const board = valuesBoard();
  const out = Chat.applyActions([{ tool: 'place_resistor', holeA: 'a2', holeB: 'a6', resistance: 1000 }], board);
  assert.deepEqual(out, { applied: 1, failed: 0 });
  assert.deepStrictEqual(board.got, [['resistor', { resistance: 1000 }]]);
});

test('place_led with color:"green" calls placeLED with { color: "green" }', () => {
  const board = valuesBoard();
  Chat.applyActions([{ tool: 'place_led', holeA: 'a8', holeB: 'a6', color: 'green' }], board);
  assert.deepStrictEqual(board.got, [['led', { color: 'green' }]]);
});

test('place_battery with voltage:5 calls placeBattery with { voltage: 5 } as its third argument', () => {
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

// A board that records where placeBattery was asked to put the battery.
function spotBoard(spot) {
  const got = [];
  const board = Object.assign(fakeBoard([]), {
    batterySpot:  () => spot,
    placeBattery: (x, z) => got.push({ x, z }),
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
    placeResistor: (a, b, v) => placed.push(['resistor', a, b, v]),
    placeBattery:  () => placed.push(['battery']),
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
  assert.equal(board.placed.length, 0, 'placeResistor was not called');
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
  assert.equal(board.placed.length, 0, 'placeResistor was not called');
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

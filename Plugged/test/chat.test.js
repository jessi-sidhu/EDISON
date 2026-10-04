// Tests for chat.js: turning the AI's actions into board changes.

const assert = require('node:assert');
const Chat = require('../circuit3d/js/chat.js');

// Stands in for the 3D board. Records wires instead of drawing them.
function fakeBoard(parts) {
  const wires = [];
  return {
    wires,
    components: () => parts,
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

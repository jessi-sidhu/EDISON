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

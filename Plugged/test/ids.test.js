// Tests for ids.js: the component names shared by the board export, saved
// files, the AI and the code that applies AI actions.

const assert = require('node:assert');
const Ids = require('../circuit3d/js/ids.js');

const parts = [{ type: 'resistor' }, { type: 'led' }, { type: 'battery' }, { type: 'led' }];

test('componentId counts within the part type', () => {
  assert.equal(Ids.componentId(parts, parts[2]), 'battery_0');
  assert.equal(Ids.componentId(parts, parts[3]), 'led_1');
});

test('a pin reference resolves to the nth part of its type', () => {
  assert.deepEqual(Ids.parsePinRef('battery_0_pin1'), { type: 'battery', n: 0, pin: 1 });
  assert.equal(Ids.parsePinRef('a12'), null);
  assert.equal(Ids.findComponent(parts, 'battery', 0), parts[2]);
  assert.equal(Ids.findComponent(parts, 'battery', 1), null);
});

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

test('a pin reference accepts a part type with an underscore in it', () => {
  assert.deepEqual(Ids.parsePinRef('op_amp_0_pin2'), { type: 'op_amp', n: 0, pin: 2 });
});

test('power_supply_1_pin0 parses as the second power supply, pin 0', () => {
  assert.deepEqual(Ids.parsePinRef('power_supply_1_pin0'), { type: 'power_supply', n: 1, pin: 0 });
});

test('a label-form reference keeps a named pin as a string', () => {
  assert.deepEqual(Ids.parsePinRef('U1.OUT'), { label: 'U1', pin: 'OUT' });
});

test('a label-form reference turns an all-digit pin into a number', () => {
  assert.deepStrictEqual(Ids.parsePinRef('R2.1'), { label: 'R2', pin: 1 });
});

test('hole addresses and plain words are not pin references', () => {
  for (const s of ['a12', 'j63', 'tp_5', 'bn_12', 'hello']) {
    assert.equal(Ids.parsePinRef(s), null, s);
  }
});

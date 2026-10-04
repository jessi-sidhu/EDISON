// Parts.isFlippable(def), issue #64: a student can place an LED facing either
// way by hand (F in place mode swaps its two holes). isFlippable says which
// parts F applies to: a 2-pin span part whose pins include both 'anode' and
// 'cathode'. Today that is only the LED; it is decided from the definition,
// never from a type name.
//
// Loaded the way the other part tests load the registry: require the parts
// index, which defines every part file.

const assert = require('node:assert');

const Parts = require('../circuit3d/js/parts');

function isFlippable() {
  assert.equal(typeof Parts.isFlippable, 'function', 'parts/registry.js must export Parts.isFlippable(def)');
  return Parts.isFlippable;
}

function def(type) {
  const d = Parts.get(type);
  assert.ok(d, `Parts.get('${type}') should be defined`);
  return d;
}

describe('Parts.isFlippable', () => {
  test('the LED is flippable', () => {
    expect(isFlippable()(def('led'))).toBe(true);
  });

  test.each(['resistor', 'buzzer', 'button', 'battery', 'potentiometer', 'ldr', 'thermistor'])(
    '%s is not flippable', type => {
      expect(isFlippable()(def(type))).toBe(false);
    });

  test('a missing definition is not flippable', () => {
    const f = isFlippable();
    expect(f(null)).toBe(false);
    expect(f(undefined)).toBe(false);
  });

  test('decided by pins and placement, not by type: an anode/cathode span part of another type is flippable', () => {
    const f = isFlippable();
    const led = def('led');
    const diode = Object.assign({}, led, { type: 'test_diode' });
    expect(f(diode)).toBe(true);
    // The same pins on a part that is not a 2-lead span part: not flippable.
    const offboard = Object.assign({}, led, { type: 'test_diode_box', place: { kind: 'offboard' } });
    expect(f(offboard)).toBe(false);
    // A span part with anode but no cathode: not flippable.
    const half = Object.assign({}, led, { type: 'test_half', pins: ['anode', 'lead2'] });
    expect(f(half)).toBe(false);
  });
});

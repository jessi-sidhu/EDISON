// Test-only part, never loaded by the app: a valid 3-pin `footprint` part per
// docs/API-CONTRACT.md → "Part file contract". Used by
// test/parts-registry.test.js.
//
// Exports a factory rather than calling Parts.define() (see test_span.js).
// Its three legs sit in a line on one row: pin 0 at the anchor, then one and
// two columns to the right.

module.exports = function testThree() {
  return {
    type:     'test_three',
    name:     'Test three',
    sub:      '3 pins · test only',
    category: 'Semiconductors',
    icon:     '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>',
    prefix:   'TT',
    pins:     ['in', 'gnd', 'out'],
    place:    { kind: 'footprint', legs: [[0, 0], [1, 0], [2, 0]], rotations: [0, 90, 180, 270] },
    values:   { gain: { unit: '%', default: 50, min: 0, max: 100 } },
    controls: { level: { type: 'slider', default: 50, min: 0, max: 100, step: 1, unit: '%', saved: true } },
    gestures: { scroll: 'level' },
    elements: () => [
      { kind: 'R', id: 'top', pins: ['in', '#m'],  ohms: 1000 },
      { kind: 'R', id: 'bot', pins: ['#m', 'gnd'], ohms: 1000 },
      { kind: 'R', id: 'out', pins: ['#m', 'out'], ohms: 1000 },
    ],
    measure: r => ({ current: (r && r.current && r.current.out) || 0 }),
    report:  (r, m) => 'out ' + ((m && m.current) || 0) + ' mA',
    ai: { about: 'A test-only three-pin part.', keywords: ['three'] },
    view: { build: () => ({ group: null, pinPositions: [] }) },
    examples: [{
      name:  'test three divides 9 V in half',
      parts: [{ type: 'battery',    label: 'BAT1' },
              { type: 'test_three', label: 'TT1', holes: ['a10', 'a11', 'a12'] }],
      wires: [['BAT1.0', 'tp_2'], ['BAT1.1', 'tn_2'], ['tp_10', 'b10'], ['b11', 'tn_11']],
      expect: { TT1: { current: 0 } },   // nothing is wired to `out`
    }],
  };
};

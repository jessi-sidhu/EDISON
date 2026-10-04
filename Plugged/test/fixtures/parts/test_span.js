// Test-only part, never loaded by the app: a valid 2-lead `span` part per
// docs/API-CONTRACT.md → "Part file contract". Used by
// test/parts-registry.test.js.
//
// Unlike a real part file it does not call Parts.define() itself. It exports
// a factory, so every test gets a fresh definition it can register, or break
// one rule of, after Parts.reset().
//
// measure / warnings / report accept any sample PartResult (or none), because
// define() may call them once to check their output lengths.

module.exports = function testSpan() {
  return {
    type:     'test_span',
    name:     'Test span',
    sub:      '2 leads · test only',
    category: 'Passives',
    icon:     '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 12h20"/></svg>',
    prefix:   'TS',
    pins:     ['a', 'b'],
    place:    { kind: 'span', span: { min: 3, max: 5, default: 4 }, rotations: ['h', 'v'] },
    values: {
      resistance: { unit: 'Ω', default: 1000, min: 1, max: 10e6, series: 'E12' },
      color:      { choices: { red: {}, yellow: {}, green: {}, blue: {}, white: {} }, default: 'red' },
    },
    controls: { closed: { type: 'toggle', default: true, saved: true } },
    gestures: { click: 'closed' },
    elements: (values, controls) => [
      { kind: 'R',  id: 'r',  pins: ['a', '#mid'], ohms: values.resistance },
      { kind: 'SW', id: 'sw', pins: ['#mid', 'b'], closed: controls.closed },
    ],
    measure:  r => ({ current: (r && r.current && r.current.r) || 0 }),
    warnings: () => [],
    report:   (r, m) => ((m && m.current) || 0) + ' mA',
    ai: {
      about:    'A test-only two-lead part.',
      keywords: ['test', 'span'],
      guide:    'Place both leads on one row, 3 to 5 columns apart.',
    },
    view: { build: () => ({ group: null, pinPositions: [] }) },
    examples: [{
      name:  'test span across 9 V carries about 9 mA',
      parts: [{ type: 'battery',   label: 'BAT1' },
              { type: 'test_span', label: 'TS1', holes: ['a3', 'a7'] }],
      wires: [['BAT1.0', 'tp_2'], ['BAT1.1', 'tn_9'], ['tp_3', 'b3'], ['b7', 'tn_7']],
      expect: { TS1: { current: [8.5, 9.5] } },
    }],
  };
};

// Test-only part, never loaded by the app: a stand-in capacitor with one C
// element (id 'c', pins a → b), until the real capacitor part (#104) lands.
// Used by test/time-run.test.js and e2e/time-run.spec.js (issue #103).
//
// Like test_span.js it does not call Parts.define() itself. It exports a
// factory; the caller registers it. In the page, e2e/time-run.spec.js runs
// this file's text through new Function('module', 'exports', code), then
// swaps in a simple browser view.build before Parts.define (the pattern
// e2e/footprint.spec.js uses).
//
// ai: false, so it never reaches the AI's tools or the prompt goldens.

module.exports = function testCapacitor() {
  return {
    type:     'test_capacitor',
    name:     'Test capacitor',
    sub:      '2 leads · test only',
    category: 'Passives',
    icon:     '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 12h8M14 12h8M10 5v14M14 5v14"/></svg>',
    prefix:   'CT',
    pins:     ['a', 'b'],
    place:    { kind: 'span', span: { min: 2, max: 5, default: 3 }, rotations: ['h', 'v'] },
    values:   { farads: { unit: 'F', default: 1e-3, min: 1e-12, max: 10 } },
    elements: v => [{ kind: 'C', id: 'c', pins: ['a', 'b'], farads: v.farads }],
    measure:  r => ({ current: (r && r.current && r.current.c) || 0 }),
    report:   (r, m) => `capacitor, ${((m && m.current) || 0).toFixed(1)} mA`,
    ai:       false,
    view:     { build: () => ({ group: null, pinPositions: [] }) },
    examples: [{
      name:  'test capacitor on 9 V through 1 kΩ',
      parts: [{ type: 'battery', label: 'BAT1' },
              { type: 'resistor', label: 'R1', holes: ['a2', 'a6'], values: { resistance: 1000 } },
              { type: 'test_capacitor', label: 'CT1', holes: ['a6', 'a9'] }],
      wires: [['BAT1.0', 'tp_2'], ['BAT1.1', 'tn_9'], ['tp_2', 'b2'], ['b9', 'tn_9']],
      expect: { CT1: { current: [-0.1, 0.1] } },
    }],
  };
};

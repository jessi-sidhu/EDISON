// Test-only part, never loaded by the app: a stand-in sine source with one
// V element (id 'v', plus → minus) carrying a `wave`, until the function
// generator part (#120) lands. Used by test/sine-source.test.js and
// e2e/sine-run.spec.js (issue #119).
//
// Like test_capacitor.js it does not call Parts.define() itself. It exports a
// factory; the caller registers it. In the page, e2e/sine-run.spec.js runs
// this file's text through new Function('module', 'exports', code), then
// swaps in a simple browser view.build before Parts.define (the pattern
// e2e/time-run.spec.js uses).
//
// The wave is { kind: 'sine', amp, freq, offset } (docs/API-CONTRACT.md, the
// V row's `wave?`). amp and offset are values (V); the registry has no Hz
// unit, so the frequency is fixed at FREQ.
//
// `volts` is 0 on purpose: the registry needs a number there, and the V row
// says a wave source reads its `offset` in a plain solve and
// offset + amp·sin(2π·freq·t) in a time step, whatever `volts` says. So a
// solver that ignores `wave` reads 0 V here, never the expected value.
//
// minus is the ref pin (ground), as current_source's `from` is.
// ai: false, so it never reaches the AI's tools or the prompt goldens.

const FREQ = 1;   // Hz

module.exports = function testWaveSource() {
  return {
    type:     'test_wave_source',
    name:     'Test sine source',
    sub:      '2 leads · test only',
    category: 'Sources',
    icon:     '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M7 12c1.5-4 3.5-4 5 0s3.5 4 5 0"/></svg>',
    prefix:   'TW',
    pins:     ['plus', 'minus'],
    ref:      'minus',
    place:    { kind: 'span', span: { min: 2, max: 5, default: 3 }, rotations: ['h', 'v'] },
    values:   {
      amp:    { unit: 'V', default: 5, min: 0, max: 10 },
      offset: { unit: 'V', default: 0, min: -10, max: 10 },
    },
    elements: v => [{ kind: 'V', id: 'v', pins: ['plus', 'minus'], volts: 0,
                      wave: { kind: 'sine', amp: v.amp, freq: FREQ, offset: v.offset } }],
    measure:  r => {
      const { plus, minus } = (r && r.pins) || {};
      return { voltage: plus == null || minus == null ? 0 : plus - minus };
    },
    report:   (r, m) => `sine source, ${((m && m.voltage) || 0).toFixed(2)} V`,
    ai:       false,
    view:     { build: () => ({ group: null, pinPositions: [] }) },
    examples: [{
      name:  'test sine source, offset 2 V, into 1 kΩ: 2 V in a plain solve',
      parts: [{ type: 'test_wave_source', label: 'TW1', holes: ['a2', 'a5'], values: { amp: 3, offset: 2 } },
              { type: 'resistor', label: 'R1', holes: ['b2', 'b5'], values: { resistance: 1000 } }],
      wires: [],
      expect: { TW1: { voltage: [1.99, 2.01] } },
    }],
  };
};

module.exports.FREQ = FREQ;
